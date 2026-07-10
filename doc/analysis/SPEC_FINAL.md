# SPEC FINAL — SocialFlow

**Document de référence unique pour implémentation** 
**Date:** 2026-06-30 
**Version:** 1.0 (après revue Opus) 
**Status:** Approuvé

---

## ARCHITECTURE COMPLETE & FINALE

```
PLATEFORME SOCIALFLOW

┌─ SuperAdmin (1) — Gère la CONFIGURATION GLOBALE de SocialFlow
│ │
│ ├─ STRIPE (Configuration):
│ │ ├─ Crée les plans (Starter/Pro/Enterprise)
│ │ ├─ Fixe les prix (99€/299€/custom)
│ │ ├─ Configure webhook Stripe
│ │ └─ Voit: tous les Cabinets, abonnements, factures globales
│ │
│ ├─ EMAIL GLOBAL (Configuration):
│ │ ├─ SMTP par défaut: Resend (pour invites, alerts système)
│ │ └─ Templates globaux: SocialFlow (invites Gestionnaire, etc.)
│ │
│ ├─ BRANDING GLOBAL (Configuration):
│ │ ├─ Logo SocialFlow (utilisé par défaut si Cabinet ne customise pas)
│ │ ├─ Couleurs SocialFlow (violet, teal - utilisées par défaut)
│ │ └─ Application name: "SocialFlow" (utilisé par défaut)
│ │
│ ├─ OAUTH GLOBAL (Configuration):
│ │ ├─ Google OAuth credentials (pour tous les Cabinets)
│ │ └─ Microsoft OAuth credentials (pour tous les Cabinets)
│ │
│ ├─ MONITORING & ADMIN (Dashboard):
│ │ ├─ Voir tous les Cabinets (liste, stats, usage)
│ │ ├─ Voir status de la plateforme (uptime, performance, DB health)
│ │ ├─ Voir audit logs globaux (toutes les actions, tous les Cabinets)
│ │ ├─ Créer Cabinet manuellement (sans Stripe - test, partenaires)
│ │ ├─ Suspendre/réactiver Cabinet (fraude, non-paiement)
│ │ └─ Voir factures globales
│ │
│ └─ GESTION UTILISATEURS (SuperAdmin only):
│ ├─ Voir TOUS les utilisateurs Cabinet RH & Gestionnaires (tous les Cabinets)
│ ├─ Reset password (forcer utilisateur à créer nouveau MDP)
│ │ → User reçoit email avec lien reset (1h TTL)
│ │
│ ├─ Suspendre/réactiver utilisateur (blocage accès)
│ │ → User ne peut plus login (JWT rejeté)
│ │ → Sessions existantes révoquées
│ │
│ ├─ Forcer 2FA (obliger activation)
│ │ → À next login, user DOIT configurer 2FA (email OTP OU TOTP)
│ │ → Peut pas skiper
│ │
│ ├─ Révoquer sessions (logout immédiat)
│ │ → Tous les tokens refresh = invalides
│ │ → User logout de tous les devices
│ │ → À next login = nouveau token
│ │
│ └─ Supprimer utilisateur (soft-delete + RGPD)
│ → User marqué deleted_at = NOW()
│ → Email remplacé par "DELETED_USER_XXX"
│ → Fiches de paie: conservées (légal 5 ans) mais détachées
│ → Audit logs: anonymisés
│
│ CAS D'USAGE:
│ • Reset password: user oublie, SuperAdmin envoie reset link
│ • Suspendre: user fraudeur ou comportement suspect
│ • Forcer 2FA: Cabinet RH demande 2FA obligatoire pour ses users
│ • Révoquer sessions: user quitte entreprise, logout immédiat
│ • Supprimer: RGPD droit à l'oubli
│
│ NE VOIT PAS (données client isolées):
│ ├─ Les Entreprises clientes (sauf via audit)
│ ├─ Les fiches de paie
│ ├─ Les salariés
│ └─ Aucune donnée confidentielle client
│
└─ Cabinet RH (N clients payants, abonnement Stripe)
 │
 ├─ AUTHENTICATION:
 │ ├─ Login: Magic Link + Password + OAuth (Google/Microsoft)
 │ └─ Session: 1h access token + 24h refresh token (HttpOnly)
 │
 ├─ ABONNEMENT STRIPE:
 │ ├─ Voit: sa facture, son plan actuel (Starter/Pro/Enterprise)
 │ ├─ Upgrade/Downgrade: via Stripe Portal (billing portal)
 │ └─ Usage: voir stats (entreprises used/quota, gestionnaires, stockage)
 │
 ├─ CUSTOMISATION:
 │ ├─ SMTP: host, port, user, password (chiffré), from_name, from_email
 │ ├─ Templates: sujet/corps personnalisés (avec variables {{cabinet_name}}, {{employe_nom}})
 │ └─ Branding: logo (Vercel Blob), couleur primaire/secondaire
 │
 ├─ GESTION GESTIONNAIRES (internes Cabinet):
 │ ├─ Créer: nom, email, spécialité (Paie/RH/Général)
 │ ├─ Inviter: email + token 7j (one-time use)
 │ ├─ Assigner: à N Entreprises (qui verront SEULEMENT celles assignées)
 │ ├─ Modifier: nom, spécialité, désactiver
 │ ├─ Supprimer: soft-delete (fiches conservées, logs anonymisés)
 │ └─ Reset password: envoyer reset link
 │
 ├─ GESTION ENTREPRISES CLIENTES:
 │ ├─ Créer: nom, VAT, adresse, email
 │ ├─ Inviter: email + token 7j (Admin Entreprise accepte)
 │ ├─ Assigner: à N Gestionnaires (relation N:M)
 │ ├─ Modifier: nom, VAT, adresse
 │ ├─ Supprimer: soft-delete (fiches conservées)
 │ └─ Voit: liste entreprises + statut (active/archived)
 │
 ├─ GESTION FICHES DE PAIE (centralisée Cabinet):
 │ ├─ Voir: toutes les fiches de tous ses Gestionnaires & Entreprises
 │ ├─ Génère/valide: fiches de paie (OU Gestionnaire valide)
 │ ├─ Envoie: fiches via son SMTP customisé EN SON NOM
 │ ├─ Archive: après 30 jours, marquer ARCHIVÉE (soft-delete après 5 ans)
 │ └─ Export: PDF, CSV pour audit
 │
 ├─ GESTION COLLABORATEURS (indirectement):
 │ ├─ Voir: listes (importées via Entreprise OU Gestionnaire)
 │ ├─ Import: CSV dossiers clients (nom, NISS, salaire, date embauche)
 │ └─ NE peut PAS: créer directement (création via Entreprise ou Gestionnaire)
 │
 └─ CRÉE/INVITE: Gestionnaires RH + Entreprises Clientes
 │
 ├─ Gestionnaire RH (assigné à N Entreprises)
 │ ├─ Gère: Entreprises assignées
 │ ├─ Crée: Collaborateurs dans ses Entreprises
 │ ├─ Génère: Fiches de paie
 │ └─ Valide: Fiches avant envoi
 │
 └─ Entreprise Cliente
 │
 ├─ Admin Entreprise (login dans SocialFlow)
 │ ├─ Crée: Collaborateurs (invite par email)
 │ ├─ Valide: Fiches de paie
 │ └─ Accède: portail Entreprise
 │
 └─ Collaborateur (salarié, login SocialFlow)
 ├─ Voit: sa fiche de paie (RO)
 └─ Accède: portail Collaborateur
```

---

## � AUTHENTIFICATION — 3 MÉTHODES

**Tous les utilisateurs supportent:**
- Magic Link (15 min)
- Password (bcrypt)
- OAuth 2.0 (Google + Microsoft)

### **SuperAdmin**
```
Login direct (email + password OU OAuth)
Pas d'inscription
```

### **Cabinet RH**
```
INSCRIPTION:
 POST /auth/register
 → email, password, firstName, lastName
 → Cabinet data (name, VAT, address)
 → Plan Stripe (Starter/Pro/Enterprise)
 → Stripe Checkout
 → Webhook: crée Cabinet + User (CABINET_RH, is_main_admin=true)

LOGIN:
 Magic Link + Password + OAuth
```

### **Gestionnaire RH**
```
INVITATION (par Cabinet RH):
 Cabinet → POST /api/gestionnaires/invite
 → email, firstName, lastName
 → Générer token invite (7j TTL)
 → Email: "Rejoins [Cabinet] sur SocialFlow"

ACCEPTATION:
 Gestionnaire clique lien → /invitations/accept?token=XXX
 → Formulaire: firstName, lastName, password, OAuth (opt)
 → Crée User (role=GESTIONNAIRE_RH)
 → Auto-login

LOGIN (next times):
 Magic Link + Password + OAuth
```

