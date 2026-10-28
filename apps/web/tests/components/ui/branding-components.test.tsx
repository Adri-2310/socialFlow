import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { buildThemeCss } from '@/lib/branding/branding-rules';
import { contrastRatio } from '@/lib/branding/color';

// D33, D62 : la couleur d'un cabinet pilote les composants shadcn par les variables CSS
// (`--primary`, `--ring`, `--accent-foreground`…), jamais par le code des composants. jsdom ne
// compile pas Tailwind : on vérifie donc la chaîne « thème → variable → classe du composant »
// et le contraste AA du résultat, pas le rendu en pixels.

// Valeurs de globals.css que le cabinet ne personnalise pas.
const LIGHT = { background: '#f8fafc', accent: '#f1f5f9' };
const DARK = { background: '#060b19', accent: '#1e293b' };

// Teintes représentatives : foncée, claire, saturée, proche du blanc, de la marque, jaune.
const CABINET_COLORS = [
  '#1e3a8a',
  '#00c49f',
  '#ff0000',
  '#ffff00',
  '#f1f5f9',
  '#4f46e5',
  '#808080',
];

type Vars = Record<string, string>;

function parseTheme(css: string): { light: Vars; dark: Vars } {
  const block = (selector: string): Vars => {
    const start = css.indexOf(`${selector}{`) + selector.length + 1;
    const body = css.slice(start, css.indexOf('}', start));
    return Object.fromEntries(
      body.split(';').map((declaration) => {
        const [name, value] = declaration.split(':');
        return [name, value];
      }),
    );
  };
  return { light: block(':root:not(.dark)'), dark: block(':root.dark') };
}

function themeFor(primaryColor: string, secondaryColor: string | null = null) {
  return parseTheme(buildThemeCss({ primaryColor, secondaryColor })!);
}

afterEach(() => {
  document.head.querySelectorAll('style[data-test-theme]').forEach((node) => node.remove());
  document.documentElement.classList.remove('dark');
});

