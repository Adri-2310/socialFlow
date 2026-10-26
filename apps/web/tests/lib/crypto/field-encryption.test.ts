import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DecryptionError,
  EncryptionConfigError,
  decryptField,
  encryptField,
  isLegacyFormat,
  lookupHash,
} from '@/lib/crypto/field-encryption';
import { aadSalarie, chiffrerSalarie, dechiffrerSalarie } from '@/lib/salarie/salarie-crypto';
import { encryptLegacyV1 } from '../../helpers/legacy-encryption';

const newKey = () => randomBytes(32).toString('base64');
// Le contexte d'un NISS de dossier : le dossier et le champ (D97).
const CTX = 'salarie:dossier-1:niss';

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
    expect(decryptField(encryptField('85073003328', CTX), CTX)).toBe('85073003328');
    expect(decryptField(encryptField('', CTX), CTX)).toBe('');
    expect(decryptField(encryptField('BE68 5390 0754 7034 é', CTX), CTX)).toBe(
      'BE68 5390 0754 7034 é',
    );
  });

  it('ne laisse pas le clair dans la valeur stockée, et écrit le format v2', () => {
    const stored = encryptField('85073003328', CTX);
    expect(stored).not.toContain('85073003328');
    expect(stored.startsWith('v2:')).toBe(true);
    expect(isLegacyFormat(stored)).toBe(false);
  });

  it('produit une valeur différente à chaque chiffrement (IV aléatoire)', () => {
    expect(encryptField('85073003328', CTX)).not.toBe(encryptField('85073003328', CTX));
  });

  it('refuse une valeur altérée', () => {
    const [v, iv, tag, data] = encryptField('85073003328', CTX).split(':');
    const flipped = Buffer.from(data, 'base64url');
    flipped[0] ^= 1;
    expect(() =>
      decryptField([v, iv, tag, flipped.toString('base64url')].join(':'), CTX),
    ).toThrow(DecryptionError);
  });

  it('refuse une autre clé', () => {
    const stored = encryptField('85073003328', CTX);
    process.env.ENCRYPTION_KEY = newKey();
    expect(() => decryptField(stored, CTX)).toThrow(DecryptionError);
  });

  it('refuse un format inconnu', () => {
    expect(() => decryptField('texte en clair', CTX)).toThrow(DecryptionError);
    expect(() => decryptField('v3:a:b:c', CTX)).toThrow(DecryptionError);
    expect(() => decryptField('v2:a:b:c', CTX)).toThrow(DecryptionError);
  });

  it('le message d’erreur ne contient aucune donnée', () => {
    try {
      decryptField('v1:AAAA:BBBB:85073003328', CTX);
    } catch (error) {
      expect((error as Error).message).toBe('DECRYPTION_FAILED');
    }
  });

  it('signale une clé absente ou de mauvaise taille', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encryptField('x', CTX)).toThrow(EncryptionConfigError);
    process.env.ENCRYPTION_KEY = Buffer.from('trop court').toString('base64');
    expect(() => encryptField('x', CTX)).toThrow(EncryptionConfigError);
  });

  it('une clé absente n’est pas déguisée en valeur altérée au déchiffrement', () => {
    const stored = encryptField('x', CTX);
    delete process.env.ENCRYPTION_KEY;
    expect(() => decryptField(stored, CTX)).toThrow(EncryptionConfigError);
  });
});

describe('format v2 : valeur liée à son contexte (D97)', () => {
  const original = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = newKey();
  });
  afterEach(() => {
    if (original === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = original;
  });

  it('refuse une valeur déchiffrée avec le contexte d’un autre dossier', () => {
    const stored = encryptField('85073003328', aadSalarie('dossier-1', 'niss'));
    expect(() => decryptField(stored, aadSalarie('dossier-2', 'niss'))).toThrow(DecryptionError);
  });

  it('refuse une valeur déchiffrée comme l’autre champ du même dossier (NISS lu comme IBAN)', () => {
    const stored = encryptField('85073003328', aadSalarie('dossier-1', 'niss'));
    expect(() => decryptField(stored, aadSalarie('dossier-1', 'iban'))).toThrow(DecryptionError);
  });

  it('accepte exactement le contexte d’origine', () => {
    const stored = encryptField('85073003328', aadSalarie('dossier-1', 'niss'));
    expect(decryptField(stored, aadSalarie('dossier-1', 'niss'))).toBe('85073003328');
  });

  it('refuse un contexte vide au chiffrement, et à la lecture d’une valeur v2', () => {
    expect(() => encryptField('x', '')).toThrow('AAD_REQUIRED');
    expect(() => decryptField(encryptField('x', CTX), '')).toThrow(DecryptionError);
  });

  it('le contexte est vérifié par l’authentification : altérer le contexte et pas la valeur suffit à échouer', () => {
    const stored = encryptField('85073003328', 'salarie:dossier-1:niss');
    expect(() => decryptField(stored, 'salarie:dossier-1:nis')).toThrow(DecryptionError);
    expect(() => decryptField(stored, 'salarie:dossier-1:niss ')).toThrow(DecryptionError);
  });

  it('les aides salarie-crypto lient l’identifiant et le champ', () => {
    const stored = chiffrerSalarie('dossier-1', 'niss', '85073003328');
    expect(stored.startsWith('v2:')).toBe(true);
    expect(dechiffrerSalarie('dossier-1', 'niss', stored)).toBe('85073003328');
    expect(() => dechiffrerSalarie('dossier-2', 'niss', stored)).toThrow(DecryptionError);
    expect(() => dechiffrerSalarie('dossier-1', 'iban', stored)).toThrow(DecryptionError);
    expect(aadSalarie('dossier-1', 'iban')).toBe('salarie:dossier-1:iban');
  });
});

describe('anciennes valeurs v1 (avant D97)', () => {
  const original = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = newKey();
  });
  afterEach(() => {
    if (original === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = original;
  });

  it('restent lisibles, avec n’importe quel contexte', () => {
    const ancien = encryptLegacyV1('85073003328');
    expect(ancien.startsWith('v1:')).toBe(true);
    expect(isLegacyFormat(ancien)).toBe(true);
    expect(decryptField(ancien, CTX)).toBe('85073003328');
    expect(decryptField(ancien, 'salarie:autre:iban')).toBe('85073003328');
    expect(decryptField(ancien, '')).toBe('85073003328');
  });

  it('une valeur v1 altérée ou chiffrée avec une autre clé reste refusée', () => {
    const ancien = encryptLegacyV1('85073003328');
    const [v, iv, tag, data] = ancien.split(':');
    const flipped = Buffer.from(data, 'base64url');
    flipped[0] ^= 1;
    expect(() => decryptField([v, iv, tag, flipped.toString('base64url')].join(':'), CTX)).toThrow(
      DecryptionError,
    );
    process.env.ENCRYPTION_KEY = newKey();
    expect(() => decryptField(ancien, CTX)).toThrow(DecryptionError);
  });

  it('l’application n’écrit plus jamais de v1', () => {
    expect(isLegacyFormat(encryptField('x', CTX))).toBe(false);
    expect(isLegacyFormat(chiffrerSalarie('dossier-1', 'iban', 'x'))).toBe(false);
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
