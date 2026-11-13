// Browser-side media work, before anything is uploaded:
// - video: compress to MP4 (H.264, at most 1080 px on the long side), drop all
//   metadata tags (iPhone videos carry GPS), capture a poster frame;
// - audio: decode, mix to mono, encode MP3, measure duration and a waveform.

export interface CompressedVideo {
  video: Blob;
  poster: Blob;
  width: number;
  height: number;
  duration: number;
  hasAudio: boolean;
}

const MAX_SIDE = 1080;
const VIDEO_BITRATE = 2_000_000; // ≈ 8 MB for 30 s, with audio under the 10 MB target
const AUDIO_BITRATE = 128_000;

export async function compressVideo(file: File, onProgress: (fraction: number) => void): Promise<CompressedVideo> {
  if (typeof VideoEncoder === "undefined") {
    throw new Error("This browser cannot compress video. Use a current Chrome, Edge, Safari or Firefox.");
  }
  const mb = await import("mediabunny");
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error(`${file.name}: no video track found.`);
  if (!(await track.canDecode())) throw new Error(`${file.name}: this browser cannot read this video's format.`);

  const longSide = Math.max(track.displayWidth, track.displayHeight);
  const shrink = longSide > MAX_SIDE ? MAX_SIDE / longSide : 1;
  // H.264 needs even dimensions.
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const width = even(track.displayWidth * shrink);
  const height = even(track.displayHeight * shrink);

  const videoCodec = await mb.getFirstEncodableVideoCodec(["avc"], { width, height });
  if (!videoCodec) throw new Error("This browser cannot encode H.264 video.");
  const audioTrack = await input.getPrimaryAudioTrack();
  const audioCodec = audioTrack ? await mb.getFirstEncodableAudioCodec(["aac", "opus"]) : null;

  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
  const conversion = await mb.Conversion.init({
    input,
    output,
    tracks: "primary",
    video: { width, height, fit: "fill", codec: videoCodec, bitrate: VIDEO_BITRATE, allowTransformationMetadata: false },
    audio: audioCodec ? { codec: audioCodec, bitrate: AUDIO_BITRATE } : { discard: true },
    // No tags: location, device and date metadata are not copied.
    tags: {},
    showWarnings: false,
  });
  if (!conversion.isValid) throw new Error(`${file.name}: this video cannot be converted in this browser.`);
  conversion.onProgress = (p) => onProgress(p);
  await conversion.execute();
  const buffer = (output.target as InstanceType<typeof mb.BufferTarget>).buffer;
  if (!buffer) throw new Error(`${file.name}: conversion produced no file.`);
  const video = new Blob([buffer], { type: "video/mp4" });

  // Poster: a frame a little way in (the first frame is often black), from the result.
  const result = new mb.Input({ source: new mb.BlobSource(video), formats: mb.ALL_FORMATS });
  const outTrack = (await result.getPrimaryVideoTrack())!;
  const duration = await result.computeDuration();
  const sink = new mb.CanvasSink(outTrack, { poolSize: 1 });
  const frame = (await sink.getCanvas(Math.min(0.5, duration / 3))) ?? (await sink.getCanvas(0));
  if (!frame) throw new Error(`${file.name}: could not read a frame for the poster.`);
  const poster = await canvasToBlob(frame.canvas);
  const hasAudio = Boolean(await result.getPrimaryAudioTrack());
  return { video, poster, width, height, duration, hasAudio };
}

async function canvasToBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Poster failed."))), "image/jpeg", 0.9));
}

export interface EncodedAudio {
  mp3: Blob;
  duration: number;
  waveform: number[];
}

const SAMPLE_RATE = 44100;
const MP3_KBPS = 64;
export const WAVEFORM_BARS = 64;

/** Any audio the browser can decode (a recording or an upload) → mono MP3 without tags. */
export async function encodeMp3(blob: Blob): Promise<EncodedAudio> {
  const data = await blob.arrayBuffer();
  const ctx = new OfflineAudioContext(1, 1, SAMPLE_RATE);
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(data);
  } catch {
    throw new Error("This browser cannot read this audio file.");
  }
  // Mix to mono.
  const length = decoded.length;
  const mono = new Float32Array(length);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const ch = decoded.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += ch[i] / decoded.numberOfChannels;
  }
  const waveform = peaks(mono, WAVEFORM_BARS);

  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const encoder = new Mp3Encoder(1, decoded.sampleRate, MP3_KBPS);
  const pcm = new Int16Array(length);
  for (let i = 0; i < length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(mono[i] * 32767)));
  const chunks: Uint8Array[] = [];
  const block = 1152 * 20;
  for (let i = 0; i < length; i += block) {
    const out = encoder.encodeBuffer(pcm.subarray(i, i + block));
    if (out.length) chunks.push(new Uint8Array(out));
    if (i % (block * 50) === 0) await new Promise((r) => setTimeout(r, 0)); // keep the page responsive
  }
  const end = encoder.flush();
  if (end.length) chunks.push(new Uint8Array(end));
  return { mp3: new Blob(chunks as BlobPart[], { type: "audio/mpeg" }), duration: decoded.duration, waveform };
}

/** The loudest sample in each of `bars` slices, scaled so the loudest bar is 1. */
export function peaks(samples: Float32Array, bars: number): number[] {
  const size = Math.max(1, Math.floor(samples.length / bars));
  const out: number[] = [];
  for (let b = 0; b < bars; b++) {
    let max = 0;
    const end = Math.min(samples.length, (b + 1) * size);
    for (let i = b * size; i < end; i++) max = Math.max(max, Math.abs(samples[i]));
    out.push(max);
  }
  const top = Math.max(...out, 1e-6);
  return out.map((v) => Math.round((v / top) * 100) / 100);
}

/** Records from the microphone until stop() is called. */
export async function startRecording(): Promise<{ stop: () => Promise<Blob>; cancel: () => void }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const recorder = new MediaRecorder(stream);
  const parts: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && parts.push(e.data);
  recorder.start(250);
  const release = () => stream.getTracks().forEach((t) => t.stop());
  return {
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = () => {
          release();
          resolve(new Blob(parts, { type: recorder.mimeType }));
        };
        recorder.stop();
      }),
    cancel: () => {
      recorder.onstop = release;
      recorder.stop();
    },
  };
}
