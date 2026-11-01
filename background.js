// Snap Translate: the background worker. It starts the picker on the page,
// takes the screenshot, crops it to the chosen area and asks the chosen model.

importScripts('lib/i18n.js', 'lib/locales.js', 'lib/settings.js');
const t = SnapI18n.t;

// ---------- ways in: right-click menu, shortcut, popup button ----------

// The menu is rebuilt in the new language when it changes in the popup.
async function createMenus() {
  await SnapI18n.load();
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({ id: 'image', title: t('Translate picture'), contexts: ['image'] });
  chrome.contextMenus.create({ id: 'area', title: t('Translate an area…'), contexts: ['page', 'selection', 'link', 'video', 'frame'] });
}
chrome.runtime.onInstalled.addListener(createMenus);
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.uiLang) createMenus(); });

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const msg = info.menuItemId === 'image' && info.frameId === 0 ? { type: 'image', src: info.srcUrl } : { type: 'pick' };
  start(tab.id, msg).catch(() => {});
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'start-selection' && tab) start(tab.id, { type: 'pick' }).catch(() => {});
});

// The page script is added only when asked for (activeTab), never to every site.
async function start(tabId, msg) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['lib/i18n.js', 'lib/locales.js', 'overlay.js'] });
  await chrome.tabs.sendMessage(tabId, msg);
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.target === 'offscreen') return false;
  // The worker may have just woken up: read the interface language before answering.
  const answer = (p) => SnapI18n.load().then(() => p).then((v) => reply({ ok: true, ...v }), (e) => reply({ ok: false, error: e.message }));
  switch (msg.type) {
    case 'start':
      answer(start(msg.tabId, { type: 'pick' }).catch(() => {
        throw new Error(t('This page can’t be translated. Browser pages and the Web Store are off limits to extensions.'));
      }));
      return true;
    case 'capture':
      answer(capture(sender.tab.windowId, msg.rect, msg.vw));
      return true;
    case 'ask':
      answer(ask(msg.img));
      return true;
    case 'models':
      answer(models(msg.provider, msg.cfg));
      return true;
    case 'options':
      chrome.runtime.openOptionsPage();
      return false;
  }
  return false;
});

// ---------- screenshot, cropped to the area ----------

