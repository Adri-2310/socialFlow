// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const getSession = vi.fn();
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
const cabinetFindUnique = vi.fn();
vi.mock('@/lib/prisma', () => ({ prisma: { cabinet: { findUnique: cabinetFindUnique } } }));

const { ACTIONS, ROLES, authorize, levelFor } = await import('@/lib/authz');
type ActionId = keyof typeof ACTIONS;
type Role = (typeof ROLES)[number];

const request = new Request('http://localhost/api/test');
const ACTION_IDS = Object.keys(ACTIONS) as ActionId[];

// --- Lecture de doc/PERMISSIONS.md -------------------------------------------

const SYMBOL_TO_LEVEL: Record<string, string> = { '✅': 'ALLOW', '🔸': 'SCOPED', '📊': 'COUNTERS', '❌': 'DENY' };

// Lignes « action × rôle » des tableaux de la matrice (hors « États bloquants »).
function readDocMatrix() {
  const text = readFileSync(path.resolve(process.cwd(), '../../doc/PERMISSIONS.md'), 'utf8');
  const matrix = text.split(/\r?\n/).slice(0);
  const rows: { label: string; levels: string[] }[] = [];
  let inMatrix = true;
  for (const line of matrix) {
    if (line.startsWith('## États bloquants')) inMatrix = false;
    if (!inMatrix || !line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells[0] === 'Action' || cells[0].startsWith('---')) continue;
    const levels = cells.slice(1, 6).map((cell) => SYMBOL_TO_LEVEL[[...cell][0]] ?? `?${cell}`);
    rows.push({ label: cells[0], levels });
  }
  return rows;
}

describe('catalogue des actions et PERMISSIONS.md', () => {
  const docRows = readDocMatrix();

  it('lit bien un tableau complet', () => {
    expect(docRows.length).toBeGreaterThan(40);
    for (const row of docRows) expect(row.levels).toHaveLength(5);
  });

  it('couvre chaque ligne du document, et rien d en plus', () => {
    const docLabels = docRows.map((row) => row.label).sort();
    const codeLabels = ACTION_IDS.map((id) => ACTIONS[id].label).sort();
    expect(codeLabels).toEqual(docLabels);
  });

  it.each(ACTION_IDS)('%s : les cinq niveaux sont ceux du document', (id) => {
    const row = docRows.find((r) => r.label === ACTIONS[id].label);
    expect(row).toBeDefined();
    expect(ROLES.map((role) => ACTIONS[id].levels[role])).toEqual(row!.levels);
  });

  it('utilise des identifiants uniques de la forme domaine.verbe', () => {
    expect(new Set(ACTION_IDS).size).toBe(ACTION_IDS.length);
    for (const id of ACTION_IDS) expect(id).toMatch(/^[a-z-]+\.[a-z-]+$/);
  });

  it('le SuperAdmin n accède jamais aux données de paie (D8)', () => {
    const metier = ACTION_IDS.filter((id) => /^(salarie|demande|periode|prestation|fiche|paie|declaration|calendrier|messagerie|document)\./.test(id));
    expect(metier.length).toBeGreaterThan(10);
    for (const id of metier) expect(levelFor(id, 'SUPER_ADMIN')).toBe('DENY');
  });
});

// --- levelFor -----------------------------------------------------------------

describe('levelFor', () => {
  it('refuse tout rôle inconnu ou absent', () => {
    for (const id of ACTION_IDS) {
      expect(levelFor(id, null)).toBe('DENY');
      expect(levelFor(id, undefined)).toBe('DENY');
      expect(levelFor(id, 'ADMIN')).toBe('DENY');
    }
  });
});

// --- authorize : toute la matrice ---------------------------------------------

function sessionFor(role: string | null, extra: { cabinetId?: string | null; twoFactorEnabled?: boolean | null } = {}) {
  getSession.mockResolvedValue({
    user: {
      id: 'u1',
      name: 'Test',
      role,
      cabinetId: role === 'SUPER_ADMIN' ? null : 'c1',
      twoFactorEnabled: true,
      ...extra,
    },
  });
}

const READ_WRITE_CABINET = { billingStatus: 'ACTIF', status: 'actif', suspensionType: null };
const READ_ONLY_CABINET = { billingStatus: 'IMPAYE', status: 'actif', suspensionType: null };

beforeEach(() => {
  getSession.mockReset();
  cabinetFindUnique.mockReset().mockResolvedValue(READ_WRITE_CABINET);
});

