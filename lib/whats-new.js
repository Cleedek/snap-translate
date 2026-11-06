// "What's new": a card shown after an update has really been installed.
//
// When releasing a version with news: raise "version" in manifest.json (1.0 -> 1.1, a change in the
// first or second number) and add an entry at the top of the list, with 2 to 4 short highlights in
// English, plus their translations. A version without an entry, or a bug-fix release like 1.1.0 -> 1.1.1,
// shows nothing. New installs never see the card. Example:
//   { version: '1.1', items: ['Add a shadow after trimming.', 'Trim pictures as they download.'] },
const WHATS_NEW = [
];

const versionParts = (v) => String(v).split('.').map(Number);
function versionIsNewer(a, b) {
  const [x, y] = [versionParts(a), versionParts(b)];
  for (let i = 0; i < 2; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}

// Background worker: note which version the person came from. If they skip the card and another
// update arrives, the first version is kept, so they see everything they missed.
function rememberUpdate({ reason, previousVersion }) {
  if (reason !== 'update' || !previousVersion) return;
  if (!versionIsNewer(chrome.runtime.getManifest().version, previousVersion)) return;
  chrome.storage.local.get('whatsNewFrom').then(({ whatsNewFrom }) => {
    if (!whatsNewFrom) chrome.storage.local.set({ whatsNewFrom: previousVersion });
  });
}

// Popup: the card while it's unread, then a quiet link in the footer. Returns whether the card shows.
async function setupWhatsNew({ slug, i18n }) {
  const $ = (id) => document.getElementById(id);
  const t = i18n.t;
  const current = chrome.runtime.getManifest().version;
  const url = `https://cleedek.com/${i18n.lang === 'cs' ? 'cs/' : ''}work/${slug}#changelog`;
  $('newsMore').href = url;
  $('newsLink').href = url;

  const showLink = () => {
    const entry = WHATS_NEW.find((n) => !versionIsNewer(n.version, current) && !versionIsNewer(current, n.version));
    if (!entry) return;
    $('newsLinkText').textContent = t("What's new in version {version}", { version: entry.version });
    $('newsLink').hidden = false;
  };

  const { whatsNewFrom: from } = await chrome.storage.local.get('whatsNewFrom').catch(() => ({}));
  const unread = from ? WHATS_NEW.filter((n) => versionIsNewer(n.version, from) && !versionIsNewer(n.version, current)) : [];
  if (!unread.length) {
    if (from) chrome.storage.local.remove('whatsNewFrom').catch(() => {});
    showLink();
    return false;
  }

  $('newsVersion').textContent = t('in version {version}', { version: unread[0].version });
  $('newsList').replaceChildren(...unread.flatMap((n) => n.items).slice(0, 4).map((text) => {
    const li = document.createElement('li');
    li.textContent = t(text);
    return li;
  }));
  $('whatsNew').hidden = false;
  document.body.classList.add('has-news');
  $('newsClose').addEventListener('click', () => {
    $('whatsNew').hidden = true;
    document.body.classList.remove('has-news');
    chrome.storage.local.remove('whatsNewFrom').catch(() => {});
    showLink();
  });
  return true;
}
