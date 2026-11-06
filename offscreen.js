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
  // Two readings at once. The picture as it is, at its own size, reads big lettering best. The
  // other is a copy at twice the size with the background taken out (see cleanCopy): it reads
  // small lettering with its accents ("THÙNG NƯỚC" where the first had "THUNG NUGC"), light text
  // on dark, and white text on a colour, which the first misses.
  const clean = await cleanCopy(bmp, at(2));
  const [found, small] = await Promise.all([pass(one, src, at(1)), pass(two, clean, at(2))]);
  const ratio = bmp.height / bmp.width;
  return regroup(merge(found, small), ratio)
    .flatMap((lines) => flows(lines.map(({ text, box }) => ({ text, box })), ratio).map(blockOf))
    .sort((a, b) => a.box[0] - b.box[0] || a.box[1] - b.box[1]);
}

// The two readings cut one text into paragraphs differently, so a headline's two lines can
// arrive apart. Paragraphs that follow closely, same size and one under the other, go together
// here; flows then decides what really belongs together.
function regroup(paragraphs, ratio) {
  const high = (l) => (l.box[2] - l.box[0]) * ratio;
  const groups = [];
  for (const p of [...paragraphs].sort((a, b) => a.lines[0].box[0] - b.lines[0].box[0])) {
    const follows = groups.find((g) => {
      const up = g.at(-1), l = p.lines[0], tall = Math.max(high(up), high(l));
      return Math.abs(high(up) - high(l)) < 0.35 * tall && l.box[0] >= up.box[2] - 0.2 * (up.box[2] - up.box[0])
        && (l.box[0] - up.box[2]) * ratio < 0.9 * tall && l.box[1] < up.box[3] && up.box[1] < l.box[3];
    });
    if (follows) follows.push(...p.lines);
    else groups.push([...p.lines]);
  }
  return groups;
}

