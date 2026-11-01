// Shared by the popup and the background worker: the languages on offer and
// the saved settings (chrome.storage.local, so API keys never leave this device).

// What Quick can read: the language data bundled in vendor/tesseract/lang.
const SNAP_QUICK_READS = ['vi', 'en'];

// Taken from Subtitle Overlay: the same 31 languages (Google Translate's codes),
// in the same order, with the same flags. [code, English name, font subset, sample]
const SNAP_LANGUAGES = [
  ['vi', 'Vietnamese', 'v', 'ư ế ộ'], ['cs', 'Czech', 'e', 'č ř ž'], ['en', 'English', '', 'Aa'],
  ['sk', 'Slovak', 'e', 'ľ ť ô'], ['de', 'German', '', 'ä ö ß'], ['fr', 'French', '', 'é ç œ'],
  ['es', 'Spanish', '', 'ñ á ¿'], ['it', 'Italian', '', 'à è ò'], ['pt', 'Portuguese', '', 'ã ç õ'],
  ['pl', 'Polish', 'e', 'ą ł ż'], ['hu', 'Hungarian', 'e', 'ő ű á'], ['uk', 'Ukrainian', 'c', 'ї є ґ'],
  ['nl', 'Dutch', '', 'é ë ü'], ['sv', 'Swedish', '', 'å ä ö'],
  ['da', 'Danish', '', 'æ ø å'], ['no', 'Norwegian', '', 'æ ø å'], ['fi', 'Finnish', '', 'ä ö å'],
  ['el', 'Greek', 'g', 'α β γ'], ['tr', 'Turkish', 'e', 'ğ ş ı'], ['ro', 'Romanian', 'e', 'ș ț ă'],
  ['hr', 'Croatian', 'e', 'č ć đ'], ['zh-CN', 'Chinese (Simplified)', 'S', '中文'], ['zh-TW', 'Chinese (Traditional)', 'T', '中文'],
  ['ja', 'Japanese', 'j', 'あ ア 字'], ['ko', 'Korean', 'k', '한 국'], ['th', 'Thai', 't', 'ภ า ษ'],
  ['id', 'Indonesian', '', 'Aa'], ['ms', 'Malay', '', 'Aa'], ['tl', 'Filipino', '', 'Ñ ñ'],
  ['hi', 'Hindi', 'd', 'हि दी'], ['ar', 'Arabic', 'a', 'ع ر ب'],
];

const SNAP_DEFAULTS = {
  target: '',
  provider: 'quick', // quick | gemini | claude | local | other
  gemini: { key: '', model: '' },
  claude: { key: '', model: '' },
  local: { url: 'http://localhost:11434', model: '' },
  other: { url: 'https://openrouter.ai/api/v1', key: '', model: '' },
};

// In the browser's language when it knows it ("vietnamština" in Czech), else English.
function snapLangName(code, inLang = 'en') {
  try {
    // Chinese by script (simplified/traditional), not by country. Google's "tl" is Filipino.
    const name = new Intl.DisplayNames([inLang], { type: 'language' }).of({ 'zh-CN': 'zh-Hans', 'zh-TW': 'zh-Hant', tl: 'fil' }[code] || code);
    if (name && name !== code) return name;
  } catch (e) { /* unknown code */ }
  return (SNAP_LANGUAGES.find((l) => l[0] === code) || [code, code])[1];
}

// A flag for a language code, to tell languages apart at a glance. A flag is a
// country, not a language, so this picks the country most people link with it
// (English = UK, Portuguese = Portugal). A region in the code wins: pt-BR = Brazil.
const SNAP_FLAG_COUNTRY = {
  vi: 'VN', cs: 'CZ', en: 'GB', sk: 'SK', de: 'DE', fr: 'FR', es: 'ES', it: 'IT', pt: 'PT', pl: 'PL',
  hu: 'HU', uk: 'UA', ru: 'RU', nl: 'NL', sv: 'SE', da: 'DK', no: 'NO', nb: 'NO', fi: 'FI', el: 'GR',
  tr: 'TR', ro: 'RO', hr: 'HR', zh: 'CN', 'zh-tw': 'TW', 'zh-hant': 'TW', ja: 'JP', ko: 'KR', th: 'TH',
  id: 'ID', ms: 'MY', tl: 'PH', fil: 'PH', hi: 'IN', ar: 'SA', he: 'IL', iw: 'IL',
  cz: 'CZ', cze: 'CZ', ces: 'CZ', slk: 'SK', slo: 'SK', eng: 'GB', vie: 'VN', deu: 'DE', ger: 'DE',
  fra: 'FR', fre: 'FR', spa: 'ES', pol: 'PL', hun: 'HU', ita: 'IT', rus: 'RU', ukr: 'UA',
};
function snapFlag(code) {
  const c = String(code || '').toLowerCase();
  const region = /^[a-z]{2,3}[-_]([a-z]{2})$/.exec(c);
  const cc = SNAP_FLAG_COUNTRY[c] || (region && region[1] !== 'cn' ? region[1].toUpperCase() : SNAP_FLAG_COUNTRY[c.split(/[-_]/)[0]]);
  return cc ? String.fromCodePoint(...[...cc].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)) : '';
}

// The browser's own language, if we offer it; English otherwise.
function snapDefaultTarget() {
  const ui = (chrome.i18n.getUILanguage() || 'en').toLowerCase();
  if (ui.startsWith('zh')) return /tw|hk|hant/.test(ui) ? 'zh-TW' : 'zh-CN';
  const base = ui.split('-')[0];
  return SNAP_LANGUAGES.some((l) => l[0] === base) ? base : 'en';
}

async function snapLoadSettings() {
  const { settings = {} } = await chrome.storage.local.get('settings');
  const s = { ...SNAP_DEFAULTS, ...settings };
  for (const p of ['gemini', 'claude', 'local', 'other']) s[p] = { ...SNAP_DEFAULTS[p], ...settings[p] };
  if (!SNAP_LANGUAGES.some((l) => l[0] === s.target)) s.target = snapDefaultTarget();
  return s;
}

function snapSaveSettings(s) {
  return chrome.storage.local.set({ settings: s });
}
