import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { PlansConfig } from '@/components/admin/plans-config';
import type { PlanConfigRow } from '@/lib/admin/admin-data';

// Compléments au test de la configuration des plans (console SuperAdmin) : libellés et réglages des
// champs, conversions des quotas (D15), cases, erreurs d'action, envois en cours.
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }));

const plan = (surcharge: Partial<PlanConfigRow> = {}): PlanConfigRow => ({
  id: 'plan-1',
  planId: 'starter',
  name: 'Starter',
  description: 'Pour les petits cabinets.',
  monthlyPrice: 150,
  yearlyPrice: 120,
  highlighted: false,
  badge: null,
  features: ['Feature A', 'Feature B'],
  sortOrder: 1,
  maxEntreprises: null,
  maxUtilisateurs: null,
  maxStorageMb: null,
  archivedAt: null,
  stripe: {
    productId: 'prod_1',
    monthlyPriceId: 'price_m1',
    monthlyPriceAmount: 150,
    yearlyPriceId: 'price_y1',
    yearlyPriceAmount: 120,
  },
  inSync: true,
  ...surcharge,
});

const reponse = (ok: boolean) => ({ ok, status: ok ? 200 : 500, json: async () => ({}) });

const ouvrirEdition = () => {
  fireEvent.click(screen.getByRole('button', { name: /Modifier/ }));
};

beforeEach(() => {
  refreshMock.mockReset();
  vi.unstubAllGlobals();
});

