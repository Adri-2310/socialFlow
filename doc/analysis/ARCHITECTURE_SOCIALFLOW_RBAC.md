# Architecture SocialFlow - Modèle Métier & RBAC Complète

**Document**: Architecture RBAC Production-Grade  
**Date**: 2026-06-26  
**Statut**: Analyse Détaillée pour Implémentation  

---

## 1. Nomenclature Recommandée

### Résumé des Changements Proposés

| Terme Actuel | Terme Recommandé | Justification |
|---|---|---|
| **Admin-Secrétariat** | **Cabinet RH** | ✓ Terme métier précis (paie + RH)  ✓ Évite ambiguïté "Admin"  ✓ Reconnaissable SaaS RH |
| **Consultant** | **Gestionnaire RH** | ✓ Rôle clair (gère la paie/RH pour clients)  ✓ Pas d'ambiguïté "conseil"  ✓ Actionnable (action: gérer) |
| **Client** | **Entreprise Cliente** | ✓ Précis (entreprise, pas contact)  ✓ Différencie du Consultant  ✓ Propriétaire données |
| **Employé** | **Collaborateur** | ✓ Terme courant RH  ✓ Évite "Employé" trop vague  ✓ Inclut tous types contrats |

### Hiérarchie Clarifiée

```
SuperAdmin (Propriétaire SocialFlow) ← Rôle unique, pas d'invitation
    ↓
Cabinet RH (Clients principaux) ← Auto-inscription + Invitation SuperAdmin
    ├─ Autonomes: créent compte, s'abonnent
    ├─ Propriétaires: data + Gestionnaires RH
    ↓
Gestionnaire RH (Experts du Cabinet) ← Invitation par Cabinet RH
    ├─ Attachés à 1-N Entreprises Clientes
    ├─ Gèrent paie + RH pour leurs clients
    ↓
Entreprise Cliente (Client du Gestionnaire) ← Invitation par Cabinet RH OU Gestionnaire RH
    ├─ Propriétaire données
    ├─ Crée ses Collaborateurs
    ↓
Collaborateur (Utilisateur final, salarié) ← Invitation par Entreprise Cliente OU Gestionnaire
    └─ Accès limité à ses données
```

---

## 2. Hiérarchie des Rôles & Relations d'Invitation

### Diagramme Complet

```
┌─────────────────────────────────────────────────────────────┐
│                         SOCIALFLOW                           │
├─────────────────────────────────────────────────────────────┤
│
│  ┌──────────────────┐
│  │   SuperAdmin     │  Propriétaire de SocialFlow
│  │   (1 seul)       │  • Crée les Cabinets RH (manuel)
│  └────────┬─────────┘  • Accès portail d'administration
│           │             • Gestion facturation globale
│           │ (creation   • Audit logs complets
│           │  manuel)    • Gestion incidents
│           │
│  ┌────────▼────────────────────────────────────────┐
│  │   Cabinet RH (Agent RH Principal)                │
│  │   • Auto-inscription possible                    │
│  │   • S'abonne au forfait SocialFlow               │
│  │   • Invite ses Gestionnaires RH                  │
│  │   • RBAC: Full control sur ses données           │
│  │   • Contacts: email, tel, adresse                │
│  │   • Facturation: paye directement                │
│  │   • Fonctionnalités: API, webhooks, SSO          │
│  │   • Storage: jusqu'à N Go selon forfait          │
│  └────────┬────────────────────────────────────────┘
│           │ (invitation email)
│           │ QUANDO: Cabinet décide
│           │ RESTRICTIONS: Max 50 invites/mois
│           │
│  ┌────────▼────────────────────────────────────────┐
│  │   Gestionnaire RH (Expert/Consultant)            │
│  │   • Invité par Cabinet RH                        │
│  │   • Gère 1-N Entreprises Clientes                │
│  │   • RBAC: Read/Write sur données assignées       │
│  │   • Paie: peut modifier (selon config Cabinet)   │
│  │   • RH: peut modifier                            │
│  │   • NE peut PAS: supprimer Entreprises           │
│  │   • NE peut PAS: gérer autres Gestionnaires      │
│  │   • NE peut PAS: voir données d'autres           │
│  └────────┬────────────────────────────────────────┘
│           │ (invitation email)
│           │ QUANDO: Cabinet OU Gestionnaire
│           │ RESTRICTIONS: Max 500 invites/mois
│           │
│  ┌────────▼────────────────────────────────────────┐
│  │   Entreprise Cliente (Client/Employeur)          │
│  │   • Invitée par Cabinet OU Gestionnaire          │
│  │   • Propriétaire des données (employés, paie)    │
│  │   • RBAC: Full control sur ses données           │
│  │   • Crée ses Collaborateurs                      │
│  │   • Peut changer Gestionnaire assigné             │
│  │   • NE peut PAS: voir données d'autres           │
│  │   • NE peut PAS: gérer autres Entreprises        │
│  │   • Export RGPD: Oui (ses données uniquement)    │
│  └────────┬────────────────────────────────────────┘
│           │ (invitation email)
│           │ QUANDO: Entreprise décide
│           │ RESTRICTIONS: Max 1000 invites/mois
│           │
│  ┌────────▼────────────────────────────────────────┐
│  │   Collaborateur (Salarié/Utilisateur Final)      │
│  │   • Invité par Entreprise OU Gestionnaire        │
│  │   • Accès limité: ses données uniquement         │
│  │   • RBAC: Read-only sur ses infos personnelles   │
│  │   • RBAC: Read-write sur ses documents           │
│  │   • NE peut PAS: voir autres collaborateurs      │
│  │   • NE peut PAS: modifier paie                   │
│  │   • Export RGPD: Ses données uniquement          │
│  └────────────────────────────────────────────────┘
```

### Récapitulatif Relations

```
SuperAdmin
  └─ Crée: Cabinet RH (manuel via backoffice)

Cabinet RH
  ├─ Auto-inscription: Oui
  ├─ Invite: Gestionnaire RH
  └─ Crée/Assigne: Entreprise Cliente

Gestionnaire RH
  ├─ Invitation requise: Oui (par Cabinet)
  ├─ Invite: Entreprise Cliente (collaboration)
  └─ Assigné à: 1-N Entreprises Clientes

Entreprise Cliente
  ├─ Invitation requise: Oui (par Cabinet OU Gestionnaire)
  ├─ Invite: Collaborateur
  └─ Assignée à: Gestionnaire RH (flexible)

Collaborateur
  ├─ Invitation requise: Oui (par Entreprise)
  ├─ Invite: Personne
  └─ Appartient à: 1 Entreprise Cliente
```

---

## 3. Matrice RBAC Détaillée

### 3.1 SuperAdmin

```
RÔLE: SuperAdmin
├─ Accès: Portail administration
├─ Parent: NONE (créé à la main)
├─ Enfants: Cabinet RH (création manuelle uniquement)
│
├─ PERMISSIONS - DONNÉES:
│  ├─ Propres données: CRUD (profil)
│  ├─ Cabinets RH: Read-Only (audit), Delete (suspension), Modify (forfait)
│  ├─ Gestionnaires RH: Read-Only (audit)
│  ├─ Entreprises Clientes: Read-Only (audit)
│  ├─ Collaborateurs: Read-Only (audit)
│  └─ Données de Paie: Read-Only (audit uniquement, RGPD strict)
│
├─ PERMISSIONS - ACTIONS:
│  ├─ Inviter: Aucun (création manuelle Cabinet RH)
│  ├─ Authentification: Login direct (email/password)
│  ├─ OAuth: Oui (Microsoft optional pour sécurité)
│  ├─ Supprimer utilisateurs: Oui (suspension/anonymization)
│  ├─ Changer forfait: Oui
│  ├─ Voir logs audit: Oui (tous les logs)
│  ├─ Export RGPD: N/A (données anonymes uniquement)
│  └─ Webhooks/API: Oui (admin-only endpoints)
│
├─ PERMISSIONS - PORTAILS:
│  ├─ Dashboard d'administration: Oui
│  ├─ Gestion facturation: Oui
│  ├─ Logs d'audit: Oui (tous)
│  ├─ Gestion incidents: Oui
│  ├─ Configuration système: Oui
│  └─ Analitiques: Oui (globales)
│
└─ RESTRICTIONS:
   ├─ Max utilisateurs: Illimité
   ├─ Max API calls: Illimité
   ├─ Storage: Illimité
   └─ Autres: 2FA obligatoire
```

