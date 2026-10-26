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
| Migrations des dossiers salariés | `add_salarie` et `add_invitation_salarie` sont appliquées sur `dev` seulement | Les appliquer sur `production` avant la mise en ligne ; ajouter la variable `ENCRYPTION_KEY` sur Vercel, une clé différente par environnement (la **sauvegarder** : une clé perdue rend NISS et IBAN illisibles). La CI utilise une clé factice dans `ci.yml`, sans secret GitHub |
| Migration de conservation de la paie | `conservation_donnees_paie` (D94) passe dix clés étrangères en `Restrict` et ajoute `Cabinet.donneesPurgeesLe` : appliquée sur `dev` seulement | L'appliquer sur `production` avant la mise en ligne ; le premier passage du cron `purge-deleted-cabinets` purgera partiellement les cabinets déjà archivés depuis plus de 90 jours |
| Migrations du dossier salarié (D95, D96) | `situation_fiscale_salarie` (nouvelles colonnes fiscales, reprise des dossiers existants) et `heures_hebdo_en_minutes` (renomme et **convertit** les heures par semaine en minutes) sont appliquées sur `dev` seulement. La seconde n'est pas additive : le code et la base doivent changer **en même temps** | Les appliquer sur `production` dans l'ordre, au moment de déployer le code correspondant (aucun dossier n'y existe encore tant que la mise en ligne n'a pas eu lieu, donc aucune donnée à convertir) |

## 2. Tests et intégration continue

| Sujet | Constat | À faire |
|---|---|---|
| Durée | La suite complète prend environ 27 minutes (35 quand Neon est lent), fichiers en série sur une base partagée | Une base ou un schéma par processus pour paralléliser ; en attendant, ne **jamais** lancer deux suites en même temps (le nettoyage de l'une efface les comptes de l'autre) |
| Test instable | `stripe-webhook.test.ts` échoue de façon intermittente (il passe seul) ; des délais de 15 secondes sont parfois dépassés quand Neon est lent | Trouver la cause ; retirer ensuite `--retry=1` de la CI |
| Tests locaux | Ils tournent sur `dev` (via `.env.local`) | Faire lire à `vitest.config.ts` une `TEST_DATABASE_URL` en priorité |
| Couverture | Pas de test de bout en bout (Playwright), pas de job de build dans la CI | À ajouter au chantier de finitions |
| Avertissements de GitHub Actions | `actions/checkout@v4` et `actions/setup-node@v4` ciblent Node 20, que GitHub force déjà sur Node 24 ; `ubuntu-latest` bascule vers Ubuntu 26 (octobre 2026) | Monter les versions des actions quand une version Node 24 est publiée, et épingler la version d'Ubuntu si un comportement change |
| Tests dépendants de la base de dev | La CI sur une base vide a révélé des tests qui supposaient un SuperAdmin ou des identifiants Google et Microsoft déjà présents (corrigés : fixtures et variables factices) | Chaque nouveau test crée ses propres données, jamais celles de `dev` |
| Vérification manuelle | Les redirections des trois espaces (console SuperAdmin, Cabinet RH, Entreprise) et de `/profil` n'ont été testées qu'automatiquement | Naviguer à la main après chaque changement des gardes |
| Tests lents du gestionnaire | Chaque fichier `rbac-salaries-*.test.ts` crée plusieurs comptes réels : de 1 à 2 minutes par fichier | Fixtures partagées par fichier, ou une base par processus |

## 3. Code