### **Entreprise Cliente & Collaborateur**
```
INVITATION (par Cabinet OU Gestionnaire):
 Même workflow que Gestionnaire
 
LOGIN:
 Magic Link + Password + OAuth
```

---

## � SCHÉMA PRISMA

```prisma
enum UserRole {
 SUPER_ADMIN
 CABINET_RH
 GESTIONNAIRE_RH
 ENTREPRISE_CLIENTE // Admin de l'Entreprise
 COLLABORATEUR // Salarié
}

model User {
 id String @id @default(cuid())
 email String @unique
 firstName String
 lastName String
 role UserRole
 
 cabinetId String? // null si SuperAdmin
 cabinet Cabinet? @relation(fields: [cabinetId], references: [id])
 
 // Status
 isActive Boolean @default(true) // SuperAdmin peut suspendre
 
 // Soft-delete (RGPD)
 deletedAt DateTime?
 
 createdAt DateTime @default(now())
 updatedAt DateTime @updatedAt
 
 // Polymorphes
 gestionnaire Gestionnaire?
 entreprise Entreprise?
 collaborateur Collaborateur?
 
 providers OAuthProvider[]
 auditLogs AuditLog[]
 resetTokens PasswordReset[]
 twoFactorSecrets TwoFactorSecret[]
 
 @@index([email])
 @@index([cabinetId])
}

// ===== PASSWORD RESET =====
model PasswordReset {
 id String @id @default(cuid())
 userId String
 user User @relation(fields: [userId], references: [id], onDelete: Cascade)
 
 token String @unique // SHA-256 hashed
 expiresAt DateTime
 usedAt DateTime?
 
 createdAt DateTime @default(now())
 
 @@index([userId])
}

// ===== TWO FACTOR AUTH =====
model TwoFactorSecret {
 id String @id @default(cuid())
 userId String @unique
 user User @relation(fields: [userId], references: [id], onDelete: Cascade)
 
 type String // "email_otp", "totp"
 secret String // Chiffré (seed TOTP OU backup codes JSON)
 isEnabled Boolean @default(false)
 
 backupCodes String[] // 10 codes one-time use
 usedCodes String[] // codes utilisés
 
 createdAt DateTime @default(now())
 updatedAt DateTime @updatedAt
}

// ===== CABINET RH =====
model Cabinet {
 id String @id @default(cuid())
 name String
 vatNumber String @unique
 address String
 city String
 zipCode String
 email String
 
 stripeCustomerId String? @unique
 stripeSubscriptionId String?
 plan Plan @default(STARTER)
 status CabinetStatus @default(ACTIVE)
 
 // SMTP (envoyer en son nom)
 smtpHost String?
 smtpPort Int?
 smtpUser String?
 smtpPassword String? // Chiffré AES-256
 smtpFromName String? // ex: "Cabinet RH XYZ"
 smtpFromEmail String? // ex: "paie@cabinet.be"
 
 // Branding & White-Label
 applicationName String? // ex: "Cabinet RH XYZ" (remplace "SocialFlow" partout)
 logoUrl String? // Vercel Blob
 colorPrimary String? // hex: #0F7BA7
 colorSecondary String? // hex: #10B981
 
 users User[]
 gestionnaires Gestionnaire[]
 entreprises Entreprise[]
 templates EmailTemplate[]
 
 createdAt DateTime @default(now())
 updatedAt DateTime @updatedAt
}

enum Plan {
 STARTER // 25 entreprises, 5 gestionnaires, 10GB, 99€/mois
 PRO // 100 entreprises, 15 gestionnaires, 50GB, 299€/mois
 ENTERPRISE // Illimité, custom
}

enum CabinetStatus {
 ACTIVE
 SUSPENDED
 CANCELED
}

// ===== GESTIONNAIRE RH =====
model Gestionnaire {
 id String @id @default(cuid())
 userId String @unique
 user User @relation(fields: [userId], references: [id], onDelete: Cascade)
 
 cabinetId String
 cabinet Cabinet @relation(fields: [cabinetId], references: [id], onDelete: Cascade)
 
 specialite String?
 
 // N:M Entreprises assignées (via junction table)
 entreprises GestionnaireEntreprise[]
 
 createdAt DateTime @default(now())
 deletedAt DateTime?
 
 @@unique([userId, cabinetId])
 @@index([cabinetId])
}

// ===== GESTIONNAIRE <→ ENTREPRISE (N:M Junction Table) =====
model GestionnaireEntreprise {
 id String @id @default(cuid())
 
 gestionnaireId String
 gestionnaire Gestionnaire @relation(fields: [gestionnaireId], references: [id], onDelete: Cascade)
 
 entrepriseId String
 entreprise Entreprise @relation(fields: [entrepriseId], references: [id], onDelete: Cascade)
 
 assignedAt DateTime @default(now())
 
 @@unique([gestionnaireId, entrepriseId])
 @@index([gestionnaireId])
 @@index([entrepriseId])
}

// ===== ENTREPRISE CLIENTE =====
model Entreprise {
 id String @id @default(cuid())
 
 name String
 vatNumber String
 address String
 city String
 zipCode String
 email String
 phone String?
 
 cabinetId String
 cabinet Cabinet @relation(fields: [cabinetId], references: [id], onDelete: Cascade)
 
 // Admin Entreprise (utilisateur)
 adminUserId String?
 admin User? @relation(fields: [adminUserId], references: [id])
 
 // Gestionnaire(s) assigné(s) (via junction table)
 gestionnaires GestionnaireEntreprise[]
 
 collaborateurs Collaborateur[]
 fiches FichePaie[]
 contrats Contrat[]
 
 createdAt DateTime @default(now())
 deletedAt DateTime?
 
 @@unique([cabinetId, vatNumber])
 @@index([cabinetId])
}

// ===== COLLABORATEUR (Salarié) =====
model Collaborateur {
 id String @id @default(cuid())
 
 userId String? @unique // nullable si pas encore inscrit
 user User? @relation(fields: [userId], references: [id])
 
 entrepriseId String
 entreprise Entreprise @relation(fields: [entrepriseId], references: [id], onDelete: Cascade)
 
 firstName String
 lastName String
 niss String // 11 chiffres belgique
 email String
 phone String?
 
 dateEmbauche DateTime
 dateFin DateTime?
 typeContrat String
 salaireBase Decimal @db.Decimal(10, 2)
 
 fiches FichePaie[]
 contrat Contrat?
 
 createdAt DateTime @default(now())
 deletedAt DateTime? // soft-delete for RGPD
 
 @@unique([entrepriseId, niss])
 @@index([entrepriseId])
}

// ===== CONTRAT DE TRAVAIL =====
model Contrat {
 id String @id @default(cuid())
 collaborateurId String @unique
 collaborateur Collaborateur @relation(fields: [collaborateurId], references: [id], onDelete: Cascade)
 
 entrepriseId String
 entreprise Entreprise @relation(fields: [entrepriseId], references: [id])
 
 type String
 dateDebut DateTime
 dateFin DateTime?
 salaireBase Decimal @db.Decimal(10, 2)
 template String? @db.Text
 
 createdAt DateTime @default(now())
 deletedAt DateTime? // soft-delete for legal retention (5 years)
 
 @@index([entrepriseId])
}

// ===== FICHE DE PAIE =====
model FichePaie {
 id String @id @default(cuid())
 
 collaborateurId String
 collaborateur Collaborateur @relation(fields: [collaborateurId], references: [id], onDelete: Cascade)
 
 entrepriseId String
 entreprise Entreprise @relation(fields: [entrepriseId], references: [id])
 
 mois Int
 annee Int
 
 statut FichePaieStatus @default(BROUILLON)
 
 // CALCULS BELGIQUE
 salaireeBrut Decimal @db.Decimal(10, 2)
 onss Decimal @db.Decimal(10, 2)
 precompte Decimal @db.Decimal(10, 2)
 chargesPatronales Decimal @db.Decimal(10, 2)
 salaireNet Decimal @db.Decimal(10, 2)
 
 pdfUrl String?
 createdBy String?
 validatedBy String?
 
 createdAt DateTime @default(now())
 deletedAt DateTime? // soft-delete for legal retention (5 years)
 
 @@unique([collaborateurId, mois, annee])
 @@index([statut])
}

enum FichePaieStatus {
 BROUILLON // Gestionnaire crée
 VALIDATION // En attente validation Entreprise
 VALIDÉE // Entreprise approuve
 ENVOYÉE // Collaborateur reçoit
 ARCHIVÉE // 5 ans rétention
}

// ===== EMAIL TEMPLATES (par Cabinet) =====
model EmailTemplate {
 id String @id @default(cuid())
 cabinetId String
 cabinet Cabinet @relation(fields: [cabinetId], references: [id], onDelete: Cascade)
 
 type String
 name String
 subject String // ex: "Votre fiche de paie - {{cabinet_name}}"
 body String @db.Text // HTML avec variables {{cabinet_name}}, {{collaborateur_nom}}, etc.
 variables String[]
 
 @@unique([cabinetId, type])
}

// VARIABLES DISPONIBLES:
// {{cabinet_name}} = nom du Cabinet RH
// {{cabinet_email}} = email du Cabinet
// {{collaborateur_nom}} = nom du salarié
// {{collaborateur_email}} = email du salarié
// {{mois}} = mois fiche (ex: "Juin 2026")
// {{salaire_net}} = salaire net
// {{lien_telechargement}} = lien PDF

// ===== AUDIT LOG =====
model AuditLog {
 id String @id @default(cuid())
 userId String
 user User @relation(fields: [userId], references: [id])
 
 action String
 resourceType String
 resourceId String?
 cabinetId String?
 metadata Json?
 
 createdAt DateTime @default(now())
 
 @@index([cabinetId])
}

// ===== OAUTH PROVIDERS =====
model OAuthProvider {
 id String @id @default(cuid())
 userId String
 user User @relation(fields: [userId], references: [id], onDelete: Cascade)
 
 provider String
 providerUserId String?
 accessToken String? @db.Text
 refreshToken String? @db.Text
 expiresAt DateTime?
 
 @@unique([userId, provider])
}
```

