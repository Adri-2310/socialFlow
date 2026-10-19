# Rôle : SuperAdmin

> Statut : **construit en grande partie** (branche `feature/dashboard`). Ce document décrit le comportement réel du code ; les sections « À faire » listent ce qui manque.
> Décisions de référence : [DECISIONS.md](../DECISIONS.md) (D8, D15).

## 1. Mission

Le SuperAdmin est l'exploitant de la plateforme SocialFlow. Il supervise les cabinets abonnés, les comptes, la facturation et la santé du service. **Il n'accède jamais aux données métier des clients** (entreprises, salariés, fiches de paie, documents) — règle RGPD stricte (D8).

## 2. Identité et accès

| Élément | Règle |
|---|---|
| Code du rôle | `SUPER_ADMIN` (`User.role`) |
| Rattachement | Aucun cabinet (`User.cabinetId = null`) |
| Création du compte | Par script d'installation (D18) ✅, voir § 4.6. Cible : un SuperAdmin existant invite le suivant ; le script ne sert qu'à l'installation initiale |
| 2FA | **Obligatoire** (D20) ✅ : sans 2FA activée, accès à la console bloqué (pages et API) et redirection vers l'activation sur `/profil` |
| Inscription publique | Impossible : `/register` crée toujours un `CABINET_RH` |
| Connexion | Méthodes Better Auth communes à tous les rôles (mot de passe, lien magique, code email, Google, Microsoft) |
| Point d'entrée | `/dashboard` redirige vers `/dashboard/admin` |
| Garde des pages | `requireSession({ role: 'SUPER_ADMIN', twoFactor: true })` dans `app/dashboard/admin/layout.tsx` (redirige sinon vers `/dashboard`, ou vers `/profil?2fa=requise` sans 2FA) |
| Garde des API | Chaque route `api/admin/*` passe par `requireApiSession(request, { role: 'SUPER_ADMIN', twoFactor: true })` (`lib/api-guard.ts`) : session (401), rôle (403), puis 2FA (403 `TWO_FACTOR_REQUIRED`), en JSON |

## 3. Écrans existants

| Écran | Route | Ce qu'il fait |
|---|---|---|
| Vue d'ensemble | `/dashboard/admin` | KPIs (cabinets actifs, nouveaux du mois, MRR réel Stripe), répartition par plan, aperçu des 10 derniers cabinets et des 10 dernières entrées d'audit, résumé monitoring |
| Cabinets | `/dashboard/admin/cabinets` | Liste triable : nom, statut, plan, nombre de gestionnaires, date de création. Actions : suspendre (lecture seule par défaut, blocage total optionnel avec motif, D71), bloquer les connexions d'un cabinet en lecture seule, réactiver, archiver, restaurer |
| Utilisateurs | `/dashboard/admin/utilisateurs` | Liste de tous les comptes (nom, email, rôle, statut, cabinet). Actions : suspendre, réactiver, archiver, restaurer, révoquer les sessions, envoyer un lien de réinitialisation |
| Monitoring | `/dashboard/admin/monitoring` | Santé et latence de la base, sessions actives, utilisateurs actifs distincts, cabinets/utilisateurs par statut, top 10 des compteurs du rate limiter |
| Journal d'audit | `/dashboard/admin/audit` | Historique des actions (acteur, cabinet ou utilisateur visé, date) |
| Facturation | `/dashboard/admin/facturation` | Abonnements Stripe en direct par cabinet (plan, montant, période, statut, fin de période) et MRR |
| Configuration | `/dashboard/admin/configuration` | Gestion des plans tarifaires (`PricingPlan`) synchronisés avec Stripe, et état de la connexion Stripe |

## 4. Règles métier (implémentées)

