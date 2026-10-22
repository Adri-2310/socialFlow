import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SensitiveValue } from '@/components/gestionnaire/sensitive-value';

const fetchMock = vi.fn();

function reponse(status: number, body: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const rendre = () =>
  render(<SensitiveValue salarieId="s1" field="niss" label="NISS" masked="85.07.**-***.**" />);

describe('SensitiveValue', () => {
  it('affiche la valeur masquée, sans rien demander au serveur', () => {
    rendre();
    expect(screen.getByText('85.07.**-***.**')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Afficher le NISS' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('demande le dévoilement par POST avec le champ voulu, puis affiche le clair', async () => {
    fetchMock.mockReturnValue(reponse(200, { value: '85.07.30-033.28' }));
    rendre();

    fireEvent.click(screen.getByRole('button', { name: 'Afficher le NISS' }));

    expect(await screen.findByText('85.07.30-033.28')).toBeInTheDocument();
    expect(screen.queryByText('85.07.**-***.**')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/salaries/s1/reveal');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ field: 'niss' });
  });

  it('se remasque au clic sur « Masquer »', async () => {
    fetchMock.mockReturnValue(reponse(200, { value: '85.07.30-033.28' }));
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'Afficher le NISS' }));
    await screen.findByText('85.07.30-033.28');

    fireEvent.click(screen.getByRole('button', { name: 'Masquer le NISS' }));

    expect(screen.getByText('85.07.**-***.**')).toBeInTheDocument();
    expect(screen.queryByText('85.07.30-033.28')).not.toBeInTheDocument();
  });

  it('se remasque tout seul au bout de 30 secondes', async () => {
    vi.useFakeTimers();
    fetchMock.mockReturnValue(reponse(200, { value: '85.07.30-033.28' }));
    rendre();

    fireEvent.click(screen.getByRole('button', { name: 'Afficher le NISS' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('85.07.30-033.28')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(29_000);
    });
    expect(screen.getByText('85.07.30-033.28')).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(1_500);
    });
    expect(screen.getByText('85.07.**-***.**')).toBeInTheDocument();
  });

  it('affiche une erreur en français et garde la valeur masquée quand le serveur refuse', async () => {
    fetchMock.mockReturnValue(reponse(404, { error: 'SALARIE_NOT_FOUND' }));
    rendre();

    fireEvent.click(screen.getByRole('button', { name: 'Afficher le NISS' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('introuvable'));
    expect(screen.getByText('85.07.**-***.**')).toBeInTheDocument();
  });

  it('affiche une erreur générique quand le réseau échoue', async () => {
    fetchMock.mockRejectedValue(new Error('réseau'));
    rendre();

    fireEvent.click(screen.getByRole('button', { name: 'Afficher le NISS' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Une erreur est survenue'),
    );
    expect(screen.getByText('85.07.**-***.**')).toBeInTheDocument();
  });
});
