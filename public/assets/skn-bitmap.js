import { LIMITS } from './skn-package.js';
function sizeCheck(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > LIMITS.dimension || height > LIMITS.dimension || width * height > LIMITS.pixels) throw new Error('皮肤图片尺寸超出限制。');
}
function masked(value, mask) {
  if (!mask) return 0;
  let shift = 0; while (((mask >>> shift) & 1) === 0) shift++;
  const maximum = mask >>> shift;
  if ((maximum & (maximum + 1)) !== 0) throw new Error('BMP 颜色掩码无效。');
  return Math.round(((value & mask) >>> shift) * 255 / maximum);
}
export function decodeBmp(bytes, transparent = null) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 54 || bytes[0] !== 66 || bytes[1] !== 77) throw new Error('BMP 图片头无效。');
  const offset = view.getUint32(10, true), header = view.getUint32(14, true);
  if (![40, 52, 56, 108, 124].includes(header) || 14 + header > bytes.length) throw new Error('不支持此 BMP 头格式。');
  const width = view.getInt32(18, true), signedHeight = view.getInt32(22, true), height = Math.abs(signedHeight);
  sizeCheck(width, height);
  const bits = view.getUint16(28, true), compression = view.getUint32(30, true);
  if (view.getUint16(26, true) !== 1 || ![1, 4, 8, 16, 24, 32].includes(bits) || ![0, 3, 6].includes(compression) || (compression && ![16, 32].includes(bits))) throw new Error('不支持此 BMP 位深或压缩方式。');
  const stride = Math.ceil(width * bits / 32) * 4;
  let paletteOffset = 14 + header, red = bits === 16 ? 0x7c00 : 0xff0000, green = bits === 16 ? 0x3e0 : 0xff00, blue = bits === 16 ? 31 : 255;
  if (compression) {
    const masks = header === 40 ? 14 + header : 54;
    const maskBytes = compression === 6 ? 16 : 12;
    if (masks + maskBytes > bytes.length) throw new Error('BMP 颜色掩码不完整。');
    red = view.getUint32(masks, true); green = view.getUint32(masks + 4, true); blue = view.getUint32(masks + 8, true);
    if (!red || !green || !blue || (red & green) || (red & blue) || (green & blue)) throw new Error('BMP 颜色掩码冲突。');
    if (header === 40) paletteOffset += maskBytes;
  }
  const colors = bits <= 8 ? (view.getUint32(46, true) || 2 ** bits) : 0;
  if (colors > 2 ** bits || paletteOffset + colors * 4 > offset || offset > bytes.length || offset + stride * height > bytes.length) throw new Error('BMP 像素或调色板不完整。');
  const output = new Uint8ClampedArray(width * height * 4);
  const key = transparent === null ? -1 : Number.parseInt(transparent.slice(1), 16);
  for (let y = 0; y < height; y++) {
    const row = offset + (signedHeight > 0 ? height - 1 - y : y) * stride;
    for (let x = 0; x < width; x++) {
      let r, g, b;
      if (bits <= 8) {
        const byte = bytes[row + Math.floor(x * bits / 8)];
        const index = (byte >> (8 - bits - (x * bits % 8))) & ((1 << bits) - 1);
        if (index >= colors) throw new Error('BMP 调色板索引越界。');
        const p = paletteOffset + index * 4; b = bytes[p]; g = bytes[p + 1]; r = bytes[p + 2];
      } else if (bits === 24 || (bits === 32 && compression === 0)) {
        const p = row + x * (bits / 8); b = bytes[p]; g = bytes[p + 1]; r = bytes[p + 2];
      } else {
        const value = bits === 16 ? view.getUint16(row + x * 2, true) : view.getUint32(row + x * 4, true);
        r = masked(value, red); g = masked(value, green); b = masked(value, blue);
      }
      const p = (y * width + x) * 4;
      output[p] = r; output[p + 1] = g; output[p + 2] = b;
      // BI_RGB's fourth byte is reserved. Native SKN BMPs use a colour key.
      output[p + 3] = ((r << 16) | (g << 8) | b) === key ? 0 : 255;
    }
  }
  return { width, height, data: output };
}
export function iconFrame(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 22 || view.getUint16(0, true) !== 0 || view.getUint16(2, true) !== 1) throw new Error('ICO 图标头无效。');
  const count = view.getUint16(4, true);
  if (!count || count > 256 || 6 + count * 16 > bytes.length) throw new Error('ICO 图标目录不完整。');
  const entries = [];
  for (let i = 0; i < count; i++) {
    const p = 6 + i * 16, width = bytes[p] || 256, height = bytes[p + 1] || 256;
    const size = view.getUint32(p + 8, true), offset = view.getUint32(p + 12, true);
    if (offset < 6 + count * 16 || offset + size > bytes.length || size < 8) throw new Error('ICO 图标数据越界。');
    entries.push({ width, height, size, offset, depth: view.getUint16(p + 6, true) });
  }
  entries.sort((a, b) => (Math.abs(a.width - 16) + Math.abs(a.height - 16)) - (Math.abs(b.width - 16) + Math.abs(b.height - 16)) || b.depth - a.depth);
  const entry = entries[0], data = bytes.slice(entry.offset, entry.offset + entry.size);
  if (data[0] === 137 && data[1] === 80) return { encoded: data };
  if (data.length < 40) throw new Error('ICO 位图不完整。');
  const dib = new DataView(data.buffer, data.byteOffset, data.byteLength), header = dib.getUint32(0, true), bits = dib.getUint16(14, true), width = dib.getInt32(4, true), height = Math.abs(dib.getInt32(8, true)) / 2;
  sizeCheck(width, height);
  if (width !== entry.width || height !== entry.height || ![1, 4, 8, 24, 32].includes(bits) || header !== 40 || dib.getUint32(16, true) !== 0) throw new Error('不支持此 ICO 位图格式。');
  const colors = bits <= 8 ? (dib.getUint32(32, true) || 2 ** bits) : 0, pixels = header + colors * 4;
  const stride = Math.ceil(width * bits / 32) * 4, andStride = Math.ceil(width / 32) * 4, maskOffset = pixels + stride * height;
  if (maskOffset > data.length) throw new Error('ICO 像素不完整。');
  const bmp = new Uint8Array(14 + data.length); bmp.set([66, 77]); bmp.set(data, 14);
  const bv = new DataView(bmp.buffer); bv.setUint32(2, bmp.length, true); bv.setUint32(10, 14 + pixels, true); bv.setInt32(22, dib.getInt32(8, true) > 0 ? height : -height, true);
  const image = decodeBmp(bmp);
  let hasAlpha = false;
  if (bits === 32) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) hasAlpha ||= data[pixels + y * stride + x * 4 + 3] !== 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const row = dib.getInt32(8, true) > 0 ? height - 1 - y : y, dest = (y * width + x) * 4 + 3;
    if (hasAlpha) image.data[dest] = data[pixels + row * stride + x * 4 + 3];
    else if (maskOffset + andStride * height <= data.length && (data[maskOffset + row * andStride + (x >> 3)] & (128 >> (x & 7)))) image.data[dest] = 0;
  }
  return image;
}
export function rasterInfo(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width, height, type;
  if (bytes.length >= 33 && v.getUint32(0) === 0x89504e47 && v.getUint32(4) === 0x0d0a1a0a && v.getUint32(12) === 0x49484452) {
    width = v.getUint32(16); height = v.getUint32(20); type = 'image/png';
  } else if (bytes.length >= 13 && String.fromCharCode(...bytes.subarray(0, 6)).match(/^GIF8[79]a$/)) {
    width = v.getUint16(6, true); height = v.getUint16(8, true); type = 'image/gif';
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    let pos = 2;
    while (pos + 4 <= bytes.length) {
      if (bytes[pos++] !== 255) break;
      while (bytes[pos] === 255) pos++;
      const marker = bytes[pos++]; if (marker === 217 || marker === 218 || pos + 2 > bytes.length) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      const length = v.getUint16(pos); if (length < 2 || pos + length > bytes.length) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) && length >= 8) {
        height = v.getUint16(pos + 3); width = v.getUint16(pos + 5); type = 'image/jpeg'; break;
      }
      pos += length;
    }
  }
  if (!type) throw new Error('皮肤图片不是支持的 BMP、PNG、JPEG、GIF 或 ICO。');
  sizeCheck(width, height); return { width, height, type };
}
