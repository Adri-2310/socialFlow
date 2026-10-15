import { del, put } from '@vercel/blob';

// Stockage des logos (D33, D62) derriere une interface, avec une
// implementation simulee pour les tests (doc/modules/integrations.md,
// CLAUDE.md). En production : Vercel Blob (store public, le logo est fait pour
// etre vu par les clients du cabinet).

export type StoredLogo = { url: string; path: string };

export interface LogoStorage {
  put(path: string, bytes: Uint8Array, contentType: string): Promise<StoredLogo>;
  remove(path: string): Promise<void>;
}

// Vercel Blob. Un suffixe aleatoire est ajoute au chemin : l'URL n'est pas
// devinable et un logo remplace n'est jamais servi depuis un cache perime.
export class VercelBlobLogoStorage implements LogoStorage {
  async put(path: string, bytes: Uint8Array, contentType: string): Promise<StoredLogo> {
    const blob = await put(path, Buffer.from(bytes), {
      access: 'public',
      contentType,
      addRandomSuffix: true,
    });
    return { url: blob.url, path: blob.pathname };
  }

  async remove(path: string): Promise<void> {
    await del(path);
  }
}

// Implementation simulee : en memoire, sans reseau. Pour les tests.
export class InMemoryLogoStorage implements LogoStorage {
  readonly files = new Map<string, { bytes: Uint8Array; contentType: string }>();
  private counter = 0;

  async put(path: string, bytes: Uint8Array, contentType: string): Promise<StoredLogo> {
    this.counter += 1;
    const stored = path.replace(/(\.[a-z]+)$/i, `-${this.counter}$1`);
    this.files.set(stored, { bytes, contentType });
    return { url: `https://logos.test/${stored}`, path: stored };
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }
}

let current: LogoStorage | null = null;

// Stockage utilise par l'application. Les tests le remplacent par
// InMemoryLogoStorage ; sans jeton Blob, aucun stockage (null) : l'envoi de
// logo est alors indisponible plutot que simule en silence.
export function getLogoStorage(): LogoStorage | null {
  if (current) return current;
  if (process.env.BLOB_READ_WRITE_TOKEN) current = new VercelBlobLogoStorage();
  return current;
}

export function setLogoStorage(storage: LogoStorage | null): void {
  current = storage;
}
