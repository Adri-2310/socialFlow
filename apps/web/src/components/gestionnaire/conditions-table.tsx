import { ConditionRowActions } from '@/components/gestionnaire/condition-row-actions';
import { DataCell, DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { TableRow } from '@/components/ui/table';
import { formatCents } from '@/lib/salarie/montant';
import { minutesEnLibelle } from '@/lib/periode/periode-format';
import { toConditionFormValues } from '@/lib/salarie/condition-form';
import type { ConditionRow } from '@/lib/salarie/salarie-data';

export const STATUTS: Record<string, string> = { EMPLOYE: 'Employé', OUVRIER: 'Ouvrier' };
export const REGIMES: Record<string, string> = {
  TEMPS_PLEIN: 'Temps plein',
  TEMPS_PARTIEL: 'Temps partiel',
};

const COLUMNS = [
  { key: 'date', header: 'Dès le', className: 'px-5' },
  { key: 'statut', header: 'Statut' },
  { key: 'fonction', header: 'Fonction' },
  { key: 'regime', header: 'Régime' },
  { key: 'remuneration', header: 'Rémunération' },
  { key: 'etat', header: 'État' },
  { key: 'actions', header: 'Actions', align: 'right' as const },
];

// Les dates de dossier n'ont pas d'heure : on les lit en UTC pour ne pas les décaler d'un jour.
const formatDate = (date: Date) => date.toLocaleDateString('fr-BE', { timeZone: 'UTC' });

export function regimeLabel(c: ConditionRow): string {
  const label = REGIMES[c.regime] ?? c.regime;
  // Heures du salarié sur celles de la personne de référence ; la fraction exacte est
  // l'affaire du moteur de paie.
  return c.regime === 'TEMPS_PARTIEL' && c.heuresSemaineMinutes && c.heuresReferenceMinutes
    ? `${label} (${minutesEnLibelle(c.heuresSemaineMinutes)} sur ${minutesEnLibelle(c.heuresReferenceMinutes)})`
    : label;
}

export function remuneration(c: ConditionRow): string {
  if (c.salaireMensuelBrutCents !== null) {
    return `${formatCents(c.salaireMensuelBrutCents)} brut par mois`;
  }
  if (c.salaireHoraireBrutCents !== null) {
    return `${formatCents(c.salaireHoraireBrutCents)} brut par heure`;
  }
  return '—';
}

// Historique des conditions de travail d'un salarié (roles/03 § 4.2), de la plus récente à la
// plus ancienne. Les dossiers archivés n'ont plus d'actions.
export function ConditionsTable({
  conditions,
  salarieId,
  dateEntree,
  archive,
  readOnly,
}: {
  conditions: ConditionRow[];
  salarieId: string;
  // La ligne datée de l'entrée est la première de l'historique : elle ne s'annule jamais.
  dateEntree: Date;
  archive: boolean;
  readOnly: boolean;
}) {
  return (
    <DataTable
      caption="Historique des conditions de travail"
      columns={COLUMNS}
      className="mt-3 rounded-none border-x-0 border-b-0 bg-transparent"
    >
      {conditions.map((c) => (
        <TableRow key={c.id}>
          <DataCell className="px-5 text-foreground">{formatDate(c.dateEffet)}</DataCell>
          <DataCell className="text-foreground/80">{STATUTS[c.statut] ?? c.statut}</DataCell>
          <DataCell className="text-foreground/80">{c.fonction}</DataCell>
          <DataCell className="text-foreground/80">{regimeLabel(c)}</DataCell>
          <DataCell className="text-foreground/80">{remuneration(c)}</DataCell>
          <DataCell>
            <StatusBadge domain="condition" status={c.etat} />
          </DataCell>
          <DataCell>
            {!archive && (
              <ConditionRowActions
                salarieId={salarieId}
                conditionId={c.id}
                initial={toConditionFormValues(c, { avecDate: true })}
                // Seul un changement à venir s'annule, jamais la première ligne (l'entrée).
                removable={c.etat === 'A_VENIR' && c.dateEffet.getTime() !== dateEntree.getTime()}
                readOnly={readOnly}
              />
            )}
          </DataCell>
        </TableRow>
      ))}
    </DataTable>
  );
}
