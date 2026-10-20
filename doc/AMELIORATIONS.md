# Améliorations connues

> Dettes techniques, idées et points de vigilance repérés pendant le développement, **hors des chantiers du planning** (`ROADMAP.md`). Ce n'est pas un engagement : chaque ligne dit ce qui manque et pourquoi cela compte. À relire à la fin de chaque chantier.

## 1. Mise en production

| Sujet | Constat | À faire |
|---|---|---|
| Migrations | `vercel.json` ne lance aucune migration au déploiement : le schéma de `production` ne suit pas `dev` tout seul | Avant chaque promotion : `prisma migrate deploy` sur la branche `production` (chaînes dans un terminal temporaire, jamais dans `.env.local`) ; idéalement un script `db:migrate:prod` qui lit une variable dédiée |
| Ordre de la promotion | La promotion d'une prévisualisation la **reconstruit** avec les variables *Production* | 1. migrer `production` ; 2. vérifier les variables Vercel *Production* ; 3. promouvoir ; 4. vérifier qu'aucune variable de production ne contient la chaîne de `dev` |
| Branche Neon par défaut | L'intégration Vercel s'appuie sur la branche par défaut de Neon : la passer à `production` pourrait réécrire les variables de tous les environnements | Garder `dev` par défaut jusqu'à la mise en ligne, puis régler l'intégration proprement |
| Variables de l'intégration | `PG*` et `POSTGRES_*` (gérées par l'intégration Neon) restent sur tous les environnements, donc sur `dev`, alors que le code ne lit que `DATABASE_URL` et `DATABASE_URL_UNPOOLED` ; le badge « Needs Attention » n'a pas été expliqué | Les supprimer ou les séparer par environnement, comprendre le badge |
| Branche `test` | Une branche Neon *schema only* n'a pas l'historique des migrations : la première exécution de `migrate deploy` échoue | Vider le schéma (`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`) une fois, la CI applique ensuite les migrations |

## 2. Tests et intégration continue

| Sujet | Constat | À faire |
|---|---|---|
| Durée | La suite complète prend environ 27 minutes (35 quand Neon est lent), fichiers en série sur une base partagée | Une base ou un schéma par processus pour paralléliser ; en attendant, ne **jamais** lancer deux suites en même temps (le nettoyage de l'une efface les comptes de l'autre) |
| Test instable | `stripe-webhook.test.ts` échoue de façon intermittente (il passe seul) ; des délais de 15 secondes sont parfois dépassés quand Neon est lent | Trouver la cause ; retirer ensuite `--retry=1` de la CI |
| Tests locaux | Ils tournent sur `dev` (via `.env.local`) | Faire lire à `vitest.config.ts` une `TEST_DATABASE_URL` en priorité |
| Couverture | Pas de test de bout en bout (Playwright), pas de job de build dans la CI | À ajouter au chantier de finitions |
| Vérification manuelle | Les redirections des trois espaces (console SuperAdmin, Cabinet RH, Entreprise) et de `/profil` n'ont été testées qu'automatiquement | Naviguer à la main après chaque changement des gardes |

## 3. Code

| Sujet | Constat | À faire |
|---|---|---|
| `auth-hooks-after.ts` | Un seul hook de près de 300 lignes mêle suspension, archivage, portail, 2FA et création du cabinet | Le redécouper par préoccupation (refonte, pas un simple déplacement : tests de non-régression d'abord) |
| Périmètre typé | Les routes du Cabinet RH lisent encore `session.user.cabinetId as string` ; le `scope` renvoyé par `authorize` est prêt mais ne sert qu'aux chantiers du gestionnaire et de l'entreprise | Retirer les casts quand ces routes seront rouvertes à d'autres rôles |
| Noms de fichiers | La réorganisation de `lib/` n'a rien renommé : `cabinet/cabinet-audit.ts` répète son dossier | Supprimer le préfixe redondant dans un commit dédié |
| Invitations | La révocation et le renvoi (`invitations/[id]`) passent par `gestionnaire.inviter` pour tous les types d'invitation | Choisir l'action selon le type si les lignes de la matrice divergent |
| SuperAdmin | `cabinet.modifier-identite` est ouvert au SuperAdmin par la matrice, mais la route ne sert que le cabinet de la session | Chantier A4 de `roles/01` ; l'écran « Inviter un SuperAdmin » (seconde moitié de A2) reste à construire |
| Façade email | `email/email.ts` ré-exporte les trois fichiers d'envoi pour garder les mocks des tests | Règle : le code importe `@/lib/email/email`, jamais les sous-fichiers |

## 4. Emails

| Sujet | Constat | À faire |
|---|---|---|
| Premier mot de passe du SuperAdmin | Le script envoie le modèle « Réinitialisez votre mot de passe », peu adapté à une première définition | Un modèle « Bienvenue, définissez votre mot de passe » |
| Échec d'envoi non visible | Better Auth envoie les emails de réinitialisation en arrière-plan : la route `reset-password` du SuperAdmin confirme la demande du lien, pas sa livraison | Surveiller via les journaux de Resend ; revoir si Better Auth permet d'attendre l'envoi |

## 5. Documentation

| Sujet | Constat |
|---|---|
| Anciens chemins | `DECISIONS.md`, `JOURNAL.md` et `analysis/` citent encore les chemins de `lib/` d'avant la réorganisation : volontairement conservés, car ils décrivent l'état du moment |
| Source des identifiants | Les identifiants d'actions de `PERMISSIONS.md` sont vérifiés contre le catalogue de `lib/authz/authz.ts` par `authz.test.ts` : toute nouvelle action s'ajoute aux deux |
