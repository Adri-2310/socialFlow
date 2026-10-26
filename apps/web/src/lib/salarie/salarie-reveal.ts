import { entrepriseWhere, type Scope } from '@/lib/authz/authz';
import { prisma } from '@/lib/prisma';
import { formatIban } from '@/lib/salarie/iban';
import { formatNiss } from '@/lib/salarie/niss';
import { dechiffrerSalarie } from '@/lib/salarie/salarie-crypto';

// Dévoilement du NISS ou de l'IBAN d'un salarié (roles/03 § 4.1, FONCTIONNEMENT § 4) : le
// clair ne quitte le serveur que par ici, et chaque dévoilement est journalisé.

export const REVEALABLE_FIELDS = ['niss', 'iban'] as const;
export type RevealableField = (typeof REVEALABLE_FIELDS)[number];

export type RevealResult = { ok: true; value: string } | { ok: false; error: 'SALARIE_NOT_FOUND' };

// Déchiffre la valeur et écrit l'audit dans la MÊME transaction : si l'audit échoue, ou si la
// valeur est illisible (le déchiffrement lève une erreur), rien n'est renvoyé. On ne
// dévoile jamais sans trace.
//
// Le périmètre est revérifié dans la transaction : un dossier hors périmètre (entreprise non
// assignée, autre cabinet, archivé, inconnu) est introuvable. Seul le gestionnaire passe par
// ici pour l'instant ; l'entreprise et le collaborateur lisent leurs propres données avec
// leurs portails, qui arrivent plus tard.
export async function revealSensitiveField(
  scope: Scope,
  actorId: string,
  salarieId: string,
  field: RevealableField,
): Promise<RevealResult> {
  if (scope.kind !== 'entreprises') return { ok: false, error: 'SALARIE_NOT_FOUND' };

  return prisma.$transaction(async (tx) => {
    const salarie = await tx.salarie.findFirst({
      where: {
        id: salarieId,
        cabinetId: scope.cabinetId,
        deletedAt: null,
        entreprise: { AND: [entrepriseWhere(scope), { deletedAt: null }] },
      },
      select: { id: true, entrepriseId: true, nissEncrypted: true, ibanEncrypted: true },
    });
    if (!salarie) return { ok: false as const, error: 'SALARIE_NOT_FOUND' as const };

    const value =
      field === 'niss'
        ? formatNiss(dechiffrerSalarie(salarie.id, 'niss', salarie.nissEncrypted))
        : formatIban(dechiffrerSalarie(salarie.id, 'iban', salarie.ibanEncrypted));

    // D8, D26 : le journal est lu par le SuperAdmin et le Cabinet RH. Le nom du champ
    // dévoilé, jamais sa valeur.
    await tx.auditLog.create({
      data: {
        action: 'SALARIE_SENSITIVE_REVEALED',
        cabinetId: scope.cabinetId,
        actorId,
        metadata: { salarieId: salarie.id, entrepriseId: salarie.entrepriseId, field },
      },
    });

    return { ok: true as const, value };
  });
}
