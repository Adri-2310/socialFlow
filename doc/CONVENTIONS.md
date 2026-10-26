# Conventions de développement

> Règles de forme pour tout le code de SocialFlow. Les règles de fond (métier, sécurité) sont dans `DECISIONS.md`, `PERMISSIONS.md` et les fiches de rôles et de modules.

## 1. Git

| Règle | Détail |
|---|---|
| Branches | `main` = production (Vercel Production) · `dev` = intégration (Vercel Preview) · `feature/<sujet>` partie de `dev` |
| Une branche = un chantier | Ex. `feature/entreprises`, `feature/moteur-paie`, `feature/dimona` |
| Fusion | `feature/*` → `dev` par pull request quand les tests passent ; `dev` → `main` à chaque jalon stable |
| Messages de commit | En français, au présent, verbe d'action en tête, sans point final : « Ajoute la page Gestionnaires », « Corrige la restauration d'un plan… » |
| Taille | Un commit = un changement cohérent qu'on peut expliquer en une phrase |
| Interdits | Commiter `.env*` (hors `.env.example`), des secrets ou des données réelles de salariés |

## 2. Organisation du code (`apps/web/src`)

```
app/
  (marketing)/   pages publiques
  (auth)/        connexion, inscription, invitations
  dashboard/
    admin/  cabinet/  gestionnaire/  entreprise/  collaborateur/
  api/
    <ressource>/route.ts          ex. api/entreprises/route.ts
    <ressource>/[id]/route.ts
    <ressource>/[id]/<action>/route.ts   ex. api/fiches/[id]/valider
    webhooks/stripe/route.ts
    cron/<tache>/route.ts
components/
  <domaine>/     admin, cabinet, gestionnaire, entreprise, collaborateur, auth, layout
  ui/            shadcn/ui (ne pas modifier à la main, régénérer)
lib/
  prisma.ts, utils.ts, countries.ts, role-labels.ts   transverses, à la racine
  auth/         Better Auth (auth.ts, auth-client.ts, require-session.ts), comptes, script du premier SuperAdmin
  authz/        authz.ts (matrice et périmètre), authz-page.ts (pages), api-guard.ts, cron-auth.ts
  billing/      abonnement, plans et quotas, Stripe (checkout, prix, webhook), délai de grâce
  cabinet/      données, audit, alertes, export, identité, suspension, rétention du cabinet
  branding/     couleurs, logo (validation, image, stockage), marque du cabinet
  email/        envoi (email.ts), gabarit, modèles modifiables, marque des emails
  portal/       portail de connexion du cabinet (adresse, garde, application installable)
  entreprise/   entreprises clientes, administrateur d'entreprise
  invitations/  création, acceptation, aperçu
  admin/        lectures de la console SuperAdmin (admin-data.ts)
  payroll/      moteur de paie (fonctions pures) — à venir
  integrations/ dimona, dmfa, exact, belcotax — à venir
  Les lectures filtrées par périmètre (`*-data.ts`) vivent dans le dossier de leur domaine, par exemple `cabinet/cabinet-data.ts`.
tests/               miroir de src/ : tests/lib, tests/components, tests/payroll
```

## 3. Routes d'API

Ordre obligatoire dans chaque Route Handler :

1. **Session** : `auth.api.getSession` → sinon `401 UNAUTHORIZED`.
2. **Autorisation** : `authorize(request, '<action>')` (`lib/authz/authz.ts`, identifiants dans `PERMISSIONS.md`) → sinon `401`, `403 FORBIDDEN`, `403 TWO_FACTOR_REQUIRED` ou `423`. La route lit ensuite ses données avec le `scope` renvoyé : une ressource hors périmètre répond `404`.
3. **Validation** du corps et des paramètres avec **Zod** → sinon `400` avec le code précis.
4. **Règles métier** (statut, quota, plan) → `409`, `403 QUOTA_EXCEEDED`, `403 PLAN_FEATURE_UNAVAILABLE`, `423`.
5. **Écriture** dans une transaction Prisma si plusieurs tables sont touchées.
6. **Audit** dans la même transaction.
7. Réponse JSON.

Format d'erreur unique : `{ "error": "CODE_EN_MAJUSCULES" }`, plus des champs optionnels (`details`, `quota`, `items`). Les messages lisibles sont produits par l'interface à partir du code, en français.

### Catalogue des codes d'erreur

