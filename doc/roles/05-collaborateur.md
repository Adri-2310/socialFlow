# Rôle : Collaborateur (salarié)

> Statut : **à construire** (le rôle existe dans `User.role`, rien d'autre).
> Décisions de référence : [DECISIONS.md](../DECISIONS.md) D6, D7, D12, D13, D29, D43, D49.

## 1. Mission

Le Collaborateur est le **salarié** d'une entreprise cliente. Il consulte ses fiches de paie et ses documents, vérifie ses données personnelles et exerce ses droits RGPD. Il n'a **aucune action de production** : son portail est en lecture, à l'exception des demandes de correction.

## 2. Deux façons d'accéder à ses fiches

| Accès | Fonctionnement |
|---|---|
| **Sans compte** (par défaut) | À chaque fiche envoyée : email avec un lien valable **7 jours** ; à l'ouverture, **code à usage unique par email** (6 chiffres, 10 min, 5 essais) ; accès à cette seule fiche (D12, D43) |
| **Avec compte** (facultatif) | Le gestionnaire l'invite (D6) ; l'invitation lie le compte à son dossier salarié ; accès permanent au portail |

Un salarié sans compte reçoit tout de même toutes ses fiches. Le compte apporte l'historique, les documents et les données personnelles.

## 3. Identité et accès (avec compte)

| Élément | Règle |
|---|---|
| Code du rôle | `COLLABORATEUR` |
| Création | Invitation du gestionnaire assigné uniquement, à l'email du dossier |
| Rattachement | Un seul dossier salarié, donc une seule entreprise (D7) |
| Périmètre | **Uniquement ses propres données** |
| Branding | Aux couleurs du cabinet (D33) |
| Point d'entrée | `/dashboard/collaborateur` |

## 4. Portail (D49)

### 4.1 Mes fiches de paie
- Fiches `ENVOYEE` et `REMPLACEE` uniquement (jamais un brouillon ni une fiche en validation), sur **5 ans**.
- Vue détaillée lisible (brut → net, en langage simple) et téléchargement du PDF.
- Une fiche remplacée affiche clairement « Remplacée par la fiche rectificative du JJ/MM » avec un lien vers celle-ci (D13).
- Fiches de pécule de vacances (employés) dans la même liste.

### 4.2 Mes données personnelles
- Lecture : identité, adresse, IBAN (masqué), situation familiale, contrat, régime.
- **Demande de correction** (adresse, IBAN, situation familiale, personnes à charge) → arrive dans la file des demandes du gestionnaire (même mécanisme que pour l'entreprise) ; le salarié voit le statut.
- Un changement de situation familiale influence le précompte : l'écran le précise.

### 4.3 Mes documents
Contrat de travail, attestations, certificat C4 en cas de sortie, **fiche fiscale annuelle** (281.10) **[à vérifier : génération et transmission à BelCotax en périmètre ou non]**. Téléchargement en PDF.

### 4.4 Mes données (RGPD)
- **Export** : archive de toutes ses données (profil, dossier, fiches, documents) en JSON + PDF, préparée en tâche de fond et envoyée par lien email.
- **Suppression du compte** : supprime l'accès au portail, **pas** le dossier salarié ni les fiches (obligation de conservation légale de 5 ans) ; l'écran l'explique.

### 4.5 Profil (commun)
Mot de passe, 2FA conseillée, comptes Google/Microsoft liés.

## 5. Cabinet suspendu ou salarié sorti

- **Cabinet suspendu** (D29) : portail accessible en lecture, fiches déjà envoyées toujours téléchargeables.
- **Salarié sorti** : son compte reste actif en lecture pour récupérer ses fiches et documents (C4, fiche fiscale), jusqu'à la fin de la conservation légale ou la suppression de son compte.

## 6. Ce que le Collaborateur ne peut pas faire

- Voir les données d'un autre salarié ou de l'entreprise.
- Voir une fiche avant son envoi.
- Modifier directement ses données (demande de correction uniquement).
- Contacter le gestionnaire hors du mécanisme de demande (pas de messagerie pour ce rôle).

## 7. Critères d'acceptation

- Toute requête est filtrée par `collaborateurId = dossier de l'utilisateur` ; un autre identifiant → `404`.
- Une fiche dont le statut n'est ni `ENVOYEE` ni `REMPLACEE` n'est jamais renvoyée, même par identifiant direct.
- Lien de fiche : jeton stocké haché, expiré après 7 jours, code OTP à usage unique ; 5 échecs → lien bloqué et le salarié est invité à demander un renvoi.
- Chaque ouverture et téléchargement de fiche écrit une entrée d'audit.

## 8. Question ouverte

1. **Fiche fiscale 281.10** : on la génère dans l'application ? Sa transmission officielle passe par l'application BelCotax du SPF Finances, une intégration supplémentaire.
