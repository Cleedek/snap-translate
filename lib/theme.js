// Light or dark look, chosen in the popup. Shared by the popup and the content
// script; "auto" follows the browser (Chrome's own light or dark mode).
(function (root) {
  'use strict';
  if (root.SnapTheme) return; // the page script can be added to a tab more than once

  // [choice, English label for SnapI18n.t]. Following the browser is the default: Snap Translate
  // gets used during the day as much as at night, so it matches whatever the rest of the screen looks like.
  const CHOICES = [['auto', 'Same as browser'], ['dark', 'Dark'], ['light', 'Light']];
  const prefersLight = root.matchMedia('(prefers-color-scheme: light)');
  // The popup keeps a copy in localStorage, so its very first frame already has the
  // right colours. Not on web pages: there localStorage belongs to the site.
  const ownPage = root.location.protocol === 'chrome-extension:';
  let choice = 'auto';
  let target = null; // the element that carries data-theme

  const look = () => (choice === 'auto' ? (prefersLight.matches ? 'light' : 'dark') : choice);

  // Every colour switches at once. Otherwise buttons and fields fade (their hover
  // transitions) while the page around them has already changed.
  function paint() {
    if (!target || target.dataset.theme === look()) return;
    const scope = target.getRootNode(); // the document, or the overlay's shadow root
    const still = Object.assign(document.createElement('style'), { textContent: '* { transition: none !important; }' });
    (scope.head || scope).append(still);
    target.dataset.theme = look();
    getComputedStyle(target).color; // the new colours are in place before transitions come back
    setTimeout(() => still.remove(), 1);
  }

  function set(c) {
    choice = CHOICES.some((x) => x[0] === c) ? c : 'auto';
    if (ownPage) {
      try { localStorage.setItem('theme', choice); } catch (e) { /* only the first frame needs it */ }
    }
    paint();
    return choice;
  }

  async function load() {
    try {
      const { theme } = await chrome.storage.local.get('theme');
      return set(theme);
    } catch (e) { return choice; }
  }

  // Draws el, and everything in it, in the chosen look from now on.
  function apply(el) {
    target = el;
    paint();
  }

  prefersLight.addEventListener('change', paint);
  // Other parts of the extension follow a change made in the popup.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.theme) set(changes.theme.newValue);
    });
  } catch (e) { /* no storage here */ }

  if (ownPage) {
    try { set(localStorage.getItem('theme')); } catch (e) { /* storage answers in a moment */ }
    apply(root.document.documentElement);
    load();
  }

  root.SnapTheme = { CHOICES, load, apply, get choice() { return choice; } };
})(globalThis);
