// The translations the store images show: real answers from Google Translate, asked exactly the way
// Quick asks (background.js askQuick: sl=auto, format=html, each block's lines joined with a space).
// Saved to store/src/copy/gt/<store language>.json, so the images don't depend on the network.
//   node store/gtrans.mjs            every store language
//   node store/gtrans.mjs de ja      just these
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'src/pictures.js'), 'utf8');
const literal = src.slice(src.indexOf('const TEXT = ') + 13, src.indexOf('\n  };\n') + 4);
const TEXT = Function(`return (${literal});`)();

// Store language (as in _locales) -> Google's code, as the extension uses them.
const google = (store) => ({ pt_BR: 'pt', pt_PT: 'pt', fil: 'tl', zh_CN: 'zh-CN', zh_TW: 'zh-TW' }[store] || store);
// The blocks in the order pictures.js hands them over.
const blocks = {
  poster: (t) => [t.brand, t.head.join(' '), t.offer.join(' '), t.cta, t.hours],
  menu: (t) => [t.title, ...t.items.flat(), t.foot],
};

const escapeHtml = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unescapeHtml = (t) => String(t).replace(/\s*<br\s*\/?>\s*/gi, '\n').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

async function translate(texts, tl) {
  const body = new URLSearchParams();
  for (const t of texts) body.append('q', escapeHtml(t));
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`https://translate.googleapis.com/translate_a/t?client=gtx&sl=auto&format=html&tl=${encodeURIComponent(tl)}`, { method: 'POST', body });
    if (r.ok) {
      const data = await r.json();
      const pairs = data.map((d) => (Array.isArray(d) ? d : [d, '']));
      return { code: pairs.map((p) => p[1]).find(Boolean) || '', out: pairs.map((p) => unescapeHtml(p[0])) };
    }
    await new Promise((res) => setTimeout(res, 3000 * (attempt + 1)));
  }
  throw new Error(`Google Translate failed for ${tl}`);
}

const all = readdirSync(join(here, '..', '_locales')).filter((d) => !d.startsWith('.'));
const langs = process.argv.slice(2).length ? process.argv.slice(2) : all;
mkdirSync(join(here, 'src/copy/gt'), { recursive: true });
for (const store of langs) {
  // The Vietnamese page shows the English pictures; every other one the Vietnamese pictures.
  const from = store === 'vi' ? 'en' : 'vi';
  const result = { from };
  for (const name of ['poster', 'menu']) {
    const texts = blocks[name](TEXT[name][from]);
    const { code, out } = await translate(texts, google(store));
    result[name] = out;
    result.code = code;
  }
  writeFileSync(join(here, `src/copy/gt/${store}.json`), JSON.stringify(result, null, 1) + '\n');
  console.log(store, result.poster.slice(1, 3).join(' | '));
  await new Promise((res) => setTimeout(res, 800));
}
