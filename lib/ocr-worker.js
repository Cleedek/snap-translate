// Snap Translate: starts Tesseract's worker with its harmless chatter muted.
// The engine prints setup notes ("Warning: Parameter not found: …", "Estimating
// resolution as …") as console errors, and Chrome then flags the extension with
// an Errors button. Only those exact notes are muted; real errors still show.
const NOISE = /^(Warning: Parameter not found|Estimating resolution as|Detected \d+ diacritics)/;
for (const level of ['error', 'warn', 'log']) {
  const original = console[level].bind(console);
  console[level] = (...args) => { if (!(typeof args[0] === 'string' && NOISE.test(args[0]))) original(...args); };
}
importScripts('../vendor/tesseract/worker.min.js');
