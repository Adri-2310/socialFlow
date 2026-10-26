# Feuille de route — octobre 2026 → juin 2027

> Remplace `PLANNING.md` (juillet 2026, obsolète). Hypothèse de charge : environ 30 h par semaine. Remise finale : **30/06/2027**.
> À mettre à jour à la fin de chaque chantier (statut, date réelle). **Planning révisé le 20/10/2026** : les chantiers sont regroupés par rôle (Gestionnaire RH en deux temps, puis Entreprise cliente, Collaborateur, SuperAdmin), suivis de finitions. **Révisé à nouveau le 26/10/2026** : G1 et les périodes de paie sont terminés bien avant la date prévue, G2 est découpé en trois chantiers (moteur, cycle des fiches, déclarations) et les dates suivantes sont avancées d'une semaine.

## 1. Déjà réalisé (au 26/10/2026)

| Bloc | Contenu | Statut |
|---|---|---|
| Socle | Monorepo, Next.js 16, Tailwind 4, shadcn/ui, Prisma 7 + Neon, Vercel (Preview `dev`, Production `main`) | ✅ |
| Site public | Landing, fonctionnalités, tarifs, FAQ, contact, à propos, pages légales | ✅ (audit Lighthouse et tests responsive à finir) |
| Authentification | Better Auth : mot de passe, lien magique, code email, Google, Microsoft, 2FA, vérification d'email, réinitialisation, alertes de sécurité, archivage de compte, rate limit en base, audit de sécurité | ✅ |
| Console SuperAdmin | Vue d'ensemble, cabinets, utilisateurs, monitoring, audit, facturation Stripe, configuration des plans ; 2FA obligatoire (D20), révocation des sessions et lien de réinitialisation (D21), script du premier SuperAdmin (D18) | ✅ (reste l'invitation d'un SuperAdmin, `roles/01` § 6) |
| Portail Cabinet RH | Vue d'ensemble, gestionnaires, entreprises, invitations, remplacement de l'administrateur, facturation et changement de plan, quotas, paramètres, portail de connexion, export, audit | ✅ (18/10 ; reste ce qui dépend des fiches, des PDF et des échéances) |
| Correctifs d'audit | Revalidation des couleurs du thème, autorisations centralisées (`lib/authz/authz.ts`, matrice de `PERMISSIONS.md` testée, périmètre de données, gardes sur toutes les routes et pages), 2FA du SuperAdmin, outils de support, script du premier SuperAdmin, réorganisation de `lib/` par domaine, découpage de `email.ts` et `auth.ts` | ✅ (20/10, branche `feature/correctifs-audit`, fusionnée dans `dev`) |
| Qualité et environnements | CI GitHub Actions (`lint`, types, tests sur une branche Neon dédiée), trois bases Neon `dev`, `test` et `production` (D79), production initialisée avec ses 3 plans et un SuperAdmin | ✅ (la CI se lancera au premier `git push`) |
| Gestionnaire RH (1) | Dossiers salariés : chiffrement NISS/IBAN, dévoilement journalisé, historique daté des conditions de travail, sortie et archivage, import CSV, invitation au portail (D81 à D89) | ✅ (23/10, branche `feature/gestionnaire-rh`, fusionnée dans `dev`) |
| Gestionnaire RH (2), première partie | Périodes de paie, prestations (les écarts du mois) et tableau de bord du gestionnaire (D90 à D93) | ✅ (24/10, fusionné dans `dev`, migrations appliquées en production) |
| Second audit avant le moteur de paie | Conservation légale de la paie à la purge d'un cabinet (D94), situation fiscale complète du précompte (D95), heures hebdomadaires en minutes (D96), garde 2FA des pages alignée sur celle des routes, chiffrement du NISS et de l'IBAN lié au dossier (D97) | ✅ (26/10, branche `feature/correctifs-audit`, à fusionner dans `dev`) |

## 2. Chantiers

