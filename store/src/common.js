// Small helpers for the store images (shots.html). Taken from Edge Trim's store kit (~/edge-trim/store/src).

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (test) => { while (!test()) await wait(30); };

function el(tag, cls, html, style) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (style) e.style.cssText = style;
  return e;
}
function put(e, parent = document.getElementById('canvas')) { parent.append(e); return e; }

// Czech typesetting: a one-letter word (k, s, v, z, o, u, a, i) never ends a line, so it's tied to the next word.
const tieShortWords = (s, lang) => (lang === 'cs' && typeof s === 'string' ? s.replace(/(?<=^|[\s>(])([ksvzouaiKSVZOUAI]) /g, '$1\u00a0') : s);

// A <canvas> showing `source` at w × h CSS px, drawn at twice that for sharpness.
function picture(source, w, h, style = '') {
  const c = el('canvas', null, null, `position:absolute;width:${w}px;height:${h}px;${style}`);
  c.width = Math.round(w * 2); c.height = Math.round(h * 2);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c;
}

// Store languages (as in _locales and store/images) -> the extension's interface language (lib/locales).
const uiCode = (store) => ({ pt_BR: 'pt', pt_PT: 'pt', fil: 'tl', zh_CN: 'zh-CN', zh_TW: 'zh-TW' }[store] || store);
const RTL_LANGS = new Set(['ar']);
// The language Snap Translate translates into on each store page: the page's own.
const targetCode = uiCode;

// Inter has Latin, Greek and Cyrillic; other scripts get the matching Noto Sans (as in Subtitle Overlay's images).
const SCRIPT_FONTS = {
  ja: ['Noto Sans JP', '日本語'], ko: ['Noto Sans KR', '한국어'], zh_CN: ['Noto Sans SC', '中文'], zh_TW: ['Noto Sans TC', '中文'],
  th: ['Noto Sans Thai', 'ไทย'], hi: ['Noto Sans Devanagari', 'हिन्दी'], ar: ['Noto Sans Arabic', 'عربي'],
};
let scriptFontReady = Promise.resolve();
function useScriptFont(lang) {
  const f = SCRIPT_FONTS[lang];
  if (!f) return;
  const link = el('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${f[0].replace(/ /g, '+')}:wght@400;500;600;700;800&display=block`;
  scriptFontReady = new Promise((resolve) => { link.onload = link.onerror = resolve; });
  document.head.append(link);
  document.documentElement.style.setProperty('--script-font', `"${f[0]}"`);
  document.documentElement.classList.add('script', 'script-' + lang);
}

// Every weight in use is loaded before anything is measured or captured. Inter comes in parts (Latin, Latin
// with accents, Greek, Cyrillic, Vietnamese), each loaded only for its letters: the sample asks for all of them,
// or a Greek or Ukrainian headline would be measured in a stand-in font and grow after the popup is placed under it.
const INTER_SAMPLE = 'Aa ĂăŐőŁłŞşĎď ΑαΩω АаЖжЇїҐґ Ỹỹ';
async function fontsLoaded(lang) {
  await scriptFontReady;
  const f = SCRIPT_FONTS[lang];
  await Promise.all([400, 500, 600, 700, 800].flatMap((w) => [
    document.fonts.load(`${w} 16px Inter`, INTER_SAMPLE),
    ...(f ? [document.fonts.load(`${w} 16px "${f[0]}"`, f[1])] : []),
  ]));
}

const ARROW = '<svg width="72" height="24" viewBox="0 0 72 24" aria-hidden="true"><path d="M2 12h64m-9-9 9 9-9 9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CURSOR = '<svg width="22" height="30" viewBox="0 0 22 30" aria-hidden="true"><path d="M2 2v22l6-5.5 4 9 4-1.8-4-8.7h8.5z" fill="#111" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>';

// The real popup in a frame, zoomed; setup(win) prepares it, then it's scrolled to `scrollTo`.
// crop: a selector for one part of it instead; the frame is then just as tall as that part, plus pad above and padEnd below.
// parent: where it goes (the canvas by default).
// fit: a selector the frame ends just under (fitPad below it), whatever the language makes the popup's height.
async function popup({ x, y, h, zoom = 1.1, setup, scrollTo, offset = 0, crop, pad = 4, padEnd = pad, fit, fitPad = 14, scheme = 'dark', parent }) {
  const lang = uiCode(new URLSearchParams(location.search).get('lang') || 'en');
  const box = put(el('div', 'popup', null, `left:${x}px;top:${y}px;width:${Math.round(380 * zoom)}px;height:${h || 600}px`), parent);
  const frame = el('iframe');
  frame.src = `popup-frame.html?lang=${lang}&zoom=${zoom}&scheme=${scheme}`;
  box.append(frame);
  await new Promise((r) => { frame.onload = r; });
  const win = frame.contentWindow;
  await until(() => win.popupReady);
  if (setup) await setup(win);
  if (fit) box.style.height = `${win.document.querySelector(fit).getBoundingClientRect().bottom + fitPad}px`;
  const target = win.document.querySelector(crop || scrollTo);
  if (target) {
    const rect = target.getBoundingClientRect(), top = rect.top + win.scrollY;
    // Shorter first, so the scroll isn't held back by a frame taller than what's left of the popup.
    if (crop) box.style.height = `${rect.height + pad + padEnd}px`;
    win.scrollTo(0, top - (crop ? pad : offset));
  }
  return box;
}

function browser({ x, y, w, h, url, parent }) {
  const box = put(el('div', 'browser', null, `left:${x}px;top:${y}px;width:${w}px;height:${h}px`), parent);
  box.append(el('div', 'browser-bar', `<span class="dots"><i></i><i></i><i></i></span><span class="url">${url}</span><img class="ext-icon" src="../../icons/icon128.png" alt="">`));
  return put(el('div', 'page', null, `height:${h - 40}px`), box);
}

// A web page in a browser window, with Snap Translate's real page script running in it (page.html).
// Returns the window and the page's own window, ready to translate.
async function webPage({ x, y, w, h, url, pic, view = 'picture', size, compact }) {
  const lang = new URLSearchParams(location.search).get('lang') || 'en';
  const box = put(el('div', 'browser', null, `left:${x}px;top:${y}px;width:${w}px;height:${h}px`));
  box.append(el('div', 'browser-bar', `<span class="dots"><i></i><i></i><i></i></span><span class="url">${url}</span><img class="ext-icon" src="../../icons/icon128.png" alt="">`));
  const frame = el('iframe', 'page-frame', null, `height:${h - 40}px`);
  frame.src = `page.html?lang=${lang}&pic=${pic}&view=${view}${size ? `&size=${size}` : ''}${compact ? '&compact=1' : ''}`;
  box.append(frame);
  await new Promise((r) => { frame.onload = r; });
  const win = frame.contentWindow;
  await until(() => win.pageReady);
  return { box, frame, win };
}

// Where an element inside the page's frame is, on the store image.
function inFrame(frame, rect) {
  const f = frame.getBoundingClientRect();
  return { x: f.left + rect.left, y: f.top + rect.top, w: rect.width, h: rect.height };
}

// A picture shown on its own, with a small tag above it.
function pictureSlot(source, { x, y, w, h, tag, after }) {
  put(picture(source, w, h, `left:${x}px;top:${y}px;border-radius:8px;box-shadow:0 20px 60px rgb(0 0 0 / .45)`));
  put(el('div', 'label', `<span class="tag ${after ? 'after' : ''}">${tag}</span>`, `left:${x}px;top:${y - 34}px`));
}

// Chrome's right-click menu at (mx, my) on the store image, with Snap Translate's item under the pointer.
// items: Chrome's own six items around it (copy/chrome-menu.json).
function rightClick({ mx, my, items: m, ours, maxRight }) {
  const menu = put(el('div', 'menu', `<div>${m[0]}</div><div>${m[1]}</div><div>${m[2]}</div><div>${m[3]}</div><hr><div>${m[4]}</div><hr>
    <div class="on"><img src="../../icons/icon32.png" alt="">${ours}</div><hr><div>${m[5]}</div>`, `left:${mx}px;top:${my}px`));
  // Long menu items would push the menu past the window: then it opens further left.
  mx -= Math.max(0, mx + menu.offsetWidth - maxRight);
  menu.style.left = `${mx}px`;
  const item = menu.querySelector('.on');
  put(el('div', null, CURSOR, `position:absolute;z-index:5;left:${mx + Math.min(item.offsetWidth - 30, 150)}px;top:${my + item.offsetTop + 8}px`));
  return menu;
}
