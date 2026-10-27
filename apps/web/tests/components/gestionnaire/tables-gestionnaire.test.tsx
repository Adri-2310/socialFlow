import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ConditionsTable } from '@/components/gestionnaire/conditions-table';
import { PeriodesTable } from '@/components/gestionnaire/periodes-table';
import { PrestationsTable } from '@/components/gestionnaire/prestations-table';
import { SalariesTable } from '@/components/gestionnaire/salaries-table';
import type { PeriodeRow } from '@/lib/periode/periode-data';
import type { SalariePrestationRow } from '@/lib/periode/prestation-data';
import type { ConditionRow, SalarieRow } from '@/lib/salarie/salarie-data';

// Les quatre tableaux du gestionnaire : périodes d'une entreprise (D90), salariés (roles/03 § 4.1),
// prestations d'une période (D92) et historique des conditions de travail (roles/03 § 4.2).
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const jour = (iso: string) => new Date(`${iso}T00:00:00Z`);
const lignes = () => screen.getAllByRole('row');
const cellules = (row: HTMLElement) => within(row).getAllByRole('cell');

describe('PeriodesTable', () => {
  const periodes: PeriodeRow[] = [
    {
      id: 'p2',
      annee: 2026,
      mois: 10,
      statut: 'OUVERTE',
      dateLimite: '2026-10-10',
      verrouilleeLe: null,
    },
    {
      id: 'p1',
      annee: 2026,
      mois: 9,
      statut: 'VERROUILLEE',
      dateLimite: '2026-09-10',
      verrouilleeLe: '2026-09-12',
    },
  ];
  const rendre = (readOnly = false) =>
    render(<PeriodesTable periodes={periodes} readOnly={readOnly} />);

  it('nomme ses colonnes', () => {
    rendre();

    for (const nom of ['Période', 'Date limite', 'Prestations', 'Actions']) {
      expect(screen.getByRole('columnheader', { name: nom })).toBeInTheDocument();
    }
  });

  it('une ligne par période : mois, date limite et état', () => {
    rendre();

    expect(lignes()).toHaveLength(3);
    const ouverte = cellules(lignes()[1]);
    expect(within(ouverte[0]).getByRole('link', { name: /octobre 2026/i })).toHaveAttribute(
      'href',
      '/dashboard/gestionnaire/periodes/p2',
    );
    expect(ouverte[1]).toHaveTextContent('10/10/2026');
    expect(ouverte[2]).toHaveTextContent('Ouvertes');
    expect(cellules(lignes()[2])[2]).toHaveTextContent('Verrouillées');
  });

  it('propose les actions de chaque état', () => {
    rendre();

    const ouverte = within(lignes()[1]);
    expect(ouverte.getByRole('link', { name: 'Prestations' })).toHaveAttribute(
      'href',
      '/dashboard/gestionnaire/periodes/p2',
    );
    expect(ouverte.getByRole('button', { name: /Décaler la date/ })).toBeInTheDocument();
    expect(ouverte.getByRole('button', { name: /^Verrouiller$/ })).toBeInTheDocument();

    const verrouillee = within(lignes()[2]);
    expect(verrouillee.queryByRole('button', { name: /Décaler la date/ })).not.toBeInTheDocument();
    expect(verrouillee.getByRole('button', { name: /Déverrouiller/ })).toBeInTheDocument();
  });

  it('désactive les actions quand le cabinet est en lecture seule', () => {
    rendre(true);

    expect(within(lignes()[1]).getByRole('button', { name: /Décaler la date/ })).toBeDisabled();
    expect(within(lignes()[1]).getByRole('button', { name: /^Verrouiller$/ })).toBeDisabled();
  });
});

