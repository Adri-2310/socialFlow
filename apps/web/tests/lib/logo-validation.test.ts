import { describe, it, expect } from 'vitest';
import { LOGO_MAX_BYTES, isSafeSvg, validateLogo } from '@/lib/logo-validation';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const enc = (text: string) => new TextEncoder().encode(text);

const CLEAN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#4f46e5"/></svg>';

describe('validateLogo (D62)', () => {
  it('accepte un PNG d apres sa signature', () => {
    expect(validateLogo(PNG)).toEqual({ ok: true, kind: 'png', contentType: 'image/png' });
  });

  it('accepte un SVG propre, avec ou sans prologue XML et BOM', () => {
    expect(validateLogo(enc(CLEAN_SVG))).toMatchObject({ ok: true, kind: 'svg' });
    expect(validateLogo(enc(`<?xml version="1.0"?>\n${CLEAN_SVG}`))).toMatchObject({ ok: true });
    expect(validateLogo(enc(`﻿${CLEAN_SVG}`))).toMatchObject({ ok: true });
  });

  it('accepte un SVG avec degrade interne et image embarquee en base64', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"><stop offset="0" stop-color="#000"/></linearGradient></defs>' +
      '<rect fill="url(#g)" width="1" height="1"/><image href="data:image/png;base64,AAAA"/></svg>';
    expect(validateLogo(enc(svg))).toMatchObject({ ok: true, kind: 'svg' });
  });

  it('refuse un fichier vide ou absent', () => {
    expect(validateLogo(null)).toEqual({ ok: false, error: 'LOGO_REQUIRED' });
    expect(validateLogo(new Uint8Array())).toEqual({ ok: false, error: 'LOGO_REQUIRED' });
  });

  it('refuse un fichier de plus de 1 Mo', () => {
    const big = new Uint8Array(LOGO_MAX_BYTES + 1);
    big.set(PNG);
    expect(validateLogo(big)).toEqual({ ok: false, error: 'LOGO_TOO_LARGE' });
    const edge = new Uint8Array(LOGO_MAX_BYTES);
    edge.set(PNG);
    expect(validateLogo(edge)).toMatchObject({ ok: true });
  });

  it('refuse tout autre format, meme avec une extension ou un type trompeur', () => {
    expect(validateLogo(enc('<html><body>pas une image</body></html>'))).toEqual({
      ok: false,
      error: 'LOGO_INVALID_TYPE',
    });
    // JPEG
    expect(validateLogo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]))).toEqual({
      ok: false,
      error: 'LOGO_INVALID_TYPE',
    });
    // PDF
    expect(validateLogo(enc('%PDF-1.7 ...'))).toEqual({ ok: false, error: 'LOGO_INVALID_TYPE' });
  });

  it.each([
    ['script', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    ['gestionnaire d evenement', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'],
    ['lien javascript', '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>'],
    ['foreignObject', '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div/></foreignObject></svg>'],
    ['image externe', '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/x.png"/></svg>'],
    ['href externe (xlink)', '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="https://evil.example/s.svg#a"/></svg>'],
    ['url() externe', '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(https://evil.example/a)"/></svg>'],
    ['@import', '<svg xmlns="http://www.w3.org/2000/svg"><style>@import "https://evil.example/a.css";</style></svg>'],
    ['entite XML', '<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>'],
    ['iframe', '<svg xmlns="http://www.w3.org/2000/svg"><iframe src="x"/></svg>'],
    ['data html', '<svg xmlns="http://www.w3.org/2000/svg"><a href="data:text/html;base64,AAAA"/></svg>'],
  ])('refuse un SVG avec %s', (_name, svg) => {
    expect(validateLogo(enc(svg))).toEqual({ ok: false, error: 'LOGO_SVG_UNSAFE' });
  });

  it('isSafeSvg accepte un SVG avec namespaces et references internes', () => {
    expect(isSafeSvg(CLEAN_SVG)).toBe(true);
    expect(isSafeSvg('<svg><use href="#a"/><rect id="a" style="fill:url(#g)"/></svg>')).toBe(true);
  });
});
