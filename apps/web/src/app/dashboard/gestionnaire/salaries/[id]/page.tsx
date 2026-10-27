import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Archive, ArrowLeft } from 'lucide-react';
import { ConditionAdd } from '@/components/gestionnaire/condition-add';
import { ConditionRowActions } from '@/components/gestionnaire/condition-row-actions';
import { SalarieArchiveActions } from '@/components/gestionnaire/salarie-archive-actions';
import { SalarieEdit } from '@/components/gestionnaire/salarie-edit';
import { SalariePortail } from '@/components/gestionnaire/salarie-portail';
import { SalarieSortie } from '@/components/gestionnaire/salarie-sortie';
import { SensitiveValue } from '@/components/gestionnaire/sensitive-value';
import { SortieBadge } from '@/components/gestionnaire/sortie-badge';
import { isCabinetReadOnly } from '@/lib/cabinet/cabinet-suspension';
import { countryOptions } from '@/lib/countries';
import { prisma } from '@/lib/prisma';
import { minutesEnLibelle } from '@/lib/periode/periode-format';
import { toConditionFormValues } from '@/lib/salarie/condition-form';
import { toFormValues } from '@/lib/salarie/salarie-form';
import { requireAuthorized } from '@/lib/authz/authz-page';
import { resolveScope } from '@/lib/authz/authz';
import { getSalarieDetail, type ConditionRow } from '@/lib/salarie/salarie-data';
import { formatCents } from '@/lib/salarie/montant';
import { lignesSituationFiscale, type DossierFiscal } from '@/lib/salarie/situation-fiscale';
import { Notice } from '@/components/shared/notice';
import { StatusBadge } from '@/components/shared/status-badge';

export const metadata: Metadata = {
  title: 'Dossier salarié',
  description: 'Le dossier d’un salarié.',
};

const STATUTS: Record<string, string> = { EMPLOYE: 'Employé', OUVRIER: 'Ouvrier' };
const REGIMES: Record<string, string> = {
  TEMPS_PLEIN: 'Temps plein',
  TEMPS_PARTIEL: 'Temps partiel',
};
const SITUATIONS: Record<string, string> = {
  ISOLE: 'Isolé',
  MARIE_OU_COHABITANT_LEGAL: 'Marié ou cohabitant légal',
};

// Les dates de dossier n'ont pas d'heure : on les lit en UTC pour ne pas les décaler d'un jour.
const formatDate = (date: Date) => date.toLocaleDateString('fr-BE', { timeZone: 'UTC' });

function regimeLabel(c: ConditionRow): string {
  const label = REGIMES[c.regime] ?? c.regime;
  // Heures du salarié sur celles de la personne de référence ; la fraction exacte est
  // l'affaire du moteur de paie.
  return c.regime === 'TEMPS_PARTIEL' && c.heuresSemaineMinutes && c.heuresReferenceMinutes
    ? `${label} (${minutesEnLibelle(c.heuresSemaineMinutes)} sur ${minutesEnLibelle(c.heuresReferenceMinutes)})`
    : label;
}

