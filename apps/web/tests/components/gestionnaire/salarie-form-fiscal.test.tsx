import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SalarieFormDialog } from '@/components/gestionnaire/salarie-form-dialog';

// Situation fiscale du formulaire (D95) : une question n'apparaît que si elle est utile, et ce qui
// n'a plus d'objet n'est jamais envoyé au serveur.

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn();

beforeEach(() => {
  refresh.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

const rendre = () =>
  render(
    <SalarieFormDialog
      target={{ mode: 'create', entrepriseId: 'e1' }}
      countries={[{ code: 'BE', name: 'Belgique' }]}
      onClose={() => {}}
    />,
  );

const champ = (nom: RegExp | string) => screen.queryByLabelText(nom);

describe('formulaire du dossier : situation fiscale', () => {
  it('un isolé sans charge ne voit que les questions de base', () => {
    rendre();
    expect(champ('Situation familiale')).toBeInTheDocument();
    expect(champ('Le salarié est handicapé')).toBeInTheDocument();
    expect(champ('Enfants à charge')).toBeInTheDocument();
    expect(champ(/Revenus professionnels du conjoint/)).not.toBeInTheDocument();
    expect(champ('dont enfants handicapés')).not.toBeInTheDocument();
    expect(champ(/Parent isolé/)).not.toBeInTheDocument();
    expect(champ(/Qui reçoit les réductions/)).not.toBeInTheDocument();
    expect(champ('Personnes dépendantes de 66 ans ou plus')).not.toBeInTheDocument();
  });

  it('marié : la question sur les revenus du conjoint apparaît avec les cinq cas', async () => {
    const user = userEvent.setup();
    rendre();
    await user.selectOptions(screen.getByLabelText('Situation familiale'), 'MARIE_OU_COHABITANT_LEGAL');

    const revenus = screen.getByLabelText(/Revenus professionnels du conjoint/);
    // « Choisir… » plus les cinq cas de l'Annexe III.
    expect(revenus.querySelectorAll('option')).toHaveLength(6);
  });

  it('le handicap du conjoint n’est demandé que s’il n’a pas de revenus propres', async () => {
    const user = userEvent.setup();
    rendre();
    await user.selectOptions(screen.getByLabelText('Situation familiale'), 'MARIE_OU_COHABITANT_LEGAL');
    const revenus = screen.getByLabelText(/Revenus professionnels du conjoint/);

    await user.selectOptions(revenus, 'SANS_REVENUS');
    expect(champ('Le conjoint ou cohabitant est handicapé')).toBeInTheDocument();
    await user.selectOptions(revenus, 'PENSION_TRES_LIMITEE');
    expect(champ('Le conjoint ou cohabitant est handicapé')).toBeInTheDocument();
    await user.selectOptions(revenus, 'REVENUS');
    expect(champ('Le conjoint ou cohabitant est handicapé')).not.toBeInTheDocument();
  });

  it('les enfants handicapés et le parent isolé n’apparaissent qu’avec des enfants à charge', async () => {
    const user = userEvent.setup();
    rendre();
    const enfants = screen.getByLabelText('Enfants à charge');

    await user.clear(enfants);
    await user.type(enfants, '2');
    expect(champ('dont enfants handicapés')).toBeInTheDocument();
    expect(champ(/Parent isolé/)).toBeInTheDocument();

    // Un marié n'est plus un parent isolé (n° 40.1).
    await user.selectOptions(screen.getByLabelText('Situation familiale'), 'MARIE_OU_COHABITANT_LEGAL');
    expect(champ(/Parent isolé/)).not.toBeInTheDocument();
    expect(champ('dont enfants handicapés')).toBeInTheDocument();
  });

  it('l’attribution des charges n’est demandée que pour un couple qui travaille avec des charges (n° 6)', async () => {
    const user = userEvent.setup();
    rendre();
    await user.selectOptions(screen.getByLabelText('Situation familiale'), 'MARIE_OU_COHABITANT_LEGAL');
    const revenus = screen.getByLabelText(/Revenus professionnels du conjoint/);
    const enfants = screen.getByLabelText('Enfants à charge');

    // Conjoint avec revenus mais aucune charge : rien à attribuer.
    await user.selectOptions(revenus, 'REVENUS');
    expect(champ(/Qui reçoit les réductions/)).not.toBeInTheDocument();

    await user.clear(enfants);
    await user.type(enfants, '1');
    expect(champ(/Qui reçoit les réductions/)).toBeInTheDocument();

    // Conjoint sans revenus propres : plus de question.
    await user.selectOptions(revenus, 'SANS_REVENUS');
    expect(champ(/Qui reçoit les réductions/)).not.toBeInTheDocument();
  });

  it('les autres personnes à charge ouvrent trois compteurs', async () => {
    const user = userEvent.setup();
    rendre();
    await user.click(screen.getByLabelText(/d’autres personnes à charge/));

    expect(champ('Personnes dépendantes de 66 ans ou plus')).toBeInTheDocument();
    expect(champ('Autres personnes handicapées')).toBeInTheDocument();
    expect(champ('Autres personnes à charge')).toBeInTheDocument();
  });
});
