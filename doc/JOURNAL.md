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
