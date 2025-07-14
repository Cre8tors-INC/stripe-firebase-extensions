import * as functions from 'firebase-functions';
import { getOrCreateConnectAccount } from '../utils';

export const createConnectLink = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login');

    const { stripeAccountId, onboardingUrl } = await getOrCreateConnectAccount(
      context.auth.uid,
    );

    // ⚠️  For an already-onboarded account we return dashboard login instead.
    if (onboardingUrl) return { url: onboardingUrl };

    const link = await stripe.accountLinks.create({
      account: stripeAccountId,
      type: 'account_onboarding',
      refresh_url: CONNECT_REFRESH_URL,
      return_url: CONNECT_RETURN_URL,
    });
    return { url: link.url };
  },
);
