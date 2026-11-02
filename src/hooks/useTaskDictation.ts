import { useCallback, useEffect, useRef, useState } from "react";
import type { Language } from "../utils/translations";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

/**
 * Dictation for the new-task composer: records the microphone, shows a live
 * level meter (and, where the browser can do it alongside the recording, the
 * words as they are spoken), then sends the audio to /api/transcribe_task.php
 * and hands back the structured task(s) it heard. Nothing is created here — the
 * composer fills its fields and the person reviews them before saving.
 */

/** One task as /api/transcribe_task.php returns it. */
export interface DictatedTask {
    title?: string;
    description?: string;
    priority?: string;
    deadline?: string;
    deadlineTime?: string | null;
    assignedTo?: string | null;
    lead?: string | null;
}

export interface DictationResult {
    transcription: string;
    tasks: DictatedTask[];
}

export type DictationPhase = "idle" | "recording" | "processing";

/** Number of bars in the composer's waveform. */
export const DICTATION_BARS = 20;

type Translate = (en: string, sk: string, hu: string) => string;

interface Options {
    language: Language;
    /** Team member names, so "assign to Peter" can be matched. */
    users: string[];
    /** Lead / client names, so "call Novák" can link the task. */
    leads: string[];
    t: Translate;
    onResult: (result: DictationResult) => void;
    onError: (message: string) => void;
}

const toLocalDateStr = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const SPEECH_LANG: Record<string, string> = { sk: "sk-SK", hu: "hu-HU", en: "en-US" };

/**
 * The browser's own speech recognition, used only for the live preview of the
 * words. Phones share one microphone between it and the recorder badly, so it
 * stays off there; the transcription that counts always comes from the server.
 */
const liveSpeechRecognition = (): any => {
    if (typeof window === "undefined") return null;
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return null;
    const mobile = (navigator as any).userAgentData?.mobile ?? /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    return mobile ? null : Ctor;
};

const pickMimeType = (): string => {
    if (typeof MediaRecorder === "undefined") return "";
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg", "audio/wav"];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
};

