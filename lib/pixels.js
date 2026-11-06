// Snap Translate: what the screenshot tells us. The colours, size and weight of a piece of
// text, whether the space next to it is empty, and the picture with its text wiped away.
// Boxes are [ymin, xmin, ymax, xmax] from 0 to 1000, as everywhere else.
(function (root) {
  'use strict';
  if (root.SnapPixels) return; // the page script can be added to a tab more than once

  const median = (list) => [0, 1, 2].map((k) => list.map((c) => c[k]).sort((a, b) => a - b)[list.length >> 1]);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const lum = (c) => {
    const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); };
  const rgb = (c) => `rgb(${c.map(Math.round).join(',')})`;

  async function open(img) {
    const bytes = Uint8Array.from(atob(img.data), (ch) => ch.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: img.mime }));
    const W = bmp.width, H = bmp.height;
    const g = new OffscreenCanvas(W, H).getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0);
    const px = g.getImageData(0, 0, W, H).data;
    const at = (x, y) => {
      const i = (Math.min(H - 1, Math.max(0, Math.round(y))) * W + Math.min(W - 1, Math.max(0, Math.round(x)))) * 4;
      return [px[i], px[i + 1], px[i + 2]];
    };
    const place = (box) => ({ y1: (box[0] / 1000) * H, x1: (box[1] / 1000) * W, y2: (box[2] / 1000) * H, x2: (box[3] / 1000) * W });

    // The background just around a box, each side apart so gradients can be followed, and
    // how busy it is: 0 on a flat colour, high on a photo. Letters of other lines may touch the
    // ring, so the typical difference counts, not the average.
    const ring = (box, m = 3) => {
      const { x1, y1, x2, y2 } = place(box);
      const left = [], right = [], top = [], bottom = [];
      for (let i = 0; i <= 24; i++) {
        const x = x1 + ((x2 - x1) * i) / 24, y = y1 + ((y2 - y1) * i) / 24;
        top.push(at(x, y1 - m));
        bottom.push(at(x, y2 + m));
        left.push(at(x1 - m, y));
        right.push(at(x2 + m, y));
      }
      const all = [...left, ...right, ...top, ...bottom], bg = median(all);
      const s = { bg, l: median(left), r: median(right), t: median(top), b: median(bottom) };
      // Busy means differing from a smooth surface: a gradient isn't busy, however much it changes.
      const ground = groundOf(s, { x1, y1, x2, y2 }), off = [];
      for (let i = 0; i <= 24; i++) {
        const x = x1 + ((x2 - x1) * i) / 24, y = y1 + ((y2 - y1) * i) / 24;
        off.push(dist(top[i], ground(x, y1)), dist(bottom[i], ground(x, y2)), dist(left[i], ground(x1, y)), dist(right[i], ground(x2, y)));
      }
      s.busy = off.sort((a, b) => a - b)[off.length >> 1] * 1.48;
      return s;
    };

    // The background a point of the box should have, from the four sides of the ring.
    const groundOf = (s, { x1, y1, x2, y2 }) => (x, y) => {
      const u = Math.min(1, Math.max(0, (x - x1) / Math.max(1, x2 - x1))), v = Math.min(1, Math.max(0, (y - y1) / Math.max(1, y2 - y1)));
      return [0, 1, 2].map((k) => s.l[k] + (s.r[k] - s.l[k]) * u + s.t[k] + (s.b[k] - s.t[k]) * v - s.bg[k]);
    };

    // The background around a piece of text and the colour of its letters (the pixels inside
    // that differ most from it).
    const colours = (box) => {
      const { x1, y1, x2, y2 } = place(box);
      const s = ring(box), bg = s.bg;
      const ink = [];
      for (let i = 1; i < 40; i++) for (let j = 1; j < 16; j++) {
        const c = at(x1 + ((x2 - x1) * i) / 40, y1 + ((y2 - y1) * j) / 16);
        if (dist(c, bg) > 60) ink.push(c);
      }
      const inked = ink.length / (39 * 15); // how much of the box differs from its background
      ink.sort((a, b) => dist(b, bg) - dist(a, bg));
      // Only the pixels furthest from the background: thin letters are mostly blurred edge.
      let text = ink.length ? median(ink.slice(0, Math.max(1, Math.round(ink.length * 0.08)))) : null;
      // Nothing stands out at all: plain black or white, whichever suits the background.
      // White on orange is low contrast but is what the picture says, so it stays.
      if (!text || contrast(text, bg) < 1.3) text = lum(bg) > 0.4 ? [17, 17, 17] : [250, 250, 250];
      return { bg: rgb(bg), text: rgb(text), raw: bg, ink: text, busy: s.busy, sides: { l: s.l, r: s.r, u: s.t, d: s.b }, inked, height: y2 - y1 };
    };

    // A box cut down to the rows that hold letters: a reader's box can reach past the edge of a
    // button, and everything measured from it would then take the wrong background. Rows
    // of letters change colour many times along their width; a plain row or a straight edge doesn't.
    const tighten = (box) => {
      const { x1, y1, x2, y2 } = place(box);
      const rows = [], steps = Math.max(16, Math.min(300, Math.round(x2 - x1)));
      for (let y = Math.floor(y1); y <= Math.ceil(y2); y++) {
        let changes = 0, was = at(x1, y);
        for (let i = 1; i <= steps; i++) {
          const now = at(x1 + ((x2 - x1) * i) / steps, y);
          changes += dist(now, was);
          was = now;
        }
        rows.push(changes);
      }
      const peak = Math.max(...rows), on = rows.map((v) => v > 0.12 * peak);
      const first = on.indexOf(true), last = on.lastIndexOf(true);
      if (first < 0 || last - first < 3) return box;
      const top = Math.floor(y1) + first, bottom = Math.floor(y1) + last + 1;
      return [Math.max(box[0], (top / H) * 1000), box[1], Math.min(box[2], (bottom / H) * 1000), box[3]];
    };

    // How tall the letters in a box really are, in pixels of the screenshot. A reader's or a
    // model's box is often looser than its letters. Short gaps are bridged: Vietnamese marks
    // float above and below their letters.
    const inkHeight = (box) => {
      const { x1, y1, x2, y2 } = place(box), h = y2 - y1;
      const s = ring(box), ground = groundOf(s, { x1, y1, x2, y2 }), limit = Math.max(40, 3 * s.busy);
      const from = Math.floor(y1 - h * 0.2), to = Math.ceil(y2 + h * 0.2), steps = Math.max(8, Math.min(120, Math.round(x2 - x1)));
      const hasInk = (y) => {
        for (let i = 0; i <= steps; i++) {
          const x = x1 + ((x2 - x1) * i) / steps;
          if (dist(at(x, y), ground(x, Math.min(y2, Math.max(y1, y)))) > limit) return true;
        }
        return false;
      };
      const rows = [];
      for (let y = from; y <= to; y++) if (hasInk(y)) rows.push(y);
      if (!rows.length) return h;
      const mid = (y1 + y2) / 2, bridge = Math.max(1, h * 0.14);
      const nearest = rows.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a));
      let top = nearest, bottom = nearest;
      for (const y of rows) if (y > bottom && y - bottom <= bridge) bottom = y;
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i] < top && top - rows[i] <= bridge) top = rows[i];
      return Math.max(1, bottom - top); // the outermost rows are blurred edge
    };

    // The thickness of the strokes, as a share of the font size: the typical width of a run of
    // letter pixels across a row. Pixels are ink when closer to the letters' colour than the background's.
    const strokeShare = (box, emPx) => {
      const { x1, y1, x2, y2 } = place(box), c = colours(box);
      const runs = [];
      for (let j = 3; j <= 13; j++) { // the middle of the letters
        const y = y1 + ((y2 - y1) * j) / 16;
        let run = 0;
        for (let x = Math.floor(x1); x <= x2 + 1; x++) {
          const p = at(x, y);
          if (x <= x2 && dist(p, c.ink) < dist(p, c.raw)) run++;
          else { if (run) runs.push(run); run = 0; }
        }
      }
      if (!runs.length) return 0.1;
      runs.sort((a, b) => a - b);
      return Math.max(0, runs[runs.length >> 1] - 0.5) / Math.max(1, emPx); // half a pixel of blur
    };

    // The colour of an area if it is plain background that carries on from the colour next to
    // it, so text can go there; null if not. Compared with its neighbour rather than one fixed
    // colour, so text may follow a gradient but stops at the edge of a card, however faint.
    const flat = (box, colour, near = 7) => {
      const { x1, y1, x2, y2 } = place(box);
      const cols = Math.max(2, Math.min(60, Math.ceil(x2 - x1))), rows = Math.max(2, Math.min(30, Math.ceil(y2 - y1)));
      const seen = [];
      for (let i = 0; i <= cols; i++) for (let j = 0; j <= rows; j++) seen.push(at(x1 + ((x2 - x1) * i) / cols, y1 + ((y2 - y1) * j) / rows));
      const mid = median(seen);
      if (dist(mid, colour) > near) return null;
      return seen.filter((c) => dist(c, mid) > 14).length <= 0.015 * seen.length ? mid : null;
    };

    // The picture with the text in these boxes wiped away: a canvas, see-through everywhere else.
    const erase = (boxes, keep = []) => {
      const mask = new Uint8Array(W * H); // 1: a pixel to replace
      const owner = new Int32Array(W * H).fill(-1); // which piece of text a pixel was replaced for
      const spots = boxes.map((box, n) => markText(box, mask, owner, n));
      // Text that stays as it was (a price right under a wiped line) stays whole.
      for (const box of keep) {
        const { x1, y1, x2, y2 } = place(box);
        for (let y = Math.max(0, Math.floor(y1)); y <= Math.min(H - 1, Math.ceil(y2)); y++) mask.fill(0, y * W + Math.max(0, Math.floor(x1)), y * W + Math.min(W, Math.ceil(x2) + 1));
      }
      const fill = new Float32Array(W * H * 3);
      spots.forEach((spot, n) => fillSpot(spot, n, mask, owner, fill));
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const c = canvas.getContext('2d');
      const out = c.createImageData(W, H);
      for (let i = 0; i < W * H; i++) {
        if (!mask[i]) continue;
        // A soft outer edge, so the patch melts into the picture.
        const a = mask[i] === 1 ? 255 : 170;
        const grain = busyAround[i] ? (Math.random() - 0.5) * busyAround[i] : 0;
        out.data[i * 4] = fill[i * 3] + grain;
        out.data[i * 4 + 1] = fill[i * 3 + 1] + grain;
        out.data[i * 4 + 2] = fill[i * 3 + 2] + grain;
        out.data[i * 4 + 3] = a;
      }
      c.putImageData(out, 0, 0);
      return canvas;
    };

    // Fills one piece of text from the surface it sits on, and only that: otherwise the white
    // card around a button or the red price under a line bleeds into the patch. The surface is
    // what can be reached from the edge of the hole without crossing a sharp step in colour.
    let wholeFill = null;
    const fillSpot = ({ r, surface }, n, mask, owner, fill) => {
      const m = Math.max(12, r.y2 - r.y1 + 1);
      const x0 = Math.max(0, r.x1 - m), y0 = Math.max(0, r.y1 - m), cw = Math.min(W - 1, r.x2 + m) - x0 + 1, ch = Math.min(H - 1, r.y2 + m) - y0 + 1;
      const crop = new Uint8ClampedArray(cw * ch * 4), blocked = new Uint8Array(cw * ch);
      const hole = [], edge = [];
      for (let y = 0; y < ch; y++) {
        const from = ((y0 + y) * W + x0) * 4;
        crop.set(px.subarray(from, from + cw * 4), y * cw * 4);
        for (let x = 0; x < cw; x++) {
          const i = (y0 + y) * W + x0 + x;
          if (mask[i]) blocked[y * cw + x] = 1;
          if (mask[i] && owner[i] === n) hole.push(y * cw + x);
        }
      }
      if (!hole.length) return;
      const free = (o) => !blocked[o];
      for (const o of hole) {
        const x = o % cw;
        if (x > 0 && free(o - 1)) edge.push(o - 1);
        if (x < cw - 1 && free(o + 1)) edge.push(o + 1);
        if (o >= cw && free(o - cw)) edge.push(o - cw);
        if (o + cw < cw * ch && free(o + cw)) edge.push(o + cw);
      }
      let open = 0; // how many pixels the fill may take colour from
      if (surface && edge.length) {
        const colourAt = (o) => [crop[o * 4], crop[o * 4 + 1], crop[o * 4 + 2]];
        const typical = median(edge.map(colourAt));
        const seen = new Uint8Array(cw * ch), todo = [];
        for (const o of edge) if (!seen[o] && dist(colourAt(o), typical) <= 30) { seen[o] = 1; todo.push(o); }
        while (todo.length) {
          const o = todo.pop(), here = colourAt(o), x = o % cw;
          const go = (t) => { if (!seen[t] && free(t) && dist(colourAt(t), here) <= 12) { seen[t] = 1; todo.push(t); } };
          if (x > 0) go(o - 1);
          if (x < cw - 1) go(o + 1);
          if (o >= cw) go(o - cw);
          if (o + cw < cw * ch) go(o + cw);
        }
        for (let o = 0; o < cw * ch; o++) if (seen[o]) open++;
        if (open >= 8) for (let o = 0; o < cw * ch; o++) if (!seen[o]) blocked[o] = 1;
      }
      if (open < 8) { open = 0; for (let o = 0; o < cw * ch; o++) if (!blocked[o]) open++; }
      if (!open) { // nothing left nearby: the rest of the picture has to do
        wholeFill = wholeFill || pullPush(px, mask, W, H);
        for (const o of hole) {
          const i = (y0 + Math.floor(o / cw)) * W + x0 + o % cw;
          for (let k = 0; k < 3; k++) fill[i * 3 + k] = wholeFill[i * 3 + k];
        }
        return;
      }
      const near = pullPush(crop, blocked, cw, ch);
      for (const o of hole) {
        const i = (y0 + Math.floor(o / cw)) * W + x0 + o % cw;
        for (let k = 0; k < 3; k++) fill[i * 3 + k] = near[o * 3 + k];
      }
    };

    // Which pixels of a box belong to the text, with a little around them (blurred letter edges
    // and JPEG ripples would otherwise stay behind as a ghost). On a photo a pixel counts when it
    // is closer to the letters' colour than to the photo, so the photo between the letters
    // stays and the patch keeps its structure; only when the letters don't stand out does the whole box go.
    let busyAround = new Uint8Array(W * H);
    const markText = (box, mask, owner, n) => {
      const p = place(box), h = p.y2 - p.y1;
      const pad = Math.max(2, h * 0.14), reach = Math.max(2, h * 0.34); // up and down further: tails and marks stick out of a tightened box
      const r = { x1: Math.max(0, Math.floor(p.x1 - pad)), y1: Math.max(0, Math.floor(p.y1 - reach)), x2: Math.min(W - 1, Math.ceil(p.x2 + pad)), y2: Math.min(H - 1, Math.ceil(p.y2 + reach)) };
      const s = ring(box, Math.ceil(pad) + 2), ground = groundOf(s, r);
      const inkColour = colours(box).ink;
      const busy = s.busy > 16, all = busy && dist(inkColour, s.bg) < 2 * s.busy + 40;
      const limit = Math.max(9, 2.2 * s.busy);
      const rw = r.x2 - r.x1 + 1, rh = r.y2 - r.y1 + 1;
      const hit = new Uint8Array(rw * rh);
      for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
        const X = r.x1 + x, Y = r.y1 + y, i = (Y * W + X) * 4, p = [px[i], px[i + 1], px[i + 2]];
        if (all || (busy ? dist(p, inkColour) < 0.65 * dist(inkColour, ground(X, Y)) : dist(p, ground(X, Y)) > limit)) hit[y * rw + x] = 1;
      }
      // Grow by a few pixels: first across, then up and down.
      const grow = Math.max(2, Math.round(h * 0.1)), soft = grow + Math.max(2, Math.round(h * 0.08));
      const across = new Uint8Array(rw * rh);
      for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
        if (!hit[y * rw + x]) continue;
        for (let d = Math.max(0, x - grow); d <= Math.min(rw - 1, x + grow); d++) across[y * rw + d] = 1;
      }
      const grain = Math.min(14, Math.round(s.busy * 0.7)); // a smooth patch on a grainy picture would stand out
      for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
        if (!across[y * rw + x]) continue;
        for (let d = Math.max(0, y - soft); d <= Math.min(rh - 1, y + soft); d++) {
          const i = (r.y1 + d) * W + r.x1 + x;
          if (Math.abs(d - y) <= grow) mask[i] = 1;
          else if (!mask[i]) mask[i] = 2; // the soft edge
          owner[i] = n;
          if (s.busy >= 10) busyAround[i] = grain;
        }
      }
      return { r, surface: s.busy < 10 }; // on a photo there is no one surface to keep to
    };

    return { W, H, colours, tighten, inkHeight, strokeShare, flat, erase };
  }

  // Fills the holes in a picture from what surrounds them: every step halves the picture,
  // keeping only known pixels, until no hole is left; then, on the way back up, each hole takes
  // the smoothly enlarged colour of the step below. Flat colours and gradients come out exact,
  // and it stays fast on a whole screenshot.
  function pullPush(px, mask, W, H) {
    const level0 = { w: W, h: H, rgb: new Float32Array(W * H * 3), a: new Float32Array(W * H) };
    for (let i = 0; i < W * H; i++) {
      if (mask[i]) continue; // the soft edge too: it may still hold a trace of the letters
      level0.a[i] = 1;
      level0.rgb[i * 3] = px[i * 4];
      level0.rgb[i * 3 + 1] = px[i * 4 + 1];
      level0.rgb[i * 3 + 2] = px[i * 4 + 2];
    }
    const levels = [level0];
    while (levels.at(-1).w > 1 || levels.at(-1).h > 1) {
      const f = levels.at(-1), w = Math.ceil(f.w / 2), h = Math.ceil(f.h / 2);
      const c = { w, h, rgb: new Float32Array(w * h * 3), a: new Float32Array(w * h) };
      for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
        const i = y * f.w + x, a = f.a[i];
        if (!a) continue;
        const o = (y >> 1) * w + (x >> 1);
        c.a[o] += a;
        for (let k = 0; k < 3; k++) c.rgb[o * 3 + k] += f.rgb[i * 3 + k] * a;
      }
      for (let i = 0; i < w * h; i++) {
        if (!c.a[i]) continue;
        for (let k = 0; k < 3; k++) c.rgb[i * 3 + k] /= c.a[i];
        c.a[i] = Math.min(1, c.a[i]);
      }
      levels.push(c);
    }
    for (let n = levels.length - 2; n >= 0; n--) {
      const f = levels[n], c = levels[n + 1];
      for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
        const i = y * f.w + x, a = f.a[i];
        if (a >= 1) continue;
        // Bilinear, so the steps of the small picture don't show.
        const fx = Math.max(0, Math.min(c.w - 1, (x + 0.5) / 2 - 0.5)), fy = Math.max(0, Math.min(c.h - 1, (y + 0.5) / 2 - 0.5));
        const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(c.w - 1, x0 + 1), y1 = Math.min(c.h - 1, y0 + 1), u = fx - x0, v = fy - y0;
        for (let k = 0; k < 3; k++) {
          const up = (c.rgb[(y0 * c.w + x0) * 3 + k] * (1 - u) + c.rgb[(y0 * c.w + x1) * 3 + k] * u) * (1 - v)
            + (c.rgb[(y1 * c.w + x0) * 3 + k] * (1 - u) + c.rgb[(y1 * c.w + x1) * 3 + k] * u) * v;
          f.rgb[i * 3 + k] = f.rgb[i * 3 + k] * a + up * (1 - a);
        }
        f.a[i] = 1;
      }
    }
    return level0.rgb;
  }

  root.SnapPixels = { open };
})(globalThis);
