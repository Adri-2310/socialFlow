# Rôle : Cabinet RH

> Statut : **fondations construites** (inscription, création du cabinet, essai Stripe, invitation de gestionnaire) ; **portail en cours** : vue d'ensemble, gestion des gestionnaires et des invitations (13/10).
> Décisions de référence : [DECISIONS.md](../DECISIONS.md) D3, D4, D15, D19, D23–D31, D52.

## 1. Mission

Le Cabinet RH est le **client payant** de SocialFlow : un secrétariat social ou un cabinet de paie qui gère la paie de plusieurs entreprises. Son compte est un **rôle de pilotage** (D3) : il gère l'abonnement, son équipe de gestionnaires, son portefeuille d'entreprises clientes et l'identité visuelle présentée à ses clients. **Il ne prépare pas de fiches de paie** ; pour produire, il faut un compte Gestionnaire RH.

## 2. Identité et accès

| Élément | Règle |
|---|---|
| Code du rôle | `CABINET_RH` |
| Nombre par cabinet | **Un seul** : le titulaire qui a inscrit le cabinet (D24) |
| Création | Auto-inscription publique sur `/register` uniquement (D19) |
| Rattachement | `User.cabinetId` = son cabinet, posé par le serveur (jamais par le client) |
| 2FA | Conseillée (bandeau d'incitation), non obligatoire (D20) |
| Point d'entrée | `/dashboard/cabinet` (`/dashboard` y redirige) |

## 3. Cycle de vie d'un cabinet

```
/register (identité + plan + mensuel/annuel)
   │
   ▼
Stripe Checkout : carte + essai 30 j (D25) ──abandon──► compte conservé (D32), cabinet « en attente de paiement »,
   │                                                     seul accès : l'écran « reprendre le paiement »
   ▼
ESSAI (trialing) ─► fin d'essai : débit auto ─► ACTIF
                                                  │
              ┌───────────────────────────────────┼──────────────────────────────┐
              ▼                                   ▼                              ▼
     paiement échoué                       résiliation (D28)            suspension manuelle
     délai de grâce 14 j (D23)             accès complet jusqu'à        par le SuperAdmin
     │ non régularisé                      la fin de période
     ▼                                     ▼
     SUSPENDU (impayé)                     LECTURE SEULE 90 j (export possible)
     portails clients en lecture (D29)     │
     │ paiement régularisé → ACTIF         ▼
                                           ARCHIVÉ ─► purge des données non légales après 90 j ;
                                                      fiches de paie conservées 5 ans
```

## 4. Fonctionnalités

### 4.1 Tableau de bord (à construire)
- Abonnement : plan, statut (essai J-x / actif / délai de grâce / suspendu), prochaine échéance.
- Consommation des quotas (D15, § 9) : entreprises clientes, utilisateurs du cabinet, stockage, en barres « utilisé / maximum ».
- Activité de paie **agrégée** (D26) pour la période en cours : fiches par statut (brouillon, à valider, validées, envoyées), retards, par gestionnaire et par entreprise. **Aucun montant de salaire.**
- Alertes : entreprise sans gestionnaire, invitations expirées, échéances ONSS proches (module calendrier), paiement en échec.

### 4.2 Équipe — Gestionnaires RH
| Action | Règles |
|---|---|
| Inviter | Email ; invitation `GESTIONNAIRE_RH` valable 7 jours ; refus si l'email a déjà un compte (D7) ou une invitation en cours ; **bloqué au-delà du quota `maxUtilisateurs`** (Cabinet RH + gestionnaires, § 9) |
| Suivre les invitations | Liste : email, statut (en attente, acceptée, expirée, révoquée), date d'expiration ; actions **renvoyer** (nouveau jeton, nouvelle date) et **révoquer** |
| Assigner | Associer un gestionnaire à une ou plusieurs entreprises (relation N:M) |
| Suspendre (D52) | Réversible. Sessions coupées, connexion refusée avec un message l'invitant à contacter son cabinet ; le gestionnaire est **prévenu par email**. **Interdit tant qu'une entreprise lui est assignée sans autre gestionnaire** (D27, à appliquer avec les entreprises) |
| Réactiver (D52) | Réautorise la connexion, email au gestionnaire. Impossible pour une suspension posée par le SuperAdmin (`403 SUSPENDED_BY_ADMIN`) |
| Retirer (archiver) | Compte archivé, sessions coupées, email au gestionnaire. **Restaurable par le Cabinet RH pendant 30 jours** (D52) ; purge à 90 jours |
| Modifier l'email (D53) | Nouvelle adresse non vérifiée : confirmation par email, sessions coupées, ancienne adresse prévenue. Refus si l'adresse a déjà un compte ou une invitation (D7) |

### 4.3 Portefeuille — Entreprises clientes (D4)
| Action | Règles |
|---|---|
| Créer | Raison sociale, n° d'entreprise/TVA belge (format `BE0XXX.XXX.XXX`, unique dans le cabinet), adresse, email de contact ; **au moins un gestionnaire assigné** ; bloqué au-delà de `maxEntreprises` |
| Inviter l'administrateur | Un seul admin par entreprise (D5) ; invitation `ENTREPRISE_CLIENTE` liée à l'entreprise ; renvoyer / révoquer |
| Modifier | Coordonnées et assignations ; le n° d'entreprise n'est plus modifiable dès qu'une fiche existe |
| Archiver | Soft-delete ; l'entreprise et ses portails passent en lecture seule ; fiches conservées 5 ans |

Le Cabinet RH **ne voit pas** la liste des salariés ni le contenu des fiches d'une entreprise (D26) : uniquement compteurs et statuts.

### 4.4 Paramètres du cabinet (D30)
- **Identité** : raison sociale, n° TVA, adresse, email et téléphone de contact (affichés aux clients).
- **Branding** (D33) : nom affiché (remplace « SocialFlow » dans les portails de ses clients et de son équipe), logo (image stockée hors base) et couleurs primaire/secondaire, appliqués aux portails Entreprise et Collaborateur, aux PDF de fiches et aux emails envoyés à ses clients. Valeurs par défaut : identité SocialFlow.
- **Modèles d'emails** : sujet et corps des emails envoyés à ses clients (invitations, fiche à valider, fiche disponible…) avec variables (`{{cabinet_nom}}`, `{{entreprise_nom}}`, `{{destinataire_prenom}}`, `{{lien}}`, `{{periode}}`). Bouton « rétablir le modèle par défaut » et aperçu.
- Pas de SMTP propre : envoi par Resend, nom d'expéditeur = nom du cabinet, adresse d'envoi SocialFlow, `Reply-To` = email de contact du cabinet.

### 4.5 Abonnement et facturation
- Bouton « Gérer mon abonnement » → **portail client Stripe** (changer de plan ou de périodicité, carte, factures, résiliation).
- Le plan local suit toujours Stripe via le webhook, jamais l'inverse.
- Downgrade impossible si la consommation actuelle dépasse les quotas du plan visé (message indiquant quoi réduire).

### 4.6 Journal d'audit du cabinet (D31)
Actions de son cabinet uniquement : invitations (envoyée, acceptée, révoquée), assignations, création/archivage d'entreprises, désactivations, changements de paramètres et d'abonnement, connexions de son équipe. Filtres par action, personne et période.

### 4.7 Commun à tous les rôles (existant)
Profil (`/profil`) : nom, email (avec confirmation), mot de passe, 2FA, comptes Google/Microsoft liés, suppression du compte. ⚠️ Pour le titulaire du cabinet, la suppression de son compte doit être **bloquée** tant que l'abonnement est actif (il doit d'abord résilier).

