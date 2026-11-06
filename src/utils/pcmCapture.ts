/**
 * Microphone -> 16 kHz mono signed 16-bit little-endian PCM frames (100 ms each), for the Soniox
 * live transcript. The caller passes a stream it OWNS (a clone of the recorder's track): this
 * module never calls getUserMedia and never touches the MediaRecorder.
 *
 * Preferred path: an AudioWorklet loaded from a same-origin file (the CSP has no `blob:` in
 * `script-src`). Fallback without `audioWorklet`: a ScriptProcessorNode with the same resampler.
 * The AudioContext runs at the device rate and the resampling happens in our code, because Firefox
 * refuses to connect a MediaStream source to a context running at another sample rate.
 */
import workletUrl from "./pcmCaptureWorklet.js?url";
import { PCM_FRAME_SAMPLES, createFrameBuffer, createResampler, floatToPcm16, resampleChunk } from "./pcmResample";

const OUT_RATE = 16000;

export interface PcmCapture {
  /** Stops capturing and closes the AudioContext. Safe to call twice. */
  stop: () => void;
}

/**
 * Start capturing. Resolves once audio is flowing into `onFrame` (an ArrayBuffer of
 * PCM_FRAME_SAMPLES Int16 samples). Rejects when the browser cannot do it.
 */
export async function startPcmCapture(stream: MediaStream, onFrame: (frame: ArrayBuffer) => void): Promise<PcmCapture> {
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) throw new Error("no AudioContext");
  const ctx: AudioContext = new Ctx();
  let stopped = false;
  const nodes: AudioNode[] = [];
  let workletNode: AudioWorkletNode | null = null;
  let processor: ScriptProcessorNode | null = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (workletNode) workletNode.port.onmessage = null;
    if (processor) processor.onaudioprocess = null;
    for (const n of nodes) {
      try { n.disconnect(); } catch { /* already disconnected */ }
    }
    if (ctx.state !== "closed") ctx.close().catch(() => {});
  };

  try {
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    const source = ctx.createMediaStreamSource(stream);
    nodes.push(source);
    // Pulled by the destination through a silent gain, so the graph is processed without echo.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    mute.connect(ctx.destination);
    nodes.push(mute);

    if (ctx.audioWorklet && typeof AudioWorkletNode !== "undefined") {
      await ctx.audioWorklet.addModule(workletUrl);
      workletNode = new AudioWorkletNode(ctx, "pcm-capture", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
      workletNode.port.onmessage = (e: MessageEvent) => {
        if (!stopped && e.data instanceof ArrayBuffer) onFrame(e.data);
      };
      source.connect(workletNode);
      workletNode.connect(mute);
      nodes.push(workletNode);
    } else {
      const resampler = createResampler(ctx.sampleRate, OUT_RATE);
      const frames = createFrameBuffer(PCM_FRAME_SAMPLES);
      processor = ctx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        if (stopped) return;
        const pcm = floatToPcm16(resampleChunk(resampler, e.inputBuffer.getChannelData(0)));
        for (const frame of frames.push(pcm)) onFrame(frame.buffer as ArrayBuffer);
      };
      source.connect(processor);
      processor.connect(mute);
      nodes.push(processor);
    }
  } catch (e) {
    stop();
    throw e;
  }
  return { stop };
}
