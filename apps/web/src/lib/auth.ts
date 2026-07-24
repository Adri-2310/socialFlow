import { betterAuth } from 'better-auth';
import { twoFactor, magicLink, emailOTP } from 'better-auth/plugins';
import { createAuthMiddleware } from 'better-auth/api';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from '@/lib/prisma';
import {
  sendMagicLinkEmail,
  sendOTPEmail,
  sendResetPasswordEmail,
  sendVerificationEmail,
  sendChangeEmailConfirmationEmail,
  sendAccountDeletedEmail,
  sendPasswordChangedEmail,
  sendTwoFactorEnabledEmail,
  sendTwoFactorDisabledEmail,
  sendAccountUnlinkedEmail,
} from '@/lib/email';

const OAUTH_PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
};

export const auth = betterAuth({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      await sendResetPasswordEmail(user.email, url);
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user.email, url);
    },
    // Verification "souple" : l'email part a l'inscription et reste
    // consultable/renvoyable depuis le dashboard, mais ne bloque jamais la
    // connexion (emailAndPassword.requireEmailVerification reste desactive).
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      disableImplicitSignUp: true,
    },
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID as string,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET as string,
      disableImplicitSignUp: true,
      // Microsoft n'expose pas toujours le claim `email_verified` dans le ID token
      // des comptes personnels, mais Microsoft exige déjà une vérification de
      // l'email (ou du téléphone) à la création du compte - on la considère donc
      // fiable, comme pour Google.
      mapProfileToUser: () => ({ emailVerified: true }),
    },
  },
  account: {
    accountLinking: {
      allowDifferentEmails: true,
    },
  },
  onAPIError: {
    errorURL: '/erreur-connexion',
  },
  user: {
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        await sendAccountDeletedEmail(user.email, user.name);
      },
    },
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
        await sendChangeEmailConfirmationEmail(user.email, newEmail, url);
      },
    },
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'cabinet',
        input: false,
      },
      plan: {
        type: 'string',
        required: false,
        input: true,
      },
      billingPeriod: {
        type: 'string',
        required: false,
        defaultValue: 'monthly',
        input: true,
      },
    },
  },
  hooks: {
    // Notifications de securite envoyees apres coup, uniquement si l'action a
    // reussi (verifie via ctx.context.returned) et dans le cadre d'une
    // session pleinement authentifiee (evite par exemple de notifier a tort
    // sur le verify-totp utilise pendant le challenge de connexion 2FA, qui
    // n'a pas encore de session.session complete).
    after: createAuthMiddleware(async (ctx) => {
      const returned = ctx.context.returned;
      const success = returned
        ? returned instanceof Response
          ? returned.status === 200
          : true
        : false;
      if (!success) return;

      const session = ctx.context.session;
      if (!session?.session) return;

      if (ctx.path === '/change-password') {
        await sendPasswordChangedEmail(session.user.email);
        return;
      }

      if (ctx.path === '/two-factor/verify-totp') {
        await sendTwoFactorEnabledEmail(session.user.email);
        return;
      }

      if (ctx.path === '/two-factor/disable') {
        await sendTwoFactorDisabledEmail(session.user.email);
        return;
      }

      if (ctx.path === '/unlink-account') {
        const providerId = (ctx.body as { providerId?: string } | undefined)?.providerId;
        const label = providerId ? (OAUTH_PROVIDER_LABELS[providerId] ?? providerId) : null;
        if (label) await sendAccountUnlinkedEmail(session.user.email, label);
        return;
      }
    }),
  },
  plugins: [
    twoFactor({
      issuer: 'SocialFlow',
    }),
    // Lien magique et code par email : methodes de connexion sans mot de passe
    // uniquement (disableSignUp) - la creation de compte reste reservee au
    // parcours /register.
    magicLink({
      disableSignUp: true,
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail(email, url);
      },
    }),
    emailOTP({
      disableSignUp: true,
      sendVerificationOTP: async ({ email, otp }) => {
        await sendOTPEmail(email, otp);
      },
    }),
  ],
});
