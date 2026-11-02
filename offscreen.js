// Snap Translate: reads the text in a picture on this computer (Tesseract.js),
// for the free Quick translator. Nothing here goes to the network.

let readers = null; // started once, then reused: loading the language data takes a moment

// Two readers, so the picture can be read at two sizes at once (see read).
function startReaders() {
  const url = (p) => chrome.runtime.getURL('vendor/tesseract/' + p);
  const start = () => Tesseract.createWorker(['vie', 'eng'], 1, {
    // Tesseract's own worker, wrapped so its setup notes don't show up as errors.
    workerPath: chrome.runtime.getURL('lib/ocr-worker.js'),
    // One build only (SIMD, which every current Chrome has) keeps the extension small.
    corePath: url('tesseract-core-simd-lstm.wasm.js'),
    langPath: url('lang'),
    workerBlobURL: false,
    cacheMethod: 'none',
  }).then(async (worker) => {
    // Left to itself the reader takes the whole picture as one block of text, like a scanned
    // page. Web pages and photos have text in many separate places (titles, buttons, labels on
    // a pack): the automatic layout finds each of them, and reads more of it right.
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.AUTO });
    return worker;
  });
  readers = Promise.all([start(), start()]).catch((e) => { readers = null; throw e; });
  return readers;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.target !== 'offscreen' || msg.type !== 'ocr') return false;
  read(msg.img).then((blocks) => reply({ ok: true, blocks }), (e) => reply({ ok: false, error: String(e && e.message || e) }));
  return true;
});

// One block per paragraph, each line with its own place in the picture (0 to 1000,
// like the AI translators), so a translation can be painted line by line.
async function read(img) {
  const [one, two] = await (readers || startReaders());
  const src = `data:${img.mime};base64,${img.data}`;
  const bmp = await createImageBitmap(await (await fetch(src)).blob());
  const at = (k) => ({ w: Math.round(bmp.width * k), h: Math.round(bmp.height * k) });
  const pass = async (worker, pic, size) => paragraphs(await worker.recognize(pic, {}, { blocks: true }), size);
  // Light text on a dark background (signs, banners) often goes unread: when the picture
  // has dark areas, it's read again with them flipped to dark-on-light (and the rest in grey).
  // Small lettering loses its accents: a title on a shop's product picture, at its size on
  // screen, came out as "THUNG NUGC EP TRAI CAY", and at twice that size as "THÙNG NƯỚC ÉP
  // TRÁI CÂY". Big lettering does better at its own size, so the grey copy is also read at
  // twice the size, by the second reader at the same time.
  const grey = await greyCopy(bmp, at(1)), big = await greyCopy(bmp, at(2));
  const [found, small] = await Promise.all([
    pass(one, src, at(1)).then(async (first) => (grey.flipped ? merge(first, await pass(one, grey.pic, at(1))) : first)),
    pass(two, big.pic, at(2)),
  ]);
  return merge(found, small)
    .map((p) => blockOf(p.lines.map(({ text, box }) => ({ text, box }))))
    .sort((a, b) => a.box[0] - b.box[0] || a.box[1] - b.box[1]);
}

// Two readings of one picture, compared line by line: one paragraph's box can span lines that
// were missed in between. A line both read keeps the surer reading. The grey copy often reads
// coloured lettering better, accents and all ("THÙNG NƯỚC" where the first pass had "THUNG NUGC",
// which Google Translate can't make sense of). When both read the same letters, each word
// keeps the reading with more accents: the reader drops accents far more often than it
// makes them up, and its confidence doesn't tell ("SAN" scored higher than "SẢN").
function merge(found, again) {
  const plain = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const marks = (s) => s.normalize('NFD').length - plain(s).length;
  const seen = found.flatMap((f) => f.lines), worse = new Set();
  const better = again.map((p) => ({ lines: p.lines.filter((l) => {
    const same = seen.filter((f) => overlap(f.box, l.box) > 0.3);
    if (same.length === 1 && plain(same[0].text) === plain(l.text) && same[0].words.length === l.words.length) {
      same[0].words = same[0].words.map((w, i) => (marks(l.words[i].text) > marks(w.text) ? l.words[i] : w));
      same[0].text = say(same[0].words);
      return false;
    }
    if (same.some((f) => f.confidence >= l.confidence)) return false;
    same.forEach((f) => worse.add(f));
    return true;
  }) }));
  return [...found.map((p) => ({ lines: p.lines.filter((l) => !worse.has(l)) })), ...better].filter((p) => p.lines.length);
}

// The words of a line as one text, without the stray marks frames leave at its ends.
const say = (words) => words.map((w) => w.text).join(' ').replace(/^[|`~_¬«»\s]+|[|`~_¬«»\s]+$/g, '');

// A block of lines, with the box around them all.
function blockOf(lines) {
  const box = [0, 1, 2, 3].map((k) => (k < 2 ? Math.min : Math.max)(...lines.map((l) => l.box[k])));
  return { text: lines.map((l) => l.text).join('\n'), box, lines };
}