---

## � WORKFLOWS CLÉS

### **Workflow 1: Cabinet s'abonne (Stripe)**

```
1. Cabinet clique "S'abonner"
2. POST /auth/register
 → email, password, firstName, lastName, Cabinet data (name, VAT)
 → Plan choisi (Starter/Pro/Enterprise)
 (Prix fixé par SuperAdmin, Cabinet ne peut pas changer)
3. Redirect Stripe Checkout
 → Session créée avec Stripe Price ID (défini par SuperAdmin)
4. Cabinet paie via Stripe
5. Webhook stripe/checkout.session.completed
 → Crée atomiquement:
 - Cabinet
 - stripeCustomerId: cust_XXX
 - stripeSubscriptionId: sub_XXX
 - plan: STARTER|PRO|ENTERPRISE
 - status: ACTIVE
 - User (role=CABINET_RH, is_main_admin=true)
 - CabinetCustomization (defaults SocialFlow)
 - EmailTemplate[] (defaults SocialFlow)
6. Email bienvenue (depuis Resend/SMTP global)
7. Cabinet accède au dashboard
 → Peut voir: Factures, Upgrade/Downgrade, Usage stats
```

### **Workflow 2: Cycle Fiche de Paie**

```
1. BROUILLON (Gestionnaire crée)
 - Récupère data Collaborateur
 - Saisit: salaire, congés, primes
 - Calcule: ONSS 13.07% + précompte belge + charges 42%
 - Génère PDF
 - Click "Envoyer à validation"
 → Statut: VALIDATION

2. VALIDATION (Entreprise valide)
 - Admin Entreprise reçoit notification
 - Voit fiche, revoit chiffres
 - Click "Approuver" OU "Rejeter"
 → Statut: VALIDÉE (ou back to BROUILLON)

3. ENVOYÉE (Cabinet envoie)
 - Click "Envoyer au salarié"
 - Email via SMTP du Cabinet
 - Template personnalisé du Cabinet
 → Statut: ENVOYÉE

4. ARCHIVÉE (Système)
 - Après 30j ENVOYÉE → ARCHIVÉE
 - Rétention: 5 ans minimum (Belgique)
 - Soft-delete après 5 ans
```

### **Workflow 3: Invitation Gestionnaire**

```
Cabinet RH → Cabinet/settings/gestionnaires/invite
 email, firstName, lastName
 → Générer token (7j TTL)
 → Email: "Rejoins [Cabinet]"
 
Gestionnaire clique lien
 → POST /invitations/accept?token=XXX
 → Crée User (role=GESTIONNAIRE_RH)
 → Auto-login
```

### **Workflow 4: Invitation Entreprise Cliente**

```
Cabinet RH → Cabinet/settings/entreprises/invite
 email, company name, ...
 → Générer token (7j TTL)
 → Email: "Rejoins [Cabinet]"
 
Entreprise clique lien
 → POST /invitations/accept?token=XXX
 → Crée:
 - Entreprise (dans DB)
 - User (role=ENTREPRISE_CLIENTE, is_admin=true)
 → Auto-login portail Entreprise
```

### **Workflow 5: Invitation Collaborateur**

```
Entreprise → Entreprise/collaborateurs/invite
 email, firstName, lastName
 → Générer token (7j TTL)
 → Email: "Rejoins [Entreprise]"
 
Collaborateur clique lien
 → POST /invitations/accept?token=XXX
 → Crée:
 - Collaborateur (dans Entreprise)
 - User (role=COLLABORATEUR)
 → Auto-login portail Collaborateur
```

---

## � ISOLATION MULTI-TENANT

```
Cabinet A ≠ Cabinet B:
 • Utilisateurs A ne voient PAS Cabinet B
 • Gestionnaires A ne voient PAS Gestionnaires B
 • Entreprises A ne voient PAS Entreprises B
 • Collaborateurs A ne voient PAS Collaborateurs B

Implémentation:
 WHERE cabinetId = $1 sur TOUTES les requêtes Cabinet
 Middleware: vérifier cabinetId JWT vs ressource
 RLS PostgreSQL (défense en profondeur)
```

---

## RÉTENTION LÉGALE BELGIQUE

**FIXÉ: 5 ans minimum**

```
Fiches de paie: 5 ans en DB → soft-delete
Contrats: 5 ans en DB → soft-delete
ONSS: 5 ans
Audit logs: 3 ans (actifs) + 1 an (archives)
Collaborateurs supprimés: anonymisation (RGPD)
```

---

## � PRICING STRIPE (géré par SuperAdmin)

**SuperAdmin configure (une fois):**
```
STARTER: 99€/mois
 ├─ Entreprises: 25
 ├─ Gestionnaires: 5
 └─ Stockage: 10 GB

PRO: 299€/mois
 ├─ Entreprises: 100
 ├─ Gestionnaires: 15
 └─ Stockage: 50 GB

ENTERPRISE: Custom (negotié)
 └─ Illimité
```

**Cabinet RH peut:**
- Voir ses factures
- Voir son plan actuel
- Upgrader/Downgrade (via Stripe Portal)
- Modifier les prix (SuperAdmin only)
- Créer nouveau plan (SuperAdmin only)

---

## � WHITE-LABEL & CUSTOMISATION CABINET

**Cabinet RH peut complètement rebrander SocialFlow en son propre nom**

### **Exemple:**

**SocialFlow Default:**
```
Email sujet: "Votre fiche de paie - SocialFlow"
Email corps: "Bienvenue sur SocialFlow"
Signature: "L'équipe SocialFlow"
Logo: SocialFlow
Couleurs: Violet/Teal SocialFlow
```

**Après customisation par Cabinet RH XYZ:**
```
Email sujet: "Votre fiche de paie - Cabinet RH XYZ"
Email corps: "Bienvenue chez Cabinet RH XYZ"
Signature: "Cabinet RH XYZ - paie@cabinet.be"
Logo: Logo Cabinet RH XYZ
Couleurs: Bleu/Orange Cabinet
```

### **Paramètres Customisables:**

| Paramètre | Default | Cabinet peut changer | Exemple |
|---|---|---|---|
| **applicationName** | "SocialFlow" | OUI | "Cabinet RH XYZ" |
| **logoUrl** | Logo SF | OUI | Vercel Blob image |
| **colorPrimary** | #7c3aed | OUI | #0F7BA7 |
| **smtpFromName** | "SocialFlow" | OUI | "Cabinet RH XYZ" |
| **smtpFromEmail** | "noreply@sf" | OUI | "paie@cabinet.be" |
| **emailTemplate** | Template SF | OUI | HTML personnalisé |

### **Dans l'interface Cabinet:**

```
Settings → Branding & Customisation
 ├─ [ ] Nom application: [Cabinet RH XYZ]
 ├─ [ ] Logo: [upload image]
 ├─ [ ] Couleur primaire: [#0F7BA7]
 ├─ [ ] Couleur secondaire: [#10B981]
 ├─ Settings → SMTP
 │ ├─ [ ] Host: [smtp.cabinet.be]
 │ ├─ [ ] From Name: [Cabinet RH XYZ]
 │ └─ [ ] From Email: [paie@cabinet.be]
 └─ Settings → Email Templates
 ├─ [ ] Sujet: "Votre fiche de paie - {{cabinet_name}}"
 └─ [ ] Corps: [HTML editor avec variables]
```

---

## � CABINET RH — ANALYSE COMPLÈTE

### **Qui est Cabinet RH?**

```
= Client SaaS qui s'abonne à SocialFlow
= Propriétaire d'un Cabinet de paie/RH
= A ses propres clients externes (Entreprises Clientes)
= Utilise SocialFlow pour gérer la paie de ses clients

Exemples:
 • Cabinet RH "XYZ Consulting" → 50 clients (Entreprises)
 • Cabinet RH "Paie Services Belgique" → 100 clients
```