| # | Dates | Branche(s) | Contenu | Docs | Statut |
|---|---|---|---|---|---|
| **C0** | 12/10 → 25/10 | `feature/dashboard`, `feature/stripe-webhook` | Finir et fusionner le portail Cabinet RH en cours. Dette critique : Stripe Checkout avec carte (C1), plan sur `Cabinet` (C2), jeton d'invitation haché (C3), webhook Stripe et délai de grâce, 2FA obligatoire pour le SuperAdmin, outils de support. **Télécharger la documentation officielle** DIMONA et DmfA, créer le compte Exact Online | `roles/01`, `roles/02` | ✅ le portail Cabinet RH et la dette critique (18/10) ; **à vérifier** : documentation officielle DIMONA et DmfA téléchargée, compte Exact Online créé |
| **A** | 19/10 → 20/10 | `feature/correctifs-audit` | Correctifs d'audit : sécurité du thème, autorisations centralisées et testées, 2FA du SuperAdmin, outils de support, premier SuperAdmin par script, CI, réorganisation du code | `PERMISSIONS.md`, `CONVENTIONS.md`, `TESTS.md`, `AMELIORATIONS.md` | ✅ fusionné dans `dev` (20/10) |
| **G1** | 19/10 → 23/10 | `feature/gestionnaire-rh` | **Gestionnaire RH (1)** : dossiers salariés (chiffrement NISS/IBAN, historique daté, sortie et archivage, import CSV), invitation du collaborateur. **La file des demandes passe au chantier E** (D89) | `roles/03` § 4, D81 à D89 | ✅ 23/10, fusionné dans `dev` |
| **G1b** | 22/10 → 24/10 | `feature/gestionnaire-rh` | **Gestionnaire RH (1 bis)** : périodes de paie, prestations du mois, tableau de bord du gestionnaire. **Les prestations côté entreprise passent au chantier E** | `roles/03` § 3 et 5, D90 à D93 | ✅ 24/10, fusionné dans `dev` |
| **A2** | 24/10 → 26/10 | `feature/correctifs-audit` | **Second audit avant le moteur de paie** : purge d'un cabinet sans perdre la paie à conserver 5 ans (D94), situation fiscale complète (D95), heures en minutes entières (D96), garde 2FA des pages, chiffrement lié au dossier (D97) | `DECISIONS.md` D94 à D97, `AMELIORATIONS.md` | ✅ à fusionner dans `dev` |
| **G2a** | 27/10 → 22/11 | `feature/moteur-paie` | **Moteur de paie v1, sans écran** : `BaremeVersion` (barèmes 2026 saisis une première fois à la main depuis les PDF officiels, structure prête pour la veille automatique du chantier F), fonctions pures dans `lib/payroll/`, cas de référence au centime près (employés, ouvriers, temps partiel, maladie, heures supplémentaires). **À trancher avant de commencer : points ouverts n° 5 (cas de référence réels) et n° 6 (catégorie d'employeur)**, voir `README.md` | `modules/paie.md`, D95, D96 | À faire |
| **G2b** | 23/11 → 13/12 | `feature/cycle-paie` | **Cycle des fiches** : machine à états `BROUILLON → A_VALIDER → VALIDEE → ENVOYEE (→ REMPLACEE)`, PDF, envoi par lien et code, rectificative, écrans du gestionnaire | `modules/paie.md`, `roles/03` § 6 | À faire |
| **G2c** | 14/12 → 03/01 | `feature/declarations` | **Déclarations simulées** : DIMONA IN et OUT (fidèles à la documentation officielle, D50), DmfA, C4 ; badge « DIMONA à envoyer » et dernière fiche d'un salarié sorti (D89). Fêtes de fin d'année comprises : charge réduite | `modules/integrations.md`, `roles/03` | À faire |
| **E** | 04/01 → 31/01 | `feature/portail-entreprise` | **Entreprise cliente** : prestations, validation et rejet des fiches, détail des fiches, demandes (et leur file de traitement côté gestionnaire, D89) ; messagerie, documents et notifications avec le gestionnaire (D42) | `roles/04`, `modules/collaboration.md`, `modules/stockage.md` | À faire |
| **K** | 01/02 → 21/02 | `feature/portail-collaborateur` | **Collaborateur** : consultation de ses fiches (lien et code), téléchargement du PDF, demande de correction de ses données | `roles/05` | À faire |
| **S** | 22/02 → 28/02 | `feature/superadmin-fin` | **SuperAdmin** : ce qui reste de la fiche (invitation d'un SuperAdmin, modification d'un cabinet, validation des barèmes…) | `roles/01` § 6 | À faire |
| **F** | 01/03 → 24/05 | `feature/qualite`, `feature/references`, `feature/exact`, `feature/analytics`, `feature/personnalisation` | **Finitions** : calendrier et rappels et pécule de vacances s'ils ont glissé de G2, white-label Enterprise, Exact Online, fiche 281.10, tableaux de bord analytiques, **veille automatique des barèmes** (D51) en deux niveaux : détecter une nouvelle publication du SPF Finances ou de l'ONSS et alerter le SuperAdmin, puis extraction assistée dans une `BaremeVersion` à l'état `A_VERIFIER`, jamais activée sans ses cas de référence (vérifier avant la politique des robots du site visé), tests Playwright, CI complétée, sécurité, performance, seed de démonstration ; IA si le temps le permet | `modules/personnalisation.md`, `modules/integrations.md`, `modules/intelligence.md`, `AMELIORATIONS.md` | À faire |
| **G** | 25/05 → 31/05 | — | **Gel technique** : plus de nouvelle fonctionnalité, correction des défauts, jeu de démonstration figé | — | À faire |
| **R** | en parallèle, puis 01/06 → 30/06 | — | Rédaction du rapport au fil de l'eau, captures, préparation de la défense, remise le 30/06/2027 | `JOURNAL.md` | En continu |

**Calendrier et pécule.** Le calendrier et les rappels (`modules/calendrier-echeances.md`) et le pécule de vacances faisaient partie de G2. Ils **peuvent glisser en finitions (F)** si G2a à G2c prennent du retard : ils sont déplacés, jamais coupés.

**Avance prise.** G1 s'est terminé le 23/10 pour une échéance au 15/11, et les périodes et prestations (D90 à D93) étaient prévues dans G2 et E. Le moteur de paie démarre donc dès la fin du second audit (27/10) au lieu du 16/11. L'avance sert d'abord de marge pour G2, le chantier le plus chargé ; les chantiers suivants gagnent une semaine.

Le rapport s'écrit **au fil de l'eau** : à la fin de chaque chantier, une entrée détaillée dans `JOURNAL.md` sert de matière pour les chapitres « Analyse » et « Réalisation ».

## 3. Jalons

| Date | Jalon |
|---|---|
| 20/10/2026 | Correctifs d'audit terminés : autorisations centralisées, CI, code réorganisé |
| 15/11/2026 | Dossiers salariés complets (Gestionnaire RH 1) : **atteint le 23/10** |
| 26/10/2026 | Second audit corrigé : paie conservée à la purge d'un cabinet, situation fiscale complète, heures en minutes, chiffrement lié au dossier |
| 22/11/2026 | **Moteur de paie v1** validé sur tous les cas de référence (G2a) |
| 13/12/2026 | Cycle des fiches côté gestionnaire : machine à états, PDF, envoi par lien et code (G2b) |
| 03/01/2027 | Déclarations simulées DIMONA, DmfA et C4 (G2c) |
| 31/01/2027 | **Premier cycle de paie de bout en bout** (démontrable) : le gestionnaire ouvre la période, l'entreprise encode et valide |
| 21/02/2027 | Portail Collaborateur : le salarié consulte et télécharge ses fiches |
| 28/02/2027 | **Base complète** : les cinq rôles utilisables |
| 24/05/2027 | Fin des finitions |
| 31/05/2027 | Gel technique : tout le périmètre démontrable |
| 30/06/2027 | Remise du TFE |

## 4. Risques et plan de réduction

| Risque | Probabilité | Parade |
|---|---|---|
| Périmètre trop large pour un développeur seul | Élevée | Ordre de coupe défini ci-dessous ; chaque chantier fusionnable seul |
| Simulation DIMONA/DmfA jugée trop éloignée du réel | Faible | Simulation construite sur la documentation officielle, avec les vrais formats, statuts et anomalies (D50) |
| Erreurs du moteur de paie | Moyenne | Cas de référence au centime, idéalement issus de vraies fiches |
| Retard sur Gestionnaire RH (2) et Entreprise cliente (cœur) | Moyenne | Priorité absolue : rien d'autre ne commence avant le jalon du 31/01. Gestionnaire RH (2) est le chantier le plus chargé (moteur de paie, cycle des fiches, déclarations ; calendrier et pécule en option) : surveiller son avancement dès la fin de G2a (22/11) |
| Données réelles en démo | Faible | Seed fictif uniquement, générateur de NISS fictifs |

**Ordre de coupe** si le retard dépasse deux semaines (de la première à la dernière chose à sacrifier) :
1. IA (assistant, détection par IA) → présentée en « évolutions pressenties »
2. Automatisation mensuelle des données de référence (D51) : on garde la saisie manuelle des versions
3. Domaine personnalisé du white-label
4. Fiche 281.10 / BelCotax
5. Exact Online
6. Tableaux de bord analytiques avancés

Le cœur (Cabinet RH, Gestionnaire RH (1) et (2), Entreprise cliente, Collaborateur), le calendrier et les déclarations simulées ne sont **jamais** coupés.
