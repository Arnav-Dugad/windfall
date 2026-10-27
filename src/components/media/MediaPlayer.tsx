import { useQuery } from "@tanstack/react-query";
import { Captions, Pause, Play } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/Feedback";
import { getMedia } from "@/lib/social";
import { cn } from "@/lib/utils";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Deterministic pseudo-waveform from the media id (the real waveform isn't stored, and doesn't need to be). */
function bars(seed: string, n = 36) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return Array.from({ length: n }, (_, i) => {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    const r = ((h >>> 0) % 1000) / 1000;
    const envelope = Math.sin((Math.PI * (i + 0.5)) / n) * 0.55 + 0.45;
    return 0.18 + r * 0.82 * envelope;
  });
}

/** A thank-you voice note or short video attached to an update, with its on-device auto-caption. */
export function MediaPlayer({ requestId, mediaId, accent }: { requestId: string; mediaId: string; accent?: string | null }) {
  const q = useQuery({ queryKey: ["media", requestId, mediaId], queryFn: () => getMedia(requestId, mediaId), staleTime: Infinity });
  if (q.isPending) return <Skeleton className="mt-3 h-16 rounded-[20px]" />;
  if (!q.data) return null;
  return q.data.kind === "video" ? (
    <VideoNote src={q.data.dataUrl} caption={q.data.caption} durationSec={q.data.durationSec} />
  ) : (
    <VoiceNote id={mediaId} src={q.data.dataUrl} caption={q.data.caption} durationSec={q.data.durationSec} accent={accent} />
  );
}

function VoiceNote({ id, src, caption, durationSec, accent }: { id: string; src: string; caption: string | null; durationSec: number; accent?: string | null }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const heights = useMemo(() => bars(id), [id]);
  // MediaRecorder webm often reports an Infinity duration, so fall back to the recorded length.
  const [measured, setMeasured] = useState<number | null>(null);
  const duration = measured ?? durationSec;
  const frac = duration ? Math.min(1, t / duration) : 0;
  const words = useMemo(() => caption?.split(/\s+/).filter(Boolean) ?? [], [caption]);
  const shown = playing || t > 0 ? Math.ceil(words.length * frac) : words.length;

  return (
    <div className="mt-3 rounded-[20px] bg-fill p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => (audio.current?.paused ? void audio.current.play() : audio.current?.pause())}
          className="press grid size-10 shrink-0 place-items-center rounded-full text-white ring-focus"
          style={{ background: accent ?? "var(--wf-accent)" }}
          aria-label={playing ? "Pause voice note" : "Play voice note"}
        >
          {playing ? <Pause className="size-4" aria-hidden fill="currentColor" /> : <Play className="size-4 translate-x-px" aria-hidden fill="currentColor" />}
        </button>
        <div
          className="flex h-9 min-w-0 flex-1 cursor-pointer items-center gap-[3px]"
          aria-hidden
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            if (audio.current && duration) audio.current.currentTime = ((e.clientX - r.left) / r.width) * duration;
          }}
        >
          {heights.map((h, i) => (
            <span
              key={i}
              className={cn("w-full rounded-full transition-colors duration-150", i / heights.length < frac ? "" : "bg-ink-3/35")}
              style={{ height: `${h * 100}%`, background: i / heights.length < frac ? (accent ?? "var(--wf-accent)") : undefined }}
            />
          ))}
        </div>
        <span className="w-10 text-right text-[12px] text-ink-3 num">{fmt(playing || t > 0 ? t : duration)}</span>
      </div>
      {caption && (
        <p className="mt-2.5 flex gap-1.5 px-1 text-[14px] leading-relaxed text-ink-2">
          <Captions className="mt-[3px] size-3.5 shrink-0 text-ink-3" aria-label="Auto-caption" />
          <span>
            {/* Words light up roughly in time with playback. */}
            {words.map((w, i) => (
              <span key={i} className={cn("transition-colors duration-200", i < shown ? "text-ink" : "text-ink-3")}>
                {w}{" "}
              </span>
            ))}
          </span>
        </p>
      )}
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setMeasured(d);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setT(0);
        }}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
      />
    </div>
  );
}

function VideoNote({ src, caption, durationSec }: { src: string; caption: string | null; durationSec: number }) {
  // The caption becomes a real WebVTT track, so native caption controls and screen readers pick it up.
  const track = useMemo(() => {
    if (!caption) return null;
    const end = fmt(Math.max(1, durationSec)).padStart(5, "0");
    return `data:text/vtt;charset=utf-8,${encodeURIComponent(`WEBVTT\n\n00:00.000 --> ${end}.000\n${caption}\n`)}`;
  }, [caption, durationSec]);

  return (
    <figure className="mt-3 max-w-xs">
      <video src={src} controls playsInline preload="metadata" className="squircle aspect-[3/4] w-full rounded-[22px] bg-black object-cover shadow-card">
        {track && <track kind="captions" src={track} srcLang="en" label="Auto-captions" default />}
      </video>
      {caption && (
        <figcaption className="mt-2 flex gap-1.5 text-[13.5px] leading-relaxed text-ink-2">
          <Captions className="mt-[3px] size-3.5 shrink-0 text-ink-3" aria-label="Auto-caption" />
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