describe('SalariesTable', () => {
  const at = new Date('2026-10-15T10:00:00Z');
  const salaries: SalarieRow[] = [
    {
      id: 's1',
      nom: 'Dupont',
      prenom: 'Marie',
      nissMasque: '85.07.**-***.**',
      fonction: 'Comptable',
      statut: 'EMPLOYE',
      dateEntree: jour('2024-01-15'),
      dateSortie: null,
    },
    {
      id: 's2',
      nom: 'Martin',
      prenom: 'Jean',
      nissMasque: '90.01.**-***.**',
      fonction: null,
      statut: null,
      dateEntree: jour('2026-12-01'),
      dateSortie: null,
    },
  ];
  const rendre = (archives = false) =>
    render(<SalariesTable salaries={salaries} archives={archives} readOnly={false} at={at} />);

  it('nomme ses colonnes', () => {
    rendre();

    for (const nom of ['Salarié', 'NISS', 'Fonction', 'Statut', 'Entrée', 'Situation', 'Actions']) {
      expect(screen.getByRole('columnheader', { name: nom })).toBeInTheDocument();
    }
  });

  it('une ligne par salarié, avec le NISS masqué et la situation', () => {
    rendre();

    expect(lignes()).toHaveLength(3);
    const marie = cellules(lignes()[1]);
    expect(within(marie[0]).getByRole('link', { name: 'Marie Dupont' })).toHaveAttribute(
      'href',
      '/dashboard/gestionnaire/salaries/s1',
    );
    expect(marie[1]).toHaveTextContent('85.07.**-***.**');
    expect(marie[2]).toHaveTextContent('Comptable');
    expect(marie[3]).toHaveTextContent('Employé');
    expect(marie[4]).toHaveTextContent('15/01/2024');
    expect(marie[5]).toHaveTextContent('En poste');
    expect(cellules(lignes()[2])[5]).toHaveTextContent('Entre le 01/12/2026');
  });

  it('remplace une fonction ou un statut absents par un tiret', () => {
    rendre();

    const jean = cellules(lignes()[2]);
    expect(jean[2]).toHaveTextContent('—');
    expect(jean[3]).toHaveTextContent('—');
  });

  it('propose « Voir » avec le nom du salarié, et « Restaurer » seulement aux archivés', () => {
    const { unmount } = rendre();
    expect(
      screen.getByRole('link', { name: 'Voir le dossier de Marie Dupont' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Restaurer/ })).not.toBeInTheDocument();
    unmount();

    rendre(true);
    expect(
      screen.getByRole('button', { name: 'Restaurer le dossier de Marie Dupont' }),
    ).toBeInTheDocument();
  });
});

