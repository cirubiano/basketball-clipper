import type { ReactNode } from "react";
import { Film } from "lucide-react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/40 px-4">
      <div className="flex items-center gap-2 mb-8 font-semibold text-lg">
        <Film className="h-5 w-5 text-primary" />
        Basketball Clipper
      </div>
      {children}
    </div>
  );
}
