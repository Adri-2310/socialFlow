import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SalarieCreate } from '@/components/gestionnaire/salarie-create';
import { SalarieEdit } from '@/components/gestionnaire/salarie-edit';
import { SalarieFormDialog } from '@/components/gestionnaire/salarie-form-dialog';
import { INITIAL } from '@/lib/salarie/salarie-form';

// Boutons « Nouveau salarié » et « Modifier » : ils ouvrent le formulaire du dossier, sauf si le
// cabinet est en lecture seule. Le dernier test vérifie le rattachement des erreurs aux champs.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const PAYS = [{ code: 'BE', name: 'Belgique' }];

describe('SalarieCreate', () => {
  it('ouvre le formulaire de création, que « Annuler » referme', async () => {
    const user = userEvent.setup();
    render(<SalarieCreate entrepriseId="e1" countries={PAYS} readOnly={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Nouveau salarié' }));
    expect(screen.getByRole('dialog', { name: 'Nouveau salarié' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('est désactivé en lecture seule, avec la raison en infobulle', () => {
    render(<SalarieCreate entrepriseId="e1" countries={PAYS} readOnly />);

    const bouton = screen.getByRole('button', { name: 'Nouveau salarié' });
    expect(bouton).toBeDisabled();
    expect(bouton).toHaveAttribute('title', 'Votre cabinet est en lecture seule.');
  });
});

describe('SalarieEdit', () => {
  const rendre = (readOnly = false) =>
    render(
      <SalarieEdit
        salarieId="s1"
        initial={{ ...INITIAL, prenom: 'Marie', nom: 'Dupont' }}
        nissMasque="••.••.••-•••.28"
        ibanMasque="BE•• •••• •••• 7034"
        countries={PAYS}
        readOnly={readOnly}
      />,
    );

  it('ouvre le formulaire de modification prérempli', async () => {
    const user = userEvent.setup();
    rendre();

    await user.click(screen.getByRole('button', { name: 'Modifier' }));

    expect(screen.getByRole('dialog', { name: 'Modifier le dossier' })).toBeInTheDocument();
    expect(screen.getByLabelText('Prénom')).toHaveValue('Marie');
  });

  it('est désactivé en lecture seule, avec la raison en infobulle', () => {
    rendre(true);

    const bouton = screen.getByRole('button', { name: 'Modifier' });
    expect(bouton).toBeDisabled();
    expect(bouton).toHaveAttribute('title', 'Votre cabinet est en lecture seule.');
  });
});

describe('SalarieFormDialog : accessibilité des erreurs', () => {
  it('relie chaque erreur à son champ et le signale invalide', async () => {
    const user = userEvent.setup();
    render(
      <SalarieFormDialog
        target={{ mode: 'create', entrepriseId: 'e1' }}
        countries={PAYS}
        onClose={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Créer le dossier' }));

    const prenom = await screen.findByLabelText('Prénom');
    expect(prenom).toBeInvalid();
    const erreur = screen.getByText('Le prénom est obligatoire.');
    expect(prenom).toHaveAttribute('aria-describedby', erreur.id);
    // Un champ sans erreur ne se déclare pas invalide.
    expect(screen.getByLabelText('Email (facultatif)')).not.toBeInvalid();
  });
});