### 4.1 Cabinets — `api/admin/cabinets/[id]`
| Action | Méthode | Effet | Audit |
|---|---|---|---|
| Suspendre (D71) | `PATCH {status:'suspendu', mode?, reason?}` | `mode` = `READ_ONLY` (**par défaut**) : `Cabinet.status = 'suspendu'`, lecture seule (`423` aux écritures), connexions et sessions conservées, motif facultatif. `mode` = `BLOCKED` : motif **obligatoire** (`400 REASON_REQUIRED`), sessions des membres supprimées, plus aucune connexion. Motif limité à 500 caractères (`REASON_TOO_LONG`), mode inconnu → `INVALID_MODE`. Repasser de `READ_ONLY` à `BLOCKED` est possible. Type et motif dans `Cabinet.suspensionType` / `suspensionReason` | `CABINET_SUSPENDED` (métadonnées `mode`, `reason`, `previousMode`) |
| Réactiver | `PATCH {status:'actif'}` | `Cabinet.status = 'actif'` | `CABINET_REACTIVATED` |
| Archiver | `DELETE` | Supprime les sessions, `Cabinet.deletedAt = now` ; accès bloqué ; purge définitive après **90 jours** (`CABINET_DELETION_RETENTION_DAYS`, cron `purge-deleted-cabinets` à 4 h) | `CABINET_ARCHIVED` |
| Restaurer | `PUT` | `deletedAt = null` (le statut suspendu éventuel est conservé) | `CABINET_RESTORED` |

Refus : cabinet introuvable (404), action sur un cabinet archivé (400), archivage d'un cabinet déjà archivé (400).

