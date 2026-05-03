"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Trophy, Swords, Users } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import PartidosTab from "./_tabs/PartidosTab";
import CompeticionesTab from "./_tabs/CompeticionesTab";
import RivalesTab from "./_tabs/RivalesTab";

type Tab = "partidos" | "competiciones" | "rivales";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "competiciones", label: "Ligas", icon: <Swords className="h-4 w-4" /> },
  { id: "rivales", label: "Rivales", icon: <Users className="h-4 w-4" /> },
  { id: "partidos", label: "Partidos", icon: <Trophy className="h-4 w-4" /> },
];

function MatchesHub({ teamId }: { teamId: number }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = (searchParams.get("tab") as Tab | null) ?? "competiciones";

  function setTab(t: Tab, extra?: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", t);
    if (extra) {
      Object.entries(extra).forEach(([k, v]) => params.set(k, v));
    } else {
      // Clear competition filter when switching tabs manually
      params.delete("comp");
    }
    router.replace(`?${params.toString()}`);
  }

  function handleGoToMatches(competitionId?: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "partidos");
    if (competitionId) {
      params.set("comp", String(competitionId));
    } else {
      params.delete("comp");
    }
    router.replace(`?${params.toString()}`);
  }

  const compFilter = searchParams.get("comp");

  return (
    <PageShell requireAuth requireProfile>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Tab bar */}
        <div className="flex gap-1 border-b mb-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={[
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
              ].join(" ")}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {tab === "partidos" && (
          <PartidosTab
            teamId={teamId}
            initialCompetitionId={compFilter ? Number(compFilter) : undefined}
          />
        )}
        {tab === "competiciones" && (
          <CompeticionesTab teamId={teamId} onGoToMatches={handleGoToMatches} />
        )}
        {tab === "rivales" && <RivalesTab teamId={teamId} />}
      </div>
    </PageShell>
  );
}

export default function MatchesPage({
  params,
}: {
  params: { teamId: string };
}) {
  const teamId = Number(params.teamId);
  return (
    <Suspense>
      <MatchesHub teamId={teamId} />
    </Suspense>
  );
}
