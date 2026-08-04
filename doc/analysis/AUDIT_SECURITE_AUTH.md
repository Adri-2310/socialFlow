# Audit Sécurité - Authentification SocialFlow

**Document** : Audit de sécurité du module auth (Better Auth)
**Date** : 2026-08-04
**Branche auditée** : `feature/auth` (`64da5ce`)
**Méthode** : lecture du code applicatif + vérification des comportements contre les sources réelles de `better-auth@1.6.23` dans `node_modules` (pas la doc)

---

## Suivi des correctifs

| # | Titre | Sévérité | Statut |
|---|---|---|---|
| 1 | Contournement complet de la 2FA (lien magique, OTP email, OAuth) | Critique | ✅ Corrigé |
| 2 | Auto-attribution de `plan`/`billingPeriod` | Élevée | ✅ Corrigé |
| 3 | Rate limiting inopérant en prod (mémoire + résolution IP) | Moyenne | ✅ Corrigé |
| 4 | Suppression de compte OAuth-only sans re-vérification | Moyenne | ✅ Corrigé |
| 5 | Case « Rester connecté » décorative | Faible | ✅ Corrigé |
| 6 | Injection HTML mineure via `name` dans l'email de suppression | Faible | ✅ Corrigé |
| - | Vulnérabilité Microsoft OAuth (`mapProfileToUser`) | Critique (connue) | ⬜ Ouverte par choix informé |

---

## Critique

### 1. Contournement complet de la 2FA par le lien magique, le code email et OAuth

**Fichier** : `apps/web/src/lib/auth.ts` (plugins, l. 153-172)

Le plugin `twoFactor` n'intercepte la connexion que sur trois chemins. Vérifié dans `node_modules/better-auth/dist/plugins/two-factor/index.mjs` l. 190-192 :

```js
matcher(context) {
  return context.path === "/sign-in/email" || context.path === "/sign-in/username" || context.path === "/sign-in/phone-number";
}
```

Un `grep -rn "twoFactorEnabled"` sur tout `better-auth/dist` ne renvoie **aucune** occurrence en dehors de ce plugin : aucun autre chemin de connexion ne consulte le flag. Et `magic-link/index.mjs` l. 142-144, `email-otp/routes.mjs` l. 428-429 et le callback OAuth appellent directement `createSession` + `setSessionCookie`, sans challenge.

**Scénario** : Alice active la 2FA depuis `/dashboard`. Un attaquant qui obtient l'accès à sa boîte mail (le scénario exact contre lequel la 2FA protège, puisque le reset de mot de passe passe déjà par l'email) ouvre `/login`, clique « Email » (`passwordless-login.tsx`), demande un lien magique ou un code OTP, et obtient une **session complète sans jamais fournir de TOTP**. Même chose si Alice a lié Google : le bouton Google donne une session pleine. La 2FA n'offre donc aucune protection réelle sur ce périmètre — elle en donne l'illusion, ce qui est pire.

Non couvert par les tests : `auth-2fa-avance.test.ts` teste le défi TOTP uniquement via `/sign-in/email`.

**Correctif suggéré** : ajouter un `hooks.before` refusant `/sign-in/magic-link`, `/email-otp/send-verification-otp` (type `sign-in`) et `/sign-in/social` lorsque l'utilisateur ciblé a `twoFactorEnabled`, avec un message « utilisez votre mot de passe + code 2FA ». Solution plus propre mais plus lourde : reproduire dans un `hooks.after` sur ces chemins la logique du plugin (supprimer `newSession`, poser le cookie `two_factor` signé, renvoyer `{ twoFactorRedirect: true }`). Alternative minimale acceptable pour un TFE : masquer les boutons passwordless/OAuth et documenter la limitation.

**Correctif appliqué** (approche « bloquer purement ») : dans `hooks.after` de `auth.ts`, une session issue de `/magic-link/verify`, `/sign-in/email-otp` ou `/callback/*` est immédiatement révoquée (`internalAdapter.deleteSession` + `deleteSessionCookie`) si l'utilisateur a `twoFactorEnabled`. Le lien magique et le callback OAuth redirigent alors vers `/erreur-connexion?error=two_factor_required_password` (même mécanisme que les autres erreurs de redirection, `onAPIError.errorURL`) ; le code par email renvoie une `APIError` `TWO_FACTOR_REQUIRED_PASSWORD` (403) au client JSON. Ce garde est placé avant le calcul de `success` du hook existant, car une redirection réussie (lien magique, OAuth) est elle-même représentée comme une `APIError` de statut `FOUND` côté better-auth — indiscernable d'un échec pour ce calcul-là. Vérifié par 3 nouveaux tests dans `auth-2fa-avance.test.ts` (blocage lien magique, blocage code email, non-régression sur les comptes sans 2FA).

