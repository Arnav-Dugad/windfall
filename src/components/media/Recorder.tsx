import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Captions, Mic, RotateCcw, Square, Video } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ease } from "@/design/motion";
import { postMediaThanks } from "@/lib/social";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type Kind = "voice" | "video";
const LIMIT: Record<Kind, number> = { voice: 45, video: 15 };

// Minimal typing for the Web Speech API (not in lib.dom for every TS target).
interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
const SpeechRecognitionCtor = (globalThis as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition })
  .SpeechRecognition ?? (globalThis as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;

const supported = () => typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices?.getUserMedia;

function pickMime(kind: Kind) {
  const opts = kind === "voice" ? ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"] : ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/mp4", "video/webm"];
  return opts.find((t) => MediaRecorder.isTypeSupported(t));
}

type Phase = { name: "idle" } | { name: "recording"; started: number } | { name: "review"; blob: Blob; url: string; seconds: number };

/**
 * "Record a thank-you": a voice note (≤45s) or a short video (≤15s), recorded at a low bitrate so it fits
 * in Firestore, with live on-device captions (Web Speech API) where the browser supports them.
 */
export function Recorder({ requestId }: { requestId: string }) {
  const qc = useQueryClient();
  const id = useId();
  const [kind, setKind] = useState<Kind>("voice");
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [body, setBody] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recog = useRef<Recognition | null>(null);
  const preview = useRef<HTMLVideoElement>(null);
  const interimRef = useRef("");
  useEffect(() => {
    interimRef.current = interim;
  }, [interim]);

  const stopTracks = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => () => {
    recog.current?.stop();
    if (recorder.current?.state === "recording") recorder.current.stop();
    stopTracks();
  }, []);

  // Tick the timer and stop automatically at the limit.
  useEffect(() => {
    if (phase.name !== "recording") return;
    const t = setInterval(() => {
      const s = (performance.now() - phase.started) / 1000;
      setElapsed(s);
      if (s >= LIMIT[kind]) stop();
    }, 200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, kind]);

  const start = async () => {
    setError(null);
    setFinalText("");
    setInterim("");
    try {
      const s = await navigator.mediaDevices.getUserMedia(
        kind === "voice"
          ? { audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } }
          : { audio: { echoCancellation: true, channelCount: 1 }, video: { width: { ideal: 240 }, height: { ideal: 320 }, frameRate: { ideal: 20 }, facingMode: "user" } },
      );
      stream.current = s;
      if (kind === "video" && preview.current) {
        preview.current.srcObject = s;
        void preview.current.play().catch(() => undefined);
      }
      const mimeType = pickMime(kind);
      const rec = new MediaRecorder(s, { mimeType, audioBitsPerSecond: 24_000, ...(kind === "video" ? { videoBitsPerSecond: 280_000 } : {}) });
      const chunks: Blob[] = [];
      const began = performance.now();
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: rec.mimeType || mimeType || (kind === "voice" ? "audio/webm" : "video/webm") });
        stopTracks();
        if (preview.current) preview.current.srcObject = null;
        setPhase({ name: "review", blob, url: URL.createObjectURL(blob), seconds: Math.min(LIMIT[kind], (performance.now() - began) / 1000) });
      };
      rec.start(250);
      recorder.current = rec;
      setElapsed(0);
      setPhase({ name: "recording", started: began });

      if (SpeechRecognitionCtor) {
        const r = new SpeechRecognitionCtor();
        r.continuous = true;
        r.interimResults = true;
        r.lang = navigator.language || "en-US";
        r.onresult = (e) => {
          let fin = "";
          let mid = "";
          for (let i = 0; i < e.results.length; i++) {
            const res = e.results[i]!;
            if (res.isFinal) fin += res[0].transcript;
            else if (i >= e.resultIndex) mid += res[0].transcript;
          }
          setFinalText(fin.trim());
          setInterim(mid.trim());
        };
        r.onerror = () => undefined; // captions are a bonus; recording carries on without them
        try {
          r.start();
          recog.current = r;
        } catch {
          /* already running or blocked */
        }
      }
    } catch (err) {
      stopTracks();
      const name = err instanceof DOMException ? err.name : "";
      setError(
        name === "NotAllowedError"
          ? `Give needs permission to use your ${kind === "voice" ? "microphone" : "camera and microphone"}. You can allow it from the address bar.`
          : name === "NotFoundError"
            ? `No ${kind === "voice" ? "microphone" : "camera"} found on this device.`
            : "Recording couldn’t start on this device.",
      );
    }
  };

  function stop() {
    recog.current?.stop();
    recog.current = null;
    const pending = interimRef.current;
    if (pending) setFinalText((f) => `${f} ${pending}`.trim());
    setInterim("");
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  const reset = () => {
    if (phase.name === "review") URL.revokeObjectURL(phase.url);
    setPhase({ name: "idle" });
    setFinalText("");
    setElapsed(0);
  };

  const post = useMutation({
    mutationFn: () => {
      if (phase.name !== "review") throw new Error("Nothing recorded");
      const caption = finalText.trim() || null;
      return postMediaThanks(requestId, {
        blob: phase.blob,
        kind,
        durationSec: phase.seconds,
        caption,
        // Updates need 4–600 characters: use what was typed, else the caption, else a gentle default.
        body: [body.trim(), caption?.trim().slice(0, 280) ?? ""].find((t) => t.length >= 4) ?? (kind === "voice" ? "A voice note to say thank you." : "A short video to say thank you."),
      });
    },
    onSuccess: () => {
      toast({ message: kind === "voice" ? "Voice note sent to your Patrons" : "Video sent to your Patrons", tone: "positive" });
      setBody("");
      reset();
      void qc.invalidateQueries({ queryKey: ["my-request", requestId] });
      void qc.invalidateQueries({ queryKey: ["story", requestId] });
    },
  });

  if (!supported())
    return (
      <section className="card-surface p-5 sm:p-6" aria-label="Record a thank-you">
        <h2 className="text-[15px] font-medium">Record a thank-you</h2>
        <p className="mt-2 text-[14px] text-ink-2">This browser can’t record audio or video. Try the latest Chrome, Edge or Safari.</p>
      </section>
    );

  const recording = phase.name === "recording";
  const left = Math.max(0, LIMIT[kind] - elapsed);

  return (
    <section className="card-surface p-5 sm:p-6" aria-labelledby={`${id}-h`}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={`${id}-h`} className="text-[15px] font-medium">
          Record a thank-you
        </h2>
        <div className="grid grid-cols-2 gap-1 rounded-full bg-fill p-1" role="radiogroup" aria-label="Kind of recording">
          {(["voice", "video"] as const).map((k) => (
            <button
              key={k}
              role="radio"
              aria-checked={kind === k}
              disabled={phase.name !== "idle"}
              onClick={() => setKind(k)}
              className={cn("press flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium ring-focus disabled:opacity-50", kind === k ? "bg-surface text-ink shadow-sm" : "text-ink-2")}
            >
              {k === "voice" ? <Mic className="size-3.5" aria-hidden /> : <Video className="size-3.5" aria-hidden />}
              {k === "voice" ? "Voice" : "Video"}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1.5 text-[13px] text-ink-3">
        Up to {LIMIT[kind]} seconds. {SpeechRecognitionCtor ? "Captions are added automatically, on your device." : "Add a line of text below for captions."}
      </p>

      {kind === "video" && phase.name !== "review" && (
        <video ref={preview} muted playsInline aria-hidden className={cn("squircle mt-4 aspect-[3/4] w-40 rounded-[22px] bg-fill object-cover -scale-x-100", !recording && "hidden")} />
      )}

      <div className="mt-4">
        {phase.name === "review" ? (
          kind === "voice" ? (
            <audio src={phase.url} controls className="w-full" />
          ) : (
            <video src={phase.url} controls playsInline className="squircle aspect-[3/4] w-40 rounded-[22px] bg-black object-cover" />
          )
        ) : (
          <div className="flex items-center gap-4">
            <m.button
              type="button"
              onClick={() => (recording ? stop() : void start())}
              whileTap={{ scale: 0.92 }}
              className={cn("relative grid size-14 shrink-0 place-items-center rounded-full text-white shadow-lg ring-focus", recording ? "bg-danger" : "bg-accent")}
              aria-label={recording ? "Stop recording" : `Start recording a ${kind === "voice" ? "voice note" : "video"}`}
            >
              {recording && <span className="absolute inset-0 rounded-full bg-danger/40 motion-safe:animate-ping" aria-hidden />}
              {recording ? <Square className="relative size-5" fill="currentColor" aria-hidden /> : kind === "voice" ? <Mic className="size-6" aria-hidden /> : <Video className="size-6" aria-hidden />}
            </m.button>
            <div className="min-w-0 flex-1" aria-live="polite">
              {recording ? (
                <>
                  <div className="h-1.5 overflow-hidden rounded-full bg-fill">
                    <div className="h-full rounded-full bg-danger transition-[width] duration-200 ease-linear" style={{ width: `${(elapsed / LIMIT[kind]) * 100}%` }} />
                  </div>
                  <p className="mt-1.5 text-[12.5px] text-ink-3 num">{Math.ceil(left)}s left</p>
                </>
              ) : (
                <p className="text-[14px] text-ink-2">Tap to record. Speak to the people who helped you.</p>
              )}
            </div>
          </div>
        )}
      </div>

      <AnimatePresence initial={false}>
        {(finalText || interim) && (
          <m.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: ease.outExpo }}
            className="mt-3 flex gap-1.5 overflow-hidden rounded-[16px] bg-fill p-3 text-[14px] leading-relaxed"
          >
            <Captions className="mt-[3px] size-3.5 shrink-0 text-ink-3" aria-label="Live caption" />
            <span>
              {finalText} <span className="text-ink-3">{interim}</span>
            </span>
          </m.p>
        )}
      </AnimatePresence>

      {phase.name === "review" && (
        <>
          <label htmlFor={`${id}-body`} className="sr-only">
            Message
          </label>
          <textarea
            id={`${id}-body`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            maxLength={600}
            placeholder="Add a line of text (optional)"
            className="mt-3 w-full resize-none rounded-control bg-fill p-3.5 text-[15px] placeholder:text-ink-3 ring-focus"
          />
          <div className="mt-3 flex gap-2">
            <Button variant="outline" size="sm" onClick={reset} disabled={post.isPending}>
              <RotateCcw className="size-4" aria-hidden /> Retake
            </Button>
            <Button size="sm" className="flex-1" onClick={() => post.mutate()} disabled={post.isPending}>
              {post.isPending ? "Sending…" : "Send to my Patrons"}
            </Button>
          </div>
        </>
      )}

      {(error || post.error) && (
        <p role="alert" className="mt-3 text-[13.5px] text-danger">
          {error ?? post.error?.message}
        </p>
      )}
    </section>
  );
}