describe('branding du cabinet et composants shadcn', () => {
  describe('contraste AA (D62) des variables lues par les composants', () => {
    it.each(CABINET_COLORS)('%s : bouton, focus et accent restent lisibles en clair', (color) => {
      const { light } = themeFor(color);

      // Texte du bouton principal, badge et case cochée : `--primary-foreground` sur `--primary`.
      expect(
        contrastRatio(light['--primary'], light['--primary-foreground']),
      ).toBeGreaterThanOrEqual(4.5);
      // Texte d'un élément de menu ou de liste survolé : `--accent-foreground` sur `--accent`.
      expect(contrastRatio(light['--accent-foreground'], LIGHT.accent)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(CABINET_COLORS)('%s : bouton, focus et accent restent lisibles en sombre', (color) => {
      const { dark } = themeFor(color);

      expect(contrastRatio(dark['--primary'], dark['--primary-foreground'])).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrastRatio(dark['--accent-foreground'], DARK.accent)).toBeGreaterThanOrEqual(4.5);
      // L'anneau de focus (`--ring`) doit se distinguer du fond (critère 1.4.11, 3:1).
      expect(contrastRatio(dark['--ring'], DARK.background)).toBeGreaterThanOrEqual(3);
    });

    it('le focus reste visible sur le fond clair pour une couleur validée par le serveur', () => {
      // Le serveur n'accepte que les couleurs qui passent 4,5:1 sur blanc (validateBranding).
      const { light } = themeFor('#1e3a8a');

      expect(contrastRatio(light['--ring'], LIGHT.background)).toBeGreaterThanOrEqual(3);
    });
  });

  describe('la couleur du cabinet atteint les composants principaux', () => {
    const injectTheme = (css: string) => {
      const style = document.createElement('style');
      style.setAttribute('data-test-theme', '');
      style.textContent = css;
      document.head.appendChild(style);
    };

    it('définit --primary pour le bouton principal et lui donne le texte associé', () => {
      injectTheme(buildThemeCss({ primaryColor: '#1e3a8a', secondaryColor: null })!);
      render(<Button>Enregistrer</Button>);

      const button = screen.getByRole('button', { name: 'Enregistrer' });
      expect(button.className).toContain('bg-primary');
      expect(button.className).toContain('text-primary-foreground');
      expect(
        Array.from(document.querySelectorAll('style[data-test-theme]')).some((node) =>
          node.textContent?.includes('--primary:#1e3a8a'),
        ),
      ).toBe(true);
    });

    it('le focus du bouton et du champ lit --ring', () => {
      render(
        <>
          <Button>Valider</Button>
          <Input aria-label="Nom" />
        </>,
      );

      expect(screen.getByRole('button', { name: 'Valider' }).className).toContain(
        'focus-visible:ring-ring/50',
      );
      expect(screen.getByLabelText('Nom').className).toContain('focus-visible:ring-ring/50');
    });

    it('le badge, la case cochée et l’interrupteur lisent --primary', () => {
      render(
        <>
          <Badge>Actif</Badge>
          <Checkbox aria-label="Accepter" />
          <Switch aria-label="Notifications" />
        </>,
      );

      expect(screen.getByText('Actif').className).toContain('bg-primary');
      expect(screen.getByRole('checkbox', { name: 'Accepter' }).className).toContain(
        'data-checked:bg-primary',
      );
      expect(screen.getByRole('switch', { name: 'Notifications' }).className).toContain(
        'data-checked:bg-primary',
      );
    });

    it('les menus et les listes lisent --accent et --accent-foreground, que le thème définit', () => {
      const ui = (file: string) =>
        readFileSync(join(__dirname, '../../../src/components/ui', file), 'utf8');

      for (const file of ['dropdown-menu.tsx', 'select.tsx']) {
        expect(ui(file)).toContain('text-accent-foreground');
      }
      expect(buildThemeCss({ primaryColor: '#1e3a8a', secondaryColor: null })).toContain(
        '--accent-foreground:',
      );
    });
  });

  describe('onglets', () => {
    it('le texte de l’onglet actif et le soulignement lisent --primary', () => {
      render(
        <Tabs defaultValue="a">
          <TabsList variant="line">
            <TabsTrigger value="a">Identité</TabsTrigger>
            <TabsTrigger value="b">Branding</TabsTrigger>
          </TabsList>
        </Tabs>,
      );

      const tab = screen.getByRole('tab', { name: 'Identité' });
      expect(tab.className).toContain('data-active:text-primary');
      expect(tab.className).toContain('dark:data-active:text-primary');
      expect(tab.className).toContain('after:bg-primary');
    });

    it('l’onglet actif garde un fond neutre : D62 ne garantit le contraste que sur le fond de page', () => {
      render(
        <Tabs defaultValue="a">
          <TabsList>
            <TabsTrigger value="a">Identité</TabsTrigger>
          </TabsList>
        </Tabs>,
      );

      const { className } = screen.getByRole('tab', { name: 'Identité' });
      expect(className).toContain('data-active:bg-background');
      expect(className).not.toMatch(/data-active:bg-primary/);
    });

    // Couleurs que le serveur accepte (4,5:1 sur blanc, validateBranding).
    it.each(['#1e3a8a', '#4f46e5', '#0f766e', '#b91c1c'])(
      '%s : le texte de l’onglet actif est lisible sur le fond de page, en clair et en sombre',
      (color) => {
        const { light, dark } = themeFor(color);

        expect(contrastRatio(light['--primary'], LIGHT.background)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(dark['--primary'], DARK.background)).toBeGreaterThanOrEqual(4.5);
      },
    );
  });

  describe('couleur secondaire du cabinet', () => {
    it('les variantes secondary des composants ne lisent pas --secondary (D62)', () => {
      // Le teal par défaut donne 2,2:1 avec du blanc ; la variante reste une surface neutre.
      render(
        <>
          <Button variant="secondary">Annuler</Button>
          <Badge variant="secondary">Brouillon</Badge>
        </>,
      );

      expect(screen.getByRole('button', { name: 'Annuler' }).className).not.toContain(
        'bg-secondary',
      );
      expect(screen.getByText('Brouillon').className).not.toContain('bg-secondary');
    });

    it.each(CABINET_COLORS)(
      '%s : le texte posé sur --secondary reste lisible, en clair et en sombre',
      (color) => {
        const { light, dark } = themeFor('#1e3a8a', color);

        expect(
          contrastRatio(light['--secondary'], light['--secondary-foreground']),
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(dark['--secondary'], dark['--secondary-foreground']),
        ).toBeGreaterThanOrEqual(4.5);
      },
    );
  });
});
