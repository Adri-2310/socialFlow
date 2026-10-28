import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge, TONE_CLASSES } from '@/components/shared/status-badge';
import { contrastRatio, hexToRgb, rgbToHex } from '@/lib/branding/color';
import type { StatusTone } from '@/lib/status/status-badges';

// Palette Tailwind v4 : les couleurs sont lues dans theme.css (oklch) et converties en sRGB, pour
// mesurer le vrai contraste de chaque ton au lieu de valeurs recopiées à la main.
const THEME_CSS = readFileSync(
  join(__dirname, '../../../../../node_modules/tailwindcss/theme.css'),
  'utf8',
);

function tailwindColor(name: string): string {
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

function blend(color: string, over: string, alpha: number): string {
  const a = hexToRgb(color);
  const b = hexToRgb(over);
  return rgbToHex({
    r: a.r * alpha + b.r * (1 - alpha),
    g: a.g * alpha + b.g * (1 - alpha),
    b: a.b * alpha + b.b * (1 - alpha),
  });
}

// Fonds sur lesquels une pastille se pose : carte et fond de page (globals.css).
const SURFACES = {
  light: ['#ffffff', '#f8fafc'],
  dark: ['#0f172a', '#060b19'],
};

// Couleur de texte et teinte de fond de chaque ton, par thème (voir TONE_CLASSES).
const TONE_COLORS: Record<
  StatusTone,
  Record<'light' | 'dark', { text: string; tint: string; alpha: number }>
> = {
  success: {
    light: { text: tailwindColor('emerald-800'), tint: tailwindColor('emerald-500'), alpha: 0.15 },
    dark: { text: tailwindColor('emerald-300'), tint: tailwindColor('emerald-500'), alpha: 0.15 },
  },
  warning: {
    light: { text: tailwindColor('amber-800'), tint: tailwindColor('amber-500'), alpha: 0.15 },
    dark: { text: tailwindColor('amber-300'), tint: tailwindColor('amber-500'), alpha: 0.15 },
  },
  danger: {
    light: { text: '#b91c1c', tint: '#ef4444', alpha: 0.1 },
    dark: { text: '#f87171', tint: '#7f1d1d', alpha: 0.1 },
  },
  // Texte `--foreground`, teinte `--primary` à 15 % (couleurs par défaut de globals.css).
  info: {
    light: { text: '#0f172a', tint: '#4f46e5', alpha: 0.15 },
    dark: { text: '#ffffff', tint: '#5f62ec', alpha: 0.15 },
  },
  neutral: {
    light: { text: '#475569', tint: '#f1f5f9', alpha: 1 },
    dark: { text: '#94a3b8', tint: '#1e293b', alpha: 1 },
  },
};

describe('StatusBadge', () => {
  it('affiche le libellé du registre et expose le ton', () => {
    render(<StatusBadge domain="compte" status="suspendu" />);

    const badge = screen.getByText('Suspendu');
    expect(badge).toHaveAttribute('data-tone', 'danger');
    expect(badge.className).toContain('text-destructive-text');
  });

  it('remplace le libellé quand l’état est plus précis (D71)', () => {
    render(<StatusBadge domain="compte" status="suspendu" label="Suspendu · lecture seule" />);

    expect(screen.getByText('Suspendu · lecture seule')).toHaveAttribute('data-tone', 'danger');
    expect(screen.queryByText('Suspendu')).not.toBeInTheDocument();
  });

  it('ajoute le point décoratif et l’icône sans changer le texte accessible', () => {
    render(
      <StatusBadge
        domain="periode"
        status="VERROUILLEE"
        dot
        icon={<svg data-testid="cadenas" aria-hidden="true" />}
      />,
    );

    const badge = screen.getByText('Verrouillées');
    expect(badge).toHaveTextContent('Verrouillées');
    expect(screen.getByTestId('cadenas')).toBeInTheDocument();
    expect(badge.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('affiche un statut inconnu en neutre plutôt que de planter', () => {
    render(<StatusBadge domain="abonnement" status="NOUVEL_ETAT" />);

    expect(screen.getByText('NOUVEL_ETAT')).toHaveAttribute('data-tone', 'neutral');
  });

  describe('contraste AA (D62) de chaque ton, en clair et en sombre', () => {
    for (const tone of Object.keys(TONE_COLORS) as StatusTone[]) {
      for (const theme of ['light', 'dark'] as const) {
        it(`${tone} (${theme}) : texte ≥ 4,5:1 sur sa teinte, posée sur carte ou fond de page`, () => {
          const { text, tint, alpha } = TONE_COLORS[tone][theme];
          for (const surface of SURFACES[theme]) {
            const background = blend(tint, surface, alpha);
            expect(
              contrastRatio(text, background),
              `${tone} sur ${surface}`,
            ).toBeGreaterThanOrEqual(4.5);
          }
        });
      }
    }

    // Le ton `info` suit la couleur du cabinet : le texte reste lisible quelle que soit la teinte.
    it.each(['#1e3a8a', '#00c49f', '#ff0000', '#ffff00', '#808080', '#4f46e5'])(
      'info avec la couleur de cabinet %s : texte ≥ 4,5:1 en clair et en sombre',
      (primary) => {
        for (const theme of ['light', 'dark'] as const) {
          const text = theme === 'light' ? '#0f172a' : '#ffffff';
          for (const surface of SURFACES[theme]) {
            expect(contrastRatio(text, blend(primary, surface, 0.15))).toBeGreaterThanOrEqual(4.5);
          }
        }
      },
    );

    it('le ton info utilise le texte foreground, pas la couleur du cabinet', () => {
      expect(TONE_CLASSES.info).toContain('text-foreground');
      expect(TONE_CLASSES.info).not.toContain('text-primary');
    });

    it('chaque ton a des classes de couleur', () => {
      for (const tone of Object.keys(TONE_COLORS) as StatusTone[]) {
        expect(TONE_CLASSES[tone]).toMatch(/bg-/);
        expect(TONE_CLASSES[tone]).toMatch(/text-/);
      }
    });
  });
});
