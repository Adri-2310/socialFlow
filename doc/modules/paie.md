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
  bareme: ParametresBareme;                          // version valable pour la période
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

## 3. Étapes de calcul (fiche mensuelle ordinaire)

Les valeurs chiffrées ci-dessous servent de **repères** : la source de vérité est la `BaremeVersion` active, remplie depuis les textes officiels.

| # | Étape | Règle | Source officielle |
|---|---|---|---|
| 1 | **Brut** | Employé : rémunération mensuelle × fraction d'occupation, moins les absences non rémunérées, plus le salaire garanti en cas de maladie, les heures supplémentaires et les primes. Ouvrier : heures × taux horaire, plus les mêmes éléments | Contrat + prestations |
| 2 | **Base ONSS** | Employé : 100 % du brut. Ouvrier : **108 %** du brut (le pécule est payé par la caisse de vacances) | Instructions ONSS |
| 3 | **ONSS personnelle** | **13,07 %** de la base ONSS | Instructions ONSS |
| 4 | **Bonus à l'emploi** | Réduction des cotisations personnelles selon le salaire de référence (deux volets : bas et très bas salaires), proratisée au temps partiel ; jamais supérieure à l'ONSS personnelle | Instructions administratives ONSS, « Bonus à l'emploi » (trimestre en cours) |
| 5 | **Imposable** | Brut − ONSS personnelle + bonus à l'emploi | — |
| 6 | **Précompte professionnel** | Formule-clé de l'**Annexe III de l'AR/CIR 92** : revenu annualisé, frais professionnels forfaitaires, barème progressif, quotité exemptée, réductions pour personnes à charge, puis remensualisation. Réduction de précompte liée au bonus à l'emploi fiscal | Annexe III 2026 (AR du 11/12/2025, MB du 29/12/2025) |
| 7 | **Cotisation spéciale de sécurité sociale** | Montant mensuel par tranche, selon le revenu et la situation du ménage | Instructions ONSS |
| 8 | **Net** | Imposable − précompte − cotisation spéciale ± retenues ou avantages nets | — |
| 9 | **Coût employeur** | Brut + cotisations patronales (taux de base selon la catégorie d'employeur et la modération salariale) ± réductions structurelles | Instructions ONSS |

Exemple publié pour vérifier l'ordre de grandeur du précompte 2026 : 2 800 € brut, marié, conjoint sans revenus ou avec revenus non précisés, sans enfant → précompte de 363,90 € (Securex). Ces exemples **ne remplacent pas** les cas de référence (§ 6).

## 4. Cas particuliers dans le périmètre

| Cas | Règle |
|---|---|
| **Temps partiel** (D39) | Fraction d'occupation = heures du travailleur / heures de la personne de référence ; proratisation du salaire et du bonus à l'emploi |
| **Entrée ou sortie en cours de mois** | Prorata selon les jours (employé) ou les heures réelles (ouvrier) ; fiche à l'unité (D38) |
| **Maladie** | Salaire garanti à charge de l'employeur pendant la période légale, différente pour les employés et les ouvriers ; au-delà, la mutuelle prend le relais (hors fiche) |
| **Jours fériés** | Rémunérés comme des jours prestés |
| **Heures supplémentaires** | Sursalaire légal ; régime fiscal avantageux limité à **130 heures par an** en 2026 (hors construction et horeca) |
| **Pécule de vacances employés** (D45) | Simple pécule = maintien du salaire pendant les vacances. Double pécule : fiche spéciale annuelle, avec retenue ONSS sur une partie et précompte à taux exceptionnel. Pécule de sortie à la fin du contrat |
| **Pécule de vacances ouvriers** (D45) | Pas versé sur la fiche (caisse de vacances) ; simple mention |
| **Fiche rectificative** (D13) | Recalcul complet avec le barème de la **période d'origine**, pas celui du jour |

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

⚠️ **Limite réelle** : ces sources publient surtout du PDF et du HTML, pas une API de données. L'extraction automatique peut échouer. Le job doit alors au minimum **détecter qu'une nouvelle publication existe** et prévenir le SuperAdmin, qui saisit les paramètres dans un formulaire. C'est le minimum garanti, l'extraction complète est un bonus.

## 6. Cas de référence (tests)

- Dossier `apps/web/tests/payroll/cas/` : un fichier JSON par cas (entrée complète + résultat attendu ligne par ligne + source du résultat).
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

1. As-tu accès à des **fiches de paie réelles anonymisées** (stage, contact en secrétariat social, ton client) pour construire les cas de référence ? C'est ce qui rendra le moteur crédible devant le jury.
2. **Catégorie d'employeur** pour les cotisations patronales : on part sur le cas général du secteur privé marchand ?
