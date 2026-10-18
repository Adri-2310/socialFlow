// Validation du logo du cabinet (D33, D62) : PNG ou SVG, 1 Mo maximum.
// Module pur : on controle le CONTENU du fichier (signature PNG, balise SVG),
// jamais le seul type declare par le navigateur ni l'extension.

export const LOGO_MAX_BYTES = 1024 * 1024;

export type LogoKind = 'png' | 'svg';

export type LogoError =
  | 'LOGO_REQUIRED'
  | 'LOGO_TOO_LARGE'
  | 'LOGO_INVALID_TYPE'
  | 'LOGO_SVG_UNSAFE';

export const LOGO_CONTENT_TYPES: Record<LogoKind, string> = {
  png: 'image/png',
  svg: 'image/svg+xml',
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const isPng = (bytes: Uint8Array) =>
  bytes.length > PNG_SIGNATURE.length && PNG_SIGNATURE.every((b, i) => bytes[i] === b);

// Un SVG est du texte contenant une balise <svg>. On le decode en UTF-8
// (un BOM eventuel est ignore).
function readSvgText(bytes: Uint8Array): string | null {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^﻿/, '');
  return /<svg[\s>]/i.test(text) ? text : null;
}

// Un SVG peut embarquer du script ou charger des ressources externes. On le
// REFUSE plutot que de tenter de le "nettoyer" : une liste de choses a
// retirer oublie toujours un cas. Un logo legitime n'en a pas besoin.
const UNSAFE_SVG: RegExp[] = [
  /<\s*script/i,
  /<\s*foreignObject/i,
  /<\s*(iframe|embed|object|audio|video|link|meta|base|form|input|button)\b/i,
  /<\s*!\s*(ENTITY|DOCTYPE[^>]*\[)/i,
  /<\s*\?\s*xml-stylesheet/i,
  /\son[a-z]+\s*=/i,
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /data\s*:\s*text\/html/i,
  /@import/i,
  /(?:href|src)\s*=\s*["']?\s*(?!#|data:image\/(?:png|jpeg|gif|webp);base64,)[^"'\s>]+/i,
  /url\(\s*["']?\s*(?!#)[^)]+\)/i,
];

export function isSafeSvg(text: string): boolean {
  return !UNSAFE_SVG.some((pattern) => pattern.test(text));
}

export function validateLogo(
  bytes: Uint8Array | null,
): { ok: true; kind: LogoKind; contentType: string } | { ok: false; error: LogoError } {
  if (!bytes || bytes.length === 0) return { ok: false, error: 'LOGO_REQUIRED' };
  if (bytes.length > LOGO_MAX_BYTES) return { ok: false, error: 'LOGO_TOO_LARGE' };

  if (isPng(bytes)) return { ok: true, kind: 'png', contentType: LOGO_CONTENT_TYPES.png };

  const svg = readSvgText(bytes);
  if (svg !== null) {
    if (!isSafeSvg(svg)) return { ok: false, error: 'LOGO_SVG_UNSAFE' };
    return { ok: true, kind: 'svg', contentType: LOGO_CONTENT_TYPES.svg };
  }

  return { ok: false, error: 'LOGO_INVALID_TYPE' };
}
