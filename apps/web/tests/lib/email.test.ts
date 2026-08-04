// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

// Contrairement aux autres fichiers de tests (qui mockent '@/lib/email' pour
// tester auth.ts sans toucher au reseau), ce fichier teste directement les
// fonctions d'envoi elles-memes : on mocke seulement le SDK Resend pour
// intercepter le HTML genere sans l'envoyer reellement, et verifier
// l'echappement des champs texte libre (voir doc/analysis/AUDIT_SECURITE_AUTH.md,
// finding #6).
const send = vi.fn().mockResolvedValue({ data: { id: 'test' }, error: null });
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));

const { sendAccountDeletedEmail, sendDeleteAccountVerificationEmail } = await import('@/lib/email');

const NOM_MALVEILLANT = '<img src=x onerror=alert(1)>';
const NOM_ECHAPPE = '&lt;img src=x onerror=alert(1)&gt;';

describe('echappement HTML des champs texte libre dans les emails', () => {
  it("echappe `name` dans l'email de suppression de compte", async () => {
    await sendAccountDeletedEmail('victime@socialflow.page', NOM_MALVEILLANT);

    const html = send.mock.calls.at(-1)?.[0].html as string;
    expect(html).not.toContain(NOM_MALVEILLANT);
    expect(html).toContain(NOM_ECHAPPE);
  });

  it("echappe `name` dans l'email de confirmation de suppression", async () => {
    await sendDeleteAccountVerificationEmail(
      'victime@socialflow.page',
      NOM_MALVEILLANT,
      'https://socialflow.page/api/auth/delete-user/callback?token=abc',
    );

    const html = send.mock.calls.at(-1)?.[0].html as string;
    expect(html).not.toContain(NOM_MALVEILLANT);
    expect(html).toContain(NOM_ECHAPPE);
  });
});
