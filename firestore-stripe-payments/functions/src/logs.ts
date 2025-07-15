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

import { logger } from 'firebase-functions';

export const creatingCustomer = (uid: string) => {
  logger.log(`⚙️ Creating customer object for [${uid}].`);
};

export const customerCreationError = (error: Error, uid: string) => {
  logger.error(
    `❗️[Error]: Failed to create customer for [${uid}]:`,
    error.message,
  );
};

export const customerDeletionError = (error: Error, uid: string) => {
  logger.error(
    `❗️[Error]: Failed to delete customer for [${uid}]:`,
    error.message,
  );
};

export function customerCreated(id: string, livemode: boolean) {
  logger.log(
    `✅Created a new customer: https://dashboard.stripe.com${
      livemode ? '' : '/test'
    }/customers/${id}.`,
  );
}

export function customerDeleted(id: string) {
  logger.log(`🗑Deleted Stripe customer [${id}]`);
}

export function creatingCheckoutSession(docId: string) {
  logger.log(`⚙️ Creating checkout session for doc [${docId}].`);
}

export function checkoutSessionCreated(docId: string) {
  logger.log(`✅Checkout session created for doc [${docId}].`);
}

export function checkoutSessionCreationError(docId: string, error: Error) {
  logger.error(
    `❗️[Error]: Checkout session creation failed for doc [${docId}]:`,
    error.message,
  );
}

export function createdBillingPortalLink(uid: string) {
  logger.log(`✅Created billing portal link for user [${uid}].`);
}

export function billingPortalLinkCreationError(uid: string, error: Error) {
  logger.error(
    `❗️[Error]: Customer portal link creation failed for user [${uid}]:`,
    error.message,
  );
}

export function firestoreDocCreated(collection: string, docId: string) {
  logger.log(
    `🔥📄 Added doc [${docId}] to collection [${collection}] in Firestore.`,
  );
}

export function firestoreDocDeleted(collection: string, docId: string) {
  logger.log(
    `🗑🔥📄 Deleted doc [${docId}] from collection [${collection}] in Firestore.`,
  );
}

export function userCustomClaimSet(
  uid: string,
  claimKey: string,
  claimValue: string,
) {
  logger.log(
    `🚦 Added custom claim [${claimKey}: ${claimValue}] for user [${uid}].`,
  );
}

export function badWebhookSecret(error: Error) {
  logger.error(
    '❗️[Error]: Webhook signature verification failed. Is your Stripe webhook secret parameter configured correctly?',
    error.message,
  );
}

export function startWebhookEventProcessing(id: string, type: string) {
  logger.log(`⚙️ Handling Stripe event [${id}] of type [${type}].`);
}

export function webhookHandlerSucceeded(id: string, type: string) {
  logger.log(`✅Successfully handled Stripe event [${id}] of type [${type}].`);
}

export function webhookHandlerError(error: Error, id: string, type: string) {
  logger.error(
    `❗️[Error]: Webhook handler for  Stripe event [${id}] of type [${type}] failed:`,
    error.message,
  );
}

// Additional helpers for Connect account flows
export const customerExists = (uid: string, accountId: string) => {
  logger.log(`↪️ Reusing existing Connect account [${accountId}] for user [${uid}].`);
};

export const creatingConnectedAccount = (uid: string) => {
  logger.log(`⚙️ Creating new Connect account for user [${uid}].`);
};

export const customerAndAccountCreated = (
  uid: string,
  accountId: string,
  customerId: string,
) => {
  logger.log(
    `✅Created Connect account [${accountId}] and customer [${customerId}] for user [${uid}].`,
  );
};
