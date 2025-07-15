import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';
import Stripe from 'stripe';
import { Timestamp } from 'firebase-admin/firestore';

import config, { stripe, getEventChannel } from './config';
import * as logs from './logs';

import {
  createCustomerRecord,
  createProductRecord,
  manageSubscriptionStatusChange,
  insertPriceRecord,
  deleteProductOrPrice,
  insertTaxRateRecord,
  insertInvoiceRecord,
  insertPaymentRecord,
} from './utils';

import { handleCheckoutSessionCreation } from './handlers/checkout-session-creation';

/* ────────────────────────────────────────────────────────────
   Export reusable HTTP / callable handlers FIRST
   (so other modules can import them without circular deps)
   ──────────────────────────────────────────────────────────── */
export * from './handlers/athleteOnboard';

/* ──────────────────────────────────────────────────────────── */
admin.initializeApp();
const eventChannel = getEventChannel();

/* ── Auth trigger: create Stripe customer (and Connect account) */
export const createCustomer = functions.auth
  .user()
  .onCreate(async (user): Promise<void> => {
    if (!config.syncUsersOnCreate) return;
    const { email, uid, phoneNumber } = user;
    await createCustomerRecord({ email, uid, phone: phoneNumber });
  });

/* ── Firestore trigger: create Checkout Session / PaymentIntent */
export const createCheckoutSession = functions
  .runWith({ minInstances: config.minCheckoutInstances })
  .firestore.document(
    `/${config.customersCollectionPath}/{uid}/checkout_sessions/{id}`,
  )
  .onCreate(handleCheckoutSessionCreation);

/* ── Callable: create Stripe Customer Portal link */
export const createPortalLink = functions.https.onCall(
  async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'The function must be called while authenticated',
      );
    }

    const {
      returnUrl: return_url,
      locale = 'auto',
      configuration,
      flow_data,
    } = data;

    let customerRecord: any = (
      await admin
        .firestore()
        .collection(config.customersCollectionPath)
        .doc(uid)
        .get()
    ).data();

    if (!customerRecord?.stripeId) {
      const { email, phoneNumber } = await admin.auth().getUser(uid);
      customerRecord = await createCustomerRecord({
        uid,
        email,
        phone: phoneNumber,
      });
      if (!customerRecord) {
        throw new functions.https.HttpsError(
          'internal',
          'Failed to create customer record',
        );
      }
    }

    const params: Stripe.BillingPortal.SessionCreateParams = {
      customer: customerRecord!.stripeId,
      return_url,
      locale,
      ...(configuration && { configuration }),
      ...(flow_data && { /* @ts-ignore */ flow_data }),
    };

    const session = await stripe.billingPortal.sessions.create(params);
    logs.createdBillingPortalLink(uid);
    return session;
  },
);

/* ── HTTPS webhook endpoint for Stripe events */
export const handleWebhookEvents = functions.https.onRequest(
  async (req, res) => {
    const relevantEvents = new Set([
      'product.created',
      'product.updated',
      'product.deleted',
      'price.created',
      'price.updated',
      'price.deleted',
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'checkout.session.async_payment_failed',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'tax_rate.created',
      'tax_rate.updated',
      'invoice.paid',
      'invoice.payment_succeeded',
      'invoice.payment_failed',
      'invoice.upcoming',
      'invoice.marked_uncollectible',
      'invoice.payment_action_required',
      'payment_intent.processing',
      'payment_intent.succeeded',
      'payment_intent.canceled',
      'payment_intent.payment_failed',
    ]);

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        req.headers['stripe-signature'] as string,
        config.stripeWebhookSecret!,
      );
    } catch (err) {
      logs.badWebhookSecret(err);
      res.status(401).send('Webhook Error: Invalid secret');
      return;
    }

    if (!relevantEvents.has(event.type)) {
      res.json({ received: true });
      return;
    }

    try {
      switch (event.type) {
        case 'product.created':
        case 'product.updated':
          await createProductRecord(event.data.object as Stripe.Product);
          break;
        case 'price.created':
        case 'price.updated':
          await insertPriceRecord(event.data.object as Stripe.Price);
          break;
        case 'product.deleted':
          await deleteProductOrPrice(event.data.object as Stripe.Product);
          break;
        case 'price.deleted':
          await deleteProductOrPrice(event.data.object as Stripe.Price);
          break;
        case 'tax_rate.created':
        case 'tax_rate.updated':
          await insertTaxRateRecord(event.data.object as Stripe.TaxRate);
          break;
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const sub = event.data.object as Stripe.Subscription;
          await manageSubscriptionStatusChange(
            sub.id,
            sub.customer as string,
            event.type === 'customer.subscription.created',
          );
          break;
        }
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded':
        case 'checkout.session.async_payment_failed': {
          const cs = event.data.object as Stripe.Checkout.Session;
          if (cs.mode === 'subscription') {
            await manageSubscriptionStatusChange(
              cs.subscription as string,
              cs.customer as string,
              true,
            );
          } else {
            const pi = await stripe.paymentIntents.retrieve(
              cs.payment_intent as string,
            );
            await insertPaymentRecord(pi, cs);
          }
          break;
        }
        case 'invoice.paid':
        case 'invoice.payment_succeeded':
        case 'invoice.payment_failed':
        case 'invoice.upcoming':
        case 'invoice.marked_uncollectible':
        case 'invoice.payment_action_required':
          await insertInvoiceRecord(event.data.object as Stripe.Invoice);
          break;
        case 'payment_intent.processing':
        case 'payment_intent.succeeded':
        case 'payment_intent.canceled':
        case 'payment_intent.payment_failed':
          await insertPaymentRecord(event.data.object as Stripe.PaymentIntent);
          break;
      }

      if (eventChannel) {
        await eventChannel.publish({
          type: `com.stripe.v1.${event.type}`,
          data: event.data.object,
        });
      }

      logs.webhookHandlerSucceeded(event.id, event.type);
      res.json({ received: true });
    } catch (err) {
      logs.webhookHandlerError(err, event.id, event.type);
      res.json({ error: 'Webhook handler failed. See logs.' });
    }
  },
);

/* ── Cleanup: delete Stripe customer if user or customer doc is deleted */
const deleteStripeCustomer = async (uid: string, stripeId: string) => {
  try {
    await stripe.customers.del(stripeId);
    logs.customerDeleted(stripeId);

    const update = { status: 'canceled', ended_at: Timestamp.now() };
    const subsSnap = await admin
      .firestore()
      .collection(config.customersCollectionPath)
      .doc(uid)
      .collection('subscriptions')
      .where('status', 'in', ['trialing', 'active'])
      .get();
    subsSnap.forEach((doc) => doc.ref.set(update, { merge: true }));
  } catch (err) {
    logs.customerDeletionError(err, uid);
  }
};

export const onUserDeleted = functions.auth.user().onDelete(async (user) => {
  if (!config.autoDeleteUsers) return;
  const snap = await admin
    .firestore()
    .collection(config.customersCollectionPath)
    .doc(user.uid)
    .get();
  const { stripeId } = snap.data() || {};
  if (stripeId) await deleteStripeCustomer(user.uid, stripeId);
});

export const onCustomerDataDeleted = functions.firestore
  .document(`/${config.customersCollectionPath}/{uid}`)
  .onDelete(async (snap, ctx) => {
    if (!config.autoDeleteUsers) return;
    const { stripeId } = snap.data();
    if (stripeId) await deleteStripeCustomer(ctx.params.uid, stripeId);
  });