| Sujet | Constat | À faire |
|---|---|---|
| `auth-hooks-after.ts` | Un seul hook de près de 300 lignes mêle suspension, archivage, portail, 2FA et création du cabinet | Le redécouper par préoccupation (refonte, pas un simple déplacement : tests de non-régression d'abord) |
| Périmètre typé | Les routes du Cabinet RH lisent encore `session.user.cabinetId as string` ; le `scope` renvoyé par `authorize` est prêt mais ne sert qu'aux chantiers du gestionnaire et de l'entreprise | Retirer les casts quand ces routes seront rouvertes à d'autres rôles |
| Noms de fichiers | La réorganisation de `lib/` n'a rien renommé : `cabinet/cabinet-audit.ts` répète son dossier | Supprimer le préfixe redondant dans un commit dédié |
| Invitations | La révocation et le renvoi (`invitations/[id]`) passent par `gestionnaire.inviter` pour tous les types d'invitation | Choisir l'action selon le type si les lignes de la matrice divergent |
| SuperAdmin | `cabinet.modifier-identite` est ouvert au SuperAdmin par la matrice, mais la route ne sert que le cabinet de la session | Chantier A4 de `roles/01` ; l'écran « Inviter un SuperAdmin » (seconde moitié de A2) reste à construire |
| Façade email | `email/email.ts` ré-exporte les trois fichiers d'envoi pour garder les mocks des tests | Règle : le code importe `@/lib/email/email`, jamais les sous-fichiers |
| Formatage | Plusieurs fichiers existants ne respectent pas Prettier (par exemple `api/invitations/*`, `lib/email/*`) : lancer `prettier --write` sur un dossier réécrit des fichiers sans rapport avec le changement | Un commit de formatage dédié, puis `prettier --check` dans la CI ; en attendant, ne formater que ses propres fichiers |
| Garde-fous à durcir en G2 | Corriger ou annuler une condition de travail, archiver un dossier ou changer la date d'entrée ne regardent pas encore les fiches de paie (elles n'existent pas) ; la sortie n'est pas verrouillée après l'envoi d'une DIMONA OUT | Refuser ces actions dès qu'une fiche ou une déclaration envoyée les concerne (D83, D85) |
| Dévoilement du NISS | Pas de limitation de débit : seul l'audit trace chaque appel | Limite par utilisateur si une alerte d'usage anormal est ajoutée |
| Rotation de la clé | Le format `v2` lie les valeurs à leur dossier (D97) et `npm run db:reencrypt` convertit les `v1`, mais **changer `ENCRYPTION_KEY`** n'a toujours pas de procédure : l'ancienne et la nouvelle clé doivent coexister le temps du rechiffrement | Script de rotation (deux clés, même parcours que `db:reencrypt`), avant la mise en production |
| Conversion des valeurs `v1` | Faite sur `dev` le 26/10/2026 (12 dossiers, 24 valeurs converties, aucune illisible ; contrôle : 0 valeur en `v1`). La branche `test` n'a rien à convertir (la CI crée et efface ses propres dossiers). **Production vérifiée le 26/10/2026 par `--dry-run` : 0 dossier**, donc rien à convertir ; tout ce qui s'y créera sera en `v2` | Refaire un `--dry-run` sur `production` juste avant la mise en ligne si des dossiers y ont été créés entre-temps ; s'il y a des valeurs `v1`, point de restauration Neon puis conversion réelle |
| Restitution avant purge | À la purge d'un cabinet, la paie est conservée 5 ans sans aucun accès (D94) et l'export du cabinet (D74) exclut volontairement la paie : l'employeur, responsable de traitement, ne récupère pas ses données | Prévoir une restitution à l'employeur (export de ses dossiers et fiches) avant la purge partielle, avec le chantier des fiches (G2b) |

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

## 6. Interface

| Sujet | Constat | À faire |
|---|---|---|
| shadcn/ui | Configuré (`components.json`, style `base-nova`, Base UI) mais **aucun composant installé** : tout le site (console, cabinet, gestionnaire) est en éléments HTML bruts, et les fenêtres modales sont faites à la main, sans fermeture par Échap, sans piège du focus ni retour du focus (`CONVENTIONS.md` § 5 demande la navigation au clavier) | Passage de tout le site sur shadcn, prévu par Adrien depuis `dev` |
| Barre de défilement | La barre native reste blanche en mode sombre (tableau des problèmes de l'import CSV) | `color-scheme` ou le composant de défilement de shadcn |