function remuneration(c: ConditionRow): string {
  if (c.salaireMensuelBrutCents !== null) {
    return `${formatCents(c.salaireMensuelBrutCents)} brut par mois`;
  }
  if (c.salaireHoraireBrutCents !== null) {
    return `${formatCents(c.salaireHoraireBrutCents)} brut par heure`;
  }
  return '—';
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-sm text-foreground ${mono ? 'font-mono' : ''}`}>{value || '—'}</dd>
    </div>
  );
}

export default async function SalarieDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireAuthorized('salarie.voir');
  const { id } = await params;

  const scope = await resolveScope(user);
  if (!scope) redirect('/dashboard');

  // Dossier hors périmètre (entreprise non assignée, autre cabinet, archivé) : 404, on ne
  // révèle pas son existence.
  // La fiche d'un dossier archivé reste consultable (en lecture seule) pour pouvoir le restaurer.
  const maintenant = new Date();
  const salarie = await getSalarieDetail(scope, id, maintenant, { includeArchived: true });
  if (!salarie) notFound();

  // D29, D71 : cabinet en lecture seule, la modification est désactivée (le serveur refuse aussi).
  const cabinet = await prisma.cabinet.findUnique({
    where: { id: user.cabinetId ?? '' },
    select: { billingStatus: true, status: true, suspensionType: true },
  });
  const readOnly = !cabinet || isCabinetReadOnly(cabinet);

  // Condition courante ; à défaut (salarié qui n'est pas encore entré), la prochaine prévue.
  const courante =
    salarie.conditions.find((c) => c.etat === 'EN_VIGUEUR') ??
    [...salarie.conditions].reverse().find((c) => c.etat === 'A_VENIR');

  const estPremiere = (c: ConditionRow) => c.dateEffet.getTime() === salarie.dateEntree.getTime();

  const adresse = [salarie.adresse, [salarie.codePostal, salarie.ville].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href={`/dashboard/gestionnaire/entreprises/${salarie.entreprise.id}/salaries`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {salarie.entreprise.name}
          </Link>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">
            {salarie.prenom} {salarie.nom}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!salarie.archive && (
            <>
              <SalarieEdit
                salarieId={salarie.id}
                initial={toFormValues(salarie)}
                nissMasque={salarie.nissMasque}
                ibanMasque={salarie.ibanMasque}
                // Calculé côté serveur : les données Intl diffèrent entre Node et le navigateur.
                countries={countryOptions()}
                readOnly={readOnly}
              />
              <SalarieSortie
                salarieId={salarie.id}
                dateSortie={salarie.dateSortie ? salarie.dateSortie.toISOString().slice(0, 10) : ''}
                readOnly={readOnly}
              />
            </>
          )}
          <SalarieArchiveActions
            salarieId={salarie.id}
            nom={`${salarie.prenom} ${salarie.nom}`}
            archive={salarie.archive}
            readOnly={readOnly}
          />
        </div>
      </div>

      {salarie.archive && (
        <Notice
          tone="neutral"
          icon={<Archive aria-hidden="true" className="size-5" />}
          title="Dossier archivé"
        >
          Il n’apparaît plus dans les listes et ne peut plus être modifié. Il reste conservé :
          restaurez-le pour le modifier de nouveau.
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Identité">
          <Row label="Date de naissance" value={formatDate(salarie.dateNaissance)} />
          <Row
            label="NISS"
            value={
              salarie.archive ? (
                <span className="font-mono">{salarie.nissMasque}</span>
              ) : (
                <SensitiveValue
                  salarieId={salarie.id}
                  field="niss"
                  label="NISS"
                  masked={salarie.nissMasque}
                />
              )
            }
          />
          <Row
            label="IBAN"
            value={
              salarie.archive ? (
                <span className="font-mono">{salarie.ibanMasque}</span>
              ) : (
                <SensitiveValue
                  salarieId={salarie.id}
                  field="iban"
                  label="IBAN"
                  masked={salarie.ibanMasque}
                />
              )
            }
          />
          <Row label="Email" value={salarie.email} />
          <div className="sm:col-span-2">
            <Row label="Adresse" value={adresse} />
          </div>
        </Section>

        <Section title="Contrat">
          <Row label="Type de contrat" value={salarie.typeContrat} />
          <Row label="Date d’entrée" value={formatDate(salarie.dateEntree)} />
          <Row
            label="Fin du CDD"
            value={salarie.dateFinContrat ? formatDate(salarie.dateFinContrat) : null}
          />
          <Row
            label="Sortie"
            value={<SortieBadge dateSortie={salarie.dateSortie} at={maintenant} />}
          />
        </Section>

        <Section
          title={
            courante?.etat === 'A_VENIR'
              ? `Conditions de travail prévues dès le ${formatDate(courante.dateEffet)}`
              : 'Conditions de travail en vigueur'
          }
        >
          {courante ? (
            <>
              <Row label="Statut" value={STATUTS[courante.statut] ?? courante.statut} />
              <Row label="Commission paritaire" value={`CP ${courante.commissionParitaire}`} />
              <Row label="Fonction" value={courante.fonction} />
              <Row label="Régime" value={regimeLabel(courante)} />
              <div className="sm:col-span-2">
                <Row label="Rémunération" value={remuneration(courante)} />
              </div>
            </>
          ) : (
            <Row label="Conditions" value={null} />
          )}
        </Section>

        <Section title="Situation fiscale">
          {lignesSituationFiscale(
            salarie as DossierFiscal,
            SITUATIONS[salarie.situationFamiliale] ?? salarie.situationFamiliale,
          ).map((ligne) => (
            <Row key={ligne.label} label={ligne.label} value={ligne.value} />
          ))}
        </Section>
      </div>

      {/* Un dossier archivé n'invite plus personne : il se restaure d'abord. */}
      {!salarie.archive && (
        <SalariePortail
          salarieId={salarie.id}
          // Les dates passent en texte : un composant client ne reçoit pas d'objet Date.
          etat={
            salarie.portail.etat === 'EN_ATTENTE' || salarie.portail.etat === 'EXPIREE'
              ? { etat: salarie.portail.etat, expiresAt: salarie.portail.expiresAt.toISOString() }
              : { etat: salarie.portail.etat }
          }
          aUnEmail={!!salarie.email}
          readOnly={readOnly}
        />
      )}

      <section className="rounded-2xl border border-border bg-card">
        <div className="flex flex-col gap-2 px-5 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Historique des conditions de travail
          </h3>
          {courante && !salarie.archive && (
            <ConditionAdd
              salarieId={salarie.id}
              initial={toConditionFormValues(courante, { avecDate: false })}
              readOnly={readOnly}
            />
          )}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-y border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 font-semibold">Dès le</th>
                <th className="px-4 py-2.5 font-semibold">Statut</th>
                <th className="px-4 py-2.5 font-semibold">Fonction</th>
                <th className="px-4 py-2.5 font-semibold">Régime</th>
                <th className="px-4 py-2.5 font-semibold">Rémunération</th>
                <th className="px-4 py-2.5 font-semibold">État</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {salarie.conditions.map((c) => (
                <tr key={c.id}>
                  <td className="px-5 py-3 text-foreground">{formatDate(c.dateEffet)}</td>
                  <td className="px-4 py-3 text-foreground/80">{STATUTS[c.statut] ?? c.statut}</td>
                  <td className="px-4 py-3 text-foreground/80">{c.fonction}</td>
                  <td className="px-4 py-3 text-foreground/80">{regimeLabel(c)}</td>
                  <td className="px-4 py-3 text-foreground/80">{remuneration(c)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge domain="condition" status={c.etat} />
                  </td>
                  <td className="px-4 py-3">
                    {!salarie.archive && (
                      <ConditionRowActions
                        salarieId={salarie.id}
                        conditionId={c.id}
                        initial={toConditionFormValues(c, { avecDate: true })}
                        // Seul un changement à venir s'annule, jamais la première ligne (l'entrée).
                        removable={c.etat === 'A_VENIR' && !estPremiere(c)}
                        readOnly={readOnly}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
