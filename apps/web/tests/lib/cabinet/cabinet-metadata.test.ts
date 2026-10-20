import { describe, it, expect } from 'vitest';
import { cabinetMetadata } from '@/lib/cabinet/cabinet-metadata';

describe('cabinetMetadata (D33)', () => {
  it('utilise le nom affiche dans le titre et le modele des pages', () => {
    const meta = cabinetMetadata({ displayName: 'Cabinet Dupont', name: 'Dupont SRL', logoUrl: null });

    expect(meta.title).toEqual({ default: 'Cabinet Dupont', template: '%s — Cabinet Dupont' });
    expect(meta.applicationName).toBe('Cabinet Dupont');
  });

  it('retombe sur la raison sociale, jamais sur SocialFlow', () => {
    const meta = cabinetMetadata({ displayName: null, name: 'Dupont SRL', logoUrl: null });
    expect(meta.title).toEqual({ default: 'Dupont SRL', template: '%s — Dupont SRL' });

    const blank = cabinetMetadata({ displayName: '   ', name: 'Dupont SRL', logoUrl: null });
    expect(blank.title).toEqual({ default: 'Dupont SRL', template: '%s — Dupont SRL' });
    expect(JSON.stringify(meta)).not.toContain('SocialFlow');
  });

  it('utilise le logo du cabinet comme icone de l onglet', () => {
    const meta = cabinetMetadata({
      displayName: null,
      name: 'Dupont SRL',
      logoUrl: 'https://blob.test/logo.png',
    });

    expect(meta.icons).toEqual({
      icon: 'https://blob.test/logo.png',
      shortcut: 'https://blob.test/logo.png',
      apple: 'https://blob.test/logo.png',
    });
  });

  it('garde l icone par defaut sans logo', () => {
    expect(cabinetMetadata({ displayName: null, name: 'Dupont SRL', logoUrl: null }).icons).toBeUndefined();
  });

  it('n est pas indexe : espace prive', () => {
    expect(cabinetMetadata({ displayName: null, name: 'X', logoUrl: null }).robots).toEqual({
      index: false,
      follow: false,
    });
  });
});
