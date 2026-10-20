import { ACCOUNT_DELETION_RETENTION_DAYS } from '@/lib/auth/account-retention';
import { accountContext, resend } from '@/lib/email/email-core';
import { ctaButton, emailShell, escapeHtml } from '@/lib/email/email-layout';

// Emails de COMPTE (connexion, vérification d'adresse, suppression, mot de passe,
// double authentification, comptes liés) : voir accountContext pour l'identité.
export async function sendMagicLinkEmail(email: string, url: string) {
  const ctx = await accountContext(email);
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${ctx.accent};">Connexion sans mot de passe</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Votre lien de connexion</h1>
    <p style="margin:0 0 28px; color:#475569;">Cliquez sur le bouton ci-dessous pour vous connecter à votre espace ${ctx.appHtml}. Ce lien est valable 5 minutes et ne peut être utilisé qu'une seule fois.</p>
    ${ctaButton('Se connecter', url, ctx.theme)}
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — aucun compte ne sera modifié.</p>
  `, ctx.theme);

  const { error } = await resend.emails.send({
    from: ctx.from,
    to: email,
    subject: `Votre lien de connexion ${ctx.app}`,
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendOTPEmail(email: string, otp: string) {
  const ctx = await accountContext(email);
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${ctx.accent};">Connexion sans mot de passe</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Votre code de connexion</h1>
    <p style="margin:0 0 24px; color:#475569;">Saisissez ce code dans ${ctx.appHtml} pour vous connecter. Il est valable 5 minutes.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" bgcolor="#f8f7fc" class="email-otp-box" style="padding:20px; border-radius:14px; background-color:#f8f7fc; border:1px solid #ede9fe;">
          <span class="email-otp-code" style="font-size:32px; font-weight:700; letter-spacing:10px; color:${ctx.accent}; font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${otp}</span>
        </td>
      </tr>
    </table>
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — aucun compte ne sera modifié.</p>
  `, ctx.theme);

  const { error } = await resend.emails.send({
    from: ctx.from,
    to: email,
    subject: `Votre code de connexion ${ctx.app}`,
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendVerificationEmail(email: string, url: string) {
  const ctx = await accountContext(email);
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${ctx.accent};">Vérification d'email</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Confirmez votre adresse email</h1>
    <p style="margin:0 0 28px; color:#475569;">Cliquez sur le bouton ci-dessous pour confirmer cette adresse email sur votre compte ${ctx.appHtml}.</p>
    ${ctaButton('Confirmer mon email', url, ctx.theme)}
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.</p>
  `, ctx.theme);

  const { error } = await resend.emails.send({
    from: ctx.from,
    to: email,
    subject: `Confirmez votre adresse email ${ctx.app}`,
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendChangeEmailConfirmationEmail(
  oldEmail: string,
  newEmail: string,
  url: string,
) {
  const ctx = await accountContext(oldEmail);
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${ctx.accent};">Sécurité du compte</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Confirmez le changement d'adresse email</h1>
    <p style="margin:0 0 28px; color:#475569;">Une demande de changement d'adresse email a été faite sur votre compte ${ctx.appHtml}, de <strong>${oldEmail}</strong> vers <strong>${newEmail}</strong>. Cliquez ci-dessous pour l'autoriser.</p>
    ${ctaButton('Autoriser le changement', url, ctx.theme)}
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — votre adresse restera inchangée.</p>
  `, ctx.theme);

  const { error } = await resend.emails.send({
    from: ctx.from,
    to: oldEmail,
    subject: `Confirmez le changement d'adresse email ${ctx.app}`,
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendDeleteAccountVerificationEmail(email: string, name: string, url: string) {
  const ctx = await accountContext(email);
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${ctx.accent};">Sécurité du compte</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Confirmez la suppression de votre compte</h1>
    <p style="margin:0 0 28px; color:#475569;">Bonjour ${escapeHtml(name)}, une demande de suppression de votre compte ${ctx.appHtml} a été faite. Cliquez ci-dessous pour la confirmer. Ce lien est valable 24 heures et ne peut être utilisé qu'une seule fois.</p>
    ${ctaButton('Confirmer la suppression', url, ctx.theme)}
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — votre compte restera intact.</p>
  `, ctx.theme);

  const { error } = await resend.emails.send({
    from: ctx.from,
    to: email,
    subject: `Confirmez la suppression de votre compte ${ctx.app}`,
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendAccountDeletedEmail(email: string, name: string) {
  const ctx = await accountContext(email);
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${ctx.accent};">Sécurité du compte</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Votre compte a été supprimé</h1>
    <p style="margin:0 0 12px; color:#475569;">Bonjour ${escapeHtml(name)}, votre compte ${ctx.appHtml} vient d'être désactivé et n'est plus accessible.</p>
    <p style="margin:0; color:#475569;">Vous disposez de ${ACCOUNT_DELETION_RETENTION_DAYS} jours pour contacter notre support si vous souhaitez le récupérer. Passé ce délai, votre compte et toutes les données associées seront définitivement et irréversiblement supprimés.</p>
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette suppression, contactez notre support au plus vite.</p>
  `, ctx.theme);

  const { error } = await resend.emails.send({
    from: ctx.from,
    to: email,
    subject: `Votre compte ${ctx.app} a été supprimé`,
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendPasswordChangedEmail(email: string) {
  const ctx = await accountContext(email);
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${ctx.accent};">Sécurité du compte</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Votre mot de passe a été modifié</h1>
    <p style="margin:0; color:#475569;">Le mot de passe de votre compte ${ctx.appHtml} vient d'être changé avec succès.</p>
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de ce changement, contactez notre support immédiatement.</p>
  `, ctx.theme);

  const { error } = await resend.emails.send({
    from: ctx.from,
    to: email,
    subject: `Votre mot de passe ${ctx.app} a été modifié`,
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendTwoFactorEnabledEmail(email: string) {
  const ctx = await accountContext(email);
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${ctx.accent};">Sécurité du compte</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Double authentification activée</h1>
    <p style="margin:0; color:#475569;">La double authentification vient d'être activée sur votre compte ${ctx.appHtml}. Une connexion nécessitera désormais un code de votre application d'authentification.</p>
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette action, contactez notre support immédiatement.</p>
  `, ctx.theme);

  const { error } = await resend.emails.send({
    from: ctx.from,
    to: email,
    subject: `Double authentification activée sur ${ctx.app}`,
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendTwoFactorDisabledEmail(email: string) {
  const ctx = await accountContext(email);
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${ctx.accent};">Sécurité du compte</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Double authentification désactivée</h1>
    <p style="margin:0; color:#475569;">La double authentification vient d'être désactivée sur votre compte ${ctx.appHtml}.</p>
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette action, contactez notre support immédiatement et réactivez la double authentification.</p>
  `, ctx.theme);

  const { error } = await resend.emails.send({
    from: ctx.from,
    to: email,
    subject: `Double authentification désactivée sur ${ctx.app}`,
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendAccountUnlinkedEmail(email: string, providerLabel: string) {
  const ctx = await accountContext(email);
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${ctx.accent};">Sécurité du compte</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Compte ${providerLabel} délié</h1>
    <p style="margin:0; color:#475569;">Votre compte ${providerLabel} vient d'être délié de votre compte ${ctx.appHtml}. Vous ne pourrez plus l'utiliser pour vous connecter.</p>
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette action, contactez notre support immédiatement.</p>
  `, ctx.theme);

  const { error } = await resend.emails.send({
    from: ctx.from,
    to: email,
    subject: `Compte ${providerLabel} délié de ${ctx.app}`,
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendResetPasswordEmail(email: string, url: string) {
  const ctx = await accountContext(email);
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${ctx.accent};">Sécurité du compte</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Réinitialisez votre mot de passe</h1>
    <p style="margin:0 0 28px; color:#475569;">Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe. Ce lien est valable 1 heure et ne peut être utilisé qu'une seule fois.</p>
    ${ctaButton('Réinitialiser le mot de passe', url, ctx.theme)}
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — votre mot de passe restera inchangé.</p>
  `, ctx.theme);

  const { error } = await resend.emails.send({
    from: ctx.from,
    to: email,
    subject: `Réinitialisez votre mot de passe ${ctx.app}`,
    html,
  });

  if (error) throw new Error(error.message);
}
