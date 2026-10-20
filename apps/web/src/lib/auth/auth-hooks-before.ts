import { createAuthMiddleware, APIError, getSessionFromCtx } from 'better-auth/api';
import { deleteSessionCookie } from 'better-auth/cookies';
import { prisma } from '@/lib/prisma';
import {
  ACCOUNT_DELETION_BLOCKED_CODE,
  accountDeletionBlock,
} from '@/lib/auth/account-deletion-guard';
import { sendAccountDeletedEmail } from '@/lib/email/email';

// Hook avant les routes de Better Auth, branché dans auth.ts.
const OAUTH_PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
};

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
export const authHooksBefore = createAuthMiddleware(async (ctx) => {
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

  // Le titulaire du cabinet ne peut pas supprimer son compte tant que son
  // abonnement court (D67) : refuse des la demande, et a nouveau a la
  // confirmation (l'abonnement a pu demarrer entre-temps).
  if (ctx.path === '/delete-user' || isCallbackGet) {
    const requester = await getSessionFromCtx(ctx, { disableCookieCache: true }).catch(() => null);
    if (requester && (await accountDeletionBlock(requester.user.id))) {
      throw new APIError('FORBIDDEN', {
        code: ACCOUNT_DELETION_BLOCKED_CODE,
        message: "Resiliez d'abord l'abonnement du cabinet avant de supprimer ce compte.",
      });
    }
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
});
