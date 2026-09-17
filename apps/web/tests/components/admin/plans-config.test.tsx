import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { PlansConfig } from '@/components/admin/plans-config';
import type { PlanConfigRow } from '@/lib/admin-data';

const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const PLANS: PlanConfigRow[] = [
  {
    id: 'plan-1',
    planId: 'starter',
    name: 'Starter',
    description: 'Pour les petits cabinets.',
    monthlyPrice: 150,
    yearlyPrice: 120,
    custom: false,
    highlighted: false,
    badge: null,
    features: ['Feature A', 'Feature B'],
    sortOrder: 1,
    archivedAt: null,
    stripe: {
      productId: 'prod_1',
      monthlyPriceId: 'price_m1',
      monthlyPriceAmount: 150,
      yearlyPriceId: 'price_y1',
      yearlyPriceAmount: 120,
    },
    inSync: true,
  },
  {
    id: 'plan-2',
    planId: 'enterprise',
    name: 'Enterprise',
    description: 'Pour les grands secretariats.',
    monthlyPrice: null,
    yearlyPrice: null,
    custom: false,
    highlighted: true,
    badge: 'Le plus choisi',
    features: ['Feature C'],
    sortOrder: 2,
    archivedAt: null,
    stripe: {
      productId: null,
      monthlyPriceId: null,
      monthlyPriceAmount: null,
      yearlyPriceId: null,
      yearlyPriceAmount: null,
    },
    inSync: false,
  },
];

const ARCHIVED_PLAN: PlanConfigRow = {
  id: 'plan-3',
  planId: 'legacy',
  name: 'Legacy',
  description: 'Ancien plan retire.',
  monthlyPrice: 50,
  yearlyPrice: 40,
  custom: false,
  highlighted: false,
  badge: null,
  features: ['Feature D'],
  sortOrder: 3,
  archivedAt: '2026-01-01T00:00:00.000Z',
  stripe: {
    productId: null,
    monthlyPriceId: null,
    monthlyPriceAmount: null,
    yearlyPriceId: null,
    yearlyPriceAmount: null,
  },
  inSync: false,
};

beforeEach(() => {
  refreshMock.mockReset();
  vi.unstubAllGlobals();
});

describe('PlansConfig - affichage', () => {
  it('affiche chaque plan avec son prix et son statut de synchronisation', () => {
    render(<PlansConfig plans={PLANS} />);

    expect(screen.getByText('Starter')).toBeInTheDocument();
    expect(screen.getByText(/150.*€.*\/ mois/)).toBeInTheDocument();
    expect(screen.getByText('Synchronisé avec Stripe')).toBeInTheDocument();

    expect(screen.getByText('Enterprise')).toBeInTheDocument();
    expect(screen.getByText('Le plus choisi')).toBeInTheDocument();
    expect(screen.getByText('Désynchronisé de Stripe')).toBeInTheDocument();
  });

  it('affiche "Sur devis" quand le plan n a pas de prix mensuel', () => {
    render(<PlansConfig plans={PLANS} />);
    expect(screen.getByText('Sur devis')).toBeInTheDocument();
  });
});

describe('PlansConfig - edition', () => {
  it('ouvre le formulaire pre-rempli au clic sur Modifier, ferme au clic sur Annuler', () => {
    render(<PlansConfig plans={PLANS} />);

    const starterCard = screen.getByText('Starter').closest('div')!.parentElement!.parentElement!;
    fireEvent.click(within(starterCard).getByRole('button', { name: /Modifier/ }));

    expect(screen.getByDisplayValue('Starter')).toBeInTheDocument();
    expect(screen.getByDisplayValue('150')).toBeInTheDocument();
    expect(screen.getByDisplayValue('120')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByDisplayValue('Starter')).not.toBeInTheDocument();
  });

  it('enregistre les modifications et rafraichit', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    render(<PlansConfig plans={PLANS} />);
    const starterCard = screen.getByText('Starter').closest('div')!.parentElement!.parentElement!;
    fireEvent.click(within(starterCard).getByRole('button', { name: /Modifier/ }));

    fireEvent.change(screen.getByDisplayValue('150'), { target: { value: '175' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/plans/plan-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            name: 'Starter',
            description: 'Pour les petits cabinets.',
            monthlyPrice: 175,
            yearlyPrice: 120,
            badge: null,
            highlighted: false,
            sortOrder: 1,
            features: ['Feature A', 'Feature B'],
          }),
        }),
      ),
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("affiche un message d'erreur si la requete echoue", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    render(<PlansConfig plans={PLANS} />);
    const starterCard = screen.getByText('Starter').closest('div')!.parentElement!.parentElement!;
    fireEvent.click(within(starterCard).getByRole('button', { name: /Modifier/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Une erreur est survenue. Réessayez.')).toBeInTheDocument();
  });
});

describe('PlansConfig - creation', () => {
  it('ouvre et ferme le formulaire de creation', () => {
    render(<PlansConfig plans={PLANS} />);

    fireEvent.click(screen.getByRole('button', { name: /Nouveau plan/ }));
    expect(screen.getByPlaceholderText('ex : premium')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByPlaceholderText('ex : premium')).not.toBeInTheDocument();
  });

  it('cree un plan avec les champs saisis et rafraichit', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    render(<PlansConfig plans={PLANS} />);
    fireEvent.click(screen.getByRole('button', { name: /Nouveau plan/ }));

    fireEvent.change(screen.getByPlaceholderText('ex : premium'), { target: { value: 'premium' } });
    fireEvent.change(screen.getByRole('textbox', { name: /Fonctionnalités/ }), {
      target: { value: 'Feature X' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le plan' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/plans',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            planId: 'premium',
            name: '',
            description: '',
            monthlyPrice: null,
            yearlyPrice: null,
            badge: null,
            highlighted: false,
            sortOrder: 0,
            features: ['Feature X'],
          }),
        }),
      ),
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("affiche un message d'erreur si la creation echoue", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    render(<PlansConfig plans={PLANS} />);
    fireEvent.click(screen.getByRole('button', { name: /Nouveau plan/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Créer le plan' }));

    expect(
      await screen.findByText(/Vérifiez que l’identifiant est unique/),
    ).toBeInTheDocument();
  });
});

describe('PlansConfig - archivage et restauration', () => {
  it('demande confirmation avant d archiver, puis appelle DELETE et rafraichit', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    render(<PlansConfig plans={PLANS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Archiver Starter' }));

    expect(screen.getByText('Archiver ce plan ?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Archiver' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/plans/plan-1', { method: 'DELETE' }));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(screen.queryByText('Archiver ce plan ?')).not.toBeInTheDocument();
  });

  it('affiche le badge Archivé et masque Modifier/Archiver pour un plan archive', () => {
    render(<PlansConfig plans={[ARCHIVED_PLAN]} />);

    expect(screen.getByText('Archivé')).toBeInTheDocument();
    expect(screen.getByText('Retiré de Stripe et de /tarifs')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Modifier/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restaurer' })).toBeInTheDocument();
  });

  it('restaure un plan archive sans demander de confirmation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    render(<PlansConfig plans={[ARCHIVED_PLAN]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Restaurer' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/plans/plan-3', { method: 'PUT' }));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });
});