### 3.2 Cabinet RH

```
RÔLE: Cabinet RH
├─ Authentification: Auto-inscription OU invitation SuperAdmin
├─ Parent: SuperAdmin
├─ Enfants: Gestionnaire RH
│
├─ PERMISSIONS - DONNÉES:
│  ├─ Propres données: CRUD (profil, coordonnées, photo)
│  ├─ Forfait & Facturation: CRUD
│  ├─ Gestionnaires RH (ses): CRUD
│  ├─ Gestionnaires RH (autres): None
│  ├─ Entreprises Clientes (ses): CRUD (par lui OU Gestionnaires)
│  ├─ Entreprises Clientes (autres): None
│  ├─ Collaborateurs (dans ses Entreprises): Read-Only (audit)
│  └─ Données de Paie (ses Entreprises): Read-Only par défaut
│
├─ PERMISSIONS - ACTIONS:
│  ├─ Authentification: Login direct (email/password) OU OAuth
│  ├─ Auto-inscription: Oui (seul Cabinet peut)
│  ├─ Inviter Gestionnaires: Oui (email invitation)
│  ├─ Inviter Entreprises: Oui (via Gestionnaire OU direct)
│  ├─ Inviter Collaborateurs: Non (par Entreprise)
│  ├─ Changer rôle: Non (superviseur → manager pas possible)
│  ├─ Supprimer utilisateurs: Oui (ses Gestionnaires & Entreprises)
│  ├─ Gérer forfait: Oui
│  ├─ Gérer intégrations OAuth: Oui (configurer Microsoft/Google)
│  ├─ Voir logs audit: Oui (ses utilisateurs uniquement)
│  ├─ Export RGPD: Oui (ses données)
│  ├─ API keys: Oui (création/gestion)
│  ├─ Webhooks: Oui (configurer événements)
│  └─ SSO Activation: Oui (pour ses utilisateurs)
│
├─ PERMISSIONS - PORTAILS:
│  ├─ Dashboard principal: Oui (ses données)
│  ├─ Gestion Gestionnaires: Oui
│  ├─ Gestion Entreprises: Oui
│  ├─ Gestion Collaborateurs: Partial (read-only via Entreprises)
│  ├─ Facturation/Abonnement: Oui
│  ├─ Paramètres: Oui
│  ├─ Logs audit: Oui (ses utilisateurs)
│  ├─ API & Webhooks: Oui
│  └─ Analitiques: Oui (ses données)
│
└─ RESTRICTIONS:
   ├─ Max Gestionnaires: 50 (configurable par forfait)
   ├─ Max Entreprises Clientes: 500 (configurable par forfait)
   ├─ Max Collaborateurs: 5000 (configurable par forfait)
   ├─ Max invites/mois: 50 (peut être augmenté)
   ├─ Max API calls/mois: 100 000 (par forfait)
   ├─ Storage: 10 Go/mois (par forfait)
   ├─ OAuth: Optionnel (fortement conseillé)
   └─ 2FA: Optionnel (recommandé pour compte Cabinet)
```

### 3.3 Gestionnaire RH

```
RÔLE: Gestionnaire RH
├─ Authentification: Invitation requis (par Cabinet RH)
├─ Parent: Cabinet RH
├─ Enfants: Entreprise Cliente (collaboration, pas création directe)
│
├─ PERMISSIONS - DONNÉES:
│  ├─ Propres données: CRUD (profil, photo, spécialité)
│  ├─ Cabinet RH: Read-Only (info Cabinet)
│  ├─ Autres Gestionnaires: None
│  ├─ Entreprises Clientes assignées: CRUD (selon contrat)
│  ├─ Entreprises Clientes (non-assignées): None
│  ├─ Collaborateurs (dans ses Entreprises): Read/Write
│  ├─ Données de Paie (ses Entreprises): Read/Write (ou Read-Only si config)
│  └─ Données de Paie (autres Entreprises): None
│
├─ PERMISSIONS - ACTIONS:
│  ├─ Authentification: Login direct OU OAuth (si config Cabinet)
│  ├─ Auto-inscription: Non (invitation obligatoire)
│  ├─ Inviter: Entreprises Clientes uniquement
│  ├─ Créer Entreprises: Non (créé par Cabinet OU auto-creation par Entreprise)
│  ├─ Accepter invitation: Oui (email token)
│  ├─ Changer rôle: Non
│  ├─ Supprimer utilisateurs: Non (demande Cabinet)
│  ├─ Supprimer Entreprises: Non
│  ├─ Modifier données Paie: Oui (si autorisé par Cabinet)
│  ├─ Voir logs audit: Partial (ses Entreprises uniquement)
│  ├─ Export RGPD: Oui (ses données + ses Entreprises)
│  ├─ API keys: Non (via Cabinet)
│  └─ OAuth Linking: Oui (personnel)
│
├─ PERMISSIONS - PORTAILS:
│  ├─ Dashboard personnel: Oui (ses Entreprises)
│  ├─ Gestion Entreprises Clientes: Partial (assignées)
│  ├─ Gestion Collaborateurs: Oui (ses Entreprises)
│  ├─ Gestion Paie: Oui (ses Entreprises, read/write selon config)
│  ├─ Logs audit: Partial (ses Entreprises)
│  └─ Paramètres personnels: Oui
│
└─ RESTRICTIONS:
   ├─ Max Entreprises assignées: Configurable (ex: 20)
   ├─ Max Collaborateurs gérés: Configurable (ex: 500)
   ├─ Max invites/mois: Configurable (ex: 50)
   ├─ Durée de contrat: Peut être définie (ex: 1 an)
   ├─ OAuth: Optionnel (conseillé)
   └─ 2FA: Optionnel
```

### 3.4 Entreprise Cliente

```
RÔLE: Entreprise Cliente
├─ Authentification: Invitation requis (Cabinet RH OU Gestionnaire)
├─ Parent: Cabinet RH (via Gestionnaire)
├─ Enfants: Collaborateur (employés)
│
├─ PERMISSIONS - DONNÉES:
│  ├─ Propres données: CRUD (profil, coordonnées, logo)
│  ├─ Collaborateurs: CRUD (création, modification, suppression)
│  ├─ Données de Paie: CRUD (ses collaborateurs)
│  ├─ Documents: CRUD (paie, RH, contrats)
│  ├─ Cabinet RH: Read-Only (info)
│  ├─ Gestionnaire assigné: Read-Only (info)
│  ├─ Autres Entreprises: None
│  └─ Autres Collaborateurs: None
│
├─ PERMISSIONS - ACTIONS:
│  ├─ Authentification: Login direct OU OAuth (si config)
│  ├─ Auto-inscription: Non (invitation obligatoire)
│  ├─ Inviter Collaborateurs: Oui (email token)
│  ├─ Accepter invitation: Oui (email token)
│  ├─ Changer Gestionnaire: Oui (demande Cabinet confirmation)
│  ├─ Supprimer Collaborateurs: Oui
│  ├─ Supprimer compte: Oui (anonymization après délai)
│  ├─ Modifier données Paie: Oui
│  ├─ Exporter données: Oui (format standard)
│  ├─ Voir logs audit: Oui (ses actions)
│  ├─ Export RGPD: Oui (ses données)
│  ├─ API keys: Non (via Cabinet)
│  └─ OAuth Linking: Oui (personnel)
│
├─ PERMISSIONS - PORTAILS:
│  ├─ Dashboard: Oui (ses données)
│  ├─ Gestion Collaborateurs: Oui
│  ├─ Gestion Paie: Oui
│  ├─ Documents: Oui
│  ├─ Logs audit: Oui (ses actions)
│  └─ Paramètres: Oui
│
└─ RESTRICTIONS:
   ├─ Max Collaborateurs: Configurable par Cabinet (ex: 500)
   ├─ Max invites/mois: Configurable (ex: 100)
   ├─ Durée invitation lien: 7 jours
   ├─ Accès période: 12 mois rolling (selon forfait)
   ├─ OAuth: Optionnel
   └─ 2FA: Optionnel
```

