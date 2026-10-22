import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DecryptionError,
  EncryptionConfigError,
  decryptField,
  encryptField,
  lookupHash,
} from '@/lib/crypto/field-encryption';

const newKey = () => randomBytes(32).toString('base64');

describe('chiffrement des champs sensibles', () => {
  const original = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = newKey();
  });
  afterEach(() => {
    if (original === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = original;
  });

  it('déchiffre ce qu’il a chiffré', () => {
    expect(decryptField(encryptField('85073003328'))).toBe('85073003328');
    expect(decryptField(encryptField(''))).toBe('');
    expect(decryptField(encryptField('BE68 5390 0754 7034 é'))).toBe('BE68 5390 0754 7034 é');
  });

  it('ne laisse pas le clair dans la valeur stockée', () => {
    const stored = encryptField('85073003328');
    expect(stored).not.toContain('85073003328');
    expect(stored.startsWith('v1:')).toBe(true);
  });

  it('produit une valeur différente à chaque chiffrement (IV aléatoire)', () => {
    expect(encryptField('85073003328')).not.toBe(encryptField('85073003328'));
  });

  it('refuse une valeur altérée', () => {
    const [v, iv, tag, data] = encryptField('85073003328').split(':');
    const flipped = Buffer.from(data, 'base64url');
    flipped[0] ^= 1;
    expect(() => decryptField([v, iv, tag, flipped.toString('base64url')].join(':'))).toThrow(
      DecryptionError,
    );
  });

  it('refuse une autre clé', () => {
    const stored = encryptField('85073003328');
    process.env.ENCRYPTION_KEY = newKey();
    expect(() => decryptField(stored)).toThrow(DecryptionError);
  });

  it('refuse un format inconnu', () => {
    expect(() => decryptField('texte en clair')).toThrow(DecryptionError);
    expect(() => decryptField('v2:a:b:c')).toThrow(DecryptionError);
  });

  it('le message d’erreur ne contient aucune donnée', () => {
    try {
      decryptField('v1:AAAA:BBBB:85073003328');
    } catch (error) {
      expect((error as Error).message).toBe('DECRYPTION_FAILED');
    }
  });

  it('signale une clé absente ou de mauvaise taille', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encryptField('x')).toThrow(EncryptionConfigError);
    process.env.ENCRYPTION_KEY = Buffer.from('trop court').toString('base64');
    expect(() => encryptField('x')).toThrow(EncryptionConfigError);
  });

  it('une clé absente n’est pas déguisée en valeur altérée au déchiffrement', () => {
    const stored = encryptField('x');
    delete process.env.ENCRYPTION_KEY;
    expect(() => decryptField(stored)).toThrow(EncryptionConfigError);
  });
});

describe('empreinte de recherche', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = newKey();
  });

  it('est stable pour une même valeur et un même contexte', () => {
    expect(lookupHash('ent-1', '85073003328')).toBe(lookupHash('ent-1', '85073003328'));
  });

  it('change selon le contexte et selon la valeur', () => {
    expect(lookupHash('ent-1', '85073003328')).not.toBe(lookupHash('ent-2', '85073003328'));
    expect(lookupHash('ent-1', '85073003328')).not.toBe(lookupHash('ent-1', '85073003329'));
  });

  it('ne contient pas la valeur', () => {
    expect(lookupHash('ent-1', '85073003328')).not.toContain('85073003328');
  });
});
