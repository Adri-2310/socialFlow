import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Notice, NOTICE_TONE_CLASSES, type NoticeTone } from '@/components/shared/notice';
import { contrastRatio } from '@/lib/branding/color';
import { blend, tailwindColor } from '../../helpers/tailwind-colors';

describe('Notice', () => {
  it('annonce poliment par défaut (role status) et expose le ton', () => {
    render(<Notice tone="success">Informations enregistrées.</Notice>);

    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('Informations enregistrées.');
    expect(notice).toHaveAttribute('data-tone', 'success');
  });

  it('une erreur peut interrompre le lecteur d’écran (role alert)', () => {
    render(
      <Notice tone="danger" role="alert">
        Une erreur est survenue.
      </Notice>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Une erreur est survenue.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('affiche le titre, le texte et l’action', () => {
    render(
      <Notice
        tone="warning"
        title="Paiement en échec"
        action={<a href="/facturation">Régulariser</a>}
      >
        Régularisez votre abonnement.
      </Notice>,
    );

    expect(screen.getByText('Paiement en échec')).toBeInTheDocument();
    expect(screen.getByText(/Régularisez votre abonnement/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Régulariser' })).toHaveAttribute(
      'href',
      '/facturation',
    );
  });

  it('l’icône est décorative, par défaut comme remplacée', () => {
    const { container, rerender } = render(<Notice tone="info">Texte</Notice>);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    rerender(
      <Notice tone="info" icon={<svg data-testid="perso" aria-hidden="true" />}>
        Texte
      </Notice>,
    );
    expect(screen.getByTestId('perso')).toBeInTheDocument();
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });

  it('sans titre ni texte, rien d’autre que l’icône n’est rendu', () => {
    render(<Notice tone="neutral" />);

    expect(screen.queryByText(/./)).not.toBeInTheDocument();
  });

  describe('contraste AA (D62) de chaque ton, en clair et en sombre', () => {
    // Texte du titre (couleur du ton) et du corps (`--foreground` à 80 %), teinte de fond à 10 %.
    const TONES: Record<
      NoticeTone,
      Record<'light' | 'dark', { titre: string; tint: string; alpha: number }>
    > = {
      success: {
        light: {
          titre: tailwindColor('emerald-800'),
          tint: tailwindColor('emerald-500'),
          alpha: 0.1,
        },
        dark: {
          titre: tailwindColor('emerald-300'),
          tint: tailwindColor('emerald-500'),
          alpha: 0.1,
        },
      },
      warning: {
        light: { titre: tailwindColor('amber-800'), tint: tailwindColor('amber-500'), alpha: 0.1 },
        dark: { titre: tailwindColor('amber-300'), tint: tailwindColor('amber-500'), alpha: 0.1 },
      },
      danger: {
        light: { titre: '#b91c1c', tint: '#ef4444', alpha: 0.1 },
        dark: { titre: '#f87171', tint: '#7f1d1d', alpha: 0.1 },
      },
      info: {
        light: { titre: '#0f172a', tint: '#4f46e5', alpha: 0.1 },
        dark: { titre: '#ffffff', tint: '#5f62ec', alpha: 0.1 },
      },
      neutral: {
        light: { titre: '#0f172a', tint: '#f1f5f9', alpha: 0.6 },
        dark: { titre: '#ffffff', tint: '#1e293b', alpha: 0.6 },
      },
    };
    const SURFACES = { light: ['#ffffff', '#f8fafc'], dark: ['#0f172a', '#060b19'] };
    const FOREGROUND = { light: '#0f172a', dark: '#ffffff' };

    for (const tone of Object.keys(TONES) as NoticeTone[]) {
      for (const theme of ['light', 'dark'] as const) {
        it(`${tone} (${theme}) : titre et texte ≥ 4,5:1 sur la teinte, posée sur carte ou fond de page`, () => {
          const { titre, tint, alpha } = TONES[tone][theme];
          for (const surface of SURFACES[theme]) {
            const fond = blend(tint, surface, alpha);
            const corps = blend(FOREGROUND[theme], fond, 0.8);
            expect(
              contrastRatio(titre, fond),
              `titre ${tone} sur ${surface}`,
            ).toBeGreaterThanOrEqual(4.5);
            expect(
              contrastRatio(corps, fond),
              `texte ${tone} sur ${surface}`,
            ).toBeGreaterThanOrEqual(4.5);
          }
        });
      }
    }

    it('les classes du ton danger reprennent la couleur de texte lisible du thème', () => {
      expect(NOTICE_TONE_CLASSES.danger).toContain('text-destructive-text');
    });
  });
});
