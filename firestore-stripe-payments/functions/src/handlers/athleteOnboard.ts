import * as functions from 'firebase-functions/v1';
import { stripe, CONNECT_REFRESH_URL, CONNECT_RETURN_URL } from '../config';
import { getOrCreateConnectAccount } from '../utils';

export const createConnectLink = functions.https.onCall(
  async (data, context) => {
    const uid = context?.auth?.uid;
    if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Login');

    const { account, reused } = await getOrCreateConnectAccount(uid);

    if (reused) {
      const login = await stripe.accounts.createLoginLink(account.id);
      return { url: login.url };
    }

    const link = await stripe.accountLinks.create({
      account: account.id,
      type: 'account_onboarding',
      refresh_url: CONNECT_REFRESH_URL,
      return_url: CONNECT_RETURN_URL,
    });
    return { url: link.url };
  },
);
