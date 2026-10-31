// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activerBareme, ErreurActivationBareme } from '@/lib/bareme/bareme-activation';
import { prisma } from '@/lib/prisma';

// Activation d'un barème avec la base (D22, D119, D122). Les versions de test ont une catégorie et des
// dates qui n'existent nulle part ailleurs : elles ne touchent jamais aux vrais barèmes et sont supprimées.

const PREFIXE = 'vitest-activ-';
const CATEGORIE = 'VITEST_ACTIV';
const SUFFIXE = Date.now();
const EMAIL_SA = `${PREFIXE}sa-${SUFFIXE}@example.test`;
const EMAIL_RH = `${PREFIXE}rh-${SUFFIXE}@example.test`;
const ID_SA = `${PREFIXE}sa-${SUFFIXE}`;
const ID_RH = `${PREFIXE}rh-${SUFFIXE}`;

// Un vrai barème (novembre 2026) recopié sous une catégorie de test et des dates lointaines.
const modele = JSON.parse(
  readFileSync(join(process.cwd(), 'prisma', 'bareme', 'be-2026-11.json'), 'utf-8'),
);
async function creerVersion(code: string, depuis: string, jusqua: string | null) {
  return prisma.baremeVersion.create({
    data: {
      code: `${PREFIXE}${code}-${SUFFIXE}`,
      valideDepuis: new Date(depuis),
      valideJusqua: jusqua ? new Date(jusqua) : null,
      statut: 'A_VERIFIER',
      categorieEmployeur: CATEGORIE,
      parametres: { ...modele.parametres, categorieEmployeur: CATEGORIE },
      source: modele.source,
    },
  });
}
const lire = (code: string) => prisma.baremeVersion.findUniqueOrThrow({ where: { code } });
const refus = async (promesse: Promise<unknown>): Promise<ErreurActivationBareme> => {
  try {
    await promesse;
  } catch (e) {
    if (e instanceof ErreurActivationBareme) return e;
    throw e;
  }
  throw new Error("L'activation aurait dû être refusée.");
};
const MOTIF = 'Aucun simulateur externe accessible pour cette période.';

beforeAll(async () => {
  await prisma.user.createMany({
    data: [
      { id: ID_SA, name: 'Test SA', email: EMAIL_SA, role: 'SUPER_ADMIN' },
      { id: ID_RH, name: 'Test RH', email: EMAIL_RH, role: 'CABINET_RH' },
    ],
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [ID_SA, ID_RH] } } });
  await prisma.baremeVersion.deleteMany({ where: { code: { startsWith: PREFIXE } } });
  await prisma.user.deleteMany({ where: { id: { in: [ID_SA, ID_RH] } } });
});

