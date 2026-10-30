# Module : moteur de paie

> Statut : **à construire**. Partie la plus critique de l'application.
> Décisions : D13, D14, D22, D39, D44, D45.
> Recommandation : partie à **écrire et maîtriser personnellement** (cœur métier, attendu par le jury, très testable).

## 1. Principes non négociables

| Principe | Règle |
|---|---|
| Exactitude | Barèmes belges **réels** de l'année (D14) ; aucun taux approximatif ou inventé |
| Fonctions pures | `lib/payroll/` ne lit ni la base ni l'horloge : tout arrive en paramètres, tout repart en résultat |
| Argent | **Centimes entiers** (`number` entier en TypeScript, `Int` en base) ; aucun flottant ; arrondi explicite à chaque étape officielle |
| Versionnement | Chaque paramètre légal appartient à une `BaremeVersion` datée (`valideDepuis`) ; une fiche mémorise la version utilisée (D22) |
| Traçabilité | Le calcul produit des **lignes** (libellé, base, taux, montant) stockées dans `FicheLigne` ; on peut toujours expliquer un montant |
| Immuabilité | Une fiche `ENVOYEE` n'est jamais recalculée, même si un barème change (D13) |
| Preuve | Chaque règle est couverte par des **cas de référence chiffrés** ; tolérance 0,00 € |

## 2. Interface

```ts
// lib/payroll/types.ts (indicatif)
type Centimes = number; // entier

interface EntreeCalcul {
  periode: { annee: number; mois: number };          // 1-12
  datePaiement: string;                              // AAAA-MM-JJ, obligatoire : le précompte dépend du jour de paiement (D112)
  categorieEmployeur: string;                        // D98, ex. PRIVE_MARCHAND
  versions: VersionBareme[];                         // toutes les versions avec leurs paramètres : calculerFiche choisit la période et le jour de paiement (D99, D112, D113)
  travailleur: {
    statut: 'EMPLOYE' | 'OUVRIER';
    commissionParitaire: '200' | '100';
    fractionOccupation: number;                      // ex. 0.8 pour un 4/5, en millièmes si besoin
    remunerationMensuelle?: Centimes;                // employé
    tauxHoraire?: Centimes;                          // ouvrier
    regimeHebdoMinutes: number;                      // minutes/semaine du travailleur (entier, D96)
    situationFiscale: SituationFiscale;              // isolé, marié avec/sans revenus, enfants à charge…
  };
  prestations: Prestations;                          // jours/heures prestés, congés, maladie, fériés, heures sup, primes, absences
  cumulAnnuel?: CumulAnnuel;                         // pour les régularisations éventuelles
}

interface ResultatCalcul {
  brut: Centimes;
  baseOnss: Centimes;
  onssPersonnelle: Centimes;
  bonusEmploi: Centimes;
  imposable: Centimes;
  precompte: Centimes;
  cotisationSpeciale: Centimes;
  net: Centimes;
  coutEmployeur: Centimes;
  lignes: LigneCalcul[];                             // détail ordonné, affiché sur la fiche
  anomalies: Anomalie[];                             // net ≤ 0, écart > X % avec le mois précédent…
}

export function calculerFiche(entree: EntreeCalcul): ResultatCalcul;
```

> **Première période de paie (D114).** On ne peut pas ouvrir de période avant septembre 2026, premier mois couvert par une version de barème réelle, ni avant le mois d'inscription de l'entreprise : le calcul n'a donc jamais à traiter un mois sans barème.

## 3. Étapes de calcul (fiche mensuelle ordinaire)

Les valeurs chiffrées ci-dessous servent de **repères** : la source de vérité est la `BaremeVersion` active, remplie depuis les textes officiels.

