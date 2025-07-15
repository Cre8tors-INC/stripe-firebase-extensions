/*
 * Stripe × Firebase “Athlete Donations” – shared TypeScript models.
 * --------------------------------------------------------------------
 *  • Uses the athletes collection as the single source-of-truth.
 *  • Stores one Connect account per athlete (fan → athlete donations).
 *  • No “token” or credits logic – pure currency flows.
 */

import Stripe from 'stripe';
import { Timestamp, DocumentReference } from 'firebase-admin/firestore';

/* ──────────────────────────────────────────────────────────────────
 *  Athletes (top-level Firestore collection: athletes/{uid})
 * ----------------------------------------------------------------*/

export interface AthleteDoc {
  /** Firebase Auth UID for the athlete (also the doc ID). */
  uid: string;

  /** Stripe Connect account ID (looks like acct_123…). */
  connectAccountId: string | null;

  /** Whether Stripe has approved the account for charging fans. */
  chargesEnabled: boolean;

  /** Whether automatic payouts to the athlete are enabled. */
  payoutsEnabled: boolean;

  /** ISO 2-letter country code – we’re US-only for phase 1. */
  country: 'US';

  /** Timestamp the Connect account was first created. */
  createdAt: Timestamp;

  /** Optional: latest Stripe requirements block for quick debug. */
  requirements?: Stripe.Account.Requirements;

  /* === any additional athlete profile fields you already use === */
  fullName?: string;
  schoolName?: string;
  sports?: string[];
  [prop: string]: any; // allow future expansion
}

/* ──────────────────────────────────────────────────────────────────
 *  Customer objects (fans) held in Stripe – minimal metadata only
 * ----------------------------------------------------------------*/
export interface CustomerData {
  metadata: {
    /** Firebase UID of the FAN (not the athlete). */
    firebaseUID: string;
    /** Firebase UID of the ATHLETE this fan paid (for traceability). */
    athleteUID?: string;
    [prop: string]: any;
  };
  email?: string;
  phone?: string;
}

/* ──────────────────────────────────────────────────────────────────
 *  One-time donation “Price” objects – kept for completeness
 * ----------------------------------------------------------------*/
export interface Price {
  active: boolean;
  billing_scheme?: Stripe.Price.BillingScheme;
  tiers_mode?: Stripe.Price.TiersMode | null;
  tiers?: Stripe.Price.Tier[] | null;
  currency: string;
  description: string | null;
  type: 'one_time' | 'recurring';
  unit_amount: number | null;
  recurring?: Stripe.Price.Recurring | null;
  interval: Stripe.Price.Recurring.Interval | null;
  interval_count: number | null;
  trial_period_days: number | null;
  transform_quantity?: Stripe.Price.TransformQuantity | null;
  tax_behavior: Stripe.Price.TaxBehavior | null;
  metadata?: Stripe.Metadata;
  product?: string | Stripe.Product | Stripe.DeletedProduct | DocumentReference;
  [prop: string]: any;
}

/* ──────────────────────────────────────────────────────────────────
 *  Donation “Product” wrapper – one product per athlete
 * ----------------------------------------------------------------*/
export interface Product {
  active: boolean;
  /** Visible name shown in Checkout / Payment Sheet (e.g. “Donate to …”). */
  name: string;
  description: string | null;
  /** Custom Firebase Auth role granted while this product is active. */
  role: string | null;
  images: string[];          // athlete head-shot etc.
  prices?: Price[];          // usually exactly one
  metadata?: Stripe.Metadata;
  [prop: string]: any;
}

/* ──────────────────────────────────────────────────────────────────
 *  TaxRate passthrough (un-changed) – included for completeness
 * ----------------------------------------------------------------*/
export interface TaxRate extends Stripe.TaxRate {
  [prop: string]: any;
}

/* ──────────────────────────────────────────────────────────────────
 *  Record of an individual donation (stored under athletes/{uid})
 * ----------------------------------------------------------------*/
export interface Donation {
  /** Stripe PaymentIntent / Charge ID. */
  id: string;

  /** Firestore reference back to the donating fan’s user doc (optional). */
  fanRef?: DocumentReference;

  /** Currency / amount metadata */
  amount: number;
  currency: string;

  /** UTC timestamp of when the payment succeeded. */
  created: Timestamp;

  /** Stripe status – should be “succeeded” for normal donations. */
  status: Stripe.PaymentIntent.Status;

  /** Link to the Stripe dashboard for quick CSR look-ups. */
  stripeLink: string;

  /** True once funds are included in a payout. */
  includedInPayout: boolean;

  /* any extra fields you find useful */
  [prop: string]: any;
}

/* ──────────────────────────────────────────────────────────────────
 *  Active subscription record stored under customers/{uid}
 * ----------------------------------------------------------------*/
export interface Subscription {
  metadata: Stripe.Metadata;
  role: string | null;
  status: Stripe.Subscription.Status;
  stripeLink: string;
  product: DocumentReference;
  price: DocumentReference;
  prices: DocumentReference[];
  quantity: number | null;
  items: Stripe.SubscriptionItem[];
  cancel_at_period_end: boolean;
  cancel_at: Timestamp | null;
  canceled_at: Timestamp | null;
  current_period_start: Timestamp;
  current_period_end: Timestamp;
  created: Timestamp;
  ended_at: Timestamp | null;
  trial_start: Timestamp | null;
  trial_end: Timestamp | null;
  [prop: string]: any;
}
