import React, { useEffect, useRef } from "react";
import {
    Mic,
    Pause,
    Play,
    Square,
    Trash2,
    Loader2,
    Sparkles,
    Check,
} from "lucide-react";
import { cn } from "../utils/cn";

export type VoiceRecordingState =
    | "idle"
    | "none"
    | "recording"
    | "paused"
    | "stopped";

interface VoiceRecorderCardProps {
    systemLanguage: "en" | "sk" | "hu";
    recordingState: VoiceRecordingState;
    /** Elapsed seconds of the running recording. */
    recordDuration: number;
    formatDuration: (sec: number) => string;
    /** Live analyser of the microphone stream, used to draw the waveform. */
    analyser?: AnalyserNode | null;

    audioUrl: string | null;
    audioRef: React.RefObject<HTMLAudioElement | null>;
    /** True while the browser is being tricked into computing the blob duration. */
    durationProbeRef: React.MutableRefObject<boolean>;
    isPlaying: boolean;
    setIsPlaying: (playing: boolean) => void;
    currentTime: number;
    setCurrentTime: (time: number) => void;
    audioDuration: number;
    onAudioDurationChange: () => void;

    onStart: () => void;
    onPause: () => void;
    onResume: () => void;
    onStop: () => void;
    onRemove: () => void;

    /** Whether the transcription button should be offered at all. */
    canTranscribe: boolean;
    isTranscribing: boolean;
    isUploadingAudio: boolean;
    hasUploadedAudio: boolean;
    onTranscribe: () => void;
}

const BAR_COUNT = 32;

/**
 * Voice note recorder for the event logger. The waveform is driven straight from
 * the recorder's analyser node and written to the DOM inside the animation frame,
 * so a 60fps meter never triggers a React render of the surrounding form.
 */