describe('authorize', () => {
  it('renvoie 401 sans session', async () => {
    getSession.mockResolvedValue(null);
    const res = await authorize(request, 'entreprise.lister');
    expect(res.response?.status).toBe(401);
    expect(await res.response?.json()).toEqual({ error: 'UNAUTHORIZED' });
  });

  describe.each(ACTION_IDS)('%s', (id) => {
    it.each(ROLES)('rôle %s : suit la matrice', async (role) => {
      sessionFor(role);
      const res = await authorize(request, id);
      const level = ACTIONS[id].levels[role];
      if (level === 'DENY') {
        expect(res.response?.status).toBe(403);
        expect(await res.response?.json()).toEqual({ error: 'FORBIDDEN' });
      } else {
        expect(res.response).toBeUndefined();
        expect(res.level).toBe(level);
        expect(res.session?.user.role).toBe(role);
      }
    });
  });

  it.each([null, 'ADMIN'])('refuse le rôle %s', async (role) => {
    sessionFor(role);
    const res = await authorize(request, 'compte.gerer');
    expect(res.response?.status).toBe(403);
  });

  describe('2FA du SuperAdmin (D20)', () => {
    const superAdminActions = ACTION_IDS.filter((id) => ACTIONS[id].levels.SUPER_ADMIN !== 'DENY');

    it.each(superAdminActions)('%s : exige la 2FA, sauf exemption', async (id) => {
      sessionFor('SUPER_ADMIN', { twoFactorEnabled: false });
      const res = await authorize(request, id);
      const exempt = 'twoFactorExempt' in ACTIONS[id];
      if (exempt) {
        expect(res.response).toBeUndefined();
      } else {
        expect(res.response?.status).toBe(403);
        expect(await res.response?.json()).toEqual({ error: 'TWO_FACTOR_REQUIRED' });
      }
    });

    it('seules les actions du profil et de l export restent possibles sans 2FA', () => {
      const exempt = ACTION_IDS.filter((id) => 'twoFactorExempt' in ACTIONS[id]);
      expect(exempt.sort()).toEqual(['compte.gerer', 'export-rgpd.demander']);
    });

    it('laisse passer un SuperAdmin dont la 2FA est activée', async () => {
      sessionFor('SUPER_ADMIN', { twoFactorEnabled: true });
      const res = await authorize(request, 'utilisateur.support');
      expect(res.response).toBeUndefined();
    });

    it('un autre rôle reçoit FORBIDDEN et rien sur la 2FA', async () => {
      sessionFor('CABINET_RH', { twoFactorEnabled: false });
      const res = await authorize(request, 'utilisateur.support');
      expect(await res.response?.json()).toEqual({ error: 'FORBIDDEN' });
    });

    it('n exige pas la 2FA des autres rôles', async () => {
      sessionFor('CABINET_RH', { twoFactorEnabled: false });
      const res = await authorize(request, 'entreprise.lister');
      expect(res.response).toBeUndefined();
    });
  });

  describe('cabinet requis', () => {
    const cabinetActions = ACTION_IDS.filter((id) => ACTIONS[id].levels.CABINET_RH !== 'DENY');

    it.each(cabinetActions)('%s : refuse un Cabinet RH sans cabinet', async (id) => {
      sessionFor('CABINET_RH', { cabinetId: null });
      const res = await authorize(request, id);
      expect(res.response?.status).toBe(403);
    });

    it('ne demande pas de cabinet au SuperAdmin', async () => {
      sessionFor('SUPER_ADMIN');
      const res = await authorize(request, 'audit.voir');
      expect(res.response).toBeUndefined();
      expect(res.level).toBe('ALLOW');
    });
  });

  describe('lecture seule du cabinet (D29, D71)', () => {
    const writeActions = ACTION_IDS.filter((id) => 'write' in ACTIONS[id] && ACTIONS[id].levels.CABINET_RH !== 'DENY');

    it('il existe des actions d écriture du Cabinet RH', () => {
      expect(writeActions).toEqual(
        expect.arrayContaining(['entreprise.gerer', 'gestionnaire.inviter', 'cabinet.personnaliser']),
      );
    });

    it.each(writeActions)('%s : 423 CABINET_READ_ONLY quand le cabinet est en lecture seule', async (id) => {
      cabinetFindUnique.mockResolvedValue(READ_ONLY_CABINET);
      sessionFor('CABINET_RH');
      const res = await authorize(request, id);
      expect(res.response?.status).toBe(423);
      expect(await res.response?.json()).toEqual({ error: 'CABINET_READ_ONLY' });
    });

    it('les lectures et l abonnement restent possibles (D29)', async () => {
      cabinetFindUnique.mockResolvedValue(READ_ONLY_CABINET);
      sessionFor('CABINET_RH');
      for (const id of ['entreprise.lister', 'abonnement.gerer', 'export-rgpd.demander'] as const) {
        expect((await authorize(request, id)).response).toBeUndefined();
      }
    });

    it('une route peut préciser qu une action est une écriture, ou non', async () => {
      cabinetFindUnique.mockResolvedValue(READ_ONLY_CABINET);
      sessionFor('CABINET_RH');
      expect((await authorize(request, 'declaration.suivre', { write: true })).response?.status).toBe(423);
      expect((await authorize(request, 'cabinet.personnaliser', { write: false })).response).toBeUndefined();
    });

    it('ne touche pas le SuperAdmin, sans cabinet', async () => {
      sessionFor('SUPER_ADMIN');
      expect((await authorize(request, 'compte.gerer', { write: true })).response).toBeUndefined();
      expect(cabinetFindUnique).not.toHaveBeenCalled();
    });
  });

  it('couvre les cinq rôles', () => {
    const roles: Role[] = ['SUPER_ADMIN', 'CABINET_RH', 'GESTIONNAIRE_RH', 'ENTREPRISE_CLIENTE', 'COLLABORATEUR'];
    expect([...ROLES]).toEqual(roles);
  });
});
