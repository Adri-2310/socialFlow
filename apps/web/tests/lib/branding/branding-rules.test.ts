import { describe, it, expect } from 'vitest';
import {
  contrastRatio,
  darkenToContrast,
  hexToRgb,
  isHexColor,
  lightenForDarkTheme,
  readableForeground,
} from '@/lib/branding/color';
import { buildThemeCss, validateBranding } from '@/lib/branding/branding-rules';

describe('color', () => {
  it('calcule le contraste WCAG (noir/blanc = 21, identiques = 1)', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#4f46e5', '#4f46e5')).toBeCloseTo(1, 5);
    // Valeur connue : #767676 sur blanc = 4,54:1.
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 1);
  });

  it('reconnait uniquement les couleurs #rrggbb', () => {
    expect(isHexColor('#4f46e5')).toBe(true);
    expect(isHexColor('#4F46E5')).toBe(true);
    expect(isHexColor('4f46e5')).toBe(false);
    expect(isHexColor('#fff')).toBe(false);
    expect(isHexColor('red')).toBe(false);
    expect(isHexColor('#4f46e5; background:url(x)')).toBe(false);
    expect(hexToRgb('#ff8000')).toEqual({ r: 255, g: 128, b: 0 });
  });

  it('choisit un texte lisible (>= 4,5:1) quelle que soit la couleur de fond', () => {
    for (const bg of ['#4f46e5', '#00c49f', '#ffff00', '#808080', '#ff0000', '#00ffff', '#7f7f7f']) {
      expect(contrastRatio(bg, readableForeground(bg))).toBeGreaterThanOrEqual(4.5);
    }
    expect(readableForeground('#ffff00')).toBe('#060b19');
    expect(readableForeground('#1e1b4b')).toBe('#ffffff');
  });

  it('propose une teinte plus foncee qui atteint le contraste demande', () => {
    const suggestion = darkenToContrast('#00c49f', '#ffffff', 4.5);
    expect(suggestion).not.toBeNull();
    expect(contrastRatio(suggestion!, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(darkenToContrast('#1e1b4b', '#ffffff', 4.5)).toBeNull();
  });

  it('eclaircit une couleur trop sombre pour le theme sombre, sans toucher une couleur deja lisible', () => {
    const lighter = lightenForDarkTheme('#1e1b4b');
    expect(contrastRatio(lighter, '#060b19')).toBeGreaterThanOrEqual(4.5);
    expect(lightenForDarkTheme('#ffffff')).toBe('#ffffff');
  });
});

describe('validateBranding (D62)', () => {
  it('accepte vide : valeurs par defaut de SocialFlow', () => {
    expect(validateBranding({})).toEqual({
      ok: true,
      value: { displayName: null, primaryColor: null, secondaryColor: null },
    });
  });

  it('normalise le nom et met les couleurs en minuscules', () => {
    expect(
      validateBranding({ displayName: '  Cabinet Dupont ', primaryColor: '#4F46E5', secondaryColor: '' }),
    ).toEqual({
      ok: true,
      value: { displayName: 'Cabinet Dupont', primaryColor: '#4f46e5', secondaryColor: null },
    });
  });

  it('refuse une couleur au mauvais format', () => {
    const result = validateBranding({ primaryColor: 'rouge', secondaryColor: '#12345' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.primaryColor.code).toBe('INVALID_COLOR');
      expect(result.errors.secondaryColor.code).toBe('INVALID_COLOR');
    }
  });

  it('refuse une couleur principale au contraste insuffisant, avec une suggestion', () => {
    const result = validateBranding({ primaryColor: '#00c49f' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.primaryColor.code).toBe('LOW_CONTRAST');
      const suggestion = result.errors.primaryColor.suggestion!;
      expect(contrastRatio(suggestion, '#ffffff')).toBeGreaterThanOrEqual(4.5);
      // La suggestion est elle-meme acceptee.
      expect(validateBranding({ primaryColor: suggestion }).ok).toBe(true);
    }
  });

  it('accepte la couleur principale par defaut et une couleur secondaire claire', () => {
    expect(validateBranding({ primaryColor: '#4f46e5', secondaryColor: '#ffff00' }).ok).toBe(true);
  });

  it('refuse un nom affiche trop long', () => {
    const result = validateBranding({ displayName: 'x'.repeat(81) });
    expect(result.ok).toBe(false);
  });
});

describe('buildThemeCss', () => {
  it('ne produit rien sans couleur personnalisee', () => {
    expect(buildThemeCss({ primaryColor: null, secondaryColor: null })).toBeNull();
  });

  it('definit les variables en theme clair et sombre, avec un texte lisible', () => {
    const css = buildThemeCss({ primaryColor: '#1e3a8a', secondaryColor: null })!;

    expect(css).toContain(':root:not(.dark){--primary:#1e3a8a;--primary-foreground:#ffffff');
    expect(css).toContain(':root.dark{--primary:');
    expect(css).not.toContain('--secondary');

    // En sombre, la couleur est eclaircie pour rester lisible sur le fond.
    const dark = /:root\.dark\{--primary:(#[0-9a-f]{6})/.exec(css)![1];
    expect(contrastRatio(dark, '#060b19')).toBeGreaterThanOrEqual(4.5);
  });

  it('ne contient que des couleurs #rrggbb et des proprietes connues', () => {
    const css = buildThemeCss({ primaryColor: '#1e3a8a', secondaryColor: '#f59e0b' })!;

    const values = css.match(/#[0-9a-f]+/g)!;
    expect(values.every((v) => /^#[0-9a-f]{6}$/.test(v))).toBe(true);
    expect(css).not.toMatch(/[<>"']|url\(|expression|javascript/i);
  });

  it('accepte une couleur valide en majuscules', () => {
    const css = buildThemeCss({ primaryColor: '#1E3A8A', secondaryColor: null })!;

    expect(css).toContain('--primary:#1E3A8A');
  });

  it.each(['red', '#fff', '#12345g', '#1e3a8a00', ''])(
    'ignore la valeur invalide %j au rendu',
    (invalid) => {
      expect(buildThemeCss({ primaryColor: invalid, secondaryColor: null })).toBeNull();
      expect(buildThemeCss({ primaryColor: null, secondaryColor: invalid })).toBeNull();
    },
  );

  it('ne garde que la couleur valide quand l autre est invalide', () => {
    const css = buildThemeCss({ primaryColor: '#1e3a8a', secondaryColor: 'red' })!;

    expect(css).toContain('--primary:#1e3a8a');
    expect(css).not.toContain('--secondary');
  });

  it('bloque une tentative d injection CSS/HTML', () => {
    const injection = 'red;}</style><script>alert(1)</script>';

    expect(buildThemeCss({ primaryColor: injection, secondaryColor: null })).toBeNull();

    const css = buildThemeCss({ primaryColor: '#1e3a8a', secondaryColor: injection })!;
    expect(css).not.toMatch(/[<>]|script|alert|red/i);
    expect(css).not.toContain('--secondary');
  });
});
