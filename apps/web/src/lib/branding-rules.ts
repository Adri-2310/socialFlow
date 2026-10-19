import { z } from 'zod';
import {
  contrastRatio,
  darkenToContrast,
  isHexColor,
  lightenForDarkTheme,
  readableForeground,
} from '@/lib/color';

// Regles du branding du cabinet (D33, D62) : pures, sans acces donnees, donc
// utilisables par le serveur ET par le formulaire (apercu en direct). Le
// serveur fait foi : le formulaire n'est qu'une aide.

// Couleurs par defaut de SocialFlow (voir globals.css) : rendues quand le
// cabinet n'a rien personnalise.
export const DEFAULT_PRIMARY = '#4f46e5';
export const DEFAULT_SECONDARY = '#00c49f';

// WCAG AA, texte normal. La couleur primaire porte du texte blanc (boutons) et
// sert de couleur de lien sur fond clair.
export const MIN_PRIMARY_CONTRAST = 4.5;

export const DISPLAY_NAME_MAX = 80;

export type CabinetBranding = {
  displayName: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
};

export type BrandingFieldError = {
  code: 'INVALID_COLOR' | 'LOW_CONTRAST' | 'NAME_TOO_LONG';
  // Teinte plus foncee proposee quand le contraste est insuffisant.
  suggestion?: string;
};

export const brandingSchema = z.object({
  displayName: z.string().max(200).nullable().optional(),
  primaryColor: z.string().max(20).nullable().optional(),
  secondaryColor: z.string().max(20).nullable().optional(),
});

export function validateBranding(input: {
  displayName?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
}):
  | { ok: true; value: CabinetBranding }
  | { ok: false; errors: Record<string, BrandingFieldError> } {
  const errors: Record<string, BrandingFieldError> = {};

  const displayName = (input.displayName ?? '').trim();
  if (displayName.length > DISPLAY_NAME_MAX) errors.displayName = { code: 'NAME_TOO_LONG' };

  const color = (field: 'primaryColor' | 'secondaryColor') => {
    const raw = (input[field] ?? '').trim().toLowerCase();
    if (raw === '') return null;
    if (!isHexColor(raw)) {
      errors[field] = { code: 'INVALID_COLOR' };
      return null;
    }
    return raw;
  };

  const primaryColor = color('primaryColor');
  const secondaryColor = color('secondaryColor');

  if (primaryColor && contrastRatio(primaryColor, '#ffffff') < MIN_PRIMARY_CONTRAST) {
    errors.primaryColor = {
      code: 'LOW_CONTRAST',
      suggestion: darkenToContrast(primaryColor, '#ffffff', MIN_PRIMARY_CONTRAST) ?? undefined,
    };
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      displayName: displayName === '' ? null : displayName,
      primaryColor,
      secondaryColor,
    },
  };
}

function safeColor(value: string | null): string | null {
  return value !== null && isHexColor(value) ? value : null;
}

// CSS du theme du cabinet. Le resultat est injecte dans une balise <style>
// (dangerouslySetInnerHTML) : chaque couleur est donc revalidee ici en
// #rrggbb, meme si elle a deja ete validee a l'ecriture (defense en
// profondeur : une valeur arrivee en base par un autre chemin ne doit jamais
// atteindre le HTML). Une valeur invalide est ignoree, sans CSS produit pour
// elle. En theme sombre, la couleur est eclaircie au besoin pour rester
// lisible, et le texte pose dessus est choisi pour garder un contraste
// suffisant.
export function buildThemeCss(branding: {
  primaryColor: string | null;
  secondaryColor: string | null;
}): string | null {
  const primaryColor = safeColor(branding.primaryColor);
  const secondaryColor = safeColor(branding.secondaryColor);
  if (!primaryColor && !secondaryColor) return null;

  const declare = (dark: boolean) => {
    const lines: string[] = [];
    if (primaryColor) {
      const value = dark ? lightenForDarkTheme(primaryColor) : primaryColor;
      const fg = readableForeground(value);
      lines.push(
        `--primary:${value}`,
        `--primary-foreground:${fg}`,
        `--ring:${value}`,
        `--chart-1:${value}`,
        `--sidebar-primary:${value}`,
        `--sidebar-primary-foreground:${fg}`,
        `--sidebar-accent-foreground:${value}`,
        `--sidebar-ring:${value}`,
      );
    }
    if (secondaryColor) {
      const value = dark ? lightenForDarkTheme(secondaryColor) : secondaryColor;
      lines.push(
        `--secondary:${value}`,
        `--secondary-foreground:${readableForeground(value)}`,
        `--chart-2:${value}`,
      );
    }
    return lines.join(';');
  };

  // `:root:not(.dark)` et `:root.dark` passent devant les valeurs par defaut
  // de globals.css quel que soit l'ordre de chargement.
  return `:root:not(.dark){${declare(false)}}:root.dark{${declare(true)}}`;
}