// A paragraph as the reader sees it can be running text wrapped at the end of each line, or
// separate lines stacked up (a menu, a title with a subtitle). Running text is translated and
// set as one, so its meaning isn't cut at the old line ends and it can wrap anew in the other
// language. A line continues the one above when it is close and the same size, and its first
// word wouldn't have fitted on the line above, the way wrapping works. A short centred stack
// is a headline. "ratio" turns a height into the width units of the boxes.
function flows(lines, ratio) {
  const high = (l) => (l.box[2] - l.box[0]) * ratio, wide = (l) => l.box[3] - l.box[1];
  const column = Math.max(...lines.map(wide));
  const caps = (s) => s === s.toLocaleUpperCase();
  const out = [[lines[0]]];
  for (let i = 1; i < lines.length; i++) {
    const up = lines[i - 1], l = lines[i], tall = Math.max(high(up), high(l));
    const close = Math.abs(high(up) - high(l)) < 0.35 * tall && (l.box[0] - up.box[2]) * ratio < 0.9 * tall;
    const firstWord = (wide(l) * (l.text.split(' ')[0].length + 1)) / Math.max(1, l.text.length);
    const fellOff = wide(up) + firstWord > column * 0.97;
    const finished = /[.!?:;…]$/.test(up.text);
    const startsNew = /^\p{Lu}/u.test(l.text) && !caps(l.text);
    const centred = Math.abs(up.box[1] + up.box[3] - l.box[1] - l.box[3]) / 2 < 0.5 * tall && Math.abs(up.box[1] - l.box[1]) > 0.5 * tall;
    if (close && ((fellOff && !finished && !startsNew) || (centred && lines.length <= 3 && !finished))) out.at(-1).push(l);
    else out.push([l]);
  }
  return out;
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
    // The same letters with a space lost ("ISHERE" for "IS HERE"): the one with more words.
    const joined = (x) => plain(x).replace(/\s+/g, '');
    if (same.length === 1 && joined(same[0].text) === joined(l.text)) {
      if (l.words.length <= same[0].words.length) return false;
      worse.add(same[0]);
      return true;
    }
    // Otherwise the reading with more letters ("Fresh orange juice" over "orange juice"), or the surer one.
    const letters = (x) => (x.text.match(/\p{L}/gu) || []).length;
    if (same.some((f) => letters(f) > letters(l) * 1.1 || (letters(f) * 1.1 >= letters(l) && f.confidence >= l.confidence))) return false;
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

// A copy, at the given size, showing only thin strokes, as dark on white: lettering in any colour,
// light or dark, on any colour or gradient. What letters are made of is thinner than a set width,
// and backgrounds, buttons and cards are wider. So: spread the bright pixels by that width, then the
// dark ones back, and thin dark strokes are gone (the same the other way round for light ones),
// while flat areas keep their sharp edges. The difference from the original is the strokes.
async function cleanCopy(bmp, { w: W, h: H }) {
  const g = new OffscreenCanvas(W, H).getContext('2d', { willReadFrequently: true });
  g.filter = 'grayscale(1)';
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, W, H);
  const pic = g.getImageData(0, 0, W, H), d = pic.data;
  const grey = new Uint8ClampedArray(W * H);
  for (let i = 0; i < W * H; i++) grey[i] = d[i * 4];
  const R = Math.max(8, Math.round(Math.max(W, H) / 110));
  const brighter = (a, b) => (a > b ? a : b), darker = (a, b) => (a < b ? a : b);
  const lightGone = spread(spread(grey, W, H, R, darker), W, H, R, brighter);
  const darkGone = spread(spread(grey, W, H, R, brighter), W, H, R, darker);
  // Between dense letters the background looks like thin strokes of the other kind, so each small
  // spot has to say which kind its letters are: those on the side away from the usual brightness
  // around it. The spots overlap, so the choice doesn't jump at the edge of a button.
  for (let ty = 0; ty < H; ty += R) for (let tx = 0; tx < W; tx += R) {
    const seen = [];
    const top = Math.max(0, ty - R), bottom = Math.min(H, ty + 2 * R), left = Math.max(0, tx - R), right = Math.min(W, tx + 2 * R);
    for (let y = top; y < bottom; y += 3) for (let x = left; x < right; x += 3) seen.push(grey[y * W + x]);
    seen.sort((a, b) => a - b);
    const usual = seen[seen.length >> 1], lightText = usual - seen[0] < seen[seen.length - 1] - usual;
    for (let y = ty; y < Math.min(H, ty + R); y++) for (let x = tx; x < Math.min(W, tx + R); x++) {
      const i = y * W + x, stroke = lightText ? grey[i] - lightGone[i] : darkGone[i] - grey[i];
      // Stretched: white on orange is only about 60 levels apart.
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = Math.max(0, 255 - stroke * 3);
    }
  }
  g.putImageData(pic, 0, 0);
  return g.canvas.convertToBlob({ type: 'image/png' });
}

// Every pixel takes the brightest (or darkest) value within R pixels, across and then up and down.
// Running over blocks of the window's size keeps it quick, however wide the window is.
function spread(src, W, H, R, pick) {
  const line = (from, get, set, n) => {
    const size = 2 * R + 1, head = new Uint8Array(n), tail = new Uint8Array(n);
    for (let i = 0; i < n; i++) head[i] = i % size === 0 ? get(from, i) : pick(head[i - 1], get(from, i));
    for (let i = n - 1; i >= 0; i--) tail[i] = i === n - 1 || (i + 1) % size === 0 ? get(from, i) : pick(tail[i + 1], get(from, i));
    for (let i = 0; i < n; i++) set(from, i, i < R ? head[Math.min(n - 1, i + R)] : i + R >= n ? tail[i - R] : pick(tail[i - R], head[i + R]));
  };
  const across = new Uint8ClampedArray(W * H), out = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) line(y * W, (o, i) => src[o + i], (o, i, v) => { across[o + i] = v; }, W);
  for (let x = 0; x < W; x++) line(x, (o, i) => across[o + i * W], (o, i, v) => { out[o + i * W] = v; }, H);
  return out;
}

// How much of the smaller box the two boxes share (0 to 1).
function overlap(a, b) {
  const h = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const w = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (h <= 0 || w <= 0) return 0;
  const area = (x) => (x[2] - x[0]) * (x[3] - x[1]);
  return (h * w) / Math.min(area(a), area(b));
}
