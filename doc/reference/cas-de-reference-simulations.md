# Cas de référence : simulations externes du 30/10/2026

**Source** : calculateur de salaire brut-net en ligne, [calculateur-de-salaire.be](https://calculateur-de-salaire.be) (site commercial, **non officiel**, source secondaire), page « Brut → Net » avec le détail du calcul. Simulations faites le **30/10/2026**, donc selon les règles en vigueur ce jour-là : barème de précompte **avant** l'arrêté royal du 27/09/2026 (applicable aux revenus payés à partir du 01/11/2026) et bonus fiscal « très bas salaire » à **63 %** (arrêté royal du 24/07/2026, en vigueur le 01/08/2026). Le site applique les règles du jour et ne permet pas de choisir une date de paiement.

**Statut de ce fichier** : les valeurs ci-dessous sont celles AFFICHÉES par le site, jamais calculées par le moteur ni par l'assistant. Elles servent de cas de référence externes pour l'étape 9 (D99, règle « cas de référence au centime près »). Le site arrondit à l'euro dans son résumé ; les centimes viennent de sa fenêtre « Détail du calcul ».

**Hypothèses communes** : temps plein, un mois de 20 jours de référence, aucun bonus à l'emploi déjà pris dans l'année, cotisation spéciale (CSSS) du premier mois d'un trimestre (le moteur a été comparé avec octobre), habitant du Royaume, conjoint sans revenus pour les mariés, aucun cas particulier (pas de prime, d'avantage ni de temps partiel).

## Cas

Montants en euros. « Bonus A » et « bonus B » sont les deux volets du bonus à l'emploi accordés, « bonus fiscal » la réduction de précompte correspondante (33,14 % du volet A et 63 % du volet B).

| N° | Statut | Situation | Brut | Enfants | ONSS | Bonus social (A + B) | Base imposable | Précompte avant bonus | Bonus fiscal | Réductions famille | Précompte | CSSS | Net |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Employé | Isolé | 2 000,00 | 0 | 261,40 | 261,40 (127,54 + 133,86) | 2 000,00 | 167,01 | 126,60 | 0 | **40,41** | 2,30 | **1 957,29** |
| 2 | Employé | Isolé | 2 800,00 | 0 | 365,96 | 164,75 (127,54 + 37,21) | 2 598,79 | 423,29 | 65,71 | 0 | **357,58** | 17,04 | **2 224,17** |
| 3 | Employé | Isolé | 4 500,00 | 0 | 588,15 | 0,00 | 3 911,85 | 1 035,98 | 0,00 | 0 | **1 035,98** | 44,01 | **2 831,86** |
| 4 | Employé | Isolé, 1 enfant | 2 800,00 | 1 | 365,96 | 164,75 | 2 598,79 | 423,29 | 65,71 | 104,00 (enfant 52,00 + parent isolé 52,00) | **253,58** | 17,04 | **2 328,17** |
| 5 | Employé | Isolé, 3 enfants | 2 800,00 | 3 | 365,96 | 164,75 | 2 598,79 | 423,29 | 65,71 | 419,00 (enfants 367,00 + parent isolé 52,00) | **0,00** | 17,04 | **2 581,75** |
| 6 | Employé | Marié | 2 800,00 | 0 | 365,96 | 164,75 | 2 598,79 | 73,52 | 65,71 | 0 | **7,81** | 21,15 | **2 569,83** |
| 7 | Employé | Marié, 2 enfants | 2 800,00 | 2 | 365,96 | 164,75 | 2 598,79 | 73,52 | 65,71 | 138,00 | **0,00** | 21,15 | **2 577,64** |
| 8 | Ouvrier | Isolé | 2 500,00 | 0 | 352,89 | 265,37 (137,74 + 127,63) | 2 412,48 | 343,55 | 126,05 | 0 | **217,50** | 13,74 | **2 181,24** |

Détail affiché par le site pour le cas 1 : bonus emploi 171,99 + 127,54 − 38,13 (correction : le bonus ne peut pas dépasser la cotisation personnelle) = 261,40 ; bonus fiscal = 33,14 % de 127,54 + 63 % de 133,86 = 126,60.

## Comparaison avec le moteur (diagnostic du 30/10/2026)

Le moteur (fonctions de `apps/web/src/lib/payroll/`, barème de test avec le taux de 63 % pour le volet B) a été comparé à ces simulations dans un fichier de diagnostic temporaire, supprimé après usage : ce n'est pas un test du dépôt.

- **Cas 1 à 7 : égalité au centime** sur chaque ligne (ONSS, bonus A et B, base imposable, précompte avant bonus, bonus fiscal, précompte, CSSS, net).
- **Cas 8 (ouvrier) : deux écarts, tous deux en faveur du moteur par rapport aux textes officiels** :
  - **CSSS** : moteur 15,94 €, site 13,74 €. La page de l'ONSS (`onss-csss-2026-3.html`) dit que la rémunération est « portée à 108 % pour les travailleurs manuels » ; le site ne semble pas appliquer ce 108 %.
  - **Arrondi du bonus fiscal** : moteur 126,06 €, site 126,05 € (précompte 217,49 € contre 217,50 €). L'Annexe III, n° 12, impose d'arrondir « à chaque étape » selon le chiffre des millièmes : 33,14 % de 137,74 = 45,648, arrondi à 45,65 ; le site semble tronquer à 45,64.

Pour le cas 8, la ligne du tableau garde les valeurs du site telles qu'affichées ; les valeurs retenues comme référence dans les tests devront être celles du texte officiel (CSSS à 108 %, arrondi par étape), à documenter dans le test.

## Limites

- Source **secondaire** et commerciale : une concordance avec ce site est un bon signe, pas une preuve légale. Le moteur et le site s'appuient sur les mêmes textes.
- **Série du 01/11/2026 non faite** : l'arrêté royal du 27/09/2026 change la quotité exemptée (11 550 €), le quotient conjugal (11 780 €) et les réductions pour enfants. Les cas 1 à 8 sont à refaire à partir du 01/11/2026 (si le site se met à jour) ou avec un autre simulateur.
- **Cas non couverts** : conjoint avec revenus, handicap, parent isolé sans enfant, indemnité de maladie, heures supplémentaires, salaire garanti, jours fériés (aucun simulateur externe trouvé pour ces règles).
