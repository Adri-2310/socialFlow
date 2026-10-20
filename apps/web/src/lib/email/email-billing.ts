import { resend } from '@/lib/email/email-core';
import { emailShell, escapeHtml } from '@/lib/email/email-layout';

// Emails de la PLATEFORME au titulaire du cabinet (ou au SuperAdmin) : paiement
// échoué, fin du délai de grâce. C'est SocialFlow qui facture (D66).
// D23, D57 : alerte de paiement echoue. `audience` choisit le texte : le
// titulaire du cabinet (qui doit regulariser) ou un SuperAdmin (qui suit).
export async function sendPaymentFailedEmail(
  email: string,
  name: string,
  cabinetName: string,
  graceDeadline: Date,
  audience: 'cabinet' | 'admin',
) {
  const deadline = graceDeadline.toLocaleDateString('fr-BE', {
    timeZone: 'Europe/Brussels',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const copy =
    audience === 'cabinet'
      ? {
          subject: 'Le paiement de votre abonnement SocialFlow a échoué',
          title: 'Le paiement de votre abonnement a échoué',
          body: `Le dernier paiement de l'abonnement de ${cabinetName} n'a pas pu être prélevé. Votre cabinet reste pleinement utilisable jusqu'au ${deadline}. Passé cette date, il passera en lecture seule : vos clients pourront toujours consulter leurs fiches, mais plus rien ne pourra être produit. Régularisez votre abonnement avant cette échéance.`,
        }
      : {
          subject: `Paiement échoué : ${cabinetName}`,
          title: 'Un paiement d\'abonnement a échoué',
          body: `Le paiement de l'abonnement du cabinet ${cabinetName} a échoué. Son délai de grâce court jusqu'au ${deadline} ; il passera ensuite en lecture seule sans régularisation.`,
        };

  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#6d28d9;">Facturation</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">${copy.title}</h1>
    <p style="margin:0 0 12px; color:#475569;">Bonjour ${escapeHtml(name)},</p>
    <p style="margin:0; color:#475569;">${escapeHtml(copy.body)}</p>
  `);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL as string,
    to: email,
    subject: copy.subject,
    html,
  });

  if (error) throw new Error(error.message);
}

// D23, D57 : fin du delai de grace, le cabinet passe en lecture seule.
export async function sendPaymentSuspensionEmail(
  email: string,
  name: string,
  cabinetName: string,
  audience: 'cabinet' | 'admin',
) {
  const copy =
    audience === 'cabinet'
      ? {
          subject: 'Votre cabinet SocialFlow est passé en lecture seule',
          title: 'Votre cabinet est passé en lecture seule',
          body: `Le paiement de l'abonnement de ${cabinetName} n'a pas été régularisé dans le délai de grâce. Votre cabinet est désormais en lecture seule : vous et vos clients pouvez consulter les fiches déjà envoyées, mais plus rien ne peut être produit ni modifié. Régularisez votre abonnement pour reprendre l'activité.`,
        }
      : {
          subject: `Cabinet en lecture seule pour impayé : ${cabinetName}`,
          title: 'Un cabinet est passé en lecture seule',
          body: `Le délai de grâce du cabinet ${cabinetName} est écoulé sans régularisation : il est passé en lecture seule pour impayé. Une suspension manuelle éventuelle n'est pas modifiée.`,
        };

  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#6d28d9;">Facturation</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">${copy.title}</h1>
    <p style="margin:0 0 12px; color:#475569;">Bonjour ${escapeHtml(name)},</p>
    <p style="margin:0; color:#475569;">${escapeHtml(copy.body)}</p>
  `);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL as string,
    to: email,
    subject: copy.subject,
    html,
  });

  if (error) throw new Error(error.message);
}
