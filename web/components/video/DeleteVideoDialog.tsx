"use client";

import { Loader2 } from "lucide-react";
import type { VideoListItem } from "@basketball-clipper/shared/types";
import { Button } from "@/components/ui/button";

interface DeleteVideoDialogProps {
  video: VideoListItem;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteVideoDialog({
  video,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteVideoDialogProps) {
  const title = video.title?.trim() || video.filename;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={isDeleting ? undefined : onCancel}
      />
      <div className="relative w-full max-w-md rounded-lg bg-background p-6 shadow-lg">
        <h2 className="text-lg font-semibold">Borrar este vídeo</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Vas a borrar definitivamente <span className="font-medium text-foreground">{title}</span>{" "}
          y sus <span className="font-medium text-foreground">
            {video.clips_count} {video.clips_count === 1 ? "clip" : "clips"}
          </span>. Esta acción no se puede deshacer.
        </p>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onCancel} disabled={isDeleting}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Borrar
          </Button>
        </div>
      </div>
    </div>
  );
}
