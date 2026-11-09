// SPDX-License-Identifier: GPL-3.0-only
// SPDX-FileCopyrightText: 2026 Cleedek

// "Language & appearance": a row in the footer list that opens its own screen, like
// "Support the creator". Same file in Subtitle Overlay, Edge Trim and Snap Translate.
// The row shows what is chosen ("Čeština · Dark"), leaving out "Same as browser".
function setupPrefsView(selectIds) {
  const $ = (id) => document.getElementById(id);
  const selects = selectIds.map($).filter(Boolean);
  const summary = () => {
    $('prefsNow').textContent = selects
      .filter((s) => s.selectedIndex > 0 && !/^(auto|light dark)$/.test(s.value))
      .map((s) => s.selectedOptions[0].text)
      .join(' · ');
  };
  // The options are added by the popup after it loads; a change is caught here too.
  for (const s of selects) {
    s.addEventListener('change', summary);
    new MutationObserver(summary).observe(s, { childList: true });
  }
  summary();

  const show = (on) => {
    document.body.classList.toggle('prefs', on);
    window.scrollTo(0, 0);
    (on ? $('prefsBack') : $('prefsOpen')).focus();
  };
  $('prefsOpen').addEventListener('click', () => show(true));
  $('prefsBack').addEventListener('click', () => show(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('prefs')) { e.preventDefault(); show(false); }
  });
}
