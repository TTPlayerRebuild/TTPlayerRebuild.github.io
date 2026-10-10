// Verified against rebuild/build/generated/ttplayer/build_version.h on 2026-10-10.
// This is a reference player build, not the website deployment date or XML version.
export const DEFAULT_BUILD_VERSION = '2026.10.10';
export const SCROLL_INTERVAL_MS = 40;
export const SCROLL_HOLD_TICKS = 25;

export function isBuildVersion(value) {
  const match = /^(\d{4})\.(\d{2})\.(\d{2})(?:p[1-9]\d*)?$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() + 1 === Number(month) && date.getUTCDate() === Number(day);
}

export function previewText({ original, originalVersion = '5.7.9', buildVersion = DEFAULT_BUILD_VERSION, name = '' }) {
  const displayVersion = original ? (originalVersion === '5.0.1' ? '5.0.1' : '5.7 正式版')
    : (isBuildVersion(buildVersion) ? buildVersion : DEFAULT_BUILD_VERSION);
  return {
    title: `千千静听 ${displayVersion}${name ? ` ${name} 个人版` : ''}`,
    edition: original ? (name ? `${name} 个人版` : '') : '社区版',
    dedication: !original && name ? `献给 ${name}` : '',
    aboutVersion: `${original && originalVersion === '5.0.1' ? '5.0.1' : '5.7 正式版'} (Unicode)`
  };
}

export function createScrollState(textWidth, availableWidth) {
  return { maximum: Math.max(0, Math.ceil(textWidth) - availableWidth), offset: 0, direction: 1, hold: SCROLL_HOLD_TICKS };
}

// 5.7.9: 004092FC / 0040989E; rebuild: StartSkinInfoItem / OnSkinInfoScrollTimer.
export function advanceScroll(state) {
  if (!state.maximum) return;
  if (state.hold > 0) { state.hold--; return; }
  if (state.direction === 1 && state.offset > -state.maximum) state.offset--;
  else if (state.direction === -1 && state.offset < 0) state.offset++;
  else { state.direction = -state.direction; state.hold = SCROLL_HOLD_TICKS; }
}

export function attachTitleScroller(element, availableWidth) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let timer, state;
  function reset() {
    clearInterval(timer);
    element.removeAttribute('transform');
    state = createScrollState(element.getComputedTextLength(), availableWidth);
    if (!state.maximum || reducedMotion.matches || document.hidden) return;
    timer = setInterval(() => {
      advanceScroll(state);
      element.setAttribute('transform', `translate(${state.offset} 0)`);
    }, SCROLL_INTERVAL_MS);
  }
  document.addEventListener('visibilitychange', reset);
  reducedMotion.addEventListener('change', reset);
  document.fonts.ready.then(reset);
  return title => {
    if (element.textContent === title && state) return;
    element.textContent = title;
    reset();
  };
}
