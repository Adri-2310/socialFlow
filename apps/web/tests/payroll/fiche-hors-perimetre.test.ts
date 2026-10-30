// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { versionBaremeCompleteSchema } from '@/lib/payroll/bareme/schema';
import { CAS_REFERENCE_2026 } from '@/lib/payroll/cas-reference';
import { ErreurMoteur } from '@/lib/payroll/erreurs';
import { calculerFiche, type EntreeFiche, type VersionAvecParametres } from '@/lib/payroll/fiche';

// Périmètre du moteur v1 du TFE (D120) : ce qui est hors périmètre est REFUSÉ avec un message clair,
// jamais calculé de travers. Chaque refus est vérifié à travers `calculerFiche`.

const DOSSIER = join(process.cwd(), 'prisma', 'bareme');
const versions: VersionAvecParametres[] = [
  'be-2026-09.json',
  'be-2026-10.json',
  'be-2026-11.json',
].map((nom) => {
  const v = versionBaremeCompleteSchema.parse(
    JSON.parse(readFileSync(join(DOSSIER, nom), 'utf-8')),
  );
  return {
    code: v.code,
    valideDepuis: v.valideDepuis,
    valideJusqua: v.valideJusqua,
    statut: 'ACTIF' as const,
    categorieEmployeur: v.categorieEmployeur,
    parametres: v.parametres,
  };
});

// Cas 1 des simulations externes (employé isolé à 2 000 €), un cas valide dont on dégrade un champ.
const cas1 = CAS_REFERENCE_2026[0];
const entree = (modifs: Partial<EntreeFiche> = {}): EntreeFiche => ({
  ...cas1.entree,
  periode: cas1.periode,
  datePaiement: cas1.datePaiement,
  categorieEmployeur: 'PRIVE_MARCHAND',
  versions,
  ...modifs,
});

const refus = (modifs: Partial<EntreeFiche>): ErreurMoteur => {
  try {
    calculerFiche(entree(modifs));
  } catch (e) {
    if (e instanceof ErreurMoteur) return e;
    throw e;
  }
  throw new Error('Le calcul aurait dû être refusé.');
};

describe('calculerFiche : ce qui est hors périmètre est refusé (D120)', () => {
  it('le cas de départ est valide et le coût employeur est présenté comme une estimation', () => {
    const r = calculerFiche(entree());
    expect(r.coutEmployeurEstime).toBe(true);
    expect(r.net).toBe(195_729); // cas 1 de la simulation externe
  });

  it('refuse un non-résident : le précompte des non-résidents n’est pas calculé', () => {
    const e = refus({ habitantRoyaume: false });
    expect(e.code).toBe('PRECOMPTE_NON_SUPPORTE');
    expect(e.message).toBe(
      "Le précompte des non-résidents n'est pas encore calculé par le moteur.",
    );
  });

  it('refuse une catégorie d’employeur sans barème (autre que le privé marchand)', () => {
    const e = refus({ categorieEmployeur: 'PUBLIC' });
    expect(e.code).toBe('BAREME_INTROUVABLE');
    expect(e.message).toContain('PUBLIC');
  });

  it('refuse l’attribution des charges de famille non précisée (conjoint avec revenus et un enfant)', () => {
    const e = refus({
      situation: {
        ...cas1.entree.situation,
        situationFamiliale: 'MARIE_OU_COHABITANT_LEGAL',
        conjointRevenus: 'REVENUS',
        enfantsCharge: 1,
        chargesFamilleAttribuees: null,
      },
    });
    expect(e.code).toBe('ATTRIBUTION_CHARGES_MANQUANTE');
    expect(e.message).toBe(
      'Le conjoint a aussi des revenus : il faut préciser lequel des deux reçoit les réductions pour charges de famille.',
    );
  });

  it('refuse un statut autre que employé ou ouvrier (un dirigeant, par exemple)', () => {
    const e = refus({
      salaire: { ...cas1.entree.salaire, statut: 'DIRIGEANT' } as unknown as EntreeFiche['salaire'],
    });
    expect(e.code).toBe('ENTREE_INVALIDE');
    expect(e.message).toBe('Le statut du salarié doit être EMPLOYE ou OUVRIER.');
  });
});
