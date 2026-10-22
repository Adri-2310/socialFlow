import { describe, expect, it } from 'vitest';
import { isNavActive, pageTitle } from '@/components/layout/page-titles';

describe('titre de la barre du haut', () => {
  it('donne un titre à la liste des salariés et à la fiche d’un salarié', () => {
    expect(pageTitle('GESTIONNAIRE_RH', '/dashboard/gestionnaire/entreprises/abc/salaries')).toBe(
      'Salariés',
    );
    expect(pageTitle('GESTIONNAIRE_RH', '/dashboard/gestionnaire/salaries/xyz')).toBe(
      'Dossier salarié',
    );
    // Une barre oblique finale ne change rien.
    expect(pageTitle('GESTIONNAIRE_RH', '/dashboard/gestionnaire/salaries/xyz/')).toBe(
      'Dossier salarié',
    );
  });

  it('laisse le menu décider pour les pages qui y figurent et pour les autres espaces', () => {
    expect(pageTitle('GESTIONNAIRE_RH', '/dashboard/gestionnaire')).toBeNull();
    expect(pageTitle('CABINET_RH', '/dashboard/cabinet/entreprises')).toBeNull();
    expect(pageTitle('SUPER_ADMIN', '/dashboard/admin')).toBeNull();
    // Le même chemin chez un autre rôle n'est pas le sien.
    expect(pageTitle('CABINET_RH', '/dashboard/gestionnaire/salaries/xyz')).toBeNull();
  });

  it('ne confond pas une adresse voisine avec une page connue', () => {
    expect(pageTitle('GESTIONNAIRE_RH', '/dashboard/gestionnaire/salaries/xyz/autre')).toBeNull();
    expect(pageTitle('GESTIONNAIRE_RH', '/dashboard/gestionnaire/salaries')).toBeNull();
  });
});

describe('entrée active du menu', () => {
  it('est celle dont l’adresse est exactement celle de la page', () => {
    expect(isNavActive('CABINET_RH', '/dashboard/cabinet', '/dashboard/cabinet')).toBe(true);
    expect(isNavActive('CABINET_RH', '/dashboard/cabinet', '/dashboard/cabinet/entreprises')).toBe(
      false,
    );
  });

  it('« Mes entreprises » reste active sur les pages du gestionnaire qui en découlent', () => {
    for (const chemin of [
      '/dashboard/gestionnaire',
      '/dashboard/gestionnaire/entreprises/abc/salaries',
      '/dashboard/gestionnaire/salaries/xyz',
    ]) {
      expect(isNavActive('GESTIONNAIRE_RH', '/dashboard/gestionnaire', chemin), chemin).toBe(true);
    }
  });

  it('ne change rien pour les autres rôles ni pour une entrée sans adresse', () => {
    expect(isNavActive('CABINET_RH', '/dashboard/gestionnaire', '/dashboard/gestionnaire/x')).toBe(
      false,
    );
    expect(isNavActive('GESTIONNAIRE_RH', undefined, '/dashboard/gestionnaire')).toBe(false);
    expect(
      isNavActive('GESTIONNAIRE_RH', '/dashboard/gestionnairex', '/dashboard/gestionnaire/y'),
    ).toBe(false);
  });
});
