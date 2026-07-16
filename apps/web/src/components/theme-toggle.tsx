'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Necessaire pour eviter un mismatch d'hydratation (icone depend de localStorage/matchMedia, absents en SSR)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const stored = localStorage.getItem('sf-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = stored === 'dark' || (!stored && prefersDark);
    setIsDark(dark);
  }, []);

  const toggleTheme = () => {
    const root = document.documentElement;
    const newDark = !isDark;
    setIsDark(newDark);
    root.classList.toggle('dark');
    try {
      localStorage.setItem('sf-theme', newDark ? 'dark' : 'light');
    } catch (e) {
      // localStorage unavailable
    }
  };

  if (!mounted) return null;

  return (
    <button
      onClick={toggleTheme}
      aria-label="Basculer le thème clair/sombre"
      className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
    >
      {isDark ? (
        <Moon className="h-5 w-5" />
      ) : (
        <Sun className="h-5 w-5" />
      )}
    </button>
  );
}
