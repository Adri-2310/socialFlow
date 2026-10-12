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
- Lancer les demandes d'accès DIMONA et Exact Online.
- Mettre à jour les commentaires du code qui citent encore `doc/analysis/ARCHITECTURE_SOCIALFLOW_RBAC.md`, `SPEC_FINAL.md` ou `doc/analysis/PRD_CLIENT.md` (`lib/auth.ts`, `api/admin/cabinets/[id]`, `api/invitations`, `dashboard/page.tsx`, `prisma/seed.mjs`, `prisma/schema.prisma`) : remplacer par les nouveaux chemins.
