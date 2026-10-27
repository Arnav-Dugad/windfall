import { useMutation } from "@tanstack/react-query";
import { Check, FileUp, ImagePlus } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useId, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const RULES = {
  photo: { types: ["image/jpeg", "image/png", "image/webp"], maxMb: 5, accept: "image/jpeg,image/png,image/webp" },
  proof: { types: ["image/jpeg", "image/png", "image/webp", "application/pdf"], maxMb: 10, accept: "image/*,application/pdf" },
} as const;

/**
 * Drag-and-drop (or tap) upload to R2 via /api/uploads. If R2 isn't configured the API acknowledges
 * without storing; we still hand back a local marker so the demo flow continues.
 */
export function FileDrop({
  kind,
  onUploaded,
  className,
}: {
  kind: "photo" | "proof";
  onUploaded: (key: string, previewUrl: string | null, file: File) => void;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const rule = RULES[kind];

  const upload = useMutation({
    mutationFn: (file: File) => api.upload(file, kind),
    onSuccess: (r, file) => {
      setDone(file.name);
      const preview = kind === "photo" ? URL.createObjectURL(file) : null;
      onUploaded(r.key ?? `local:${file.name}`, preview, file);
    },
    onError: (e) => setError(e.message),
  });

  const handle = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!(rule.types as readonly string[]).includes(file.type)) return setError(kind === "photo" ? "Use a JPG, PNG or WebP image." : "Use a PDF or an image.");
    if (file.size > rule.maxMb * 1024 * 1024) return setError(`Keep it under ${rule.maxMb} MB.`);
    upload.mutate(file);
  };

  const Icon = kind === "photo" ? ImagePlus : FileUp;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          handle(e.dataTransfer.files[0]);
        }}
        aria-describedby={`${id}-hint`}
        className={cn(
          "relative flex w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-tile border border-dashed px-6 py-8 text-center transition-colors duration-(--duration-base) ring-focus",
          over ? "border-accent bg-accent-soft" : done ? "border-positive bg-positive-soft" : "border-line-strong bg-surface-2 hover:border-ink-3",
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          {upload.isPending ? (
            <m.span key="up" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-2">
              <span className="size-6 animate-spin rounded-full border-2 border-ink/20 border-t-ink" aria-hidden />
              <span className="text-[14px] font-medium">Uploading securely…</span>
            </m.span>
          ) : done ? (
            <m.span key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-2 text-positive-ink">
              <span className="grid size-9 place-items-center rounded-full bg-positive text-white">
                <Check className="size-5" aria-hidden />
              </span>
              <span className="max-w-full truncate text-[14px] font-medium">{done}</span>
              <span className="text-[12.5px]">Tap to replace</span>
            </m.span>
          ) : (
            <m.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-2">
              <Icon className="size-6 text-ink-2" aria-hidden />
              <span className="text-[14.5px] font-medium">{kind === "photo" ? "Add a photo" : "Upload a statement or bill"}</span>
            </m.span>
          )}
        </AnimatePresence>
        <span id={`${id}-hint`} className="text-[12.5px] text-ink-3">
          {kind === "photo" ? `JPG, PNG or WebP · up to ${rule.maxMb} MB` : `PDF or image · up to ${rule.maxMb} MB · never shown publicly`}
        </span>
      </button>
      <input ref={input} type="file" accept={rule.accept} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => handle(e.target.files?.[0])} />
      {error && (
        <p role="alert" className="mt-2 text-[13.5px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