| # | Étape | Règle | Source officielle |
|---|---|---|---|
| 1 | **Brut** | Employé : rémunération mensuelle (celle du contrat, déjà proportionnelle à l'occupation : D100), moins les absences non rémunérées au prorata des jours, plus le salaire garanti, les jours fériés, les heures supplémentaires et les primes. Ouvrier : minutes prestées × taux horaire, plus les mêmes éléments (D100, D106 à D108) | Contrat + prestations |
| 2 | **Base ONSS** | Employé : 100 % du brut. Ouvrier : **108 %** du brut (le pécule est payé par la caisse de vacances) | Instructions ONSS |
| 3 | **ONSS personnelle** | **13,07 %** de la base ONSS | Instructions ONSS |
| 4 | **Bonus à l'emploi** | Réduction des cotisations personnelles selon le salaire de référence (deux volets : bas et très bas salaires), proratisée au temps partiel ; jamais supérieure à l'ONSS personnelle. Le salaire de référence est la base ONSS, heures supplémentaires ordinaires comprises ; les heures supplémentaires de l'horeca et les flexi-jobs en sont exclus (instructions ONSS, pp. 374 et 449) | Instructions administratives ONSS, « Bonus à l'emploi » (trimestre en cours) |
| 5 | **Imposable** | Brut − ONSS personnelle + bonus à l'emploi | — |
| 6 | **Précompte professionnel** | Formule-clé de l'**Annexe III de l'AR/CIR 92** : revenu annualisé, frais professionnels forfaitaires, barème progressif, quotité exemptée, réductions pour personnes à charge, puis remensualisation. Réduction de précompte liée au bonus à l'emploi fiscal | Annexe III 2026 (AR du 11/12/2025, MB du 29/12/2025) |
| 7 | **Cotisation spéciale de sécurité sociale** | Montant mensuel par tranche, selon le revenu et la situation du ménage | Instructions ONSS |
| 8 | **Net** | Imposable − précompte − cotisation spéciale ± retenues ou avantages nets | — |
| 9 | **Coût employeur** | Brut + cotisations patronales (taux de base selon la catégorie d'employeur et la modération salariale) − réduction structurelle ; s'y ajoutent les heures supplémentaires exonérées de retenue (D104, D106) | Instructions ONSS |

Exemple publié pour vérifier l'ordre de grandeur du précompte 2026 : 2 800 € brut, marié, conjoint sans revenus ou avec revenus non précisés, sans enfant → précompte de 363,90 € (Securex). Ces exemples **ne remplacent pas** les cas de référence (§ 6).

## 4. Cas particuliers dans le périmètre

| Cas | Règle |
|---|---|
| **Temps partiel** (D39) | Fraction d'occupation = heures du travailleur / heures de la personne de référence ; proratisation du salaire et du bonus à l'emploi |
| **Entrée ou sortie en cours de mois** | Prorata selon les jours (employé) ou les heures réelles (ouvrier) ; fiche à l'unité (D38) |
| **Maladie** (D108, D109, D111) | Salaire garanti à charge de l'employeur, non soumis à l'ONSS. Ouvrier : 7 jours à 100 % puis 7 jours à 60 % de la part du salaire sous le plafond (art. 52) ; accident du travail : 7 jours (art. 54). Employé : 30 jours (art. 70) ; contrat de moins de 3 mois : art. 71 et 72. Indemnité complémentaire des CCT 12bis (ouvriers) et 13bis (employés de moins de 3 mois) pour les jours 8 à 30. Le plafond de l'INAMI est converti selon le régime de travail (D111). Une rechute reprend les jours déjà consommés. Au-delà, la mutuelle prend le relais (hors fiche) |
| **Jours fériés** (D107) | Employé : rémunérés comme des jours prestés. Ouvrier : jour férié payé selon la loi du 4 janvier 1974, calculé par le moteur à partir du calendrier des jours fériés |
| **Heures supplémentaires** (D106, D110) | Trois sortes (avec ou sans sursalaire, volontaires). Plafonds de 2026 : 360 heures volontaires, 240 heures sans sursalaire. Réduction de précompte n° 45 sur les 180 premières heures, à 57,75 % (loi du 15/07/2026, art. 47 à 49 ; AR du 24/07/2026). L'AR du 9/07/2026 exclut ces 240 heures de la rémunération pour l'ONSS. Les heures de relance de janvier à mars 2026 sont déduites des plafonds. Les paramètres viennent du bloc `heuresSupplementaires` du barème |
| **Pécule de vacances employés** (D45) | Simple pécule = maintien du salaire pendant les vacances. Double pécule : fiche spéciale annuelle, avec retenue ONSS sur une partie et précompte à taux exceptionnel. Pécule de sortie à la fin du contrat |
| **Pécule de vacances ouvriers** (D45) | Pas versé sur la fiche (caisse de vacances) ; simple mention |
| **Fiche rectificative** (D13) | Recalcul complet avec le barème de la **période d'origine** et la **date de paiement d'origine** (D112), pas ceux du jour |

Hors périmètre : étudiants, flexi-jobs, avantages en nature complexes (voiture de société, ATN), saisies sur salaire, chèques-repas. Ils pourront venir plus tard ; le modèle de lignes de calcul doit permettre de les ajouter sans refonte.

## 5. Barèmes versionnés et mise à jour automatique (D22)

```
BaremeVersion
  id, code ("BE-2026-01"), valideDepuis (date), valideJusqua (date?),
  statut: A_VERIFIER | ACTIF | RETIRE,
  parametres: Json   // taux ONSS, tranches du précompte, quotité exemptée,
                     // frais forfaitaires, réductions enfants, bonus emploi,
                     // cotisation spéciale, plafonds heures sup, pécule…
  source: Json       // URL et référence du texte officiel de chaque bloc
  creePar, activePar, activeLe
```

Flux de mise à jour :
1. Un job hebdomadaire consulte les sources officielles (pages du SPF Finances pour l'Annexe III, instructions administratives trimestrielles de l'ONSS).
2. Changement détecté : création d'une version `A_VERIFIER` (paramètres extraits et différences avec la version active) et alerte au SuperAdmin.
3. Le SuperAdmin compare, **lance les cas de référence** sur la nouvelle version, puis l'active. Un barème n'est jamais activé si un cas de référence échoue.
4. Les fiches déjà envoyées gardent leur version (D13).

**Fiabilité des sources (D115).** Chaque bloc de `source` porte un champ `fiabilite` (`OFFICIELLE`, `DECISION_INTERNE` ou `A_CONFIRMER`) ; l'activation d'une version avec un bloc `A_CONFIRMER` ou sans fiabilité est refusée par `peutActiverBareme` (D119). Le barème réel de 2026 est dans `apps/web/prisma/bareme/` (septembre, octobre, novembre).

⚠️ **Limite réelle** : ces sources publient surtout du PDF et du HTML, pas une API de données. L'extraction automatique peut échouer. Le job doit alors au minimum **détecter qu'une nouvelle publication existe** et prévenir le SuperAdmin, qui saisit les paramètres dans un formulaire. C'est le minimum garanti, l'extraction complète est un bonus.

## 6. Cas de référence (tests)

- Réalisation (D118) : les cas sont dans le module `apps/web/src/lib/payroll/cas-reference.ts` (entrée complète, valeurs attendues et source de chaque cas), rejouable contre une version de barème par `verifierCasReference`, et testé dans `apps/web/tests/payroll/cas-reference.test.ts`. Huit cas existent (sept employés et un ouvrier) ; la couverture minimale du tableau ci-dessous n'est pas atteinte.
- Prévu à l'origine : dossier `apps/web/tests/payroll/cas/` : un fichier JSON par cas (entrée complète + résultat attendu ligne par ligne + source du résultat).
- Couverture minimale avant mise en production :

| Famille | Nombre minimum |
|---|---|
| Employé temps plein : isolé, marié 1 revenu, marié 2 revenus, enfants 0/1/2/3 | 8 |
| Bas salaire avec bonus à l'emploi (les deux volets) | 3 |
| Temps partiel (4/5, mi-temps) | 2 |
| Ouvrier (base 108 %) | 3 |
| Entrée et sortie en cours de mois | 2 |
| Maladie avec salaire garanti | 2 |
| Heures supplémentaires | 1 |
| Double pécule employé | 1 |

- **Origine des valeurs attendues**, par ordre de préférence : fiches réelles anonymisées d'un secrétariat social, puis exemples officiels, puis calculateurs publics reconnus (en notant l'outil et la date).
- La CI échoue si un seul cas diffère d'un centime.

## 7. Sources à consulter

- SPF Finances : calcul du précompte professionnel et Annexe III ([finance.belgium.be](https://finance.belgium.be/en/node/1540))
- ONSS, instructions administratives DmfA, réductions de cotisations et bonus à l'emploi ([socialsecurity.be](https://www.socialsecurity.be/employer/instructions/dmfa/fr/latest/instructions/deductions/workers_reductions/workbonus.html))
- Securex, règles du précompte 2026 ([securex.be](https://www.securex.be/fr/lex4you/employeur/actualites/nouvelles-regles-en-matiere-de-precompte-professionnel-pour-2026))

## 8. Questions ouvertes

1. **Cas de référence** : la série du 30/10/2026 vient d'un simulateur externe (source secondaire). À refaire pour le 01/11/2026 (quotité de 11 550 €) et dès que le calculateur du SPF Finances refonctionne ; ajouter des cas de temps partiel, de salaire garanti et d'heures supplémentaires dès qu'une source externe existe (D118).
2. **Catégorie d'employeur** : tranchée par D98 (secteur privé marchand). Les autres catégories sont refusées à l'activation (D119).

## 9. Limites connues du moteur v1

Choisies et assumées ; chacune est aussi dans `AMELIORATIONS.md` § 7. Le moteur ne les calcule pas, ou les calcule avec un choix documenté.

| Sujet | Limite | Décision |
|---|---|---|
| Fonds de fermeture d'entreprises (FFE) | Non calculé ; les taux sont dans `reference/onss-ffe-taux-2026.md` | D117 |
| Cotisation spéciale de modération (« index centime », salaires au-dessus d'environ 4 000 €) | Non calculée | D117 |
| Taux de 1,60 % « porté à 1,69 % » et modération de 4,27 % | Choix assumé entre les deux lectures du texte | D117 |
| Précompte des indemnités (n° 78 et 53 de l'Annexe III) | Non implémenté ; choix confirmé par Adrien | D116 |
| Délai de la CCT (14 jours) et de la loi du 19/12/2025 (8 semaines) | Le moteur suit la CCT ; texte de la loi à déposer | D109, D110 |
| Plafond de l'INAMI pour un régime de 5 jours | Conversion déduite (plafond × 6 / jours par semaine), non confirmée par un texte | D111 |
| Jours fériés après la fin du contrat (AR 1974, art. 14) | Non traités | D107 |
| Accident du travail, jours 8 à 30 | Non traités | D109 |
| Reprise progressive du travail | Non traitée | D110 |
| Couples dont un des conjoints a 66 ans (quotient de 12 790 €) | Non traités | D110 |
| Instructions ONSS 2026/4 | Non déposées : les taux sont ceux de 2026/3 | D103, D115 |
| Septembre 2026 et novembre 2026 | Barèmes saisis mais non activables : aucun cas de référence dans leur période | D118, D119 |
| Précompte et paiement après le 01/11/2026 | Valeurs de l'AR du 27/09/2026 saisies, mais non vérifiées par une simulation externe | D110, D115 |