| HTTP | Code | Sens |
|---|---|---|
| 400 | `INVALID_REQUEST`, `INVALID_<CHAMP>`, `REJECTION_REASON_REQUIRED` | Données invalides |
| 401 | `UNAUTHORIZED` | Pas de session |
| 403 | `FORBIDDEN` | Rôle non autorisé |
| 403 | `TWO_FACTOR_REQUIRED` | 2FA obligatoire non activée (SuperAdmin) |
| 403 | `QUOTA_EXCEEDED` | Quota du plan atteint (`quota` précisé) |
| 403 | `PLAN_FEATURE_UNAVAILABLE` | Fonctionnalité absente du plan |
| 404 | `<RESSOURCE>_NOT_FOUND` | Inexistant **ou hors périmètre** |
| 409 | `INVALID_TRANSITION` | Changement de statut non permis |
| 409 | `<RESSOURCE>_ALREADY_<ETAT>`, `EMAIL_ALREADY_USED`, `INVITATION_ALREADY_PENDING` | Conflit d'état |
| 409 | `GESTIONNAIRE_HAS_UNCOVERED_ENTREPRISES` | Désactivation impossible (D27) |
| 404 | `INVITATION_NOT_FOUND`, `GESTIONNAIRE_NOT_FOUND` | Inexistant ou hors périmètre |
| 409 | `INVITATION_ALREADY_ACCEPTED`, `INVITATION_ALREADY_REVOKED`, `GESTIONNAIRE_ALREADY_SUSPENDED`, `GESTIONNAIRE_ALREADY_ACTIVE` | Conflit d'état |
| 403 | `SUSPENDED_BY_ADMIN` | Suspension posée par le SuperAdmin, non levable par le cabinet (D52) |
| 403 | `RESTORE_NOT_ALLOWED` | Compte non retiré par le cabinet (auto-suppression, archivage SuperAdmin) (D52) |
| 409 | `RESTORE_WINDOW_EXPIRED` | Délai de restauration de 30 jours dépassé (D52) |
| 400 | `EMAIL_UNCHANGED` | Nouvelle adresse identique à l'actuelle (D53) |
| 423 | `PRESTATIONS_LOCKED`, `CABINET_READ_ONLY` | Ressource verrouillée ; `CABINET_READ_ONLY` : cabinet en impaye ou resilie (D29). Toute action d'écriture d'un rôle rattaché à un cabinet porte `write: true` dans le catalogue de `lib/authz/authz.ts`, et `authorize` renvoie ce `423` |
| 502 | `EMAIL_SEND_FAILED`, `<INTEGRATION>_UNAVAILABLE` | Service externe en échec |

Codes existants à conserver tels quels : `CABINET_NOT_FOUND`, `CABINET_ARCHIVED`, `USER_ARCHIVED`, `CANNOT_SUSPEND_SUPER_ADMIN`, `CANNOT_REVOKE_SUPER_ADMIN`, `CANNOT_RESET_SUPER_ADMIN`, `INVALID_STATUS`, etc.

## 4. Base de données (Prisma)

- Tables en `snake_case` via `@@map`, modèles en `PascalCase`, champs en `camelCase`.
- Identifiants : `cuid()`.
- Statuts : chaînes en MAJUSCULES sans accent pour les nouveaux modèles (`A_VALIDER`) ; les statuts existants en minuscules (`actif`, `suspendu`) restent inchangés.
- Montants : `Int` en centimes. Dates de paie : `annee` + `mois` en `Int`.
- Soft-delete : `deletedAt DateTime?`, toujours indexé ; toutes les lectures filtrent `deletedAt: null` sauf écrans d'archives.
- Toute table métier porte `cabinetId` (même si déductible par jointure), indexé, pour le filtrage et l'audit.
- Données sensibles (NISS, IBAN, secrets d'intégration) : chiffrement applicatif AES-256-GCM, clé dans `ENCRYPTION_KEY`. Format `v2:<iv>:<tag>:<chiffré>` avec des **données associées** : la valeur est liée à son dossier et à son champ (`lib/salarie/salarie-crypto.ts`, D97). Toute nouvelle donnée chiffrée définit son contexte ; le format `v1` (sans contexte) n'est plus écrit.
- Migrations : `prisma migrate dev` en local, nommées en anglais court (`add_entreprise`) ; jamais de modification d'une migration déjà poussée.

## 5. Front-end

- Server Components par défaut ; `'use client'` seulement pour l'interactivité.
- Pages protégées : `requireAuthorized('<action>')` (`lib/authz/authz-page.ts`) en tête du layout de chaque espace **et de chaque page** (un layout n'est pas ré-exécuté à chaque navigation).
- Formulaires : validation côté client avec le même schéma Zod que l'API (schéma partagé dans `lib/schemas/`).
- Textes de l'interface en **français** ; montants formatés `fr-BE` en euros ; dates `JJ/MM/AAAA`.
- Accessibilité : labels sur chaque champ, navigation clavier, contraste AA (vérifié aussi pour le branding des cabinets).
- Composants shadcn/ui et Base UI existants avant toute création.

## 6. Style de code

- TypeScript strict, pas de `any` (sauf justification commentée).
- Prettier : guillemets simples, point-virgule, virgule finale, 2 espaces, 100 colonnes (`.prettierrc.json`).
- ESLint sans avertissement avant commit : `npm run lint`, `npm run type-check`, `npm test`.
- Commentaires en français, expliquant **pourquoi** et non ce que fait la ligne ; renvoyer à la décision concernée (`// D27 : réassignation obligatoire`).
- Pas de nouvelle dépendance sans raison notée dans le commit ou le `JOURNAL.md`.

## 7. Variables d'environnement

Toute nouvelle variable est documentée dans `.env.example` (rôle, où l'obtenir, exemple factice) et ajoutée sur Vercel pour chaque environnement concerné.

## 8. Définition de « terminé » pour un chantier

- [ ] Fonctionnalités conformes à la fiche de rôle ou de module concernée.
- [ ] Autorisations conformes à `PERMISSIONS.md`, avec tests d'isolation.
- [ ] Toute nouvelle action est ajoutée au catalogue de `lib/authz/authz.ts` **et** à `PERMISSIONS.md` (colonne « Identifiant ») : `authz.test.ts` compare les deux.
- [ ] Tests unitaires et d'intégration qui passent (`npm test`), lint et types sans erreur.
- [ ] Audit écrit pour chaque action sensible.
- [ ] `.env.example`, `DECISIONS.md` (si nouvelle décision) et la fiche concernée mis à jour (sections « Existant » et « À construire »).
- [ ] Entrée ajoutée dans `JOURNAL.md`.
- [ ] Relu et compris de bout en bout par Adrien.
