import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogoForm } from '@/components/cabinet/logo-form';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => refresh.mockReset());
afterEach(() => vi.unstubAllGlobals());

function pick(file: File) {
  const input = document.getElementById('logo') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe('LogoForm', () => {
  it('propose d ajouter un logo quand il n y en a pas', () => {
    render(<LogoForm logoUrl={null} cabinetName="Cabinet" readOnly={false} />);

    expect(screen.getByText('Ajouter un logo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retirer le logo' })).not.toBeInTheDocument();
  });

  it('affiche le logo actuel avec les actions remplacer et retirer', () => {
    render(<LogoForm logoUrl="https://blob.test/logo.png" cabinetName="Cabinet Dupont" readOnly={false} />);

    expect(screen.getByAltText('Logo de Cabinet Dupont')).toHaveAttribute('src', 'https://blob.test/logo.png');
    expect(screen.getByText('Remplacer le logo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retirer le logo' })).toBeInTheDocument();
  });

  it('ouvre le sélecteur de fichier depuis un vrai bouton, accessible au clavier', async () => {
    const open = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    render(<LogoForm logoUrl={null} cabinetName="Cabinet" readOnly={false} />);

    const button = screen.getByRole('button', { name: 'Ajouter un logo' });
    button.focus();
    expect(button).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    expect(open).toHaveBeenCalledTimes(1);
    open.mockRestore();
  });

  it('cache le champ fichier natif aux lecteurs d ecran et au clavier', () => {
    render(<LogoForm logoUrl={null} cabinetName="Cabinet" readOnly={false} />);

    const input = document.getElementById('logo') as HTMLInputElement;
    expect(input).toHaveAttribute('aria-hidden', 'true');
    expect(input).toHaveAttribute('tabindex', '-1');
  });

  it('désactive les boutons pendant l envoi', async () => {
    let finish: (value: unknown) => void = () => {};
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise((resolve) => (finish = resolve))));
    render(<LogoForm logoUrl="https://blob.test/logo.png" cabinetName="Cabinet" readOnly={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Retirer le logo' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remplacer le logo' })).toBeDisabled(),
    );
    expect(screen.getByRole('button', { name: 'Retirer le logo' })).toBeDisabled();
    finish({ ok: true, json: async () => ({ success: true }) });
    await screen.findByRole('status');
  });

  it('envoie le fichier choisi et confirme', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<LogoForm logoUrl={null} cabinetName="Cabinet" readOnly={false} />);

    pick(new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Logo enregistré');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cabinet/settings/logo',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it('refuse sans envoi un fichier de plus de 1 Mo', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<LogoForm logoUrl={null} cabinetName="Cabinet" readOnly={false} />);

    pick(new File([new Uint8Array(1024 * 1024 + 1)], 'logo.png', { type: 'image/png' }));

    expect(screen.getByRole('alert')).toHaveTextContent('dépasse 1 Mo');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('affiche l erreur du serveur', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'LOGO_SVG_UNSAFE' }) }),
    );
    render(<LogoForm logoUrl={null} cabinetName="Cabinet" readOnly={false} />);

    pick(new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/éléments non autorisés/);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('retire le logo', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<LogoForm logoUrl="https://blob.test/logo.png" cabinetName="Cabinet" readOnly={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Retirer le logo' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith('/api/cabinet/settings/logo', { method: 'DELETE' });
  });

  it('en lecture seule : aucune action', () => {
    render(<LogoForm logoUrl="https://blob.test/logo.png" cabinetName="Cabinet" readOnly />);

    expect(screen.queryByText('Remplacer le logo')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retirer le logo' })).not.toBeInTheDocument();
    expect(screen.getByText(/lecture seule/)).toBeInTheDocument();
  });
});
