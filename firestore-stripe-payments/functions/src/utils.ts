import * as admin from 'firebase-admin';
import { CustomerData, Product, Subscription, Price, TaxRate } from './interfaces';
import * as logs from './logs';
import config from './config';
import { stripe } from './config';
import Stripe from 'stripe';
import { Timestamp } from 'firebase-admin/firestore';

export const prefixMetadata = (metadata: Record<string, any>) =>
  Object.keys(metadata).reduce((prefixedMetadata: Record<string, any>, key) => {
    prefixedMetadata[`stripe_metadata_${key}`] = (metadata as any)[key];
    return prefixedMetadata;
  }, {});

export const createProductRecord = async (product: Stripe.Product): Promise<void> => {
  const { firebaseRole, ...rawMetadata } = product.metadata;
  const productData: Product = {
    active: product.active,
    name: product.name,
    description: product.description,
    role: firebaseRole ?? null,
    images: product.images,
    metadata: product.metadata,
    tax_code: product.tax_code ?? null,
    ...prefixMetadata(rawMetadata),
  };
  await admin.firestore().collection(config.productsCollectionPath).doc(product.id).set(productData, { merge: true });
  logs.firestoreDocCreated(config.productsCollectionPath, product.id);
};

export const createCustomerAndAccountRecord = async ({
  uid,
  email,
  phone,
}: {
  uid: string;
  email?: string;
  phone?: string;
}) => {
  const athleteRef = admin.firestore().collection('athletes').doc(uid);
  const athleteSnap = await athleteRef.get();
  if (!athleteSnap.exists) {
    throw new Error(`athletes/${uid} document is missing – cannot create account.`);
  }
  const { stripeAccountId } = athleteSnap.data() ?? {};
  if (stripeAccountId) {
    logs.customerExists(uid, stripeAccountId);
    return { stripeAccountId, reused: true };
  }
  logs.creatingConnectedAccount(uid);
  const account = await stripe.accounts.create({
    type: 'standard',
    email,
    business_type: 'individual',
    capabilities: { transfers: { requested: true } },
    metadata: { firebaseUID: uid },
  });
  const customerData: CustomerData = { metadata: { firebaseUID: uid, stripeAccountId: account.id } };
  if (email) customerData.email = email;
  if (phone) customerData.phone = phone;
  const customer = await stripe.customers.create(customerData);
  await athleteRef.set({ stripeAccountId: account.id }, { merge: true });
  await admin
    .firestore()
    .collection(config.customersCollectionPath)
    .doc(uid)
    .set(
      {
        email: customer.email,
        stripeId: customer.id,
        stripeAccountId: account.id,
        stripeLink: `https://dashboard.stripe.com${account.livemode ? '' : '/test'}/connect/accounts/${account.id}`,
      },
      { merge: true },
    );
  logs.customerAndAccountCreated(uid, account.id, customer.id);
  return { stripeAccountId: account.id, reused: false };
};

const copyBillingDetailsToCustomer = async (payment_method: Stripe.PaymentMethod): Promise<void> => {
  const customer = payment_method.customer as string;
  const { name, phone, address } = payment_method.billing_details;
  await stripe.customers.update(customer, { name, phone, address });
};

export const manageSubscriptionStatusChange = async (
  subscriptionId: string,
  customerId: string,
  createAction: boolean,
): Promise<void> => {
  const customersSnap = await admin.firestore().collection(config.customersCollectionPath).where('stripeId', '==', customerId).get();
  if (customersSnap.size !== 1) throw new Error('User not found!');
  const uid = customersSnap.docs[0].id;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['default_payment_method', 'items.data.price.product'] });
  const price: Stripe.Price = subscription.items.data[0].price;
  const prices: FirebaseFirestore.DocumentReference[] = [];
  for (const item of subscription.items.data) {
    prices.push(
      admin
        .firestore()
        .collection(config.productsCollectionPath)
        .doc((item.price.product as Stripe.Product).id)
        .collection('prices')
        .doc(item.price.id),
    );
  }
  const product: Stripe.Product = price.product as Stripe.Product;
  const role = product.metadata.firebaseRole ?? null;
  const subsDbRef = customersSnap.docs[0].ref.collection('subscriptions').doc(subscription.id);
  const subscriptionData: Subscription = {
    metadata: subscription.metadata,
    role,
    status: subscription.status as Subscription['status'],
    stripeLink: `https://dashboard.stripe.com${subscription.livemode ? '' : '/test'}/subscriptions/${subscription.id}`,
    product: admin.firestore().collection(config.productsCollectionPath).doc(product.id),
    price: admin.firestore().collection(config.productsCollectionPath).doc(product.id).collection('prices').doc(price.id),
    prices,
    quantity: (subscription.items.data[0] as any).quantity ?? null,
    items: subscription.items.data,
    cancel_at_period_end: subscription.cancel_at_period_end,
    cancel_at: subscription.cancel_at ? Timestamp.fromMillis(subscription.cancel_at * 1000) : null,
    canceled_at: subscription.canceled_at ? Timestamp.fromMillis(subscription.canceled_at * 1000) : null,
    current_period_start: Timestamp.fromMillis(subscription.current_period_start * 1000),
    current_period_end: Timestamp.fromMillis(subscription.current_period_end * 1000),
    created: Timestamp.fromMillis(subscription.created * 1000),
    ended_at: subscription.ended_at ? Timestamp.fromMillis(subscription.ended_at * 1000) : null,
    trial_start: subscription.trial_start ? Timestamp.fromMillis(subscription.trial_start * 1000) : null,
    trial_end: subscription.trial_end ? Timestamp.fromMillis(subscription.trial_end * 1000) : null,
  };
  await subsDbRef.set(subscriptionData);
  logs.firestoreDocCreated('subscriptions', subscription.id);
  if (role) {
    try {
      const { customClaims } = await admin.auth().getUser(uid);
      if (['trialing', 'active'].includes(subscription.status)) {
        logs.userCustomClaimSet(uid, 'stripeRole', role);
        await admin.auth().setCustomUserClaims(uid, { ...customClaims, stripeRole: role });
      } else {
        logs.userCustomClaimSet(uid, 'stripeRole', 'null');
        await admin.auth().setCustomUserClaims(uid, { ...customClaims, stripeRole: null });
      }
    } catch {
      return;
    }
  }
  if (createAction && subscription.default_payment_method) {
    await copyBillingDetailsToCustomer(subscription.default_payment_method as Stripe.PaymentMethod);
  }
};