### **RÔLES & PERMISSIONS CABINET RH**

```
Cabinet RH se divise en 2 niveaux:

NIVEAU 1: Cabinet (propriétaire abonnement)
 ├─ is_main_admin = true (premier user, non révocable)
 ├─ Peut: créer/inviter autres Gestionnaires
 ├─ Peut: voir TOUTES les fiches (audit)
 └─ Peut: customiser SMTP, templates, branding

NIVEAU 2: Gestionnaire RH (collaborateurs Cabinet)
 ├─ Invité par Cabinet (email + token 7j)
 ├─ Assigné à N Entreprises (voit SEULEMENT celles assignées)
 ├─ Génère fiches pour ses Entreprises
 └─ Ne peut PAS: voir fiches d'autres Gestionnaires
```

### **TABLEAU: PERMISSIONS CABINET RH**

| Action | Cabinet Admin | Gestionnaire | Entreprise | Collaborateur |
|---|---|---|---|---|
| **Voir fiches de paie** | TOUTES | assignées | siennes (RO) | sa fiche (RO) |
| **Créer fiche** | OUI | assignées | NON | NON |
| **Valider fiche** | OUI | assignées | siennes | NON |
| **Envoyer fiche** | OUI | NON | OUI | NON |
| **Créer Gestionnaire** | OUI | NON | NON | NON |
| **Créer Entreprise** | OUI | NON | NON | NON |
| **Créer Collaborateur** | OUI | OUI | OUI | NON |
| **Customiser SMTP** | OUI | NON | NON | NON |
| **Voir audit logs** | OUI | NON | NON | NON |
| **Upgrade plan** | OUI | NON | NON | NON |

### **WORKFLOWS CABINET RH**

#### **Workflow 1: Cabinet crée Gestionnaire**

```
Cabinet Admin → Dashboard → Gestion Gestionnaires → "Inviter"
 Formulaire:
 - email: gestionnaire@example.com
 - firstName, lastName
 - specialite: "Paie" | "RH" | "Général"
 
 Click "Inviter"
 → Générer invitation token (7j TTL, one-time use)
 → Email: "Vous êtes invité à rejoindre [Cabinet] - SocialFlow"
 → Lien: /invitations/accept?token=XXX&email=YYY
 → Audit log: INVITATION_CREATED
 
 Gestionnaire clique lien
 → Formulaire: firstName, lastName, password, OAuth (opt)
 → POST /invitations/accept
 → Crée User (role=GESTIONNAIRE_RH, cabinetId=XXX)
 → Audit log: USER_CREATED, INVITATION_ACCEPTED
 → Auto-login
 
 Cabinet Admin peut:
 ├─ Voir listes Gestionnaires (status: invited, accepted, disabled)
 ├─ Assigner à Entreprises
 ├─ Reset password
 ├─ Désactiver (isActive=false)
 └─ Supprimer (soft-delete)
```

#### **Workflow 2: Cabinet crée Entreprise Cliente**

```
Cabinet Admin → Dashboard → Gestion Entreprises → "Créer"
 Formulaire:
 - name: "Entreprise ACME"
 - vatNumber: "BE0123456789"
 - address, city, zipCode
 - email: contact@acme.be
 - phone (opt)
 
 Click "Créer"
 → POST /cabinet/entreprises/create
 → Créer Entreprise (cabinetId=Cabinet, status=CREATED)
 → Audit log: ENTREPRISE_CREATED
 
 Option A: Cabinet envoie invitation à Admin Entreprise
 → Générer token (7j)
 → Email: "Vous êtes invité à rejoindre SocialFlow - Gestion de paie"
 → Admin Entreprise accepte, crée User (role=ENTREPRISE_CLIENTE)
 
 Option B: Cabinet n'envoie pas invitation
 → Entreprise stockée mais PAS ACTIVE
 → Attendre que Gestionnaire ou Cabinet envoie invitation
 
 Cabinet Admin peut:
 ├─ Assigner Gestionnaires à Entreprise (N:M)
 ├─ Inviter Admin Entreprise
 ├─ Modifier Entreprise (nom, VAT, adresse)
 ├─ Voir fiches de Entreprise
 └─ Archiver/Supprimer
```

#### **Workflow 3: Cabinet (re)configure SMTP**

```
Cabinet Admin → Settings → SMTP & Email
 Formulaire:
 - smtpHost: smtp.cabinet.be
 - smtpPort: 587
 - smtpUser: paie@cabinet.be
 - smtpPassword: [chiffré AES-256]
 - smtpFromName: "Cabinet RH XYZ - Paie"
 - smtpFromEmail: paie@cabinet.be
 
 Click "Tester connexion"
 → Envoyer email test
 → Si OK: "SMTP validé"
 → Si KO: "Erreur connexion SMTP"
 
 Fiches envoyées utilisent ce SMTP
 → Email FROM: "Cabinet RH XYZ - Paie" <paie@cabinet.be>
 → Pas via Resend (SocialFlow global)
```

#### **Workflow 4: Cabinet envoie Fiche de Paie**

```
Cabinet Admin → Fiches → Cherche fiche (VALIDÉE)
 Click "Envoyer"
 → POST /fiches/{id}/send
 → Récupère SMTP du Cabinet
 → Récupère EmailTemplate du Cabinet
 → Génère PDF fiche
 → Envoie email via SMTP Cabinet:
 TO: collaborateur@example.com
 FROM: "Cabinet RH XYZ - Paie" <paie@cabinet.be>
 Subject: "Votre fiche de paie - Juin 2026 - Cabinet RH XYZ"
 Body: "Bonjour {{collaborateur_nom}}, votre fiche paie..."
 Attachment: fiche.pdf
 
 → Statut: VALIDÉE → ENVOYÉE
 → Audit log: FICHE_SENT
 → Après 30 jours: auto-archive
```

### **LIMITATIONS & ISOLATION CABINET RH**

```
Cabinet A ne voit JAMAIS:
 Cabinets autres
 Fiches d'autres Cabinets
 Gestionnaires d'autres Cabinets
 Données clients d'autres Cabinets

Implémentation:
 WHERE cabinetId = $1 sur TOUTES requêtes
 JWT contient cabinetId (vérifié middleware)
 RLS PostgreSQL (défense en profondeur)

Exemple query bloquée:
 SELECT * FROM fiches_paie (pas de WHERE)
 SELECT * FROM fiches_paie WHERE cabinetId = $1
```

### **QUOTA ENFORCEMENT (par plan)**

```
STARTER (25 entreprises, 5 gestionnaires):
 Cabinet crée 26ème entreprise:
 → Warning: "Limite atteinte. Upgrade vers Pro pour +75 entreprises"
 → Fiche créée mais marquée warning=true
 
 À 96% quota:
 → Email proactif: "Vous utilisez 96% de votre limite"
 → Suggestion: "Upgrade vers Pro"
 
 Downgrade Pro → Starter (100 → 25 entreprises):
 → Grace period: 30 jours
 → Entreprises 26-100 marquées archived
 → Après 30j: blocage total OU auto-upgrade suggestion

PRISMA:
 model Cabinet {
 plan Plan
 enterprisesUsed Int
 gestionnairesUsed Int
 storageUsed Int // GB
 }
```

### **CHECKLIST CABINET RH**

```
Cabinet doit faire AVANT d'utiliser SocialFlow:

1. Configurer abonnement Stripe
 ├─ Choisir plan (Starter/Pro/Enterprise)
 └─ Payer

2. Configurer SMTP du Cabinet
 ├─ Valider connexion
 └─ Envoyer email test

3. Customiser templates/branding (opt)
 ├─ Upload logo
 ├─ Couleur primaire
 └─ Personnaliser email template

4. Inviter Gestionnaires
 ├─ Email + token
 └─ Assigner à Entreprises

5. Créer/inviter Entreprises Clientes
 ├─ Créer entrée
 └─ Inviter Admin Entreprise (opt)

THEN:
 → Cabinet peut commencer à générer fiches
```

---

## � GESTIONNAIRE RH — ANALYSE COMPLÈTE

### **Qui est Gestionnaire RH?**

```
= Collaborateur interne du Cabinet RH
= Invité par Cabinet (email + token 7j)
= Assigné à N Entreprises Clientes (1 à plusieurs)
= Gère SEULEMENT ses Entreprises assignées
= Ne peut PAS voir d'autres Gestionnaires

Exemples:
 • Gestionnaire "Jean" assigné à [Entreprise A, Entreprise B]
 → Voit SEULEMENT Entreprise A & B
 → NE voit PAS Entreprise C (assignée à autre Gestionnaire)
 
 • Gestionnaire "Marie" assigné à [Entreprise C, Entreprise D]
 → Voit SEULEMENT Entreprise C & D
 → NE voit PAS Entreprise A & B
```