function paragraphs({ data }, img) {
  const box = (b) => [b.y0 / img.h, b.x0 / img.w, b.y1 / img.h, b.x1 / img.w].map((n) => Math.round(n * 1000));
  const out = [];
  for (const block of data.blocks || []) {
    for (const p of block.paragraphs || []) {
      // Shadows and patterns come out as low-confidence specks with no letters in them.
      // Edges of banners and frames come out as stray marks (| ¬ ~ « or a lone digit) at
      // the ends of a line: dropped word by word, so they don't stretch the line's box
      // over its neighbours. Words in the middle stay, so "6h - 22h" keeps its dash.
      const junk = (w) => !/[\p{L}\d]/u.test(w.text) || w.confidence < 60;
      const lines = (p.lines || [])
        .flatMap((l) => {
          // Words far apart (a gap over 1.5 times their usual height) are separate pieces of
          // text, like two columns of a menu, each with its own box. The usual height, not the
          // line's: one tall speck at the end makes the line twice as tall, and captions under
          // cards side by side then came out as one line across all of them.
          const heights = (l.words || []).map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b);
          const apart = 1.5 * heights[heights.length >> 1];
          const pieces = [];
          for (const w of l.words || []) {
            const last = pieces.at(-1)?.at(-1);
            if (last && w.bbox.x0 - last.bbox.x1 <= apart) pieces.at(-1).push(w);
            else pieces.push([w]);
          }
          return pieces.map((words) => {
            while (words.length && junk(words[0])) words.shift();
            while (words.length && junk(words.at(-1))) words.pop();
            if (!words.length) return null;
            // Up and down, the line's height, but no further than its own words reach (and a
            // quarter more): one line of the reader can join pieces at different heights, like
            // titles on cards side by side, and would then cover the text under some of them.
            const top = Math.min(...words.map((w) => w.bbox.y0)), bottom = Math.max(...words.map((w) => w.bbox.y1)), pad = (bottom - top) / 4;
            const b = { x0: Math.min(...words.map((w) => w.bbox.x0)), y0: Math.max(l.bbox.y0, top - pad), x1: Math.max(...words.map((w) => w.bbox.x1)), y1: Math.min(l.bbox.y1, bottom + pad) };
            const confidence = words.reduce((sum, w) => sum + w.confidence, 0) / words.length;
            return { text: say(words), box: box(b), confidence, words: words.map(({ text, confidence }) => ({ text, confidence })) };
          });
        })
        // Photos and patterns read as letters ("TU", "wl", "PS?" on product packs) score well
        // under 75; real text scores around 90. A very short line has to be surer still.
        .filter((l) => {
          const signs = l ? (l.text.match(/[\p{L}\d]/gu) || []).length : 0; // letters and digits, so "90.000 đ" counts
          return signs >= 2 && /\p{L}/u.test(l.text) && l.confidence >= (signs <= 3 ? 88 : 75);
        });
      // Texts side by side, like product cards in a row, come out as one paragraph with a
      // piece of each on every line. Pieces under one another stay together, each column
      // its own block, so each is translated, painted and listed on its own.
      const columns = [];
      for (const l of lines) {
        const col = columns.find((c) => l.box[1] < c.at(-1).box[3] && c.at(-1).box[1] < l.box[3]);
        if (col) col.push(l);
        else columns.push([l]);
      }
      // The block's box from its kept lines only, for the same reason.
      out.push(...columns.map(blockOf));
    }
  }
  return out;
}

// Greyscale copy, at the given size, where every area with a dark background is
// inverted, so all text ends up dark on light. The background of each tile is its
// median brightness (letters are the minority, so they don't skew it), blended between
// tiles so the flip has no hard steps. "flipped" says whether anything was dark.
async function greyCopy(bmp, { w: W, h: H }) {
  const g = new OffscreenCanvas(W, H).getContext('2d', { willReadFrequently: true });
  g.filter = 'grayscale(1)';
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, W, H);
  const pic = g.getImageData(0, 0, W, H), d = pic.data;
  const T = Math.max(24, Math.round(Math.max(W, H) / 24)), cols = Math.ceil(W / T), rows = Math.ceil(H / T);
  const bg = new Float32Array(cols * rows);
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    const v = [];
    for (let y = ty * T; y < Math.min(H, (ty + 1) * T); y += 2) for (let x = tx * T; x < Math.min(W, (tx + 1) * T); x += 2) v.push(d[(y * W + x) * 4]);
    v.sort((a, b) => a - b);
    bg[ty * cols + tx] = v[v.length >> 1];
  }
  const flipped = bg.some((v) => v < DARK);
  if (flipped) for (let y = 0; y < H; y++) {
    const fy = Math.min(rows - 1, Math.max(0, y / T - 0.5)), y0 = Math.floor(fy), y1 = Math.min(rows - 1, y0 + 1), wy = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(cols - 1, Math.max(0, x / T - 0.5)), x0 = Math.floor(fx), x1 = Math.min(cols - 1, x0 + 1), wx = fx - x0;
      const here = (bg[y0 * cols + x0] * (1 - wx) + bg[y0 * cols + x1] * wx) * (1 - wy) + (bg[y1 * cols + x0] * (1 - wx) + bg[y1 * cols + x1] * wx) * wy;
      const i = (y * W + x) * 4;
      if (here < DARK) d[i] = d[i + 1] = d[i + 2] = 255 - d[i];
    }
  }
  g.putImageData(pic, 0, 0);
  return { pic: await g.canvas.convertToBlob({ type: 'image/png' }), flipped };
}
const DARK = 120; // background brightness (0 to 255) below which an area counts as dark

// How much of the smaller box the two boxes share (0 to 1).
function overlap(a, b) {
  const h = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const w = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (h <= 0 || w <= 0) return 0;
  const area = (x) => (x[2] - x[0]) * (x[3] - x[1]);
  return (h * w) / Math.min(area(a), area(b));
}
