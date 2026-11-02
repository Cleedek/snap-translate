// Snap Translate: the popup. Starts a translation and holds the settings.

const $ = (id) => document.getElementById(id);
const t = SnapI18n.t;
let s;

init();

async function init() {
  // The same page doubles as the settings page (opened in a tab from an error).
  if (await chrome.tabs.getCurrent()) document.documentElement.classList.add('page');
  await SnapI18n.load();
  SnapI18n.translatePage(document.body);
  s = await snapLoadSettings();

  // Same list as Subtitle Overlay: flag and name in the interface language.
  const target = $('target');
  for (const [code] of SNAP_LANGUAGES) target.append(new Option(`${snapFlag(code)} ${cap(snapLangName(code, SnapI18n.lang))}`, code));
  target.value = s.target;
  target.addEventListener('change', () => { s.target = target.value; save(); });

  document.querySelectorAll('[data-provider][role=radio]').forEach((b) => b.addEventListener('click', () => {
    s.provider = b.dataset.provider;
    save();
    showProvider();
    loadModels();
  }));

  document.querySelectorAll('input[data-provider]').forEach((input) => {
    input.value = s[input.dataset.provider][input.dataset.field];
    input.addEventListener('change', () => {
      s[input.dataset.provider][input.dataset.field] = input.value.trim();
      save();
      loadModels();
    });
  });

  $('model').addEventListener('change', () => { s[s.provider].model = $('model').value; save(); });
  $('reload').addEventListener('click', () => loadModels(true));
  $('select').addEventListener('click', startSelection);
  $('shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));

  showShortcut();
  showProvider();
  loadModels();
  setupSupport();
  setupSister();
  setupUiLang();
  setupTheme();
}

// ---------- interface language (same as Subtitle Overlay) ----------

async function setupUiLang() {
  const { uiLang } = await chrome.storage.local.get('uiLang');
  $('uiLang').replaceChildren(...SnapI18n.LOCALES.map(([code, name]) => new Option(code === 'auto' ? t('Same as browser') : name, code)));
  $('uiLang').value = uiLang || 'auto';
  $('uiLang').addEventListener('change', async () => {
    await chrome.storage.local.set({ uiLang: $('uiLang').value });
    location.reload();
  });
}

// ---------- light or dark (lib/theme.js repaints everything when it changes) ----------

async function setupTheme() {
  await SnapTheme.load();
  $('theme').replaceChildren(...SnapTheme.CHOICES.map(([code, name]) => new Option(t(name), code)));
  $('theme').value = SnapTheme.choice;
  $('theme').addEventListener('change', () => chrome.storage.local.set({ theme: $('theme').value }));
}

// ---------- footer and the "support the creator" screen (same as Subtitle Overlay) ----------

function setupSupport() {
  const author = Object.assign(document.createElement('a'), { href: 'https://cleedek.com', target: '_blank', rel: 'noopener', textContent: 'Cleedek' });
  // The name is a link, so the sentence is split around {name} instead of translated as page text.
  const [before, after] = t('Created with 💜 by {name} in Vietnam').split('{name}');
  $('credit').append(before, author, after || '');

  const showSupport = (on) => {
    document.body.classList.toggle('support', on);
    window.scrollTo(0, 0);
    (on ? $('supportBack') : $('supportOpen')).focus();
  };
  $('supportOpen').addEventListener('click', () => showSupport(true));
  $('supportBack').addEventListener('click', () => showSupport(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('support')) { e.preventDefault(); showSupport(false); }
  });

  const payTabs = document.querySelectorAll('#supportView .segmented [role=tab]');
  const selectPayTab = (tabBtn) => {
    for (const b of payTabs) {
      b.setAttribute('aria-selected', String(b === tabBtn));
      $(b.getAttribute('aria-controls')).hidden = b !== tabBtn;
    }
  };
  for (const tabBtn of payTabs) tabBtn.addEventListener('click', () => selectPayTab(tabBtn));

  // Local bank QR as the default tab, only for Czech or Vietnamese speakers (browser language, not location).
  // The language picked in the extension decides first, then the browser's own language.
  const browserLang = chrome.i18n.getUILanguage().toLowerCase().split('-')[0];
  const bankLang = [SnapI18n.lang, browserLang].find((l) => l === 'cs' || l === 'vi');
  const localTab = { cs: $('tabBankCz'), vi: $('tabBankVn') }[bankLang];
  if (localTab) {
    localTab.hidden = false;
    selectPayTab(localTab);
  }

  for (const btn of document.querySelectorAll('.pay-card .copy')) {
    const label = btn.textContent;
    btn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(btn.dataset.copy); btn.textContent = t('Copied'); }
      catch (e) { btn.textContent = t('Copy failed'); }
      setTimeout(() => { btn.textContent = label; }, 1500);
    });
  }
}

