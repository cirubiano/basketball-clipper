"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { getDrill, updateDrill } from "@basketball-clipper/shared";
import type { CourtLayoutType, SequenceNode } from "@basketball-clipper/shared";
import { DrillEditor } from "@/components/drill-editor/DrillEditor";
import { Loader2 } from "lucide-react";

export default function DrillEditPage() {
  const { id }    = useParams<{ id: string }>();
  const { token } = useAuth();
  const qc        = useQueryClient();
  const drillId   = Number(id);

  const { data: drill, isLoading, error } = useQuery({
    queryKey: ["drill", drillId],
    queryFn: () => getDrill(token!, drillId),
    enabled: !!token && !!drillId,
  });

  const saveMut = useMutation({
    mutationFn: (patch: { name?: string; court_layout?: CourtLayoutType; root_sequence?: SequenceNode }) =>
      updateDrill(token!, drillId, patch),
    onSuccess: (updated) => {
      qc.setQueryData(["drill", drillId], updated);
      qc.invalidateQueries({ queryKey: ["drills"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !drill) {
    return (
      <div className="flex items-center justify-center h-screen text-muted-foreground">
        No se pudo cargar el elemento.
      </div>
    );
  }

  return (
    <DrillEditor
      drill={drill}
      onSave={async (patch) => { await saveMut.mutateAsync(patch); }}
    />
  );
}
