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
| shadcn/ui | Tout le site (console, cabinet, gestionnaire, entreprise, compte, authentification, site public) est migré sur shadcn/ui (`base-nova`, Base UI) et sur les composants partagés de `components/shared/` ; les règles sont dans `CONVENTIONS.md` § 5 et le test `tests/conventions/elements-artisanaux.test.ts` interdit tout nouvel élément écrit à la main | Rien : la migration est terminée, voir les lignes ci-dessous pour ce qui reste |
| Exception : `global-error.tsx` | `app/global-error.tsx` garde son `<button>` et ses classes en dur : il remplace le layout racine, donc `globals.css` et les variables CSS n'y sont pas garanties | Aucune. Seule exception autorisée par le test de convention |
| Modale de suspension d'un cabinet | Son icône reste en teinte primaire : `FormDialog` n'a pas de ton (`danger`) | Ajouter un ton au composant partagé si une deuxième modale destructrice en a besoin ; pas pour un seul écran |
| `cabinets-table.tsx` | 375 lignes, au-dessus de la cible de 300 (sous la limite de 500) | Extraire les colonnes dans un fichier voisin à la prochaine modification de la liste |
| Aperçu du branding | Les pastilles de prévisualisation de `branding-form` restent écrites à la main : ce sont des échantillons de couleur, pas des commandes | Aucune, sauf si l'aperçu devient interactif |
| `DataTable` sans en-tête collant | Le tableau de l'import CSV (long) perd son en-tête au défilement | Option `stickyHeader` sur `DataTable` |
| Teintes de `Notice` | Les tons reprennent les règles D62 (émeraude et ambre 800, `destructive-text`) : quelques bandeaux ont une teinte légèrement différente de leur ancien rendu | Aucune : voulu, à signaler lors de la relecture visuelle |
| Libellé du MRR | La tuile de `facturation-abonnements.tsx` écrit « N abonnements actifs » alors que N compte aussi les abonnements en essai (`trialing`), et le pluriel suit le nombre total de lignes, pas N | Écrire « actifs ou en essai » et accorder le pluriel sur N |
| Lighthouse | Mesuré le 28/10/2026 sur `/`, `/tarifs` et `/faq` en mode développement : accessibilité 100, bonnes pratiques 100, SEO 100. La performance (90 à 92) n'est pas représentative : un serveur `next dev` compile à la volée | Refaire la mesure sur `next build` + `next start` avant la mise en ligne |
| Vérification visuelle non faite | Le tiroir mobile du tableau de bord, le menu mobile du site public et les écrans SuperAdmin (facturation, suspension, listes, plans) n'ont été vérifiés que par les tests ; la fenêtre du navigateur de l'assistant ne se redimensionne pas | Les passer à la main avec `VERIFICATION-INTERFACE.md` |
| Barre de défilement | La barre native reste blanche en mode sombre (tableau des problèmes de l'import CSV) | `color-scheme` ou le composant de défilement de shadcn |

## 7. Moteur de paie

Le moteur v1 (D99 à D120) est une **version simplifiée pour le TFE** : son périmètre et ses simplifications sont dans `modules/paie.md` § 10 (D120), les écarts techniques détaillés au § 9. Ces points restent ouverts.

| Sujet | Constat | À faire |
|---|---|---|
| Veille des sources | La mise à jour des barèmes reste manuelle (`modules/paie.md` § 5) | Écrire le job hebdomadaire de veille (chantier F, D51) ; Adrien se réserve de le faire et de vérifier toutes les informations |
| Cas de référence | Une seule série (8 cas, octobre 2026, simulateur externe) ; BE-2026-09 et BE-2026-11 ne sont pas activables | Refaire la série pour le 01/11/2026 et avec le calculateur du SPF Finances ; ajouter les cas du n° 6 (conjoint avec revenus) |
| Couverture des cas de référence | Temps partiel, entrée ou sortie en cours de mois, salaire garanti, heures supplémentaires et double pécule n'ont aucun cas externe : leurs calculs sont testés à la main | Ajouter des cas dès qu'une source externe existe (fiche réelle anonymisée, secrétariat social) |
| Fonds de fermeture et « index centime » | Non calculés (D117) | Les implémenter si le jury ou un cas réel le demande |
| Colonnes obsolètes | `conjointAvecRevenus` et `personnesCharge` ne servent plus (D95) | Les supprimer par une migration, avec l'accord d'Adrien |
| Formulaire de la question d'attribution | Correctif noté à la relecture du formulaire de la situation fiscale (D95) | À reprendre lors du chantier de l'interface du gestionnaire |
| `next-env.d.ts` | Fichier généré suivi par git ; masqué localement par `skip-worktree` | Ajouter à `.gitignore` et `git rm --cached` (accord d'Adrien attendu) |
| Mise en production | La migration `add_bareme_version` et le semis des barèmes ne sont appliqués que sur `dev` | À la fin : `prisma migrate deploy` sur `production`, puis `npm run db:seed:bareme` ; les versions restent `A_VERIFIER` jusqu'à leur activation |
| Évolutions possibles du moteur (D120) | Pécule de vacances (double pécule, pécule de sortie), allocations exceptionnelles du n° 53 (primes de fin d'année et ponctuelles, indemnités de maladie au n° 78.1), reprise des cumuls d'un salarié déjà en poste, fonds de fermeture et « index centime », rechute des CCT à quatorze jours | Les ajouter si un besoin réel le demande : chacun nécessite une décision, un texte officiel déposé et des cas de référence externes |
