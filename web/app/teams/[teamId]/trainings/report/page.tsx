"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart2, Download, Users, Dumbbell } from "lucide-react";
import Link from "next/link";
import { listTrainings } from "@basketball-clipper/shared/api";
import { PageShell } from "@/components/layout/PageShell";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type ReportView = "players" | "trainings";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtPct(n: number) {
  return `${Math.round(n)}%`;
}

function pctColor(pct: number) {
  if (pct >= 80) return "text-green-600";
  if (pct >= 60) return "text-amber-600";
  return "text-destructive";
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function TrainingReportPage({
  params,
}: {
  params: { teamId: string };
}) {
  const teamId = Number(params.teamId);
  const { token, activeProfile } = useAuth();
  const clubId = activeProfile?.club_id;

  // Default date range: last 30 days → today
  const todayStr = new Date().toISOString().slice(0, 10);
  const thirtyAgo = new Date();
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const thirtyAgoStr = thirtyAgo.toISOString().slice(0, 10);

  const [fromDate, setFromDate] = useState(thirtyAgoStr);
  const [toDate, setToDate] = useState(todayStr);
  const [view, setView] = useState<ReportView>("players");

  const { data: trainings = [], isLoading } = useQuery({
    queryKey: ["trainings", clubId, teamId],
    queryFn: () => listTrainings(token!, clubId!, teamId),
    enabled: !!token && !!clubId,
  });

  // ── filter by date range ──────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const from = new Date(fromDate);
    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999);
    return trainings.filter((t) => {
      if (t.archived_at) return false;
      const d = new Date(t.date);
      return d >= from && d <= to;
    });
  }, [trainings, fromDate, toDate]);

  // ── player attendance stats ───────────────────────────────────────────────

  const playerStats = useMemo(() => {
    const map = new Map<
      number,
      { name: string; present: number; late: number; absent: number; total: number }
    >();
    for (const t of filtered) {
      for (const att of t.training_attendances) {
        const name =
          [att.player_first_name, att.player_last_name].filter(Boolean).join(" ") ||
          `Jugador #${att.player_id}`;
        const prev = map.get(att.player_id) ?? {
          name,
          present: 0,
          late: 0,
          absent: 0,
          total: 0,
        };
        map.set(att.player_id, {
          name: prev.name,
          present: prev.present + (att.attended && !att.is_late ? 1 : 0),
          late: prev.late + (att.attended && att.is_late ? 1 : 0),
          absent: prev.absent + (!att.attended ? 1 : 0),
          total: prev.total + 1,
        });
      }
    }
    return Array.from(map.values())
      .map((p) => ({
        ...p,
        pct: p.total > 0 ? ((p.present + p.late) / p.total) * 100 : 0,
      }))
      .sort((a, b) => b.pct - a.pct);
  }, [filtered]);

  const teamAvgPct =
    playerStats.length > 0
      ? playerStats.reduce((s, p) => s + p.pct, 0) / playerStats.length
      : null;

  // ── training summary ──────────────────────────────────────────────────────

  const trainingSummaries = useMemo(
    () =>
      filtered
        .map((t) => {
          const total = t.training_attendances.length;
          const present = t.training_attendances.filter(
            (a) => a.attended,
          ).length;
          return { id: t.id, date: t.date, title: t.title, present, total };
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [filtered],
  );

  // ── print / export ────────────────────────────────────────────────────────

  function handlePrint() {
    window.print();
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <PageShell>
      <div className="container mx-auto px-4 py-8 max-w-3xl print:px-0 print:py-4">
        {/* Header */}
        <div className="mb-6 print:hidden">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <BarChart2 className="h-6 w-6 text-muted-foreground" />
                Informe de asistencia
              </h1>
              {activeProfile?.team_name && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {activeProfile.team_name}
                </p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Download className="h-4 w-4 mr-1.5" />
              Exportar PDF
            </Button>
          </div>
        </div>

        {/* Print-only header */}
        <div className="hidden print:block mb-6">
          <h1 className="text-xl font-bold">
            Informe de asistencia — {activeProfile?.team_name ?? "Equipo"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {fmtDate(fromDate)} → {fmtDate(toDate)}
          </p>
        </div>

        {/* Date range + view toggle */}
        <div className="flex flex-wrap gap-4 items-end mb-6 print:hidden">
          <div className="space-y-1">
            <Label htmlFor="from-date" className="text-xs">
              Desde
            </Label>
            <Input
              id="from-date"
              type="date"
              className="h-8 text-xs w-36"
              value={fromDate}
              max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to-date" className="text-xs">
              Hasta
            </Label>
            <Input
              id="to-date"
              type="date"
              className="h-8 text-xs w-36"
              value={toDate}
              min={fromDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <div className="flex gap-1 ml-auto">
            <button
              onClick={() => setView("players")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border transition-colors",
                view === "players"
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <Users className="h-3 w-3" />
              Por jugador
            </button>
            <button
              onClick={() => setView("trainings")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border transition-colors",
                view === "trainings"
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <Dumbbell className="h-3 w-3" />
              Entrenamientos
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="border rounded-lg p-10 text-center text-muted-foreground text-sm">
            No hay entrenamientos en el período seleccionado.
          </div>
        ) : (
          <>
            {/* Summary bar */}
            <div className="flex gap-6 text-sm mb-4 p-3 bg-muted/40 rounded-lg">
              <div>
                <p className="text-xs text-muted-foreground">Entrenamientos</p>
                <p className="font-bold text-lg leading-tight">{filtered.length}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Jugadores</p>
                <p className="font-bold text-lg leading-tight">{playerStats.length}</p>
              </div>
              {teamAvgPct !== null && (
                <div>
                  <p className="text-xs text-muted-foreground">Asistencia media</p>
                  <p className={cn("font-bold text-lg leading-tight", pctColor(teamAvgPct))}>
                    {fmtPct(teamAvgPct)}
                  </p>
                </div>
              )}
            </div>

            {/* View: by player */}
            {view === "players" && (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">
                        Jugador
                      </th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">
                        Asistencia
                      </th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">
                        Presentes
                      </th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">
                        Retrasos
                      </th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">
                        Ausencias
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {playerStats.map((p) => (
                      <tr key={p.name} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 font-medium">{p.name}</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={cn("font-semibold", pctColor(p.pct))}>
                            {fmtPct(p.pct)}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">
                            ({p.present + p.late}/{p.total})
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-muted-foreground hidden sm:table-cell">
                          {p.present}
                        </td>
                        <td className="px-3 py-2.5 text-right text-amber-600 hidden sm:table-cell">
                          {p.late > 0 ? p.late : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right hidden sm:table-cell">
                          {p.absent > 0 ? (
                            <span className="text-destructive">{p.absent}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* View: completed trainings */}
            {view === "trainings" && (
              <div className="border rounded-lg divide-y">
                {trainingSummaries.map((t) => (
                  <Link
                    key={t.id}
                    href={`/teams/${teamId}/trainings/${t.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium">{t.title}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(t.date)}</p>
                    </div>
                    {t.total > 0 ? (
                      <div className="text-right shrink-0 ml-4">
                        <p
                          className={cn(
                            "text-sm font-semibold",
                            pctColor((t.present / t.total) * 100),
                          )}
                        >
                          {t.present}/{t.total}
                        </p>
                        <p className="text-xs text-muted-foreground">asistentes</p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground shrink-0 ml-4">
                        Sin registro
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          .print\\:hidden {
            display: none !important;
          }
          .print\\:block {
            display: block !important;
          }
          body {
            background: white;
          }
        }
      `}</style>
    </PageShell>
  );
}