## 5. Ce que le Cabinet RH ne peut pas faire

- Créer, modifier, valider ou envoyer une fiche de paie (D3).
- Voir les salaires, les fiches ou les dossiers salariés (D26).
- Créer ou inviter des collaborateurs (D6).
- Avoir un deuxième compte Cabinet RH (D24).
- Accéder aux données d'un autre cabinet (isolation multi-tenant).

## 6. Existant dans le code

| Élément | Où | Remarque |
|---|---|---|
| Quotas du plan (D15) | `lib/cabinet-quotas.ts`, `components/cabinet/quota-usage.tsx`, `PricingPlan.max*`, réglage dans la page Configuration SuperAdmin | ✅ Utilisateurs bloquants (invitation, restauration) ; entreprises et stockage : valeur lue, blocage à brancher avec C1 et C5 |
| Inscription avec choix du plan | `(auth)/register`, `components/auth/register-flow.tsx` | Plan validé côté serveur (existe, non archivé, pas « sur devis ») |
| Création automatique du cabinet | `lib/auth.ts`, hook après `/sign-up/email` | Nom = raison sociale saisie ; audit `CABINET_CREATED` |
| Essai Stripe 30 jours | `lib/stripe-trial.ts` | Customer + abonnement **sans moyen de paiement** |
| Invitation de gestionnaire | `api/invitations`, `components/dashboard/invite-gestionnaire.tsx` | Jeton 7 jours, email via Resend |
| Acceptation d'invitation | `api/invitations/accept`, `(auth)/invitations/accept` | Crée le compte par mot de passe, supprime le cabinet « fantôme » créé par le hook |
| Vue d'ensemble du cabinet | `dashboard/cabinet`, `lib/cabinet-data.ts` (`getCabinetOverview`), `components/layout/dashboard-shell.tsx` | ✅ |
| Page Gestionnaires | `dashboard/cabinet/gestionnaires`, `components/cabinet/gestionnaires-manager.tsx` | ✅ Liste des gestionnaires et des invitations, avec actions |
| Renvoyer / révoquer une invitation | `api/invitations/[id]/resend` (POST), `api/invitations/[id]` (DELETE) | ✅ Jeton haché (C3), audit |
| Modifier l'email d'un gestionnaire | `api/gestionnaires/[id]/email` (POST), `components/cabinet/edit-email-dialog.tsx` | ✅ D53 |
| Suspendre / réactiver / retirer / restaurer un gestionnaire | `api/gestionnaires/[id]` (PATCH, DELETE, PUT), `components/cabinet/gestionnaire-actions.tsx`, `gestionnaire-restore.tsx` | ✅ D52. ⚠️ Devra refuser l'action tant qu'une entreprise n'est couverte que par ce gestionnaire (D27), dès que les entreprises existeront |

