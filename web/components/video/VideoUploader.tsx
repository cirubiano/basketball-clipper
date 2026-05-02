"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, Film, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const ACCEPTED = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska"];
const MAX_SIZE_GB = 15;
const MAX_BYTES = MAX_SIZE_GB * 1024 ** 3;

interface VideoUploaderProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export function VideoUploader({ onFile, disabled = false }: VideoUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function validate(file: File): string | null {
    if (!ACCEPTED.includes(file.type)) return "Formato no soportado. Usa MP4, MOV, AVI o MKV.";
    if (file.size > MAX_BYTES) return `El archivo supera el límite de ${MAX_SIZE_GB} GB.`;
    return null;
  }

  function handleFile(file: File) {
    const err = validate(file);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setSelected(file);
    onFile(file);
  }

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disabled]
  );

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    setSelected(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="w-full">
      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-all duration-200 cursor-pointer select-none",
          // #37 — enhanced drag state: animated ring + accent fill
          dragOver && !disabled && "border-primary bg-primary/8 ring-4 ring-primary/20 scale-[1.01]",
          !dragOver && !selected && "border-muted-foreground/30 hover:border-primary/60 hover:bg-accent/30",
          disabled && "opacity-50 cursor-not-allowed",
          selected && "border-primary/60 bg-primary/5"
        )}
      >
        {/* #37 — drag-over overlay with clear "drop here" message */}
        {dragOver && !disabled && (
          <div className="absolute inset-0 rounded-xl flex flex-col items-center justify-center bg-primary/5 z-10 pointer-events-none">
            <Upload className="h-12 w-12 text-primary mb-2 animate-bounce" />
            <p className="text-base font-semibold text-primary">Suelta aquí para subir</p>
            <p className="text-xs text-primary/70 mt-1">MP4 · MOV · AVI · MKV</p>
          </div>
        )}

        {selected ? (
          <>
            <Film className="h-10 w-10 text-primary" />
            <div className="text-center">
              <p className="font-medium text-sm">{selected.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {(selected.size / 1024 ** 2).toFixed(1)} MB · listo para subir
              </p>
            </div>
            {!disabled && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 h-6 w-6"
                onClick={clear}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </>
        ) : (
          <>
            <Upload className="h-10 w-10 text-muted-foreground" />
            <div className="text-center">
              <p className="font-medium text-sm">Arrastra un vídeo aquí</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                o haz clic para seleccionar
              </p>
            </div>
            <div className="flex gap-2 mt-1">
              {["MP4", "MOV", "AVI", "MKV"].map((fmt) => (
                <span key={fmt} className="text-[10px] rounded border border-border px-1.5 py-0.5 text-muted-foreground font-mono">
                  {fmt}
                </span>
              ))}
              <span className="text-[10px] rounded border border-border px-1.5 py-0.5 text-muted-foreground">
                máx. {MAX_SIZE_GB} GB
              </span>
            </div>
          </>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}