### **HIÉRARCHIE GESTIONNAIRE**

```
Cabinet RH (propriétaire)
 └─ Gestionnaire RH (collaborateur)
 ├─ Assigné à Entreprise A
 ├─ Assigné à Entreprise B
 └─ Assigné à Entreprise C
 
 └─ Gère Collaborateurs de A, B, C
 └─ Crée/édite fiches de paie
```

### **WORKFLOW INVITATION GESTIONNAIRE**

```
1. Cabinet Admin → Gestion Gestionnaires → "Inviter"
 Formulaire:
 - email: jean.dupont@example.com
 - firstName: Jean
 - lastName: Dupont
 - specialite: "Paie" | "RH" | "Général"
 
2. Click "Inviter"
 → POST /api/cabinet/gestionnaires/invite
 → Générer token (64 bytes, SHA-256 hash)
 → Token TTL: 7 jours
 → Créer Invitation (status=PENDING)
 → Envoyer email:
 Sujet: "Vous êtes invité à rejoindre [Cabinet] - SocialFlow"
 Corps: "Bonjour Jean,
 [Cabinet] vous invite à rejoindre SocialFlow.
 Lien: https://socialflow.app/invitations/accept?token=XXX&email=jean.dupont@example.com
 Valide pendant 7 jours."
 → Audit log: GESTIONNAIRE_INVITED
 
3. Gestionnaire clique lien → /invitations/accept?token=XXX&email=YYY
 
4. Frontend valide:
 - Token existe?
 - Token pas expiré (< 7j)?
 - Email match?
 - Invitation pas encore acceptée?
 
5. Affiche formulaire:
 - firstName (pré-fill)
 - lastName (pré-fill)
 - password (min 12 char, maj/min/chiffre/spécial)
 - ☐ Utiliser Google OAuth?
 - ☐ Utiliser Microsoft OAuth?
 
6. POST /invitations/accept
 {
 token,
 email,
 firstName, lastName,
 password,
 oauthMethod: null | "google" | "microsoft"
 }
 
 Backend:
 → Vérifier token valide
 → Créer User (role=GESTIONNAIRE_RH)
 {
 email,
 firstName, lastName,
 cabinetId: (from invitation),
 role: GESTIONNAIRE_RH,
 isActive: true,
 createdAt: NOW()
 }
 → Créer OAuthProvider (credential OU oauth)
 → Créer Gestionnaire
 {
 userId,
 cabinetId,
 specialite,
 dossiersId: [] (empty, Cabinet assignera)
 }
 → Marquer Invitation.status = ACCEPTED
 → Supprimer token (invalidate)
 → Créer AuditLog: USER_CREATED, INVITATION_ACCEPTED
 → Auto-login
 → Redirect /dashboard/gestionnaire
 
7. First login check:
 - Password expire? → Suggest change
 - 2FA enabled? → Prompt setup
 - Dossiers assignés = 0? → Warning: "Aucune Entreprise assignée"
```

### **AUTHENTIFICATION GESTIONNAIRE**

```
LOGIN (après acceptation invitation):

POST /auth/login
 email: jean.dupont@example.com
 
 Option 1: Magic Link
 → Email jean.dupont@example.com
 → Lien: /auth/magic-link?token=XXX (15 min)
 → Click lien → auto-login
 
 Option 2: Password
 → email: jean.dupont@example.com
 → password: ••••••••
 → Vérifier bcrypt
 → Créer JWT (1h) + Refresh token (24h, HttpOnly)
 
 Option 3: OAuth
 → "Continue with Google" OU "Continue with Microsoft"
 → OAuth callback
 → Lier au compte existant (email match)
 → Créer session

JWT PAYLOAD:
 {
 sub: user.id,
 email: "jean.dupont@example.com",
 role: "GESTIONNAIRE_RH",
 cabinetId: "cabinet_123",
 dossiersAssignes: ["ent_A_id", "ent_B_id", "ent_C_id"], // JSON array
 iat: NOW(),
 exp: NOW() + 1h
 }

REFRESH TOKEN: HttpOnly secure cookie, 24h TTL
SESSION TIMEOUT: 60 min inactivité → force re-login
```

### **PERMISSIONS GESTIONNAIRE RH**

```
Gestionnaire RH peut (sur ses Entreprises assignées SEULEMENT):

 VoirDONNÉES:
 ├─ Listes Collaborateurs (ses Entreprises)
 ├─ Fiches de paie (ses Entreprises)
 ├─ Contrats (ses Entreprises)
 └─ Données Entreprises assignées

 CRÉER/MODIFIER:
 ├─ Collaborateurs (import CSV OU manuel dans ses Entreprises)
 ├─ Fiches de paie (brouillon)
 ├─ Contrats (templates personnalisés)
 └─ Valider fiches (avant Cabinet envoie)

 NE PEUT PAS:
 ├─ Voir Entreprises NON assignées
 ├─ Voir fiches d'autres Gestionnaires
 ├─ Créer/gérer Entreprises Clientes
 ├─ Customiser SMTP/templates
 ├─ Inviter Gestionnaires
 ├─ Modifier plan Stripe
 └─ Voir audit logs globaux

 LIMITATION CLÉS:
 • Voit SEULEMENT ses Entreprises (WHERE gestionnaire_id IN dossiersAssignes)
 • NE peut PAS envoyer fiches (Cabinet envoie)
 • NE peut PAS supprimer fiches (soft-delete seulement)
```

### **WORKFLOWS GESTIONNAIRE RH**

#### **Workflow 1: Gestionnaire voit ses Entreprises assignées**

```
Gestionnaire Jean → Login
 → POST /auth/login (email + password)
 → Créer JWT (contient dossiersAssignes: [ent_A, ent_B, ent_C])
 → Redirect /dashboard

Dashboard → Listes Entreprises
 → GET /api/gestionnaire/entreprises
 Middleware vérifie:
 - role = GESTIONNAIRE_RH? 
 - cabinetId match JWT? 
 Query:
 SELECT * FROM Entreprise
 WHERE cabinetId = $1
 AND id IN ($2, $3, $4) // dossiersAssignes du JWT
 
 Affiche:
 - Entreprise A (2 collaborateurs, 5 fiches, 3 archived)
 - Entreprise B (1 collaborateur, 8 fiches, 0 archived)
 - Entreprise C (3 collaborateurs, 12 fiches, 5 archived)
 
 Gestionnaire Jean NE VOIT PAS:
 Entreprise D, E, F... (assignées à autre Gestionnaire)
```

#### **Workflow 2: Gestionnaire crée Fiche de Paie**

```
Gestionnaire Jean → Entreprise A → Collaborateurs → "Jean Dupont" → "Créer fiche"

Formulaire:
 - mois: Juin (6)
 - annee: 2026
 - salaireeBrut: 2500€
 - congés: 8 jours
 - primes: 0€
 - déductions: 0€

Click "Calculer"
 → POST /api/fiches/calculate
 Backend:
 → Vérifier Gestionnaire a accès à cette Entreprise
 → Récupère Collaborateur data (NISS, contrat, etc.)
 → Calcule:
 • ONSS: 2500 * 13.07% = 326.75€
 • Précompte: barème belge progressif (~400€)
 • Charges patronales: 2500 * 42% = 1050€
 • Salaire net: 2500 - 326.75 - 400 = 1773.25€
 → Retourne calculated values
 
 Affiche:
 - Salaire brut: 2500€
 - ONSS: 326.75€
 - Précompte: ~400€
 - Charges patronales: 1050€
 - Salaire net: 1773.25€
 
 Button options:
 ☐ "Sauvegarder (Brouillon)"
 ☐ "Envoyer à validation"

Click "Sauvegarder"
 → POST /fiches/create
 Backend:
 → Vérifier accès (Gestionnaire + Entreprise)
 → Créer FichePaie
 {
 collaborateurId,
 entrepriseId,
 mois: 6,
 annee: 2026,
 statut: BROUILLON,
 salaireeBrut: 2500,
 onss: 326.75,
 precompte: 400,
 chargesPatronales: 1050,
 salaireNet: 1773.25,
 createdBy: gestionnaire.userId
 }
 → Audit log: FICHE_CREATED (statut=BROUILLON)
 
 Affiche: "Fiche sauvegardée (Brouillon)"
```

#### **Workflow 3: Gestionnaire valide Fiche**