### 3.5 Collaborateur

```
RÔLE: Collaborateur
├─ Authentification: Invitation requis (Entreprise Cliente OU Gestionnaire)
├─ Parent: Entreprise Cliente
├─ Enfants: None
│
├─ PERMISSIONS - DONNÉES:
│  ├─ Propres données: CRUD (profil, photo, coordonnées)
│  ├─ Données de Paie personnelle: Read-Only (voir sa paie)
│  ├─ Documents personnels: Read-Only (ses contrats, attestations)
│  ├─ Autres Collaborateurs: None
│  ├─ Données d'autres: None
│  └─ Données Cabinet: None
│
├─ PERMISSIONS - ACTIONS:
│  ├─ Authentification: Login direct OU OAuth (si config)
│  ├─ Auto-inscription: Non (invitation obligatoire)
│  ├─ Inviter: Personne
│  ├─ Accepter invitation: Oui (email token)
│  ├─ Modifier profil: Oui (photo, coordonnées)
│  ├─ Modifier paie: Non
│  ├─ Télécharger documents: Oui (ses documents)
│  ├─ Voir logs audit: Non
│  ├─ Export RGPD: Oui (ses données)
│  └─ OAuth Linking: Oui (personnel)
│
├─ PERMISSIONS - PORTAILS:
│  ├─ Dashboard personnel: Oui (sa paie, documents)
│  ├─ Consultation Paie: Oui (read-only)
│  ├─ Documents: Oui (consultation et téléchargement)
│  └─ Paramètres personnels: Oui
│
└─ RESTRICTIONS:
   ├─ Aucune création de ressources
   ├─ Read-only sur paie
   ├─ Accès: Sa fiche uniquement
   ├─ Durée invitation: 7 jours
   ├─ OAuth: Optionnel
   └─ 2FA: Optionnel
```

### 3.6 Résumé Matrice Permissions

| Acteur | Login | Auto-Register | Invite | Can Be Invited | Voir Propres Données | Voir Données Enfants | Voir Parent | 2FA | API Keys |
|---|---|---|---|---|---|---|---|---|---|
| **SuperAdmin** | ✓ | N/A | ✗ | ✗ | ✓ | ✓ (read) | N/A | Oui | Oui |
| **Cabinet RH** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (read) | Opt | Oui |
| **Gestionnaire RH** | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ (R/W) | ✓ (read) | Opt | ✗ |
| **Entreprise Cliente** | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ (R/W) | ✓ (read) | Opt | ✗ |
| **Collaborateur** | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ (read) | Opt | ✗ |

---

## 4. Workflows d'Invitation par Email

### 4.1 Cabinet RH → Gestionnaire RH

#### Déclencheur
- **Page**: Paramètres → Gestionnaires RH → Bouton "Inviter Gestionnaire"
- **UI**: Formulaire modal avec champs:
  - Email du Gestionnaire (requis, validé)
  - Prénom, Nom (requis)
  - Spécialité (optionnel: Paie, RH, Général)
  - Message personnalisé (optionnel)

#### Email d'Invitation
```
Sujet: Vous êtes invité à rejoindre [Cabinet RH Name] sur SocialFlow

Corps:
Bonjour [FirstName],

[Cabinet RH Name] vous invite à rejoindre SocialFlow en tant que 
Gestionnaire RH pour gérer la paie et RH de vos clients.

DÉTAILS:
- Rôle: Gestionnaire RH
- Cabinet: [Cabinet Name]
- Spécialité: [Spécialité si définie]

ACTION: Accéptez l'invitation ci-dessous ou copier le lien
[BUTTON] Accepter l'invitation
ou
https://socialflow.app/invitations/accept?token=TOKEN_UNIQUE_64chars

Validité: Cette invitation expire dans 7 jours.

Questions? Contactez [Cabinet Support Email]
```

#### Processus Technique

1. **Génération Token**:
   ```
   token = generateSecureToken(64 chars, alphanumeric + special)
   invitationRecord = {
     id: UUID,
     email: "gestionnaire@example.com",
     token: hash(token),
     cabinetId: UUID,
     createdBy: SuperAdmin/Cabinet ID,
     createdAt: now(),
     expiresAt: now() + 7 days,
     status: "pending",
     role: "GESTIONNAIRE_RH",
     metadata: {spécialité, message}
   }
   ```

2. **Envoi Email**:
   - Via système de queue (Resend/SendGrid)
   - Include token en clair dans URL (sûr: token one-time use)
   - Retry automatique 3x si échec

3. **Lien d'Activation**:
   - Format: `https://socialflow.app/invitations/accept?token=TOKEN&email=EMAIL`
   - TTL: 7 jours
   - One-time use: Après utilisation, token=invalidated

#### Page de Création Compte (depuis invitation)

```
URL: /invitations/accept?token=XXX&email=yyy@example.com

FORMULAIRE:
[ ] Email (pré-rempli, read-only)
[ ] Prénom (requis)
[ ] Nom (requis)
[ ] Mot de passe (requis, min 12 chars, rules: majuscule, minuscule, chiffre, spécial)
[ ] Confirmer mot de passe

[ ] OAuth (optionnel - "Lier mon compte Microsoft/Google")
    └─ Si coché: redirection OAuth, puis retour avec token

[ ] Conditions d'utilisation (requis à cocher)
[ ] Politique confidentialité (requis à cocher)

[BOUTON] Créer mon compte

Validation:
- Email: format valid + non déjà utilisé
- Mot de passe: min 12 chars + complexity
- Si erreur: affiche error inline
- Si succès: redirect /dashboard (auto-login)
```

#### Post-Création

```
ACTIONS AUTOMATIQUES:
1. Token invitation = invalidated
2. InvitationRecord.status = "accepted"
3. User account créé + active
4. Notification Cabinet: "[Prénom Nom] a accepté invitation"
5. Notification Gestionnaire: "Bienvenue! Vous pouvez maintenant..."
6. Audit log: invitation_accepted, user_id, timestamp

EMAILS ENVOYÉS:
- À Cabinet: "Gestionnaire [Name] a rejoint"
- À Gestionnaire: "Bienvenue - Les prochaines étapes"
  (liens: Dashboard, Tutoriel, Support)
```

---

### 4.2 Cabinet RH → Entreprise Cliente

#### Déclencheur

**Deux chemins**:

