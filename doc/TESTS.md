# Stratégie de tests

> État actuel : **Vitest**, plus de 1 000 tests (composants, auth, administration), fichiers en série (`fileParallelism: false`), soit environ 25 minutes. En local ils tournent contre la **base Neon de développement** ; la CI GitHub Actions (§ 6) utilise une **branche Neon dédiée aux tests** (§ 5).

## 1. Niveaux

| Niveau | Outil | Ce qu'on teste | Où |
|---|---|---|---|
| Unitaire | Vitest | Moteur de paie, validations Zod, utilitaires (format NISS, n° d'entreprise, montants) | `tests/payroll`, `tests/lib` |
| Intégration | Vitest + base Neon de test | Routes d'API, Better Auth, autorisations, transactions, audit | `tests/lib`, `tests/api` |
| Composants | Vitest + Testing Library | Formulaires, tableaux, états vides, erreurs | `tests/components` |
| Bout en bout | Playwright (Chromium) | Parcours critiques complets dans un vrai navigateur | `tests/e2e` (à créer) |

## 2. Ce qui est obligatoire

1. **Moteur de paie** : les cas de référence de `modules/paie.md` § 6, au centime près. Aucun barème activé si un cas échoue.
2. **Isolation multi-tenant** : pour chaque route, un utilisateur d'un autre cabinet, un gestionnaire non assigné, une autre entreprise ou un autre collaborateur obtient `404` ; voir `PERMISSIONS.md`. Couvert aujourd'hui par `authz-scope.test.ts` (périmètres sur la vraie base), `authz-routes-*.test.ts` et les `rbac-*.test.ts` ; à étendre à chaque nouvelle route.
3. **Matrice des permissions** : test paramétré sur toutes les cases ✅ (`authz.test.ts` compare le catalogue de `lib/authz.ts` à `PERMISSIONS.md` et passe `authorize` sur les 51 actions × 5 rôles ; `authz-page.test.ts` pour les pages).
4. **Machine à états des fiches** : toutes les transitions permises réussissent, toutes les autres renvoient `409 INVALID_TRANSITION` ; une fiche `ENVOYEE` n'est jamais modifiée.
5. **Idempotence** : webhook Stripe rejoué, cron exécuté deux fois → aucun effet double.
6. **Intégrations** : contre l'implémentation simulée, y compris les cas de refus et d'anomalie.

## 3. Parcours de bout en bout (Playwright)

| # | Parcours |
|---|---|
| E1 | Inscription d'un cabinet → paiement (Stripe test) → tableau de bord |
| E2 | Le cabinet invite un gestionnaire → acceptation → création d'une entreprise et assignation → invitation de l'admin |
| E3 | Le gestionnaire crée deux salariés (DIMONA simulée acceptée) → ouvre la période → l'entreprise encode les prestations |
| E4 | Soumission → rejet avec motif → correction → validation → envoi → le salarié ouvre le lien, saisit le code, télécharge le PDF |
| E5 | Fiche rectificative d'une fiche envoyée |
| E6 | Paiement échoué → délai de grâce → suspension → portails clients en lecture seule |

## 4. Données de test

- Préfixes dédiés pour les données créées par les tests (`vitest-…`), nettoyées en fin de fichier (convention actuelle).
- Aucun vrai NISS : générateur de NISS **valides mais fictifs** (date de naissance + numéro de série + clé de contrôle).
- Seed de démonstration (`prisma/seed.mjs`) : un cabinet, deux gestionnaires, trois entreprises, une quinzaine de salariés, six mois d'historique de paie, pour les captures du rapport et la démonstration au jury.

## 5. Bases de données : développement, test, production

Trois **branches Neon** du même projet (une branche est une copie instantanée avec ses propres chaînes de connexion, recréable à tout moment) :

| Branche | Usage | Contenu | Chaîne utilisée par |
|---|---|---|---|
| `dev` | développement local et tests locaux | données de développement | `apps/web/.env.local` |
| `test` | intégration continue (§ 6) | schéma seul, les tests créent leurs données | secrets GitHub `TEST_DATABASE_URL` et `TEST_DATABASE_URL_UNPOOLED` |
| `production` | application déployée, à la mise en ligne | schéma seul, plus les plans de base | variables Vercel d'environnement *Production* |

- **Création** (console Neon) : *Branches* → *Create branch*, parent `dev`, option *schema-only* pour `test` et `production`, *Auto-delete* sur *Never* (sinon Neon supprimerait la branche et la CI casserait).
- **Schéma** : la CI applique `prisma migrate deploy` sur `test` avant les tests, elle suit donc les migrations du code testé. Si elle dérive, la supprimer et la recréer. La production, vide à sa création, recevra les migrations et le seed des plans à la mise en ligne (non automatisé : `vercel.json` ne lance aucune migration au déploiement).
- **Nettoyage des tests** : inchangé, par préfixe (`vitest-…`) en fin de fichier et dans `tests/global-setup.ts`. Tous les fichiers partagent la même base, d'où une seule exécution à la fois (voir `concurrency` au § 6). **Ne jamais lancer deux suites en parallèle sur la même base** : le nettoyage de l'une efface les comptes de l'autre.
- **En local**, les tests utilisent `.env.local`, donc la branche `dev`, tant que `vitest.config.ts` ne lit pas une URL de test dédiée.

## 6. Intégration continue

Workflow `.github/workflows/ci.yml` (GitHub Actions), déclenché sur les pull requests vers `dev` et `main`, sur les **push** vers `dev` et `main`, et à la demande (`workflow_dispatch`). Les fusions se faisant en local (`git merge` puis `git push`), le déclencheur `push` rejoue la suite après chaque fusion poussée ; il prévient mais ne peut pas bloquer.

| Job | Contenu | Secrets |
|---|---|---|
| `qualite` | `npm ci`, `npm run lint`, `npm run type-check` (environ 2 min) | aucun |
| `tests` | `npm ci`, `prisma migrate deploy`, `npm test -- --retry=1` sur la branche Neon `test` (environ 25 min, délai maximal 45 min) | `TEST_DATABASE_URL`, `TEST_DATABASE_URL_UNPOOLED` |

- **Un seul run de `tests` à la fois** (`concurrency: neon-test-db`, sans annulation) : la base de test est partagée et nettoyée par préfixe.
- **`--retry=1`** : un test intermittent connu (`stripe-webhook.test.ts`, qui passe seul) est relancé une fois avant d'échouer. À retirer quand il sera stabilisé.
- **Stripe, Resend, Google, Microsoft, Blob** : simulés ou factices dans les tests ; le workflow n'en fournit aucun vrai secret. Les valeurs factices (`sk_test_ci_factice`, `re_ci_factice`, etc.) sont écrites en clair dans le workflow.
- Les PR venues d'un **fork** ne lancent pas `tests` (pas de secrets).

**Mise en place côté GitHub** (une seule fois, par le propriétaire du dépôt) :
1. Créer la branche Neon `test` (§ 5) et récupérer ses deux chaînes de connexion : **poolée** (hôte `…-pooler…`) et **directe**.
2. *Settings → Secrets and variables → Actions → New repository secret* : `TEST_DATABASE_URL` (chaîne poolée) et `TEST_DATABASE_URL_UNPOOLED` (chaîne directe).
3. Vérifier avec *Actions → CI → Run workflow* sur `dev`.
4. Pour **bloquer** une fusion faite par pull request : *Settings → Branches → Add branch ruleset* sur `dev` et `main`, cocher « Require status checks to pass » et choisir `qualite` et `tests`. Sans pull request (fusion locale), rien ne bloque : seul le résultat du `push` renseigne.

**Reste à faire** : Playwright sur la preview Vercel (les tests `tests/e2e` n'existent pas encore) et un job de build Next.

## 7. Couverture visée

| Zone | Couverture |
|---|---|
| `lib/payroll` | 100 % des lignes, 100 % des cas de référence |
| `lib/authz.ts` et routes d'API | ≥ 90 % |
| Global | ≥ 80 % (objectif du cahier des charges) |