export const VoiceRecorderCard: React.FC<VoiceRecorderCardProps> = ({
    systemLanguage,
    recordingState,
    recordDuration,
    formatDuration,
    analyser,
    audioUrl,
    audioRef,
    durationProbeRef,
    isPlaying,
    setIsPlaying,
    currentTime,
    setCurrentTime,
    audioDuration,
    onAudioDurationChange,
    onStart,
    onPause,
    onResume,
    onStop,
    onRemove,
    canTranscribe,
    isTranscribing,
    isUploadingAudio,
    hasUploadedAudio,
    onTranscribe,
}) => {
    const t = (en: string, sk: string, hu: string) =>
        systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;

    const barsRef = useRef<Array<HTMLSpanElement | null>>([]);
    const isRecording = recordingState === "recording";
    const isPaused = recordingState === "paused";
    const isStopped = recordingState === "stopped";
    const isLive = isRecording || isPaused;

    // Drive the waveform bars from the live microphone spectrum.
    useEffect(() => {
        if (!isRecording) return;

        let frameId = 0;
        const data = analyser
            ? new Uint8Array(analyser.frequencyBinCount)
            : null;
        // Without an analyser (older browsers) fall back to a gentle synthetic
        // sweep so the card still reads as "listening".
        let tick = 0;

        const paint = () => {
            if (analyser && data) {
                analyser.getByteFrequencyData(data as any);
            } else {
                tick += 1;
            }
            barsRef.current.forEach((bar, i) => {
                if (!bar) return;
                let level: number;
                if (analyser && data) {
                    // The low bins carry most of the voice energy; spread the bars
                    // across the useful part of the spectrum instead of the tail.
                    const bin = Math.floor((i / BAR_COUNT) * (data.length * 0.7));
                    level = Math.min(1, (data[bin] ?? 0) / 190);
                } else {
                    level = 0.35 + 0.35 * Math.sin(tick / 6 + i / 2);
                }
                bar.style.transform = `scaleY(${Math.max(0.12, level)})`;
            });
            frameId = requestAnimationFrame(paint);
        };

        paint();
        return () => cancelAnimationFrame(frameId);
    }, [isRecording, analyser]);

    // Freeze the bars at a flat line whenever nothing is being captured.
    useEffect(() => {
        if (isRecording) return;
        barsRef.current.forEach((bar) => {
            if (bar) bar.style.transform = "scaleY(0.12)";
        });
    }, [isRecording]);

    const playbackProgress =
        audioDuration > 0 ? Math.min(1, currentTime / audioDuration) : 0;

    const seekTo = (e: React.MouseEvent<HTMLDivElement>) => {
        const el = audioRef.current;
        if (!el || !Number.isFinite(audioDuration) || audioDuration <= 0) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = Math.min(
            1,
            Math.max(0, (e.clientX - rect.left) / rect.width),
        );
        el.currentTime = ratio * audioDuration;
        setCurrentTime(el.currentTime);
    };

    const togglePlayback = () => {
        const el = audioRef.current;
        if (!el) return;
        if (isPlaying) {
            el.pause();
            return;
        }
        const played = el.play();
        if (played && typeof played.catch === "function") {
            played.catch((err: any) => {
                setIsPlaying(false);
                if (typeof (window as any).showToast === "function") {
                    (window as any).showToast(
                        t(
                            "Could not play the recording: ",
                            "Nahrávku sa nepodarilo prehrať: ",
                            "A felvételt nem sikerült lejátszani: ",
                        ) + err.message,
                        "error",
                    );
                }
            });
        }
    };

    const title = isRecording
        ? t("Recording…", "Nahráva sa…", "Felvétel…")
        : isPaused
          ? t("Paused", "Pozastavené", "Megállítva")
          : isStopped
            ? t("Voice note ready", "Hlasová poznámka", "Hangjegyzet kész")
            : t("Voice recording", "Hlasový záznam", "Hangrögzítés");

    const subtitle = isRecording
        ? t(
              "Speak clearly into the microphone.",
              "Hovorte zreteľne do mikrofónu.",
              "Beszéljen tisztán a mikrofonba.",
          )
        : isPaused
          ? t(
                "Resume when you are ready.",
                "Pokračujte, keď budete pripravení.",
                "Folytassa, ha készen áll.",
            )
          : isStopped
            ? isUploadingAudio
                ? t(
                      "Uploading the recording…",
                      "Nahrávam záznam na server…",
                      "A felvétel feltöltése…",
                  )
                : t(
                      "Play it back, or turn it into text.",
                      "Prehrajte si ju alebo ju preveďte na text.",
                      "Hallgassa vissza, vagy alakítsa szöveggé.",
                  )
            : t(
                  "Record the note instead of typing it.",
                  "Nahrajte poznámku hlasom namiesto písania.",
                  "Rögzítse a jegyzetet gépelés helyett.",
              );

    const btnBase =
        "px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider cursor-pointer flex items-center gap-1.5 transition-all duration-200 active:scale-95 shadow-sm";

    return (
        <div
            className={cn(
                "rounded-2xl border-2 p-3.5 select-none transition-colors duration-300",
                isRecording
                    ? "border-rose-200 bg-gradient-to-br from-rose-50 to-white"
                    : isPaused
                      ? "border-amber-200 bg-gradient-to-br from-amber-50 to-white"
                      : isStopped
                        ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white"
                        : "border-slate-200 bg-gradient-to-br from-white to-slate-50",
            )}
        >
            <div className="flex items-center gap-3.5">
                {/* Status orb */}
                <div className="relative shrink-0">
                    {isRecording && (
                        <span className="absolute inset-0 rounded-full bg-rose-400/60 animate-ping" />
                    )}
                    <div
                        className={cn(
                            "relative h-11 w-11 rounded-full flex items-center justify-center text-white shadow-md transition-colors duration-300",
                            isRecording
                                ? "bg-rose-600"
                                : isPaused
                                  ? "bg-amber-500"
                                  : isStopped
                                    ? "bg-emerald-500"
                                    : "bg-slate-800",
                        )}
                    >
                        {isStopped ? (
                            <Check className="h-5 w-5 stroke-[3]" />
                        ) : (
                            <Mic className="h-5 w-5 stroke-[2.5]" />
                        )}
                    </div>
                </div>

                {/* Label + live meter / player */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2.5 flex-wrap">
                        <span className="text-[13px] font-black text-slate-800 tracking-tight">
                            {title}
                        </span>
                        {isLive && (
                            <span
                                className={cn(
                                    "text-lg font-black tabular-nums leading-none",
                                    isRecording
                                        ? "text-rose-600"
                                        : "text-amber-600",
                                )}
                            >
                                {formatDuration(recordDuration)}
                            </span>
                        )}
                    </div>
                    <p className="text-[11px] font-semibold text-slate-500 truncate mt-0.5">
                        {subtitle}
                    </p>

                    {/* Live waveform */}
                    {isLive && (
                        <div className="flex items-center gap-[3px] h-8 mt-2">
                            {Array.from({ length: BAR_COUNT }).map((_, i) => (
                                <span
                                    key={i}
                                    ref={(el) => {
                                        barsRef.current[i] = el;
                                    }}
                                    className={cn(
                                        "flex-1 h-full rounded-full origin-center transition-colors duration-300",
                                        isRecording
                                            ? "bg-rose-500"
                                            : "bg-amber-400",
                                    )}
                                    style={{
                                        transform: "scaleY(0.12)",
                                        transition: "transform 80ms linear",
                                    }}
                                />
                            ))}
                        </div>
                    )}

                    {/* Playback */}
                    {isStopped && audioUrl && (
                        <div className="flex items-center gap-2.5 mt-2.5">
                            <audio
                                ref={audioRef}
                                src={audioUrl}
                                preload="metadata"
                                onTimeUpdate={() => {
                                    if (
                                        !audioRef.current ||
                                        durationProbeRef.current
                                    )
                                        return;
                                    setCurrentTime(audioRef.current.currentTime);
                                }}
                                onDurationChange={onAudioDurationChange}
                                onLoadedMetadata={onAudioDurationChange}
                                onPlay={() => setIsPlaying(true)}
                                onPause={() => setIsPlaying(false)}
                                onEnded={() => setIsPlaying(false)}
                                onError={() => {
                                    setIsPlaying(false);
                                    if (
                                        typeof (window as any).showToast ===
                                        "function"
                                    ) {
                                        (window as any).showToast(
                                            t(
                                                "The recording could not be loaded.",
                                                "Nahrávku sa nepodarilo načítať.",
                                                "A felvételt nem sikerült betölteni.",
                                            ),
                                            "error",
                                        );
                                    }
                                }}
                                className="hidden"
                            />
                            <button
                                type="button"
                                onClick={togglePlayback}
                                className="h-9 w-9 rounded-full bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center shrink-0 cursor-pointer transition-all duration-200 active:scale-90 shadow-sm"
                                title={
                                    isPlaying
                                        ? t("Pause", "Pozastaviť", "Szünet")
                                        : t("Play", "Prehrať", "Lejátszás")
                                }
                            >
                                {isPlaying ? (
                                    <Pause className="h-4 w-4 fill-white" />
                                ) : (
                                    <Play className="h-4 w-4 fill-white ml-0.5" />
                                )}
                            </button>
                            <div
                                onClick={seekTo}
                                className="flex-1 h-2 rounded-full bg-emerald-100 cursor-pointer group relative overflow-hidden"
                            >
                                <div
                                    className="h-full rounded-full bg-emerald-500 transition-[width] duration-150 ease-linear"
                                    style={{
                                        width: `${playbackProgress * 100}%`,
                                    }}
                                />
                            </div>
                            <span className="text-[11px] font-black text-slate-500 tabular-nums shrink-0">
                                {formatDuration(Math.floor(currentTime))} /{" "}
                                {formatDuration(Math.floor(audioDuration))}
                            </span>
                            <button
                                type="button"
                                onClick={onRemove}
                                className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors p-1.5 rounded-lg cursor-pointer shrink-0"
                                title={t(
                                    "Delete audio",
                                    "Odstrániť nahrávku",
                                    "Hangfelvétel törlése",
                                )}
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2 shrink-0">
                    {!isLive && !isStopped && (
                        <button
                            type="button"
                            onClick={onStart}
                            className={cn(
                                btnBase,
                                "bg-rose-600 hover:bg-rose-700 text-white",
                            )}
                        >
                            <Mic className="h-4 w-4 stroke-[2.5]" />
                            <span>
                                {t("Record", "Nahrať", "Felvétel")}
                            </span>
                        </button>
                    )}

                    {isRecording && (
                        <>
                            <button
                                type="button"
                                onClick={onPause}
                                className={cn(
                                    btnBase,
                                    "bg-white hover:bg-amber-50 text-amber-600 border-2 border-amber-200 px-3",
                                )}
                                title={t("Pause", "Pozastaviť", "Szünet")}
                            >
                                <Pause className="h-4 w-4 fill-current" />
                            </button>
                            <button
                                type="button"
                                onClick={onStop}
                                className={cn(
                                    btnBase,
                                    "bg-slate-900 hover:bg-slate-800 text-white",
                                )}
                            >
                                <Square className="h-3.5 w-3.5 fill-white" />
                                <span>
                                    {t("Stop", "Zastaviť", "Leállítás")}
                                </span>
                            </button>
                        </>
                    )}

                    {isPaused && (
                        <>
                            <button
                                type="button"
                                onClick={onResume}
                                className={cn(
                                    btnBase,
                                    "bg-rose-600 hover:bg-rose-700 text-white px-3",
                                )}
                                title={t(
                                    "Resume",
                                    "Pokračovať",
                                    "Folytatás",
                                )}
                            >
                                <Play className="h-4 w-4 fill-white" />
                            </button>
                            <button
                                type="button"
                                onClick={onStop}
                                className={cn(
                                    btnBase,
                                    "bg-slate-900 hover:bg-slate-800 text-white",
                                )}
                            >
                                <Square className="h-3.5 w-3.5 fill-white" />
                                <span>
                                    {t("Stop", "Zastaviť", "Leállítás")}
                                </span>
                            </button>
                        </>
                    )}

                    {isStopped && canTranscribe && (
                        <button
                            type="button"
                            disabled={
                                isTranscribing ||
                                isUploadingAudio ||
                                !hasUploadedAudio
                            }
                            onClick={onTranscribe}
                            className={cn(
                                btnBase,
                                "bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:active:scale-100 disabled:cursor-not-allowed",
                            )}
                        >
                            {isTranscribing || isUploadingAudio ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Sparkles className="h-4 w-4" />
                            )}
                            <span>
                                {t("Transcribe", "Prepísať", "Átír")}
                            </span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VoiceRecorderCard;