1. **Par Cabinet** (Cabinet crée Entreprise):
   - Page: Paramètres → Entreprises → Bouton "Ajouter Entreprise"
   - Formulaire: Nom, SIRET, Adresse, Email contact
   - Action: Cabinet crée directement (pas invitation si Admin de l'Entreprise existe)

2. **Par Gestionnaire** (recommande Entreprise):
   - Page: Mes Clients → Bouton "Inviter Entreprise"
   - Formulaire: Email de l'admin Entreprise, Nom Entreprise
   - Action: Gestionnaire invite l'Entreprise

#### Email d'Invitation (par Cabinet/Gestionnaire)

```
Sujet: [Cabinet Name] vous invite à rejoindre SocialFlow pour gérer votre paie

Corps:
Bonjour,

[Cabinet Name] / [Gestionnaire Name] vous invite à rejoindre SocialFlow
pour externaliser la gestion de paie de votre entreprise.

VOTRE ENTREPRISE:
- Nom: [Entreprise Name]
- Gestionnaire assigné: [Gestionnaire Name]
- Rôle que vous aurez: Administrateur Entreprise

ÉTAPES SUIVANTES:
1. Acceptez l'invitation ci-dessous
2. Créez votre compte
3. Invitez vos collaborateurs
4. Configurez votre paie

[BUTTON] Accepter et créer compte
ou
https://socialflow.app/invitations/accept?token=TOKEN

Cette invitation expire dans 14 jours.

Questions? Contactez [Cabinet Email] ou [Gestionnaire Email]
```

#### Processus Technique

Identique à section 4.1 mais:
- TTL: 14 jours (plus long que Gestionnaire car Entreprise may debate)
- Role: `ENTREPRISE_CLIENTE`
- CreatedBy: Cabinet OU Gestionnaire RH
- Status: Peut être "pending", "accepted", "rejected", "expired"

#### Page de Création Compte

Même que section 4.1, mais affiche:
```
[ ] Informations Entreprise (pré-remplies):
    - Nom Entreprise: [pré-rempli, read-only]
    - SIRET: [optionnel, pré-rempli]

[ ] Informations Admin Personnel:
    - Prénom, Nom, Email
    - Mot de passe
    - OAuth (optional)

[ ] Accepter conditions

[CRÉER COMPTE]
```

---

### 4.3 Entreprise Cliente → Collaborateur

#### Déclencheur

- **Page**: Collaborateurs → Bouton "Inviter Collaborateur"
- **UI**: Formulaire ou CSV bulk:
  ```
  Email (requis)
  Prénom (requis)
  Nom (requis)
  Département (optionnel)
  Fonction (optionnel)
  Date d'embauche (optionnel)
  ```

#### Email d'Invitation

```
Sujet: Bienvenue chez [Entreprise Name] - SocialFlow Paie

Corps:
Bonjour [FirstName],

Vous êtes maintenant inscrit dans SocialFlow pour consulter votre paie 
et documents RH de [Entreprise Name].

ACCÈS DIRECT:
[BUTTON] Se connecter / Créer compte
https://socialflow.app/invitations/accept?token=TOKEN

LOGIN PAR DÉFAUT (si création sans invitation acceptée):
- Email: [email]
- Mot de passe: À créer à votre première connexion

VOUS POUVEZ:
✓ Consulter votre paie (mensuelle)
✓ Télécharger vos documents (contrat, attestations)
✓ Mettre à jour vos coordonnées
✓ Lier votre compte Microsoft/Google (optionnel)

QUESTIONS?
Contactez [Entreprise HR Email] ou notre support [Support Email]

Bienvenue!
```

#### Processus Technique

1. **Token Generation**:
   - TTL: 7 jours
   - Role: `COLLABORATEUR`
   - Relationship: Entreprise ID
   - Status: `pending`

2. **Options Création Compte**:
   - **Option A** (Recommandée): Collaborateur clique lien, crée password
   - **Option B** (Admin Entreprise peut): Envoyer password temporaire
     - Password: auto-généré (ex: `Temp@123456`)
     - Collaborateur doit changer à première connexion

3. **Post-Création**:
   ```
   ACTIONS:
   1. User account créé
   2. Relationship Entreprise ↔ Collaborateur établie
   3. Token invalidated
   4. Audit log: collaborator_invited, entreprise_id
   5. Email confirmation Entreprise: "[Name] invité"
   6. Email confirmation Collaborateur: "Bienvenue"
   ```

---

### 4.4 Workflow Résumé - Table Comparative

| Flux | Inviteur | Invité | Email TTL | Action Invité | Validation |
|---|---|---|---|---|---|
| Cabinet → Gestionnaire | Cabinet RH | Gestionnaire RH | 7 jours | Token + Email link | Email must not exist |
| Cabinet → Entreprise | Cabinet/Gestionnaire | Entreprise Admin | 14 jours | Token + Email link | Email must not exist |
| Entreprise → Collaborateur | Entreprise Admin | Collaborateur | 7 jours | Token + Email link (ou Password temp) | Email must not exist |

---

## 5. Flux Authentification Complet

### 5.1 Diagramme Flux

```
┌─────────────────────────────────────────────────────────────┐
│               SOCIALFLOW - AUTH FLOWS                        │
├─────────────────────────────────────────────────────────────┤

FLUX 1: PREMIER UTILISATEUR - AUTO-INSCRIPTION (Cabinet RH seulement)
────────────────────────────────────────────────────────────────
1. Utilisateur ouvre socialflow.app
2. Click "S'inscrire" → /auth/register (formulaire)
   - Email, Mot de passe, Prénom, Nom, Entreprise
   - Validation email unique
3. Créer compte → Journal de bord: Cabinet RH
4. Auto-login → /dashboard

FLUX 2: INVITATION - NOUVEAU UTILISATEUR
──────────────────────────────────────────
1. Inviteur envoie invitation email
2. Invité clique lien → /invitations/accept?token=XXX&email=YYY
3. Système valide token:
   - Token existe + non expiré + non utilisé ✓
   - Email matche ✓
4. Afficher formulaire création compte (pré-rempli email)
5. Invité remplit: Prénom, Nom, Mot de passe
6. Créer compte + marquer invitation comme utilisée
7. Auto-login → /dashboard

FLUX 3: INVITATION - UTILISATEUR EXISTANT
──────────────────────────────────────────
(Rare mais possible si utilisateur a 2 emails)
1. Utilisateur reçoit invitation email
2. Clique lien → /invitations/accept?token=XXX&email=YYY
3. Système détecte email déjà utilisé
4. Afficher: "Vous avez déjà un compte"
   - Option A: "Login avec ce compte et accepter"
   - Option B: "Créer nouveau compte avec email alternatif"
5. Si Option A:
   - Redirect /auth/login?return=/invitations/accept?token=XXX
   - User login
   - Backend: accepte invitation + link compte
   - Redirect /dashboard + notification

FLUX 4: LOGIN - UTILISATEUR EXISTANT
──────────────────────────────────────
1. Utilisateur ouvre /auth/login
2. Formulaire: Email + Mot de passe
3. Validation credentials (bcrypt + constant-time comparison)
4. Si valide + 2FA enabled:
   - Envoyer code 6-chiffres via email OU authenticator app
   - Afficher page "Entrer code"
   - Utilisateur entre code
   - Validation code TTL 10 min
5. Créer session JWT (refresh + access tokens)
6. Set secure cookies (httpOnly, secure, sameSite)
7. Redirect /dashboard

FLUX 5: OAUTH - MICROSOFT/GOOGLE (Optional)
────────────────────────────────────────────
1. Login page affiche: "Continuer avec Microsoft" / "Continuer avec Google"
2. Click → /auth/oauth/[provider]/init
3. Redirect OAuth provider (avec PKCE + nonce)
4. User authorise SocialFlow
5. Provider redirect /auth/oauth/[provider]/callback?code=...
6. Backend échange code → access_token
7. Backend récupère user info (email, nom, photo)
8. Logique:
   A. Email exists dans DB:
      - Si OAuth provider not linked: Link OAuth ID
      - Update user info (photo si disponible)
      - Create session JWT
      - Redirect /dashboard
   B. Email does NOT exist:
      - Create user account
      - Link OAuth provider
      - Set role based on invite token (si applicable)
      - Redirect /dashboard OU /onboarding
9. Tous tokens JWT utilisés

FLUX 6: LOGOUT
───────────────
1. User clique logout
2. Backend:
   - Delete session JWT
   - Invalidate refresh tokens (opt: dans DB)
   - Clear secure cookies
3. Redirect /auth/login + message "Vous êtes déconnecté"

FLUX 7: PASSWORD RESET (Utilisateur a oublié)
──────────────────────────────────────────────
1. Login page: "Mot de passe oublié?"
2. Formulaire: Email
3. Vérifier email exists (sans révéler si existe ou non)
4. Si existe: Envoyer email avec lien reset token
   - Token: 1 heure TTL, single-use
5. Email: "Réinitialisez votre mot de passe"
   https://socialflow.app/auth/reset-password?token=XXX
6. Utilisateur clique → Page: Nouveau mot de passe
7. Validation + update password (hash + salt)
8. Token invalidated
9. Email confirmation: "Mot de passe changé"
10. Redirect login

```

### 5.2 Token Scheme

```
ACCESS TOKEN (JWT)
─────────────────
Payload:
{
  "sub": "user_id_uuid",
  "email": "user@example.com",
  "role": "GESTIONNAIRE_RH",
  "cabinetId": "cabinet_uuid" (si applicable),
  "entrepriseId": "entreprise_uuid" (si applicable),
  "iat": 1234567890,
  "exp": 1234571490,  // 1 heure
  "aud": "socialflow-api",
  "iss": "socialflow-auth"
}
Signature: HS256 (secret serveur)
Storage: Memory (NOT localStorage pour XSS protection)
Transmission: Authorization: Bearer [token]

REFRESH TOKEN (Opaque)
──────────────────────
Stockage: HttpOnly secure cookie
TTL: 7 jours
Rotation: Automatic (new refresh token à chaque utilisation)
Revocation: Possible en DB (tokens table avec invalidation)

INVITATION TOKEN (Opaque)
──────────────────────────
Format: Base64(random_64_bytes)
Storage: Envoyé en URL
TTL: 7-14 jours (selon invite type)
Single-use: Oui (invalidé après acceptation)
Invalidation: Token invalidated + status='accepted'
```

---

## 6. Accès Données Multi-tenant

### 6.1 Architecture Isolation

```
DATABASE STRUCTURE:
═══════════════════

users
├─ id (PK)
├─ email (UNIQUE)
├─ passwordHash (bcrypt)
├─ firstName, lastName
├─ role (ENUM: SUPER_ADMIN, CABINET_RH, GESTIONNAIRE_RH, ENTREPRISE_CLIENTE, COLLABORATEUR)
├─ createdAt, updatedAt

cabinets
├─ id (PK)
├─ name
├─ siret (optional)
├─ address, city, zipCode
├─ phone, email
├─ logo (URL)
├─ subscription (ENUM: starter, pro, enterprise)
├─ subscriptionExpiresAt
├─ createdAt, updatedAt

cabinet_users (JOIN TABLE)
├─ id (PK)
├─ userId (FK users.id)
├─ cabinetId (FK cabinets.id)
├─ role (ENUM: OWNER, MANAGER, VIEWER)
├─ createdAt

gestionnaires_rh
├─ id (PK)
├─ userId (FK users.id)
├─ cabinetId (FK cabinets.id)
├─ specialty (Paie, RH, etc.)
├─ maxEntreprises (limite)
├─ createdAt, updatedAt

entreprises
├─ id (PK)
├─ name
├─ siret
├─ address, city, zipCode
├─ phone, email
├─ logoUrl
├─ cabinetId (FK cabinets.id)  ← KEY ISOLATION
├─ gestionnairesRhIds (JSON array)  ← Assigned managers
├─ createdAt, updatedAt

entreprise_users (JOIN TABLE)
├─ id (PK)
├─ userId (FK users.id)
├─ entrepriseId (FK entreprises.id)
├─ role (ENUM: OWNER, MANAGER, VIEWER)
├─ createdAt

collaborateurs
├─ id (PK)
├─ userId (FK users.id)
├─ entrepriseId (FK entreprises.id)
├─ department, fonction
├─ dateEmbauche
├─ createdAt, updatedAt

paie_documents
├─ id (PK)
├─ collaborateurId (FK collaborateurs.id)
├─ entrepriseId (FK entreprises.id)  ← Redundant but index
├─ type (ENUM: paie, contrat, attestation)
├─ mois, annee
├─ documentUrl
├─ uploadedBy (userId)
├─ createdAt

invitations
├─ id (PK)
├─ email
├─ token (hashed)
├─ tokenRaw (temporaire en cache, TTL 1h)
├─ role
├─ cabinetId (optional)
├─ entrepriseId (optional)
├─ createdBy (userId)
├─ createdAt
├─ expiresAt
├─ acceptedAt (nullable)
├─ status (ENUM: pending, accepted, expired, rejected)

audit_logs
├─ id (PK)
├─ userId (FK users.id)
├─ action (invite_sent, user_created, data_accessed, etc.)
├─ resourceType (ENUM: user, cabinet, entreprise, paie)
├─ resourceId
├─ cabinetId (FK)  ← Multi-tenant isolation
├─ entrepriseId (FK)  ← Multi-tenant isolation
├─ metadata (JSON)
├─ ipAddress
├─ userAgent
├─ createdAt
```

### 6.2 Query Filtering (Row-Level Security)

```
PRINCIPE: Chaque query doit être filtrée par cabinetId + role

EXEMPLE: Récupérer paie de collaborateurs
─────────────────────────────────────────

DANGEROUS (no filtering):
  SELECT * FROM paie_documents

CORRECT (with filtering):
  SELECT * FROM paie_documents
  WHERE entrepriseId IN (
    SELECT id FROM entreprises WHERE cabinetId = $1  ← Cabinet isolation
  )
  AND collaborateurId IN (
    SELECT id FROM collaborateurs WHERE entrepriseId IN (...)
  )
  AND (
    $2 = 'CABINET_RH'  ← User role
    OR (
      $2 = 'GESTIONNAIRE_RH' 
      AND gestionnairesRhIds @> $3  ← Check if user in assigned list
    )
    OR (
      $2 = 'ENTREPRISE_CLIENTE'
      AND entrepriseId = $4  ← User's entreprise
    )
    OR (
      $2 = 'COLLABORATEUR'
      AND collaborateurId = $5  ← User's own record
    )
  )

DATABASE RULES (Postgres Row Security):
───────────────────────────────────────
ALTER TABLE paie_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY paie_documents_isolate_cabinet ON paie_documents
  USING (
    entrepriseId IN (
      SELECT id FROM entreprises 
      WHERE cabinetId = (SELECT cabinetId FROM users_context)
    )
  );

CREATE POLICY paie_documents_isolate_user ON paie_documents
  USING (
    CASE 
      WHEN (SELECT role FROM users_context) = 'COLLABORATEUR'
        THEN collaborateurId = (SELECT collaborateurId FROM users_context)
      WHEN (SELECT role FROM users_context) = 'ENTREPRISE_CLIENTE'
        THEN entrepriseId = (SELECT entrepriseId FROM users_context)
      ELSE TRUE
    END
  );
```

### 6.3 Multi-Tenancy Pattern

```
CONTEXT PROPAGATION:
════════════════════

Request:
  Authorization: Bearer [JWT]
  
Backend middleware:
  1. Validate JWT signature
  2. Extract: userId, role, cabinetId, entrepriseId
  3. Create RequestContext object:
     {
       userId: UUID,
       email: string,
       role: ENUM,
       cabinetId: UUID (peut être null pour SuperAdmin),
       entrepriseId: UUID (peut être null),
       permissions: [],  ← Computed based on role
       ipAddress: string,
       userAgent: string
     }
  4. Attach à request object (express: req.context)
  5. Pass à tous les services

USAGE IN SERVICES:
───────────────────
service.getPaieDocuments(context) {
  // context contient cabinetId, entrepriseId, userId, role
  return db.query(
    'SELECT * FROM paie_documents WHERE entrepriseId = $1',
    [context.entrepriseId]
  )
}

// ✗ NEVER: db.query('SELECT * FROM paie_documents')
// ✓ ALWAYS: Filter by context

AUDIT TRAIL:
─────────────
TOUS les accès doivent être loggés:
  - Qui (userId)
  - Quoi (action)
  - Où (resourceId, cabinetId, entrepriseId)
  - Quand (timestamp)
  - IP + UserAgent (détection anomalies)
```

---

## 7. Pages & Workflows à Créer

### 7.1 Pages Authentication

| Page | Route | Public | Accessible | Champs/Actions |
|---|---|---|---|---|
| Login | `/auth/login` | Oui | Tous | Email, Password, 2FA (optional), OAuth buttons |
| Register (Cabinet) | `/auth/register` | Oui | Cabinet RH only | Email, Password, Prénom, Nom, Entreprise, Conditions, Create account |
| Reset Password | `/auth/reset-password` | Oui | Si token valide | New Password, Confirm, Submit |
| Accept Invitation | `/invitations/accept` | Oui (token-gated) | Si invite valide | Prénom, Nom, Password, OAuth option, Create account |
| Verify Email | `/auth/verify-email` | Non | Login users | Code 6 chiffres OU link email |
| 2FA Setup | `/auth/2fa-setup` | Non | Authenticated | Authenticator app scan, backup codes |

### 7.2 Pages Invitation Management

| Page | Route | Rôle | Actions | Affichage |
|---|---|---|---|---|
| Invite Gestionnaire | `/settings/gestionnaires/invite` | Cabinet RH | Envoyer email invitation | Form email, prénom, nom, spécialité |
| Invite Entreprise | `/settings/entreprises/invite` | Cabinet RH, Gestionnaire | Envoyer email invitation | Form email, nom entreprise, notes |
| Invite Collaborateur | `/dashboard/collaborateurs/invite` | Entreprise Cliente | Envoyer email invitation (single/bulk) | Form email/CSV, prénom, nom, dept, poste |
| Manage Invitations (Cabinet) | `/settings/invitations` | Cabinet RH | Voir/annuler/renvoyer | Table: email, role, status, expiresAt, actions |
| Manage Invitations (Entreprise) | `/dashboard/invitations` | Entreprise Cliente | Voir/annuler/renvoyer | Table: email, status, expiresAt, actions |

### 7.3 Pages Gestion Compte Personnels

| Page | Route | Rôle | Actions | Affichage |
|---|---|---|---|---|
| Mon Profil | `/profile` | Tous | Edit prénom, nom, photo, email | Form + préview |
| Paramètres de Sécurité | `/settings/security` | Tous | Change password, 2FA, sessions | Password form, 2FA toggle, active sessions |
| Linked OAuth Accounts | `/settings/oauth` | Tous | Link/Unlink Microsoft/Google | Buttons pour chaque provider, connected status |
| Préférences | `/settings/preferences` | Tous | Langue, timezone, notifications | Selects + toggles |

### 7.4 Pages Cabinet RH

| Page | Route | Actions | Affichage |
|---|---|---|---|
| Dashboard Cabinet | `/dashboard` | Voir stats | Cards: Gestionnaires, Entreprises, Collaborateurs, Événements |
| Gestionnaires RH | `/settings/gestionnaires` | Create, Edit, Delete, Export | Table: nom, spécialité, entreprises, statut, actions |
| Entreprises Clientes | `/settings/entreprises` | Create, Edit, Assign gestionnaire, Invite | Table: nom, SIRET, gestionnaires, statut, actions |
| Facturation | `/settings/billing` | View factures, Change forfait, Update payment | Forfait actuel, factures list, upgrade button |
| Paramètres Cabinet | `/settings/general` | Edit nom, logo, siret, email | Form |
| Invitations Pending | `/settings/invitations` | View, Resend, Cancel | Voir table |
| Audit Logs | `/settings/logs` | View actions | Table: utilisateur, action, resource, quand, détails |
| API Keys | `/settings/api` | Create, Delete, Rotate, View requests | List keys, create form, usage stats |

### 7.5 Pages Gestionnaire RH

| Page | Route | Actions | Affichage |
|---|---|---|---|
| Dashboard Gestionnaire | `/dashboard` | Voir ses clients | Cards: Entreprises, Collaborateurs, Tâches |
| Mes Clients | `/clients` | View, Invite | Table: Entreprise, Paie status, Collaborateurs, actions |
| Mes Tâches | `/taches` | View, Mark complete | Paie mensuelles, validations, signalements |
| Client Detail | `/clients/:id` | View, Modifier paie, Gerer collaborateurs | Tabs: Info, Collaborateurs, Paie, Documents |

### 7.6 Pages Entreprise Cliente

| Page | Route | Actions | Affichage |
|---|---|---|---|
| Dashboard Entreprise | `/dashboard` | Voir stats | Cards: Collaborateurs, Paie, Documents |
| Collaborateurs | `/dashboard/collaborateurs` | Create, Edit, Delete, Invite, Export | Table: nom, poste, paie, actions |
| Paie | `/dashboard/paie` | View, Download, Filter par mois | Table: employé, salaire, dates, actions |
| Documents | `/dashboard/documents` | Upload, Download, Organize | Liste fichiers par employé/type |
| Gestionnaire | `/settings/gestionnaire` | View, Change, Contact | Info gestionnaire, bouton contact |
| Invitations | `/dashboard/invitations` | View, Resend, Cancel | Table: email, role, expiresAt |

### 7.7 Pages Collaborateur

| Page | Route | Actions | Affichage |
|---|---|---|---|
| Dashboard Personnel | `/dashboard` | Voir sa paie | Dernier salaire, documents |
| Ma Paie | `/dashboard/paie` | View, Download | Calendar: chaque mois, lien download PDF |
| Mes Documents | `/dashboard/documents` | Download | Contrat, attestations, etc. - download buttons |
| Mon Profil | `/profile` | Edit photo, email, tel | Form éditable |

### 7.8 Checklist Pages à Implémenter

**Phase 1 - MVP (Semaine 1-2)**:
- [ ] Login (email/password + OAuth)
- [ ] Register Cabinet RH
- [ ] Accept Invitation (form création compte)
- [ ] Dashboard Cabinet RH (basic stats)
- [ ] Invite Gestionnaire (form + email)
- [ ] Invite Entreprise (form + email)
- [ ] Password Reset

**Phase 2 - Gestionnaires (Semaine 3)**:
- [ ] Dashboard Gestionnaire
- [ ] Mes Clients (list + invite)
- [ ] Invite Collaborateur
- [ ] Accept Invitation Gestionnaire
- [ ] Settings Gestionnaire (profil)

**Phase 3 - Entreprises (Semaine 4)**:
- [ ] Dashboard Entreprise
- [ ] Collaborateurs (list + invite)
- [ ] Paie (view)
- [ ] Documents (upload/download)
- [ ] Accept Invitation Entreprise

**Phase 4 - Collaborateurs (Semaine 5)**:
- [ ] Dashboard Collaborateur
- [ ] Ma Paie
- [ ] Mes Documents

**Phase 5 - Admin (Semaine 6)**:
- [ ] Audit Logs
- [ ] Invitations Management
- [ ] API Keys
- [ ] Facturation
- [ ] 2FA Setup

---

## 8. Considérations Sécurité & Conformité

### 8.1 Points Critiques Authentification

```
PASSWORDS:
──────────
✓ Hashing: bcrypt (cost 12) ou Argon2id
✓ Minimum: 12 caractères
✓ Complexité: majuscule + minuscule + chiffre + spécial
✓ Validation: Pas d'emails/noms comme password
✓ Historique: Pas même password que 5 précédents (opt)

TOKENS:
───────
✓ JWT secret: Min 256 bits, random, unique par env
✓ Access token TTL: 1 heure (court)
✓ Refresh token TTL: 7 jours (long)
✓ Token signing: HS256 ou RS256 (asymétric recommend)
✓ Token storage: Memory (JavaScript) + HttpOnly cookie (refresh)
✓ Token validation: Vérifier signature + expiration + audience

INVITATIONS:
────────────
✓ Token generation: crypto.randomBytes(64) → base64
✓ Token hashing: SHA-256 en DB (pas en clair)
✓ Token TTL: 7-14 jours configurable
✓ Single-use: Marquer comme utilisé/invalidé
✓ Email validation: Délivery tracking (opt)
✓ Resend: Max 3x (rate limit par email)

2FA:
────
✓ Email 2FA: 6-chiffres, TTL 10 min, max 5 tentatives
✓ TOTP 2FA: Google Authenticator/Microsoft Authenticator
✓ Backup codes: 10 codes 8-chars, one-time use
✓ Enforce: SuperAdmin + Cabinet (opt pour autres)

SESSIONS:
─────────
✓ Secure cookies: HttpOnly + Secure + SameSite=Strict
✓ Session timeout: 30 min inactivity OU 24h max
✓ Concurrent sessions: Max 5 par utilisateur (configurable)
✓ Session revocation: Possible logout de tous les appareils
✓ Session tracking: IP + UserAgent + géolocalisation (opt)
```

### 8.2 Multi-Tenancy & Data Isolation

```
ROW-LEVEL SECURITY:
───────────────────
✓ Chaque requête DB filtrée par cabinetId (PG RLS)
✓ Pas de jointure cross-cabinet possible
✓ Audit trail: Log cabinetId + userId + action
✓ Backup: Séparé par tenant (PITR optionnel)

API VALIDATION:
───────────────
✓ JWT extraction: Récupérer cabinetId + role
✓ Header validation: X-Tenant-ID pas permis (use JWT)
✓ Request body: Jamais de cabinetId/userId (calcul backend)
✓ URL params: Valider ressource appartient à user's cabinet
✓ Cross-tenant requests: Reject avec 403 Forbidden

EXAMPLE VALIDATION:
───────────────────
GET /api/gestionnaires/:gestionnaire_id

Backend:
1. Extract userId, cabinetId from JWT
2. Query: SELECT * FROM gestionnaires_rh 
   WHERE id = $1 AND cabinetId = $2
3. Si pas trouvé: 404 Forbidden
4. Si trouvé: Retourner data

// ✗ NEVER: SELECT * FROM gestionnaires_rh WHERE id = $1
```

### 8.3 RGPD & Privacy

```
DROIT À L'OUBLI (Right to be Forgotten):
─────────────────────────────────────────
✓ Utilisateur peut demander suppression
✓ Processus:
  1. Utilisateur clique "Supprimer mon compte"
  2. Email confirmation envoyé
  3. Délai de rétractation: 30 jours
  4. Après 30j: Anonymization (PII removed)
  5. Logs: Conservés (anonymisés) pour audit
✓ Données non supprimables: Logs audit (anonymisés)

EXPORT RGPD (Data Portability):
───────────────────────────────
✓ Utilisateur peut télécharger ses données JSON/CSV
✓ Format: Structured, human-readable, machine-readable
✓ Inclus: Profil, paie, documents, messages
✓ Exclu: Autres utilisateurs' data
✓ Délai: Max 30 jours de traitement

CONSENTEMENT:
──────────────
✓ Conditions d'utilisation: Requis avant création compte
✓ Politique de confidentialité: Requis (avec changelog)
✓ Email marketing: Opt-in explicite (checkbox)
✓ Cookies: Cookie banner + granular consent
✓ Tiers: Pas de partage données sans consentement

DATA RETENTION:
────────────────
✓ Logs actifs: 90 jours
✓ Logs archivés: 1 an (backups)
✓ Données utilisateur: Jusqu'à suppression
✓ Données audit: Illimité (anonymisé si user supprimé)
✓ Données backup: 30 jours after deletion
```

### 8.4 Authorization & Permissions

```
PERMISSION MATRIX (per role):

Action | SuperAdmin | Cabinet | Gestionnaire | Entreprise | Collab
────────────────────────────────────────────────────────────────
See own data | ✓ | ✓ | ✓ | ✓ | ✓
Edit own data | ✓ | ✓ | ✓ | ✓ | ✓
See Cabinet data | ✓ (ro) | ✓ (rw) | ✓ (ro) | ✗ | ✗
See Gestionnaires | ✓ (ro) | ✓ (rw) | ✗ | ✗ | ✗
See Entreprises | ✓ (ro) | ✓ (rw) | ✓ (assigned) | ✓ (own) | ✗
See Collaborateurs | ✓ (ro) | ✓ (ro) | ✓ (assigned) | ✓ (own) | ✗
See Paie | ✓ (ro) | ✓ (ro) | ✓ (assigned) | ✓ (own) | ✓ (own, ro)
Invite users | ✓ | ✓ | ✓ (limited) | ✓ | ✗
Delete users | ✓ | ✓ | ✗ | ✓ (own) | ✗
Export data | ✓ (audit) | ✓ | ✓ | ✓ | ✓
See audit logs | ✓ | ✓ | ✓ (limited) | ✓ (limited) | ✗
Manage API keys | ✓ | ✓ | ✗ | ✗ | ✗
Manage billing | ✓ | ✓ | ✗ | ✗ | ✗

ENFORCEMENT:
─────────────
✓ Middleware: Vérifier permission avant chaque endpoint
✓ Query filtering: Row-level security + cabinetId
✓ Field-level: Certains champs masqués selon role
✓ Audit: LOG chaque action + permission check

EXAMPLE:
GET /api/entreprises/:id/collaborateurs
- Middleware check: User role + cabinetId
- Query: Vérifier :id appartient à user's cabinet
- Result: Retourner colonnes autorisées (exclude salary si Gestionnaire)
```

### 8.5 API Security

```
RATE LIMITING:
───────────────
✓ Public endpoints (login): 5 req/min par IP
✓ Private endpoints: 100 req/min par user
✓ File upload: 10 req/min per user
✓ Invitation email: 5 req/hour par user
✓ Password reset: 3 req/hour par email

CORS & CSRF:
─────────────
✓ CORS: Only trust socialflow.app + subdomains
✓ CSRF: X-CSRF-Token (si cookies utilisés)
✓ SameSite cookies: Strict for session, Lax for preferences

HEADERS:
─────────
✓ Content-Security-Policy: Prevent XSS
✓ X-Frame-Options: DENY (prevent clickjacking)
✓ X-Content-Type-Options: nosniff
✓ Strict-Transport-Security: 1 year + subdomains
✓ Referrer-Policy: strict-origin-when-cross-origin

INPUT VALIDATION:
──────────────────
✓ Email: RFC 5322 validation + domain checking
✓ Password: Min length + complexity (no validation on strength)
✓ Names: Max 100 chars, alphanumeric + spaces
✓ URLs: Whitelist origins, sanitize
✓ File uploads: Max size + whitelist MIME types (PDF, CSV, etc.)
✓ SQL: Always use parameterized queries (no string concat)

OUTPUT ENCODING:
─────────────────
✓ HTML: Escape <, >, &, ", '
✓ JSON: Automatic escaping
✓ URLs: URL-encode parameters
✓ CSV: Escape quotes + sanitize formulas (=, +, -, @)
```

### 8.6 Logging & Monitoring

```
AUDIT TRAIL (Every action):
────────────────────────────
✓ Who: userId, email, IP address, User-Agent
✓ What: action (invite_sent, user_created, data_modified, login)
✓ Where: resourceType (user, cabinet, entreprise, paie)
✓ When: timestamp (ISO 8601 UTC)
✓ Why: metadata (old_value, new_value, reason)

SENSITIVE LOGGING RULES:
─────────────────────────
✓ Never log passwords (even hashed)
✓ Never log full credit card numbers
✓ Never log OAuth tokens (only ID)
✓ Minimize logging PII (only necessaire fields)
✓ Anonymize IP in logs after 90 days

MONITORING & ALERTS:
─────────────────────
✓ Failed login attempts: Alert after 5 failures (lock account)
✓ Unusual activity: Alert if request from new country/IP
✓ Mass operations: Alert if >100 invites in 1 hour
✓ API abuse: Alert if rate limit exceeded
✓ Data export: Log + email confirmation to owner

COMPLIANCE:
────────────
✓ Logs accessible by: SuperAdmin (all), Cabinet (own), Entreprise (own)
✓ Log retention: 90 days active, 1 year archived
✓ Export logs: Audit trail export for compliance
✓ GDPR: Cooperate with DPA requests within 30 days
```

---

## 9. Recommandations Prioritaires (Top 5)

### 9.1 Priorité 1️⃣ : Fondation Authentification

**Pourquoi**: Tout repose sur l'authentification et l'isolation multi-tenant.

**Éléments**:
1. JWT + Refresh token system
2. Password hashing (bcrypt cost 12)
3. Invitation token system (7-day TTL, single-use)
4. Request context middleware (cabinetId + role)
5. Row-level security (PG ou application-level)

**Effort**: 3-4 jours

**Dépendances**: Aucune

**Test**: Unit tests pour chaque flux auth + integration tests multi-tenant

---

### 9.2 Priorité 2️⃣ : Workflows Invitation par Email

**Pourquoi**: Cabinet RH → Gestionnaire → Entreprise → Collaborateur (4 flux critiques).

**Éléments**:
1. Email template system (Resend/SendGrid)
2. Invitation token storage + validation
3. Accept invitation page (avec création compte)
4. Email verification (optionnel mais recommandé)
5. Resend + expiration handling

**Effort**: 2-3 jours

**Dépendances**: Priorité 1 (JWT + context)

**Test**: Email delivery (staging), token expiration, double-accept prevention

---

### 9.3 Priorité 3️⃣ : Dashboard & Data Portals

**Pourquoi**: Utilisateurs ont besoin de voir leurs données.

**Éléments**:
1. Dashboard Cabinet RH (stats)
2. Gestionnaires list (CRUD)
3. Entreprises list (CRUD)
4. Collaborateurs list (CRUD)
5. Paie view (read-only MVP)

**Effort**: 4-5 jours

**Dépendances**: Priorité 1-2

**Test**: Permission checks (Cabinet ne voit pas autre Cabinet, etc.)

---

### 9.4 Priorité 4️⃣ : OAuth Integration (Optional but Recommended)

**Pourquoi**: Sécurité + UX (pas de password pour OAuth users).

**Éléments**:
1. Microsoft OAuth 2.0 (PKCE flow)
2. Google OAuth 2.0 (PKCE flow)
3. OAuth account linking
4. Logout invalidates OAuth session
5. Profile sync (email, nom, photo)

**Effort**: 2-3 jours

**Dépendances**: Priorité 1

**Test**: OAuth flow end-to-end, account linking scenarios

---

### 9.5 Priorité 5️⃣ : Audit Logs & Compliance

**Pourquoi**: RGPD + SaaS best practices (traçabilité).

**Éléments**:
1. Audit table schema
2. Middleware logging (every action)
3. Audit dashboard (Cabinet + SuperAdmin)
4. Export audit logs (CSV)
5. GDPR export (user data portability)

**Effort**: 2 jours

**Dépendances**: Priorité 1-3

**Test**: Log accuracy, export format, compliance checklist

---

### Roadmap Implémentation Suggérée

```
SEMAINE 1: Priorité 1 (Auth Foundation)
├─ JWT + Refresh tokens
├─ Password reset
├─ Invitation token system
└─ Multi-tenant context middleware

SEMAINE 2: Priorité 2 (Email Invitations)
├─ Cabinet → Gestionnaire workflow
├─ Email templates
├─ Accept invitation page
└─ Testing multi-flow scenarios

SEMAINE 3: Priorité 3 (MVP Dashboards)
├─ Cabinet RH dashboard
├─ Gestionnaires CRUD
├─ Entreprises CRUD
└─ Permission enforcement

SEMAINE 4: Priorité 4 (OAuth)
├─ Microsoft OAuth flow
├─ Google OAuth flow
├─ Account linking
└─ Testing OAuth edge cases

SEMAINE 5: Priorité 5 (Compliance)
├─ Audit logging middleware
├─ Audit dashboard
├─ GDPR export
└─ Compliance testing

SEMAINE 6: Polish + Hardening
├─ Security review
├─ Performance optimization
├─ Rate limiting
├─ Error handling + monitoring
└─ Documentation + training
```

---

## 10. Résumé Décisions Architecturales

### 10.1 Nomenclature Finale

| Ancien | Nouveau | Justification |
|---|---|---|
| Admin-Secrétariat | **Cabinet RH** | Métier spécifique SaaS RH |
| Consultant | **Gestionnaire RH** | Rôle actionnable (gérer) |
| Client | **Entreprise Cliente** | Entreprise = propriétaire données |
| Employé | **Collaborateur** | Terme HR standard |

### 10.2 Hiérarchie de Rôles Finale

```
SuperAdmin (1)
  ↓
Cabinet RH (Auto-reg possible)
  ├─ Invite → Gestionnaire RH
  └─ Crée → Entreprise Cliente
  
Gestionnaire RH (Invitation)
  ├─ Assigé à → N Entreprises Clientes
  └─ Invite → Entreprise Cliente (collab)

Entreprise Cliente (Invitation)
  ├─ Invite → Collaborateur
  └─ Propriétaire données paie/RH

Collaborateur (Invitation)
  └─ Accès read-only propres données
```

### 10.3 Matrice RBAC: Synthèse

| Rôle | Auto-Register | Login | Inviter Qui | Voir Parent | Voir Enfants | Données Enfants |
|---|---|---|---|---|---|---|
| SuperAdmin | N/A | ✓ | Personne | N/A | Cabinets | RO |
| Cabinet RH | ✓ | ✓ | Gestionnaire, Entreprise | ✓ RO | Tous | RW |
| Gestionnaire RH | ✗ | ✓ | Entreprise | ✓ RO | Assigned | RW* |
| Entreprise Cliente | ✗ | ✓ | Collaborateur | ✓ RO | Collaborateurs | RW |
| Collaborateur | ✗ | ✓ | Personne | ✓ RO | Personne | RO |

### 10.4 Isolation Multi-Tenant

- **Primary key**: cabinetId (tous les tables)
- **Row-level security**: PG RLS ou application-level filtering
- **Query isolation**: Jamais SELECT sans WHERE cabinetId
- **Audit trail**: Loggé avec cabinetId + userId + action
- **Backup isolation**: Possible PITR par tenant (opt)

### 10.5 Considerations Spéciales

1. **Gestionnaire RH <→ Entreprise Cliente**:
   - Relation N:N (un gestionnaire peut gérer plusieurs entreprises)
   - Entreprise peut changer de gestionnaire
   - Données propriété Entreprise (gestionnaire = consultant)

2. **OAuth Optionnel**:
   - Recommandé pour SuperAdmin + Cabinet (sécurité)
   - Optionnel pour autres rôles (UX)
   - Microsoft preferred (entreprises françaises)

3. **Invitations**:
   - Token single-use, 7-14j TTL
   - Email peut être spammée (rate limit 5/hour)
   - Acceptation peut être refusée (status: rejected)

4. **Données Sensibles**:
   - Paie: Strictement isolée par Entreprise
   - Audit logs: Visible selon rôle + cabinetId
   - GDPR export: Inclure tous ses données

---

## Conclusion

Cette architecture supporte:
- ✅ 5 rôles distincts avec permissions claires
- ✅ Multi-tenancy strict (cabinet + entreprise isolation)
- ✅ Workflows d'invitation sécurisés par email
- ✅ RGPD compliance (export + deletion)
- ✅ Audit trail complet
- ✅ OAuth optionnel pour sécurité
- ✅ Scalabilité (N cabinets, N gestionnaires, N entreprises)
- ✅ Production-ready (validations, rate limiting, logging)

**Prochaine étape**: Implémenter Priorité 1 (Foundation Auth) en sprints.
