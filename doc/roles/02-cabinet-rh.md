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
     délai de grâce 7 j (D57)             accès complet jusqu'à        par le SuperAdmin
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
- Consommation des quotas (D15, § 9) : entreprises clientes, gestionnaires RH, stockage, en barres « utilisé / maximum ».
- Activité de paie **agrégée** (D26) pour la période en cours : fiches par statut (brouillon, à valider, validées, envoyées), retards, par gestionnaire et par entreprise. **Aucun montant de salaire.**
- Alertes : entreprise sans gestionnaire, invitations expirées, échéances ONSS proches (module calendrier), paiement en échec.

### 4.2 Équipe — Gestionnaires RH
| Action | Règles |
|---|---|
| Inviter | Email ; invitation `GESTIONNAIRE_RH` valable 7 jours ; refus si l'email a déjà un compte (D7) ou une invitation en cours ; **bloqué au-delà du quota `maxUtilisateurs`** (gestionnaires seulement, le titulaire ne compte pas, D56, § 9) |
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
| Inviter l'administrateur (D70) | Un seul admin par entreprise (D5) ; invitation `ENTREPRISE_CLIENTE` liée à l'entreprise, valable 7 jours, email au nom du cabinet (modèle modifiable) ; refus si l'entreprise a déjà un admin, si une invitation est en cours ou si l'adresse a déjà un compte (D7) ; renvoyer / révoquer depuis la ligne de l'entreprise ; ne compte pas dans les quotas. Remplacement de l'admin : à venir |
| Modifier | Coordonnées et assignations ; le n° d'entreprise n'est plus modifiable dès qu'une fiche existe |
| Archiver | Soft-delete ; l'entreprise et ses portails passent en lecture seule ; fiches conservées 5 ans |

Le Cabinet RH **ne voit pas** la liste des salariés ni le contenu des fiches d'une entreprise (D26) : uniquement compteurs et statuts.

### 4.4 Paramètres du cabinet (D30)
> Identité ✅ (D61) ; branding : nom, couleurs ✅ (D62) et logo ✅ (D63) ; modèles d'emails à venir.
- **Identité** : raison sociale, n° TVA, adresse, email et téléphone de contact (affichés aux clients).
- **Branding** (D33) : nom affiché (remplace « SocialFlow » dans les portails de ses clients et de son équipe), logo (image stockée hors base) et couleurs primaire/secondaire, appliqués aux portails Entreprise et Collaborateur, aux PDF de fiches et aux emails envoyés à ses clients. Valeurs par défaut : identité SocialFlow.
- **Modèles d'emails** : sujet et corps des emails envoyés à ses clients (invitations, fiche à valider, fiche disponible…) avec variables (`{{cabinet_nom}}`, `{{entreprise_nom}}`, `{{destinataire_prenom}}`, `{{lien}}`, `{{periode}}`). Bouton « rétablir le modèle par défaut » et aperçu.
- Pas de SMTP propre : envoi par Resend, nom d'expéditeur = nom du cabinet, adresse d'envoi SocialFlow, `Reply-To` = email de contact du cabinet.

