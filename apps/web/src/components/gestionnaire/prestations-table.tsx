import { PrestationEncoder } from '@/components/gestionnaire/prestation-encoder';
import { DataCell, DataTable } from '@/components/shared/data-table';
import { TableRow } from '@/components/ui/table';
import { resumePrestation, ROLE_LABELS } from '@/lib/periode/periode-format';
import type { SalariePrestationRow } from '@/lib/periode/prestation-data';

const COLUMNS = [
  { key: 'salarie', header: 'Salarié' },
  { key: 'ecarts', header: 'Écarts du mois' },
  { key: 'saisie', header: 'Dernière saisie' },
  { key: 'actions', header: 'Actions', align: 'right' as const },
];

// Tableau des prestations d'une période (D92) : une ligne par salarié en poste pendant le mois,
// avec ses écarts. Sans écart, un salarié est payé pour un mois complet selon son régime.
// `bloque` : raison pour laquelle l'encodage est désactivé (lecture seule, période verrouillée).
export function PrestationsTable({
  salaries,
  periode,
  bloque,
}: {
  salaries: SalariePrestationRow[];
  periode: { id: string; annee: number; mois: number };
  bloque: string | null;
}) {
  return (
    <DataTable caption="Prestations du mois" columns={COLUMNS}>
      {salaries.map((s) => {
        const lignes = s.prestation ? resumePrestation(s.prestation) : [];
        return (
          <TableRow key={s.id}>
            <DataCell className="font-semibold text-foreground">
              {s.prenom} {s.nom}
            </DataCell>
            <DataCell className="text-foreground/80">
              {lignes.length === 0 ? (
                <span className="text-muted-foreground">Mois complet</span>
              ) : (
                <ul className="space-y-0.5">
                  {lignes.map((ligne) => (
                    <li key={ligne}>{ligne}</li>
                  ))}
                </ul>
              )}
            </DataCell>
            <DataCell className="text-xs text-muted-foreground">
              {s.prestation?.modifiePar
                ? `${s.prestation.modifiePar.name} (${ROLE_LABELS[s.prestation.modifiePar.role ?? ''] ?? 'compte'})`
                : s.prestation
                  ? 'Compte supprimé'
                  : '—'}
            </DataCell>
            <DataCell>
              <div className="flex justify-end">
                <PrestationEncoder
                  periodeId={periode.id}
                  annee={periode.annee}
                  mois={periode.mois}
                  salarieId={s.id}
                  salarieNom={`${s.prenom} ${s.nom}`}
                  initial={s.prestation}
                  bloque={bloque}
                />
              </div>
            </DataCell>
          </TableRow>
        );
      })}
    </DataTable>
  );
}
