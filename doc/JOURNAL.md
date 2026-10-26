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

---

## 2026-10-23 — Gestionnaire RH (2) : les périodes de paie, les prestations et le tableau de bord

> **BROUILLON — à relire et à compléter par moi.** Les points marqués « ? » sont ceux dont je dois confirmer ou écrire ma part.

**Objectif** : donner au gestionnaire RH l'étape qui précède le calcul de la paie : ouvrir la période d'un mois pour une entreprise, y encoder les prestations de chaque salarié (ce qui s'écarte d'un mois complet), les verrouiller, et voir d'un coup d'œil où en est chacune de ses entreprises. Rien n'est encore calculé : ces données alimenteront le moteur de paie.

**Décisions prises** : D90 à D93 (voir `DECISIONS.md`), rédigées avant le code.
- D90 : une période = une entreprise + un mois, ouvrable pour un mois passé, le mois courant ou le mois suivant, jamais au-delà ; elle est ouverte ou verrouillée, et le déverrouillage est audité.
- D91 : la date limite des prestations vient d'un jour réglé dans la fiche de l'entreprise (de 1 à 28, 20 par défaut), placé dans le mois de la période et décalable période par période ; l'entreprise peut encoder jusqu'à cette date incluse, le gestionnaire à tout moment tant que la période est ouverte.
- D92 : on encode des **écarts**, pas un mois entier : demi-journées pour les jours, minutes pour les heures, centimes pour une prime accompagnée de son libellé. Un salarié sans écart est payé pour un mois complet selon son régime. Seuls les salariés en poste dans le mois figurent dans la période.
- D93 : le tableau de bord se limite à ce qui existe ; les blocs des modules à venir n'apparaissent pas comme des compteurs à zéro.

**Réalisé** : toujours sur `feature/gestionnaire-rh`, 8 commits en français, un par étape présentée et validée avant d'être codée : les décisions, le jour limite dans la fiche d'entreprise (10a, formulaire du cabinet), le modèle `PeriodePaie` et `Prestation` avec la permission `periode.voir` (10b), les routes des périodes (10c), l'encodage des prestations (10d), les écrans (10e), le tableau de bord (11) et la mise à jour de la fiche `roles/03`. Deux migrations additives (`add_entreprise_jour_limite`, `add_periode_paie_prestation`), appliquées sur `dev` seulement. L'audit (ouverture, changement de date limite, verrouillage, déverrouillage, enregistrement et effacement d'une prestation) ne garde que des identifiants, l'année et le mois et les noms des champs, jamais une valeur, et n'apparaît ni dans le journal du cabinet ni dans son export.

**Contrôlé / corrigé par moi**
- J'ai validé chaque plan avant qu'il soit codé. ?
- J'ai choisi d'ajouter les prestations et le tableau de bord à la même branche que les dossiers salariés, plutôt que d'ouvrir une nouvelle branche. ?
- J'ai décidé de tester moi-même les écrans dans le navigateur avant tout commit, puis j'ai demandé un test dans mon propre Chrome. ?
- J'ai demandé qu'on me rappelle de faire le moteur de paie (`feature/moteur-paie`) à la fin de ce chantier et au début de chaque nouvelle session tant qu'il n'est pas commencé. ?
- Autres relectures, refus ou corrections de ma part : ?

**Tests** : 192 tests de plus que le chantier précédent, dans 8 nouveaux fichiers (calendrier des périodes, schéma des prestations, formatage et formulaire, routes des périodes, routes des prestations, matrice des routes des périodes, écrans, tableau de bord), plus la matrice des pages et le test des titres étendus. Chaque route est testée pour l'isolation : période ou salarié d'une entreprise non assignée, d'un autre cabinet ou archivé répond 404, vérifié avant la validation du corps ; une assignation retirée coupe l'accès ; 401, 403, 423 en lecture seule. Des mutations volontaires (filtre de périmètre, filtre du mois, contrôle de la date limite, filtre de verrouillage, exclusion de l'audit de l'export) vérifient que ces tests échouent bien. **Suite complète finale (23/10/2026, un seul lancement, base `dev`) : 133 fichiers, 2 749 tests, aucun échec, en 45 min 15 s** (2 557 tests au chantier précédent).

**Difficultés et apprentissages**
- Deux personnes qui encodent ou verrouillent en même temps : verrouiller et déverrouiller passent par une mise à jour qui exige le bon statut dans sa condition, et l'encodage pose d'abord un verrou sur la ligne de la période. Sans cela, une prestation pouvait s'enregistrer dans une période verrouillée juste avant.
- Une prime sans libellé et une autre erreur de champ ne s'affichent pas ensemble à l'écran : la règle qui lie le montant au libellé ne s'exécute qu'une fois les autres champs corrects. Limite connue et documentée dans le test, sans effet sur la sécurité (le serveur refuse de toute façon).
- Un test d'isolation qui enchaîne beaucoup de requêtes réelles dépassait les 15 secondes par défaut : durée portée à 60 secondes pour ce seul bloc.
- Un script d'édition de fichier lancé sous Windows a abîmé les accents de la page du tableau de bord (des caractères de remplacement à l'écran). C'est la vérification dans le navigateur qui l'a montré, pas les tests : un fichier modifié par script se relit à l'écran ou avec un outil d'édition.
- Les dates et les mois des tests sont toujours calculés par rapport à aujourd'hui, ou passés en paramètre : sinon les tests cassent le jour où le mois change.

