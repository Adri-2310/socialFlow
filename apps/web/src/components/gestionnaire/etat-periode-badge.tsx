import { CalendarDays, Lock } from 'lucide-react';
import { StatusBadge } from '@/components/shared/status-badge';
import { dateIsoEnFrancais } from '@/lib/periode/periode-format';
import type { EtatPeriodeMois } from '@/lib/periode/tableau-de-bord';

// État de la période du mois courant d'une entreprise, dans le tableau de bord du gestionnaire
// (D93). Présentation pure : l'état est calculé côté serveur.
export function EtatPeriodeBadge({ etat }: { etat: EtatPeriodeMois }) {
  switch (etat.kind) {
    case 'NON_OUVERTE':
      return (
        <StatusBadge
          domain="echeance"
          status={etat.kind}
          icon={<CalendarDays aria-hidden="true" />}
        />
      );
    case 'EN_ATTENTE':
      return (
        <StatusBadge
          domain="echeance"
          status={etat.kind}
          icon={<CalendarDays aria-hidden="true" />}
          label={`Prestations avant le ${dateIsoEnFrancais(etat.dateLimite)}`}
        />
      );
    case 'EN_RETARD':
      return (
        <StatusBadge
          domain="echeance"
          status={etat.kind}
          icon={<CalendarDays aria-hidden="true" />}
          label={`Date limite dépassée (${dateIsoEnFrancais(etat.dateLimite)})`}
        />
      );
    case 'VERROUILLEE':
      return (
        <StatusBadge domain="echeance" status={etat.kind} icon={<Lock aria-hidden="true" />} />
      );
  }
}
