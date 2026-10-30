import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Send, Trash2 } from "lucide-react";
import {
  audioExtension,
  formatDuration,
  micFailure,
  pickAudioMime,
} from "./attachments.ts";
import { composerMessages, type ComposerMessages } from "./composerI18n.ts";

export interface VoiceNoteRecorderProps {
  onSend: (audioBlob: Blob, durationSeconds: number, extension: "ogg" | "m4a" | "webm") => void | Promise<void>;
  onCancel: () => void;
  t?: ComposerMessages;
}

export const VoiceNoteRecorder: React.FC<VoiceNoteRecorderProps> = ({
  onSend,
  onCancel,
  t: customT,
}) => {
  const t = customT ?? composerMessages();
  const [seconds, setSeconds] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("audio/webm");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCancelledRef = useRef<boolean>(false);
  const durationRef = useRef<number>(0);

  // Stop all media tracks
  const stopTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  // Start recording on mount
  useEffect(() => {
    let mounted = true;
    isCancelledRef.current = false;

    async function initRecorder() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(t.micUnavailable);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!mounted || isCancelledRef.current) {
          stream.getTracks().forEach((trk) => trk.stop());
          return;
        }

        streamRef.current = stream;

        const isSupported = (mime: string) => {
          if (typeof MediaRecorder === "undefined") return false;
          return MediaRecorder.isTypeSupported(mime);
        };
        const mime = pickAudioMime(isSupported) ?? "audio/webm";
        mimeTypeRef.current = mime;

        const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunksRef.current.push(e.data);
          }
        };

        recorder.start(250); // collect chunks every 250ms
        setIsRecording(true);

        timerRef.current = setInterval(() => {
          setSeconds((prev) => {
            const next = prev + 1;
            durationRef.current = next;
            return next;
          });
        }, 1000);
      } catch (err) {
        if (!mounted) return;
        const failure = micFailure(err);
        setError(failure === "denied" ? t.micDenied : t.micUnavailable);
      }
    }

    void initRecorder();

    return () => {
      mounted = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      stopTracks();
    };
  }, [t]);

  const handleCancel = () => {
    isCancelledRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    stopTracks();
    onCancel();
  };

  const handleFinishAndSend = async () => {
    if (!mediaRecorderRef.current || isSubmitting) return;

    setIsSubmitting(true);
    if (timerRef.current) clearInterval(timerRef.current);

    const recorder = mediaRecorderRef.current;
    const finalDuration = durationRef.current;
    const mime = mimeTypeRef.current;
    const ext = audioExtension(mime);

    if (recorder.state === "inactive") {
      const blob = new Blob(chunksRef.current, { type: mime });
      stopTracks();
      await onSend(blob, finalDuration, ext);
      return;
    }

    recorder.onstop = async () => {
      stopTracks();
      if (isCancelledRef.current) return;
      const blob = new Blob(chunksRef.current, { type: mime });
      await onSend(blob, finalDuration, ext);
    };

    recorder.stop();
  };

  if (error) {
    return (
      <div
        data-testid="wa-voice-recorder-error"
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-red-700"
      >
        <div className="flex items-center gap-2 min-w-0">
          <AlertCircle className="size-4 shrink-0 text-red-500" aria-hidden />
          <p className="type-meta truncate">{error}</p>
        </div>
        <button
          type="button"
          onClick={handleCancel}
          className="type-label shrink-0 rounded-lg px-2.5 py-1 text-slate-600 hover:bg-red-100"
        >
          {t.cancel}
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="wa-voice-recorder"
      className="flex w-full items-center justify-between gap-3 rounded-2xl bg-slate-100 px-3 py-1.5"
    >
      {/* Delete / Cancel button */}
      <button
        type="button"
        onClick={handleCancel}
        disabled={isSubmitting}
        title={t.cancelRecording}
        aria-label={t.cancelRecording}
        className="flex size-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-red-600 active:scale-95 disabled:opacity-50"
      >
        <Trash2 className="size-4" />
      </button>

      {/* Recording status, indicator and timer */}
      <div className="flex flex-1 items-center gap-3">
        <span className="relative flex size-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex size-3 rounded-full bg-red-500" />
        </span>

        <span className="type-meta font-mono font-semibold text-slate-700">
          {formatDuration(seconds)}
        </span>

        {/* Pulsing audio bars visualization */}
        <div className="flex items-center gap-0.5">
          <span className="h-2 w-1 animate-pulse rounded-full bg-slate-400" />
          <span className="h-4 w-1 animate-pulse rounded-full bg-slate-500" />
          <span className="h-3 w-1 animate-pulse rounded-full bg-slate-400" />
          <span className="h-5 w-1 animate-pulse rounded-full bg-slate-600" />
          <span className="h-3 w-1 animate-pulse rounded-full bg-slate-400" />
          <span className="h-4 w-1 animate-pulse rounded-full bg-slate-500" />
          <span className="h-2 w-1 animate-pulse rounded-full bg-slate-400" />
        </div>
      </div>

      {/* Send recording button */}
      <button
        type="button"
        onClick={handleFinishAndSend}
        disabled={isSubmitting || !isRecording}
        title={t.sendVoice}
        aria-label={t.sendVoice}
        className="flex size-9 items-center justify-center rounded-full bg-green-600 text-white shadow-sm transition-transform hover:bg-green-700 active:scale-95 disabled:opacity-50"
      >
        {isSubmitting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Send className="size-4" />
        )}
      </button>
    </div>
  );
};