**Reste à faire** : moteur de paie et cycle des fiches, DIMONA et dernière fiche d'un salarié sorti, file des demandes avec le portail Entreprise, qui apportera aussi l'écran d'encodage des prestations par l'entreprise et les rappels J-3 et J-1. Pour cette branche : appliquer les quatre migrations en attente (`add_salarie`, `add_invitation_salarie`, `add_entreprise_jour_limite`, `add_periode_paie_prestation`) sur `production` avant la mise en ligne, avec `ENCRYPTION_KEY` sur Vercel, puis fusionner dans `dev` (la CI applique les migrations sur la base `test`, que j'avais vidée au préalable). Dettes et idées : voir `AMELIORATIONS.md`.


---

## 2026-10-26 — Second audit avant le moteur de paie : paie conservée, situation fiscale, heures, 2FA et chiffrement

> **BROUILLON — à relire et à compléter par moi.** Les points marqués « ? » sont ceux dont je dois confirmer ou écrire ma part.

**Objectif** : corriger les points relevés à l'audit du 24/10/2026 avant de commencer le moteur de paie. Une donnée à conserver 5 ans pouvait être effacée par la purge d'un cabinet, le modèle fiscal du salarié ne suffisait pas au précompte, des durées étaient stockées en flottants, une garde 2FA ne lisait pas la même valeur sur les pages et sur les routes, et le NISS et l'IBAN chiffrés n'étaient pas liés à leur dossier.

**Décisions prises** : D94 à D97 (voir `DECISIONS.md`), rédigées avant le code.
- D94 : à la purge d'un cabinet archivé depuis 90 jours, les comptes, le branding et le lien d'abonnement partent mais les entreprises et toutes les données de paie restent jusqu'à 5 ans après la fin de l'année de la dernière période. Une seconde tâche supprime ensuite tout. Les clés étrangères de la paie passent en `Restrict`, pour qu'une suppression directe échoue au lieu d'effacer en cascade.
- D95 : la situation fiscale du dossier reprend les critères de l'Annexe III 2026 (revenus du conjoint en cinq cas, handicaps, enfants et autres personnes à charge, parent isolé, attribution des charges de famille), jamais un montant. Le formulaire est guidé et ne pose que les questions utiles.
- D96 : les heures par semaine du temps partiel sont des minutes entières, comme les heures prestées.
- D97 : le NISS et l'IBAN sont chiffrés avec des données associées (identifiant du dossier et nom du champ) ; une valeur recopiée ailleurs ne se lit plus. L'ancien format reste lisible et un script convertit le reste.

**Réalisé** : branche `feature/correctifs-audit` (réutilisée après fusion du premier audit), 14 commits en français, un à trois par étape présentée et validée avant d'être codée.
- Étape 1 : inventaire des cascades, trois options présentées, option (c) retenue (purge partielle plus `Restrict` en filet) ; `lib/cabinet/cabinet-purge.ts`, tâche `purge-expired-retention`, et tous les nettoyages de tests passent par `supprimerCabinetsEtDonnees`.
- Étape 2 : lecture de l'Annexe III 2026 (44 pages) pour établir la liste des critères avec leur numéro ; migration additive avec reprise des dossiers existants, schéma, formulaire, import CSV.
- Étape 3 : migration écrite à la main (renommage puis conversion, un « supprimer puis ajouter » généré par Prisma aurait perdu les valeurs), vérifiée ensuite sur les trois lignes existantes.
- Étape 4 : une garde de page testait la présence de la clé `twoFactorExempt` au lieu de sa valeur.
- Étape 5 : format `v2`, contexte construit à un seul endroit, script `npm run db:reencrypt`.

**Contrôlé / corrigé par moi**
- J'ai choisi l'option (c) pour la conservation, et validé les quatre propositions qui l'accompagnaient (point de départ des 5 ans, ce qui compte comme « données à conserver », aucun accès pendant la conservation, restitution à l'employeur notée pour plus tard). ?
- J'ai demandé que le gestionnaire ait le moins possible à saisir, ce qui a donné un formulaire guidé et l'idée de faire déclarer la situation fiscale par le salarié lui-même depuis son portail. ?
- J'ai fourni le PDF de l'Annexe III moi-même, et demandé que l'application ne se base que sur lui, pas sur la mémoire de l'assistant. ?
- J'ai fait supprimer la branche `feature/audit-avant-paie`, vide, pour regrouper mes audits dans `feature/correctifs-audit`. ?
- J'ai proposé de récupérer automatiquement les barèmes sur internet ; nous avons décidé d'en faire un chantier de finitions (D51) à deux niveaux, la validation humaine restant obligatoire. ?
- J'ai choisi de faire l'étape 5, facultative, alors que l'assistant recommandait de la reporter. ?
- Autres relectures, refus ou corrections de ma part : ?

