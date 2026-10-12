# Module : calendrier et échéances

> Statut : **à construire**. Premier module après le cœur (D1).
> Décisions : D1, D41, D46.

## 1. Objectif

Ne jamais rater une échéance : légale (ONSS, DIMONA, précompte), interne au cycle de paie (prestations, validation, envoi) ou commerciale (fin d'essai). Chaque rôle voit les échéances qui le concernent et reçoit des rappels.

## 2. Types d'échéances

| Type | Exemple | Généré par | Concerne |
|---|---|---|---|
| `PRESTATIONS_LIMITE` | Encodage des prestations avant le 20 | Ouverture de la période (D46) | Entreprise, gestionnaire |
| `VALIDATION_ATTENDUE` | Fiches à valider | Soumission du lot | Entreprise, gestionnaire |
| `ENVOI_FICHES` | Fiches validées à envoyer | Validation | Gestionnaire |
| `DIMONA_IN` | DIMONA à accepter avant le premier jour de travail | Création du dossier (D40) | Gestionnaire |
| `DMFA_TRIMESTRIELLE` | Déclaration ONSS du trimestre | Calendrier légal **[dates à vérifier]** | Gestionnaire |
| `ONSS_PROVISION` | Provisions mensuelles de cotisations de l'employeur **[à vérifier]** | Calendrier légal | Gestionnaire, entreprise |
| `PRECOMPTE_VERSEMENT` | Versement du précompte au SPF Finances **[périodicité à vérifier]** | Calendrier légal | Gestionnaire, entreprise |
| `PECULE_DOUBLE` | Préparer le double pécule des employés | Annuel | Gestionnaire |
| `CONTRAT_FIN` | Fin d'un CDD dans 30 jours | Date de fin du contrat | Gestionnaire, entreprise |
| `FIN_ESSAI` | Fin de l'essai gratuit | Abonnement | Cabinet RH |

Les dates légales viennent d'une table de règles versionnée, comme les barèmes : jamais codées en dur dans les écrans.

## 3. Modèle

```
Echeance
  id, cabinetId, entrepriseId?, salarieId?,
  type, titre, date, statut: A_FAIRE | FAIT | EN_RETARD | ANNULE,
  sourceType, sourceId,      // ex. PeriodePaie, Declaration
  rappels: [J-7, J-3, J-1]   // selon le type
```

- Une échéance passe à `FAIT` **automatiquement** quand l'action correspondante est réalisée (DIMONA acceptée, lot validé…), jamais par simple clic.
- `EN_RETARD` : date dépassée sans action → alerte au rôle responsable et au niveau au-dessus (gestionnaire → Cabinet RH en statistiques).

## 4. Interface

- Vue mois et vue liste filtrable par entreprise, par type et par statut.
- Pastilles de couleur par urgence : à venir, cette semaine, en retard.
- Export iCal par utilisateur (lien privé révocable) : fonctionnalité citée dans le cahier des charges client.
- Le tableau de bord de chaque rôle affiche les 5 prochaines échéances.

## 5. Rappels

Cron quotidien idempotent : pour chaque échéance `A_FAIRE`, envoi des rappels prévus (email + notification in-app), une seule fois par rappel (marqueur `rappelsEnvoyes`). Les rappels de prestations (J-3, J-1) et de validation (J+2, J+4) sont des cas particuliers de ce mécanisme.

## 6. Critères d'acceptation

- Aucun rappel envoyé deux fois, même si le cron tourne deux fois.
- Le Cabinet RH ne voit les échéances de ses entreprises qu'en compteurs (D26).
- Une échéance légale affiche sa source (texte officiel ou lien).
