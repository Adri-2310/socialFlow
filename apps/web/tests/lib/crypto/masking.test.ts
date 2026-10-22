import { describe, expect, it } from 'vitest';
import { maskIban, maskNiss } from '@/lib/crypto/masking';

describe('masquage', () => {
  it('NISS : garde la date de naissance seulement', () => {
    expect(maskNiss('85073003328')).toBe('85.07.**-***.**');
    expect(maskNiss('85.07.30-033.28')).toBe('85.07.**-***.**');
  });

  it('NISS invalide : ne laisse rien filtrer', () => {
    expect(maskNiss('123')).toBe('**.**.**-***.**');
    expect(maskNiss('')).toBe('**.**.**-***.**');
  });

  it('IBAN : garde le pays, la clé et les 4 derniers caractères', () => {
    expect(maskIban('BE68539007547034')).toBe('BE68 **** **** 7034');
    expect(maskIban('BE68 5390 0754 7034')).toBe('BE68 **** **** 7034');
  });

  it('IBAN trop court : tout est masqué', () => {
    expect(maskIban('BE6')).toBe('**** ****');
  });
});
