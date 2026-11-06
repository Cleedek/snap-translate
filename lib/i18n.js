// Interface language. The English text is the key: lib/ui/<code>.json maps it to a translation,
// and anything without one stays in English. Only the language in use is loaded.
// Shared by the popup, the content script and the background worker.
(function (root) {
  'use strict';
  if (root.SnapI18n) return; // the page script can be added to a tab more than once

  // [code, name in its own language]; "auto" follows the browser. The same 31 languages that can be translated into.
  const LOCALES = [
    ['auto', ''], ['en', 'English'], ['ar', 'العربية'], ['cs', 'Čeština'], ['da', 'Dansk'], ['de', 'Deutsch'], ['el', 'Ελληνικά'],
    ['es', 'Español'], ['fi', 'Suomi'], ['fr', 'Français'], ['hi', 'हिन्दी'], ['hr', 'Hrvatski'], ['hu', 'Magyar'], ['id', 'Bahasa Indonesia'],
    ['it', 'Italiano'], ['ja', '日本語'], ['ko', '한국어'], ['ms', 'Bahasa Melayu'], ['nl', 'Nederlands'], ['no', 'Norsk'], ['pl', 'Polski'],
    ['pt', 'Português'], ['ro', 'Română'], ['sk', 'Slovenčina'], ['sv', 'Svenska'], ['th', 'ไทย'], ['tl', 'Filipino'], ['tr', 'Türkçe'],
    ['uk', 'Українська'], ['vi', 'Tiếng Việt'], ['zh-CN', '简体中文'], ['zh-TW', '繁體中文'],
  ];
  const ALSO = { nb: 'no', nn: 'no', fil: 'tl' }; // what browsers call some of them
  const dicts = {};
  let lang = 'en';

  // A browser language like "de-AT" or "zh-HK" -> one we have.
  function match(code) {
    const c = String(code || '').toLowerCase();
    if (c.startsWith('zh')) return /tw|hk|mo|hant/.test(c) ? 'zh-TW' : 'zh-CN';
    const base = c.split('-')[0];
    const known = ALSO[base] || base;
    return LOCALES.some((l) => l[0] === known && known !== 'auto') ? known : 'en';
  }

  function setLang(choice) {
    lang = choice && choice !== 'auto' && LOCALES.some((l) => l[0] === choice)
      ? choice
      : match(root.chrome && chrome.i18n ? chrome.i18n.getUILanguage() : root.navigator && navigator.language);
    return lang;
  }
  setLang('auto');

  // Extension pages read the file; a web page can't, so the content script asks the background worker.
  async function fetchDict(code) {
    if (root.location && root.location.protocol === 'chrome-extension:') {
      return (await fetch(chrome.runtime.getURL(`lib/ui/${code}.json`))).json();
    }
    const res = await chrome.runtime.sendMessage({ type: 'dict', lang: code });
    return res && res.ok ? res.dict : {};
  }

  async function load() {
    try {
      const { uiLang } = await chrome.storage.local.get('uiLang');
      setLang(uiLang);
      if (lang !== 'en' && !dicts[lang]) dicts[lang] = await fetchDict(lang);
    } catch (e) { /* English then */ }
    return lang;
  }

  // vars fill {name} placeholders. A translation can be an object of plural
  // forms ({ one, few, many, other }), picked by vars.n.
  function t(en, vars) {
    let s = (dicts[lang] && dicts[lang][en]) || en;
    if (typeof s === 'object') {
      const n = vars ? Number(vars.n) : 0;
      let form = 'other';
      try { form = new Intl.PluralRules(lang).select(n); } catch (e) { /* keep "other" */ }
      s = s[form] || s.other;
    }
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s;
  }

  // Translates a static page in place: every text node, plus the title,
  // placeholder and aria-label attributes.
  function translatePage(rootEl) {
    const html = rootEl.ownerDocument.documentElement;
    html.lang = lang;
    html.dir = dir();
    if (lang === 'en') return;
    const walker = rootEl.ownerDocument.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const key = n.nodeValue.trim().replace(/\s+/g, ' ');
      if (!key) continue;
      const tr = t(key);
      if (tr !== key) n.nodeValue = n.nodeValue.match(/^\s*/)[0] + tr + n.nodeValue.match(/\s*$/)[0];
    }
    for (const el of rootEl.querySelectorAll('[title], [placeholder], [aria-label]')) {
      for (const a of ['title', 'placeholder', 'aria-label']) {
        const v = el.getAttribute(a);
        if (v) el.setAttribute(a, t(v));
      }
    }
  }

  const dir = () => (lang === 'ar' ? 'rtl' : 'ltr');

  root.SnapI18n = { LOCALES, load, t, translatePage, get lang() { return lang; }, get dir() { return dir(); } };
})(globalThis);