### 4.5 Abonnement et facturation
- Page **Mon abonnement** (`/dashboard/cabinet/facturation`), **sans portail client Stripe** (D59) : abonnement, carte (modifiable sur une page Stripe, jamais supprimée), factures, résiliation en fin de période et reprise. Le changement de plan ou de périodicité se fait aussi dans SocialFlow, en fin de période et avec contrôle des quotas (D60).
- Le plan local suit toujours Stripe via le webhook, jamais l'inverse.
- **Export des données du cabinet** (D74) : onglet **Données** des paramètres, fichier JSON (identité, abonnement, équipe, entreprises et assignations, invitations, journal d'audit ; jamais de salaire, de fiche ni de secret). **Reste disponible en lecture seule** (résiliation, impayé, suspension). Chaque export est journalisé (`DATA_EXPORTED`).
- Downgrade impossible si la consommation actuelle dépasse les quotas du plan visé (message indiquant quoi réduire). Tout changement de plan ou de périodicité prend effet **en fin de période**, sans prorata (D60).

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
| Alertes du dashboard (§ 4.1) | `lib/cabinet-alerts.ts`, `components/cabinet/alerts.tsx` | ✅ Quota atteint ou ≥ 80 %, invitations expirées, gestionnaires suspendus, restauration à moins de 7 jours, aucun gestionnaire, entreprise sans gestionnaire actif (D69), paiement en échec. À venir : échéances ONSS |
| Journal d'audit du cabinet (D31) | `dashboard/cabinet/audit`, `lib/cabinet-audit.ts`, `components/cabinet/audit-log.tsx` | ✅ Filtres action, personne, période (heure de Bruxelles), pagination. Le cycle de vie du cabinet (création, suspension, archivage) n'y figure pas. Un SuperAdmin apparaît comme « Administration SocialFlow ». Les actions du SuperAdmin sur un utilisateur du cabinet n'y figurent pas (pas de `cabinetId` posé) ; les entreprises (création, modification avec assignations, archivage, restauration) figurent au journal ; les paramètres aussi |
| Quotas du plan (D15) | `lib/cabinet-quotas.ts`, `components/cabinet/quota-usage.tsx`, `PricingPlan.max*`, réglage dans la page Configuration SuperAdmin | ✅ Utilisateurs et entreprises bloquants (création, restauration, D69) ; stockage : valeur lue, blocage à brancher avec C5 |
| Inscription avec choix du plan | `(auth)/register`, `components/auth/register-flow.tsx` | Plan validé côté serveur (existe, non archivé) |
| Création automatique du cabinet | `lib/auth.ts`, hook après `/sign-up/email` | Nom = raison sociale saisie ; audit `CABINET_CREATED` |
| Essai Stripe 30 jours | `lib/stripe-trial.ts` | Customer + abonnement **sans moyen de paiement** (C1, remplacé par Stripe Checkout avec carte, D25 : `lib/stripe-checkout.ts`) ; pose `ESSAI`, `trialEndsAt` et `currentPeriodEnd` sur le cabinet |
| Prix annuel (D58) | `lib/billing.ts` (`stripeUnitAmountCents`, `monthlyEquivalentFromStripe`), `scripts/resync-yearly-prices.mjs` | ✅ Le prix annuel d'un plan est un montant mensuel équivalent ; Stripe facture 12 fois ce montant une fois par an. Le script remet en phase les prix déjà créés (simulation par défaut, `--apply` pour écrire) |
| Reprise du paiement (D25, D32) | `app/dashboard/cabinet/paiement`, `lib/stripe-checkout.ts`, `lib/cabinet-access.ts` (`requirePaidCabinet`), `components/cabinet/payment-start.tsx` | ✅ Cabinet `EN_ATTENTE_PAIEMENT` : les pages du Cabinet RH renvoient vers l'écran de paiement ; retour de Stripe confirmé côté serveur ; annulation sans perte du compte. Le prix affiché est celui que Stripe facturera |
| Page Mon abonnement (D59) | `app/dashboard/cabinet/facturation`, `lib/cabinet-billing.ts`, `lib/cabinet-subscription.ts`, `api/billing/card`, `api/billing/subscription/{cancel,resume}`, `components/cabinet/subscription-details.tsx`, `subscription-actions.tsx` | ✅ Plan, période, montant facturé (annuel : total par an et équivalent mensuel, D58), échéance, carte enregistrée et remplacement (page Stripe, jamais supprimée), factures (PDF), résiliation en fin de période avec confirmation, reprise, quotas. Audit : `SUBSCRIPTION_CANCEL_SCHEDULED`, `SUBSCRIPTION_CANCEL_REVERTED`, `PAYMENT_METHOD_UPDATED`. Accessible en lecture seule. |
| Changement de plan (D60) | `lib/plan-change.ts`, `api/billing/plan-change` (+ `/cancel`), `components/cabinet/plan-change.tsx` | ✅ Choix du plan et de la périodicité sur la page Facturation, en fin de période, sans prorata ; refus avec message si les quotas du plan visé sont dépassés ; changement en attente affiché et annulable. Audit `PLAN_CHANGE_SCHEDULED` / `PLAN_CHANGE_CANCELLED`. **Reste** : relire les quotas au moment du passage |
| Paramètres : identité (D30, D61) | `dashboard/cabinet/parametres`, `lib/cabinet-identity.ts`, `api/cabinet/settings/identity` (PATCH), `components/cabinet/identity-form.tsx`, colonnes `Cabinet.vatNumber/addressLine/postalCode/city/country/contactEmail/contactPhone` | ✅ Raison sociale, n° de TVA belge validé (modulo 97), adresse, contact. Lecture seule respectée (423), audit `CABINET_SETTINGS_UPDATED` (champs modifiés seulement). **Reste** : branding (nom affiché, logo, couleurs) et modèles d'emails |
| Paramètres : branding (D33, D62) | `lib/branding-rules.ts` (pur), `lib/color.ts`, `lib/cabinet-branding.ts`, `api/cabinet/settings/branding` (PATCH), `components/cabinet/branding-form.tsx`, `dashboard/cabinet/layout.tsx` (thème), colonnes `Cabinet.displayName/primaryColor/secondaryColor` | ✅ Nom affiché et couleurs avec aperçu en direct, contraste WCAG AA vérifié (suggestion d'une teinte plus foncée), thème clair et sombre, retour aux valeurs par défaut, audit sans les valeurs. **Reste** : application aux portails Entreprise et Collaborateur, PDF et emails, white-label Enterprise |
| Paramètres : logo (D33, D63) | `lib/logo-validation.ts`, `lib/logo-storage.ts` (interface, Vercel Blob, simulée), `lib/cabinet-logo.ts`, `api/cabinet/settings/logo` (POST, DELETE), `components/cabinet/logo-form.tsx`, colonnes `Cabinet.logoUrl/logoPath` | ✅ PNG ou SVG ≤ 1 Mo contrôlé sur le contenu ; PNG redimensionné à 512 px max et ré-encodé (`lib/logo-image.ts`, sharp) ; SVG dangereux refusé, stockage Vercel Blob, remplacement et retrait, logo affiché dans la sidebar, audit. Variable `BLOB_READ_WRITE_TOKEN` |
| Emails au nom du cabinet (D30, D33, D64) | `lib/email-brand.ts` (pur), `lib/cabinet-email-brand.ts`, `lib/email.ts` (`sendGestionnaireInvitationEmail`, `sendGestionnaireAccessChangedEmail`) | ✅ Invitation et changements d'accès : nom, couleur, logo PNG, expéditeur et Reply-To du cabinet ; « Propulsé par SocialFlow » en pied. Emails de compte (connexion, mot de passe, 2FA, vérification…) : même identité par l'adresse du destinataire (D66) ; plateforme (paiement) et SuperAdmin inchangés. **Reste** : modèles personnalisables (sujet et corps) |
| Page d'acceptation au nom du cabinet (D33, D65) | `(auth)/invitations/accept`, `lib/invitation-preview.ts`, `components/auth/auth-brand-panel.tsx` (prop `brand`), `lib/role-labels.ts` | ✅ Nom, logo, couleur et onglet du cabinet pour un jeton valide ; rien révélé pour un jeton invalide. Libellé de rôle lisible |
| Suppression du compte du titulaire (D67) | `lib/account-deletion-guard.ts`, `lib/auth.ts` (hook avant `/delete-user` et `/delete-user/callback`), `components/auth/delete-account.tsx` | ✅ Refusée tant que l'abonnement court (essai, actif, délai de grâce, impayé), à la demande et à la confirmation ; message et lien vers « Mon abonnement » sur le profil. Gestionnaires non concernés |
| Paramètres : modèles d'emails (D30, D68) | `lib/email-templates.ts` (pur), `lib/cabinet-email-templates.ts`, `api/cabinet/settings/email-templates/[type]` (PUT, DELETE) et `/test` (POST), `components/cabinet/email-template-editor.tsx`, table `EmailTemplate` | ✅ Sujet et message de l'invitation de gestionnaire avec variables, texte enrichi limité et échappé, aperçu en direct, test envoyé à soi-même, retour au modèle par défaut, audit sans le contenu. **Reste** : les autres types (invitation entreprise, fiches…) avec leurs modules |
| Lecture seule (D29, D57) | `lib/api-guard.ts` (`writable: true`), `lib/billing.ts` (`isReadOnlyBillingStatus`), `components/cabinet/billing-banner.tsx` | ✅ Cabinet `IMPAYE` ou `RESILIE` : toute écriture du Cabinet RH → `423 CABINET_READ_ONLY` (invitations, gestionnaires, acceptation d'invitation), bandeau permanent. Le délai de grâce laisse tout fonctionner avec le bandeau. Les routes des futurs rôles devront aussi passer `writable: true` |
| Abonnement du cabinet (D55) | `Cabinet.planId` / `billingPeriod` / `billingStatus` / `trialEndsAt` / `currentPeriodEnd`, `lib/billing.ts`, carte Abonnement du dashboard | ✅ Affichage de l'état et de « J-x » ; alertes essai (≤ 7 jours), paiement en échec, impayé, résiliation. Un client ne peut pas changer le plan d'un cabinet qui en a déjà un |
| Invitation de gestionnaire | `api/invitations`, `components/dashboard/invite-gestionnaire.tsx` | Jeton 7 jours, email via Resend |
| Acceptation d'invitation | `api/invitations/accept`, `(auth)/invitations/accept` | Crée le compte par mot de passe, supprime le cabinet « fantôme » créé par le hook |
| Vue d'ensemble du cabinet | `dashboard/cabinet`, `lib/cabinet-data.ts` (`getCabinetOverview`), `components/layout/dashboard-shell.tsx` | ✅ |
| Page Gestionnaires | `dashboard/cabinet/gestionnaires`, `components/cabinet/gestionnaires-manager.tsx` | ✅ Liste des gestionnaires et des invitations, avec actions |
| Renvoyer / révoquer une invitation | `api/invitations/[id]/resend` (POST), `api/invitations/[id]` (DELETE) | ✅ Jeton haché (C3), audit |
| Modifier l'email d'un gestionnaire | `api/gestionnaires/[id]/email` (POST), `components/cabinet/edit-email-dialog.tsx` | ✅ D53 |
| Suspendre / réactiver / retirer / restaurer un gestionnaire | `api/gestionnaires/[id]` (PATCH, DELETE, PUT), `components/cabinet/gestionnaire-actions.tsx`, `gestionnaire-restore.tsx` | ✅ D52. Suspendre ou retirer le dernier gestionnaire actif d'une entreprise est refusé (`409 GESTIONNAIRE_HAS_UNCOVERED_ENTREPRISES`, D27, D69) |
| Portefeuille d'entreprises (D4, D27, D69) | `dashboard/cabinet/entreprises`, `lib/cabinet-entreprises.ts`, `lib/entreprise-http.ts`, `api/cabinet/entreprises` (POST) et `[id]` (PATCH, DELETE, PUT), `components/cabinet/entreprises-manager.tsx`, `entreprise-form-dialog.tsx`, `entreprise-create.tsx`, `entreprise-actions.tsx`, `entreprise-restore.tsx`, tables `Entreprise` et `GestionnaireEntreprise` | ✅ Créer, modifier (coordonnées et assignations), archiver, restaurer ; n° belge validé et unique dans le cabinet ; quota `maxEntreprises` sous verrou ; audit sans valeurs ; alerte « entreprise sans gestionnaire actif ». **Invitation de l'administrateur** (D5, D70) : ✅ `lib/entreprise-admin.ts`, `api/cabinet/entreprises/[id]/admin-invitation`, `components/cabinet/entreprise-admin-invite.tsx`, accueil `dashboard/entreprise`. **Reste** : remplacement de l'administrateur, blocage du n° dès qu'une fiche existe, compteurs de fiches par entreprise (D26), portails en lecture seule à l'archivage |

## 7. Écarts à corriger (dette)

| # | Problème | Correction |
|---|---|---|
| C1 | ~~Essai créé sans carte~~ | ✅ Corrigé le 15/10 : `provisionStripeTrial` supprimé ; `POST /api/billing/checkout` crée une **session Stripe Checkout** (carte obligatoire, essai de 30 jours), `POST /api/billing/checkout/confirm` applique l'abonnement au retour sans attendre le webhook, et l'écran `dashboard/cabinet/paiement` (D32) est le seul accès tant que rien n'est payé. **Reste** : supprimer `User.plan` / `User.billingPeriod` |
| C2 | ~~Plan stocké sur `User.plan` / `User.billingPeriod`~~ ✅ **Corrigé le 18/10 (D73) : plus aucune lecture ni écriture de ces champs ; colonnes supprimées le 19/10 (migration `drop_user_plan`)** | Corrigé le 14/10 (D55) : `Cabinet.planId`, `billingPeriod`, `billingStatus`, `trialEndsAt`, `currentPeriodEnd`. `User.plan` n'est plus lu ; les colonnes seront supprimées avec Stripe Checkout (C1). Reste : transitions par webhook et blocage `423` (chantier C0) |
| C3 | ~~Jeton d'invitation stocké en clair~~ | Corrigé le 13/10 : `Invitation.tokenHash` = `sha256(token)` (voir `lib/invitations.ts`) |
| C4 | ~~Acceptation d'invitation : mot de passe uniquement~~ | ✅ Corrigé le 18/10 (D73) : Google et Microsoft sont proposés sur la page d'invitation ; l'email **vérifié** du compte doit être celui de l'invitation et le compte doit être neuf (`api/invitations/accept/oauth`, `lib/invitation-accept.ts`). **À tester dans le navigateur** avec de vrais comptes |
| C5 | ~~Pas de renvoi ni de révocation d'invitation~~ | Corrigé le 13/10 (voir § 6) |
| C6 | ~~Acceptation via inscription + suppression du cabinet « fantôme »~~ | ✅ Corrigé le 18/10 (D73) : le compte est créé par `lib/invitation-accept.ts` (fonctions internes de better-auth), puis rattaché à l'invitation en **une transaction** ; plus de cabinet fantôme, et le compte est supprimé si le rattachement échoue |
| C7 | Suspension manuelle par le SuperAdmin = blocage total des connexions de tout le cabinet | ✅ **Corrigé le 18/10 (D71)** : lecture seule par défaut (comme l'impayé, D29) avec message adapté à chaque rôle, export autorisé et aucun envoi automatique ; blocage total **optionnel**, choisi explicitement par le SuperAdmin avec un motif obligatoire ; type et motif tracés dans l'audit |
| C8 | ~~Échec Stripe silencieux à l'inscription (`catch(() => {})`)~~ | Corrigé avec C1 : l'inscription ne contacte plus Stripe ; les échecs de Checkout sont journalisés et renvoyés (`CHECKOUT_FAILED`, `PRICE_NOT_FOUND`) |

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
| Gestionnaires RH (`maxUtilisateurs`, titulaire exclu, D56) | 3 | 10 | illimité |
| Stockage (`maxStorageMb`) | 5 Go | 25 Go | 100 Go |

- Les comptes Entreprise cliente et Collaborateur ne comptent **pas** dans le quota, pas plus que le titulaire (Cabinet RH).
- Options : +25 €/mois par utilisateur supplémentaire, +10 €/mois par tranche de 10 Go (articles Stripe additionnels qui augmentent le quota).
- **Règles appliquées (octobre 2026)** : `null` = illimité ; seuls les gestionnaires non archivés sont comptés (**suspendus compris** ; le titulaire n'est pas compté, D56) ; une **invitation en attente réserve une place** ; restaurer un gestionnaire retiré reprend une place. Un cabinet sans plan connu n'est soumis à aucun quota. Un plan archivé continue de s'appliquer à ceux qui l'ont déjà.

## 10. Fonctionnalités par plan

| Fonctionnalité | Starter | Pro | Enterprise |
|---|---|---|---|
| Portails, fiches de paie, calendrier ONSS | ✓ | ✓ | ✓ |
| DIMONA et déclarations ONSS (D36) | ✓ | ✓ | ✓ |
| Nom affiché, logo, couleurs (D35) | ✓ | ✓ | ✓ |
| Intégrations comptables (Exact Online…) | — | ✓ | ✓ |
| White-label : domaine personnalisé, aucune mention SocialFlow | — | — | ✓ |

Les droits par plan sont vérifiés côté serveur (`403 PLAN_FEATURE_UNAVAILABLE`), pas seulement masqués dans l'interface.
