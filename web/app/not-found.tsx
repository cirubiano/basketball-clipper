import Link from "next/link";
import { Film } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <Link href="/" className="flex items-center gap-2 font-semibold mb-10 text-primary">
        <Film className="h-5 w-5" />
        <span>Basketball Clipper</span>
      </Link>

      <p className="text-7xl font-bold text-muted-foreground/20 mb-4 select-none">404</p>
      <h1 className="text-xl font-semibold mb-2">Página no encontrada</h1>
      <p className="text-muted-foreground text-sm mb-8 max-w-sm">
        La dirección que has introducido no existe o ha sido movida.
      </p>

      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