describe('PrestationsTable', () => {
  const prestation = {
    heuresPresteesMinutes: null,
    congeDemiJours: 3,
    maladieDemiJours: 0,
    ferieDemiJours: 0,
    absenceNonRemDemiJours: 0,
    heuresSupMinutes: 90,
    primeCents: null,
    primeLibelle: null,
    modifiePar: { name: 'Bruno Mertens', role: 'GESTIONNAIRE_RH' },
    modifieLe: '2026-10-12T09:00:00.000Z',
  };
  const salaries: SalariePrestationRow[] = [
    { id: 's1', nom: 'Dupont', prenom: 'Marie', prestation },
    { id: 's2', nom: 'Martin', prenom: 'Jean', prestation: null },
    { id: 's3', nom: 'Leroy', prenom: 'Zoé', prestation: { ...prestation, modifiePar: null } },
  ];
  const periode = { id: 'p1', annee: 2026, mois: 10 };
  const rendre = (bloque: string | null = null) =>
    render(<PrestationsTable salaries={salaries} periode={periode} bloque={bloque} />);

  it('nomme ses colonnes', () => {
    rendre();

    for (const nom of ['Salarié', 'Écarts du mois', 'Dernière saisie', 'Actions']) {
      expect(screen.getByRole('columnheader', { name: nom })).toBeInTheDocument();
    }
  });

  it('résume les écarts, ou annonce un mois complet', () => {
    rendre();

    const marie = cellules(lignes()[1]);
    expect(marie[0]).toHaveTextContent('Marie Dupont');
    expect(
      within(marie[1])
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Congé 1,5 j', 'Heures sup. 1:30']);
    expect(cellules(lignes()[2])[1]).toHaveTextContent('Mois complet');
  });

  it('indique qui a encodé en dernier, un compte supprimé ou rien', () => {
    rendre();

    expect(cellules(lignes()[1])[2]).toHaveTextContent('Bruno Mertens (gestionnaire)');
    expect(cellules(lignes()[2])[2]).toHaveTextContent('—');
    expect(cellules(lignes()[3])[2]).toHaveTextContent('Compte supprimé');
  });

  it('propose l’encodage de chaque salarié, désactivé avec la raison quand c’est bloqué', () => {
    const { unmount } = rendre();
    expect(
      screen.getByRole('button', { name: 'Encoder les prestations de Marie Dupont' }),
    ).toBeEnabled();
    unmount();

    rendre('Les prestations sont verrouillées.');
    const bouton = screen.getByRole('button', { name: 'Encoder les prestations de Marie Dupont' });
    expect(bouton).toBeDisabled();
    expect(bouton).toHaveAttribute('title', 'Les prestations sont verrouillées.');
  });
});

describe('ConditionsTable', () => {
  const base = {
    commissionParitaire: '200',
    heuresSemaineMinutes: null,
    heuresReferenceMinutes: null,
    salaireHoraireBrutCents: null,
  };
  const conditions: ConditionRow[] = [
    {
      ...base,
      id: 'c3',
      dateEffet: jour('2027-01-01'),
      statut: 'EMPLOYE',
      fonction: 'Responsable',
      regime: 'TEMPS_PLEIN',
      salaireMensuelBrutCents: 320000,
      etat: 'A_VENIR',
    },
    {
      ...base,
      id: 'c2',
      dateEffet: jour('2025-01-01'),
      statut: 'EMPLOYE',
      fonction: 'Comptable',
      regime: 'TEMPS_PARTIEL',
      heuresSemaineMinutes: 1824,
      heuresReferenceMinutes: 2280,
      salaireMensuelBrutCents: 285000,
      etat: 'EN_VIGUEUR',
    },
    {
      ...base,
      id: 'c1',
      dateEffet: jour('2024-01-15'),
      statut: 'OUVRIER',
      fonction: 'Aide',
      regime: 'TEMPS_PLEIN',
      salaireMensuelBrutCents: null,
      salaireHoraireBrutCents: 1725,
      etat: 'PASSEE',
    },
  ];
  const rendre = (archive = false) =>
    render(
      <ConditionsTable
        conditions={conditions}
        salarieId="s1"
        dateEntree={jour('2024-01-15')}
        archive={archive}
        readOnly={false}
      />,
    );

  it('nomme ses colonnes', () => {
    rendre();

    for (const nom of [
      'Dès le',
      'Statut',
      'Fonction',
      'Régime',
      'Rémunération',
      'État',
      'Actions',
    ]) {
      expect(screen.getByRole('columnheader', { name: nom })).toBeInTheDocument();
    }
  });

  it('détaille chaque ligne : date, statut, fonction, régime, rémunération et état', () => {
    rendre();

    expect(lignes()).toHaveLength(4);
    const aVenir = cellules(lignes()[1]);
    expect(aVenir[0]).toHaveTextContent('01/01/2027');
    expect(aVenir[1]).toHaveTextContent('Employé');
    expect(aVenir[2]).toHaveTextContent('Responsable');
    expect(aVenir[3]).toHaveTextContent('Temps plein');
    expect(aVenir[4]).toHaveTextContent('brut par mois');
    expect(aVenir[5]).toHaveTextContent('À venir');

    const partiel = cellules(lignes()[2]);
    expect(partiel[3]).toHaveTextContent('Temps partiel (30 h 24 sur 38 h)');
    expect(partiel[5]).toHaveTextContent('En vigueur');

    const horaire = cellules(lignes()[3]);
    expect(horaire[1]).toHaveTextContent('Ouvrier');
    expect(horaire[4]).toHaveTextContent('brut par heure');
    expect(horaire[5]).toHaveTextContent('Passée');
  });

  it('chaque ligne se corrige ; seul un changement à venir s’annule', () => {
    rendre();

    expect(screen.getAllByRole('button', { name: 'Corriger cette condition' })).toHaveLength(3);
    const annuler = screen.getAllByRole('button', { name: 'Annuler ce changement à venir' });
    expect(annuler).toHaveLength(1);
    expect(lignes()[1]).toContainElement(annuler[0]);
  });

  it('un dossier archivé n’a plus d’actions', () => {
    rendre(true);

    expect(
      screen.queryByRole('button', { name: 'Corriger cette condition' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Annuler/ })).not.toBeInTheDocument();
  });
});
