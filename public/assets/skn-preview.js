import { LIMITS } from './skn-package.js';

const defaultSkin = {
  name: 'TT.experience', width: 327, height: 141,
  info: { x: 17, y: 35, width: 173, height: 14, size: 13, font: 'Tahoma', color: '#ffffff', align: 'left' },
  stereo: { x: 205, y: 41, width: 72, height: 14, size: 13, font: 'Tahoma', color: '#8bbac6', align: 'right' }
};
export function setupSkinPreview(setTitle, onChange) {
  const get = id => document.getElementById(id);
  const zone = get('skin-dropzone'), picker = get('skin-file'), label = get('skin-status');
  let generation = 0, cancel = null, currentUrl = null, iconPromise, currentName = defaultSkin.name, dragDepth = 0;
  function message(text, error = false) {
    get('skin-error').textContent = error ? text : '';
    get('skin-error').hidden = !error;
    if (!error) label.textContent = text;
  }
  function text(node, rect, layout, center) {
    node.parentElement.style.display = layout ? '' : 'none';
    if (!layout) return;
    for (const key of ['x', 'y', 'width', 'height']) rect.setAttribute(key, layout[key]);
    node.style.fontFamily = `"${layout.font.replace(/["\\\r\n]/g, '')}", SimSun, sans-serif`;
    node.style.fontSize = `${layout.size}px`;
    node.setAttribute('fill', layout.color);
    node.setAttribute('y', layout.y + (center ? (layout.height - layout.size) / 2 : 0) + layout.size * 0.85);
    node.setAttribute('x', layout.x + (layout.align === 'right' ? layout.width : layout.align === 'center' ? layout.width / 2 : 0));
    node.setAttribute('text-anchor', layout.align === 'right' ? 'end' : layout.align === 'center' ? 'middle' : 'start');
  }
  function apply(skin, source, uploaded) {
    get('player-preview').style.width = `${Math.min(skin.width, skin.width * 360 / skin.height)}px`;
    get('player-svg').setAttribute('viewBox', `0 0 ${skin.width} ${skin.height}`);
    get('player-svg').setAttribute('width', skin.width); get('player-svg').setAttribute('height', skin.height);
    const image = get('preview-background');
    image.setAttribute('width', skin.width); image.setAttribute('height', skin.height); image.setAttribute('href', source);
    text(get('preview-title'), get('player-info-rect'), skin.info, true);
    text(get('preview-stereo'), get('player-stereo-rect'), skin.stereo, false);
    setTitle.configure(skin.info);
    currentName = skin.name;
    get('reset-skin').hidden = !uploaded;
    message(`${skin.name} · ${skin.width} × ${skin.height}`);
    label.title = [skin.name, skin.author].filter(Boolean).join(' · ');
    get('skin-warning').textContent = (skin.warnings || []).join('\n');
    get('skin-notes').hidden = !skin.warnings?.length;
    get('skin-notes-title').textContent = skin.info ? '皮肤预览说明' : '此皮肤没有曲目信息区';
    onChange();
  }
  function stop() { generation++; cancel?.(); cancel = null; zone.removeAttribute('aria-busy'); }
  async function iconBytes() {
    iconPromise ??= fetch(new URL('./default-skin/icon.png', import.meta.url)).then(response => {
      if (!response.ok) throw new Error('默认图标加载失败，请稍后重试。');
      return response.arrayBuffer();
    }).catch(error => { iconPromise = null; throw error; });
    return iconPromise;
  }
  async function load(file) {
    stop(); const id = generation;
    message(`正在读取 ${file.name}…`); zone.setAttribute('aria-busy', 'true');
    let pendingUrl;
    try {
      if (!/\.skn$/i.test(file.name)) throw new Error('请在预览区放入 .skn 皮肤；XML 配置请放到右侧配置区。');
      if (file.size > LIMITS.file) throw new Error('皮肤超过 8 MB，请选择较小的 SKN 文件。');
      const [buffer, icon] = await Promise.all([file.arrayBuffer(), iconBytes()]);
      if (id !== generation) return;
      const skin = await new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./skn-worker.js', import.meta.url), { type: 'module' });
        const done = (error, value) => { clearTimeout(timeout); worker.terminate(); cancel = null; error ? reject(error) : resolve(value); };
        const timeout = setTimeout(() => done(new Error('皮肤处理超时，已保留原预览。')), 15000);
        cancel = () => done(new DOMException('Cancelled', 'AbortError'));
        worker.onmessage = event => event.data.error ? done(new Error(event.data.error)) : done(null, event.data.skin);
        worker.onerror = event => { event.preventDefault(); done(new Error('皮肤处理失败，请使用支持 Worker 的现代浏览器。')); };
        worker.postMessage({ buffer, icon }, [buffer]);
      });
      if (id !== generation) return;
      pendingUrl = URL.createObjectURL(skin.image);
      const image = new Image(); image.src = pendingUrl; await image.decode();
      if (id !== generation) return;
      apply(skin, pendingUrl, true);
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      currentUrl = pendingUrl; pendingUrl = null;
    } catch (error) {
      if (id === generation && error.name !== 'AbortError') {
        label.textContent = `${currentName} · 已保留当前预览`;
        message(error.message, true);
      }
    } finally {
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
      if (id === generation) zone.removeAttribute('aria-busy');
    }
  }
  get('choose-skin').addEventListener('click', () => picker.click());
  picker.addEventListener('change', () => { const file = picker.files[0]; picker.value = ''; if (file) load(file); });
  get('reset-skin').addEventListener('click', () => {
    stop(); apply(defaultSkin, './assets/default-skin/player.png', false);
    if (currentUrl) URL.revokeObjectURL(currentUrl); currentUrl = null;
  });
  zone.addEventListener('dragenter', event => { event.preventDefault(); dragDepth++; zone.classList.add('dragover'); });
  zone.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; });
  zone.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; zone.classList.remove('dragover'); } });
  zone.addEventListener('drop', event => {
    event.preventDefault(); event.stopPropagation(); dragDepth = 0; zone.classList.remove('dragover');
    const files = event.dataTransfer.files;
    if (files.length === 1) load(files[0]);
    else if (files.length > 1) { stop(); label.textContent = `${currentName} · 已保留当前预览`; message('每次请选择一个 SKN 皮肤文件。', true); }
  });
  return { get name() { return currentName; } };
}