---

## Élevée

### 2. Auto-attribution de n'importe quelle formule payante (`plan`)

**Fichier** : `apps/web/src/lib/auth.ts` l. 91-101 (`plan` et `billingPeriod` en `input: true`, sans `validator`)

`parseInputData` (`better-auth/dist/db/schema.mjs` l. 59-108) ne rejette que les champs `input: false`, et n'applique de contrôle que si un `validator.input` est fourni. `update-user.mjs` l. 54 écrit ensuite la valeur brute en base.

**Scénario** : tout utilisateur connecté fait `POST /api/auth/update-user` avec `{"plan":"enterprise","billingPeriod":"yearly"}` (ou via `authClient.updateUser`) et passe de `starter` à la formule la plus chère. Le garde `isPlanId` de `bienvenue/page.tsx` l. 31 est purement côté client et donc inopérant.

Le test `auth-validation.test.ts` l. 157-175 fige ce comportement comme « lacune connue et assumée ». C'est surtout un **contournement du gate de facturation** : le jour où Stripe arrive, l'entitlement est déjà auto-attribuable. À traiter avant l'intégration paiement.

**Correctif** : ajouter un `validator.input` (Zod enum `['starter','pro','enterprise']` / `['monthly','yearly']`) sur les deux champs, et passer `plan` en `input: false` en le posant côté serveur depuis le futur webhook Stripe.

