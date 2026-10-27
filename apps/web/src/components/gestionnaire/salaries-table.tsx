import Link from 'next/link';
import { Eye } from 'lucide-react';
import { SalarieArchiveActions } from '@/components/gestionnaire/salarie-archive-actions';
import { SortieBadge } from '@/components/gestionnaire/sortie-badge';
import { DataCell, DataTable } from '@/components/shared/data-table';
import { buttonVariants } from '@/components/ui/button';
import { TableRow } from '@/components/ui/table';
import type { SalarieRow } from '@/lib/salarie/salarie-data';

const STATUT_LABELS: Record<string, string> = { EMPLOYE: 'Employé', OUVRIER: 'Ouvrier' };

const COLUMNS = [
  { key: 'salarie', header: 'Salarié' },
  { key: 'niss', header: 'NISS' },
  { key: 'fonction', header: 'Fonction' },
  { key: 'statut', header: 'Statut' },
  { key: 'entree', header: 'Entrée' },
  { key: 'situation', header: 'Situation' },
  { key: 'actions', header: 'Actions', align: 'right' as const },
];

// Les dates de dossier n'ont pas d'heure : on les lit en UTC pour ne pas les décaler d'un jour.
const formatDate = (date: Date) => date.toLocaleDateString('fr-BE', { timeZone: 'UTC' });

// Tableau des salariés d'une entreprise (roles/03 § 4.1), actifs ou archivés. Les dossiers
// archivés proposent « Restaurer ». `at` : date du jour, calculée côté serveur.
export function SalariesTable({
  salaries,
  archives,
  readOnly,
  at,
}: {
  salaries: SalarieRow[];
  archives: boolean;
  readOnly: boolean;
  at: Date;
}) {
  return (
    <DataTable caption={archives ? 'Salariés archivés' : 'Salariés'} columns={COLUMNS}>
      {salaries.map((s) => (
        <TableRow key={s.id}>
          <DataCell className="font-semibold text-foreground">
            <Link
              href={`/dashboard/gestionnaire/salaries/${s.id}`}
              className="text-primary hover:underline"
            >
              {s.prenom} {s.nom}
            </Link>
          </DataCell>
          <DataCell className="font-mono text-xs text-muted-foreground">{s.nissMasque}</DataCell>
          <DataCell className="text-foreground/80">{s.fonction ?? '—'}</DataCell>
          <DataCell className="text-foreground/80">
            {s.statut ? (STATUT_LABELS[s.statut] ?? s.statut) : '—'}
          </DataCell>
          <DataCell className="text-foreground/80">{formatDate(s.dateEntree)}</DataCell>
          <DataCell>
            <SortieBadge dateEntree={s.dateEntree} dateSortie={s.dateSortie} at={at} />
          </DataCell>
          <DataCell>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link
                href={`/dashboard/gestionnaire/salaries/${s.id}`}
                aria-label={`Voir le dossier de ${s.prenom} ${s.nom}`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <Eye aria-hidden="true" /> Voir
              </Link>
              {archives && (
                <SalarieArchiveActions
                  salarieId={s.id}
                  nom={`${s.prenom} ${s.nom}`}
                  archive
                  readOnly={readOnly}
                  compact
                />
              )}
            </div>
          </DataCell>
        </TableRow>
      ))}
    </DataTable>
  );
}
