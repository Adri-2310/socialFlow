# Documentation SocialFlow

Plateforme SaaS belge de gestion de la paie pour cabinets RH et secrétariats sociaux.
Travail de fin d'études — Adrien Mertens — remise le 30/06/2027.

## Par où commencer

| Je veux… | Lire |
|---|---|
| Comprendre l'application en 15 minutes | [FONCTIONNEMENT.md](FONCTIONNEMENT.md) |
| Savoir ce qui a été décidé et pourquoi | [DECISIONS.md](DECISIONS.md) — **source de vérité** |
| Savoir qui a le droit de faire quoi | [PERMISSIONS.md](PERMISSIONS.md) |
| Connaître le planning | [ROADMAP.md](ROADMAP.md) |
| Écrire du code dans les règles | [CONVENTIONS.md](CONVENTIONS.md), [TESTS.md](TESTS.md) |

## Rôles

| # | Rôle | Statut |
|---|---|---|
| 1 | [SuperAdmin](roles/01-superadmin.md) | Construit en grande partie |
| 2 | [Cabinet RH](roles/02-cabinet-rh.md) | Construit (reste ce qui dépend d'autres modules) |
| 3 | [Gestionnaire RH](roles/03-gestionnaire-rh.md) | Prochain chantier (invitation et acceptation faites) |
| 4 | [Entreprise cliente](roles/04-entreprise-cliente.md) | À construire |
| 5 | [Collaborateur](roles/05-collaborateur.md) | À construire |

## Modules

| Module | Contenu |
|---|---|
| [Moteur de paie](modules/paie.md) | Calcul belge, barèmes versionnés, cas de référence |
| [Intégrations](modules/integrations.md) | DIMONA, DmfA, C4, Exact Online, BelCotax — faisabilité et plan de repli |
| [Calendrier et échéances](modules/calendrier-echeances.md) | Échéances légales et internes, rappels |
| [Collaboration](modules/collaboration.md) | Demandes, messagerie, documents, notifications |
| [Personnalisation](modules/personnalisation.md) | Branding, modèles d'emails, white-label |
| [Stockage des fichiers](modules/stockage.md) | Vercel Blob, avatars, documents, quotas, téléchargement audité |
| [Analytics et intelligence](modules/intelligence.md) | Tableaux de bord, anomalies, assistant (proposition) |

## Autres documents

| Document | Contenu |
|---|---|
| [RGPD.md](RGPD.md) | Registre des traitements, mesures, droits des personnes |
| [JOURNAL.md](JOURNAL.md) | Journal de développement (matière du rapport) |
| [analysis/AUDIT_SECURITE_AUTH.md](analysis/AUDIT_SECURITE_AUTH.md) | Audit de sécurité de l'authentification (toujours valable) |
| [reference/PRD_CLIENT.md](reference/PRD_CLIENT.md) | Cahier des charges du client : fait foi pour les plans, prix et fonctionnalités (D34), pas pour la technique |
| [archive/](archive/) | Anciens documents d'analyse : **ne plus suivre**, conservés pour l'historique |

## Règle de priorité

En cas de contradiction : `DECISIONS.md` > `PERMISSIONS.md` > fiches de rôles et de modules > `FONCTIONNEMENT.md` > `reference/` (partie métier uniquement) > tout ce qui est dans `archive/`.
Toute nouvelle décision s'ajoute dans `DECISIONS.md` (numéro suivant, date) **avant** d'être implémentée.

## Points encore ouverts

| # | Question | Où |
|---|---|---|
| 1 | Durée de conservation du journal d'audit | `FONCTIONNEMENT.md` § 12, `RGPD.md` |
| 2 | Fiche fiscale 281.10 générée dans l'application ? | `roles/05-collaborateur.md`, `modules/integrations.md` § 6 |
| 3 | ~~Délai de grâce de 14 jours~~ : fixé à 7 jours (D57) | `DECISIONS.md` |
| 4 | Barèmes : détection automatique + activation validée par le SuperAdmin ? | `roles/01-superadmin.md` § 7, `modules/paie.md` § 5 |
| 5 | Accès à des fiches réelles anonymisées pour les cas de référence ? | `modules/paie.md` § 8 |
| 6 | Catégorie d'employeur pour les cotisations patronales | `modules/paie.md` § 8 |
| 7 | Priorité, fournisseur et budget du module IA | `modules/intelligence.md` § 4 |
| 8 | Taille maximale d'un document déposé | `modules/collaboration.md` § 3 |
