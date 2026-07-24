import { createAuthClient } from 'better-auth/react';
import {
  inferAdditionalFields,
  twoFactorClient,
  magicLinkClient,
  emailOTPClient,
} from 'better-auth/client/plugins';
import type { auth } from '@/lib/auth';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  plugins: [inferAdditionalFields<typeof auth>(), twoFactorClient(), magicLinkClient(), emailOTPClient()],
});

export const { signIn, signUp, signOut, useSession, twoFactor } = authClient;
