# RGPD : registre des traitements et mesures

> SocialFlow traite des données personnelles **sensibles** (rémunérations, NISS, situation familiale, absences pour maladie). Ce document sert de base au registre des traitements (article 30 du RGPD) et justifie les choix techniques.
> ⚠️ Document technique, ne remplace pas l'avis d'un juriste ou d'un DPO.

## 1. Rôles RGPD

| Acteur | Qualité |
|---|---|
| Entreprise cliente (employeur) | **Responsable de traitement** des données de ses salariés |
| Cabinet RH | **Sous-traitant** de l'employeur (contrat de sous-traitance avec chaque client) |
| SocialFlow (exploitant) | **Sous-traitant ultérieur** du cabinet ; **responsable** pour les données des comptes cabinet (facturation, connexion) |
| Neon, Vercel, Resend, Stripe, fournisseur d'IA éventuel | Sous-traitants ultérieurs de SocialFlow (à lister dans le contrat, localisation des données à vérifier) |

## 2. Registre des traitements

| Traitement | Personnes | Données | Finalité | Base légale | Durée de conservation |
|---|---|---|---|---|---|
| Comptes et authentification | Tous les utilisateurs | Nom, email, mot de passe haché, sessions (IP, navigateur), 2FA | Accès sécurisé | Exécution du contrat | Durée du compte + 90 j après archivage |
| Abonnement et facturation | Titulaire du cabinet | Identité du cabinet, client Stripe (pas de numéro de carte chez SocialFlow) | Facturation | Contrat ; obligation légale (comptabilité) | 7 ans pour les pièces comptables **[à vérifier]** |
| Dossiers salariés | Salariés | Identité, NISS, adresse, IBAN, contrat, rémunération, situation familiale | Établir la paie | Obligation légale de l'employeur | 5 ans après la fin de la période concernée |
| Prestations et absences | Salariés | Heures, congés, jours de maladie | Calcul de la paie | Obligation légale | 5 ans |
| Fiches de paie et déclarations | Salariés | Montants, cotisations, DIMONA, DmfA, C4 | Paie et obligations sociales et fiscales | Obligation légale | 5 ans |
| Messagerie et documents | Admins d'entreprise, gestionnaires, salariés concernés | Messages, pièces jointes (certificats médicaux possibles) | Collaboration | Intérêt légitime / contrat | Durée de la relation + 1 an **[à fixer]** |
| Journal d'audit | Tous les utilisateurs | Actions, horodatage, IP, navigateur | Sécurité, preuve | Intérêt légitime | **[à fixer]** ; anonymisation à la suppression du compte |
| Analyse IA (si activée) | Salariés | Montants pseudonymisés | Détection d'anomalies | Intérêt légitime | Aucune conservation chez le fournisseur **[à contractualiser]** |

## 3. Mesures techniques (déjà prévues dans la doc)

| Mesure | Où |
|---|---|
| Isolation stricte par cabinet, entreprise et salarié | `FONCTIONNEMENT.md` § 4, `PERMISSIONS.md` |
| SuperAdmin sans accès aux données de paie (D8) | `roles/01-superadmin.md` |
| Chiffrement du NISS, de l'IBAN et des secrets ; dévoilement journalisé | `CONVENTIONS.md` § 4, D81, D82 |
| Fiches transmises sans pièce jointe, lien de 7 jours avec code à usage unique (D12, D43) | `roles/03-gestionnaire-rh.md` § 6.4 |
| 2FA obligatoire pour le SuperAdmin, conseillée pour les autres | D20 |
| Audit des actions sensibles | `CONVENTIONS.md` § 3 |
| Soft-delete puis purge automatique ; à la purge d'un cabinet, les comptes partent à 90 jours mais la paie reste 5 ans, protégée par des clés étrangères `Restrict` (D94) | `FONCTIONNEMENT.md` § 12 |
| Minimisation : le Cabinet RH ne voit que des agrégats (D26) | `roles/02-cabinet-rh.md` |

## 4. Droits des personnes

| Droit | Mise en œuvre |
|---|---|
| Accès et portabilité | Export JSON + PDF depuis le profil (tous les rôles ; collaborateur : `roles/05-collaborateur.md` § 4.4) |
| Rectification | Demande de correction (collaborateur) ou demande de l'employeur, traitée par le gestionnaire |
| Effacement | Suppression du compte possible ; les données de paie restent conservées 5 ans (obligation légale, art. 17.3 b), puis purgées. Si le cabinet disparaît (archivé puis purgé), ses comptes sont effacés après 90 jours et seules les données de paie sont gardées, sans aucun accès, jusqu'à la fin des 5 ans (D94) |
| Information | Politique de confidentialité (`/confidentialite`) et page RGPD (`/rgpd`) déjà présentes, à mettre à jour avec ce registre |

## 5. Violation de données

Procédure : détection (monitoring, audit) → évaluation → notification à l'Autorité de protection des données dans les 72 h si nécessaire → information des cabinets et entreprises concernés. À détailler dans un runbook avant la mise en production.

## 6. Points ouverts

1. Durée de conservation du **journal d'audit** (également ouverte dans `FONCTIONNEMENT.md`).
2. Localisation des données chez Neon et Vercel (région UE à privilégier).
3. Modèle de contrat de sous-traitance cabinet ↔ SocialFlow.
