import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeToggle } from '@/components/theme-toggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('affiche le bouton de bascule après montage', () => {
    render(<ThemeToggle />);
    expect(screen.getByLabelText('Basculer le thème clair/sombre')).toBeInTheDocument();
  });

  it('bascule vers le mode sombre au clic et persiste le choix', () => {
    render(<ThemeToggle />);
    const button = screen.getByLabelText('Basculer le thème clair/sombre');

    fireEvent.click(button);

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('sf-theme')).toBe('dark');
  });

  it('repasse en mode clair sur un second clic', () => {
    render(<ThemeToggle />);
    const button = screen.getByLabelText('Basculer le thème clair/sombre');

    fireEvent.click(button);
    fireEvent.click(button);

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('sf-theme')).toBe('light');
  });

  it('initialise isDark à partir de la préférence stockée', () => {
    localStorage.setItem('sf-theme', 'dark');
    render(<ThemeToggle />);
    const button = screen.getByLabelText('Basculer le thème clair/sombre');

    // Le thème stocké est déjà "dark" : un clic doit donc repasser en "light".
    fireEvent.click(button);

    expect(localStorage.getItem('sf-theme')).toBe('light');
  });
});
