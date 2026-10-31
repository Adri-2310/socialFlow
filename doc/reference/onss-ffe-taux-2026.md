# Taux 2026 du fonds de fermeture d'entreprises (FFE), ONSS

**Source** : fichier Excel officiel de l'ONSS `FFE_2026.xls`, lien « Taux » de la page des instructions
[Le fonds de fermeture d'entreprises : les cotisations de base](https://www.socialsecurity.be/employer/instructions/dmfa/fr/latest/instructions/special_contributions/other_specialcontributions/basiccontributions_closingcompanyfunds.html)
(copie de la page : `onss-ffe-cotisations-de-base-dmfa.html`). Fichier téléchargé et lu le 30/10/2026 :
https://www.socialsecurity.be/site_fr/Infos/instructs/documents/xls/FFE_2026.xls

Le fichier lui-même n'est pas conservé dans le dépôt (format binaire) : ce document en reprend le contenu
tel qu'affiché, sans rien calculer. Les pourcentages sont « sans (avec) modération salariale ».

## Cotisations de base FFE 2026

| Employeurs redevables | Nombre requis de travailleurs | Travailleurs concernés | Cotisation due, sans (avec) modération |
|---|---|---|---|
| Finalités industrielles ou commerciales | en moyenne au moins 20 travailleurs | tout le personnel | 0,37 % (0,39 %) |
| Finalités industrielles ou commerciales | en moyenne moins de 20 travailleurs | tout le personnel | 0,32 % (0,34 %) |
| Sans finalités industrielles ou commerciales | non requis | tout le personnel | 0,01 % (0,01 %) |

Exclusions : ouvriers portuaires du contingent général sous contrat à durée indéterminée (sous-commissions des
ports d'Anvers, Bruxelles, Vilvorde, Zeebrugge-Bruges, Gand, Ostende et Nieuport) et personnel naviguant de la
pêche maritime : 0,32 % (0,34 %) ; autres ouvriers portuaires, intérimaires et ouvriers du diamant : néant.

## Cotisation spéciale FFE 2026

| Employeurs | Travailleurs concernés | Cotisation due, sans (avec) modération |
|---|---|---|
| Tous les employeurs | tous les travailleurs soumis à la réglementation sur le chômage | 0,09 % (0,10 %) |

## Notes du fichier

- Les cotisations se calculent sur la rémunération brute, **portée à 108 % pour les travailleurs manuels**.
- Le nombre moyen de travailleurs se calcule sur le 4e trimestre de l'année civile - 2 et les trimestres 1 à 3 de
  l'année civile - 1 : on additionne les travailleurs déclarés à la fin de chaque trimestre et on divise par le nombre
  de trimestres déclarés.
- L'ONSS attribue à chaque employeur un code FFE (C, B, N ou O) d'après sa forme juridique et sa catégorie d'employeur.
- Les instructions 2026/3 (p. 635 environ, « La cotisation de modération salariale ») précisent que la modération
  salariale est aussi due sur les cotisations FFE et sur la cotisation de 1,60 %.

Statut dans le moteur : la cotisation FFE n'est PAS calculée (D104 la laissait de côté faute de taux lisible).
