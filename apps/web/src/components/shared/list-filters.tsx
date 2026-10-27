'use client';

import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';

export type FilterOption = { value: string; label: string };

// Barre de recherche et listes de filtres au-dessus d'un tableau. Chaque champ a un nom
// accessible (`label`) : l'indication visible (placeholder, première option) disparaît à la
// saisie ou ne dit pas à quoi sert la liste. L'état (texte cherché, filtre choisi) reste chez
// l'appelant, qui filtre ses données.
export function ListFilters({
  search,
  filters = [],
}: {
  search: {
    value: string;
    onChange: (value: string) => void;
    label: string;
    placeholder: string;
    // Largeur du champ au-delà du mobile (« sm:w-56 »).
    className?: string;
  };
  filters?: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: FilterOption[];
  }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={search.value}
          onChange={(e) => search.onChange(e.target.value)}
          placeholder={search.placeholder}
          aria-label={search.label}
          className={cn('pl-9 sm:w-56', search.className)}
        />
      </div>
      {filters.map((filter) => (
        <NativeSelect
          key={filter.label}
          aria-label={filter.label}
          value={filter.value}
          onChange={(e) => filter.onChange(e.target.value)}
          className="w-auto"
        >
          {filter.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      ))}
    </div>
  );
}
