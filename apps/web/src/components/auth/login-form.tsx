'use client';

import { useEffect, useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { signIn, twoFactor } from '@/lib/auth/auth-client';
import { translateAuthError } from '@/lib/auth/auth-errors';
import { PasswordlessLogin } from '@/components/auth/passwordless-login';
import { SocialLoginButtons } from '@/components/auth/social-login-buttons';
import { TwoFactorChallenge } from '@/components/auth/two-factor-challenge';
import { CheckField, FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { PORTAL_COOKIE, PORTAL_HEADER, portalPath } from '@/lib/portal/portal-slug';

// `portal` : connexion par le portail d'un cabinet (D76). Le serveur y reconnait le
// cabinet (en-tete, cookie ou adresse de retour) ; sans lui, un gestionnaire, une
// entreprise ou un collaborateur est refuse et renvoye vers son portail.
export function LoginForm({ portal }: { portal?: { slug: string } } = {}) {
  const router = useRouter();
  const portalOptions = portal ? { headers: { [PORTAL_HEADER]: portal.slug } } : undefined;
  const afterLoginPath = portal ? '/dashboard' : '/bienvenue';
  // Google et Microsoft passent par une redirection : on y revient par une page du
  // portail, qui renvoie vers le tableau de bord. Une erreur revient sur le portail.
  const socialRedirect = portal
    ? { callbackURL: `${portalPath(portal.slug)}/continuer`, errorCallbackURL: portalPath(portal.slug) }
    : { callbackURL: '/bienvenue' };
  const [portalLink, setPortalLink] = useState<string | null>(null);

  // Cookie de portail, lu par le serveur au retour de Google/Microsoft (10 minutes).
  // Sur la page de SocialFlow il est EFFACE : sinon le cookie laisse par la visite d'un
  // portail ferait refuser (wrong_portal) le titulaire ou le SuperAdmin qui se connecte
  // ici dans les 10 minutes qui suivent.
  function announcePortal() {
    document.cookie = portal
      ? `${PORTAL_COOKIE}=${portal.slug}; path=/; max-age=600; samesite=lax`
      : `${PORTAL_COOKIE}=; path=/; max-age=0; samesite=lax`;
  }
  // Toute connexion de cette page (mot de passe, code, lien) part avec le bon cookie.
  useEffect(announcePortal, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [mode, setMode] = useState<'password' | 'passwordless'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [microsoftLoading, setMicrosoftLoading] = useState(false);

  async function handleGoogleSignIn() {
    setError(null);
    setGoogleLoading(true);

    announcePortal();
    const { error: googleError } = await signIn.social({
      provider: 'google',
      ...socialRedirect,
    });

    if (googleError) {
      setGoogleLoading(false);
      setError(translateAuthError(googleError.code));
    }
  }

  async function handleMicrosoftSignIn() {
    setError(null);
    setMicrosoftLoading(true);

    announcePortal();
    const { error: microsoftError } = await signIn.social({
      provider: 'microsoft',
      ...socialRedirect,
    });

    if (microsoftError) {
      setMicrosoftLoading(false);
      setError(translateAuthError(microsoftError.code));
    }
  }

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    setPortalLink(null);
    const { data, error: signInError } = await signIn.email(
      { email, password, rememberMe },
      portalOptions,
    );

    setLoading(false);

    if (signInError) {
      // Cas particulier : contrairement aux autres erreurs affichees inline,
      // un cabinet suspendu redirige vers la page d'erreur commune (voir
      // hooks.after de auth.ts) - message clair plutot que "mot de passe
      // incorrect", choix produit assume malgre la legere prise
      // d'enumeration que ca autorise.
      if (signInError.code === 'CABINET_SUSPENDED') {
        router.push('/erreur-connexion?error=cabinet_suspended');
        return;
      }
      if (signInError.code === 'USER_SUSPENDED') {
        router.push('/erreur-connexion?error=user_suspended');
        return;
      }
      // D52 : suspension posee par le cabinet de l'utilisateur.
      if (signInError.code === 'USER_SUSPENDED_BY_CABINET') {
        router.push('/erreur-connexion?error=user_suspended_by_cabinet');
        return;
      }
      // D76 : les identifiants sont bons mais cette page est celle de SocialFlow ; le
      // message de l'erreur est le chemin du portail du cabinet de la personne.
      if (signInError.code === 'PORTAL_REQUIRED' && signInError.message?.startsWith('/connexion/')) {
        setPortalLink(signInError.message);
      }
      setError(translateAuthError(signInError.code));
      return;
    }

    if ((data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
      setNeedsTwoFactor(true);
      return;
    }

    router.push(afterLoginPath);
    router.refresh();
  }

  async function handleTwoFactorSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: verifyError } = useBackupCode
      ? await twoFactor.verifyBackupCode({ code: twoFactorCode }, portalOptions)
      : await twoFactor.verifyTotp({ code: twoFactorCode }, portalOptions);

    setLoading(false);

    if (verifyError) {
      setError(translateAuthError(verifyError.code));
      return;
    }

    router.push(afterLoginPath);
    router.refresh();
  }

  if (needsTwoFactor) {
    return (
      <TwoFactorChallenge
        useBackupCode={useBackupCode}
        code={twoFactorCode}
        error={error}
        loading={loading}
        onCodeChange={setTwoFactorCode}
        onSubmit={handleTwoFactorSubmit}
        onBack={() => {
          setNeedsTwoFactor(false);
          setError(null);
          setTwoFactorCode('');
        }}
        onToggleBackupCode={() => {
          setUseBackupCode((v) => !v);
          setError(null);
          setTwoFactorCode('');
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {mode === 'password' && (
        <>
          <SocialLoginButtons
            googleLoading={googleLoading}
            microsoftLoading={microsoftLoading}
            onGoogle={handleGoogleSignIn}
            onMicrosoft={handleMicrosoftSignIn}
            onEmail={() => setMode('passwordless')}
          />

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">ou avec votre e-mail</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      {mode === 'passwordless' ? (
        <PasswordlessLogin onBack={() => setMode('password')} portal={portal} />
      ) : (
        <>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField id="email" label="Adresse email" required>
              {(control) => (
                <div className="relative">
                  <Mail
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    {...control}
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    placeholder="prenom@cabinet.be"
                  />
                </div>
              )}
            </FormField>

            {/* Le lien « Oublié ? » partage la ligne du libellé : FormField ne le permet pas. */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Mot de passe</Label>
                <Link
                  href={portal ? `${portalPath(portal.slug)}/mot-de-passe-oublie` : '/mot-de-passe-oublie'}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Oublié ?
                </Link>
              </div>
              <div className="relative">
                <Lock
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  aria-required="true"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                  placeholder="••••••••"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </Button>
              </div>
            </div>

            <CheckField label="Rester connecté" checked={rememberMe} onCheckedChange={setRememberMe} />

            {error && (
              <p role="alert" className="text-sm text-destructive-text">
                {error}
              </p>
            )}
            {portalLink && (
              <Link href={portalLink} className="block text-sm font-semibold text-primary hover:underline">
                Ouvrir le portail de mon cabinet
              </Link>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading && <Spinner />}
              Se connecter
            </Button>
          </form>

          {/* Un compte de cabinet client ne se cree pas ici (D76). */}
          {portal ? (
            <p className="text-center text-xs text-muted-foreground">
              Google et Microsoft fonctionnent une fois votre compte lié, depuis votre profil.
            </p>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Pas encore de compte ?{' '}
              <Link href="/register" className="font-semibold text-primary hover:underline">
                Créer un compte
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
