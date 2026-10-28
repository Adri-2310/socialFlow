'use client';

import { Mail } from 'lucide-react';
import { GoogleIcon, MicrosoftIcon } from '@/components/auth/oauth-icons';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

// Les trois portes d'entrée alternatives au mot de passe : Google, Microsoft, et le lien ou le
// code reçu par email. Sous `sm`, seule l'icône reste visible : le nom accessible vient donc de
// `aria-label`, car un texte masqué (`hidden`) ne compte pas dans le nom d'un bouton.
export function SocialLoginButtons({
  googleLoading,
  microsoftLoading,
  onGoogle,
  onMicrosoft,
  onEmail,
}: {
  googleLoading: boolean;
  microsoftLoading: boolean;
  onGoogle: () => void;
  onMicrosoft: () => void;
  onEmail: () => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Button
        type="button"
        variant="outline"
        onClick={onGoogle}
        disabled={googleLoading}
        aria-label="Se connecter avec Google"
      >
        {googleLoading ? <Spinner /> : <GoogleIcon className="h-4 w-4" />}
        <span className="hidden sm:inline">Google</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={onMicrosoft}
        disabled={microsoftLoading}
        aria-label="Se connecter avec Microsoft"
      >
        {microsoftLoading ? <Spinner /> : <MicrosoftIcon className="h-4 w-4" />}
        <span className="hidden sm:inline">Microsoft</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={onEmail}
        aria-label="Se connecter par email, sans mot de passe"
      >
        <Mail aria-hidden="true" />
        <span className="hidden sm:inline">Email</span>
      </Button>
    </div>
  );
}
