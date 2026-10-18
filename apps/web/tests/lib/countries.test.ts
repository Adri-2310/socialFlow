import { describe, it, expect } from 'vitest';
import { COUNTRY_CODES, countryName, countryOptions, isCountryCode } from '@/lib/countries';

describe('countries', () => {
  it('reconnait les codes ISO et refuse le reste', () => {
    expect(isCountryCode('BE')).toBe(true);
    expect(isCountryCode('CH')).toBe(true);
    expect(isCountryCode('XX')).toBe(false);
    expect(isCountryCode('be')).toBe(false);
    expect(isCountryCode('BEL')).toBe(false);
    expect(isCountryCode('')).toBe(false);
  });

  it('ne contient aucun doublon', () => {
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length);
  });

  it('donne les noms en francais', () => {
    expect(countryName('BE')).toBe('Belgique');
    expect(countryName('DE')).toBe('Allemagne');
    expect(countryName('US')).toBe('États-Unis');
  });

  it('place les pays voisins en tete puis trie le reste par nom francais', () => {
    const options = countryOptions();

    expect(options.slice(0, 5).map((o) => o.code)).toEqual(['BE', 'FR', 'LU', 'NL', 'DE']);
    expect(options).toHaveLength(COUNTRY_CODES.length);
    const rest = options.slice(5).map((o) => o.name);
    expect(rest).toEqual([...rest].sort(new Intl.Collator('fr').compare));
  });
});