async function capture(windowId, rect, vw) {
  const shot = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  const bmp = await createImageBitmap(await (await fetch(shot)).blob());
  const k = bmp.width / vw; // screen pixels per CSS pixel (Retina, page zoom)
  const sx = Math.max(0, Math.round(rect.x * k));
  const sy = Math.max(0, Math.round(rect.y * k));
  const sw = Math.min(bmp.width - sx, Math.round(rect.w * k));
  const sh = Math.min(bmp.height - sy, Math.round(rect.h * k));
  // Long side between 768 and 1600 px: small text gets bigger, huge areas cost fewer tokens.
  const long = Math.max(sw, sh);
  const s = long > 1600 ? 1600 / long : long < 768 ? Math.min(2, 768 / long) : 1;
  const w = Math.round(sw * s), h = Math.round(sh * s);
  const canvas = new OffscreenCanvas(w, h);
  const g = canvas.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  return { img: { mime: 'image/jpeg', data: toBase64(await blob.arrayBuffer()), w, h } };
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// ---------- asking the model ----------

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const CLAUDE = 'https://api.anthropic.com/v1';

const PROMPT = (lang) => [
  'You read the text in a picture and translate it into ' + lang + '.',
  'Answer with JSON only, in this shape:',
  '{"code": "<the original language as a Google Translate code, like vi, en, zh-CN>", "blocks": [{"text": "<original text>", "translation": "<translation>", "box": [ymin, xmin, ymax, xmax]}]}',
  'One block per separate piece of text (a sign, a speech bubble, a caption, a paragraph), in reading order. Keep the lines of one piece together.',
  '"box" is where that text sits in the picture, as numbers from 0 to 1000 (0,0 is the top left corner).',
  'Copy "text" exactly, with all accents and diacritics. Write a natural ' + lang + ' translation that keeps names and the tone (slang, jokes, formal or casual).',
  'Text already in ' + lang + ' still gets a block, with the translation the same as the text.',
  'No text in the picture: {"code": "", "blocks": []}.',
].join('\n');

const ASK = 'Translate the text in this picture.';

async function ask(img) {
  const s = await snapLoadSettings();
  if (s.provider === 'quick') return labelled(await askQuick(img, s.target), s.target, 'Quick · Google Translate');
  const lang = snapLangName(s.target);
  const cfg = s[s.provider];
  if (s.provider !== 'local' && !cfg.key) throw new Error(t('Add your API key in the extension settings.'));
  if (!cfg.model) throw new Error(t('Choose a model in the extension settings.'));
  let text;
  if (s.provider === 'gemini') text = await askGemini(img, lang, cfg);
  else if (s.provider === 'claude') text = await askClaude(img, lang, cfg);
  else text = await askOpenAI(img, lang, s.provider, cfg);
  return labelled(parse(text), s.target, cfg.model);
}

// Names in the interface language, with flags, for the card's title.
function labelled(result, target, model) {
  const ui = SnapI18n.lang;
  return {
    result,
    source: result.code ? { name: snapLangName(result.code, ui), flag: snapFlag(result.code) } : null,
    target: { name: snapLangName(target, ui), flag: snapFlag(target) },
    model,
  };
}

// ---------- Quick: free, no key ----------

// The picture is read on this computer (Tesseract.js, in a hidden offscreen page);
// only the text it finds goes to Google Translate's free web endpoint, the same
// one Subtitle Overlay uses.
const GOOGLE_URL = 'https://translate.googleapis.com/translate_a/t?client=gtx&sl=auto&format=html&tl=';

async function askQuick(img, target) {
  const blocks = await readText(img);
  if (!blocks.length) return { code: '', blocks: [] };
  // Sent as HTML so the line breaks inside a paragraph survive.
  const body = new URLSearchParams();
  for (const b of blocks) body.append('q', b.text.split('\n').map(escapeHtml).join('<br>'));
  let r;
  try {
    r = await fetch(GOOGLE_URL + encodeURIComponent(target), { method: 'POST', body, signal: AbortSignal.timeout(30000) });
  } catch (e) { throw new Error(t('Can’t reach Google Translate. Check your connection.')); }
  if (r.status === 429) throw new Error(t('Google Translate says "too many requests". Wait a few minutes and try again.'));
  if (!r.ok) throw new Error(t('Google Translate answered HTTP {status}.', { status: r.status }));
  const data = await r.json();
  // With sl=auto each result is [text, detected language]; a single one can come back bare.
  const pairs = (Array.isArray(data) ? data : []).map((d) => (Array.isArray(d) ? d : [d, '']));
  if (pairs.length !== blocks.length) throw new Error(t('Google Translate sent back something unexpected.'));
  return {
    code: pairs.map((p) => p[1]).find(Boolean) || '',
    blocks: blocks.map((b, i) => ({ text: b.text, translation: unescapeHtml(pairs[i][0]), box: b.box, lines: b.lines })),
  };
}

const escapeHtml = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unescapeHtml = (t) => String(t).replace(/\s*<br\s*\/?>\s*/gi, '\n').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// The offscreen page stays open while you translate and closes after a few
// idle minutes, so the text reader doesn't hold memory all day.
let closeTimer = null;

async function readText(img) {
  if (!(await chrome.offscreen.hasDocument())) {
    await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['WORKERS'], justification: 'Reads text in pictures on this computer.' })
      .catch((e) => { if (!/single offscreen/i.test(e.message)) throw e; }); // two clicks at once
  }
  clearTimeout(closeTimer);
  const res = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'ocr', img });
  closeTimer = setTimeout(() => chrome.offscreen.closeDocument().catch(() => {}), 5 * 60 * 1000);
  if (!res || !res.ok) throw new Error(t('Couldn’t read the text in the picture.') + (res && res.error ? ' ' + res.error : ''));
  return res.blocks;
}

