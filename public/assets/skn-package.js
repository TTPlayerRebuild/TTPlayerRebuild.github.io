// TTPlayer SKN: a ZIP directory containing a permissive legacy Skin.xml.
export const LIMITS = { file: 8 * 1024 * 1024, total: 64 * 1024 * 1024, entry: 16 * 1024 * 1024, xml: 512 * 1024, entries: 1024, pixels: 8 * 1024 * 1024, dimension: 4096 };
const fail = message => { throw new Error(message); };
export function resourceName(name) {
  const path = name.replaceAll('\\', '/');
  if (!path || path.startsWith('/') || /[:\x00-\x1f\x7f]/.test(path) || path.split('/').some(part => part === '..' || part === '.')) fail('皮肤包含无效的资源路径。');
  return path.toLowerCase();
}
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
  return n >>> 0;
});
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}
export function readDirectory(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  if (bytes.length < 22 || bytes.length > LIMITS.file) fail('请选择有效的 SKN 文件（不超过 8 MB）。');
  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 65557); end--) {
    if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === bytes.length) break;
  }
  if (end < Math.max(0, bytes.length - 65557)) fail('文件不是完整的 SKN / ZIP 皮肤包。');
  const count = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true), start = view.getUint32(end + 16, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count || !count || count > LIMITS.entries || start + size !== end) fail('不支持分卷、ZIP64 或目录异常的皮肤包。');
  const entries = new Map(), spans = [];
  let pos = start, expanded = 0;
  for (let index = 0; index < count; index++) {
    if (pos + 46 > end || view.getUint32(pos, true) !== 0x02014b50) fail('皮肤目录已损坏。');
    const flags = view.getUint16(pos + 8, true), method = view.getUint16(pos + 10, true);
    const crc = view.getUint32(pos + 16, true), packed = view.getUint32(pos + 20, true), length = view.getUint32(pos + 24, true);
    const nameSize = view.getUint16(pos + 28, true), extraSize = view.getUint16(pos + 30, true), commentSize = view.getUint16(pos + 32, true), local = view.getUint32(pos + 42, true);
    const next = pos + 46 + nameSize + extraSize + commentSize;
    if (next > end || !nameSize || flags & 0x2041 || ![0, 8].includes(method) || view.getUint16(pos + 34, true) || length > LIMITS.entry || (expanded += length) > LIMITS.total) fail('皮肤使用不支持的压缩方式，或解压大小超出限制。');
    const rawName = bytes.subarray(pos + 46, pos + 46 + nameSize);
    const name = resourceName(new TextDecoder(flags & 0x800 ? 'utf-8' : 'gbk', { fatal: true }).decode(rawName));
    if (entries.has(name)) fail('皮肤包含大小写冲突或重复资源。');
    if (local + 30 > start || view.getUint32(local, true) !== 0x04034b50 || view.getUint16(local + 6, true) !== flags || view.getUint16(local + 8, true) !== method || view.getUint16(local + 26, true) !== nameSize) fail('皮肤资源头与目录不一致。');
    const offset = local + 30 + nameSize + view.getUint16(local + 28, true);
    if (offset + packed > start || rawName.some((byte, i) => byte !== bytes[local + 30 + i])) fail('皮肤资源数据越界。');
    if (!(flags & 8) && (view.getUint32(local + 14, true) !== crc || view.getUint32(local + 18, true) !== packed || view.getUint32(local + 22, true) !== length)) fail('皮肤资源大小或校验信息不一致。');
    spans.push([local, offset + packed]);
    entries.set(name, { name, offset, packed, length, method, crc });
    pos = next;
  }
  if (pos !== end) fail('皮肤目录长度不一致。');
  spans.sort((a, b) => a[0] - b[0]);
  if (spans.some((span, i) => i && span[0] < spans[i - 1][1])) fail('皮肤资源相互重叠。');
  return { bytes, entries };
}
export async function extractEntry(archive, name, maximum = LIMITS.entry) {
  const entry = archive.entries.get(resourceName(name));
  if (!entry) fail(`皮肤缺少资源：${name}`);
  if (entry.length > maximum) fail(`皮肤资源过大：${name}`);
  const data = archive.bytes.subarray(entry.offset, entry.offset + entry.packed);
  let output;
  if (entry.method === 0) output = data.slice();
  else {
    let stream;
    try { stream = new DecompressionStream('deflate-raw'); }
    catch { fail('浏览器不支持 SKN 解压，请使用新版 Chrome、Edge、Firefox 或 Safari。'); }
    const reader = new Blob([data]).stream().pipeThrough(stream).getReader();
    const chunks = []; let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > entry.length || length > maximum) { await reader.cancel(); fail('皮肤实际解压大小超出声明。'); }
        chunks.push(value);
      }
      output = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
    } finally { reader.releaseLock(); }
  }
  if (output.length !== entry.length || crc32(output) !== entry.crc) fail(`皮肤资源校验失败：${name}`);
  return output;
}