export const useTaskDictation = ({ language, users, leads, t, onResult, onError }: Options) => {
    const [phase, setPhase] = useState<DictationPhase>("idle");
    const [seconds, setSeconds] = useState(0);
    /** Level per bar, 0..1, newest on the right. */
    const [levels, setLevels] = useState<number[]>(() => Array(DICTATION_BARS).fill(0.3));
    const [liveText, setLiveText] = useState("");

    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const frameRef = useRef<number | null>(null);
    const timerRef = useRef<number | null>(null);
    const startedAtRef = useRef(0);
    const lastPushRef = useRef(0);
    const speechRef = useRef<any>(null);
    const cancelledRef = useRef(false);
    const phaseRef = useRef<DictationPhase>("idle");
    phaseRef.current = phase;

    // Latest callbacks without re-creating start/stop on every render.
    const latest = useRef({ language, users, leads, t, onResult, onError });
    latest.current = { language, users, leads, t, onResult, onError };

    const stopMeters = () => {
        if (timerRef.current) window.clearInterval(timerRef.current);
        timerRef.current = null;
        if (frameRef.current) cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
        try {
            speechRef.current?.abort?.();
        } catch {
            /* already stopped */
        }
        speechRef.current = null;
    };

    const releaseMicrophone = () => {
        stopMeters();
        if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
            try {
                void audioCtxRef.current.close();
            } catch {
                /* closed */
            }
        }
        audioCtxRef.current = null;
        streamRef.current?.getTracks().forEach((track) => {
            try {
                track.stop();
            } catch {
                /* stopped */
            }
        });
        streamRef.current = null;
    };

    useEffect(
        () => {
            // StrictMode unmounts and remounts once: a start() already waiting for
            // the microphone must survive that rehearsal, so the flag is reset here.
            cancelledRef.current = false;
            return () => {
                cancelledRef.current = true;
                releaseMicrophone();
                try {
                    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
                } catch {
                    /* stopped */
                }
            };
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    const start = useCallback(async () => {
        if (phaseRef.current !== "idle") return;
        const { t: tr } = latest.current;
        cancelledRef.current = false;
        chunksRef.current = [];
        setLiveText("");
        setSeconds(0);
        setLevels(Array(DICTATION_BARS).fill(0.3));
        try {
            if (!navigator.mediaDevices?.getUserMedia) {
                throw new Error(
                    tr(
                        "Microphone requires HTTPS or localhost.",
                        "Mikrofón vyžaduje HTTPS alebo localhost.",
                        "A mikrofonhoz HTTPS vagy localhost kapcsolat szükséges.",
                    ),
                );
            }
            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                });
            } catch {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
            if (cancelledRef.current) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }
            streamRef.current = stream;

            // Level meter (visual only).
            try {
                const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
                if (AudioCtx) {
                    const ctx: AudioContext = new AudioCtx();
                    audioCtxRef.current = ctx;
                    if (ctx.state === "suspended") await ctx.resume();
                    const analyser = ctx.createAnalyser();
                    analyser.fftSize = 128;
                    analyser.smoothingTimeConstant = 0.3;
                    ctx.createMediaStreamSource(stream).connect(analyser);
                    const timeData = new Uint8Array(analyser.fftSize);
                    const freqData = new Uint8Array(analyser.frequencyBinCount);
                    const tick = (now: number) => {
                        analyser.getByteTimeDomainData(timeData);
                        analyser.getByteFrequencyData(freqData);
                        let maxDev = 0;
                        for (let i = 0; i < timeData.length; i++) maxDev = Math.max(maxDev, Math.abs(timeData[i] - 128));
                        let sum = 0;
                        for (let i = 0; i < freqData.length; i++) sum += freqData[i];
                        const level = Math.max(maxDev / 35, sum / (freqData.length || 1) / 30);
                        if (now - lastPushRef.current > 60) {
                            lastPushRef.current = now;
                            const value = Math.max(0.3, Math.min(1, level));
                            setLevels((prev) => [...prev.slice(1), value]);
                        }
                        frameRef.current = requestAnimationFrame(tick);
                    };
                    frameRef.current = requestAnimationFrame(tick);
                }
            } catch {
                /* the meter is optional */
            }

            const mimeType = pickMimeType();
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
            recorderRef.current = recorder;
            recorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
            };
            recorder.start(100);
            startedAtRef.current = Date.now();
            setPhase("recording");
            timerRef.current = window.setInterval(() => {
                setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
            }, 250);

            // Live words, where the browser offers it.
            const Speech = liveSpeechRecognition();
            if (Speech) {
                try {
                    const rec = new Speech();
                    rec.lang = SPEECH_LANG[latest.current.language] || "en-US";
                    rec.continuous = true;
                    rec.interimResults = true;
                    rec.onresult = (event: any) => {
                        let text = "";
                        for (let i = 0; i < event.results.length; i++) text += event.results[i][0]?.transcript || "";
                        setLiveText(text.trim());
                    };
                    rec.onerror = () => {
                        /* preview only */
                    };
                    rec.start();
                    speechRef.current = rec;
                } catch {
                    speechRef.current = null;
                }
            }
        } catch (err: any) {
            releaseMicrophone();
            setPhase("idle");
            latest.current.onError(
                latest.current.t(
                    "Microphone access error: " + (err?.message || "Permission denied"),
                    "Chyba prístupu k mikrofónu: " + (err?.message || "Prístup odmietnutý"),
                    "Mikrofon hozzáférési hiba: " + (err?.message || "Hozzáférés megtagadva"),
                ),
            );
        }
    }, []);

    /** Stops recording and transcribes; the result arrives through `onResult`. */
    const stop = useCallback(async () => {
        const recorder = recorderRef.current;
        if (phaseRef.current !== "recording" || !recorder) return;
        const duration = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
        stopMeters();
        setPhase("processing");

        const blob = await new Promise<Blob>((resolve) => {
            const finish = () => resolve(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
            if (recorder.state === "inactive") return finish();
            recorder.onstop = finish;
            try {
                try {
                    recorder.requestData();
                } catch {
                    /* not recording */
                }
                recorder.stop();
            } catch {
                finish();
            }
        });
        releaseMicrophone();
        recorderRef.current = null;
        if (cancelledRef.current) return;

        const { language: lang, users: names, leads: leadNames, t: tr } = latest.current;
        try {
            if (!blob || blob.size < 200) {
                throw new Error(
                    tr(
                        "Recording too short or empty. Please speak clearly.",
                        "Nahrávka je príliš krátka alebo prázdna. Prosím hovorte zreteľne.",
                        "A felvétel túl rövid vagy üres. Kérjük, beszéljen érthetően.",
                    ),
                );
            }
            const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : blob.type.includes("wav") ? "wav" : "webm";
            const form = new FormData();
            form.append("audio", blob, `voice_task.${ext}`);
            form.append("today", toLocalDateStr(new Date()));
            form.append("language", lang);
            form.append("users", JSON.stringify(names));
            form.append("leads", JSON.stringify(leadNames));
            form.append("durationSeconds", String(duration));
            const res = await fetchWithTimeout("/api/transcribe_task.php", { method: "POST", body: form }, 60000);
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.success) {
                throw new Error(
                    data?.message || tr("Failed to transcribe voice task", "Nepodarilo sa prepísať hlasovú úlohu", "Nem sikerült átírni a hangfeladatot"),
                );
            }
            const tasks: DictatedTask[] = Array.isArray(data.tasks) ? data.tasks : [];
            if (tasks.length === 0) {
                throw new Error(
                    tr(
                        "No tasks could be identified from the voice memo.",
                        "Z hlasového záznamu sa nepodarilo rozpoznať žiadne úlohy.",
                        "A hangjegyzetből nem sikerült feladatot azonosítani.",
                    ),
                );
            }
            if (cancelledRef.current) return;
            setPhase("idle");
            latest.current.onResult({ transcription: String(data.transcription || ""), tasks });
        } catch (err: any) {
            if (cancelledRef.current) return;
            setPhase("idle");
            latest.current.onError(err?.message || tr("Error creating voice task", "Chyba pri vytváraní hlasovej úlohy", "Hiba a hangfeladat létrehozásakor"));
        }
    }, []);

    /** Drops the recording (closing the composer, or pressing stop on an empty one). */
    const cancel = useCallback(() => {
        cancelledRef.current = true;
        releaseMicrophone();
        try {
            if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
        } catch {
            /* stopped */
        }
        recorderRef.current = null;
        setPhase("idle");
        setSeconds(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { phase, seconds, levels, liveText, start, stop, cancel };
};
