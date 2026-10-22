// Analyseur CSV minimal (RFC 4180) pour l'import des salariés (roles/03 § 4.1). Écrit ici
// plutôt qu'importé : une dépendance de plus n'apporte rien à un format aussi simple
// (CONVENTIONS § 6). Fonction pure : le texte entre, un tableau sort.
//
// Gère : BOM UTF-8, séparateur « ; » (Excel en français), « , » ou tabulation détecté sur la
// ligne d'en-tête, champs entre guillemets (guillemet doublé = guillemet, séparateurs et
// sauts de ligne permis dedans), fins de ligne \r\n, \n ou \r, lignes vides ignorées.

export type CsvTable = {
  headers: string[];
  rows: string[][];
  // Numéro de la ligne du fichier où chaque ligne de données commence (l'en-tête est la 1).
  lignes: number[];
};

export class CsvError extends Error {
  constructor(public readonly code: 'CSV_UNTERMINATED_QUOTE') {
    super(code);
    this.name = 'CsvError';
  }
}

const SEPARATEURS = [';', ',', '\t'] as const;

// Le séparateur le plus fréquent sur la première ligne, hors guillemets. « ; » l'emporte à
// égalité : c'est celui d'Excel en français.
function detecterSeparateur(texte: string): string {
  const compte: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };
  let dansGuillemets = false;
  for (const c of texte) {
    if (c === '"') dansGuillemets = !dansGuillemets;
    else if (!dansGuillemets && (c === '\n' || c === '\r')) break;
    else if (!dansGuillemets && c in compte) compte[c] += 1;
  }
  return SEPARATEURS.reduce((meilleur, s) => (compte[s] > compte[meilleur] ? s : meilleur), ';');
}

export function parseCsv(entree: string): CsvTable {
  const texte = entree.replace(/^﻿/, '');
  const separateur = detecterSeparateur(texte);

  const lignesBrutes: { cellules: string[]; ligne: number }[] = [];
  let cellules: string[] = [];
  let cellule = '';
  let dansGuillemets = false;
  let apresGuillemets = false; // un champ entre guillemets vient de se fermer
  let ligne = 1;
  let debut = 1;
  let ligneVide = true; // aucune cellule ni caractère sur la ligne en cours

  const finCellule = () => {
    cellules.push(cellule);
    cellule = '';
    apresGuillemets = false;
  };
  const finLigne = () => {
    finCellule();
    if (!(cellules.length === 1 && cellules[0].trim() === '' && ligneVide)) {
      lignesBrutes.push({ cellules, ligne: debut });
    }
    cellules = [];
    ligneVide = true;
  };

  for (let i = 0; i < texte.length; i += 1) {
    const c = texte[i];

    if (dansGuillemets) {
      if (c === '"') {
        if (texte[i + 1] === '"') {
          cellule += '"';
          i += 1;
        } else {
          dansGuillemets = false;
          apresGuillemets = true;
        }
      } else {
        if (c === '\n') ligne += 1;
        cellule += c;
      }
      continue;
    }

    if (c === '"' && cellule === '' && !apresGuillemets) {
      dansGuillemets = true;
      ligneVide = false;
    } else if (c === separateur) {
      ligneVide = false;
      finCellule();
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i += 1;
      finLigne();
      ligne += 1;
      debut = ligne;
    } else {
      // Un guillemet au milieu d'un champ non guillemeté reste un caractère ordinaire.
      if (c.trim() !== '') ligneVide = false;
      cellule += c;
    }
  }

  if (dansGuillemets) throw new CsvError('CSV_UNTERMINATED_QUOTE');
  // Dernière ligne sans saut de ligne final.
  if (cellule !== '' || cellules.length > 0) finLigne();

  const [entete, ...donnees] = lignesBrutes;
  return {
    headers: entete ? entete.cellules.map((h) => h.trim()) : [],
    rows: donnees.map((l) => l.cellules),
    lignes: donnees.map((l) => l.ligne),
  };
}
