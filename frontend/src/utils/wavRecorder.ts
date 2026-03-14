/**
 * Record audio from the microphone and return a WAV blob.
 * Uses Web Audio API (AudioWorklet not needed — ScriptProcessorNode is fine for short recordings).
 * Output: 16-bit PCM, 16 kHz mono WAV — exactly what cr8lab MERaLiON expects.
 */

const SAMPLE_RATE = 16000;

interface WavRecording {
  stream: MediaStream;
  context: AudioContext;
  processor: ScriptProcessorNode;
  chunks: Float32Array[];
}

let current: WavRecording | null = null;

export async function startWavRecording(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const context = new AudioContext({ sampleRate: SAMPLE_RATE });
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];

  processor.onaudioprocess = (e) => {
    const data = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(data));
  };

  source.connect(processor);
  processor.connect(context.destination);

  current = { stream, context, processor, chunks };
}

export async function stopWavRecording(): Promise<Blob> {
  if (!current) throw new Error('No recording in progress');

  const { stream, context, processor, chunks } = current;
  current = null;

  processor.disconnect();
  stream.getTracks().forEach((t) => t.stop());
  await context.close();

  const pcm = mergeChunks(chunks);
  return encodeWav(pcm, SAMPLE_RATE);
}

export function isWavRecording(): boolean {
  return current !== null;
}

export function cancelWavRecording(): void {
  if (!current) return;
  const { stream, context, processor } = current;
  current = null;
  processor.disconnect();
  stream.getTracks().forEach((t) => t.stop());
  context.close();
}

function mergeChunks(chunks: Float32Array[]): Float32Array {
  const length = chunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = samples.length * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // PCM samples — clamp float32 to int16
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
