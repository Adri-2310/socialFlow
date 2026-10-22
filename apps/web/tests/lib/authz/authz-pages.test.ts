// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pages et layouts protégés : chacun appelle requireAuthorized() avec l'action
// prévue par la matrice (doc/PERMISSIONS.md), en tout premier, avant de toucher
// aux données. Session simulée, aucune base : la garde redirige avant tout accès.
const getSession = vi.fn();
vi.mock('@/lib/auth/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/billing/stripe', () => ({ stripe: {} }));
vi.mock('@/lib/email/email', () => ({}));

// `redirect()` de next/navigation ne peut pas s'exécuter hors d'un rendu Next.js
// réel : on la remplace par une erreur ordinaire portant l'URL.
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/authz/authz-page', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/authz/authz-page')>();
  return { ...actual, requireAuthorized: vi.fn(actual.requireAuthorized) };
});

const { requireAuthorized } = await import('@/lib/authz/authz-page');

type Page = (props: Record<string, unknown>) => Promise<unknown>;

const adminLayout = await import('@/app/dashboard/admin/layout');
const adminHome = await import('@/app/dashboard/admin/page');
const adminCabinets = await import('@/app/dashboard/admin/cabinets/page');
const adminUsers = await import('@/app/dashboard/admin/utilisateurs/page');
const adminAudit = await import('@/app/dashboard/admin/audit/page');
const adminConfiguration = await import('@/app/dashboard/admin/configuration/page');
const adminBilling = await import('@/app/dashboard/admin/facturation/page');
const adminMonitoring = await import('@/app/dashboard/admin/monitoring/page');
const cabinetLayout = await import('@/app/dashboard/cabinet/layout');
const cabinetHome = await import('@/app/dashboard/cabinet/page');
const cabinetEntreprises = await import('@/app/dashboard/cabinet/entreprises/page');
const cabinetGestionnaires = await import('@/app/dashboard/cabinet/gestionnaires/page');
const cabinetAudit = await import('@/app/dashboard/cabinet/audit/page');
const cabinetBilling = await import('@/app/dashboard/cabinet/facturation/page');
const cabinetPayment = await import('@/app/dashboard/cabinet/paiement/page');
const cabinetSettings = await import('@/app/dashboard/cabinet/parametres/page');
const gestionnaireLayout = await import('@/app/dashboard/gestionnaire/layout');
const gestionnaireHome = await import('@/app/dashboard/gestionnaire/page');
const gestionnaireSalaries =
  await import('@/app/dashboard/gestionnaire/entreprises/[id]/salaries/page');
const gestionnaireSalarie = await import('@/app/dashboard/gestionnaire/salaries/[id]/page');
const gestionnairePeriodes =
  await import('@/app/dashboard/gestionnaire/entreprises/[id]/periodes/page');
const gestionnairePrestations = await import('@/app/dashboard/gestionnaire/periodes/[id]/page');
const entrepriseLayout = await import('@/app/dashboard/entreprise/layout');
const entrepriseHome = await import('@/app/dashboard/entreprise/page');
const profil = await import('@/app/profil/page');

const PAGES: [string, Page, string][] = [
  ['dashboard/admin (layout)', adminLayout.default as Page, 'plateforme.superviser'],
  ['dashboard/admin', adminHome.default as Page, 'plateforme.superviser'],
  ['dashboard/admin/cabinets', adminCabinets.default as Page, 'cabinet.administrer'],
  ['dashboard/admin/utilisateurs', adminUsers.default as Page, 'utilisateur.lister'],
  ['dashboard/admin/audit', adminAudit.default as Page, 'audit.voir'],
  ['dashboard/admin/configuration', adminConfiguration.default as Page, 'plan.gerer'],
  ['dashboard/admin/facturation', adminBilling.default as Page, 'plateforme.superviser'],
  ['dashboard/admin/monitoring', adminMonitoring.default as Page, 'plateforme.superviser'],
  ['dashboard/cabinet (layout)', cabinetLayout.default as Page, 'cabinet.consulter'],
  ['dashboard/cabinet', cabinetHome.default as Page, 'cabinet.consulter'],
  ['dashboard/cabinet/entreprises', cabinetEntreprises.default as Page, 'entreprise.lister'],
  ['dashboard/cabinet/gestionnaires', cabinetGestionnaires.default as Page, 'gestionnaire.lister'],
  ['dashboard/cabinet/audit', cabinetAudit.default as Page, 'audit.voir'],
  ['dashboard/cabinet/facturation', cabinetBilling.default as Page, 'abonnement.gerer'],
  ['dashboard/cabinet/paiement', cabinetPayment.default as Page, 'abonnement.gerer'],
  ['dashboard/cabinet/parametres', cabinetSettings.default as Page, 'cabinet.personnaliser'],
  // Le layout du gestionnaire se garde sur salarie.gerer (réservée au gestionnaire), car
  // salarie.lister est aussi ouverte au Cabinet RH et à l'entreprise.
  ['dashboard/gestionnaire (layout)', gestionnaireLayout.default as Page, 'salarie.gerer'],
  ['dashboard/gestionnaire', gestionnaireHome.default as Page, 'salarie.lister'],
  [
    'dashboard/gestionnaire/entreprises/[id]/salaries',
    gestionnaireSalaries.default as Page,
    'salarie.lister',
  ],
  ['dashboard/gestionnaire/salaries/[id]', gestionnaireSalarie.default as Page, 'salarie.voir'],
  [
    'dashboard/gestionnaire/entreprises/[id]/periodes',
    gestionnairePeriodes.default as Page,
    'periode.voir',
  ],
  ['dashboard/gestionnaire/periodes/[id]', gestionnairePrestations.default as Page, 'periode.voir'],
  ['dashboard/entreprise (layout)', entrepriseLayout.default as Page, 'entreprise.lister'],
  ['dashboard/entreprise', entrepriseHome.default as Page, 'entreprise.lister'],
  ['profil', profil.default as Page, 'compte.gerer'],
];

// Tous les paramètres qu'une page peut lire avant sa garde.
const PROPS = { children: null, searchParams: Promise.resolve({}), params: Promise.resolve({}) };

beforeEach(() => {
  getSession.mockReset();
  redirectMock.mockClear();
  vi.mocked(requireAuthorized).mockClear();
});

describe('pages protégées : autorisation par la matrice', () => {
  it('couvre les 25 pages et layouts protégés', () => {
    expect(PAGES).toHaveLength(25);
  });

  describe.each(PAGES)('%s', (_name, page, action) => {
    it(`appelle requireAuthorized avec l'action ${action}, en premier`, async () => {
      getSession.mockResolvedValue(null);
      await page(PROPS).catch(() => undefined);
      expect(requireAuthorized).toHaveBeenCalledTimes(1);
      expect(vi.mocked(requireAuthorized).mock.calls[0][0]).toBe(action);
    });

    it('redirige vers /login sans session', async () => {
      getSession.mockResolvedValue(null);
      await expect(page(PROPS)).rejects.toThrow('REDIRECT:/login');
    });

    it('redirige vers /dashboard un rôle inconnu', async () => {
      getSession.mockResolvedValue({
        user: { id: 'u1', role: 'ADMIN', cabinetId: 'c1', twoFactorEnabled: true },
      });
      await expect(page(PROPS)).rejects.toThrow('REDIRECT:/dashboard');
    });
  });
});
