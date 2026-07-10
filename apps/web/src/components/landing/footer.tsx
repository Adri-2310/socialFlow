import Link from 'next/link';
import { Waves } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-8">
        <div>
          <a href="/" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Waves className="h-4 w-4" />
            </span>
            <span className="font-bold">
              Social<span className="text-primary">Flow</span>
            </span>
          </a>
          <p className="mt-3 text-sm text-muted-foreground">
            La paie belge, enfin fluide.
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold">Produit</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <a href="#features" className="hover:text-primary">
                Fonctionnalités
              </a>
            </li>
            <li>
              <a href="#pricing" className="hover:text-primary">
                Tarifs
              </a>
            </li>
            <li>
              <a href="#roles" className="hover:text-primary">
                Rôles
              </a>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold">Entreprise</p>
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
          <p className="text-sm font-semibold">Légal</p>
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
      <div className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © 2026 SocialFlow — Maquette de présentation. Tous droits réservés.
      </div>
    </footer>
  );
}
