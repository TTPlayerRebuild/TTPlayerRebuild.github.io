import { createCodec, normalizeName, encodePersonalName, decodePersonalName } from './personalization.js';
import { MAX_CONFIG_BYTES, decodeConfig, inspectConfig, generateConfig } from './config.js';
import { DEFAULT_BUILD_VERSION, isBuildVersion, previewText, attachTitleScroller } from './preview.js';

const byId = id => document.getElementById(id);
const form = byId('studio-form');
const input = byId('personal-name');
const picker = byId('config-file');
const dropzone = byId('dropzone');
const generate = byId('generate');
const result = byId('result');
const setPreviewTitle = attachTitleScroller(byId('preview-title'), 173);
byId('preview-build-version').value = DEFAULT_BUILD_VERSION;
let codec, config = null, busy = false, invalidFile = false, uploadId = 0;

function status(message, success = false) {
  result.textContent = message;
  result.classList.toggle('success', success);
}

function showError(id, message) {
  const target = byId(id);
  target.textContent = message;
  target.hidden = !message;
}

function edition() { return form.elements.edition.value; }

function update() {
  const name = normalizeName(input.value);
  const original = edition() === 'TTPlayer.xml';
  byId('name-count').textContent = `${input.value.length} / 64`;
  const buildVersion = byId('preview-build-version').value.trim();
  const preview = previewText({ original, name, buildVersion, originalVersion: byId('preview-original-version').value });
  setPreviewTitle(preview.title);
  byId('player-preview-label').textContent = `默认皮肤，无当前曲目：${preview.title}`;
  byId('preview-full-title').textContent = preview.title;
  byId('preview-edition').textContent = preview.edition;
  byId('preview-edition').title = preview.edition;
  byId('preview-edition-line').hidden = !preview.edition;
  byId('preview-edition-line').classList.toggle('original', original);
  byId('preview-dedication').textContent = preview.dedication;
  byId('preview-dedication').title = preview.dedication;
  byId('preview-dedication').hidden = !preview.dedication;
  byId('preview-full-signature').textContent = [preview.edition, preview.dedication].filter(Boolean).join(' ') || '（留空）';
  byId('preview-about-version').textContent = `版本：${preview.aboutVersion}`;
  byId('preview-original-choice').hidden = !original;
  byId('preview-build-choice').hidden = original;
  const invalidVersion = !original && !isBuildVersion(buildVersion);
  byId('preview-build-version').setAttribute('aria-invalid', String(invalidVersion));
  showError('preview-version-error', invalidVersion ? `请填写日期版本，例如 2026.10.02p1；目前按 ${DEFAULT_BUILD_VERSION} 预览。` : '');
  byId('name-help').textContent = config ? '保留其它设置；名称留空可取消个人定制。' : '支持中文、英文和数字，无需填写“个人版”。';
  generate.disabled = !codec || busy || invalidFile;
  if (codec) {
    try { encodePersonalName(name, codec); showError('name-error', ''); input.removeAttribute('aria-invalid'); }
    catch (error) { showError('name-error', error.message); input.setAttribute('aria-invalid', 'true'); }
  }
}

function resetFile() {
  uploadId++;
  config = null; busy = false; invalidFile = false;
  picker.value = '';
  byId('file-title').textContent = '导入已有的 XML 配置';
  byId('file-description').textContent = '拖到这里，或从电脑中选择';
  byId('remove-file').hidden = true;
  byId('output-label').textContent = '没有配置？直接新建一份';
  dropzone.classList.remove('loaded');
  showError('file-error', '');
  status('输入名称，即可生成你的专属配置。');
  update();
}

