import { createAuthMiddleware, isAPIError, APIError } from 'better-auth/api';
import { deleteSessionCookie } from 'better-auth/cookies';
import { prisma } from '@/lib/prisma';
import { createCabinetForOwner } from '@/lib/cabinet/cabinet-provision';
import { isLoginBlocked } from '@/lib/cabinet/cabinet-suspension';
import { portalPath, portalSlugFromRequest } from '@/lib/portal/portal-slug';
import { checkPortalAccess } from '@/lib/portal/portal-guard';
import {
  sendPasswordChangedEmail,
  sendTwoFactorEnabledEmail,
  sendTwoFactorDisabledEmail,
  sendAccountUnlinkedEmail,
} from '@/lib/email/email';

// Hook après les routes de Better Auth, branché dans auth.ts.
// Chemins qui ouvrent une session (D76) : seuls ceux-la passent par le controle du
// portail. Un simple rafraichissement de session (get-session) n'en fait pas partie.
const SESSION_CREATING_PATHS = [
  '/sign-in/email',
  '/sign-in/email-otp',
  '/magic-link/verify',
  '/callback/',
  '/two-factor/verify-totp',
  '/two-factor/verify-otp',
  '/two-factor/verify-backup-code',
];

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
export const authHooksAfter = createAuthMiddleware(async (ctx) => {
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

    // D52 : suspendu par son cabinet, l'utilisateur doit s'adresser a son
    // cabinet et non au support SocialFlow. Toute autre valeur
    // (SUPER_ADMIN ou null, anterieur au champ) garde le message d'origine.
    const byCabinet =
      (freshSession.user as { suspendedBy?: string | null }).suspendedBy === 'CABINET_RH';
    const apiCode = byCabinet ? 'USER_SUSPENDED_BY_CABINET' : 'USER_SUSPENDED';
    const redirectCode = byCabinet ? 'user_suspended_by_cabinet' : 'user_suspended';

    if (ctx.path === '/sign-in/email') {
      throw new APIError('FORBIDDEN', {
        code: apiCode,
        message: 'Ce compte a ete suspendu.',
      });
    }

    if (ctx.path === '/magic-link/verify' || ctx.path.startsWith('/callback/')) {
      const errorURL = ctx.context.options.onAPIError?.errorURL || '/erreur-connexion';
      const separator = errorURL.includes('?') ? '&' : '?';
      throw ctx.redirect(`${errorURL}${separator}error=${redirectCode}`);
    }

    throw new APIError('FORBIDDEN', {
      code: apiCode,
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
      select: { status: true, suspensionType: true, deletedAt: true },
    });
    // Un cabinet archive (voir api/admin/cabinets/[id]) bloque l'acces au
    // meme titre qu'un cabinet suspendu, avec la meme erreur : du point
    // de vue de l'utilisateur bloque, la distinction (temporaire vs en
    // cours de purge) n'a pas a etre divulguee.
    // D71 : une suspension en lecture seule laisse se connecter ; seul le
    // blocage total (ou une suspension anterieure a D71) refuse la connexion.
    if (cabinet && isLoginBlocked(cabinet)) {
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

  // D76 : portail de connexion du cabinet. Seulement aux chemins qui OUVRENT une
  // session (pas a un simple rafraichissement, qui ne doit jamais deconnecter).
  // Un gestionnaire, une entreprise ou un collaborateur n'entre que par le
  // portail de son cabinet ; le portail n'accepte que ses comptes.
  if (freshSession && SESSION_CREATING_PATHS.some((p) => ctx.path === p || ctx.path.startsWith(`${p}`))) {
    const verdict = await checkPortalAccess(
      { role: freshSession.user.role, cabinetId: freshSession.user.cabinetId },
      portalSlugFromRequest({
        headers: ctx.headers,
        callbackURL:
          (ctx.body as { callbackURL?: unknown } | undefined)?.callbackURL ??
          (ctx.query as { callbackURL?: unknown } | undefined)?.callbackURL,
      }),
    );
    if (!verdict.ok) {
      await ctx.context.internalAdapter.deleteSession(freshSession.session.token);
      deleteSessionCookie(ctx, true);
      ctx.context.setNewSession(null);

      const code = verdict.reason;
      // Les redirections (lien magique, Google/Microsoft) ne portent qu'un
      // code ; la page d'erreur y ajoute le portail a utiliser.
      if (ctx.path === '/magic-link/verify' || ctx.path.startsWith('/callback/')) {
        const errorURL = ctx.context.options.onAPIError?.errorURL || '/erreur-connexion';
        const separator = errorURL.includes('?') ? '&' : '?';
        const portal =
          verdict.reason === 'PORTAL_REQUIRED' && verdict.portalSlug
            ? `&portal=${encodeURIComponent(verdict.portalSlug)}`
            : '';
        throw ctx.redirect(`${errorURL}${separator}error=${code.toLowerCase()}${portal}`);
      }
      // Reponse d'API : le message d'un PORTAL_REQUIRED est le chemin du portail
      // du cabinet de la personne (elle a prouve ses identifiants).
      throw new APIError('FORBIDDEN', {
        code,
        message:
          verdict.reason === 'PORTAL_REQUIRED' && verdict.portalSlug
            ? portalPath(verdict.portalSlug)
            : 'Ce portail n’est pas celui de votre compte.',
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
  // inscription par email cree toujours un Cabinet RH (role par defaut
  // ci-dessus) et son Cabinet, ici plutot que pose par le client, pour la
  // meme raison que role/cabinetId sont input:false. Les invitations ne
  // passent plus par ce chemin (lib/invitations/invitation-accept.ts, C6) ; l'inscription
  // Google/Microsoft est finalisee par api/register/finalize.
  //
  // Le plan choisi (D55) n'est pas pose ici : api/register/finalize le pose
  // sur le cabinet apres l'inscription, pour l'email comme pour OAuth.
  if (ctx.path === '/sign-up/email') {
    const newUser = ctx.context.newSession?.user;
    if (newUser?.role === 'CABINET_RH' && !newUser.cabinetId) {
      const cabinetId = await createCabinetForOwner(newUser, null);
      await ctx.context.internalAdapter.updateUser(newUser.id, { cabinetId });
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
});