```
Gestionnaire Jean → Fiches → Filtre Entreprise A → État "Brouillon"

Affiche listes brouillons de ses Entreprises:
 - Dupont Jean - Juin 2026 - 2500€ brut
 - Dupont Jean - Juillet 2026 - 2500€ brut
 - Martin Marie - Juin 2026 - 3000€ brut

Click fiche "Dupont Jean - Juin 2026"
 → Affiche détails:
 Salaire brut: 2500€
 ONSS: 326.75€
 Précompte: ~400€
 Salaire net: 1773.25€
 
 Vérifier chiffres OK?
 
 Buttons:
 ☐ "Éditer" (revenir à formulaire)
 ☐ "Valider"
 ☐ "Supprimer (Brouillon)"

Click "Valider"
 → POST /fiches/{id}/validate
 Backend:
 → Vérifier accès + statut = BROUILLON
 → Mettre à jour statut: BROUILLON → VALIDATION
 → Créer AuditLog: FICHE_VALIDATED
 → Envoyer notification à Entreprise Admin:
 "Fiche de paie Dupont Jean (Juin) attend validation"
 
 Affiche: "Fiche envoyée à validation"
 Statut: VALIDATION (en attente Entreprise Admin)
```

#### **Workflow 4: Gestionnaire importe Collaborateurs (CSV)**

```
Gestionnaire Jean → Entreprise A → Collaborateurs → "Importer CSV"

Template CSV:
 firstName,lastName,niss,email,dateEmbauche,typeContrat,salaireBase
 Jean,Dupont,12345678901,jean@example.com,2024-01-15,CDI,2500
 Marie,Martin,98765432109,marie@example.com,2024-02-01,CDI,3000

Upload & Click "Importer"
 → POST /api/entreprises/{id}/collaborateurs/import
 Backend:
 → Vérifier accès (Gestionnaire + Entreprise)
 → Parser CSV
 → Valider:
 • NISS format (11 chiffres Belgique)?
 • Email unique dans Entreprise?
 • dateEmbauche valide?
 → Créer Collaborateur[] (userId = null car pas d'invitation)
 → Créer ContratTravail[] pour chaque
 → Audit log: COLLABORATEURS_IMPORTED (count=2)
 
 Affiche: "2 collaborateurs importés"
 
 Collaborateurs:
 - Jean Dupont (12345678901) - pas encore inscrit (userId=null)
 - Marie Martin (98765432109) - pas encore inscrit
 
 Gestionnaire peut:
 ├─ Créer fiche (même sans user inscrit)
 ├─ Générer PDF
 └─ Inviter collaborateur (envoyer email) - LATER
```

#### **Workflow 5: Gestionnaire reçoit notification (Entreprise valide fiche)**

```
Entreprise Admin → Fiches → État "VALIDATION" → Valide fiche

Backend → Webhook? OU polling?
 → Créer AuditLog: FICHE_VALIDATED
 → Notification Gestionnaire: "Fiche dupont_juin validée par Entreprise"

Gestionnaire Jean → Dashboard
 → Voir notification: "Fiche Dupont Jean (Juin) validée par Entreprise A"
 → Peut maintenant:
 ├─ Voir statut: VALIDÉE
 └─ Cabinet Admin peut envoyer
```

### **TABLEAU: ISOLATION GESTIONNAIRE**

```
Gestionnaire A assigné à [Ent A, Ent B]:
 Voit: Ent A + B
 Voit PAS: Ent C, D, E... (autres Gestionnaires)
 Voit PAS: fiches d'autres Gestionnaires
 Voit PAS: Gestionnaire C, D (autres Gestionnaires)

Implémentation (JWT):
 {
 dossiersAssignes: ["ent_A_id", "ent_B_id"],
 cabinetId: "cabinet_123"
 }

Query middleware:
 WHERE cabinetId = $1 AND id IN (dossiersAssignes)
```

### **LIMITATIONS GESTIONNAIRE RH**

```
 NE PEUT PAS:
 • Voir Entreprises autres Gestionnaires
 • Créer Entreprise nouvelle
 • Customiser SMTP/templates/branding
 • Inviter Entreprise Cliente
 • Inviter Collaborateur externe
 • Envoyer fiches (Cabinet envoie)
 • Modifier plan Stripe
 • Voir audit logs
 • Supprimer fiches (seulement soft-delete)
 • Changer ses permissions/assignations
 • Voir données Cabinet Global

 KEY POINT:
 Gestionnaire = "opérationnel"
 Cabinet Admin = "stratégique"
```

### **CHECKLIST GESTIONNAIRE**

```
Gestionnaire nouvellement invité:

1. ☐ Recevoir email invitation (7j TTL)
2. ☐ Créer compte (password + OAuth opt)
3. ☐ First login
4. ☐ Voir tableau de bord
5. ☐ Voir ses Entreprises assignées
6. ☐ Importer/voir Collaborateurs
7. ☐ Créer premieres fiches de paie
8. ☐ Valider fiches avant Cabinet envoie

THEN: Cycle de paie fonctionnel
```

---

## � ENTREPRISE CLIENTE — ANALYSE COMPLÈTE

### **Qui est Entreprise Cliente?**

```
= Client du Cabinet RH (entreprise externe)
= Créée par Cabinet RH dans SocialFlow
= Invitée par Cabinet ou Gestionnaire RH (email + token 7j)
= Admin Entreprise = premier user qui accepte invitation
= Gère ses collaborateurs (salariés) + valide ses fiches de paie
= VoitSEULEMENT ses données (isolation stricte)

Exemples:
 • Entreprise "ACME SA" (client du Cabinet RH XYZ)
 → Admin Entreprise: marie@acme.be
 → Collaborateurs: 10 salariés
 → Fiches: générées par Gestionnaire RH, validées par Admin
 
 • Entreprise "Tech StartUp Ltd" (client du Cabinet RH XYZ)
 → Admin Entreprise: rh@startup.be
 → Collaborateurs: 5 salariés
```

### **WORKFLOW CRÉATION & INVITATION ENTREPRISE**

```
CABINET CRÉE ENTREPRISE:

Cabinet Admin → Gestion Entreprises → "Créer"
 Formulaire:
 - name: "ACME SA"
 - vatNumber: "BE0123456789"
 - address, city, zipCode
 - email: contact@acme.be
 - phone (opt)
 
 Click "Créer"
 → POST /api/cabinet/entreprises/create
 → Créer Entreprise
 {
 name: "ACME SA",
 vatNumber: "BE0123456789",
 cabinetId: Cabinet_id,
 adminUserId: null (pas encore accepté),
 status: CREATED
 }
 → Audit log: ENTREPRISE_CREATED
 
 Option A: Cabinet invite Admin Entreprise MAINTENANT
 → Click "Inviter Admin Entreprise"
 → Email: marie@acme.be
 → Générer token (7j TTL, one-time)
 → Email:
 Sujet: "Vous êtes invité à gérer votre paie sur SocialFlow"
 Corps: "Bonjour,
 [Cabinet RH] vous invite à rejoindre SocialFlow
 pour gérer la paie de votre entreprise ACME SA.
 Lien: https://socialflow.app/invitations/accept?token=XXX&email=marie@acme.be
 Valide 7 jours."
 → Audit log: ENTREPRISE_INVITED
 
 Option B: Cabinet n'invite pas (invite via Gestionnaire later)
 → Entreprise stockée, pas encore active
 → Gestionnaire peut inviter Admin Entreprise

ADMIN ENTREPRISE ACCEPTE INVITATION:

Marie clique lien → /invitations/accept?token=XXX&email=marie@acme.be

Frontend valide:
 - Token existe + pas expiré + email match?

Affiche formulaire:
 - firstName (pré-fill: "Marie")
 - lastName
 - password (min 12 char)
 - ☐ Utiliser Google OAuth?
 - ☐ Utiliser Microsoft OAuth?

POST /invitations/accept
 Backend:
 → Vérifier token valide
 → Créer User
 {
 email: marie@acme.be,
 firstName, lastName,
 role: ENTREPRISE_CLIENTE,
 cabinetId: Cabinet_id
 }
 → Créer Entreprise.adminUserId = user.id
 → Créer OAuthProvider (credential OU oauth)
 → Marquer Invitation.status = ACCEPTED
 → Audit log: USER_CREATED, INVITATION_ACCEPTED
 → Auto-login
 → Redirect /dashboard/entreprise
```

### **AUTHENTIFICATION ENTREPRISE CLIENTE**

```
POST /auth/login
 email: marie@acme.be
 
 Option 1: Magic Link
 → Email lien (15 min)
 → Click → auto-login
 
 Option 2: Password
 → email + password → vérifier bcrypt
 → Créer JWT (1h) + Refresh token (24h)
 
 Option 3: OAuth
 → "Continue with Google"/"Microsoft"
 → OAuth callback → session

JWT PAYLOAD:
 {
 sub: user.id,
 email: "marie@acme.be",
 role: "ENTREPRISE_CLIENTE",
 cabinetId: "cabinet_123",
 entrepriseId: "ent_acme_id"
 }

REFRESH TOKEN: 24h HttpOnly
SESSION TIMEOUT: 60 min inactivité
```

### **PERMISSIONS ENTREPRISE CLIENTE**

