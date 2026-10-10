// The legacy player verifies MD5 over escaped CP936 bytes plus this suffix.
const suffix = new TextEncoder().encode('tt#$(@#*$!2');
const rotations = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const constants = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0);

// RFC 1321, used solely for compatibility with the player's configuration format.
export function md5(bytes) {
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, (bytes.length * 8) >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(bytes.length / 0x20000000), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let offset = 0; offset < padded.length; offset += 64) {
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      const round = i >>> 4;
      let f, index;
      if (round === 0) { f = (b & c) | (~b & d); index = i; }
      else if (round === 1) { f = (d & b) | (~d & c); index = (5 * i + 1) % 16; }
      else if (round === 2) { f = b ^ c ^ d; index = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); index = (7 * i) % 16; }
      const sum = (a + f + constants[i] + view.getUint32(offset + index * 4, true)) | 0;
      const shift = rotations[round * 4 + i % 4];
      const next = (b + ((sum << shift) | (sum >>> (32 - shift)))) | 0;
      a = d; d = c; c = b; b = next;
    }
    a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
  }
  return [a0, b0, c0, d0].flatMap(value => [0, 8, 16, 24].map(shift =>
    ((value >>> shift) & 255).toString(16).padStart(2, '0'))).join('');
}

export function createCodec(buffer, metadata) {
  if (buffer.byteLength !== 23940 * 2) throw new Error('名称编码表不完整，请刷新页面后重试。');
  const view = new DataView(buffer);
  const encoding = new Map(Array.from({ length: 128 }, (_, i) => [i, i]));
  const single = new Map(Object.entries(metadata.single).map(([key, value]) => [Number(key), value]));
  for (const [byte, point] of single) encoding.set(point, byte);
  const table = [];
  for (let lead = 0x81, i = 0; lead <= 0xfe; lead++) {
    for (let trail = 0x40; trail <= 0xfe; trail++) {
      if (trail === 0x7f) continue;
      const point = view.getUint16(i++ * 2, true);
      table.push(point);
      if (point) encoding.set(point, (lead << 8) | trail);
    }
  }
  for (const [point, value] of metadata.overrides) {
    if (value === null) encoding.delete(point);
    else encoding.set(point, value);
  }
  return {
    encode(text) {
      const bytes = [];
      for (const char of text) {
        const value = encoding.get(char.codePointAt(0));
        if (value === undefined || value > 127 && value < 256 && !single.has(value))
          throw new Error(`“${char}”无法用原版的 GBK 编码保存，请换一个字符。`);
        if (value > 255) bytes.push(value >>> 8);
        bytes.push(value & 255);
      }
      return Uint8Array.from(bytes);
    },
    decode(bytes) {
      const chars = [];
      for (let i = 0; i < bytes.length; i++) {
        const lead = bytes[i];
        if (lead < 128) { chars.push(String.fromCharCode(lead)); continue; }
        if (single.has(lead)) { chars.push(String.fromCharCode(single.get(lead))); continue; }
        const trail = bytes[++i];
        if (lead < 0x81 || lead > 0xfe || trail === undefined || trail < 0x40 || trail > 0xfe || trail === 0x7f)
          throw new Error('配置中包含无效的 GBK 字符。');
        const point = table[(lead - 0x81) * 190 + trail - 0x40 - (trail > 0x7f ? 1 : 0)];
        if (!point) throw new Error('配置中包含无效的 GBK 字符。');
        chars.push(String.fromCharCode(point));
      }
      return chars.join('');
    }
  };
}

export function normalizeName(name) {
  let value = name.trim().replace(/[\x00-\x1f\x7f]/g, '').slice(0, 64);
  if (/[\ud800-\udbff]$/.test(value)) value = value.slice(0, -1);
  return value;
}

function digest(bytes) {
  const input = new Uint8Array(bytes.length + suffix.length);
  input.set(bytes); input.set(suffix, bytes.length);
  return md5(input);
}

export function encodePersonalName(name, codec) {
  const normalized = normalizeName(name);
  if (!normalized) return { name: '', word: '', hash: '' };
  const escaped = [];
  for (const byte of codec.encode(normalized)) {
    escaped.push(byte);
    if (byte === 0x5c) escaped.push(byte);
  }
  const word = escaped.map(byte => {
    const char = String.fromCharCode(byte);
    return /^[a-zA-Z0-9_.-]$/.test(char) ? char : '%' + byte.toString(16).toUpperCase().padStart(2, '0');
  }).join('');
  return { name: normalized, word, hash: digest(escaped) };
}

export function decodePersonalName(word, hash, codec) {
  if (!word || word.length > 4096 || !/^[0-9a-f]{32}$/.test(hash)) return '';
  try {
    const bytes = [];
    for (let i = 0; i < word.length; i++) {
      let byte = word.charCodeAt(i);
      if (word[i] === '%') {
        const hex = word.slice(i + 1, i + 3);
        if (!/^[0-9a-f]{2}$/i.test(hex)) return '';
        byte = parseInt(hex, 16); i += 2;
      } else if (word[i] === '+') byte = 32;
      if (!byte || byte > 255) return '';
      bytes.push(byte);
    }
    if (digest(bytes) !== hash) return '';
    const unescaped = [];
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0x5c && i + 1 < bytes.length) i++;
      unescaped.push(bytes[i]);
    }
    return normalizeName(codec.decode(unescaped));
  } catch { return ''; }
}
