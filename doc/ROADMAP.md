# Feuille de route — octobre 2026 → juin 2027

> Remplace `PLANNING.md` (juillet 2026, obsolète). Hypothèse de charge : environ 30 h par semaine. Remise finale : **30/06/2027**.
> À mettre à jour à la fin de chaque chantier (statut, date réelle). **Planning révisé le 20/10/2026** : les chantiers sont regroupés par rôle (Gestionnaire RH en deux temps, puis Entreprise cliente, Collaborateur, SuperAdmin), suivis de finitions.

## 1. Déjà réalisé (au 20/10/2026)

| Bloc | Contenu | Statut |
|---|---|---|
| Socle | Monorepo, Next.js 16, Tailwind 4, shadcn/ui, Prisma 7 + Neon, Vercel (Preview `dev`, Production `main`) | ✅ |
| Site public | Landing, fonctionnalités, tarifs, FAQ, contact, à propos, pages légales | ✅ (audit Lighthouse et tests responsive à finir) |
| Authentification | Better Auth : mot de passe, lien magique, code email, Google, Microsoft, 2FA, vérification d'email, réinitialisation, alertes de sécurité, archivage de compte, rate limit en base, audit de sécurité | ✅ |
| Console SuperAdmin | Vue d'ensemble, cabinets, utilisateurs, monitoring, audit, facturation Stripe, configuration des plans ; 2FA obligatoire (D20), révocation des sessions et lien de réinitialisation (D21), script du premier SuperAdmin (D18) | ✅ (reste l'invitation d'un SuperAdmin, `roles/01` § 6) |
| Portail Cabinet RH | Vue d'ensemble, gestionnaires, entreprises, invitations, remplacement de l'administrateur, facturation et changement de plan, quotas, paramètres, portail de connexion, export, audit | ✅ (18/10 ; reste ce qui dépend des fiches, des PDF et des échéances) |
| Correctifs d'audit | Revalidation des couleurs du thème, autorisations centralisées (`lib/authz/authz.ts`, matrice de `PERMISSIONS.md` testée, périmètre de données, gardes sur toutes les routes et pages), 2FA du SuperAdmin, outils de support, script du premier SuperAdmin, réorganisation de `lib/` par domaine, découpage de `email.ts` et `auth.ts` | ✅ (branche `feature/correctifs-audit`, à fusionner dans `dev`) |
| Qualité et environnements | CI GitHub Actions (`lint`, types, tests sur une branche Neon dédiée), trois bases Neon `dev`, `test` et `production` (D79), production initialisée avec ses 3 plans et un SuperAdmin | ✅ (la CI se lancera au premier `git push`) |
| Gestionnaire RH (1) | Dossiers salariés : chiffrement NISS/IBAN, dévoilement journalisé, historique daté des conditions de travail, sortie et archivage, import CSV, invitation au portail (D81 à D89) | ✅ (23/10, branche `feature/gestionnaire-rh`, à fusionner dans `dev`) |

## 2. Chantiers

