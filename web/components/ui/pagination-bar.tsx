"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// #48 — PaginationBar: reusable client-side pagination control.
// Usage:
//   const [page, setPage] = useState(1);
//   const totalPages = Math.ceil(items.length / PAGE_SIZE);
//   const visible = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
//   <PaginationBar page={page} totalPages={totalPages} onPage={setPage} />

interface PaginationBarProps {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
  className?: string;
}

export function PaginationBar({ page, totalPages, onPage, className }: PaginationBarProps) {
  if (totalPages <= 1) return null;

  // Build the page number window: always show first, last, and up to 3 around current.
  const pages: (number | "…")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  return (
    <div className={cn("flex items-center justify-center gap-1 mt-6", className)}>
      <button
        onClick={() => onPage(page - 1)}
        disabled={page === 1}
        aria-label="Página anterior"
        className="h-8 w-8 flex items-center justify-center rounded-md border border-border text-muted-foreground
                   hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} className="h-8 w-8 flex items-center justify-center text-sm text-muted-foreground select-none">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPage(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn(
              "h-8 w-8 flex items-center justify-center rounded-md text-sm font-medium transition-colors",
              p === page
                ? "bg-foreground text-background pointer-events-none"
                : "border border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {p}
          </button>
        ),
      )}

      <button
        onClick={() => onPage(page + 1)}
        disabled={page === totalPages}
        aria-label="Página siguiente"
        className="h-8 w-8 flex items-center justify-center rounded-md border border-border text-muted-foreground
                   hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
