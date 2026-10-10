import { renderSkin } from './skn-render.js';
self.onmessage = async ({ data }) => {
  try { self.postMessage({ skin: await renderSkin(data.buffer, data.icon) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : '无法读取此皮肤。' }); }
};
