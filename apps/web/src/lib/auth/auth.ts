import { betterAuth } from 'better-auth';
import { twoFactor, magicLink, emailOTP } from 'better-auth/plugins';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  sendMagicLinkEmail,
  sendOTPEmail,
  sendResetPasswordEmail,
  sendVerificationEmail,
  sendChangeEmailConfirmationEmail,
  sendDeleteAccountVerificationEmail,
} from '@/lib/email/email';
import { authHooksBefore } from '@/lib/auth/auth-hooks-before';
import { authHooksAfter } from '@/lib/auth/auth-hooks-after';

export const auth = betterAuth({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  // Le stockage par defaut ('memory') repart de zero a chaque cold start
  // Vercel : chaque instance serverless a ses propres compteurs, ce qui rend
  // la limite effective (N instances x 3 requetes) au lieu de 3. 'database'
  // persiste les compteurs dans la table RateLimit (voir schema.prisma) et
  // survit aux redemarrages d'instance.
  rateLimit: {
    storage: 'database',
  },
  advanced: {
    ipAddress: {
      // x-forwarded-for est deja ecrase par Vercel par defaut (anti-spoofing
      // natif, une seule IP) sauf option Enterprise "Trusted Proxy" - mais
      // x-vercel-forwarded-for est le seul en-tete que Vercel garantit
      // jamais modifie par un proxy tiers place devant Vercel, donc plus
      // fiable pour identifier le vrai client (voir doc Vercel, en-tetes de
      // requete). Sans en-tete resolu, better-auth retombe sur un bucket
      // unique partage par tous les visiteurs (DoS trivial sur /sign-in/email).
      ipAddressHeaders: ['x-vercel-forwarded-for', 'x-forwarded-for'],
    },
  },
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
      // D76 : une connexion Google/Microsoft ne lie JAMAIS un compte existant d'elle-meme
      // (meme adresse verifiee). La liaison est volontaire, depuis le profil
      // (linkSocial, non concerne par cette option), et c'est elle qui rend ensuite
      // la connexion par Google/Microsoft possible. Ferme aussi la prise de controle
      // d'un compte par un fournisseur qui annoncerait la meme adresse.
      disableImplicitLinking: true,
    },
  },
  onAPIError: {
    errorURL: '/erreur-connexion',
  },
  user: {
    deleteUser: {
      enabled: true,
      // Sans verification, un cookie de session vole (valide jusqu'a 24h,
      // freshAge par defaut) suffisait a supprimer definitivement un compte
      // OAuth-only (pas de mot de passe a redemander) - voir audit securite,
      // doc/analysis/AUDIT_SECURITE_AUTH.md, finding #4. Avec cette option,
      // /delete-user n'efface plus rien directement : il envoie un email de
      // confirmation, et seul le clic sur le lien (route /delete-user/callback)
      // finalise - via hooks.before ci-dessous, qui archive au lieu de
      // supprimer reellement (voir ce hook pour le detail). beforeDelete
      // n'est pas utilise : le hook court-circuite systematiquement la
      // suppression reelle de better-auth avant qu'elle ne s'execute.
      sendDeleteAccountVerification: async ({ user, url }) => {
        await sendDeleteAccountVerificationEmail(user.email, user.name, url);
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
        // L'auto-inscription (/register) ne cree que des Cabinet RH ; les
        // autres roles (Gestionnaire RH...) sont toujours poses par le
        // serveur via la route d'acceptation d'invitation, jamais par ce
        // defaut. Valeurs alignees sur la nomenclature du PRD (voir
        // doc/analysis/ARCHITECTURE_SOCIALFLOW_RBAC.md section 1) :
        // SUPER_ADMIN, CABINET_RH, GESTIONNAIRE_RH, ENTREPRISE_CLIENTE,
        // COLLABORATEUR.
        defaultValue: 'CABINET_RH',
        input: false,
      },
      // RBAC (voir doc/analysis/ARCHITECTURE_SOCIALFLOW_RBAC.md) : jamais
      // pose par le client (input:false), seulement par le hook
      // d'auto-creation ci-dessous (inscription directe) ou par la route
      // d'acceptation d'invitation (apps/web/src/app/api/invitations/accept).
      cabinetId: {
        type: 'string',
        required: false,
        input: false,
      },
      // Raison sociale du cabinet, distincte du nom du titulaire (`name`).
      // Posee par le client uniquement a l'auto-inscription (le hook
      // ci-dessous s'en sert pour nommer le Cabinet cree) ; sans valeur pour
      // une inscription via invitation ou OAuth, d'ou le repli sur
      // `Cabinet de ${name}` dans le hook.
      cabinetName: {
        type: 'string',
        required: false,
        input: true,
        validator: { input: z.string().trim().min(1).max(200) },
      },
      // Archivage : voir hooks.before ci-dessous. input:false car seul le
      // hook (cote serveur, via internalAdapter.updateUser) doit pouvoir le
      // poser - jamais le client.
      deletedAt: {
        type: 'date',
        required: false,
        input: false,
      },
      // Suspension individuelle par un SuperAdmin (voir
      // api/admin/users/[id]/route.ts) : input:false, jamais pose par le
      // client, seulement par cette route via Prisma directement.
      status: {
        type: 'string',
        required: false,
        defaultValue: 'actif',
        input: false,
      },
      // Auteur de la suspension (D52) : lu a la connexion pour distinguer une
      // suspension par le cabinet d'une suspension par le SuperAdmin.
      suspendedBy: {
        type: 'string',
        required: false,
        input: false,
      },
    },
  },
  hooks: {
    before: authHooksBefore,
    after: authHooksAfter,
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
