// Snap Translate: reads the text in a picture on this computer (Tesseract.js),
// for the free Quick translator. Nothing here goes to the network.

let reader = null; // started once, then reused: loading the language data takes a moment

function startReader() {
  const url = (p) => chrome.runtime.getURL('vendor/tesseract/' + p);
  reader = Tesseract.createWorker(['vie', 'eng'], 1, {
    // Tesseract's own worker, wrapped so its setup notes don't show up as errors.
    workerPath: chrome.runtime.getURL('lib/ocr-worker.js'),
    // One build only (SIMD, which every current Chrome has) keeps the extension small.
    corePath: url('tesseract-core-simd-lstm.wasm.js'),
    langPath: url('lang'),
    workerBlobURL: false,
    cacheMethod: 'none',
  }).catch((e) => { reader = null; throw e; });
  return reader;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.target !== 'offscreen' || msg.type !== 'ocr') return false;
  read(msg.img).then((blocks) => reply({ ok: true, blocks }), (e) => reply({ ok: false, error: String(e && e.message || e) }));
  return true;
});

// One block per paragraph, each line with its own place in the picture (0 to 1000,
// like the AI translators), so a translation can be painted line by line.
async function read(img) {
  const worker = await (reader || startReader());
  const src = `data:${img.mime};base64,${img.data}`;
  const found = paragraphs(await worker.recognize(src, {}, { blocks: true }), img);
  // Light text on a dark background (signs, banners) often goes unread: when the
  // picture has dark areas, read it again with them flipped to dark-on-light, and
  // keep what the first pass missed.
  const flipped = await darkAreasFlipped(src);
  if (!flipped) return found;
  const again = paragraphs(await worker.recognize(flipped, {}, { blocks: true }), img);
  // Compared line by line: one paragraph's box can span lines that were missed in between.
  const seen = found.flatMap((f) => f.lines);
  for (const p of again) {
    const lines = p.lines.filter((l) => !seen.some((f) => overlap(f.box, l.box) > 0.3));
    if (!lines.length) continue;
    const box = [0, 1, 2, 3].map((k) => (k < 2 ? Math.min : Math.max)(...lines.map((l) => l.box[k])));
    found.push({ text: lines.map((l) => l.text).join('\n'), box, lines });
  }
  return found.sort((a, b) => a.box[0] - b.box[0] || a.box[1] - b.box[1]);
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
      const junk = (w) => !/[\p{L}\d]/u.test(w.text) || w.confidence < 45 || (!/\p{L}/u.test(w.text) && w.confidence < 60);
      const lines = (p.lines || [])
        .flatMap((l) => {
          // Words far apart (a gap over 1.5 line heights) are separate pieces of text,
          // like two columns of a menu, each with its own box.
          const pieces = [];
          for (const w of l.words || []) {
            const last = pieces.at(-1)?.at(-1);
            if (last && w.bbox.x0 - last.bbox.x1 <= 1.5 * (l.bbox.y1 - l.bbox.y0)) pieces.at(-1).push(w);
            else pieces.push([w]);
          }
          return pieces.map((words) => {
            while (words.length && junk(words[0])) words.shift();
            while (words.length && junk(words.at(-1))) words.pop();
            if (!words.length) return null;
            const b = { x0: Math.min(...words.map((w) => w.bbox.x0)), y0: l.bbox.y0, x1: Math.max(...words.map((w) => w.bbox.x1)), y1: l.bbox.y1 };
            const confidence = words.reduce((sum, w) => sum + w.confidence, 0) / words.length;
            return { text: words.map((w) => w.text).join(' ').replace(/^[|`~_¬«»\s]+|[|`~_¬«»\s]+$/g, ''), box: box(b), confidence };
          });
        })
        .filter((l) => l && /\p{L}/u.test(l.text) && l.confidence >= 35);
      if (!lines.length) continue;
      // The paragraph's box from its kept lines only, for the same reason.
      const pb = [0, 1, 2, 3].map((k) => (k < 2 ? Math.min : Math.max)(...lines.map((l) => l.box[k])));
      out.push({ text: lines.map((l) => l.text).join('\n'), box: pb, lines: lines.map(({ text, box }) => ({ text, box })) });
    }
  }
  return out;
}

// Greyscale copy where every area with a dark background is inverted, so all text
// ends up dark on light. The background of each tile is its median brightness
// (letters are the minority, so they don't skew it), blended between tiles so
// the flip has no hard steps. Null when nothing in the picture is dark.
async function darkAreasFlipped(src) {
  const bmp = await createImageBitmap(await (await fetch(src)).blob());
  const W = bmp.width, H = bmp.height;
  const g = new OffscreenCanvas(W, H).getContext('2d', { willReadFrequently: true });
  g.filter = 'grayscale(1)';
  g.drawImage(bmp, 0, 0);
  const pic = g.getImageData(0, 0, W, H), d = pic.data;
  const T = Math.max(24, Math.round(Math.max(W, H) / 24)), cols = Math.ceil(W / T), rows = Math.ceil(H / T);
  const bg = new Float32Array(cols * rows);
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    const v = [];
    for (let y = ty * T; y < Math.min(H, (ty + 1) * T); y += 2) for (let x = tx * T; x < Math.min(W, (tx + 1) * T); x += 2) v.push(d[(y * W + x) * 4]);
    v.sort((a, b) => a - b);
    bg[ty * cols + tx] = v[v.length >> 1];
  }
  if (!bg.some((v) => v < DARK)) return null;
  for (let y = 0; y < H; y++) {
    const fy = Math.min(rows - 1, Math.max(0, y / T - 0.5)), y0 = Math.floor(fy), y1 = Math.min(rows - 1, y0 + 1), wy = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(cols - 1, Math.max(0, x / T - 0.5)), x0 = Math.floor(fx), x1 = Math.min(cols - 1, x0 + 1), wx = fx - x0;
      const here = (bg[y0 * cols + x0] * (1 - wx) + bg[y0 * cols + x1] * wx) * (1 - wy) + (bg[y1 * cols + x0] * (1 - wx) + bg[y1 * cols + x1] * wx) * wy;
      const i = (y * W + x) * 4;
      if (here < DARK) d[i] = d[i + 1] = d[i + 2] = 255 - d[i];
    }
  }
  g.putImageData(pic, 0, 0);
  return g.canvas.convertToBlob({ type: 'image/png' });
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
