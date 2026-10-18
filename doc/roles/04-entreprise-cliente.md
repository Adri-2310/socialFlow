# Rôle : Entreprise cliente

> Statut : **à construire** ; seuls l'**invitation et la création du compte** (D70) et un **accueil minimal** (`/dashboard/entreprise`, nom de l'entreprise et du cabinet) existent.
> Décisions de référence : [DECISIONS.md](../DECISIONS.md) D4, D5, D9, D10, D29, D37, D41, D42, D46–D48.

## 1. Mission

L'Entreprise cliente est l'**employeur** dont le cabinet gère la paie. Son administrateur suit ses salariés, fournit les prestations du mois, **valide les fiches de paie avant leur envoi** et échange avec son gestionnaire. Il ne produit pas la paie lui-même.

## 2. Identité et accès

| Élément | Règle |
|---|---|
| Code du rôle | `ENTREPRISE_CLIENTE` |
| Nombre de comptes | **Un seul administrateur** par entreprise (D5) |
| Création | Invitation du **Cabinet RH** uniquement (D4), liée à une entreprise existante ; compte créé **par mot de passe** sur la page d'invitation, sans Google ni Microsoft (D76) |
| Connexion | **Portail du cabinet** (`/connexion/<identifiant>`), aux couleurs du cabinet, sans SocialFlow ; `/login` la refuse (D76). Google/Microsoft seulement après liaison du compte depuis le profil |
| Rattachement | `User.cabinetId` + l'entreprise (`Entreprise.adminUserId`) ; un seul rattachement (D7) |
| Périmètre | **Sa seule entreprise** : jamais une autre entreprise du cabinet |
| Quotas | Ne compte pas dans les utilisateurs du cabinet |
| Branding | Portail aux nom, logo et couleurs du cabinet (D33) |
| Point d'entrée | `/dashboard/entreprise` |

Changement d'administrateur (départ de la personne) : le Cabinet RH révoque l'ancien compte et invite le nouveau.

## 3. Fonctionnalités

### 3.1 Tableau de bord
- Période en cours : statut des prestations (à encoder avant le JJ/MM, D46), fiches à valider (avec compteur et date de relance), fiches envoyées.
- Gestionnaire(s) attitré(s) avec accès direct à la messagerie.
- Demandes en cours et leur statut.

### 3.2 Salariés (D47)
- Liste et fiche détaillée de chaque salarié : identité, contrat, régime, rémunération, historique. NISS et IBAN masqués par défaut, visibles sur action explicite (journalisée).
- **Lecture seule.** Pour tout changement, l'admin crée une **demande** :

| Type de demande | Données saisies |
|---|---|
| Nouvel engagement | Identité, date d'entrée, statut employé/ouvrier, régime, salaire proposé |
| Sortie | Date et motif de fin |
| Modification | Salaire, régime ou fonction, avec date d'effet |
| Correction | Champ à corriger et nouvelle valeur |

Statuts d'une demande : `ENVOYEE` → `ACCEPTEE` (appliquée par le gestionnaire) ou `REFUSEE` (motif obligatoire). Un nouvel engagement doit être signalé suffisamment tôt pour que la DIMONA IN parte avant le premier jour de travail : l'interface l'indique clairement.

### 3.3 Prestations du mois (D37, D46)
- Grille : une ligne par salarié actif, colonnes heures/jours prestés, congés, maladie, jours fériés, heures supplémentaires, primes, absences non rémunérées.
- Pré-remplie au régime normal ; l'admin ne saisit que les écarts.
- Modifiable jusqu'à la **date limite** (jour par défaut de l'entreprise, décalable par le gestionnaire) ; rappels à J-3 et J-1 ; verrouillée ensuite pour lui.
- Bouton « J'ai terminé » : prévient le gestionnaire sans attendre la date limite.

### 3.4 Validation des fiches (D9, D10, D41, D48)
- Liste des fiches `A_VALIDER` de la période ; vue détaillée complète : brut, chaque retenue, net, **coût employeur**, comparaison avec le mois précédent.
- Actions :
  - **Valider** (une fiche ou toutes d'un coup) → `VALIDEE`.
  - **Rejeter** avec un **motif obligatoire** → retour en `BROUILLON` chez le gestionnaire.
- Relances par email à J+2 et J+4 si des fiches restent en attente, puis le gestionnaire est alerté. **Jamais de validation tacite.**
- Historique : toutes les fiches de ses salariés (5 ans), filtrables par mois et par salarié, avec PDF.

### 3.5 Messagerie (D42)
Un fil unique avec le(s) gestionnaire(s) attitré(s) : messages, pièces jointes, non-lus, notification email.

### 3.6 Documents (module secondaire, D1)
Dépôt de pièces pour le gestionnaire (certificats médicaux, contrats signés, etc.) et consultation des documents partagés par le cabinet. Les fichiers comptent dans le stockage du cabinet.

### 3.7 Calendrier
Lecture des échéances qui le concernent : date limite des prestations, dates de paiement, échéances ONSS de l'employeur.

### 3.8 Profil (commun)
Profil, mot de passe, 2FA conseillée, comptes Google/Microsoft liés.

## 4. Cabinet suspendu (D29)
Portail en **lecture seule** : consultation des salariés et des fiches déjà envoyées, plus de prestations ni de validation ni de demande. Bandeau explicatif, sans détail sur la raison commerciale de la suspension.

## 5. Ce que l'Entreprise cliente ne peut pas faire

- Créer, modifier ou envoyer une fiche (D9, D11).
- Modifier directement un dossier salarié (D47).
- Inviter des collaborateurs (D6) ou un autre administrateur (D5).
- Voir les autres entreprises du cabinet, les autres gestionnaires ou l'abonnement du cabinet.

## 6. Critères d'acceptation

- Toute requête est filtrée par `entrepriseId = entreprise de l'utilisateur` côté serveur ; un identifiant d'une autre entreprise → `404`.
- Valider ou rejeter une fiche qui n'est pas `A_VALIDER` → `409 INVALID_TRANSITION`.
- Rejet sans motif (ou motif vide) → `400 REJECTION_REASON_REQUIRED`.
- Prestations après la date limite → `423 PRESTATIONS_LOCKED`.
- Dévoiler un NISS ou un IBAN écrit une entrée d'audit.