**Correctif appliqué** : `validator.input` Zod ajouté sur `plan` (`z.enum(['starter','pro','enterprise'])`) et `billingPeriod` (`z.enum(['monthly','yearly'])`) dans `auth.ts`. Toute valeur hors enum renvoie désormais `400 VALIDATION_ERROR` au lieu d'être stockée telle quelle. `plan` reste `input: true` pour l'instant (pas de Stripe branché) — un commentaire dans le code signale de repasser en `input: false` le jour où ce champ sera posé par un webhook plutôt que par le client. `zod` a été ajouté comme dépendance directe de `apps/web` (jusque-là seulement transitive via better-auth). Vérifié par 2 tests dans `auth-validation.test.ts` (rejet hors enum, acceptation d'une valeur valide).

---

## Moyenne

### 3. Rate limiting inopérant, voire DoS global, sur déploiement Vercel

**Fichier** : `apps/web/src/lib/auth.ts` — aucune clé `rateLimit` ni `advanced.ipAddress`

Défauts appliqués (`better-auth/dist/context/create-context.mjs` l. 169-174) : `enabled: isProduction`, `storage: "memory"`. Les règles par chemin sont correctes (3/10 s sur `/sign-in*`, `/change-password`, `/two-factor/*` ; 3/60 s sur les envois d'email), mais deux problèmes d'infrastructure les annulent :

- **Stockage mémoire** : sur Vercel serverless, chaque instance a son propre compteur, remis à zéro à chaque cold start. La limite effective est `N instances × 3` par fenêtre.
- **Résolution d'IP** : `getIPFromHeader` (`@better-auth/core/dist/utils/ip.mjs` l. 173-192) refuse un `x-forwarded-for` **multi-valeurs** tant que `advanced.ipAddress.trustedProxies` n'est pas configuré (`if (forwardedIps.length !== 1) return null`). Si l'IP ne se résout pas, le limiteur bascule sur `NO_TRUSTED_IP_KEY`, un **bucket unique partagé par tous les visiteurs** (`api/rate-limiter/index.mjs` l. 283-287). Dans ce cas, 3 requêtes/10 s suffisent à renvoyer 429 sur `/sign-in/email` **pour l'application entière** — déni de service trivial sur la connexion.

**Correctif** : déclarer `advanced: { ipAddress: { trustedProxies: [...] } }` adapté à Vercel, et fournir un `rateLimit.storage: 'database'` (ou `secondaryStorage` Redis) pour que les compteurs survivent aux instances.

**Correctif appliqué** : `rateLimit.storage: 'database'` dans `auth.ts`, avec une nouvelle table `RateLimit` (migration `20260804103920_add_rate_limit_table`) — les compteurs survivent désormais aux cold starts. Pour la résolution d'IP, `trustedProxies` s'est avéré inadapté à Vercel (pas de plage d'IP fixe et publiée pour son edge network) : la documentation officielle Vercel (`/docs/headers/request-headers`) confirme que `x-forwarded-for` est déjà écrasé et anti-spoofé par défaut (IP unique, sauf option Enterprise "Trusted Proxy"), et que `x-vercel-forwarded-for` est la variante que Vercel garantit jamais modifiée par un proxy tiers placé devant Vercel. `advanced.ipAddress.ipAddressHeaders` a donc été réglé sur `['x-vercel-forwarded-for', 'x-forwarded-for']`, sans configuration de `trustedProxies`.

Non couvert par la suite Vitest existante : le rate limiter n'est branché que sur le pipeline HTTP réel (`auth.handler`, hook `onRequest`), pas sur les appels directs `auth.api.*` utilisés par tous les tests d'intégration — et `rateLimit.enabled` reste `false` en dehors de `NODE_ENV=production`. Vérifié manuellement via un script jetable (`NODE_ENV=production` forcé, vraie `Request` avec `x-vercel-forwarded-for` fixé, appel à `auth.handler`) : 3 requêtes passent puis 429 à partir de la 4ᵉ, avec une ligne persistée dans `rate_limit` (`count: 3`, `lastRequest` en `BigInt` correctement géré). Script supprimé après vérification, aucune trace laissée dans la base.

### 4. Suppression de compte sans re-vérification pour les comptes OAuth

**Fichiers** : `apps/web/src/lib/auth.ts` l. 72-77 ; `apps/web/src/components/auth/delete-account.tsx` l. 34-36

`deleteUser.enabled: true` sans `sendDeleteAccountVerification`. Pour un utilisateur sans compte `credential` (Google/Microsoft uniquement), le client envoie `{}` et la suppression — irréversible, en cascade sur sessions/comptes/2FA — s'exécute sur la seule présence du cookie de session. Le seul garde-fou est `freshAge` (24 h par défaut, `create-context.mjs` l. 148). Un cookie volé de moins de 24 h suffit donc à détruire le compte.

**Correctif** : implémenter `deleteUser.sendDeleteAccountVerification` (confirmation par email) — cela couvre uniformément les comptes OAuth et credential.

**Correctif appliqué** : `deleteUser.sendDeleteAccountVerification` configuré dans `auth.ts`. `POST /delete-user` n'efface plus jamais directement (vérifié dans les sources better-auth : même avec un mot de passe correct fourni, l'envoi de l'email prend le pas sur la suppression immédiate dès que cette option est présente) — il envoie un email de confirmation, et seule une visite du lien qu'il contient (`GET /delete-user/callback`, qui exige lui-même une session active et un jeton à usage unique) déclenche la suppression réelle. `delete-account.tsx` a été adapté pour refléter ce flux en deux étapes (écran « vérifiez votre boîte mail » au lieu d'une redirection immédiate), pour les comptes avec et sans mot de passe. Un cookie de session volé ne suffit donc plus à lui seul à détruire un compte.

Limite connue non traitée (hors périmètre de ce correctif) : si le jeton est invalide/expiré ou si l'utilisateur clique le lien sans session active sur cet appareil, `/delete-user/callback` renvoie une erreur JSON brute plutôt qu'une redirection vers `/erreur-connexion` (contrairement au flux OAuth) — UX à améliorer plus tard si besoin, sans impact sécurité.

Vérifié par 4 tests (`auth.test.ts`, `auth-comptes-lies.test.ts`) : flux en deux étapes pour un compte avec mot de passe, non-suppression immédiate + suppression en cascade après clic pour un compte OAuth-only simulé, rejet d'un jeton inventé et d'un clic sans session.

---

## Faible

### 5. La case « Rester connecté » est décorative

**Fichier** : `apps/web/src/components/auth/login-form.tsx` l. 286-289

La checkbox n'a ni `state`, ni `onChange`, et `rememberMe` n'est jamais transmis à `signIn.email` (l. 61). Or `sign-in.mjs` l. 152 documente `.default(true)` : la session est **toujours** persistante 7 jours. Un utilisateur qui décoche sur un poste partagé (cabinet comptable, poste mutualisé — le public cible) laisse un cookie de 7 jours en croyant l'inverse.

**Correctif** : câbler l'état et passer `rememberMe` à `signIn.email`.

**Correctif appliqué** : la case est maintenant un vrai contrôle contrôlé (`useState`, coché par défaut) transmis à `signIn.email({ email, password, rememberMe })`. Décochée, better-auth pose un cookie de session sans `Max-Age` (session pure, effacée à la fermeture du navigateur) au lieu du cookie de 7 jours par défaut — vérifié dans les sources (`sign-in.mjs`, `cookies/index.mjs`) : le flag survit même à un défi 2FA, le hook interne du plugin `twoFactor` préservant explicitement le cookie `dontRememberMe` lors de la révocation de la session credential intermédiaire. Vérifié par 2 tests dans `auth-sessions.test.ts` inspectant directement l'en-tête `Set-Cookie`.

### 6. Injection HTML dans l'email de suppression de compte

**Fichier** : `apps/web/src/lib/email.ts` l. 166 — `${name}` interpolé sans échappement dans le HTML

`name` est totalement libre (`updateUser({name})`, aucune contrainte serveur). Impact limité : le destinataire est l'adresse de l'utilisateur lui-même. Les autres interpolations ne sont pas exploitables : `url` provient de better-auth, et `redirectTo`/`callbackURL` sont filtrés par la regex de `trusted-origins.mjs` l. 15 qui interdit `"` et `<`.

**Correctif** : une petite fonction `escapeHtml` sur `name`.

**Correctif appliqué** : fonction `escapeHtml` ajoutée dans `email.ts`, appliquée à `name` dans `sendAccountDeletedEmail` et `sendDeleteAccountVerificationEmail` (ce dernier introduit par le correctif du finding #4, qui portait la même faille). `url`, `oldEmail`/`newEmail` et `providerLabel` restent non échappés à dessein : générés par better-auth, validés comme adresses email, ou issus d'une table fixe de libellés — pas du texte libre. Vérifié par un nouveau fichier `tests/lib/email.test.ts` (mock du SDK Resend, pas de `@/lib/email` complet) confirmant qu'un nom contenant `<img src=x onerror=alert(1)>` ressort échappé dans le HTML envoyé.

---

## Notes (pas des vulnérabilités)

- **Absence de `middleware.ts`** : sans conséquence en l'état — la seule page protégée, `dashboard/page.tsx` l. 23-27, fait bien `auth.api.getSession` côté serveur puis `redirect`. `/bienvenue`, `/au-revoir`, `/compte-supprime`, `/erreur-connexion` et `/confidentialite` sont des pages publiques sans donnée sensible. Le risque est organisationnel : rien n'empêche d'oublier le garde sur la prochaine page. Un helper `requireSession()` partagé serait plus robuste qu'un middleware.
- **Points vérifiés et corrects** : cookies `httpOnly` + `sameSite: lax` + `secure` dérivé de `baseURL` https (`cookies/index.mjs` l. 30-38) ; CSRF/origine active par défaut via `originCheckMiddleware`, `callbackURL` validé contre `trustedOrigins` — pas d'open redirect ; aucun `$queryRaw`, aucun `dangerouslySetInnerHTML`, aucune server action non protégée ; cascades Prisma correctes sur `Session`/`Account`/`TwoFactor` ; aucun secret en dur (seul `.env.example` est suivi, avec placeholders) ; pas d'énumération de comptes (déjà testé, `auth-validation.test.ts`) ; le correctif `isAPIError` de `hooks.after` est bien en place.
- **Champs Prisma morts** : `twoFactor.failedVerificationCount` et `lockedUntil` (`schema.prisma` l. 109-110) ne sont alimentés par aucune option déclarée dans `auth.ts`. Un verrouillage de compte semble avoir été envisagé puis non câblé — à retirer ou à implémenter.

## Vulnérabilité connue, ouverte par choix informé

La faille Microsoft OAuth (`mapProfileToUser: () => ({ emailVerified: true })`, `auth.ts` l. 60, combinée à `allowDifferentEmails: true` l. 65) reste présente. Un correctif custom (flux de liaison "maison" indépendant du claim `email_verified`) avait été développé puis abandonné car il cassait le linking normal en usage réel. La voie la moins invasive documentée serait de passer `allowDifferentEmails: false`, au prix de la fonctionnalité correspondante (liaison de comptes ayant des emails différents).
