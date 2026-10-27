import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsTabs } from '@/components/cabinet/settings-tabs';

const tabs = [
  {
    id: 'cabinet',
    label: 'Cabinet',
    content: <input aria-label="Raison sociale" defaultValue="" />,
  },
  { id: 'apparence', label: 'Apparence', content: <p>Contenu apparence</p> },
  { id: 'emails', label: 'Emails', content: <p>Contenu emails</p> },
];

beforeEach(() => window.history.replaceState(null, '', '/dashboard/cabinet/parametres'));

describe('SettingsTabs', () => {
  it('affiche le premier onglet par defaut, avec les roles ARIA', () => {
    render(<SettingsTabs tabs={tabs} initialTab="cabinet" />);

    expect(screen.getByRole('tablist', { name: 'Sections des paramètres' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByRole('tab', { name: 'Cabinet' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Apparence' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Cabinet');
    expect(screen.queryByText('Contenu apparence')).not.toBeVisible();
  });

  it('ouvre l onglet demande et retombe sur le premier si l identifiant est inconnu', () => {
    const { unmount } = render(<SettingsTabs tabs={tabs} initialTab="emails" />);
    expect(screen.getByRole('tab', { name: 'Emails' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Contenu emails')).toBeVisible();
    unmount();

    render(<SettingsTabs tabs={tabs} initialTab="inconnu" />);
    expect(screen.getByRole('tab', { name: 'Cabinet' })).toHaveAttribute('aria-selected', 'true');
  });

  it('change d onglet au clic et garde l onglet dans l adresse', () => {
    render(<SettingsTabs tabs={tabs} initialTab="cabinet" />);

    fireEvent.click(screen.getByRole('tab', { name: 'Apparence' }));

    expect(screen.getByRole('tab', { name: 'Apparence' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Contenu apparence')).toBeVisible();
    expect(window.location.search).toBe('?onglet=apparence');
  });

  it('conserve une saisie non enregistree quand on change d onglet puis qu on revient', () => {
    render(<SettingsTabs tabs={tabs} initialTab="cabinet" />);
    fireEvent.change(screen.getByLabelText('Raison sociale'), {
      target: { value: 'Cabinet Dupont' },
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Emails' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Cabinet' }));

    expect(screen.getByLabelText('Raison sociale')).toHaveValue('Cabinet Dupont');
  });

  it('se navigue au clavier : fleches, Debut et Fin, en boucle', async () => {
    const user = userEvent.setup();
    render(<SettingsTabs tabs={tabs} initialTab="cabinet" />);
    const tab = (name: string) => screen.getByRole('tab', { name });

    // Le focus est d'abord posé sur l'onglet actif, comme au clavier (Tab) : les onglets shadcn
    // réagissent aux touches de l'onglet qui a le focus.
    act(() => tab('Cabinet').focus());

    await user.keyboard('{ArrowRight}');
    expect(tab('Apparence')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Apparence')).toHaveFocus();

    await user.keyboard('{End}');
    expect(tab('Emails')).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowRight}');
    expect(tab('Cabinet')).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowLeft}');
    expect(tab('Emails')).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Home}');
    expect(tab('Cabinet')).toHaveAttribute('aria-selected', 'true');
  });

  it('seul l onglet actif est dans l ordre de tabulation', () => {
    render(<SettingsTabs tabs={tabs} initialTab="cabinet" />);

    expect(screen.getByRole('tab', { name: 'Cabinet' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Apparence' })).toHaveAttribute('tabindex', '-1');
  });
});
