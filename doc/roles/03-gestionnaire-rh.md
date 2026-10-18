# Rôle : Gestionnaire RH

> Statut : **invitation et acceptation construites** ; tout le métier (salariés, prestations, fiches, DIMONA) reste à construire.
> **Acquis du chantier Cabinet RH, à réutiliser** : portail de connexion du cabinet et refus de `/login` (D76) ; marque du cabinet sur les pages communes via `lib/cabinet-client-brand.ts` et `AppHeader` (D77) ; périmètre par `GestionnaireEntreprise`, avec une entreprise non assignée ou d'un autre cabinet **introuvable (404)** (voir `inviteEntrepriseAdmin`, option `onlyAssignedTo`) ; le gestionnaire peut **remplacer l'administrateur** d'une entreprise assignée, jamais inviter un premier administrateur (D78) ; écriture refusée en lecture seule du cabinet (`requireApiSession`, `writable: true`, D29, D71). Aujourd'hui son `/dashboard` est une page d'attente à la marque du cabinet ; l'espace `/dashboard/gestionnaire` reste à créer.
> Décisions de référence : [DECISIONS.md](../DECISIONS.md) D3, D6, D9–D14, D27, D37–D42.
> ⚠️ Les éléments de législation belge marqués **[à vérifier]** doivent être confirmés sur les sources officielles (SPF Finances, ONSS) avant implémentation.

## 1. Mission

Le Gestionnaire RH est le **producteur** de la plateforme : un membre de l'équipe du cabinet qui gère, pour les entreprises qui lui sont assignées, les dossiers des salariés, les déclarations sociales et le cycle mensuel des fiches de paie, de la préparation à l'envoi.

## 2. Identité et accès

| Élément | Règle |
|---|---|
| Code du rôle | `GESTIONNAIRE_RH` |
| Création | Uniquement par invitation du Cabinet RH (7 jours) ; compte créé **par mot de passe** sur la page d'invitation, sans Google ni Microsoft (D76) |
| Connexion | **Portail du cabinet** (`/connexion/<identifiant>`), aux couleurs du cabinet, sans SocialFlow ; `/login` la refuse (D76). Google/Microsoft seulement après liaison du compte depuis le profil |
| Rattachement | Un seul cabinet (`User.cabinetId`, D7) |
| Périmètre de données | **Uniquement les entreprises qui lui sont assignées** (table `GestionnaireEntreprise`, N:M) |
| Compte dans les quotas | Oui (`maxUtilisateurs` du plan) |
| 2FA | Conseillée |
| Point d'entrée | `/dashboard/gestionnaire` |

**Règle d'accès centrale** : toute lecture ou écriture sur une entreprise, un salarié, une fiche, une déclaration ou un message vérifie, côté serveur et à chaque requête, que `entrepriseId ∈ entreprises assignées au gestionnaire` **et** que l'entreprise appartient à son cabinet. Une réassignation prend effet immédiatement (pas de liste figée dans la session).

## 3. Tableau de bord

- Période en cours par entreprise : état de la clôture (non ouverte, prestations en attente, en préparation, à valider, validée, envoyée).
- À traiter : fiches rejetées (avec motif), validations en retard (D41), DIMONA à envoyer ou en erreur, messages non lus.
- Échéances (module calendrier) : déclarations ONSS trimestrielles, paiements, rappels J-7 / J-3 / J-1.

## 4. Dossiers salariés (D6)

### 4.1 Création
Manuelle ou par **import CSV** (modèle téléchargeable, rapport ligne par ligne : créées, ignorées, erreurs). Pas de quota sur le nombre de salariés (D34) ; seul le stockage des documents est limité.

