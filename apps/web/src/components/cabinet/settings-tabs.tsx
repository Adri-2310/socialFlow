'use client';

import { useState, type ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type SettingsTab = {
  id: string;
  label: string;
  // Contenu rendu cote serveur ; reste monte quand l'onglet est masque, pour ne
  // pas perdre une saisie non enregistree en changeant d'onglet.
  content: ReactNode;
};

// Onglets de la page Parametres, sur les onglets shadcn (roles tablist/tab/tabpanel, fleches,
// Debut et Fin). L'onglet actif est garde dans l'adresse (?onglet=...) : on peut le partager, le
// recharger ou y revenir avec le bouton precedent sans perdre sa place. La selection suit le
// focus (activateOnFocus) et les panneaux restent montes (keepMounted), comme avant.
export function SettingsTabs({ tabs, initialTab }: { tabs: SettingsTab[]; initialTab: string }) {
  const [active, setActive] = useState(
    tabs.some((tab) => tab.id === initialTab) ? initialTab : tabs[0].id,
  );

  function select(id: string) {
    setActive(id);
    const url = new URL(window.location.href);
    url.searchParams.set('onglet', id);
    window.history.replaceState(window.history.state, '', url);
  }

  return (
    <Tabs value={active} onValueChange={(value) => select(String(value))} className="gap-0">
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsList
          variant="line"
          activateOnFocus
          aria-label="Sections des paramètres"
          className="h-auto min-w-max gap-1 border-b border-border p-0 group-data-horizontal/tabs:h-auto"
        >
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="px-4 py-2.5 font-semibold">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {tabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id} keepMounted className="mt-6 space-y-6">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
