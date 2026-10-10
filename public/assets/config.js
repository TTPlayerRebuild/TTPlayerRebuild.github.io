export const MAX_CONFIG_BYTES = 2 * 1024 * 1024;

export function decodeConfig(buffer, codec) {
  const bytes = new Uint8Array(buffer);
  if (!bytes.length) throw new Error('这个文件是空的，请选择播放器保存的 XML 配置。');
  if (bytes.length > MAX_CONFIG_BYTES) throw new Error('配置文件超过 2 MB，请检查是否选对文件。');
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ||
    bytes[0] === 0xff && bytes[1] === 0xfe || bytes[0] === 0xfe && bytes[1] === 0xff;
  let encoding;
  if (bytes[0] === 0xff && bytes[1] === 0xfe || bytes[0] === 0x3c && bytes[1] === 0) encoding = 'utf-16le';
  else if (bytes[0] === 0xfe && bytes[1] === 0xff || bytes[0] === 0 && bytes[1] === 0x3c) encoding = 'utf-16be';
  else if (bom) encoding = 'utf-8';
  else {
    const header = String.fromCharCode(...bytes.subarray(0, 256));
    encoding = header.match(/^\s*<\?xml\b[^?]*\bencoding\s*=\s*['"]([^'"]+)['"]/i)?.[1].toLowerCase();
  }
  let text;
  try {
    if (/^(gbk|gb2312|cp936|windows-936|gb18030)$/.test(encoding || '')) {
      if (encoding === 'gb18030') throw new Error('unsupported');
      text = codec.decode(bytes);
    } else if (!encoding || /^(utf-8|utf8|utf-16le|utf-16be)$/.test(encoding)) {
      try { text = new TextDecoder(encoding || 'utf-8', { fatal: true }).decode(bytes); }
      catch (error) { if (encoding) throw error; text = codec.decode(bytes); }
    } else throw new Error('unsupported');
  } catch {
    throw new Error('无法读取配置的文字编码。请使用 UTF-8、UTF-16 或 GBK 编码的 XML。');
  }
  return { text: text.replace(/^\ufeff/, ''), bom: Boolean(bom) };
}

// Locate start tags without serializing the document: preserve comments, attribute
// order, whitespace and unrelated settings exactly, including quoted '>' characters.
function locatePlayer(text) {
  const stack = [];
  let root, player, close;
  for (let i = 0; i < text.length;) {
    const start = text.indexOf('<', i);
    if (start < 0) break;
    if (text.startsWith('<!--', start)) { i = text.indexOf('-->', start + 4) + 3; continue; }
    if (text.startsWith('<![CDATA[', start)) { i = text.indexOf(']]>', start + 9) + 3; continue; }
    if (text.startsWith('<?', start)) { i = text.indexOf('?>', start + 2) + 2; continue; }
    let quote = '', end = start + 1;
    for (; end < text.length; end++) {
      const char = text[end];
      if (quote) { if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    const raw = text.slice(start, end + 1);
    const closing = raw.startsWith('</');
    const name = raw.match(/^<\/?([^\s/>]+)/)?.[1];
    const selfClosing = raw.endsWith('/>');
    const tag = { start, end: end + 1, raw, selfClosing };
    if (closing) {
      stack.pop();
      if (!stack.length) close = tag;
    } else {
      if (!stack.length) root = tag;
      else if (stack.length === 1 && name === 'Player') player = tag;
      if (!selfClosing) stack.push(name);
    }
    i = end + 1;
  }
  return { root, player, close };
}

export function inspectConfig(text) {
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(text)) throw new Error('不支持带 DTD 或实体声明的配置，请选择播放器直接保存的 XML。');
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.getElementsByTagName('parsererror').length) throw new Error('XML 格式不正确，请检查文件是否完整。');
  const root = document.documentElement;
  if (!root || root.tagName !== 'ttplayer' || root.namespaceURI) throw new Error('这不是千千静听配置：根节点应为 <ttplayer>。');
  const players = Array.from(root.children).filter(node => node.tagName === 'Player');
  if (players.length > 1) throw new Error('配置中有多个 Player 节点，无法确定应修改哪一个。');
  if (players[0]?.namespaceURI) throw new Error('不支持带命名空间的 Player 节点。');
  return {
    text, ...locatePlayer(text),
    word: players[0]?.getAttribute('UserWord') || '',
    hash: players[0]?.getAttribute('UserWordMD5') || ''
  };
}

function patchTag(raw, values) {
  const edits = [];
  const missing = new Map(Object.entries(values));
  const attrs = /([^\s=/>]+)\s*=\s*(["'])([\s\S]*?)\2/g;
  for (const match of raw.matchAll(attrs)) {
    if (!missing.has(match[1])) continue;
    const start = match.index + match[0].indexOf(match[2]) + 1;
    edits.push({ start, end: start + match[3].length, text: missing.get(match[1]) });
    missing.delete(match[1]);
  }
  for (const edit of edits.reverse()) raw = raw.slice(0, edit.start) + edit.text + raw.slice(edit.end);
  if (missing.size) {
    const at = raw.length - (raw.endsWith('/>') ? 2 : 1);
    raw = raw.slice(0, at) + Array.from(missing, ([key, value]) => ` ${key}="${value}"`).join('') + raw.slice(at);
  }
  return raw;
}

export function generateConfig(config, personal) {
  const values = { UserWord: personal.word, UserWordMD5: personal.hash };
  let text;
  if (!config) {
    text = '<?xml version="1.0" encoding="UTF-8"?>\r\n<ttplayer>\r\n' +
      `  <Player UserWord="${personal.word}" UserWordMD5="${personal.hash}" />\r\n</ttplayer>\r\n`;
  } else {
    text = config.text;
    if (config.player) {
      const tag = config.player;
      text = text.slice(0, tag.start) + patchTag(tag.raw, values) + text.slice(tag.end);
    } else {
      const newline = text.includes('\r\n') ? '\r\n' : '\n';
      const indent = text.match(/\r?\n([ \t]+)<(?![!?/])/)?.[1] || '  ';
      const child = `${indent}<Player UserWord="${personal.word}" UserWordMD5="${personal.hash}" />`;
      if (config.root.selfClosing) {
        const tag = config.root;
        text = text.slice(0, tag.start) + tag.raw.slice(0, -2) + '>' + newline + child + newline + '</ttplayer>' + text.slice(tag.end);
      } else {
        const at = config.close.start;
        text = text.slice(0, at) + (text[at - 1] === '\n' ? '' : newline) + child + newline + text.slice(at);
      }
    }
    // Output is always UTF-8. Only change the declaration's encoding, if present.
    text = text.replace(/^(<\?xml\b[^?]*?\bencoding\s*=\s*)(["'])[^"']*\2/i, '$1$2UTF-8$2');
  }
  return (config?.bom ? '\ufeff' : '') + text;
}
