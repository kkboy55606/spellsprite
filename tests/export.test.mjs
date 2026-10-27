import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeGIF, lzwEncode } from '../src/export/gif.js';
import { makeZip, crc32 } from '../src/export/zip.js';
import { buildMP4 } from '../src/export/mp4.js';
import { sheetLayout, buildSheet, atlasJSON, godotTres, stemOf } from '../src/export/formats.js';
import { render } from '../src/core/engine.js';

// Reference LZW decoder, written separately from the encoder.
function lzwDecode(bytes, minCode, count) {
  const clear = 1 << minCode, eoi = clear + 1;
  let size = minCode + 1, dict = [], prev = null, pos = 0;
  const reset = () => { dict = []; for (let i = 0; i < clear; i++) dict[i] = [i]; dict[clear] = []; dict[eoi] = []; size = minCode + 1; prev = null; };
  reset();
  const out = [];
  const read = () => { let v = 0; for (let i = 0; i < size; i++, pos++) v |= ((bytes[pos >> 3] >> (pos & 7)) & 1) << i; return v; };
  while (out.length < count) {
    const code = read();
    if (code === clear) { reset(); continue; }
    if (code === eoi) break;
    let entry;
    if (code < dict.length) entry = dict[code];
    else entry = [...dict[prev], dict[prev][0]];
    out.push(...entry);
    if (prev !== null && dict.length < 4096) dict.push([...dict[prev], entry[0]]);
    if (dict.length === 1 << size && size < 12) size++;
    prev = code;
  }
  return out;
}

test('LZW round-trips, including table resets past 4096 codes', () => {
  const r = (() => { let s = 7; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) % 16; })();
  const idx = Uint8Array.from({ length: 40000 }, (_, i) => (i % 97 < 50 ? r() : i % 3));
  const back = lzwDecode(lzwEncode(idx, 4), 4, idx.length);
  assert.deepEqual(back, [...idx]);
});

test('GIF: header, loop extension, frame count and transparency', () => {
  const res = render({ w: 32, h: 32, frames: 6, layers: [{ kind: 'blast' }] });
  const gif = encodeGIF(res.frames, 32, 32, { fps: 12, scale: 2 });
  assert.equal(String.fromCharCode(...gif.slice(0, 6)), 'GIF89a');
  assert.equal(gif[6] | (gif[7] << 8), 64);
  assert.ok(String.fromCharCode(...gif).includes('NETSCAPE2.0'));
  let frames = 0;
  for (let i = 0; i < gif.length - 3; i++) if (gif[i] === 0x21 && gif[i + 1] === 0xf9 && gif[i + 2] === 4) { frames++; assert.equal(gif[i + 3] & 1, 1); }
  assert.equal(frames, 6);
  assert.equal(gif[gif.length - 1], 0x3b);
});

test('GIF quantises more than 256 colours', () => {
  const f = new Uint8ClampedArray(64 * 64 * 4);
  for (let i = 0; i < 64 * 64; i++) { f[i * 4] = i & 255; f[i * 4 + 1] = (i >> 4) & 255; f[i * 4 + 2] = (i * 7) & 255; f[i * 4 + 3] = 255; }
  const gif = encodeGIF([f], 64, 64);
  assert.equal(gif[10] & 7, 7);
});

test('ZIP: entries and CRCs read back from the central directory', () => {
  const files = [{ name: 'a.txt', data: 'hello' }, { name: 'frames/中文.bin', data: new Uint8Array([1, 2, 3]) }];
  const z = makeZip(files);
  const dv = new DataView(z.buffer);
  const endAt = z.length - 22;
  assert.equal(dv.getUint32(endAt, true), 0x06054b50);
  assert.equal(dv.getUint16(endAt + 10, true), 2);
  let p = dv.getUint32(endAt + 16, true);
  const dec = new TextDecoder();
  for (const f of files) {
    assert.equal(dv.getUint32(p, true), 0x02014b50);
    const n = dv.getUint16(p + 28, true);
    assert.equal(dec.decode(z.slice(p + 46, p + 46 + n)), f.name);
    const data = typeof f.data === 'string' ? new TextEncoder().encode(f.data) : f.data;
    assert.equal(dv.getUint32(p + 16, true), crc32(data));
    p += 46 + n;
  }
});

function boxes(buf, start = 0, end = buf.length) {
  const out = [];
  const dv = new DataView(buf.buffer, buf.byteOffset);
  for (let p = start; p < end;) {
    const size = dv.getUint32(p);
    out.push({ type: String.fromCharCode(...buf.slice(p + 4, p + 8)), at: p, size });
    p += size;
  }
  return out;
}

test('MP4 muxer: box layout, sample table and chunk offset', () => {
  const samples = [{ data: new Uint8Array([0, 0, 0, 2, 0x65, 1]), key: true, duration: 1000 }, { data: new Uint8Array([0, 0, 0, 1, 0x41]), key: false, duration: 1000 }];
  const mp4 = buildMP4({ width: 1920, height: 1080, timescale: 30000, samples, avcC: new Uint8Array([1, 0x42, 0xe0, 0x28, 0xff, 0xe1, 0, 0, 1, 0, 0]) });
  const top = boxes(mp4);
  assert.deepEqual(top.map((b) => b.type), ['ftyp', 'moov', 'mdat']);
  const s = String.fromCharCode(...mp4);
  for (const t of ['mvhd', 'tkhd', 'mdhd', 'hdlr', 'vmhd', 'stsd', 'avc1', 'avcC', 'stts', 'stss', 'stsc', 'stsz', 'stco']) assert.ok(s.includes(t), t);
  const stco = s.indexOf('stco');
  const off = new DataView(mp4.buffer).getUint32(stco + 4 + 4 + 4);
  const mdat = top[2];
  assert.equal(off, mdat.at + 8);
  assert.equal(mp4[off + 4], 0x65);
});

test('sheet layout, atlas and Godot resource agree', () => {
  assert.deepEqual(sheetLayout(16, 64, 64), { cols: 16, rows: 1, w: 64, h: 64 });
  const big = sheetLayout(40, 128, 128);
  assert.ok(big.cols * 128 <= 4096 && big.cols * big.rows >= 40);
  const res = render({ w: 16, h: 16, frames: 5, layers: [{ kind: 'flash', dur: 1 }] });
  const sheet = buildSheet(res.frames, 16, 16, 2);
  assert.equal(sheet.width, 5 * 32); assert.equal(sheet.height, 32);
  const atlas = JSON.parse(atlasJSON('fx', sheet.layout, 5, { fps: 12, loop: false, impact: 0, pivot: [0.5, 0.5], scale: 2 }));
  assert.equal(Object.keys(atlas.frames).length, 5);
  assert.deepEqual(atlas.frames['fx_04.png'].frame, { x: 128, y: 0, w: 32, h: 32 });
  const tres = godotTres('fx', sheet.layout, 5, { fps: 12, loop: true, scale: 2 });
  assert.equal((tres.match(/type="AtlasTexture"/g) || []).length, 5);
  assert.ok(tres.startsWith('[gd_resource type="SpriteFrames" load_steps=7 format=3]'));
  assert.ok(tres.includes('region = Rect2(128, 0, 32, 32)'));
  assert.equal(stemOf('Abyssal Vortex!'), 'abyssal-vortex');
});