function decodeText(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le', { fatal: true }).decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be', { fatal: true }).decode(bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('gbk', { fatal: true }).decode(bytes); }
}
function entities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (all, entity) => {
    const values = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (entity[0] !== '#') return values[entity.toLowerCase()];
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : all;
  });
}
// A bounded, non-executing token reader: unquoted values, adjacent attributes,
// duplicate attributes (first wins), bare '&', and trailing legacy text are accepted.
export function parseSkin(bytes) {
  if (bytes.length > LIMITS.xml) fail('Skin.xml 过大。');
  const text = decodeText(bytes);
  let pos = 0, root, player, nodes = 0;
  const stack = [];
  while (pos < text.length) {
    const open = text.indexOf('<', pos); if (open < 0) break;
    pos = open;
    if (text.startsWith('<!--', pos)) { const end = text.indexOf('-->', pos + 4); if (end < 0) fail('皮肤注释未结束。'); pos = end + 3; continue; }
    if (text.startsWith('<?', pos)) { const end = text.indexOf('?>', pos + 2); if (end < 0) fail('皮肤声明未结束。'); pos = end + 2; continue; }
    if (text.startsWith('<![CDATA[', pos)) { const end = text.indexOf(']]>', pos + 9); if (end < 0) fail('皮肤文本未结束。'); pos = end + 3; continue; }
    if (text.startsWith('<!', pos)) fail('皮肤不支持 DTD 或实体声明。');
    const closing = text[pos + 1] === '/'; pos += closing ? 2 : 1;
    const tag = /^[A-Za-z_][\w.-]*/.exec(text.slice(pos)); if (!tag) fail('皮肤标签无效。');
    const name = tag[0].toLowerCase(); pos += tag[0].length;
    const attrs = Object.create(null); let selfClosing = false, ended = false;
    while (pos < text.length) {
      while (/\s/.test(text[pos] || '') && pos < text.length) pos++;
      if (text[pos] === '>') { pos++; ended = true; break; }
      if (text.startsWith('/>', pos)) { pos += 2; selfClosing = true; ended = true; break; }
      if (closing) fail('皮肤结束标签无效。');
      const key = /^[A-Za-z_][\w.-]*/.exec(text.slice(pos)); if (!key) fail('皮肤属性无效。');
      pos += key[0].length;
      while (/\s/.test(text[pos] || '') && pos < text.length) pos++;
      if (text[pos++] !== '=') fail('皮肤属性缺少等号。');
      while (/\s/.test(text[pos] || '') && pos < text.length) pos++;
      const quote = text[pos], begin = quote === '"' || quote === "'" ? ++pos : pos;
      if (quote === '"' || quote === "'") {
        const end = text.indexOf(quote, pos); if (end < 0) fail('皮肤属性引号未结束。'); pos = end + 1;
        if (!(key[0].toLowerCase() in attrs)) attrs[key[0].toLowerCase()] = entities(text.slice(begin, end));
      } else {
        while (pos < text.length && !/[\s>"']/.test(text[pos]) && !text.startsWith('/>', pos)) pos++;
        if (!(key[0].toLowerCase() in attrs)) attrs[key[0].toLowerCase()] = entities(text.slice(begin, pos));
        if (text[pos] === '"' || text[pos] === "'") pos++;
      }
    }
    if (!ended || ++nodes > 4096) fail('皮肤描述不完整或过于复杂。');
    if (closing) {
      if (stack.pop()?.name !== name) fail('皮肤标签未正确闭合。');
      if (!stack.length) break;
    } else {
      const node = { name, attrs, children: [] };
      if (!root) { if (name !== 'skin') fail('文件不是 TTPlayer 皮肤。'); root = node; }
      else if (!stack.length) fail('皮肤根节点重复。');
      if (stack.length) stack.at(-1).children.push(node);
      if (name === 'player_window' && stack.length === 1 && !player) player = node;
      if (!selfClosing) stack.push(node);
    }
  }
  if (!root || stack.length || !player?.attrs.image) fail('皮肤缺少完整的主窗口定义。');
  if (root.attrs.version !== '2') fail('目前支持 TTPlayer 第 2 版 SKN 皮肤。');
  return { name: root.attrs.name || '未命名皮肤', author: root.attrs.author || '', transparent: color(root.attrs.transparent_color, '#ff00ff'), background: resourceName(player.attrs.image), elements: player.children };
}
export function color(value, fallback = null) { return /^#[0-9a-f]{6}$/i.test(value || '') ? value.toLowerCase() : fallback; }
export function bounds(value) {
  const fields = (value || '').split(',');
  if (fields.length < 4 || fields.slice(0, 4).some(field => !/^-?\d+$/.test(field.trim()))) return null;
  const numbers = fields.map(Number);
  if (numbers.slice(0, 4).some(n => !Number.isInteger(n) || Math.abs(n) > 32768)) return null;
  const [x, y, right, bottom] = numbers;
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}
export function textLayout(node) {
  const rect = bounds(node?.attrs.position); if (!rect) return null;
  const attrs = node.attrs, size = Number(attrs.font_size || 12);
  return { ...rect, font: (attrs.font || 'Tahoma').slice(0, 128), size: Math.max(6, Math.min(96, Math.abs(Number.isFinite(size) ? size : 12))), color: color(attrs.color, '#ffffff'), background: color(attrs.bkgnd), align: (attrs.align || 'left').split('+').find(x => ['left', 'center', 'right'].includes(x)) || 'left' };
}