### 4.2 Utilisateurs — `api/admin/users/[id]`
Même mécanique que les cabinets, mais limitée à un seul compte : les autres membres du cabinet ne sont pas touchés.
| Action | Effet | Audit |
|---|---|---|
| Suspendre / réactiver | `User.status` + suppression des sessions à la suspension | `USER_SUSPENDED` / `USER_REACTIVATED` |
| Archiver / restaurer | `User.deletedAt` ; purge après **90 jours** (`ACCOUNT_DELETION_RETENTION_DAYS`, cron à 3 h) | `USER_ARCHIVED` / `USER_RESTORED` |
| Révoquer les sessions (D21) | `POST …/revoke-sessions` : supprime toutes les sessions du compte, qui peut se reconnecter ensuite. Audit dans la même transaction | `USER_SESSIONS_REVOKED` |
| Envoyer un lien de réinitialisation (D21) | `POST …/reset-password` : flux Better Auth standard (même email, lien valable 1 h), vers le portail du cabinet pour les rôles de portail. Le SuperAdmin ne voit et ne fixe jamais de mot de passe. La route confirme la demande du lien, pas la livraison (l'envoi se fait en arrière-plan) | `USER_PASSWORD_RESET_SENT` |

**Protection** : un compte `SUPER_ADMIN` ne peut être ni suspendu, ni archivé, ni visé par les outils de support par cette voie (évite de verrouiller la console). Les outils de support refusent aussi un compte archivé (`USER_ARCHIVED`) mais acceptent un compte suspendu.

### 4.3 Plans tarifaires — `api/admin/plans`
- Création, modification, archivage et restauration d'un `PricingPlan` (identifiant `[a-z0-9-]`, nom, description, prix mensuel et annuel en entiers, badge, mise en avant, ordre, au moins une fonctionnalité).
- Les prix sont répercutés dans Stripe (Product/Price) ; l'inscription n'accepte que les plans existants, non archivés.
- Audit : `PRICING_PLAN_CREATED | UPDATED | ARCHIVED | RESTORED`.

### 4.4 Données affichées
- La facturation n'est **pas dupliquée en base** : lue en direct dans Stripe à chaque chargement. Un cabinet sans `stripeCustomerId` n'y apparaît pas.
- MRR = somme des abonnements `active` ou `trialing` ; un prix annuel compte pour 1/12.
- Monitoring : uniquement des signaux réellement mesurés (pas d'uptime ni de CPU inventés).

### 4.5 Tâches planifiées (Vercel Cron, protégées par `CRON_SECRET`)
| Heure | Route | Rôle |
|---|---|---|
| 03:00 | `/api/cron/purge-deleted-accounts` | Purge définitive des comptes archivés depuis plus de 90 jours |
| 04:00 | `/api/cron/purge-deleted-cabinets` | Purge définitive des cabinets archivés depuis plus de 90 jours |
| 05:00 | `/api/cron/purge-expired-sessions` | Suppression des sessions expirées |
| 06:00 | `/api/cron/suspend-overdue-cabinets` | Passage en `IMPAYE` (lecture seule) des cabinets dont le délai de grâce de 7 jours est écoulé (D57) |

### 4.6 Création du premier SuperAdmin — `scripts/create-superadmin.ts` (D18)
```
cd apps/web
npm run superadmin:create -- prenom@exemple.be [--nom "Prénom Nom"] [--force]
```
Le script lit `.env.local` (`DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_SECRET`, clé Resend) et affiche l'hôte de la base visée avant d'agir. La logique est dans `lib/superadmin-bootstrap.ts`.
| Cas | Résultat |
|---|---|
| Adresse libre, aucun SuperAdmin | Compte créé sans cabinet ni mot de passe (`emailVerified` vrai, nom « SuperAdmin » sans `--nom`), audit `SUPERADMIN_BOOTSTRAPPED` dans la même transaction, puis email avec le lien standard (1 h) vers `/reinitialiser-mot-de-passe` : la personne choisit son mot de passe. Personne d'autre ne le voit ni ne le fixe (D21) |
| Un SuperAdmin existe déjà | Refus (`SUPER_ADMIN_EXISTS`), sauf avec `--force` qui crée un SuperAdmin de plus |
| Adresse d'un compte qui n'est pas SuperAdmin | Refus (`EMAIL_TAKEN`), même avec `--force` : un compte existant n'est jamais promu |
| Adresse d'un SuperAdmin qui a déjà un mot de passe | Rien n'est modifié (idempotent) |
| Adresse d'un SuperAdmin sans mot de passe | Le lien est renvoyé (lien expiré, ou email jamais parti), audit avec `resent` |
| Échec d'envoi de l'email | Erreur `EMAIL_SEND_FAILED` ; le compte reste créé, relancer la commande renvoie le lien |
À la première connexion, la 2FA obligatoire (D20) renvoie le SuperAdmin vers `/profil?2fa=requise`.

## 5. Ce que le SuperAdmin ne peut pas faire (par décision)

- Voir ou exporter les entreprises clientes, salariés, fiches de paie, documents ou messages (D8).
- Se connecter « à la place » d'un utilisateur (pas d'impersonation).
- Archiver ou suspendre un autre SuperAdmin.

## 6. À construire

| # | Sujet | Spécification |
|---|---|---|
| A1 ✅ | **2FA obligatoire** (D20) | `requireSession({ role: 'SUPER_ADMIN', twoFactor: true })` vérifie aussi `twoFactorEnabled` ; sinon redirection vers `/profil?2fa=requise` (section 2FA) avec un message explicite. Même contrôle dans chaque route `api/admin/*` via `requireApiSession(..., { twoFactor: true })` (403 `TWO_FACTOR_REQUIRED`). `/profil` reste accessible sans 2FA pour pouvoir l'activer |
| A2 (script ✅) | **Bootstrap pro** (D18) | ✅ Script `scripts/create-superadmin.ts` idempotent (email en argument, refuse s'il existe déjà un SuperAdmin sauf `--force`), qui envoie un lien de définition du mot de passe au lieu d'en fixer un (voir § 4.6). **À construire** : écran « Inviter un SuperAdmin » réservé aux SuperAdmins (invitation `role = SUPER_ADMIN`, 2FA exigée à l'acceptation) |
| A3 ✅ | **Outils de support** (D21) | Sur la page Utilisateurs : « Révoquer les sessions » (supprime les sessions, audit `USER_SESSIONS_REVOKED`) et « Envoyer un lien de réinitialisation » (flux Better Auth standard, audit `USER_PASSWORD_RESET_SENT`) |
| A4 | **Modifier un cabinet** (D19) | Fiche cabinet : nom, coordonnées, et changement de plan **uniquement via Stripe** (le plan local suit l'abonnement, jamais l'inverse). Audit `CABINET_UPDATED` avec avant/après |
| A5 | **Quotas par plan** (D15) | `PricingPlan` + `maxEntreprises`, `maxUtilisateurs`, `maxStorageMb` (`null` = illimité) et droits `integrations`, `whiteLabel`, éditables dans Configuration ; valeurs de départ = cahier des charges client (D34) |
| A6 | **Webhook Stripe + délai de grâce** (D23, D57) | Voir § 6.1. ✅ Webhook `api/webhooks/stripe` (signature, idempotence, ordre des événements, plan repris du prix) ; ✅ tâche quotidienne `api/cron/suspend-overdue-cabinets` (fin du délai de 7 jours → `IMPAYE`, emails au titulaire et aux SuperAdmins) ; ✅ refus des écritures en lecture seule (`423 CABINET_READ_ONLY`) pour les routes du Cabinet RH, via `requireApiSession({ writable: true })`, et bandeau d'abonnement |
| A7 | **Barèmes automatiques** (D22) | Voir § 6.2 |
| A8 | **Notifications in-app** | Modèle `Notification` (destinataire, type, message, lien, lu/non lu) + cloche dans l'en-tête, partagé par tous les rôles |
| A9 | Journal d'audit | Filtres (action, acteur, cabinet, période), export CSV ; ajout `ipAddress`, `userAgent`, `metadata Json` |
| A10 | Clés API, webhooks clients, white-label global | Phase ultérieure (D1) |

### 6.1 Cycle de facturation et impayés (proposition)

```
Inscription ─► essai 30 j (trialing) ─► 1er paiement ─► actif
                                          │ échec
                                          ▼
                               past_due : délai de grâce 7 j
                    (Stripe relance la carte ; email au titulaire et aux SuperAdmins à J0)
                          │ paiement OK          │ fin du délai
                          ▼                      ▼
                        actif         cabinet suspendu (status = 'suspendu',
                                       motif = 'impaye', sessions coupées)
                                                 │ paiement régularisé
                                                 ▼
                                       réactivation automatique
```

- Route `api/webhooks/stripe` : vérification de signature, idempotence (table `WebhookEvent`, `eventId` unique).
- Événements : `customer.subscription.updated` (trialing/active/past_due/canceled), `invoice.payment_failed`, `invoice.paid`, `customer.subscription.deleted`.
- Fin du délai : un cron quotidien passe à `IMPAYE` les cabinets en `past_due` depuis plus de 7 jours (D57).
- Alertes : email au titulaire du cabinet (Resend) et au SuperAdmin, plus une notification in-app pour chacun (A8). Bandeau rouge permanent dans le portail du cabinet pendant le délai de grâce.
- `Cabinet` gagne `billingStatus` (miroir de Stripe) et `suspendedReason` (`'admin' | 'impaye'`) : une suspension manuelle ne doit jamais être levée par un paiement.
- Durée du délai : **7 jours** (D57).

### 6.2 Barèmes de paie automatiques (proposition à valider, détail dans [modules/paie.md](../modules/paie.md) § 5)

Contrainte : un changement silencieux de barème fausserait des fiches de paie. L'automatisation doit donc **détecter et préparer**, pas appliquer à l'aveugle.

1. Les barèmes (taux ONSS, formule-clé du précompte professionnel, bonus à l'emploi, cotisation spéciale de sécurité sociale…) sont stockés en base, **versionnés avec une date de début de validité**. Une fiche utilise toujours la version valide à sa période, et enregistre l'identifiant de version utilisée.
2. Un job planifié vérifie les sources officielles (SPF Finances, ONSS) et importe toute nouvelle version en statut **« à vérifier »**.
3. Le SuperAdmin reçoit une alerte, compare l'ancienne et la nouvelle version, lance les fiches de test de référence, puis **active** la version.
4. Les fiches déjà envoyées ne sont jamais recalculées (D13).

⚠️ À vérifier avant de spécifier l'implémentation : format exact et URL des publications officielles (PDF, Excel, données ouvertes ?), et s'il existe une source exploitable automatiquement.

## 7. Questions ouvertes

1. ~~Délai de grâce de 14 jours~~ : fixé à **7 jours** (D57).
2. **Barèmes** : es-tu d'accord avec « détection automatique + activation validée par le SuperAdmin » ? L'alternative, un remplacement 100 % automatique, est risquée pour un logiciel de paie.
