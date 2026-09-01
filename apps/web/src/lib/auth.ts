import { betterAuth } from 'better-auth';
import { twoFactor, magicLink, emailOTP } from 'better-auth/plugins';
import { createAuthMiddleware, isAPIError, APIError, getSessionFromCtx } from 'better-auth/api';
import { deleteSessionCookie } from 'better-auth/cookies';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  sendMagicLinkEmail,
  sendOTPEmail,
  sendResetPasswordEmail,
  sendVerificationEmail,
  sendChangeEmailConfirmationEmail,
  sendAccountDeletedEmail,
  sendDeleteAccountVerificationEmail,
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
      plan: {
        type: 'string',
        required: false,
        input: true,
        // Enum synchronise a la main avec PlanId dans @/lib/plans (zod ne
        // peut pas deriver un enum runtime depuis un type TS). Sans ce
        // validateur, n'importe quel utilisateur connecte pouvait s'auto-
        // attribuer n'importe quelle valeur de `plan` via update-user - a
        // repasser en input:false le jour ou ce champ sera pose par un
        // webhook Stripe plutot que par le client.
        validator: { input: z.enum(['starter', 'pro', 'enterprise']) },
      },
      billingPeriod: {
        type: 'string',
        required: false,
        defaultValue: 'monthly',
        input: true,
        // Synchronise a la main avec BillingPeriod dans @/lib/plans, meme
        // raison que `plan` ci-dessus.
        validator: { input: z.enum(['monthly', 'yearly']) },
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
    },
  },
  hooks: {
    // Remplace la suppression definitive immediate de better-auth par un
    // archivage : le compte redemande par l'utilisateur (RGPD) doit rester
    // recuperable (voir ACCOUNT_DELETION_RETENTION_DAYS) avant purge reelle
    // (voir /api/cron/purge-deleted-accounts).
    // Impossible d'intercepter ca en hooks.after : au moment ou il s'execute,
    // internalAdapter.deleteUser a deja fait sa suppression en cascade
    // (Session/Account/TwoFactor inclus) et la ligne User n'existe plus. Il
    // faut donc court-circuiter AVANT que le vrai handler /delete-user/callback
    // ne s'execute, en reproduisant nous-memes sa verification (session +
    // jeton a usage unique) puis en archivant a la place.
    //
    // Ne traite que le chemin "heureux" : si la session est absente ou le
    // jeton invalide/deja consomme, on laisse `return` sans rien faire -
    // le vrai handler s'execute ensuite et produit exactement les memes
    // erreurs (404/INVALID_TOKEN) qu'avant ce hook.
    before: createAuthMiddleware(async (ctx) => {
      const isCallbackGet = ctx.path === '/delete-user/callback';
      const isDeleteWithToken =
        ctx.path === '/delete-user' && !!(ctx.body as { token?: string } | undefined)?.token;
      // /unlink-account ne recoit plus que `accountId` (depuis better-auth
      // 1.7) : le libelle du fournisseur doit etre resolu ICI, avant que le
      // vrai handler ne supprime la ligne Account, et transmis au hook
      // `after` via ctx.context (meme mecanisme que ctx.context.returned).
      if (ctx.path === '/unlink-account') {
        const accountId = (ctx.body as { accountId?: string } | undefined)?.accountId;
        const account = accountId
          ? await prisma.account.findUnique({ where: { id: accountId }, select: { providerId: true } })
          : null;
        if (account) {
          (ctx.context as unknown as { unlinkProviderLabel?: string }).unlinkProviderLabel =
            OAUTH_PROVIDER_LABELS[account.providerId] ?? account.providerId;
        }
        return;
      }

      if (!isCallbackGet && !isDeleteWithToken) return;

      const token = isCallbackGet
        ? (ctx.query as { token?: string } | undefined)?.token
        : (ctx.body as { token: string }).token;
      if (!token) return;

      const session = await getSessionFromCtx(ctx, { disableCookieCache: true }).catch(() => null);
      if (!session) return;

      // Usage unique : consomme le jeton immediatement, comme le ferait le
      // vrai handler. S'il s'avere invalide/pas le bon utilisateur, il a ete
      // consomme "pour rien" mais le resultat est identique a l'echec que le
      // vrai handler aurait produit de toute facon (INVALID_TOKEN).
      const verification = await ctx.context.internalAdapter.consumeVerificationValue(
        `delete-account-${token}`,
      );
      if (!verification || verification.value !== session.user.id) return;

      await ctx.context.internalAdapter.updateUser(session.user.id, { deletedAt: new Date() });
      await ctx.context.internalAdapter.deleteUserSessions(session.user.id);
      deleteSessionCookie(ctx);

      await sendAccountDeletedEmail(session.user.email, session.user.name);

      // Meme branchement que le vrai handler : redirection uniquement si un
      // callbackURL etait fourni (toujours '/compte-supprime' cote app, voir
      // delete-account.tsx), sinon reponse JSON. La valeur du callbackURL
      // recu n'est jamais utilisee telle quelle (fixee en dur) pour eviter de
      // dupliquer ici la protection anti-open-redirect (originCheck) du vrai
      // handler.
      if (isCallbackGet && (ctx.query as { callbackURL?: string } | undefined)?.callbackURL) {
        throw ctx.redirect('/compte-supprime');
      }
      return ctx.json({ success: true, message: 'User deleted' });
    }),
    // Notifications de securite envoyees apres coup, uniquement si l'action a
    // reussi (verifie via ctx.context.returned) et dans le cadre d'une
    // session pleinement authentifiee (evite par exemple de notifier a tort
    // sur le verify-totp utilise pendant le challenge de connexion 2FA, qui
    // n'a pas encore de session.session complete).
    //
    // ctx.context.returned n'est jamais une vraie instance Response ici (ni
    // en HTTP reel, ni via auth.api.*) : better-auth y place soit la charge
    // utile brute en cas de succes, soit l'objet APIError en cas d'echec
    // (voir dispatch.mjs). Il faut donc explicitement exclure les APIError,
    // sinon un mot de passe errone sur /change-password ou une liaison
    // refusee sur /unlink-account declenchent quand meme l'email "modifie
    // avec succes".
    after: createAuthMiddleware(async (ctx) => {
      // Un compte archive (deletedAt renseigne, voir hooks.before) doit
      // rester totalement inaccessible pendant le delai avant purge -
      // sinon la ligne User existant toujours en base, n'importe quel
      // chemin de connexion (mot de passe, lien magique, code email, OAuth,
      // ou meme la confirmation du defi 2FA) reussirait a creer une session
      // normalement. Verifie ctx.context.newSession sans filtrer sur le
      // chemin : c'est le seul point commun a tous les chemins qui creent
      // une session, present ou futur, donc plus robuste qu'une liste de
      // chemins a maintenir a la main (voir le garde 2FA ci-dessous, qui lui
      // doit rester cible sur des chemins precis).
      const freshSession = ctx.context.newSession;
      if (freshSession?.user.deletedAt) {
        await ctx.context.internalAdapter.deleteSession(freshSession.session.token);
        deleteSessionCookie(ctx, true);
        ctx.context.setNewSession(null);

        if (ctx.path === '/sign-in/email') {
          // Non-divulgation : reponse indiscernable d'un mauvais mot de
          // passe, comme pour un email inconnu (voir auth-validation.test.ts)
          // - un compte archive ne doit pas etre plus facile a reperer par
          // essais successifs qu'un compte qui n'a jamais existe.
          throw new APIError('UNAUTHORIZED', {
            code: 'INVALID_EMAIL_OR_PASSWORD',
            message: 'Invalid email or password',
          });
        }

        if (ctx.path === '/magic-link/verify' || ctx.path.startsWith('/callback/')) {
          const errorURL = ctx.context.options.onAPIError?.errorURL || '/erreur-connexion';
          const separator = errorURL.includes('?') ? '&' : '?';
          throw ctx.redirect(`${errorURL}${separator}error=account_deleted`);
        }

        throw new APIError('FORBIDDEN', {
          code: 'ACCOUNT_DELETED',
          message: 'Ce compte a ete supprime.',
        });
      }

      // Suspension d'un utilisateur individuel par un SuperAdmin (voir
      // api/admin/users/[id]/route.ts), distincte de la suspension de
      // cabinet ci-dessous : ne bloque que ce compte precis. Meme choix
      // produit que pour un cabinet suspendu : message clair, pas de
      // non-divulgation (login-form.tsx redirige sur ce code).
      if (freshSession?.user.status === 'suspendu') {
        await ctx.context.internalAdapter.deleteSession(freshSession.session.token);
        deleteSessionCookie(ctx, true);
        ctx.context.setNewSession(null);

        if (ctx.path === '/sign-in/email') {
          throw new APIError('FORBIDDEN', {
            code: 'USER_SUSPENDED',
            message: 'Ce compte a ete suspendu.',
          });
        }

        if (ctx.path === '/magic-link/verify' || ctx.path.startsWith('/callback/')) {
          const errorURL = ctx.context.options.onAPIError?.errorURL || '/erreur-connexion';
          const separator = errorURL.includes('?') ? '&' : '?';
          throw ctx.redirect(`${errorURL}${separator}error=user_suspended`);
        }

        throw new APIError('FORBIDDEN', {
          code: 'USER_SUSPENDED',
          message: 'Ce compte a ete suspendu.',
        });
      }

      // Meme mecanisme que le blocage de compte archive ci-dessus, applique
      // cette fois a TOUS les utilisateurs d'un Cabinet suspendu par un
      // SuperAdmin (voir apps/web/src/app/api/admin/cabinets/[id]/route.ts).
      // Filet de securite pour les sessions creees apres coup : la route de
      // suspension revoque deja les sessions existantes au moment ou elle
      // s'execute, mais rien n'empeche une nouvelle connexion d'etre tentee
      // ensuite tant que le cabinet reste suspendu.
      if (freshSession?.user.cabinetId) {
        const cabinet = await prisma.cabinet.findUnique({
          where: { id: freshSession.user.cabinetId },
          select: { status: true, deletedAt: true },
        });
        // Un cabinet archive (voir api/admin/cabinets/[id]) bloque l'acces au
        // meme titre qu'un cabinet suspendu, avec la meme erreur : du point
        // de vue de l'utilisateur bloque, la distinction (temporaire vs en
        // cours de purge) n'a pas a etre divulguee.
        if (cabinet?.status === 'suspendu' || cabinet?.deletedAt) {
          await ctx.context.internalAdapter.deleteSession(freshSession.session.token);
          deleteSessionCookie(ctx, true);
          ctx.context.setNewSession(null);

          // Contrairement au compte archive ci-dessus, pas de non-divulgation
          // ici (choix produit) : un cabinet suspendu doit voir un message
          // clair plutot que "mot de passe incorrect", quitte a faciliter
          // legerement l'enumeration. login-form.tsx redirige vers
          // /erreur-connexion sur ce code.
          if (ctx.path === '/sign-in/email') {
            throw new APIError('FORBIDDEN', {
              code: 'CABINET_SUSPENDED',
              message: 'Ce cabinet a ete suspendu.',
            });
          }

          if (ctx.path === '/magic-link/verify' || ctx.path.startsWith('/callback/')) {
            const errorURL = ctx.context.options.onAPIError?.errorURL || '/erreur-connexion';
            const separator = errorURL.includes('?') ? '&' : '?';
            throw ctx.redirect(`${errorURL}${separator}error=cabinet_suspended`);
          }

          throw new APIError('FORBIDDEN', {
            code: 'CABINET_SUSPENDED',
            message: 'Ce cabinet a ete suspendu.',
          });
        }
      }

      // Le plugin twoFactor de better-auth n'intercepte que /sign-in/email,
      // /sign-in/username et /sign-in/phone-number (verifie dans
      // dist/plugins/two-factor/index.mjs) : le lien magique, le code par
      // email et la connexion Google/Microsoft creent une session complete
      // sans jamais consulter twoFactorEnabled, ce qui contourne totalement
      // la 2FA. On revoque donc ici toute session issue de ces trois chemins
      // pour un compte 2FA, en reprenant le mecanisme du plugin lui-meme
      // (ctx.context.newSession + deleteSessionCookie). Place avant le calcul
      // de `success` ci-dessous : une redirection reussie (lien magique,
      // callback OAuth) est elle-meme une APIError de statut FOUND cote
      // better-auth (voir better-call/dist/context.mjs), donc indiscernable
      // d'un echec pour ce garde-la.
      if (
        ctx.path === '/magic-link/verify' ||
        ctx.path === '/sign-in/email-otp' ||
        ctx.path.startsWith('/callback/')
      ) {
        const bypassedSession = ctx.context.newSession;
        if (bypassedSession?.user.twoFactorEnabled) {
          await ctx.context.internalAdapter.deleteSession(bypassedSession.session.token);
          deleteSessionCookie(ctx, true);
          ctx.context.setNewSession(null);

          if (ctx.path === '/sign-in/email-otp') {
            throw new APIError('FORBIDDEN', {
              code: 'TWO_FACTOR_REQUIRED_PASSWORD',
              message:
                'Ce compte a la double authentification activee : connectez-vous avec votre mot de passe puis votre code.',
            });
          }

          const errorURL = ctx.context.options.onAPIError?.errorURL || '/erreur-connexion';
          const separator = errorURL.includes('?') ? '&' : '?';
          throw ctx.redirect(`${errorURL}${separator}error=two_factor_required_password`);
        }
      }

      const returned = ctx.context.returned;
      const success = returned
        ? returned instanceof Response
          ? returned.status === 200
          : !isAPIError(returned)
        : false;
      if (!success) return;

      // RBAC (voir doc/analysis/ARCHITECTURE_SOCIALFLOW_RBAC.md) : l'auto-
      // inscription cree toujours un Cabinet RH (role par defaut ci-dessus).
      // On lui cree son Cabinet ici plutot que de le faire poser par le
      // client, pour la meme raison que role/cabinetId sont input:false.
      // S'applique aussi a l'inscription faite par la route d'acceptation
      // d'invitation (qui reutilise ce meme endpoint) : elle nettoie ensuite
      // ce Cabinet "fantome" en reposant le role/cabinetId de l'invitation
      // (voir apps/web/src/app/api/invitations/accept/route.ts) - plus
      // robuste qu'un signal par en-tete, qui ne survit pas de facon fiable
      // au passage par les before-hooks de better-auth (defuReplaceArrays).
      if (ctx.path === '/sign-up/email') {
        const newUser = ctx.context.newSession?.user;
        if (newUser?.role === 'CABINET_RH' && !newUser.cabinetId) {
          const cabinet = await prisma.cabinet.create({
            data: { name: newUser.cabinetName?.trim() || `Cabinet de ${newUser.name}` },
          });
          await ctx.context.internalAdapter.updateUser(newUser.id, { cabinetId: cabinet.id });
          await prisma.auditLog.create({
            data: { action: 'CABINET_CREATED', actorId: newUser.id, cabinetId: cabinet.id },
          });
        }
        return;
      }

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
        const label = (ctx.context as unknown as { unlinkProviderLabel?: string }).unlinkProviderLabel;
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
