// Codec PNG mínimo, sem dependências: só o que o projeto precisa para montar folhas
// de contato dos móveis e compor assets novos (o `zlib` já vem no Node).
// Suporta os formatos que o LimeZu exporta: RGBA8, RGB8, cinza+alfa e paleta.
import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i++) c = crcTable[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Lê um PNG e devolve `{ width, height, data }` com data em RGBA8 puro. */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('assinatura PNG inválida');
  let offset = 8;
  let header = null;
  let palette = null;
  let alphaChunk = null;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colorType: body[9],
        interlace: body[12],
      };
    } else if (type === 'PLTE') palette = Buffer.from(body);
    else if (type === 'tRNS') alphaChunk = Buffer.from(body);
    else if (type === 'IDAT') idat.push(Buffer.from(body));
    else if (type === 'IEND') break;
  }
  if (!header) throw new Error('PNG sem IHDR');
  if (header.depth !== 8) throw new Error(`profundidade ${header.depth} não suportada`);
  if (header.interlace) throw new Error('PNG entrelaçado não suportado');

  const channels = CHANNELS[header.colorType];
  if (!channels) throw new Error(`colorType ${header.colorType} não suportado`);
  const { width, height } = header;
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prior = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[i - channels] : 0;
      const b = prior ? prior[i] : 0;
      const c = prior && i >= channels ? prior[i - channels] : 0;
      const value = line[i];
      out[i] = (filter === 1 ? value + a
        : filter === 2 ? value + b
        : filter === 3 ? value + ((a + b) >> 1)
        : filter === 4 ? value + paeth(a, b, c)
        : value) & 0xff;
    }
  }

  const data = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    const source = index * channels;
    const target = index * 4;
    if (header.colorType === 6) {
      pixels.copy(data, target, source, source + 4);
    } else if (header.colorType === 2) {
      pixels.copy(data, target, source, source + 3);
      data[target + 3] = 255;
    } else if (header.colorType === 0 || header.colorType === 4) {
      data.fill(pixels[source], target, target + 3);
      data[target + 3] = header.colorType === 4 ? pixels[source + 1] : 255;
    } else {
      const entry = pixels[source] * 3;
      data[target] = palette[entry];
      data[target + 1] = palette[entry + 1];
      data[target + 2] = palette[entry + 2];
      data[target + 3] = alphaChunk?.[pixels[source]] ?? 255;
    }
  }
  return { width, height, data };
}

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

/** Serializa uma imagem RGBA8 (`{ width, height, data }`) como PNG. */
export function encodePng({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Tela RGBA8 com as operações de composição usadas pelos geradores de asset. */
export function createCanvas(width, height) {
  return { width, height, data: Buffer.alloc(width * height * 4) };
}

/** Alpha-blend de `source` sobre `target` (o mesmo "source-over" do Canvas). */
export function blit(target, source, dx = 0, dy = 0) {
  for (let y = 0; y < source.height; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= target.height) continue;
    for (let x = 0; x < source.width; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= target.width) continue;
      const s = (y * source.width + x) * 4;
      const alpha = source.data[s + 3];
      if (!alpha) continue;
      const t = (ty * target.width + tx) * 4;
      if (alpha === 255) {
        source.data.copy(target.data, t, s, s + 4);
        continue;
      }
      const sa = alpha / 255;
      const ta = target.data[t + 3] / 255;
      const out = sa + ta * (1 - sa);
      for (let channel = 0; channel < 3; channel++) {
        target.data[t + channel] = Math.round(
          (source.data[s + channel] * sa + target.data[t + channel] * ta * (1 - sa)) / out,
        );
      }
      target.data[t + 3] = Math.round(out * 255);
    }
  }
  return target;
}

export function setPixel(target, x, y, [r, g, b, a = 255]) {
  if (x < 0 || y < 0 || x >= target.width || y >= target.height) return;
  const index = (y * target.width + x) * 4;
  target.data[index] = r;
  target.data[index + 1] = g;
  target.data[index + 2] = b;
  target.data[index + 3] = a;
}

export function fillRect(target, x, y, w, h, color) {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) setPixel(target, px, py, color);
  }
  return target;
}