**Tests** : la suite complète de départ comptait 133 fichiers et 2 749 tests, verts à un test près (un dépassement de délai qui passait ensuite seul). Chaque étape a ajouté ses propres fichiers, dont les tests de purge (`cabinet-purge`), de situation fiscale (schéma, formulaire, import, composant), de durées, de garde 2FA (un test échouait sur l'ancien code) et de chiffrement (16 tests en base, dont valeur recopiée, anciennes valeurs, conflit simulé). Suite complète finale à renseigner. ?

**Difficultés et apprentissages**
- Passer des clés étrangères en `Restrict` casse tous les nettoyages de tests qui comptaient sur la cascade : une trentaine de fichiers à adapter, d'où une seule fonction de suppression partagée.
- Prisma refuse de générer une migration qui supprime une colonne en mode non interactif, et la version qu'il aurait écrite perdait les données : le SQL de conversion s'écrit à la main.
- Un test qui reprend la même erreur que le code ne peut rien détecter : celui de la garde 2FA copiait la condition fautive. Le nouveau test déclare une action fictive pour échouer sur l'ancien code.
- Je n'ai pas trouvé de texte fiable de l'article 136 CIR 92 : la notion « à charge » reste déclarée par le gestionnaire, et les seuils de l'Annexe ne peuvent pas encore s'afficher (aucun montant dans le code avant `BaremeVersion`). Les libellés citent donc le numéro de l'Annexe.
- Les tests contre la base distante dépassent parfois les 15 secondes ou perdent la connexion : on relance le fichier seul avant de conclure à une régression.
- Une série de tests lancée en arrière-plan survit à la fermeture de l'éditeur : il faut l'arrêter avant d'en relancer une, sinon le nettoyage de fin de l'une efface les comptes de test de l'autre.

**Reste à faire** : la conversion `npm run db:reencrypt` est faite sur `dev` (24 valeurs, contrôlé) ; la production a été vérifiée par un `--dry-run` (0 dossier, rien à convertir) ; appliquer sur la production les trois migrations de cette branche ; fusionner dans `dev` ; le point ouvert n° 6 est tranché (D98) et le n° 5 en partie (une fiche réelle anonymisée comme base, côté salarié) : il reste à compléter les cas de référence avant ou pendant le moteur de paie (`feature/moteur-paie`). Plus tard : rotation de `ENCRYPTION_KEY`, déclaration de la situation fiscale par le salarié, texte de l'article 136. Dettes et idées : voir `AMELIORATIONS.md`.