| # | Dates | Branche(s) | Contenu | Docs | Statut |
|---|---|---|---|---|---|
| **C0** | 12/10 → 25/10 | `feature/dashboard`, `feature/stripe-webhook` | Finir et fusionner le portail Cabinet RH en cours. Dette critique : Stripe Checkout avec carte (C1), plan sur `Cabinet` (C2), jeton d'invitation haché (C3), webhook Stripe et délai de grâce, 2FA obligatoire pour le SuperAdmin, outils de support. **Télécharger la documentation officielle** DIMONA et DmfA, créer le compte Exact Online | `roles/01`, `roles/02` | ✅ le portail Cabinet RH et la dette critique (18/10) ; **à vérifier** : documentation officielle DIMONA et DmfA téléchargée, compte Exact Online créé |
| **A** | 19/10 → 20/10 | `feature/correctifs-audit` | Correctifs d'audit : sécurité du thème, autorisations centralisées et testées, 2FA du SuperAdmin, outils de support, premier SuperAdmin par script, CI, réorganisation du code | `PERMISSIONS.md`, `CONVENTIONS.md`, `TESTS.md`, `AMELIORATIONS.md` | ✅ à fusionner dans `dev` |
| **G1** | 19/10 → 23/10 | `feature/gestionnaire-rh` | **Gestionnaire RH (1)** : dossiers salariés (chiffrement NISS/IBAN, historique daté, sortie et archivage, import CSV), invitation du collaborateur. **La file des demandes passe au chantier E** (D89) | `roles/03` § 4, D81 à D89 | ✅ 23/10 (à fusionner dans `dev`) |
| **G2** | 16/11 → 10/01 | `feature/moteur-paie`, `feature/cycle-paie`, `feature/declarations` | **Gestionnaire RH (2)** : **moteur de paie v1** (barèmes 2026 versionnés, cas de référence, employés, ouvriers, temps partiel, maladie, heures supplémentaires), périodes, fiches et machine à états, PDF, envoi par lien et code, rectificative ; calendrier et rappels ; déclarations simulées (DIMONA fidèle à la documentation officielle D50, DmfA, C4) ; pécule de vacances | `modules/paie.md`, `roles/03`, `modules/calendrier-echeances.md`, `modules/integrations.md` | À faire |
| **E** | 11/01 → 07/02 | `feature/portail-entreprise` | **Entreprise cliente** : prestations, validation et rejet des fiches, détail des fiches, demandes (et leur file de traitement côté gestionnaire, D89) ; messagerie, documents et notifications avec le gestionnaire (D42) | `roles/04`, `modules/collaboration.md`, `modules/stockage.md` | À faire |
| **K** | 08/02 → 28/02 | `feature/portail-collaborateur` | **Collaborateur** : consultation de ses fiches (lien et code), téléchargement du PDF, demande de correction de ses données | `roles/05` | À faire |
| **S** | 01/03 → 07/03 | `feature/superadmin-fin` | **SuperAdmin** : ce qui reste de la fiche (invitation d'un SuperAdmin, modification d'un cabinet, validation des barèmes…) | `roles/01` § 6 | À faire |
| **F** | 08/03 → 24/05 | `feature/qualite`, `feature/references`, `feature/exact`, `feature/analytics`, `feature/personnalisation` | **Finitions** : white-label Enterprise, Exact Online, fiche 281.10, tableaux de bord analytiques, mise à jour mensuelle des barèmes (D51), tests Playwright, CI complétée, sécurité, performance, seed de démonstration ; IA si le temps le permet | `modules/personnalisation.md`, `modules/integrations.md`, `modules/intelligence.md`, `AMELIORATIONS.md` | À faire |
| **G** | 25/05 → 31/05 | — | **Gel technique** : plus de nouvelle fonctionnalité, correction des défauts, jeu de démonstration figé | — | À faire |
| **R** | en parallèle, puis 01/06 → 30/06 | — | Rédaction du rapport au fil de l'eau, captures, préparation de la défense, remise le 30/06/2027 | `JOURNAL.md` | En continu |

Le rapport s'écrit **au fil de l'eau** : à la fin de chaque chantier, une entrée détaillée dans `JOURNAL.md` sert de matière pour les chapitres « Analyse » et « Réalisation ».

## 3. Jalons

| Date | Jalon |
|---|---|
| 20/10/2026 | Correctifs d'audit terminés : autorisations centralisées, CI, code réorganisé |
| 15/11/2026 | Dossiers salariés complets (Gestionnaire RH 1) : **atteint le 23/10** |
| 10/01/2027 | **Moteur de paie v1** validé sur tous les cas de référence ; cycle de paie côté gestionnaire |
| 07/02/2027 | **Premier cycle de paie de bout en bout** (démontrable) : le gestionnaire ouvre la période, l'entreprise encode et valide |
| 28/02/2027 | Portail Collaborateur : le salarié consulte et télécharge ses fiches |
| 07/03/2027 | **Base complète** : les cinq rôles utilisables |
| 24/05/2027 | Fin des finitions |
| 31/05/2027 | Gel technique : tout le périmètre démontrable |
| 30/06/2027 | Remise du TFE |

## 4. Risques et plan de réduction

| Risque | Probabilité | Parade |
|---|---|---|
| Périmètre trop large pour un développeur seul | Élevée | Ordre de coupe défini ci-dessous ; chaque chantier fusionnable seul |
| Simulation DIMONA/DmfA jugée trop éloignée du réel | Faible | Simulation construite sur la documentation officielle, avec les vrais formats, statuts et anomalies (D50) |
| Erreurs du moteur de paie | Moyenne | Cas de référence au centime, idéalement issus de vraies fiches |
| Retard sur Gestionnaire RH (2) et Entreprise cliente (cœur) | Moyenne | Priorité absolue : rien d'autre ne commence avant le jalon du 07/02. Gestionnaire RH (2) est le chantier le plus chargé (moteur de paie, cycle, calendrier, déclarations, pécule) : surveiller son avancement dès fin novembre |
| Données réelles en démo | Faible | Seed fictif uniquement, générateur de NISS fictifs |

**Ordre de coupe** si le retard dépasse deux semaines (de la première à la dernière chose à sacrifier) :
1. IA (assistant, détection par IA) → présentée en « évolutions pressenties »
2. Automatisation mensuelle des données de référence (D51) : on garde la saisie manuelle des versions
3. Domaine personnalisé du white-label
4. Fiche 281.10 / BelCotax
5. Exact Online
6. Tableaux de bord analytiques avancés

Le cœur (Cabinet RH, Gestionnaire RH (1) et (2), Entreprise cliente, Collaborateur), le calendrier et les déclarations simulées ne sont **jamais** coupés.