// ---------- AI translators ----------

// Thinking only slows a picture translation down: ask for the least the model
// allows, and drop the setting if the model doesn't know it.
function thinkingFor(model) {
  if (/gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  if (/gemini-[3-9]/.test(model)) return { thinkingLevel: 'low' };
  return null;
}

async function askGemini(img, lang, cfg) {
  const body = {
    systemInstruction: { parts: [{ text: PROMPT(lang) }] },
    contents: [{ role: 'user', parts: [{ inline_data: { mime_type: img.mime, data: img.data } }, { text: ASK }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
  };
  const thinking = thinkingFor(cfg.model);
  if (thinking) body.generationConfig.thinkingConfig = thinking;
  const url = `${GEMINI}/models/${encodeURIComponent(cfg.model)}:generateContent`;
  let data;
  try {
    data = await post('gemini', url, { 'x-goog-api-key': cfg.key }, body);
  } catch (e) {
    if (!(e.status === 400 && thinking && /think/i.test(e.message))) throw e;
    delete body.generationConfig.thinkingConfig;
    data = await post('gemini', url, { 'x-goog-api-key': cfg.key }, body);
  }
  const c = data.candidates && data.candidates[0];
  if (!c || !c.content) throw new Error(t('Gemini sent no answer.') + (c && c.finishReason ? ' (' + c.finishReason + ')' : ''));
  return c.content.parts.filter((p) => !p.thought).map((p) => p.text || '').join('');
}

async function askClaude(img, lang, cfg) {
  const data = await post('claude', CLAUDE + '/messages', claudeHeaders(cfg), {
    model: cfg.model,
    max_tokens: 4096,
    system: PROMPT(lang),
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: img.mime, data: img.data } },
        { type: 'text', text: ASK },
      ],
    }],
  });
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

