import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

// Chiffrement applicatif des données sensibles (NISS, IBAN, secrets
// d'intégration) : CONVENTIONS § 4. AES-256-GCM, clé dans ENCRYPTION_KEY.
//
// Format stocké : `v1:<iv>:<tag>:<texte chiffré>` (base64url). Le préfixe de
// version permet de changer d'algorithme ou de clé plus tard sans casser les
// valeurs déjà en base.

const VERSION = 'v1';
const IV_BYTES = 12; // taille recommandée pour GCM
const KEY_BYTES = 32;

export class EncryptionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptionConfigError';
  }
}

export class DecryptionError extends Error {
  constructor() {
    // Jamais de détail ni de valeur dans le message : il peut finir dans un log.
    super('DECRYPTION_FAILED');
    this.name = 'DecryptionError';
  }
}

// Lue à chaque appel (et non à l'import) : les tests peuvent la changer, et une
// clé absente ne doit casser que les routes qui en ont besoin.
function masterKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new EncryptionConfigError('ENCRYPTION_KEY manquante');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new EncryptionConfigError('ENCRYPTION_KEY doit être 32 octets encodés en base64');
  }
  return key;
}

// Deux usages, deux clés dérivées : la clé de chiffrement ne sert jamais à
// calculer les empreintes de recherche.
function derivedKey(purpose: 'encrypt' | 'lookup'): Buffer {
  return Buffer.from(
    hkdfSync('sha256', masterKey(), Buffer.alloc(0), `socialflow:${purpose}`, KEY_BYTES),
  );
}

export function encryptField(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', derivedKey('encrypt'), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

export function decryptField(stored: string): string {
  const [version, iv, tag, data] = stored.split(':');
  if (version !== VERSION || !iv || !tag || data === undefined) throw new DecryptionError();
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      derivedKey('encrypt'),
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch (error) {
    // Une erreur de configuration (clé absente) doit rester visible ; le reste
    // (valeur altérée, mauvaise clé) est une seule erreur opaque.
    if (error instanceof EncryptionConfigError) throw error;
    throw new DecryptionError();
  }
}

// Empreinte déterministe pour retrouver ou dédoublonner une valeur chiffrée
// (le chiffrement étant aléatoire, il ne permet ni @unique ni recherche).
// `scope` lie l'empreinte à son contexte : le même NISS dans deux entreprises
// donne deux empreintes différentes, ce qui n'en révèle pas la présence ailleurs.
export function lookupHash(scope: string, value: string): string {
  return createHmac('sha256', derivedKey('lookup')).update(`${scope}:${value}`).digest('base64url');
}