export const insertPriceRecord = async (price: Stripe.Price): Promise<void> => {
  if (price.billing_scheme === 'tiered') price = await stripe.prices.retrieve(price.id, { expand: ['tiers'] });
  const priceData: Price = {
    active: price.active,
    billing_scheme: price.billing_scheme,
    tiers_mode: price.tiers_mode,
    tiers: (price as any).tiers ?? null,
    currency: price.currency,
    description: price.nickname,
    type: price.type,
    unit_amount: (price as any).unit_amount,
    recurring: price.recurring,
    interval: price.recurring?.interval ?? null,
    interval_count: price.recurring?.interval_count ?? null,
    trial_period_days: price.recurring?.trial_period_days ?? null,
    transform_quantity: price.transform_quantity,
    tax_behavior: price.tax_behavior ?? null,
    metadata: price.metadata,
    product: price.product,
    ...prefixMetadata(price.metadata),
  };
  const dbRef = admin.firestore().collection(config.productsCollectionPath).doc(price.product as string).collection('prices');
  await dbRef.doc(price.id).set(priceData, { merge: true });
  logs.firestoreDocCreated('prices', price.id);
};

export const insertTaxRateRecord = async (taxRate: Stripe.TaxRate): Promise<void> => {
  const taxRateData: TaxRate = { ...(taxRate as any), ...prefixMetadata((taxRate as any).metadata) };
  delete (taxRateData as any).metadata;
  await admin.firestore().collection(config.productsCollectionPath).doc('tax_rates').collection('tax_rates').doc(taxRate.id).set(taxRateData);
  logs.firestoreDocCreated('tax_rates', taxRate.id);
};

export const insertInvoiceRecord = async (invoice: Stripe.Invoice) => {
  const customersSnap = await admin.firestore().collection(config.customersCollectionPath).where('stripeId', '==', invoice.customer).get();
  if (customersSnap.size !== 1) throw new Error('User not found!');
  await customersSnap.docs[0].ref
    .collection('subscriptions')
    .doc(invoice.subscription as string)
    .collection('invoices')
    .doc(invoice.id)
    .set(invoice as any);
  const prices: FirebaseFirestore.DocumentReference[] = [];
  for (const item of invoice.lines.data) {
    prices.push(
      admin
        .firestore()
        .collection(config.productsCollectionPath)
        .doc((item.price?.product as string) || '')
        .collection('prices')
        .doc(item.price?.id || ''),
    );
  }
  const recordId: string = (invoice.payment_intent as string) ?? invoice.id;
  await customersSnap.docs[0].ref.collection('payments').doc(recordId).set({ prices }, { merge: true });
  logs.firestoreDocCreated('invoices', invoice.id);
};

export const insertPaymentRecord = async (payment: Stripe.PaymentIntent, checkoutSession?: Stripe.Checkout.Session) => {
  const customersSnap = await admin.firestore().collection(config.customersCollectionPath).where('stripeId', '==', payment.customer).get();
  if (customersSnap.size !== 1) throw new Error('User not found!');
  if (checkoutSession) {
    const lineItems = await stripe.checkout.sessions.listLineItems(checkoutSession.id);
    const prices: FirebaseFirestore.DocumentReference[] = [];
    for (const item of lineItems.data) {
      prices.push(
        admin
          .firestore()
          .collection(config.productsCollectionPath)
          .doc((item.price?.product as string) || '')
          .collection('prices')
          .doc(item.price?.id || ''),
      );
    }
    (payment as any).prices = prices;
    (payment as any).items = lineItems.data;
  }
  await customersSnap.docs[0].ref.collection('payments').doc(payment.id).set(payment as any, { merge: true });
  logs.firestoreDocCreated('payments', payment.id);
};

export const deleteProductOrPrice = async (pr: Stripe.Product | Stripe.Price) => {
  if (pr.object === 'product') {
    await admin.firestore().collection(config.productsCollectionPath).doc(pr.id).delete();
    logs.firestoreDocDeleted(config.productsCollectionPath, pr.id);
  }
  if (pr.object === 'price') {
    await admin
      .firestore()
      .collection(config.productsCollectionPath)
      .doc((pr as Stripe.Price).product as string)
      .collection('prices')
      .doc(pr.id)
      .delete();
    logs.firestoreDocDeleted('prices', pr.id);
  }
};