describe('PlansConfig : résumé d’un plan', () => {
  it('montre le tarif annuel et son équivalent mensuel, ou un tiret sans prix annuel', () => {
    const { unmount } = render(<PlansConfig plans={[plan()]} />);
    expect(screen.getByText(/1\s?440\s?€ \/ an \(soit 120\s?€ \/ mois\)/)).toBeInTheDocument();
    unmount();

    render(<PlansConfig plans={[plan({ yearlyPrice: null })]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('accorde les quotas au singulier et au pluriel, et convertit le stockage en Go', () => {
    const { unmount } = render(
      <PlansConfig plans={[plan({ maxEntreprises: 1, maxUtilisateurs: 5, maxStorageMb: 5120 })]} />,
    );
    expect(screen.getByText(/1 entreprise · 5 gestionnaires · 5 Go de stockage/)).toBeInTheDocument();
    unmount();

    render(<PlansConfig plans={[plan({ maxEntreprises: 25 })]} />);
    expect(screen.getByText(/25 entreprises · Gestionnaires illimités · Stockage illimité/)).toBeInTheDocument();
  });

  it('affiche l’identifiant du plan et son badge, sauf s’il est archivé', () => {
    const { unmount } = render(<PlansConfig plans={[plan({ badge: 'Le plus choisi' })]} />);
    expect(screen.getByText('starter')).toBeInTheDocument();
    expect(screen.getByText('Le plus choisi')).toBeInTheDocument();
    unmount();

    render(<PlansConfig plans={[plan({ badge: 'Le plus choisi', archivedAt: '2026-01-01T00:00:00.000Z' })]} />);
    expect(screen.queryByText('Le plus choisi')).not.toBeInTheDocument();
  });

  it('un plan archivé n’a ni « Modifier » ni « Archiver »', () => {
    render(<PlansConfig plans={[plan({ archivedAt: '2026-01-01T00:00:00.000Z' })]} />);

    expect(screen.queryByRole('button', { name: /Modifier/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archiver Starter' })).not.toBeInTheDocument();
  });
});

describe('PlansConfig : champs du formulaire', () => {
  it('chaque champ du formulaire d’édition a son libellé, sans l’identifiant', () => {
    render(<PlansConfig plans={[plan()]} />);
    ouvrirEdition();

    for (const libelle of [
      'Nom',
      'Badge',
      'Description',
      'Prix mensuel (EUR)',
      'Prix mensuel en facturation annuelle (EUR)',
      "Ordre d'affichage",
      'Entreprises clientes (max)',
      'Gestionnaires RH (max)',
      'Stockage (Go)',
      'Fonctionnalités (une par ligne)',
    ]) {
      expect(screen.getByLabelText(libelle)).toBeInTheDocument();
    }
    expect(screen.getByRole('checkbox', { name: 'Plan mis en avant sur la page tarifs' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Identifiant/)).not.toBeInTheDocument();
  });

  it('les champs numériques refusent les valeurs négatives et le prix propose « Sur devis »', () => {
    render(<PlansConfig plans={[plan()]} />);
    ouvrirEdition();

    const mensuel = screen.getByLabelText('Prix mensuel (EUR)');
    expect(mensuel).toHaveAttribute('type', 'number');
    expect(mensuel).toHaveAttribute('min', '0');
    expect(mensuel).toHaveAttribute('placeholder', 'Sur devis');
    expect(screen.getByLabelText('Entreprises clientes (max)')).toHaveAttribute('placeholder', 'Illimité');
    expect(screen.getByLabelText("Ordre d'affichage")).toHaveAttribute('type', 'number');
  });

  it('préremplit les quotas et convertit le stockage de Mo en Go', () => {
    render(<PlansConfig plans={[plan({ maxEntreprises: 25, maxUtilisateurs: 3, maxStorageMb: 5120 })]} />);
    ouvrirEdition();

    expect(screen.getByLabelText('Entreprises clientes (max)')).toHaveValue(25);
    expect(screen.getByLabelText('Gestionnaires RH (max)')).toHaveValue(3);
    expect(screen.getByLabelText('Stockage (Go)')).toHaveValue(5);
  });

  it('enregistre le stockage saisi en Go sous forme de Mo, et les fonctionnalités ligne par ligne', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reponse(true));
    vi.stubGlobal('fetch', fetchMock);
    render(<PlansConfig plans={[plan()]} />);
    ouvrirEdition();

    fireEvent.change(screen.getByLabelText('Stockage (Go)'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Entreprises clientes (max)'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Fonctionnalités (une par ligne)'), {
      target: { value: 'Un\nDeux\nTrois' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const corps = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(corps).toMatchObject({
      maxStorageMb: 2048,
      maxEntreprises: 10,
      features: ['Un', 'Deux', 'Trois'],
    });
  });

  it('la case « mis en avant » est enregistrée', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reponse(true));
    vi.stubGlobal('fetch', fetchMock);
    render(<PlansConfig plans={[plan()]} />);
    ouvrirEdition();
    const case_ = screen.getByRole('checkbox', { name: 'Plan mis en avant sur la page tarifs' });
    expect(case_).not.toBeChecked();

    fireEvent.click(case_);
    expect(case_).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).highlighted).toBe(true);
  });

  it('un plan déjà mis en avant a sa case cochée', () => {
    render(<PlansConfig plans={[plan({ highlighted: true })]} />);
    ouvrirEdition();

    expect(screen.getByRole('checkbox', { name: 'Plan mis en avant sur la page tarifs' })).toBeChecked();
  });

  it('rappelle qu’un changement de prix crée un nouveau Price Stripe', () => {
    render(<PlansConfig plans={[plan()]} />);
    ouvrirEdition();

    expect(screen.getByText(/crée un nouveau Price Stripe/)).toBeInTheDocument();
  });

  it('en édition, le résumé et les boutons du plan sont masqués', () => {
    render(<PlansConfig plans={[plan()]} />);
    ouvrirEdition();

    expect(screen.queryByText('Synchronisé avec Stripe')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archiver Starter' })).not.toBeInTheDocument();
  });
});

describe('PlansConfig : création', () => {
  it('le formulaire de création a l’identifiant, un ordre à 0 et une case décochée', () => {
    render(<PlansConfig plans={[plan()]} />);

    fireEvent.click(screen.getByRole('button', { name: /Nouveau plan/ }));

    expect(screen.getByLabelText('Identifiant (planId)')).toHaveValue('');
    expect(screen.getByLabelText("Ordre d'affichage")).toHaveValue(0);
    expect(screen.getByRole('checkbox', { name: 'Plan mis en avant sur la page tarifs' })).not.toBeChecked();
    expect(screen.queryByRole('button', { name: /Nouveau plan/ })).not.toBeInTheDocument();
  });

  it('annuler la création la ferme et rend le bouton « Nouveau plan »', () => {
    render(<PlansConfig plans={[plan()]} />);
    fireEvent.click(screen.getByRole('button', { name: /Nouveau plan/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.getByRole('button', { name: /Nouveau plan/ })).toBeInTheDocument();
  });

  it('désactive les boutons pendant l’envoi', async () => {
    let finir: (valeur: unknown) => void = () => {};
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise((resolve) => (finir = resolve))));
    render(<PlansConfig plans={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /Nouveau plan/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Créer le plan' }));

    expect(screen.getByRole('button', { name: 'Créer le plan' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
    finir(reponse(true));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });
});

describe('PlansConfig : enregistrement et actions', () => {
  it('désactive les boutons pendant l’enregistrement', async () => {
    let finir: (valeur: unknown) => void = () => {};
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise((resolve) => (finir = resolve))));
    render(<PlansConfig plans={[plan()]} />);
    ouvrirEdition();

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
    finir(reponse(true));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('un archivage refusé affiche l’erreur et ferme la confirmation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reponse(false)));
    render(<PlansConfig plans={[plan()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Archiver Starter' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Archiver' }));

    expect(await screen.findByText('Une erreur est survenue. Réessayez.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Archiver ce plan ?')).not.toBeInTheDocument());
  });

  it('une restauration refusée affiche l’erreur', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reponse(false)));
    render(<PlansConfig plans={[plan({ archivedAt: '2026-01-01T00:00:00.000Z' })]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Restaurer' }));

    expect(await screen.findByText('Une erreur est survenue. Réessayez.')).toBeInTheDocument();
  });

  it('annuler la confirmation d’archivage n’envoie rien', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<PlansConfig plans={[plan()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Archiver Starter' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Annuler' }));

    await waitFor(() => expect(screen.queryByText('Archiver ce plan ?')).not.toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('plusieurs plans : chaque carte a ses propres boutons', () => {
    render(<PlansConfig plans={[plan(), plan({ id: 'plan-2', planId: 'pro', name: 'Pro' })]} />);

    expect(screen.getAllByRole('button', { name: /Modifier/ })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Archiver Pro' })).toBeInTheDocument();
    const carte = screen.getByText('Pro').closest('div')!.parentElement!.parentElement!;
    expect(within(carte).getAllByRole('button')).toHaveLength(2);
  });
});
