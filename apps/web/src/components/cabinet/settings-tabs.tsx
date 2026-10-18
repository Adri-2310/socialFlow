'use client';

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export type SettingsTab = {
  id: string;
  label: string;
  // Contenu rendu cote serveur ; reste monte quand l'onglet est masque, pour ne
  // pas perdre une saisie non enregistree en changeant d'onglet.
  content: ReactNode;
};

// Onglets de la page Parametres. Accessibles (roles tablist/tab/tabpanel,
// fleches, Debut et Fin), et l'onglet actif est garde dans l'adresse
// (?onglet=...) : on peut le partager, le recharger ou y revenir avec le
// bouton precedent sans perdre sa place.
export function SettingsTabs({ tabs, initialTab }: { tabs: SettingsTab[]; initialTab: string }) {
  const [active, setActive] = useState(
    tabs.some((tab) => tab.id === initialTab) ? initialTab : tabs[0].id,
  );
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});

  function select(id: string, focus = false) {
    setActive(id);
    const url = new URL(window.location.href);
    url.searchParams.set('onglet', id);
    window.history.replaceState(window.history.state, '', url);
    if (focus) buttons.current[id]?.focus();
  }

  function onKeyDown(event: KeyboardEvent, index: number) {
    const last = tabs.length - 1;
    const target =
      event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null;
    if (target === null) return;
    event.preventDefault();
    select(tabs[target].id, true);
  }

  return (
    <div>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div
          role="tablist"
          aria-label="Sections des paramètres"
          className="flex min-w-max gap-1 border-b border-border"
        >
          {tabs.map((tab, index) => {
            const selected = tab.id === active;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  buttons.current[tab.id] = el;
                }}
                id={`tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(tab.id)}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                  selected
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab.id}`}
          hidden={tab.id !== active}
          className="mt-6 space-y-6"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
