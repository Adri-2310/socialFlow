import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hexToRgb, rgbToHex } from '@/lib/branding/color';

// Palette Tailwind v4 : les couleurs sont lues dans theme.css (oklch) et converties en sRGB, pour
// mesurer le vrai contraste d'une classe au lieu de valeurs recopiées à la main.
const THEME_CSS = readFileSync(
  join(process.cwd(), '../../node_modules/tailwindcss/theme.css'),
  'utf8',
);

export function tailwindColor(name: string): string {
  const match = new RegExp(`--color-${name}: oklch\\(([\\d.]+)% ([\\d.]+) ([\\d.]+)\\)`).exec(
    THEME_CSS,
  );
  if (!match) throw new Error(`Couleur Tailwind introuvable : ${name}`);
  const lightness = Number(match[1]) / 100;
  const chroma = Number(match[2]);
  const hue = (Number(match[3]) * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const [r, g, bl] = linear.map((v) => {
    const clamped = Math.min(1, Math.max(0, v));
    return (clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055) * 255;
  });
  return rgbToHex({ r, g, b: bl });
}

// Couleur `color` posée avec l'opacité `alpha` sur le fond `over`.
export function blend(color: string, over: string, alpha: number): string {
  const a = hexToRgb(color);
  const b = hexToRgb(over);
  return rgbToHex({
    r: a.r * alpha + b.r * (1 - alpha),
    g: a.g * alpha + b.g * (1 - alpha),
    b: a.b * alpha + b.b * (1 - alpha),
  });
}