```
Admin Entreprise peut (sur ses données SEULEMENT):

 VoirDONNÉES:
 ├─ Collaborateurs (ses salariés)
 ├─ Fiches de paie (ses fiches, en attente + validées)
 ├─ Contrats (ses contrats de travail)
 └─ Données Entreprise (nom, VAT, adresse)

 ACTIONS:
 ├─ Créer Collaborateurs (invite par email OU manuel)
 ├─ Modifier Collaborateurs (données perso, salaire)
 ├─ Valider fiches de paie (statut VALIDATION → VALIDÉE)
 ├─ Voir audit logs de son Entreprise
 └─ Gérer settings Entreprise (email, adresse)

 NE PEUT PAS:
 ├─ Créer fiches de paie (Gestionnaire crée)
 ├─ Envoyer fiches de paie (Cabinet envoie)
 ├─ Voir Entreprises autres
 ├─ Voir Collaborateurs autres Entreprises
 ├─ Modifier plan Stripe (Cabinet)
 ├─ Customiser SMTP/templates (Cabinet)
 ├─ Accéder données Cabinet RH
 └─ Créer/inviter Gestionnaire

 ISOLATION:
 Entreprise A ne voit JAMAIS Entreprise B
 WHERE cabinetId = $1 AND entrepriseId = $2
```

### **WORKFLOWS ENTREPRISE CLIENTE**

#### **Workflow 1: Admin Entreprise voit ses collaborateurs**

```
Admin Entreprise → Login
 → POST /auth/login
 → JWT contient: entrepriseId = "ent_acme"

Dashboard → Collaborateurs
 → GET /api/entreprise/collaborateurs
 Middleware vérifie:
 - role = ENTREPRISE_CLIENTE? 
 - cabinetId match JWT? 
 - entrepriseId match JWT? 
 Query:
 SELECT * FROM Collaborateur
 WHERE entrepriseId = $1 // ent_acme
 
 Affiche:
 - Jean Dupont (2500€ CDI, embauché 2024-01-15)
 - Marie Martin (3000€ CDI, embauché 2024-02-01)
 - Tom Blanc (2000€ CDD, embauché 2026-06-01)
```

#### **Workflow 2: Admin Entreprise valide Fiche de Paie**

```
Admin Entreprise → Fiches → État "VALIDATION"
 Affiche fiches EN ATTENTE DE VALIDATION:
 - Dupont Jean (Juin 2026) - Gestionnaire: "Jean (Cabinet RH XYZ)"
 - Martin Marie (Juin 2026) - Gestionnaire: "Jean"
 - Blanc Tom (Juin 2026) - Gestionnaire: "Jean"

Click fiche "Dupont Jean - Juin 2026"
 → Affiche détails:
 Salaire brut: 2500€
 ONSS: 326.75€
 Précompte: ~400€
 Charges: 1050€
 Salaire net: 1773.25€
 Générée par: Gestionnaire Jean (Cabinet RH XYZ)
 
 Buttons:
 ☐ "Valider" (approuve)
 ☐ "Rejeter" (revenir BROUILLON)

Click "Valider"
 → POST /fiches/{id}/validate
 Backend:
 → Vérifier accès (Entreprise + statut VALIDATION)
 → Marquer validatedBy: admin.userId
 → Statut: VALIDATION → VALIDÉE
 → Audit log: FICHE_VALIDATED
 → Notification Gestionnaire/Cabinet: "Fiche Dupont validée par ACME"
 
 Affiche: "Fiche approuvée"
 Statut: VALIDÉE (Cabinet peut maintenant envoyer)
```

#### **Workflow 3: Admin Entreprise invite Collaborateur**

```
Admin Entreprise → Collaborateurs → "Ajouter Collaborateur"

Option A: INVITE (email)
 Formulaire:
 - email: tom@example.com
 - firstName, lastName
 
 Click "Inviter"
 → Générer token (7j)
 → Email: tom@example.com
 "Vous êtes invité à rejoindre votre paie sur SocialFlow"
 → Audit log: COLLABORATEUR_INVITED

Option B: CRÉER (manuel)
 Formulaire:
 - firstName, lastName
 - niss: 12345678901
 - email: tom@example.com
 - dateEmbauche: 2026-06-01
 - typeContrat: "CDI"
 - salaireBase: 2000
 
 Click "Créer"
 → POST /api/entreprise/collaborateurs/create
 → Créer Collaborateur (userId = null si pas invitation)
 → Créer Contrat
 → Audit log: COLLABORATEUR_CREATED
 
 Collaborateur peut maintenant:
 ├─ Recevoir invitation (email)
 └─ Voir sa fiche (si userId créé via invitation)
```

---

## � COLLABORATEUR — ANALYSE COMPLÈTE

### **Qui est Collaborateur?**

```
= Salarié d'une Entreprise Cliente
= Créé par Entreprise Admin OU Gestionnaire RH
= Invité par email (token 7j, one-time use)
= Accès READ-ONLY à sa fiche de paie
= NE peut rien modifier
= Portail simple & épuré

Exemples:
 • Jean Dupont (salarié ACME SA)
 → Reçoit fiche paie chaque mois
 → Peut télécharger PDF
 → NE peut rien modifier
 
 • Marie Martin (salarié ACME SA)
 → Login SocialFlow
 → Voit sa fiche (statut ENVOYÉE)
 → Peut télécharger
```

### **WORKFLOW INVITATION COLLABORATEUR**

```
ENTREPRISE INVITE COLLABORATEUR:

Admin Entreprise → Collaborateurs → Tom → "Inviter"

POST /api/collaborateurs/invite
 email: tom@example.com
 
 Backend:
 → Vérifier Collaborateur existe
 → Générer invitation token (7j)
 → Créer Invitation (role=COLLABORATEUR)
 → Email: tom@example.com
 Sujet: "Accédez à votre fiche de paie"
 Corps: "Bonjour Tom,
 Vous avez été invité à accéder à votre fiche de paie
 sur SocialFlow (Cabinet RH XYZ).
 Lien: https://socialflow.app/invitations/accept?token=XXX&email=tom@example.com
 Valide 7 jours."
 → Audit log: COLLABORATEUR_INVITED

COLLABORATEUR ACCEPTE INVITATION:

Tom clique lien → /invitations/accept?token=XXX

Frontend:
 - Affiche formulaire simple
 - firstName (pré-fill: "Tom")
 - lastName
 - password (min 12 char)
 - ☐ Google OAuth?
 - ☐ Microsoft OAuth?

POST /invitations/accept
 Backend:
 → Vérifier token
 → Créer User
 {
 email: tom@example.com,
 role: COLLABORATEUR,
 cabinetId: Cabinet_id,
 entrepriseId: "ent_acme"
 }
 → Lier Collaborateur.userId = user.id
 → Marquer Invitation ACCEPTED
 → Audit log: USER_CREATED, INVITATION_ACCEPTED
 → Auto-login
 → Redirect /dashboard/collaborateur
```

### **AUTHENTIFICATION COLLABORATEUR**

```
POST /auth/login
 email: tom@example.com
 
 Option 1: Magic Link
 → Email lien (15 min)
 → Click → auto-login
 
 Option 2: Password
 → email + password → vérifier bcrypt
 → JWT (1h) + Refresh (24h)
 
 Option 3: OAuth
 → Google/Microsoft

JWT:
 {
 sub: user.id,
 email: "tom@example.com",
 role: "COLLABORATEUR",
 cabinetId: "cabinet_123",
 entrepriseId: "ent_acme_id",
 collaborateurId: "coll_tom_id"
 }
```

### **PERMISSIONS COLLABORATEUR**

```
Collaborateur peut:

 VoirSEULEMENT SES DONNÉES:
 ├─ Sa fiche de paie (statut ENVOYÉE, ARCHIVÉE)
 ├─ Son contrat de travail
 ├─ Ses données perso (NISS, email, salaire)
 └─ Audit log de sa fiche (qui a validé, quand)

 ACTIONS:
 ├─ Télécharger fiche en PDF
 ├─ Afficher fiche (HTML view)
 └─ Changer son password (optionnel)

 NE PEUT PAS:
 ├─ Voir d'autres collaborateurs
 ├─ Voir fiches d'autres collaborateurs
 ├─ Modifier sa fiche
 ├─ Créer quoi que ce soit
 ├─ Voir Entreprise/Cabinet données
 ├─ Accéder audit logs (sauf sa fiche)
 └─ Aucune action d'écriture

 READ-ONLY + ISOLATION MAXIMALE:
 Tom ne voit QUE sa propre fiche (1 seul enregistrement accédé)
 WHERE collaborateurId = $1
```

### **WORKFLOWS COLLABORATEUR**

#### **Workflow 1: Collaborateur reçoit sa fiche**

