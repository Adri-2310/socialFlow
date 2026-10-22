# Journal de développement

> Une entrée par chantier ou par décision importante. Objectif : garder la trace de **ce qui a été décidé, contrôlé et corrigé, par qui et pourquoi**. Ce journal sert de matière au rapport du TFE (chapitres « Analyse », « Réalisation » et « Évaluation du travail »).
> Outils : le code est produit avec l'assistance d'outils d'IA (Claude Code), usage autorisé par le promoteur. Les décisions d'analyse, l'architecture, la revue et la validation sont faites par Adrien.

## Modèle d'entrée

```
## AAAA-MM-JJ — <chantier ou sujet>

**Objectif** : …
**Décisions prises** : Dxx, Dyy (voir DECISIONS.md) ; justification en une ligne chacune
**Réalisé** : … (branche, principaux fichiers)
**Contrôlé / corrigé par moi** :
- <ce que j'ai relu, testé, refusé ou fait corriger, et pourquoi>
**Écrit à la main** : <parties codées personnellement, le cas échéant>
**Tests** : <nombre, ce qu'ils couvrent, résultat>
**Difficultés et apprentissages** : …
**Reste à faire** : …
```

---

## 2026-10-12 — Analyse complète et refonte de la documentation

**Objectif** : remplacer des documents d'analyse contradictoires (prix, hébergement, authentification, vocabulaire des rôles, cycle des fiches) par une documentation unique et fiable avant de développer les portails métier.

**Constats de départ**
- 5 documents d'analyse et environ 190 diagrammes UML incohérents entre eux : prix 99/299 € contre 150/300/750 €, Vercel contre Coolify, JWT maison contre Better Auth, anciens noms de rôles dans les UML.
- `PLANNING.md` arrêté en juillet, alors que l'authentification et la console SuperAdmin étaient terminées.
- Défauts trouvés dans le code existant : essai Stripe créé sans moyen de paiement, plan stocké sur l'utilisateur au lieu du cabinet, jeton d'invitation en clair en base, absence de webhook Stripe.

**Décisions prises** : D1 à D49. Points marquants :
- Cabinet RH en rôle de pilotage uniquement (D3) : séparation nette entre pilotage commercial et production de la paie.
- Validation obligatoire des fiches par l'employeur, rejet motivé, envoi par le gestionnaire (D9 à D11).
- Fiches transmises par lien sécurisé avec code à usage unique, sans pièce jointe (D12, D43) : donnée sensible.
- Fiche envoyée jamais modifiée, correction par rectificative (D13) : traçabilité légale.
- SuperAdmin sans accès aux données de paie (D8) : minimisation RGPD.
- Plans et prix repris du cahier des charges client (D34).

**Réalisé** : nouvelle documentation dans `doc/` (décisions, fonctionnement, 5 rôles, 6 modules, permissions, conventions, tests, RGPD, feuille de route) et `CLAUDE.md` à la racine. Anciens documents déplacés dans `doc/archive/` ; cahier des charges client dans `doc/reference/`.

**Reste à faire** :
- Trancher les points ouverts listés dans `doc/README.md`.
- Télécharger la documentation officielle DIMONA et DmfA ; créer le compte Exact Online.
- Décision complémentaire D50 : DIMONA, DmfA et C4 simulées à partir de la documentation officielle publique (accès réel hors de portée du TFE) ; Exact Online reste réel.
- Mettre à jour les commentaires du code qui citent encore `doc/analysis/ARCHITECTURE_SOCIALFLOW_RBAC.md`, `SPEC_FINAL.md` ou `doc/analysis/PRD_CLIENT.md` (`lib/auth.ts`, `api/admin/cabinets/[id]`, `api/invitations`, `dashboard/page.tsx`, `prisma/seed.mjs`, `prisma/schema.prisma`) : remplacer par les nouveaux chemins.

---

## 2026-10-18 — Fin du chantier Cabinet RH : portefeuille, comptes, portail de connexion

**Objectif** : terminer tout ce que le Cabinet RH peut faire sans les modules de paie, et fixer les règles de création de compte et de connexion des autres rôles avant de commencer le Gestionnaire RH.

