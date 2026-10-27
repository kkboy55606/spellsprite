// MP4 export: H.264 through WebCodecs, wrapped by a small MP4 muxer written
// here (one video track, one chunk, moov before mdat). Falls back to a WebM
// MediaRecorder capture where WebCodecs is missing.

const cat = (parts) => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const u8 = (...v) => new Uint8Array(v);
const u16 = (v) => u8((v >> 8) & 255, v & 255);
const u32 = (v) => u8((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
const zeros = (n) => new Uint8Array(n);
const fourcc = (s) => new TextEncoder().encode(s);
const box = (type, ...payload) => { const body = cat(payload); return cat([u32(body.length + 8), fourcc(type), body]); };
const full = (type, version, flags, ...payload) => box(type, u8(version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255), ...payload);
const MATRIX = cat([u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000)]);

// samples: [{ data: Uint8Array (length-prefixed NAL units), key: bool, duration (in timescale units) }]
export function buildMP4({ width, height, timescale, samples, avcC }) {
  const total = samples.reduce((s, x) => s + x.duration, 0);
  const ms = Math.round((total / timescale) * 1000);
  const stts = [];
  for (const s of samples) {
    const last = stts[stts.length - 1];
    if (last && last[1] === s.duration) last[0]++;
    else stts.push([1, s.duration]);
  }
  const keys = samples.map((s, i) => (s.key ? i + 1 : 0)).filter(Boolean);
  const moov = (offset) => box('moov',
    full('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(ms), u32(0x00010000), u16(0x0100), zeros(10), MATRIX, zeros(24), u32(2)),
    box('trak',
      full('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(ms), zeros(8), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(width << 16), u32(height << 16)),
      box('mdia',
        full('mdhd', 0, 0, u32(0), u32(0), u32(timescale), u32(total), u16(0x55c4), u16(0)),
        full('hdlr', 0, 0, u32(0), fourcc('vide'), zeros(12), fourcc('Spellsprite'), u8(0)),
        box('minf',
          full('vmhd', 0, 1, zeros(8)),
          box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))),
          box('stbl',
            full('stsd', 0, 0, u32(1), box('avc1', zeros(6), u16(1), zeros(16), u16(width), u16(height), u32(0x00480000), u32(0x00480000), u32(0), u16(1), zeros(32), u16(0x0018), u16(0xffff), box('avcC', avcC))),
            full('stts', 0, 0, u32(stts.length), ...stts.flatMap(([n, d]) => [u32(n), u32(d)])),
            full('stss', 0, 0, u32(keys.length), ...keys.map(u32)),
            full('stsc', 0, 0, u32(1), u32(1), u32(samples.length), u32(1)),
            full('stsz', 0, 0, u32(0), u32(samples.length), ...samples.map((s) => u32(s.data.length))),
            full('stco', 0, 0, u32(1), u32(offset)),
          )))));
  const ftyp = box('ftyp', fourcc('isom'), u32(0x200), fourcc('isom'), fourcc('iso2'), fourcc('avc1'), fourcc('mp41'));
  const size = moov(0).length;
  const mdatBody = cat(samples.map((s) => s.data));
  return cat([ftyp, moov(ftyp.length + size + 8), u32(mdatBody.length + 8), fourcc('mdat'), mdatBody]);
}

const CODECS = ['avc1.42E028', 'avc1.42E01F', 'avc1.4D0028', 'avc1.640028'];

// draw(ctx, i) paints video frame i onto a width x height 2D context.
export async function encodeVideo({ width, height, fps = 30, count, draw, onProgress }) {
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d');
  if (typeof VideoEncoder === 'undefined') return recordWebM({ canvas, ctx, fps, count, draw, onProgress });
  let codec = null;
  const base = { width, height, bitrate: 10_000_000, framerate: fps, avc: { format: 'avc' } };
  for (const c of CODECS) {
    try { if ((await VideoEncoder.isConfigSupported({ ...base, codec: c })).supported) { codec = c; break; } } catch { /* try the next one */ }
  }
  if (!codec) return recordWebM({ canvas, ctx, fps, count, draw, onProgress });
  const timescale = fps * 1000;
  const samples = [];
  let avcC = null, failure = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const desc = meta?.decoderConfig?.description;
      if (desc && !avcC) avcC = ArrayBuffer.isView(desc) ? new Uint8Array(desc.buffer, desc.byteOffset, desc.byteLength).slice() : new Uint8Array(desc).slice();
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      samples.push({ data, key: chunk.type === 'key', duration: 1000 });
    },
    error: (e) => { failure = e; },
  });
  encoder.configure({ ...base, codec, latencyMode: 'quality' });
  for (let i = 0; i < count; i++) {
    if (failure) throw failure;
    draw(ctx, i);
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    if (encoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 1));
    onProgress?.((i + 1) / count);
  }
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
  if (!avcC) throw new Error('編碼器沒有提供 avcC 設定');
  return { blob: new Blob([buildMP4({ width, height, timescale, samples, avcC })], { type: 'video/mp4' }), ext: 'mp4', codec };
}

async function recordWebM({ canvas, ctx, fps, count, draw, onProgress }) {
  let el = canvas;
  if (!(canvas instanceof HTMLCanvasElement)) {
    el = Object.assign(document.createElement('canvas'), { width: canvas.width, height: canvas.height });
    ctx = el.getContext('2d');
  }
  const stream = el.captureStream(fps);
  const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm', videoBitsPerSecond: 10_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((r) => { rec.onstop = r; });
  rec.start();
  for (let i = 0; i < count; i++) {
    draw(ctx, i);
    onProgress?.((i + 1) / count);
    await new Promise((r) => setTimeout(r, 1000 / fps));
  }
  rec.stop();
  await done;
  return { blob: new Blob(chunks, { type: 'video/webm' }), ext: 'webm', codec: 'webm' };
}
