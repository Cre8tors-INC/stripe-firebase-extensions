/*
 * Stripe × Firebase “Athlete Donations” – shared TypeScript models.
 * --------------------------------------------------------------------
 *  • Uses the athletes collection as the single source-of-truth.
 *  • Stores one Connect account per athlete (fan → athlete donations).
 *  • No “token” or credits logic – pure currency flows.
 */

import Stripe from 'stripe';

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
  createdAt: FirebaseFirestore.Timestamp;

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
    athleteUID: string;
  };
  email?: string;
  phone?: string;
}

/* ──────────────────────────────────────────────────────────────────
 *  One-time donation “Price” objects – kept for completeness
 * ----------------------------------------------------------------*/
export interface Price {
  active: boolean;
  currency: string;          // e.g. 'usd'
  unit_amount: number;       // in smallest currency unit – cents for USD
  description: string | null;
  type: 'one_time';          // donations are one-off, not recurring
  interval: null;            // always null for one-time
  interval_count: null;      // always null for one-time
  trial_period_days: null;   // not used
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
  /** Not used for donations – keep null. */
  role: null;
  images: string[];          // athlete head-shot etc.
  prices?: Price[];          // usually exactly one
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
  fanRef?: FirebaseFirestore.DocumentReference;

  /** Currency / amount metadata */
  amount: number;
  currency: string;

  /** UTC timestamp of when the payment succeeded. */
  created: FirebaseFirestore.Timestamp;

  /** Stripe status – should be “succeeded” for normal donations. */
  status: Stripe.PaymentIntent.Status;

  /** Link to the Stripe dashboard for quick CSR look-ups. */
  stripeLink: string;

  /** True once funds are included in a payout. */
  includedInPayout: boolean;

  /* any extra fields you find useful */
  [prop: string]: any;
}
