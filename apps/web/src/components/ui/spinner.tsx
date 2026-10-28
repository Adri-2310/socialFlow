import { cn } from "@/lib/utils"
import { Loader2Icon } from "lucide-react"

// Décoratif par défaut : dans un bouton, le texte porte déjà l'information. Un spinner seul doit
// recevoir `role="status"` et `aria-label="Chargement"` de l'appelant (le défaut de shadcn est
// en anglais).
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon data-slot="spinner" aria-hidden="true" className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
