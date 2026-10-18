// Messages de quota bloquant (D15, D75). Module pur, utilise par les composants.

export type QuotaSubject = 'gestionnaires' | 'entreprises';

// D75 : un changement vers un plan plus petit est programme ; ses quotas
// s'appliquent deja aux nouveaux ajouts. Proposer un upgrade serait trompeur : on
// explique la limite et la sortie (liberer une place, ou annuler le changement).
export function pendingPlanQuotaMessage(plan: string, subject: QuotaSubject): string {
  return `Le changement vers le plan ${plan}, programmé en fin de période, limite déjà vos ${subject} à son quota. Libérez une place, ou annulez le changement de plan dans « Mon abonnement ».`;
}

// Message d'une reponse d'erreur de l'API : celui du code, ou - pour un quota fixe
// par un downgrade programme - l'explication dediee.
export function quotaAwareMessage(
  body: { error?: string; pendingPlan?: string } | null,
  messages: Record<string, string>,
  subject: QuotaSubject,
  fallback: string,
): string {
  if (body?.error === 'QUOTA_EXCEEDED' && body.pendingPlan) {
    return pendingPlanQuotaMessage(body.pendingPlan, subject);
  }
  return messages[body?.error ?? ''] ?? fallback;
}