async function readFile(file) {
  const id = ++uploadId;
  busy = true; invalidFile = false; config = null;
  byId('remove-file').hidden = false;
  byId('file-title').textContent = file.name;
  byId('file-description').textContent = '正在读取配置…';
  showError('file-error', '');
  status('正在读取本地文件…');
  update();
  try {
    if (!/^(TTPlayer|TTPlayerRebuild)\.xml$/i.test(file.name)) throw new Error('请选择 TTPlayer.xml 或 TTPlayerRebuild.xml。');
    if (file.size > MAX_CONFIG_BYTES) throw new Error('配置文件超过 2 MB，请检查是否选对文件。');
    const decoded = decodeConfig(await file.arrayBuffer(), codec);
    const inspected = inspectConfig(decoded.text);
    if (id !== uploadId) return;
    config = { ...inspected, bom: decoded.bom };
    form.elements.edition.value = /^TTPlayerRebuild\./i.test(file.name) ? 'TTPlayerRebuild.xml' : 'TTPlayer.xml';
    input.value = decodePersonalName(config.word, config.hash, codec);
    byId('file-description').textContent = `${(file.size / 1024).toFixed(1)} KB · 已读取，其它设置将保留`;
    byId('output-label').textContent = '下载文件名称';
    dropzone.classList.add('loaded');
    status(input.value ? '已读取原有名称，可以修改后重新生成。' : '配置已就绪，请输入你的名称。');
  } catch (error) {
    if (id !== uploadId) return;
    invalidFile = true;
    byId('file-description').textContent = '未能读取，请重新选择';
    dropzone.classList.remove('loaded');
    showError('file-error', error.message);
    status('请选择有效配置，或移除文件后新建。');
  } finally {
    if (id === uploadId) { busy = false; update(); }
  }
}

byId('choose-file').addEventListener('click', () => picker.click());
picker.addEventListener('change', () => {
  const file = picker.files[0];
  picker.value = '';
  if (file) readFile(file);
});
byId('remove-file').addEventListener('click', resetFile);
let dragDepth = 0;
dropzone.addEventListener('dragenter', event => {
  event.preventDefault(); dragDepth++; dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; });
dropzone.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) { dragDepth = 0; dropzone.classList.remove('dragover'); }
});
dropzone.addEventListener('drop', event => {
  event.preventDefault(); dragDepth = 0; dropzone.classList.remove('dragover');
  if (!codec) return;
  const files = event.dataTransfer.files;
  if (files.length === 1) readFile(files[0]);
  else if (files.length > 1) status('每次请选择一份配置文件。');
});
// Avoid navigating away when a file is dropped just outside the recessed slot.
window.addEventListener('dragover', event => event.preventDefault());
window.addEventListener('drop', event => event.preventDefault());
input.addEventListener('input', () => { update(); status('预览已更新，生成后即可下载。'); });
byId('preview-build-version').addEventListener('input', update);
byId('preview-original-version').addEventListener('change', update);
form.querySelectorAll('input[name="edition"]').forEach(radio => radio.addEventListener('change', () => {
  update(); status(`将下载为 ${edition()}。`);
}));
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!codec || busy || invalidFile) return;
  try {
    const personal = encodePersonalName(input.value, codec);
    if (!config && !personal.name) throw new Error('请先输入一个名称，再生成个人版配置。');
    input.value = personal.name;
    update();
    const xml = generateConfig(config, personal);
    inspectConfig(xml); // Validate the final document before offering the download.
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = edition();
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    status(`${edition()} 已生成${personal.name ? '，请查看浏览器下载' : '，已清除个人名称'}。`, true);
  } catch (error) {
    showError('name-error', error.message);
    input.setAttribute('aria-invalid', 'true'); input.focus();
    status('暂未生成文件，请检查上方提示。');
  }
});

async function initialize() {
  byId('choose-file').disabled = true;
  try {
    const [table, metadata] = await Promise.all([
      fetch(new URL('./cp936.bin', import.meta.url)).then(response => {
        if (!response.ok) throw new Error('编码表加载失败');
        return response.arrayBuffer();
      }),
      fetch(new URL('./cp936.json', import.meta.url)).then(response => {
        if (!response.ok) throw new Error('编码表加载失败');
        return response.json();
      })
    ]);
    codec = createCodec(table, metadata);
    byId('choose-file').disabled = false;
    status('输入名称，即可生成你的专属配置。');
    update();
  } catch {
    status('定制工具加载失败，请检查网络后刷新页面。');
  }
}
update();
initialize();
