import Link from 'next/link';
import Image from 'next/image';

export function Footer() {
  return (
    <footer className="border-t border-border/60 bg-card/60 backdrop-blur-sm">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo-simple.png" alt="SocialFlow" width={32} height={32} className="rounded-lg" />
            <span className="text-lg font-bold tracking-tight">
              Social<span className="text-primary">Flow</span>
            </span>
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">
            La paie belge, enfin fluide.
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Produit</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <Link href="/fonctionnalites" className="hover:text-primary">
                Fonctionnalités
              </Link>
            </li>
            <li>
              <Link href="/tarifs" className="hover:text-primary">
                Tarifs
              </Link>
            </li>
            <li>
              <Link href="/pour-qui" className="hover:text-primary">
                Pour qui ?
              </Link>
            </li>
            <li>
              <Link href="/faq" className="hover:text-primary">
                FAQ
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Entreprise</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <a href="#" className="hover:text-primary">
                À propos
              </a>
            </li>
            <li>
              <a href="#" className="hover:text-primary">
                Contact
              </a>
            </li>
            <li>
              <a href="#" className="hover:text-primary">
                Support
              </a>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Légal</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <a href="#" className="hover:text-primary">
                RGPD
              </a>
            </li>
            <li>
              <a href="#" className="hover:text-primary">
                Conditions
              </a>
            </li>
            <li>
              <a href="#" className="hover:text-primary">
                Confidentialité
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        © 2026 SocialFlow. Tous droits réservés.
      </div>
    </footer>
  );
}