**Décisions prises** : D69 à D78 (voir DECISIONS.md).
- D69-D70 : portefeuille d'entreprises et invitation de l'administrateur, un seul par entreprise (D5).
- D71 : suspension du cabinet en lecture seule par défaut, blocage total optionnel et motivé (un cabinet suspendu garde l'accès à ses données).
- D72-D73 : emails de compte à la marque du cabinet pour les rôles invités ; invitation, sans cabinet « fantôme », plan porté par le cabinet.
- D74-D75 : export JSON des données, disponible en lecture seule ; quotas du plan visé appliqués dès la programmation d'un downgrade.
- D76-D77 : seul le Cabinet RH crée un compte sur le site ; les autres créent le leur par invitation, avec un mot de passe, et se connectent par un portail aux couleurs de leur cabinet ; application installable au nom du cabinet, sans service worker (rien n'est conservé hors ligne).
- D78 : remplacement de l'administrateur sans période sans administrateur.

**Réalisé** : branche `feature/cabinet-rh` (et fusion de `feature/dashboard`, renommée `feature/superadmin`). Portail de connexion (`Cabinet.slug`, contrôle du portail dans le hook d'authentification, liaison Google/Microsoft volontaire seulement), pages de mot de passe oublié du portail, manifeste et icône par cabinet, accueil et profil à la marque du cabinet, email de bienvenue et écran d'accueil après l'acceptation, remplacement de l'administrateur (`Invitation.replacesAdminId`), migrations additives appliquées avant le code qui les lit.

**Contrôlé / corrigé par moi**
- J'ai refusé l'acceptation d'une invitation par Google ou Microsoft (C4), proposée à tort : seul le Cabinet RH crée un compte sur le site, les invités passent par leur portail. Retrait du code, D73 corrigée par D76.
- Tests manuels des connexions Google et Microsoft : un cookie de portail resté 10 minutes faisait refuser le SuperAdmin sur `/login` (corrigé : la page de SocialFlow l'efface).
- Test manuel du remplacement d'un administrateur : la page d'acceptation affichait « invitation invalide » aux couleurs de SocialFlow, car l'aperçu n'avait pas reçu la règle D78 (corrigé : une seule règle partagée par l'aperçu et l'acceptation, avec test).

**Tests** : suite complète du 18/10 : 1041 tests sur 1042 verts ; le seul échec était un test périmé (`User.plan` supprimé), corrigé. Nouveaux tests : portail et refus de `/login`, manifeste et icône, formulaires du portail, remplacement d'administrateur (propriétés d'isolation comprises : gestionnaire non assigné ou d'un autre cabinet = 404), email à l'ancien administrateur.

**Difficultés et apprentissages**
- Better Auth lie par défaut un compte social à un compte de même adresse : désactivé (`disableImplicitLinking`), la liaison reste possible depuis le profil.
- Les tests partagent la base Neon : deux lancements simultanés se polluent mutuellement. La suite se lance seule, sans autre activité sur la base.
- Une règle métier écrite à deux endroits (aperçu de l'invitation, acceptation) finit par diverger : elle vit désormais dans une seule fonction.

**Reste à faire** : PDF à la marque, compteurs de fiches par entreprise, blocage du numéro d'entreprise dès qu'une fiche existe, échéances ONSS, modèles d'emails des fiches, white-label Enterprise ; fusion de la branche vers `dev`. Puis le rôle Gestionnaire RH.

---

## 2026-10-20 — Correctifs d'audit : autorisations centralisées, CI et réorganisation du code

> **BROUILLON — à relire et à compléter par moi.** Les points marqués « ? » sont ceux dont je dois confirmer ou écrire ma part.

**Objectif** : corriger les points relevés à l'audit du code avant d'ouvrir les portails métier : couleurs du thème injectées telles quelles dans une feuille de style, console SuperAdmin accessible sans 2FA, contrôles de rôle écrits à la main dans chaque route et chaque page, premier SuperAdmin sans procédure, aucune intégration continue, dossier `lib/` à plat de 67 fichiers.

**Décisions prises** : D79 (trois bases Neon `dev`, `test`, `production`, pour que les tests ne touchent jamais aux données de développement ni à la production) ; D80 (autorisations centralisées : une seule matrice dans le code, comparée au document, pour qu'aucune route ne contrôle un rôle « à la main »). Appliquent D18 (premier SuperAdmin par script), D20 (2FA obligatoire du SuperAdmin), D21 (outils de support sans jamais voir ni fixer un mot de passe) et D78.

**Réalisé** : branche `feature/correctifs-audit`, une vingtaine de commits en français, regroupés par étape présentée et validée avant d'être codée.
- Revalidation des couleurs du thème au rendu (défense en profondeur contre l'injection CSS).
- Routes d'administration sur une garde commune, puis 2FA obligatoire du SuperAdmin pour les routes et les pages.
- Outils de support du SuperAdmin : révocation des sessions et lien de réinitialisation, avec audit.
- Script `superadmin:create` : compte créé sans mot de passe, lien de définition envoyé par email, refus si un SuperAdmin existe déjà (sauf `--force`).
- CI GitHub Actions (`lint`, types, tests sur la branche Neon `test`) ; trois branches Neon ; production initialisée (migrations, 3 plans, SuperAdmin).
- Autorisations : catalogue de 51 actions comparé à `PERMISSIONS.md`, `authorize` pour 41 gestionnaires de routes, `requireAuthorized` pour 19 pages et layouts (dont une garde propre sur chaque page de la console, qui n'en avait pas), périmètre de données par rôle.
- `lib/` rangé en 10 dossiers par domaine (63 fichiers déplacés avec `git mv`, historique conservé), tests rangés pareil ; `email.ts` découpé en quatre fichiers et les hooks de `auth.ts` extraits (574 lignes, devenues 197).

**Contrôlé / corrigé par moi**
- J'ai validé chaque plan avant qu'il soit codé ; les déplacements de fichiers sont dans des commits séparés des changements de logique. ?
- La matrice des permissions disait que le gestionnaire ne peut pas inviter l'administrateur d'une entreprise, alors que D78 l'autorise à le **remplacer** : j'ai validé l'ajout de lignes distinctes (`entreprise.remplacer-admin` ouverte au gestionnaire, `entreprise.inviter-admin` non) plutôt que de contourner l'écart. ?
- J'ai validé d'ajouter une garde à chaque page de la console, protégées jusque-là par le seul layout. ?
- J'ai décidé de ne lancer la suite complète (27 minutes) qu'à la fin du chantier, avec des tests ciblés à chaque commit. ?
- Autres relectures, refus ou corrections de ma part : ?

**Écrit à la main** : ?

**Tests** : 2203 tests dans 104 fichiers au dernier décompte. Nouveaux : la matrice des permissions (catalogue contre document, toutes les actions pour les cinq rôles), le périmètre de données sur la vraie base (un gestionnaire ne voit que ses entreprises assignées et non archivées, étanchéité entre cabinets), chaque route et chaque page appelle l'action prévue, le script du premier SuperAdmin, la 2FA du SuperAdmin. Des mutations volontaires (une mauvaise action, une garde retirée) vérifient que ces tests échouent bien. **Suite complète finale : à renseigner après le dernier lancement.**

**Difficultés et apprentissages**
- Les tests partagent une seule base Neon : deux lancements en parallèle font échouer l'un des deux, parce que le nettoyage de fin supprime les comptes de test de l'autre. J'ai fait cette erreur pendant le chantier ; la règle est désormais de ne lancer qu'une suite à la fois.
- Une branche Neon « schéma seul » n'a pas l'historique des migrations : il faut vider son schéma une fois avant que `prisma migrate deploy` fonctionne.
- Un `vi.mock` dont le chemin n'est plus à jour ne provoque aucune erreur de compilation : un script a contrôlé que chacune des 691 chaînes `@/lib/…` pointe vers un fichier existant avant la réorganisation de `lib/`.
- Une attribution erronée d'une constante entre deux hooks a été attrapée immédiatement par le compilateur ; l'extraction a été refaite depuis Git.
- Un script lancé sous Windows plantait à la sortie (`process.exit` pendant que les sockets se ferment) : corrigé.

**Reste à faire** : lancer la suite complète une dernière fois, vérifier à la main les redirections des trois espaces et de `/profil`, pousser `dev` (premier lancement de la CI), vider le schéma de la branche `test`, puis ouvrir Gestionnaire RH (1). Dettes et idées : voir `AMELIORATIONS.md`.

---

## 2026-10-23 — Gestionnaire RH (1) : les dossiers salariés

> **BROUILLON — à relire et à compléter par moi.** Les points marqués « ? » sont ceux dont je dois confirmer ou écrire ma part.

**Objectif** : donner au gestionnaire RH tout ce qui touche au dossier d'un salarié, sans encore calculer de paie : l'espace de travail, la création, la modification, les conditions de travail datées, la sortie et l'archivage, l'import CSV, et l'invitation au portail du salarié. Les données sensibles (NISS, IBAN) devaient être protégées dès la première ligne de code, et le Cabinet RH ne devait jamais voir un dossier (D26).

**Décisions prises** : D81 à D89 (voir `DECISIONS.md`), rédigées à la fin du chantier à partir de ce que j'avais validé étape par étape.
- D81, D82 : NISS et IBAN chiffrés, unicité par empreinte, IBAN belge seulement ; dévoilement journalisé dans la même transaction.
- D83, D84 : conditions de travail datées (une ligne par changement, jamais réécrite sauf correction de saisie) ; modification qui n'écrit que ce qui change.
- D85 : sortie et archivage sont deux choses distinctes.
- D86 : l'audit des dossiers ne contient ni valeur ni nom, et n'apparaît ni dans le journal du cabinet ni dans son export.
- D87 : import CSV en deux temps, fichier jamais conservé (écart assumé avec `stockage.md`).
- D88 : invitation d'un salarié, modèle d'email modifiable, un dossier = un compte.
- D89 : DIMONA et dernière fiche reportées en G2 ; file des demandes reportée au chantier Entreprise.

**Réalisé** : branche `feature/gestionnaire-rh`, 13 commits en français, un par étape présentée et validée avant d'être codée : chiffrement et masquage (`lib/crypto`), validation du NISS et de l'IBAN, modèles `Salarie` et `ConditionTravail`, espace `/dashboard/gestionnaire`, création, fiche détaillée, modification, historique daté, dévoilement, sortie et archivage, import CSV, correctif de la situation « pas encore entré », invitation au portail. Deux migrations additives (`add_salarie`, `add_invitation_salarie`), appliquées sur `dev` seulement.

**Contrôlé / corrigé par moi**
- J'ai validé chaque plan avant qu'il soit codé, puis testé chaque écran dans le navigateur avant de donner mon accord pour le commit. ?
- J'ai choisi de garder des chaînes plutôt que des enums Prisma après avoir demandé pourquoi, et de limiter l'IBAN au belge. J'ai posé la question du cohabitant légal ou de fait pour la situation familiale, qui manquait au plan. ?
- J'ai demandé de lier la commission paritaire au statut (employé 200, ouvrier 100) et de dater aussi le statut et la commission, pas seulement le salaire. ?
- J'ai remarqué qu'on ne voyait pas que le nom d'un salarié était cliquable, et demandé un bouton « Voir » en plus du lien. ?
- J'ai fait vérifier l'usage de shadcn : aucun composant n'était installé. J'ai décidé de refaire tout le site sur shadcn moi-même depuis `dev`, plutôt que de mélanger ce chantier à une refonte de l'interface. ?
- J'ai décidé que la file des demandes irait avec le portail Entreprise, et que la page d'accueil du salarié viendrait avec `feature/collaborateur`. ?
- Autres relectures, refus ou corrections de ma part : ?

**Écrit à la main** : ?

**Tests** : 228 tests écrits dans 19 fichiers (chiffrement, validation, analyseur CSV, conversion des colonnes, routes avec de vraies sessions sur la base de dev, composant d'affichage), plus les tests générés par tableaux (matrice des routes et des pages). Chaque route est testée pour l'isolation : dossier d'une entreprise non assignée, d'un autre cabinet, archivé ou inconnu répond 404 ; le périmètre est vérifié avant le corps de la requête ; une assignation retirée coupe l'accès à la requête suivante ; 401, 403, 423 en lecture seule. Des mutations volontaires (un filtre de périmètre retiré, un audit supprimé) vérifient que ces tests échouent bien. **Suite complète finale (23/10/2026, un seul lancement, base `dev`) : 125 fichiers, 2 557 tests, aucun échec, en 39 min 41 s** (2 203 tests au chantier précédent).

**Difficultés et apprentissages**
- Le premier filtre de périmètre fusionnait `entrepriseWhere(scope)` avec l'identifiant de l'URL : l'identifiant **écrasait** le filtre « entreprises assignées », et un gestionnaire pouvait lire n'importe quelle entreprise de son cabinet. Ce sont les tests d'isolation qui l'ont trouvé, avant tout commit. La règle est désormais d'utiliser `AND`.
- Une mutation volontaire n'a d'abord rien fait échouer : mon test « 404 avant 400 » utilisait un identifiant inexistant, donc il ne prouvait rien. Un test d'isolation doit utiliser une ressource qui **existe** mais hors périmètre, sinon un 400 révélerait son existence.
- L'export des données du cabinet reprenait son journal d'audit brut : l'acteur d'une acceptation d'invitation étant le compte du salarié, son nom et son email y figuraient. Découvert par un test de confidentialité à l'étape de l'invitation, corrigé par D86.
- En SQL, `NOT (salarieId = x)` n'est pas vrai quand `salarieId` est nul : une invitation de gestionnaire en attente pour la même adresse n'était pas détectée.
- `Response.text()` retire le BOM d'un fichier : un test qui le cherchait dans le texte ne le trouvait jamais.
- Deux passes de tests lancées en même temps se sabotent (le nettoyage de fin de l'une efface les comptes de l'autre) : une seule passe à la fois, y compris pour des tests « sans base ».
- Un `prettier --write` sur un dossier entier reformate des fichiers existants sans rapport avec le changement : à ne lancer que sur ses propres fichiers (`AMELIORATIONS.md` § 3).
- Un sélecteur de CSV Excel peut produire de l'UTF-8 ou du Windows-1252 selon l'option choisie : l'import essaie l'UTF-8 strict puis se rabat sur Windows-1252, pour ne pas abîmer les accents.

**Reste à faire** : prestations, moteur de paie et cycle des fiches (G2), DIMONA et dernière fiche d'un salarié sorti, file des demandes (avec le portail Entreprise). Pour cette branche : ajouter `ENCRYPTION_KEY` à la CI (fait, avec une clé factice), appliquer les migrations sur `production`, corriger le titre de la barre du haut du shell, lancer la suite complète, fusionner dans `dev`. Dettes et idées : voir `AMELIORATIONS.md`.
