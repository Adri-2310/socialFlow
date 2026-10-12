# Stratégie de tests

> État actuel : **Vitest**, environ 170 tests (composants, auth, administration), exécutés contre la **base Neon de développement**, fichiers en série (`fileParallelism: false`). Pas de CI (`.github/` absent).

## 1. Niveaux

| Niveau | Outil | Ce qu'on teste | Où |
|---|---|---|---|
| Unitaire | Vitest | Moteur de paie, validations Zod, utilitaires (format NISS, n° d'entreprise, montants) | `tests/payroll`, `tests/lib` |
| Intégration | Vitest + base Neon de test | Routes d'API, Better Auth, autorisations, transactions, audit | `tests/lib`, `tests/api` |
| Composants | Vitest + Testing Library | Formulaires, tableaux, états vides, erreurs | `tests/components` |
| Bout en bout | Playwright (Chromium) | Parcours critiques complets dans un vrai navigateur | `tests/e2e` (à créer) |

## 2. Ce qui est obligatoire

1. **Moteur de paie** : les cas de référence de `modules/paie.md` § 6, au centime près. Aucun barème activé si un cas échoue.
2. **Isolation multi-tenant** : pour chaque route, un utilisateur d'un autre cabinet, un gestionnaire non assigné, une autre entreprise ou un autre collaborateur obtient `404` ; voir `PERMISSIONS.md`.
3. **Matrice des permissions** : test paramétré sur toutes les cases.
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

## 5. Base de test

Proposition : une **branche Neon dédiée aux tests** (copie de la base de dev), pour que les tests ne touchent jamais les données de développement et puissent tourner en parallèle plus tard.

## 6. Intégration continue (à mettre en place)

GitHub Actions sur chaque pull request vers `dev` et `main` : installation, `lint`, `type-check`, `test` (avec les secrets de la branche Neon de test), puis Playwright sur la preview Vercel. Fusion bloquée si un job échoue.

## 7. Couverture visée

| Zone | Couverture |
|---|---|
| `lib/payroll` | 100 % des lignes, 100 % des cas de référence |
| `lib/authz.ts` et routes d'API | ≥ 90 % |
| Global | ≥ 80 % (objectif du cahier des charges) |