```
Cabinet envoie fiche → Email Tom:
 FROM: "Cabinet RH XYZ - Paie" <paie@cabinet.be>
 SUBJECT: "Votre fiche de paie - Juin 2026 - Cabinet RH XYZ"
 BODY: "Bonjour Tom,
 Votre fiche de paie (Juin 2026) est disponible.
 Salaire net: 1800€
 Lien: https://socialflow.app/fiches/XXXX/view?token=YYY (30 min TTL)
 Ou connectez-vous: https://socialflow.app/login"
 ATTACHMENT: fiche_juin_2026.pdf

Fiche ENVOYÉE:
 → Statut: ENVOYÉE
 → Visible au Collaborateur pendant 30 jours
 → Après 30j: auto-archive
```

#### **Workflow 2: Collaborateur accède au portail**

```
Tom reçoit email (méthode 1: lien direct 30 min)
 → Click lien /fiches/XXXX/view?token=YYY
 → Affiche fiche sans login (token 30 min)
 → Voir PDF inline + télécharger
 → Expire après 30 min

Ou: Tom se connecte (méthode 2: login persistant)
 → POST /auth/login (Magic Link + Password + OAuth)
 → Redirect /dashboard/collaborateur
 → Affiche sa fiche
 → Voir fiches ENVOYÉES des 30 derniers jours
 → Session: 1h, refresh 24h
```

#### **Workflow 3: Collaborateur télécharge sa fiche**

```
Dashboard → Fiche "Juin 2026"

Buttons:
 ☐ "Voir" (affiche HTML)
 ☐ "Télécharger PDF" (direct download)

Click "Télécharger PDF"
 → GET /api/fiches/{id}/download
 Middleware vérifie:
 - User role = COLLABORATEUR?
 - collaborateurId = own id?
 - Fiche visible (ENVOYÉE ou ARCHIVÉE)?
 → Télécharger fiche.pdf
 → Audit log: FICHE_DOWNLOADED
```

#### **Workflow 4: Collaborateur change password**

```
Dashboard → Settings → "Changer mot de passe"

Formulaire:
 - Mot de passe actuel (si password auth)
 - Nouveau mot de passe (min 12 char)
 - Confirmer

Click "Mettre à jour"
 → POST /api/user/password
 → Vérifier ancien MDP (si existant)
 → Hash nouveau MDP (bcrypt)
 → Sauvegarder
 → Audit log: PASSWORD_CHANGED
 → Email confirmation
 → Message: "Mot de passe changé"
```

### **TABLEAU: ISOLATION COLLABORATEUR**

```
Collaborateur Tom (ACME SA):
 Voit: sa fiche uniquement
 Voit PAS: fiches autres collaborateurs
 Voit PAS: données ACME
 Voit PAS: Entreprise/Cabinet
 Voit PAS: audit logs autres

Implémentation (JWT):
 {
 collaborateurId: "coll_tom_id",
 entrepriseId: "ent_acme"
 }
 Query: WHERE collaborateurId = $1
```

### **LIMITATIONS COLLABORATEUR**

```
 NE PEUT JAMAIS:
 • Voir d'autres collaborateurs
 • Voir fiches autres
 • Modifier sa fiche
 • Créer/modifier/supprimer
 • Accéder données autres niveaux
 • Voir audit logs
 • Downloader avant ENVOYÉE
 • Voir après archive (ARCHIVÉE seulement)

KEY POINT:
 Collaborateur = "portail simple & sécurisé"
 Voir fiche + télécharger, c'est tout.
 Read-only strict.
```

---

## EMAIL WORKFLOWS

### Configuration Globale (SuperAdmin)

Default SMTP: Resend (pour invitations système)
Default Templates: SocialFlow branding
Fallback: Si Cabinet SMTP échoue 3x → Resend global

### Events & Templates

#### 1. Invitation Gestionnaire
```
Event: Cabinet RH invite Gestionnaire
Trigger: POST /api/cabinet/gestionnaires/invite
To: gestionnaire@email.com
Subject: {{cabinet_name}} vous invite en tant que Gestionnaire
From: noreply@cabinet.socialflow.app (ou Cabinet SMTP si configured)

Body variables:
  {{cabinet_name}} — Nom du Cabinet RH
  {{gestionnaire_name}} — Prénom Nom du Gestionnaire
  {{invitation_link}} — lien /invitations/accept?token=XXX&email=YYY
  {{expiry_date}} — Date d'expiration (7 jours)

Retry policy:
  Attempt 1: immediate
  Attempt 2: +5 min (exponential)
  Attempt 3: +15 min
  After 3: log bounce, alert Cabinet admin
```

#### 2. Invitation Entreprise Cliente
```
Event: Cabinet invite Entreprise Cliente (admin)
Trigger: POST /api/cabinet/entreprises/invite-admin
To: admin@entreprise.be
Subject: Accès fiche de paie {{cabinet_name}}
From: {{cabinet_from_email}} (Cabinet SMTP)

Body variables:
  {{cabinet_name}}
  {{entreprise_name}}
  {{admin_name}}
  {{login_link}}

Retry: Same as Gestionnaire
```

#### 3. Invitation Collaborateur
```
Event: Entreprise invite Collaborateur (salarié)
Trigger: POST /api/entreprise/collaborateurs/invite
To: employe@email.com
Subject: Accès à votre fiche de paie
From: {{cabinet_from_email}}

Body variables:
  {{employe_name}}
  {{entreprise_name}}
  {{fiche_link}}
  {{support_email}}

Retry: Same as Gestionnaire
```

#### 4. Fiche Prête pour Validation
```
Event: Gestionnaire crée fiche (BROUILLON → VALIDATION)
Trigger: PUT /api/gestionnaire/fiches/{id}/validate
To: admin@entreprise.be
Subject: Nouvelle fiche de paie à valider — {{employe_name}} — {{month}}/{{year}}
From: {{cabinet_from_email}}

Body:
  - Lien vers portail validation
  - Deadline validation (ex: J+3)
  - Récapitulatif fiche (salaire brut, net)

Retry: 3x standard
Template: Resend (pas Cabinet SMTP pour this)
```

#### 5. Fiche Validée & Prête à Envoyer
```
Event: Entreprise approuve fiche (VALIDATION → VALIDÉE)
Trigger: PUT /api/fiches/{id}/validate + decision=approve
To: collaborateur@email.com (+ cabinet if configured)
Subject: Fiche de paie {{month}}/{{year}} disponible
From: {{cabinet_from_email}}

Body:
  - Lien download fiche PDF (30 min public token)
  - Résumé net, ONSS, précompte
  - Lien portail Collaborateur
  - Support contact

Retry: 3x standard
Template: Cabinet SMTP prioritaire
```

#### 6. Fiche Envoyée & Archivée
```
Event: Cabinet archive fiche après 30 jours
Trigger: Auto-archive job (BullMQ + Cron)
To: collaborateur@email.com
Subject: Fiche de paie {{month}}/{{year}} archivée
From: noreply@socialflow.app

Body:
  - Fiche accessible 5 ans (rétention légale)
  - Lien permanent (persistant)

Retry: Best effort (pas critique)
```

#### 7. Password Reset
```
Event: User demande reset password
Trigger: POST /auth/forgot-password
To: email@email.com
Subject: Réinitialiser mot de passe SocialFlow
From: noreply@socialflow.app

Body:
  - Lien reset: /auth/reset-password?token=XXX
  - TTL: 1 heure
  - Message: "Ce lien expire dans 1 heure"

Retry: 3x standard
Template: Resend (global, pas Cabinet)
```

#### 8. Account Alerts
```
Suspended account:
  Event: SuperAdmin suspend user
  To: suspended_user@email.com
  Subject: Accès SocialFlow suspendu
  Body: "Votre accès a été suspendu. Contactez support."

Failed login (3x):
  Event: 3 failed login attempts
  To: user@email.com
  Subject: Tentatives de connexion suspectes
  Body: "3 tentatives échouées. Si c'était vous, réinitialisez MDP."
  Rate limit: 1 email par heure (pas de spam)
```

### Email Delivery

SMTP providers:
  - Cabinet SMTP (si configured): pour fiches & client emails
  - Resend (global): pour system emails (invites, alerts)

Headers:
  - X-Email-Type: system|fiche|notification
  - X-Tenant: cabinetId
  - List-Unsubscribe: /settings/email-prefs

Tracking:
  - Log: envoyed_at, status (sent/bounced/opened)
  - Audit: who sent to whom, when
  - Analytics: delivery rate par Cabinet

---

## CHECKLIST: AVANT DE DÉVELOPPER

- [ ] Approuver cette SPEC (modèle = 5 rôles avec portails)
- [ ] Copier schéma Prisma
- [ ] Setup Vercel + PostgreSQL + Redis
- [ ] OAuth Google + Microsoft
- [ ] Stripe (plans + webhooks)
- [ ] Resend (emails)
- [ ] Better Auth (3 methods)
- [ ] Invitations (tokens 7j)
- [ ] Customisation Cabinet (SMTP override)
- [ ] Tests: toutes les authentifications

---

**MAINTENANT C'EST CLAIR & FINAL.** 

Prêt à coder? �
