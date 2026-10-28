'use client';

import { GoogleIcon, MicrosoftIcon } from '@/components/auth/oauth-icons';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

// Inscription par Google ou Microsoft : deux boutons, chacun avec son propre état d'envoi.
export function SocialSignupButtons({
  googleLoading,
  microsoftLoading,
  onGoogle,
  onMicrosoft,
}: {
  googleLoading: boolean;
  microsoftLoading: boolean;
  onGoogle: () => void;
  onMicrosoft: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Button type="button" variant="outline" onClick={onGoogle} disabled={googleLoading}>
        {googleLoading ? <Spinner /> : <GoogleIcon className="h-4 w-4" />}
        Google
      </Button>
      <Button type="button" variant="outline" onClick={onMicrosoft} disabled={microsoftLoading}>
        {microsoftLoading ? <Spinner /> : <MicrosoftIcon className="h-4 w-4" />}
        Microsoft
      </Button>
    </div>
  );
}
