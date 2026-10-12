# Module : collaboration (demandes, messagerie, documents, notifications)

> Statut : **à construire**. Décisions : D15, D42, D47, D49.

## 1. Demandes (D47, D49)

Mécanisme unique pour tout changement demandé par quelqu'un qui n'a pas le droit de modifier lui-même un dossier.

| Auteur | Types |
|---|---|
| Admin entreprise | `ENGAGEMENT`, `SORTIE`, `MODIFICATION_CONTRAT` (salaire, régime, fonction), `CORRECTION_DONNEES` |
| Collaborateur | `CORRECTION_DONNEES` (adresse, IBAN, situation familiale, personnes à charge) |

```
Demande
  id, cabinetId, entrepriseId, salarieId?,
  type, auteurId, donnees: Json, dateEffet?,
  statut: ENVOYEE | ACCEPTEE | REFUSEE | ANNULEE,
  traiteePar?, traiteeLe?, motifRefus?
```

- File de traitement chez le(s) gestionnaire(s) assigné(s), triée par urgence (un engagement proche du premier jour de travail passe en tête).
- **Accepter** = le gestionnaire voit les données proposées dans le formulaire du dossier, les ajuste au besoin et enregistre. La modification réelle du dossier est faite par lui et peut déclencher une DIMONA.
- **Refuser** = motif obligatoire, notifié à l'auteur.
- L'auteur peut annuler tant que la demande est `ENVOYEE`.

## 2. Messagerie (D42)

- **Un fil par entreprise**, entre le(s) gestionnaire(s) assigné(s) et l'admin de l'entreprise. Pas de messagerie pour le Collaborateur ni pour le Cabinet RH.
- Message : texte (Markdown simple), pièces jointes (comptent dans le stockage), auteur, date.
- Non-lus par participant ; email groupé si un message reste non lu 1 heure.
- Mise à jour en quasi temps réel par interrogation périodique (par exemple toutes les 15 s quand le fil est ouvert) : suffisant ici, sans infrastructure WebSocket sur Vercel.
- Messages non modifiables après 5 minutes ; suppression = « message supprimé » (trace conservée).

## 3. Documents

| Propriétaire | Exemples | Qui dépose | Qui voit |
|---|---|---|---|
| Entreprise | Certificat médical, contrat signé, pièces pour le gestionnaire | Admin entreprise, gestionnaire | Admin entreprise, gestionnaires assignés |
| Salarié | Contrat, attestations, C4, 281.10, PDF des fiches | Gestionnaire (ou généré par le système) | Gestionnaires assignés, admin entreprise (sauf mention contraire), le salarié |

- Stockage objet (Vercel Blob, à confirmer) ; base : métadonnées (nom, type MIME, taille, propriétaire, auteur).
- Types autorisés : PDF, JPG, PNG, CSV, XLSX ; 10 Mo maximum par fichier **[à confirmer]** ; contrôle du type réel du fichier, pas seulement de l'extension.
- **Quota de stockage** du plan (D15) : la somme des tailles est contrôlée avant chaque dépôt (`403 QUOTA_EXCEEDED`).
- Téléchargement via des URL signées de courte durée, jamais publiques.
- Suppression = soft-delete ; documents légaux (fiches, C4, 281.10) non supprimables pendant 5 ans.

## 4. Notifications in-app

Partagées par tous les rôles (cloche dans l'en-tête).

```
Notification
  id, userId, type, titre, message, lien, createdAt, readAt?
```

- Créées par les mêmes événements que les emails (voir `FONCTIONNEMENT.md` § 10), selon les préférences de l'utilisateur.
- Préférences par utilisateur : par type, email et/ou in-app ; les alertes de sécurité et de facturation ne sont pas désactivables.
- Purge des notifications lues après 90 jours.

## 5. Critères d'acceptation

- Un admin entreprise ne voit jamais le fil ou les documents d'une autre entreprise (404).
- Un dépôt qui dépasse le quota est refusé **avant** l'envoi du fichier au stockage.
- Toute demande acceptée est reliée à la modification du dossier qu'elle a produite (`Demande.id` dans l'audit).