function claudeHeaders(cfg) {
  return { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
}

// Ollama, LM Studio, OpenRouter and most others speak the OpenAI chat API.
async function askOpenAI(img, lang, kind, cfg) {
  const base = openAIBase(kind, cfg);
  if (kind === 'local') await allowLocal(base);
  const data = await post(kind, base + '/chat/completions', bearer(cfg), {
    model: cfg.model,
    temperature: 0.2,
    messages: [
      { role: 'system', content: PROMPT(lang) },
      { role: 'user', content: [
        { type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.data}` } },
        { type: 'text', text: ASK },
      ] },
    ],
  });
  const m = data.choices && data.choices[0] && data.choices[0].message;
  return String((m && m.content) || '');
}

function openAIBase(kind, cfg) {
  const url = String(cfg.url || '').trim().replace(/\/+$/, '');
  return kind === 'local' ? url.replace(/\/v1$/, '') + '/v1' : url;
}

function bearer(cfg) {
  return cfg.key ? { Authorization: 'Bearer ' + cfg.key } : {};
}

// Ollama turns away (403) every request that says it comes from an extension
// (the Origin header) unless OLLAMA_ORIGINS allows it. Our own requests to the
// local server go out without that header; requests from websites keep it.
async function allowLocal(base) {
  let origin;
  try { origin = new URL(base).origin; } catch (e) { return; }
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1,
      condition: { urlFilter: '|' + origin + '/', tabIds: [-1], resourceTypes: ['xmlhttprequest', 'other'] }, // -1: not from a tab, so from this worker
      action: { type: 'modifyHeaders', requestHeaders: [{ header: 'origin', operation: 'remove' }] },
    }],
  }).catch(() => { /* then OLLAMA_ORIGINS is the way, as the error says */ });
}

async function post(kind, url, headers, body) {
  return request(kind, url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}

async function request(kind, url, init) {
  let r;
  try {
    // A local model may first have to load into memory.
    r = await fetch(url, { ...init, signal: AbortSignal.timeout(kind === 'local' ? 240000 : 90000) });
  } catch (e) {
    if (e.name === 'TimeoutError') throw new Error(t('The model took too long to answer. Try again or pick a faster model.'));
    if (kind === 'local') throw new Error(t('Can’t reach the local model at {url}. Is Ollama or LM Studio running?', { url: new URL(url).origin }));
    throw new Error(t('Can’t reach {host}. Check your connection, or allow access in the settings.', { host: new URL(url).host }));
  }
  if (r.ok) return r.json();
  const said = serverSays(await r.text().catch(() => ''));
  let msg;
  if (r.status === 403 && kind === 'local') msg = t('The local model refused the extension. Allow it in Ollama (OLLAMA_ORIGINS).');
  else if (r.status === 401 || r.status === 403 || /api.?key/i.test(said)) msg = t('The API key was not accepted.');
  else if (r.status === 429) msg = kind === 'gemini' ? t('The free Gemini limit is used up for now. Try again in a minute.') : t('Too many requests for now. Try again in a minute.');
  else msg = t('The model server answered HTTP {status}.', { status: r.status });
  const e = new Error(msg + (said && !msg.includes(said) ? ' ' + said : ''));
  e.status = r.status;
  throw e;
}

// What the server said went wrong: { error: { message } }, [{ error }] or { error: "..." }.
function serverSays(detail) {
  try {
    const j = JSON.parse(detail);
    const e = (Array.isArray(j) ? j[0] : j).error;
    return String((e && e.message) || e || '').slice(0, 200);
  } catch (err) { return ''; }
}

// Models answer with JSON, sometimes wrapped in ```json fences or a sentence.
function parse(text) {
  const t = String(text);
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  let j;
  try { j = JSON.parse(t.slice(a, b + 1)); } catch (e) { j = null; }
  if (!j || a < 0) throw new Error(t('The model did not send back a translation. Try again, or pick another model.'));
  const blocks = (Array.isArray(j.blocks) ? j.blocks : []).map((x) => ({
    text: String(x.text || ''),
    translation: String(x.translation || ''),
    box: Array.isArray(x.box) && x.box.length === 4 && x.box.every((n) => Number.isFinite(n)) ? x.box.map((n) => Math.min(1000, Math.max(0, n))) : null,
  })).filter((x) => x.text || x.translation);
  return { code: String(j.code || ''), blocks };
}

// ---------- the popup's model list ----------

async function models(provider, cfg) {
  let ids;
  if (provider === 'gemini') {
    const data = await request('gemini', GEMINI + '/models?pageSize=1000', { headers: { 'x-goog-api-key': cfg.key } });
    ids = (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      // Gemini also lists image, speech and embedding models; they can't read pictures into text.
      .filter((id) => /^gemini/.test(id) && !/image|tts|audio|live|embed|robotics|computer/.test(id));
  } else if (provider === 'claude') {
    const data = await request('claude', CLAUDE + '/models?limit=100', { headers: claudeHeaders(cfg) });
    ids = (data.data || []).map((m) => m.id);
  } else {
    const base = openAIBase(provider, cfg);
    if (provider === 'local') await allowLocal(base);
    const data = await request(provider, base + '/models', { headers: bearer(cfg) });
    ids = (data.data || [])
      // OpenRouter says which models take pictures; others don't say, so all stay.
      .filter((m) => !(m.architecture && m.architecture.input_modalities) || m.architecture.input_modalities.includes('image'))
      .map((m) => String(m.id));
  }
  ids.sort((a, b) => b.localeCompare(a, undefined, { numeric: true })); // newest first
  return { models: ids, suggested: suggest(provider, ids) };
}

// A fast, cheap model that reads pictures well is the right default.
function suggest(provider, ids) {
  const stable = ids.filter((id) => !/preview|exp|latest/.test(id));
  const find = (re) => stable.find((id) => re.test(id)) || ids.find((id) => re.test(id));
  if (provider === 'gemini') return find(/flash(?!-lite)/) || ids[0] || '';
  if (provider === 'claude') return find(/haiku/) || ids[0] || '';
  if (provider === 'other') return find(/:free$/) || ids[0] || '';
  return ids[0] || '';
}
