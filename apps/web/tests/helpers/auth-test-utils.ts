import crypto from 'node:crypto';
import { SignJWT } from 'jose';

export const TEST_EMAIL_PREFIX = 'vitest-auth-';

let counter = 0;
export function testEmail(label: string): string {
  counter += 1;
  return `${TEST_EMAIL_PREFIX}${label}-${Date.now()}-${counter}@socialflow.page`;
}

/** Petit cookie jar pour chaîner les appels `auth.api.*` comme le ferait un navigateur. */
export function cookieJar() {
  const store = new Map<string, string>();
  return {
    apply(res: Response) {
      for (const raw of res.headers.getSetCookie()) {
        const pair = raw.split(';')[0];
        const idx = pair.indexOf('=');
        if (idx === -1) continue;
        store.set(pair.slice(0, idx), pair.slice(idx + 1));
      }
    },
    headers(): Headers {
      return new Headers({ cookie: [...store.entries()].map(([k, v]) => `${k}=${v}`).join('; ') });
    },
  };
}

// RFC 6238 (TOTP) sur la base HMAC-SHA1, pour generer un code valide a partir
// du secret Base32 renvoye par `enableTwoFactor` - evite de dependre d'une
// vraie application d'authentification pendant les tests.
function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of input.toUpperCase().replace(/=+$/, '')) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/**
 * Signe le meme JWT (HS256) que `createEmailVerificationToken` cote
 * better-auth, pour simuler un clic sur le lien recu par email sans
 * dependre de l'envoi reel (mocke) ni d'un stockage en base - ce token est
 * sans etat (voir apps/web/src/lib/auth.ts).
 */
export async function makeEmailVerificationJWT(
  email: string,
  updateTo?: string,
  requestType?: string,
): Promise<string> {
  const payload: Record<string, string> = { email: email.toLowerCase() };
  if (updateTo) payload.updateTo = updateTo.toLowerCase();
  if (requestType) payload.requestType = requestType;
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
    .sign(new TextEncoder().encode(process.env.BETTER_AUTH_SECRET as string));
}

export function totpCode(secretBase32: string, time = Date.now()): string {
  const counterValue = Math.floor(time / 1000 / 30);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counterValue));
  const key = base32Decode(secretBase32);
  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}