| Bloc | Champs |
|---|---|
| Identité | Nom, prénom, NISS (contrôle du format et de la clé de contrôle), date de naissance, adresse, email, IBAN |
| Contrat | Statut **employé / ouvrier** (D39), type (CDI, CDD avec date de fin), date d'entrée, date de sortie éventuelle, commission paritaire (**CP 200** employés, **CP 100** ouvriers, D44 ; champ prévu pour en ajouter), fonction |
| Temps de travail | Régime : temps plein ou **temps partiel** (heures/semaine du travailleur et de la personne de référence → fraction d'occupation) |
| Rémunération | Employé : salaire mensuel brut ; ouvrier : salaire horaire brut ; avantages récurrents éventuels |
| Fiscal | Situation familiale, personnes à charge, conjoint avec ou sans revenus (nécessaires au précompte professionnel) |

- Unicité du NISS **par entreprise**.
- NISS et IBAN **chiffrés en base** et masqués à l'affichage par défaut (`85.07.**-***.**`).
- **Création → DIMONA IN générée** (D40), à envoyer avant le premier jour de travail ; le dossier affiche un badge « DIMONA à envoyer » tant qu'elle n'est pas acceptée.

### 4.2 Modifications
- Toute modification de rémunération ou de régime est **datée** (historique avec date d'effet) : une fiche utilise les valeurs valables pour sa période.
- Sortie : saisir la date de sortie génère la **DIMONA OUT** et la dernière fiche (avec prorata). Le dossier passe en « sorti », conservé 5 ans.
- Pas de suppression physique : archivage (soft-delete) uniquement.

### 4.3 Invitation au portail Collaborateur
Facultative : le gestionnaire invite le salarié (email du dossier) ; l'invitation lie le compte au dossier. Sans compte, le salarié reçoit quand même ses fiches par lien sécurisé (D12).

## 5. Prestations mensuelles (D37)

- Pour une entreprise et un mois : une ligne par salarié actif, avec jours/heures prestés, congés, maladie (salaire garanti), jours fériés, heures supplémentaires, primes ponctuelles, absences non rémunérées.
- L'entreprise **peut pré-encoder** ces données dans son portail jusqu'à la **date limite** (D46) : un jour par défaut réglé dans la fiche de l'entreprise (par exemple le 20 du mois), que le gestionnaire peut décaler pour une période donnée. Rappels automatiques à l'entreprise à J-3 et J-1. Après la date, l'entreprise ne peut plus modifier.
- Le gestionnaire voit qui a encodé quoi, **complète, corrige** (même après la date), puis **verrouille** les prestations.
- Valeurs par défaut : un salarié sans encodage = mois complet selon son régime.

## 6. Cycle des fiches de paie

### 6.1 Statuts

```
                 recalcul autorisé
              ┌────────────────────┐
              ▼                    │
          BROUILLON ──soumettre──► A_VALIDER ──valider (entreprise)──► VALIDEE ──envoyer (gestionnaire)──► ENVOYEE
              ▲                       │                                                                   │
              └──rejeter + motif──────┘                                                 rectificative     │
                 obligatoire (D10)                                                      (D13)             ▼
                                                                                                    REMPLACEE
```

| Statut | Qui agit | Ce qui est possible |
|---|---|---|
| `BROUILLON` | Gestionnaire | Modifier les variables, recalculer, supprimer (soft-delete), soumettre |
| `A_VALIDER` | Admin entreprise | Valider ou rejeter avec motif ; relances J+2 et J+4, puis alerte gestionnaire (D41) |
| `VALIDEE` | Gestionnaire | Envoyer au salarié (D11) ; le PDF définitif est généré et figé |
| `ENVOYEE` | — | Lecture seule pour toujours ; conservation 5 ans |
| `REMPLACEE` | — | Fiche envoyée corrigée par une rectificative ; reste consultable, marquée « remplacée par… » |

Règles :
- **Une seule fiche active** (hors `REMPLACEE`) par salarié et par mois.
- Chaque transition est horodatée, attribuée à son auteur, et inscrite à l'audit.
- La soumission et l'envoi peuvent se faire **par lot** (toute une entreprise) ou **à l'unité** (D38).

### 6.2 Production par lot (D38)
1. « Ouvrir la période » (entreprise + mois) : crée une fiche `BROUILLON` par salarié actif dans le mois.
2. Les prestations verrouillées alimentent automatiquement les fiches, recalculées.
3. Le gestionnaire contrôle les anomalies signalées (écart important avec le mois précédent, salaire net négatif ou nul, salarié sans prestations).
4. « Soumettre à validation » : toutes les fiches sans anomalie bloquante passent en `A_VALIDER` ; l'admin entreprise reçoit **un seul** email récapitulatif.
5. Après validation : « Envoyer » (lot ou unité).

À l'unité : entrée ou sortie en cours de mois, régularisation, fiche rectificative.

### 6.3 Calcul (D14 : barèmes belges réels)
Ordre de calcul (spécification complète, barèmes et cas de référence : [modules/paie.md](../modules/paie.md)) :
1. Brut du mois = rémunération de base × fraction d'occupation et prestations, + heures supplémentaires, primes, salaire garanti.
2. Base ONSS : brut (employé) ou **brut × 108 %** (ouvrier).
3. Cotisation personnelle ONSS : **13,07 %** de la base, moins la réduction **bonus à l'emploi** selon le salaire de référence.
4. Imposable = brut − ONSS personnelle.
5. **Précompte professionnel** : formule-clé officielle selon la situation familiale (barème de l'année, versionné).
6. **Cotisation spéciale de sécurité sociale** (selon le revenu du ménage).
7. Net = imposable − précompte − cotisation spéciale ± retenues ou avantages nets.
8. Coût employeur (information interne) : cotisations patronales selon la catégorie d'employeur.

Exigences :
- Tout montant en **centimes entiers** (pas de flottants) ; arrondis selon les règles officielles.
- Chaque fiche enregistre l'**identifiant de la version des barèmes** utilisée et le détail de chaque ligne de calcul (traçabilité).
- Moteur = fonctions pures dans `lib/payroll/`, couvertes par des **cas de référence** (fiches réelles anonymisées ou calculateurs officiels) : tolérance 0,00 €.

### 6.3 bis Pécule de vacances (D45) **[à vérifier sur la législation 2026]**
- **Employés** : payé par l'employeur. Le *simple pécule* correspond au salaire normal maintenu pendant les jours de vacances ; le *double pécule* est versé une fois par an (en général en mai-juin) et calculé sur la rémunération mensuelle, avec ses propres retenues ONSS et un précompte à taux spécifique. Pécule de sortie à la fin du contrat.
- **Ouvriers** : payé par une **caisse de vacances**, pas par l'employeur. La fiche de paie ne le verse pas ; l'employeur cotise via l'ONSS (d'où la base à 108 %). L'application affiche une simple mention.
- Les jours de vacances pris (prestations) alimentent le simple pécule ; le double pécule se génère comme une fiche spéciale « pécule de vacances » dans le cycle normal (validation par l'entreprise, envoi).

### 6.4 PDF et envoi (D11, D12, D43)
- PDF aux couleurs du cabinet (D33) : identité de l'employeur et du travailleur, période, détail brut → net, cumul annuel, mentions légales.
- Envoi : email au salarié (modèle du cabinet) contenant un **lien sécurisé valable 7 jours**, sans pièce jointe.
- À l'ouverture du lien, le salarié reçoit un **code à usage unique par email** (6 chiffres, valable 10 minutes, 5 essais maximum), puis accède à sa fiche et à son PDF.
- Lien expiré : le salarié passe par son portail (s'il a un compte) ou demande un renvoi au gestionnaire.
- Chaque ouverture et téléchargement est enregistré à l'audit.

### 6.5 Fiche rectificative (D13)
Depuis une fiche `ENVOYEE` : « Créer une rectificative » → nouvelle fiche `BROUILLON` pré-remplie, liée à l'originale (`remplaceFicheId`), qui suit le cycle normal. À l'envoi de la rectificative, l'originale passe en `REMPLACEE`.

## 7. Déclarations sociales (D2, D36, D40)

| Déclaration | Déclencheur | Statuts |
|---|---|---|
| DIMONA IN | Création du dossier salarié | à envoyer → envoyée → acceptée / refusée (motif) |
| DIMONA OUT | Date de sortie saisie | idem |
| DIMONA UPDATE | Changement de dates déjà déclarées | idem |
| Déclaration trimestrielle ONSS (DmfA) | Fin de trimestre, à partir des fiches envoyées | préparée → contrôlée → envoyée → acceptée / anomalies |
| Certificat de chômage C4 | Sortie du salarié | généré → transmis |

Les déclarations passent par un **adaptateur** `DeclarationGateway`. Pour le TFE, l'implémentation est **simulée** à partir de la documentation officielle publique (D50) ; une implémentation réelle pourra s'y brancher plus tard. Détails : [modules/integrations.md](../modules/integrations.md).

## 8. Messagerie (D42)
Un fil par entreprise, partagé par le(s) gestionnaire(s) assigné(s) et l'admin de l'entreprise. Messages texte avec pièces jointes (comptent dans le stockage du cabinet), badge de non-lus, notification email groupée si non lu après un délai.

## 9. Ce que le Gestionnaire RH ne peut pas faire

- Voir les entreprises non assignées, ni les autres gestionnaires.
- Créer une entreprise, inviter son admin, modifier les assignations (Cabinet RH, D4).
- Valider une fiche à la place de l'entreprise (D9).
- Modifier une fiche `ENVOYEE` (D13).
- Gérer l'abonnement, le branding ou les modèles d'emails du cabinet.

## 10. Critères d'acceptation

- Accès à une entreprise non assignée → `404` (pas de `403`, pour ne pas révéler son existence) ; test d'intégration pour chaque route.
- Retirer une assignation coupe l'accès dès la requête suivante.
- Transition de statut non autorisée → `409 INVALID_TRANSITION` ; aucune modification de champ possible hors `BROUILLON`.
- Le moteur de calcul passe 100 % des cas de référence au centime près.
- Aucune fiche `ENVOYEE` n'est jamais modifiée en base (test qui le vérifie).

## 11. Demandes de l'entreprise (D47)
L'admin entreprise signale des changements (nouvel engagement, sortie, modification de salaire ou de régime, correction de données) via des **demandes** que le gestionnaire traite : accepter (il applique la modification au dossier, ce qui peut générer une DIMONA) ou refuser avec un motif. Les demandes de correction des collaborateurs (D49) arrivent dans la même file.
