import Link from 'next/link';
import { Lock } from 'lucide-react';
import { PeriodeActions } from '@/components/gestionnaire/periode-actions';
import { DataCell, DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { buttonVariants } from '@/components/ui/button';
import { TableRow } from '@/components/ui/table';
import { dateIsoEnFrancais, libelleMois } from '@/lib/periode/periode-format';
import type { PeriodeRow } from '@/lib/periode/periode-data';

const COLUMNS = [
  { key: 'periode', header: 'Période' },
  { key: 'limite', header: 'Date limite' },
  { key: 'prestations', header: 'Prestations' },
  { key: 'actions', header: 'Actions', align: 'right' as const },
];

// Tableau des périodes de paie d'une entreprise (D90) : mois, date limite, état des prestations
// et actions. `readOnly` : cabinet en lecture seule (D29, D71), le serveur reste seul juge.
export function PeriodesTable({
  periodes,
  readOnly,
}: {
  periodes: PeriodeRow[];
  readOnly: boolean;
}) {
  return (
    <DataTable caption="Périodes de paie" columns={COLUMNS}>
      {periodes.map((p) => (
        <TableRow key={p.id}>
          <DataCell className="font-semibold capitalize text-foreground">
            <Link
              href={`/dashboard/gestionnaire/periodes/${p.id}`}
              className="text-primary hover:underline"
            >
              {libelleMois(p.annee, p.mois)}
            </Link>
          </DataCell>
          <DataCell className="text-foreground/80">{dateIsoEnFrancais(p.dateLimite)}</DataCell>
          <DataCell>
            <StatusBadge
              domain="periode"
              status={p.statut}
              icon={p.statut === 'VERROUILLEE' ? <Lock aria-hidden="true" /> : undefined}
            />
          </DataCell>
          <DataCell>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link
                href={`/dashboard/gestionnaire/periodes/${p.id}`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Prestations
              </Link>
              <PeriodeActions
                periodeId={p.id}
                verrouillee={p.statut === 'VERROUILLEE'}
                dateLimite={p.dateLimite}
                readOnly={readOnly}
              />
            </div>
          </DataCell>
        </TableRow>
      ))}
    </DataTable>
  );
}