// ---------- Subtitle Overlay, the creator's other extension ----------

const SUBTITLE_OVERLAY_ID = 'kfiihdconjdcclppmdhopeejkbmkkalo';

// A card in the footer, hidden for good once closed. Not shown when Subtitle Overlay is
// already installed: it answers a "hello" from another extension, and nothing else is asked.
async function setupSister() {
  const { sisterClosed } = await chrome.storage.local.get('sisterClosed');
  if (sisterClosed) return;
  const installed = await chrome.runtime.sendMessage(SUBTITLE_OVERLAY_ID, { type: 'hello' }).then(Boolean, () => false);
  if (installed) return;
  $('sister').hidden = false;
  $('sisterClose').addEventListener('click', () => {
    $('sister').hidden = true;
    chrome.storage.local.set({ sisterClosed: true });
    $('supportOpen').focus();
  });
}

function save() { snapSaveSettings(s); }

const cap = (text) => text.charAt(0).toLocaleUpperCase(SnapI18n.lang) + text.slice(1);

async function startSelection() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const res = await chrome.runtime.sendMessage({ type: 'start', tabId: tab.id });
  if (res && res.ok) return window.close();
  $('startMsg').textContent = (res && res.error) || t('Couldn’t start on this page.');
  $('startMsg').hidden = false;
}

async function showShortcut() {
  const cmd = (await chrome.commands.getAll()).find((c) => c.name === 'start-selection');
  const keys = cmd && cmd.shortcut;
  // Chrome gives "Alt+Shift+T" on Windows and "⌥⇧T" on a Mac.
  const parts = !keys ? [] : keys.includes('+') ? keys.split('+') : [...keys];
  $('combo').innerHTML = parts.length ? parts.map((k) => `<kbd>${k}</kbd>`).join('') : `<span>${t('not set')}</span>`;
}

function showProvider() {
  document.querySelectorAll('[data-provider][role=radio]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.provider === s.provider)));
  document.querySelectorAll('.ai-fields[data-for]').forEach((f) => { f.hidden = f.dataset.for !== s.provider; });
  // Quick reads only the languages whose data is bundled; the AI models read nearly anything.
  $('reads').textContent = s.provider === 'quick'
    ? SNAP_QUICK_READS.map((c) => `${snapFlag(c)} ${cap(snapLangName(c, SnapI18n.lang))}`).join('  ·  ')
    : t('Almost any language');
}

function modelMsg(text, isError) {
  $('modelMsg').textContent = text || '';
  $('modelMsg').hidden = !text;
  $('modelMsg').classList.toggle('error', !!isError);
}

// The model list comes from the provider itself, so new models show up without an update.
async function loadModels(fromClick) {
  const provider = s.provider;
  const cfg = s[provider];
  const select = $('model');
  if (provider === 'quick') {
    $('modelField').hidden = true;
    return modelMsg('');
  }
  if (provider !== 'local' && !cfg.key) {
    $('modelField').hidden = true;
    return modelMsg(t('Add the key, then choose a model.'));
  }
  // Another API's address is only reachable once you allow it (a click on ↻ asks).
  if (provider === 'other') {
    let origin;
    try { origin = new URL(cfg.url).origin; } catch (e) { $('modelField').hidden = true; return modelMsg(t('That API address doesn’t look right.'), true); }
    const perm = { origins: [origin + '/*'] };
    if (!(await chrome.permissions.contains(perm))) {
      const granted = fromClick && (await chrome.permissions.request(perm).catch(() => false));
      if (!granted) {
        $('modelField').hidden = false;
        select.replaceChildren();
        return modelMsg(t('Click ↻ to allow the extension to reach {host}.', { host: new URL(origin).host }));
      }
    }
  }
  $('modelField').hidden = false;
  $('reload').classList.add('spinning');
  modelMsg('');
  const res = await chrome.runtime.sendMessage({ type: 'models', provider, cfg });
  $('reload').classList.remove('spinning');
  if (provider !== s.provider) return; // switched while loading
  select.replaceChildren();
  if (!res.ok) {
    if (cfg.model) select.append(new Option(cfg.model, cfg.model));
    return modelMsg(res.error, true);
  }
  const list = res.models.slice();
  if (cfg.model && !list.includes(cfg.model)) list.unshift(cfg.model);
  for (const id of list) select.append(new Option(id, id));
  if (!list.length) return modelMsg(provider === 'local' ? t('No models found. Download a vision model first, for example in Ollama.') : t('No models found.'), true);
  if (!cfg.model) { cfg.model = res.suggested || list[0]; save(); }
  select.value = cfg.model;
}
