import { createCipheriv, hkdfSync, randomBytes } from 'node:crypto';

// Fabrique une valeur au format v1 d'avant D97 (sans contexte), pour vérifier que les dossiers
// existants restent lisibles et que le script de reconversion les traite. Volontairement une
// copie de l'ancien algorithme : le code de l'application, lui, n'écrit plus jamais de v1.
export function encryptLegacyV1(plaintext: string): string {
  const key = Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(process.env.ENCRYPTION_KEY as string, 'base64'),
      Buffer.alloc(0),
      'socialflow:encrypt',
      32,
    ),
  );
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}
