import { readDirectory, extractEntry, parseSkin, resourceName, bounds, textLayout, LIMITS } from './skn-package.js';
import { decodeBmp, iconFrame, rasterInfo } from './skn-bitmap.js';

const buttons = new Set(['play', 'stop', 'prev', 'next', 'mute', 'open', 'lyric', 'equalizer', 'playlist', 'exit', 'minimize', 'minimode', 'set', 'mode_circle']);

export async function renderSkin(buffer, fallbackIcon) {
  const archive = readDirectory(buffer);
  const skin = parseSkin(await extractEntry(archive, 'Skin.xml', LIMITS.xml));
  const images = new Map(), warnings = new Set(); let decodedPixels = 0;
  async function raster(bytes, key) {
    let rgba;
    if (bytes[0] === 66 && bytes[1] === 77) rgba = decodeBmp(bytes, key);
    else if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) {
      rgba = iconFrame(bytes);
      if (rgba.encoded) { bytes = rgba.encoded; rgba = null; }
    }
    const info = rgba || rasterInfo(bytes);
    decodedPixels += info.width * info.height;
    if (decodedPixels > 16 * 1024 * 1024) throw new Error('皮肤图片累计尺寸超出限制。');
    const canvas = new OffscreenCanvas(info.width, info.height), ctx = canvas.getContext('2d');
    if (rgba) ctx.putImageData(new ImageData(rgba.data, rgba.width, rgba.height), 0, 0);
    else {
      const bitmap = await createImageBitmap(new Blob([bytes], { type: info.type }));
      try {
        if (bitmap.width !== info.width || bitmap.height !== info.height) throw new Error('皮肤图片解码尺寸不一致。');
        ctx.drawImage(bitmap, 0, 0);
      } finally { bitmap.close(); }
      if (key) {
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height), color = parseInt(key.slice(1), 16);
        for (let p = 0; p < pixels.data.length; p += 4) if (((pixels.data[p] << 16) | (pixels.data[p + 1] << 8) | pixels.data[p + 2]) === color) pixels.data[p + 3] = 0;
        ctx.putImageData(pixels, 0, 0);
      }
    }
    return canvas;
  }
  async function image(name, required = false) {
    if (!name) return null;
    const key = resourceName(name);
    if (!images.has(key)) {
      try { images.set(key, await raster(await extractEntry(archive, key), skin.transparent)); }
      catch (error) { if (required) throw error; warnings.add(`未显示 ${name}：${error.message}`); images.set(key, null); }
    }
    return images.get(key);
  }
  const background = await image(skin.background, true);
  const canvas = new OffscreenCanvas(background.width, background.height), ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false; ctx.drawImage(background, 0, 0);
  function clip(rect, draw) {
    ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.width, rect.height); ctx.clip();
    draw(); ctx.restore();
  }
  async function slider(node, rect) {
    const attrs = node.attrs, vertical = attrs.vertical?.toLowerCase() === 'true';
    const bar = await image(attrs.bar_image), thumb = await image(attrs.thumb_image);
    // Preview the idle position and a fixed 10% volume, matching the default preview.
    const value = node.name === 'volume' ? 10 : 0;
    const tw = thumb ? Math.floor(thumb.width / 4) : 0, th = thumb?.height || 0;
    const spanX = Math.max(0, rect.width - 2 - Math.max(1, tw)), spanY = Math.max(0, rect.height - 2 - Math.max(1, th));
    const tx = rect.x + 1 + Math.round(spanX * value / 100), ty = rect.y + 1 + Math.round(spanY * (100 - value) / 100);
    const fill = node.name === 'volume' ? await image(attrs.fill_image) : null;
    clip(rect, () => {
      if (bar) ctx.drawImage(bar, Math.floor(rect.x + (rect.width - bar.width) / 2), Math.floor(rect.y + (rect.height - bar.height) / 2));
      if (fill) {
        const x = Math.floor(rect.x + (rect.width - fill.width) / 2), y = Math.floor(rect.y + (rect.height - fill.height) / 2);
        if (vertical) {
          const start = Math.floor(ty + Math.max(1, th) / 2), sy = Math.max(0, Math.min(fill.height, start - y));
          if (fill.height > sy) ctx.drawImage(fill, 0, sy, fill.width, fill.height - sy, x, start, fill.width, fill.height - sy);
        } else {
          const width = Math.max(0, Math.min(fill.width, Math.floor(tx + Math.max(1, tw) / 2) - x));
          if (width) ctx.drawImage(fill, 0, 0, width, fill.height, x, y, width, fill.height);
        }
      }
      if (thumb && tw) ctx.drawImage(thumb, 0, 0, tw, th, vertical ? Math.floor(rect.x + (rect.width - tw) / 2) : tx, vertical ? ty : Math.floor(rect.y + (rect.height - th) / 2), tw, th);
    });
  }
  let info = null, stereo = null;
  for (const node of skin.elements) {
    const rect = bounds(node.attrs.position); if (!rect) continue;
    if (buttons.has(node.name)) {
      const bitmap = await image(node.attrs.image); if (!bitmap) continue;
      const width = Math.floor(bitmap.width / 4); if (!width) continue;
      const state = ['prev', 'next', 'stop'].includes(node.name) ? 3 : ['playlist', 'lyric'].includes(node.name) ? 2 : 0;
      // Native four-frame buttons use bitmap frame dimensions, not XML widths.
      ctx.drawImage(bitmap, state * width, 0, width, bitmap.height, rect.x, rect.y, width, bitmap.height);
    } else if (node.name === 'progress' || node.name === 'volume') await slider(node, rect);
    else if (node.name === 'led') {
      const bitmap = await image(node.attrs.image); if (!bitmap) continue;
      const width = Math.floor(bitmap.width / 12); if (!width) continue;
      const x = node.attrs.align?.split('+').includes('left') ? rect.x : rect.x + rect.width - width * 5;
      for (const [i, digit] of [0, 0, 10, 0, 0].entries()) ctx.drawImage(bitmap, digit * width, 0, width, bitmap.height, x + i * width, rect.y, width, bitmap.height);
    } else if (node.name === 'icon') {
      // The native icon attribute is distinct from ordinary bitmap image=.
      let bitmap = node.attrs.icon && archive.entries.has(resourceName(node.attrs.icon)) ? await image(node.attrs.icon) : null;
      if (!bitmap) bitmap = await raster(new Uint8Array(fallbackIcon), null);
      ctx.drawImage(bitmap, rect.x, rect.y, 16, 16);
    } else if (['info', 'stereo', 'status'].includes(node.name)) {
      const layout = textLayout(node);
      if (layout.background) { ctx.fillStyle = layout.background; ctx.fillRect(rect.x, rect.y, rect.width, rect.height); }
      if (node.name === 'info' && !info) info = layout;
      if (node.name === 'stereo' && !stereo) stereo = layout;
    }
  }
  if (!info) warnings.add('此皮肤没有信息区，个人名称可在下方完整文字中查看。');
  return { name: skin.name.slice(0, 256), author: skin.author.slice(0, 256), width: canvas.width, height: canvas.height, info, stereo, warnings: [...warnings], image: await canvas.convertToBlob({ type: 'image/png' }) };
}