## 7. Écarts à corriger (dette)

| # | Problème | Correction |
|---|---|---|
| C1 | Essai créé sans carte : Stripe ne pourra rien débiter (contraire à D25) | Remplacer `provisionStripeTrial` par une **session Stripe Checkout** (`mode: subscription`, `trial_period_days: 30`) ; le cabinet est activé par le webhook `checkout.session.completed` |
| C2 | Plan stocké sur `User.plan` / `User.billingPeriod` | Déplacer sur `Cabinet` (`planId`, `billingPeriod`, `billingStatus`, `trialEndsAt`, `currentPeriodEnd`) ; le plan appartient au cabinet, pas à une personne |
| C3 | ~~Jeton d'invitation stocké en clair~~ | Corrigé le 13/10 : `Invitation.tokenHash` = `sha256(token)` (voir `lib/invitations.ts`) |
| C4 | Acceptation d'invitation : mot de passe uniquement | Proposer aussi Google/Microsoft (email du compte OAuth = email invité) |
| C5 | ~~Pas de renvoi ni de révocation d'invitation~~ | Corrigé le 13/10 (voir § 6) |
| C6 | Acceptation via inscription + suppression du cabinet « fantôme » | Fragile : prévoir une création de compte dédiée aux invitations, sans passer par le hook d'auto-inscription |
| C7 | Suspension = blocage total des connexions de tout le cabinet | Adapter à D29 : portails Entreprise et Collaborateur en lecture seule |
| C8 | Échec Stripe silencieux à l'inscription (`catch(() => {})`) | Avec C1, l'inscription n'est finalisée qu'après Checkout ; journaliser toute erreur |

## 8. Critères d'acceptation

- Un Cabinet RH ne peut jamais lire une donnée dont le `cabinetId` diffère du sien : test d'intégration obligatoire pour chaque nouvelle route.
- Toute création bloquée par un quota renvoie `403 QUOTA_EXCEEDED` avec le quota concerné, et l'interface propose de changer de plan.
- Désactiver un gestionnaire ayant une entreprise non couverte renvoie `409 GESTIONNAIRE_HAS_UNCOVERED_ENTREPRISES` avec la liste.
- Aucune réponse d'API destinée au Cabinet RH ne contient de montant de salaire ni de NISS.
- Chaque action de la section 4 écrit une entrée d'audit portant son `cabinetId`.

## 9. Quotas par plan (D34, cahier des charges client)

| Quota | Starter | Pro | Enterprise |
|---|---|---|---|
| Entreprises clientes (`maxEntreprises`) | 25 | 100 | illimité |
| Utilisateurs du cabinet (`maxUtilisateurs` = Cabinet RH + gestionnaires) | 3 | 10 | illimité |
| Stockage (`maxStorageMb`) | 5 Go | 25 Go | 100 Go |

- Les comptes Entreprise cliente et Collaborateur ne comptent **pas** dans les utilisateurs du cabinet.
- Options : +25 €/mois par utilisateur supplémentaire, +10 €/mois par tranche de 10 Go (articles Stripe additionnels qui augmentent le quota).
- **Règles appliquées (octobre 2026)** : `null` = illimité ; les utilisateurs comptés sont le Cabinet RH et les gestionnaires non archivés (**suspendus compris**) ; une **invitation en attente réserve une place** ; restaurer un gestionnaire retiré reprend une place. Un cabinet sans plan connu n'est soumis à aucun quota. Un plan archivé continue de s'appliquer à ceux qui l'ont déjà.

## 10. Fonctionnalités par plan

| Fonctionnalité | Starter | Pro | Enterprise |
|---|---|---|---|
| Portails, fiches de paie, calendrier ONSS | ✓ | ✓ | ✓ |
| DIMONA et déclarations ONSS (D36) | ✓ | ✓ | ✓ |
| Nom affiché, logo, couleurs (D35) | ✓ | ✓ | ✓ |
| Intégrations comptables (Exact Online…) | — | ✓ | ✓ |
| White-label : domaine personnalisé, aucune mention SocialFlow | — | — | ✓ |

Les droits par plan sont vérifiés côté serveur (`403 PLAN_FEATURE_UNAVAILABLE`), pas seulement masqués dans l'interface.
