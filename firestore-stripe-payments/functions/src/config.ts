/*
 * Copyright 2020 Stripe, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { getEventarc } from 'firebase-admin/eventarc';
import Stripe from 'stripe';

/** Centralised runtime configuration for the extension. */
export interface ExtensionConfig {
  /** Secret key for the Stripe account that owns all Platform-level resources. */
  stripeSecretKey: string;
  /** Signing secret for the webhook endpoint (optional when testing). */
  stripeWebhookSecret?: string;

  /** Firestore collection where products are stored. */
  productsCollectionPath: string;
  /**
   * Firestore collection where **customers** (or in our case, “athletes”)
   * are stored. If you changed the path to `athletes`, reflect that here.
   */
  customersCollectionPath: string;
  /** Path for any additional Stripe runtime configuration documents. */
  stripeConfigCollectionPath?: string;

  /** Automatically create Stripe customers when Firebase users are created. */
  syncUsersOnCreate: boolean;
  /** Automatically delete Stripe customers when Firebase users are deleted. */
  autoDeleteUsers: boolean;
  /** Minimum number of Cloud Function instances to keep warm. */
  minCheckoutInstances: number;

  /* ─────────── Added for Stripe Connect ─────────── */
  /** The Connect _client ID_ shown in your Stripe dashboard (used for OAuth). */
  stripeConnectClientId?: string;
  /**
   * The origin for your front-end (used when constructing Stripe Connect
   * onboarding/refresh URLs). Example: `https://app.example.com`
   */
  frontendOrigin?: string;
}

const config: ExtensionConfig = {
  stripeSecretKey: process.env.STRIPE_API_KEY as string,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,

  productsCollectionPath: process.env.PRODUCTS_COLLECTION as string,
  customersCollectionPath: process.env.CUSTOMERS_COLLECTION as string,
  stripeConfigCollectionPath: process.env.STRIPE_CONFIG_COLLECTION,

  syncUsersOnCreate: process.env.SYNC_USERS_ON_CREATE === 'Sync',
  autoDeleteUsers: process.env.DELETE_STRIPE_CUSTOMERS === 'Auto delete',

  minCheckoutInstances:
    Number(process.env.CREATE_CHECKOUT_SESSION_MIN_INSTANCES) ?? 0,

  /* ─────────── Added for Stripe Connect ─────────── */
  stripeConnectClientId: process.env.STRIPE_CONNECT_CLIENT_ID,
  frontendOrigin: process.env.FRONTEND_ORIGIN,
};

export const CONNECT_REFRESH_URL =
  config.frontendOrigin?.replace(/\/$/, '') + '/onboarding/refresh';
export const CONNECT_RETURN_URL =
  config.frontendOrigin?.replace(/\/$/, '') + '/onboarding/return';

export const apiVersion = '2022-11-15';

/**
 * Authenticated Stripe SDK instance.
 * Registers the Firebase extension as a Stripe plugin for analytics.
 */
export const stripe = new Stripe(config.stripeSecretKey, {
  apiVersion,
  appInfo: {
    name: 'Firebase Invertase firestore-stripe-payments',
    version: '0.3.5',
  },
});

/**
 * Helper to lazily initialise an Eventarc channel (only when configured).
 * Used for emitting audit-level events from Cloud Functions.
 */
export const getEventChannel = () =>
  process.env.EVENTARC_CHANNEL
    ? getEventarc().channel(process.env.EVENTARC_CHANNEL, {
        allowedEventTypes: process.env.EXT_SELECTED_EVENTS,
      })
    : undefined;

export default config;
