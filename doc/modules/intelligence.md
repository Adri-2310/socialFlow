# Module : analytics et intelligence

> Statut : **proposition, non encore décidée avec Adrien**. Ces fonctionnalités figurent dans la phase 3 du cahier des charges client (`PRD_CLIENT.md` : « Dashboard analytics », « Détection anomalies IA », « Assistant RH ») et font partie du périmètre complet (D1).
> À valider avant toute implémentation : priorité, fournisseur d'IA, coût.

## 1. Tableaux de bord analytiques

| Pour | Indicateurs |
|---|---|
| Cabinet RH | Productivité par gestionnaire (fiches par mois, délai moyen entre ouverture et envoi), taux de rejet par l'entreprise, retards de validation, évolution du portefeuille, consommation des quotas |
| Gestionnaire | Avancement de ses clôtures, entreprises en retard, demandes en attente |
| Entreprise | Masse salariale mensuelle et annuelle, coût employeur, effectif, absentéisme (jours de maladie) et prévision des charges sociales |

Règle D26 : chez le Cabinet RH, uniquement des agrégats sans montant de salaire individuel. Graphiques calculés côté serveur à partir des fiches `ENVOYEE`.

## 2. Détection d'anomalies

**Première couche, sans IA (obligatoire, dans le cœur)** : règles déterministes au calcul de chaque fiche. Net ≤ 0, variation du brut de plus de 20 % par rapport au mois précédent, salarié actif sans prestations, heures supplémentaires au-delà du contingent, salaire inférieur au minimum de la commission paritaire **[barèmes CP à intégrer]**.

**Deuxième couche, avec IA (évolution)** : analyse des écarts inhabituels sur l'historique d'une entreprise, avec une explication en langage naturel pour le gestionnaire (« la prime de ce mois est 3× supérieure à la moyenne des 12 derniers mois »).
- Données envoyées au modèle : **pseudonymisées** (pas de nom, pas de NISS, pas d'IBAN), uniquement les montants et les codes.
- Le résultat est une **suggestion** affichée au gestionnaire, jamais une modification automatique.

## 3. Assistant RH

Assistant conversationnel pour les gestionnaires (questions sur la législation sociale, recherche dans la documentation du cabinet).
- Réponses **sourcées** (liens vers les textes officiels ou les documents du cabinet), avec un avertissement : « ne remplace pas un avis juridique ».
- Aucun accès aux données personnelles des salariés dans un premier temps.

## 4. Points à trancher

1. Priorité de ce module par rapport aux intégrations et au white-label.
2. Fournisseur d'IA et budget mensuel acceptable.
3. Base légale RGPD et information des clients si des données (même pseudonymisées) sont envoyées à un fournisseur d'IA : à inscrire au registre des traitements (`RGPD.md`).
