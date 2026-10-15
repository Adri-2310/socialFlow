// Calculs de couleur et de contraste (WCAG 2.x), purs et sans dependance.
// Utilises pour verifier qu'une couleur de marque reste lisible (D62).

const HEX = /^#[0-9a-f]{6}$/i;

export type Rgb = { r: number; g: number; b: number };

export function isHexColor(value: string): boolean {
  return HEX.test(value);
}

export function hexToRgb(hex: string): Rgb {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const part = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

// Luminance relative WCAG.
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

// Rapport de contraste entre deux couleurs, de 1 a 21.
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const WHITE = '#ffffff';
const DARK_TEXT = '#060b19';

// Texte lisible a poser sur une couleur : le blanc ou le texte fonce, selon
// le meilleur contraste. Le meilleur des deux depasse toujours 4,5:1.
export function readableForeground(background: string): string {
  return contrastRatio(background, WHITE) >= contrastRatio(background, DARK_TEXT)
    ? WHITE
    : DARK_TEXT;
}

// Melange `hex` avec une couleur cible (0 = hex, 1 = cible).
function mix(hex: string, target: string, amount: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  return rgbToHex({
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  });
}

// Assombrit `hex` de `amount` (0 a 1) en le melangeant avec du noir.
export function darken(hex: string, amount: number): string {
  return mix(hex, '#000000', Math.min(1, Math.max(0, amount)));
}

// Teinte plus foncee de `hex` qui atteint `minRatio` contre `against`
// (suggestion affichee quand une couleur est refusee). null si `hex` suffit
// deja ou si aucune teinte plus foncee n'y arrive.
export function darkenToContrast(hex: string, against: string, minRatio: number): string | null {
  if (contrastRatio(hex, against) >= minRatio) return null;
  for (let step = 1; step <= 100; step += 1) {
    const candidate = mix(hex, '#000000', step / 100);
    if (contrastRatio(candidate, against) >= minRatio) return candidate;
  }
  return null;
}

// Variante pour le theme sombre : la couleur est eclaircie jusqu'a etre lisible
// comme texte sur le fond sombre (4,5:1), sans plus de changement que necessaire.
export function lightenForDarkTheme(hex: string, darkBackground = '#060b19'): string {
  if (contrastRatio(hex, darkBackground) >= 4.5) return hex;
  for (let step = 1; step <= 100; step += 1) {
    const candidate = mix(hex, WHITE, step / 100);
    if (contrastRatio(candidate, darkBackground) >= 4.5) return candidate;
  }
  return WHITE;
}
