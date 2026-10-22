import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize } from '@/lib/authz/authz';
import { DecryptionError } from '@/lib/crypto/field-encryption';
import { findSalarieInScope } from '@/lib/salarie/salarie-data';
import { REVEALABLE_FIELDS, revealSensitiveField } from '@/lib/salarie/salarie-reveal';

// Dévoilement journalisé du NISS ou de l'IBAN d'un salarié (roles/03 § 4.1). C'est une
// action (POST) et non une lecture : elle laisse une trace d'audit à chaque appel, et sa
// réponse ne doit jamais être mise en cache. Elle reste possible quand le cabinet est en
// lecture seule (D29) : consulter n'est pas modifier.

type Context = { params: Promise<{ id: string }> };

const bodySchema = z.object({ field: z.enum(REVEALABLE_FIELDS) });

// Pas de mise en cache : le clair ne doit rester ni dans le navigateur, ni dans un proxy.
const NO_STORE = { 'cache-control': 'no-store' };

export async function POST(request: Request, { params }: Context) {
  const authz = await authorize(request, 'salarie.devoiler-donnees-sensibles');
  if (authz.response) return authz.response;
  const { session, scope } = authz;
  const { id } = await params;

  // Périmètre avant validation : un dossier hors périmètre répond 404 quel que soit le corps.
  if (!(await findSalarieInScope(scope, id))) {
    return NextResponse.json({ error: 'SALARIE_NOT_FOUND' }, { status: 404, headers: NO_STORE });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_FIELD' }, { status: 400, headers: NO_STORE });
  }

  try {
    const result = await revealSensitiveField(scope, session.user.id, id, parsed.data.field);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404, headers: NO_STORE });
    }
    return NextResponse.json({ value: result.value }, { headers: NO_STORE });
  } catch (error) {
    // Valeur illisible : rien n'est renvoyé et, la transaction étant annulée, rien n'est
    // journalisé. Aucun détail dans la réponse (CLAUDE.md : jamais dans les erreurs).
    if (error instanceof DecryptionError) {
      return NextResponse.json({ error: 'DECRYPTION_FAILED' }, { status: 500, headers: NO_STORE });
    }
    throw error;
  }
}
