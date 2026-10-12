# Feuille de route — octobre 2026 → juin 2027

> Remplace `PLANNING.md` (juillet 2026, obsolète). Hypothèse de charge : environ 30 h par semaine. Remise finale : **30/06/2027**.
> À mettre à jour à la fin de chaque chantier (statut, date réelle).

## 1. Déjà réalisé (au 12/10/2026)

| Bloc | Contenu | Statut |
|---|---|---|
| Socle | Monorepo, Next.js 16, Tailwind 4, shadcn/ui, Prisma 7 + Neon, Vercel (Preview `dev`, Production `main`) | ✅ |
| Site public | Landing, fonctionnalités, tarifs, FAQ, contact, à propos, pages légales | ✅ (audit Lighthouse et tests responsive à finir) |
| Authentification | Better Auth : mot de passe, lien magique, code email, Google, Microsoft, 2FA, vérification d'email, réinitialisation, alertes de sécurité, archivage de compte, rate limit en base, audit de sécurité | ✅ |
| Console SuperAdmin | Vue d'ensemble, cabinets, utilisateurs, monitoring, audit, facturation Stripe, configuration des plans | ✅ (branche `feature/dashboard`) |
| Portail Cabinet RH | Vue d'ensemble, gestionnaires, invitations (renvoi, révocation) | 🟡 en cours (non commité) |

## 2. Chantiers

| # | Dates | Branche(s) | Contenu | Docs |
|---|---|---|---|---|
| **C0** | 12/10 → 25/10 | `feature/dashboard`, `feature/stripe-webhook` | Finir et fusionner le portail Cabinet RH en cours. Dette critique : Stripe Checkout avec carte (C1), plan sur `Cabinet` (C2), jeton d'invitation haché (C3), webhook Stripe et délai de grâce, 2FA obligatoire pour le SuperAdmin, outils de support. **Télécharger la documentation officielle** DIMONA et DmfA, créer le compte Exact Online | `roles/01`, `roles/02` |
| **C1** | 26/10 → 15/11 | `feature/entreprises` | `lib/authz.ts` et matrice de permissions testée ; quotas des plans ; entreprises clientes, assignations N:M, invitation de l'admin entreprise ; journal d'audit du cabinet | `roles/02`, `PERMISSIONS.md` |
| **C2** | 16/11 → 06/12 | `feature/salaries` | Dossiers salariés (chiffrement NISS/IBAN, historique daté, import CSV), invitation du collaborateur, file des demandes | `roles/03` § 4, `modules/collaboration.md` |
| **C3** | 07/12 → 17/01 | `feature/moteur-paie` | **Moteur de paie** : barèmes 2026 versionnés, cas de référence, employés, ouvriers, temps partiel, maladie, heures sup (vacances de fin d'année incluses) | `modules/paie.md` |
| **C4** | 18/01 → 14/02 | `feature/cycle-paie` | Périodes, prestations (portail entreprise), fiches et machine à états, validation et rejet, PDF, envoi par lien + code, rectificative ; portails Entreprise et Collaborateur | `roles/03` à `05` |
| **C5** | 15/02 → 07/03 | `feature/calendrier`, `feature/collaboration` | Calendrier et rappels, notifications in-app, messagerie, documents (stockage et quota) | `modules/calendrier-echeances.md`, `modules/collaboration.md` |
| **C6** | 08/03 → 28/03 | `feature/declarations` | DIMONA simulée fidèle à la documentation officielle (D50), génération et contrôle de la DmfA, C4 | `modules/integrations.md` |
| **C7** | 29/03 → 18/04 | `feature/personnalisation`, `feature/pecule` | Branding, modèles d'emails, white-label Enterprise ; pécule de vacances | `modules/personnalisation.md`, `modules/paie.md` § 4 |
| **C8** | 19/04 → 09/05 | `feature/exact`, `feature/analytics` | Exact Online, fiche 281.10, tableaux de bord analytiques | `modules/integrations.md`, `modules/intelligence.md` |
| **C9** | 10/05 → 30/05 | `feature/qualite`, `feature/references` | Mise à jour mensuelle automatique des données de référence et des barèmes (D51), tests Playwright, CI GitHub Actions, sécurité, performance, seed de démonstration ; IA si le temps le permet | `TESTS.md`, `modules/intelligence.md` |
| **R** | 31/05 → 30/06 | — | Rédaction finale du rapport, captures, préparation de la défense, gel des fonctionnalités le 15/06 | `JOURNAL.md` |

Le rapport s'écrit **au fil de l'eau** : à la fin de chaque chantier, une entrée détaillée dans `JOURNAL.md` sert de matière pour les chapitres « Analyse » et « Réalisation ».

## 3. Jalons

| Date | Jalon |
|---|---|
| 25/10/2026 | Cabinet RH utilisable de bout en bout, facturation fiable |
| 06/12/2026 | Portefeuille et dossiers salariés complets |
| 17/01/2027 | Moteur de paie validé sur tous les cas de référence |
| 14/02/2027 | **Premier cycle de paie complet de bout en bout** (démontrable) |
| 28/03/2027 | Déclarations sociales (simulées, D50) |
| 30/05/2027 | Gel technique : tout le périmètre démontrable |
| 30/06/2027 | Remise du TFE |

## 4. Risques et plan de réduction

| Risque | Probabilité | Parade |
|---|---|---|
| Périmètre trop large pour un développeur seul | Élevée | Ordre de coupe défini ci-dessous ; chaque chantier fusionnable seul |
| Simulation DIMONA/DmfA jugée trop éloignée du réel | Faible | Simulation construite sur la documentation officielle, avec les vrais formats, statuts et anomalies (D50) |
| Erreurs du moteur de paie | Moyenne | Cas de référence au centime, idéalement issus de vraies fiches |
| Retard sur C3/C4 (cœur) | Moyenne | Priorité absolue : rien d'autre ne commence avant le jalon du 14/02 |
| Données réelles en démo | Faible | Seed fictif uniquement, générateur de NISS fictifs |

**Ordre de coupe** si le retard dépasse deux semaines (de la première à la dernière chose à sacrifier) :
1. IA (assistant, détection par IA) → présentée en « évolutions pressenties »
2. Automatisation mensuelle des données de référence (D51) : on garde la saisie manuelle des versions
3. Domaine personnalisé du white-label
4. Fiche 281.10 / BelCotax
5. Exact Online
6. Tableaux de bord analytiques avancés

Le cœur (C0 à C4), le calendrier et les déclarations simulées ne sont **jamais** coupés.
