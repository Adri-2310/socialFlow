import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TwoFactorSetup } from '@/components/auth/two-factor-setup';
import { LinkedAccounts } from '@/components/auth/linked-accounts';

// Sécurité du compte, sur la page « Mon profil » : double authentification et comptes liés.
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const enable = vi.fn();
const disable = vi.fn();
const verifyTotp = vi.fn();
const listAccounts = vi.fn();
const linkSocial = vi.fn();
const unlinkAccount = vi.fn();

vi.mock('@/lib/auth/auth-client', () => ({
  twoFactor: {
    enable: (...a: unknown[]) => enable(...a),
    disable: (...a: unknown[]) => disable(...a),
    verifyTotp: (...a: unknown[]) => verifyTotp(...a),
  },
  authClient: {
    listAccounts: (...a: unknown[]) => listAccounts(...a),
    linkSocial: (...a: unknown[]) => linkSocial(...a),
    unlinkAccount: (...a: unknown[]) => unlinkAccount(...a),
  },
}));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QR') } }));

beforeEach(() => {
  [refresh, enable, disable, verifyTotp, listAccounts, linkSocial, unlinkAccount].forEach((m) =>
    m.mockReset(),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('TwoFactorSetup', () => {
  it('désactivée : propose « Activer »', () => {
    render(<TwoFactorSetup enabled={false} />);

    expect(screen.getByText('Non activée.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activer' })).toBeEnabled();
  });

  it('activée : l’annonce et propose « Désactiver »', () => {
    render(<TwoFactorSetup enabled />);

    expect(screen.getByText('Activée sur votre compte.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Désactiver' })).toBeEnabled();
  });

  it('« Activer » demande d’abord le mot de passe, « Annuler » revient à l’état initial', async () => {
    render(<TwoFactorSetup enabled={false} />);

    await userEvent.click(screen.getByRole('button', { name: 'Activer' }));
    expect(screen.getByLabelText('Confirmez votre mot de passe')).toHaveAttribute(
      'type',
      'password',
    );
    expect(screen.getByLabelText('Confirmez votre mot de passe')).toBeRequired();

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.getByRole('button', { name: 'Activer' })).toBeInTheDocument();
  });

  it('active : mot de passe, puis QR code, codes de secours et code à 6 chiffres', async () => {
    enable.mockResolvedValue({
      data: { method: 'totp', totpURI: 'otpauth://x', backupCodes: ['aaaa-1111', 'bbbb-2222'] },
      error: null,
    });
    verifyTotp.mockResolvedValue({ error: null });
    render(<TwoFactorSetup enabled={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Activer' }));
    await userEvent.type(screen.getByLabelText('Confirmez votre mot de passe'), 'Secret123!');

    await userEvent.click(screen.getByRole('button', { name: 'Continuer' }));

    expect(enable).toHaveBeenCalledWith({ password: 'Secret123!' });
    expect(await screen.findByAltText(/QR code d.activation/)).toHaveAttribute(
      'src',
      'data:image/png;base64,QR',
    );
    expect(screen.getByText('aaaa-1111')).toBeInTheDocument();
    expect(screen.getByText('bbbb-2222')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Code à 6 chiffres'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(verifyTotp).toHaveBeenCalledWith({ code: '123456' });
  });

  it('mot de passe refusé : explique l’erreur et reste sur l’étape', async () => {
    enable.mockResolvedValue({ data: null, error: { code: 'INVALID_PASSWORD' } });
    render(<TwoFactorSetup enabled={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Activer' }));
    await userEvent.type(screen.getByLabelText('Confirmez votre mot de passe'), 'faux');

    await userEvent.click(screen.getByRole('button', { name: 'Continuer' }));

    expect(await screen.findByText('Mot de passe incorrect.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeEnabled();
  });

  it('code à 6 chiffres refusé : explique l’erreur sans rafraîchir', async () => {
    enable.mockResolvedValue({
      data: { method: 'totp', totpURI: 'otpauth://x', backupCodes: ['aaaa-1111'] },
      error: null,
    });
    verifyTotp.mockResolvedValue({ error: { code: 'INVALID_CODE' } });
    render(<TwoFactorSetup enabled={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Activer' }));
    await userEvent.type(screen.getByLabelText('Confirmez votre mot de passe'), 'Secret123!');
    await userEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    await userEvent.type(await screen.findByLabelText('Code à 6 chiffres'), '000000');

    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }));

    expect(await screen.findByText('Code invalide. Réessayez.')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('« Copier » met les codes de secours dans le presse-papiers et annonce « Copié »', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    enable.mockResolvedValue({
      data: { method: 'totp', totpURI: 'otpauth://x', backupCodes: ['aaaa-1111', 'bbbb-2222'] },
      error: null,
    });
    render(<TwoFactorSetup enabled={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Activer' }));
    await userEvent.type(screen.getByLabelText('Confirmez votre mot de passe'), 'Secret123!');
    await userEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    await screen.findByText('aaaa-1111');
    // jsdom n'a pas de presse-papiers : on en fournit un.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await userEvent.click(screen.getByRole('button', { name: 'Copier' }));

    expect(writeText).toHaveBeenCalledWith('aaaa-1111\nbbbb-2222');
    expect(screen.getByRole('button', { name: 'Copié' })).toBeInTheDocument();
  });

  it('désactive : mot de passe, puis rafraîchit', async () => {
    disable.mockResolvedValue({ error: null });
    render(<TwoFactorSetup enabled />);
    await userEvent.click(screen.getByRole('button', { name: 'Désactiver' }));
    await userEvent.type(screen.getByLabelText('Confirmez votre mot de passe'), 'Secret123!');

    await userEvent.click(screen.getByRole('button', { name: 'Désactiver la 2FA' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(disable).toHaveBeenCalledWith({ password: 'Secret123!' });
  });

  it('désactive : mot de passe refusé, explique l’erreur', async () => {
    disable.mockResolvedValue({ error: { code: 'INVALID_PASSWORD' } });
    render(<TwoFactorSetup enabled />);
    await userEvent.click(screen.getByRole('button', { name: 'Désactiver' }));
    await userEvent.type(screen.getByLabelText('Confirmez votre mot de passe'), 'faux');

    await userEvent.click(screen.getByRole('button', { name: 'Désactiver la 2FA' }));

    expect(await screen.findByText('Mot de passe incorrect.')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('désactive le bouton pendant l’envoi', async () => {
    let finish: (value: unknown) => void = () => {};
    disable.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<TwoFactorSetup enabled />);
    await userEvent.click(screen.getByRole('button', { name: 'Désactiver' }));
    await userEvent.type(screen.getByLabelText('Confirmez votre mot de passe'), 'Secret123!');

    await userEvent.click(screen.getByRole('button', { name: 'Désactiver la 2FA' }));

    expect(screen.getByRole('button', { name: 'Désactiver la 2FA' })).toBeDisabled();
    finish({ error: null });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});

describe('LinkedAccounts', () => {
  const comptes = (...providers: string[]) =>
    listAccounts.mockResolvedValue({
      data: providers.map((providerId, i) => ({ providerId, id: `a${i}` })),
    });

  it('n’affiche rien tant que la liste n’est pas chargée', () => {
    listAccounts.mockReturnValue(new Promise(() => {}));
    const { container } = render(<LinkedAccounts />);

    expect(container).toBeEmptyDOMElement();
  });

  it('indique pour chaque fournisseur s’il est lié, avec le bouton adapté', async () => {
    comptes('credential', 'google');
    render(<LinkedAccounts />);

    expect(await screen.findByText('Lié à votre compte.')).toBeInTheDocument();
    expect(screen.getByText('Non lié.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Délier' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Lier mon compte' })).toBeEnabled();
  });

  it('« Lier mon compte » lance la liaison, de retour sur le tableau de bord', async () => {
    comptes('credential');
    linkSocial.mockResolvedValue({ error: null });
    render(<LinkedAccounts />);

    await userEvent.click((await screen.findAllByRole('button', { name: 'Lier mon compte' }))[0]);

    expect(linkSocial).toHaveBeenCalledWith({ provider: 'google', callbackURL: '/dashboard' });
  });

  it('« Délier » retire le fournisseur de la liste', async () => {
    comptes('credential', 'google');
    unlinkAccount.mockResolvedValue({ error: null });
    render(<LinkedAccounts />);

    await userEvent.click(await screen.findByRole('button', { name: 'Délier' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Délier' })).toBeNull());
    expect(unlinkAccount).toHaveBeenCalledWith({ accountId: 'a1' });
    expect(screen.getAllByText('Non lié.')).toHaveLength(2);
  });

  it('explique le refus de délier le dernier moyen de connexion', async () => {
    comptes('google');
    unlinkAccount.mockResolvedValue({ error: { code: 'FAILED_TO_UNLINK_LAST_ACCOUNT' } });
    render(<LinkedAccounts />);

    await userEvent.click(await screen.findByRole('button', { name: 'Délier' }));

    expect(
      await screen.findByText('Impossible de délier votre dernier moyen de connexion.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Délier' })).toBeEnabled();
  });

  it('désactive les deux boutons pendant une opération', async () => {
    comptes('google');
    let finish: (value: unknown) => void = () => {};
    unlinkAccount.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<LinkedAccounts />);

    await userEvent.click(await screen.findByRole('button', { name: 'Délier' }));

    screen.getAllByRole('button').forEach((bouton) => expect(bouton).toBeDisabled());
    finish({ error: null });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Délier' })).toBeNull());
  });
});
