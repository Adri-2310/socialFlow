import { betterAuth } from 'better-auth';
import { twoFactor, magicLink, emailOTP } from 'better-auth/plugins';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from '@/lib/prisma';
import {
  sendMagicLinkEmail,
  sendOTPEmail,
  sendResetPasswordEmail,
  sendVerificationEmail,
  sendChangeEmailConfirmationEmail,
} from '@/lib/email';

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