describe('activerBareme', () => {
  it('refuse sans dérogation : aucun cas de référence, rien n’est écrit', async () => {
    const v = await creerVersion('a', '2090-01-01', '2090-12-31');
    const e = await refus(activerBareme({ code: v.code, parEmail: EMAIL_SA }));
    expect(e.code).toBe('ACTIVATION_REFUSEE');
    expect(e.raisons).toEqual([
      `Aucun cas de référence pour la catégorie d'employeur ${CATEGORIE}.`,
    ]);
    expect((await lire(v.code)).statut).toBe('A_VERIFIER');
  });

  it('l’essai à blanc vérifie tout sans rien écrire', async () => {
    const v = await creerVersion('b', '2091-01-01', '2091-12-31');
    const r = await activerBareme({
      code: v.code,
      parEmail: EMAIL_SA,
      derogationMotif: MOTIF,
      essai: true,
    });
    expect(r).toEqual({ code: v.code, active: false, sansCasReference: true });
    const apres = await lire(v.code);
    expect(apres.statut).toBe('A_VERIFIER');
    expect(apres.activeParId).toBeNull();
    expect(await prisma.auditLog.count({ where: { actorId: ID_SA, action: 'BAREME_ACTIVATED' } })).toBe(0);
  });

  it('active avec la dérogation : statut, auteur, motif et audit dans la même opération', async () => {
    const v = await creerVersion('c', '2092-01-01', '2092-12-31');
    const r = await activerBareme({ code: v.code, parEmail: EMAIL_SA, derogationMotif: `  ${MOTIF} ` });
    expect(r).toEqual({ code: v.code, active: true, sansCasReference: true });

    const apres = await lire(v.code);
    expect(apres.statut).toBe('ACTIF');
    expect(apres.activeParId).toBe(ID_SA);
    expect(apres.activeLe).toBeInstanceOf(Date);
    expect(apres.derogationMotif).toBe(MOTIF);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { actorId: ID_SA, action: 'BAREME_ACTIVATED' },
    });
    // Aucune donnée de paie dans l'audit (D8) : seulement le code, la dérogation et son motif.
    expect(audit.metadata).toEqual({ code: v.code, derogation: true, motif: MOTIF });
  });

  it('refuse un motif vide', async () => {
    const v = await creerVersion('d', '2093-01-01', '2093-12-31');
    const e = await refus(activerBareme({ code: v.code, parEmail: EMAIL_SA, derogationMotif: '   ' }));
    expect(e.code).toBe('ENTREE_INVALIDE');
    expect((await lire(v.code)).statut).toBe('A_VERIFIER');
  });

  it('refuse un acteur qui n’est pas SuperAdmin, ou inconnu', async () => {
    const v = await creerVersion('e', '2094-01-01', '2094-12-31');
    for (const email of [EMAIL_RH, `${PREFIXE}inconnu-${SUFFIXE}@example.test`]) {
      const e = await refus(activerBareme({ code: v.code, parEmail: email, derogationMotif: MOTIF }));
      expect(e.code).toBe('SUPERADMIN_INTROUVABLE');
    }
    expect((await lire(v.code)).statut).toBe('A_VERIFIER');
  });

  it('refuse une version inconnue', async () => {
    const e = await refus(
      activerBareme({ code: `${PREFIXE}absente-${SUFFIXE}`, parEmail: EMAIL_SA, derogationMotif: MOTIF }),
    );
    expect(e.code).toBe('VERSION_INTROUVABLE');
  });

  it('refuse de réactiver une version déjà active', async () => {
    const code = `${PREFIXE}c-${SUFFIXE}`; // activée par le test précédent de la dérogation
    const e = await refus(activerBareme({ code, parEmail: EMAIL_SA, derogationMotif: MOTIF }));
    expect(e.raisons[0]).toBe('Seule une version à vérifier peut être activée (statut actuel : ACTIF).');
  });

  it('refuse un chevauchement avec une version active de la même catégorie', async () => {
    const premiere = await creerVersion('f1', '2095-01-01', '2095-12-31');
    const seconde = await creerVersion('f2', '2095-06-01', '2096-06-30');
    await activerBareme({ code: premiere.code, parEmail: EMAIL_SA, derogationMotif: MOTIF });

    const e = await refus(
      activerBareme({ code: seconde.code, parEmail: EMAIL_SA, derogationMotif: MOTIF }),
    );
    expect(e.raisons).toEqual([
      `Les barèmes ${premiere.code} et ${seconde.code} sont actifs sur une même période.`,
    ]);
    expect((await lire(seconde.code)).statut).toBe('A_VERIFIER');
  });
});

describe('isolation : les barèmes ne sont lus que par le module d’activation', () => {
  it('aucune page ni route de l’application ne lit la table bareme_version', () => {
    const racine = join(process.cwd(), 'src');
    const lecteurs: string[] = [];
    const parcourir = (dossier: string) => {
      for (const nom of readdirSync(dossier)) {
        const chemin = join(dossier, nom);
        if (statSync(chemin).isDirectory()) parcourir(chemin);
        else if (/\.(ts|tsx)$/.test(nom) && readFileSync(chemin, 'utf-8').includes('baremeVersion')) {
          lecteurs.push(relative(racine, chemin).replaceAll('\\', '/'));
        }
      }
    };
    parcourir(racine);
    expect(lecteurs).toEqual(['lib/bareme/bareme-activation.ts']);
  });
});
