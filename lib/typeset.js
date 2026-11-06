// Snap Translate: sets a translation where the original text was, so the picture reads as if
// it had been made in the other language. Same colour, size, weight and alignment; a longer
// text first takes the empty space around it and only then gets a little smaller.
(function (root) {
  'use strict';
  if (root.SnapTypeset) return; // the page script can be added to a tab more than once

  const RTL = /^(ar|he|iw|fa|ur)(\b|-)/;
  const isRtl = (code) => RTL.test(String(code || ''));
  const middle = (list) => [...list].sort((a, b) => a - b)[list.length >> 1];
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  // Marks stacked above and below letters need more room between the lines.
  const leadingFloor = (code) => (/^(th|hi|ar|vi)/.test(code) ? 1.32 : /^(zh|ja|ko)/.test(code) ? 1.28 : 1.08);

  // The font size that gives letters this tall. "ox" stands about half a font size tall,
  // "Hd" about three quarters, and tails or marks add to that, so the text itself says which.
  function emOf(text, inkHeight) {
    const s = text.normalize('NFD');
    if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(s)) return inkHeight / 0.92;
    if (!/\p{Script=Latin}/u.test(s)) return inkHeight / 0.82;
    const tall = /[A-Zbdfhklt0-9]/.test(s) || /[ij]/.test(s);
    const capMark = /[A-Z][̀-̢̀-ͯ]/.test(s);
    const low = /[gjpqy]/.test(s) || /̣/.test(s);
    return inkHeight / ((capMark ? 0.94 : tall || /[̀-̢]/.test(s) ? 0.76 : 0.52) + (low ? 0.22 : 0));
  }

  // Stroke thickness, as a share of the font size, to a font weight.
  const weightOf = (share) => (share < 0.128 ? 400 : share < 0.136 ? 500 : share < 0.175 ? 700 : 800);

  function set({ blocks, px, frame, size, target, source, fontAt, makeLabel }) {
    const k = size.h / px.H; // CSS pixels per screenshot pixel
    const toBox = (r) => [(r.y / size.h) * 1000, (r.x / size.w) * 1000, ((r.y + r.h) / size.h) * 1000, ((r.x + r.w) / size.w) * 1000];
    const rectOf = ([y1, x1, y2, x2]) => ({ x: (x1 / 1000) * size.w, y: (y1 / 1000) * size.h, w: ((x2 - x1) / 1000) * size.w, h: ((y2 - y1) / 1000) * size.h });
    // Measurements below rest on these boxes, so first cut them down to the letters.
    for (const b of blocks) {
      if (!b.box) continue;
      if (b.lines) {
        for (const l of b.lines) l.box = px.tighten(l.box);
        b.box = [0, 1, 2, 3].map((i) => (i < 2 ? Math.min : Math.max)(...b.lines.map((l) => l.box[i])));
      } else b.box = px.tighten(b.box);
    }
    const shared = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const parts = (b) => (b.lines ? b.lines.map((l) => l.box) : [b.box]);
    const mirror = isRtl(target) !== isRtl(source);

    // Everything that holds text, moved aside for nobody: also what the translation leaves as it was.
    const obstacles = blocks.filter((b) => b.box).flatMap((b) => parts(b).map((box) => ({ owner: b, ...rectOf(box) })));

    // How far plain background reaches beside a box. Only the middle of the line counts, and it
    // starts a little away from the box: letters often stick out of it by a pixel or two.
    const scanFree = (r, c, dir, owner, em) => {
      let far = 0, colour = dir < 0 ? c.sides.l : c.sides.r;
      const off = em * 0.2, band = { y: r.y + r.h / 4, h: r.h / 2, w: 4 };
      for (let step = 4; step <= size.w; step += 4) {
        const s = { ...band, x: dir < 0 ? r.x - off - step : r.x + r.w + off + step - 4 };
        if (s.x < 0 || s.x + s.w > size.w || obstacles.some((o) => o.owner !== owner && shared(o, s))) break;
        colour = px.flat(toBox(s), colour, far ? 7 : 20); // the first step starts from the ring's rougher colour
        if (!colour) break;
        far = step;
      }
      return far;
    };
    // Lines say which way they are aligned by their edges. A single line lines up with its
    // neighbours, or, with free space reaching equally far on both sides, sits in the middle
    // of something (a button, a card, the picture).
    const sideOf = (b, r, c, em) => {
      const rows = b.lines ? b.lines.map((l) => rectOf(l.box)) : null;
      if (rows && rows.length > 1) {
        const spread = (f) => Math.max(...rows.map(f)) - Math.min(...rows.map(f));
        const l = spread((o) => o.x), rt = spread((o) => o.x + o.w), mid = spread((o) => o.x + o.w / 2);
        if (l <= em * 0.5 || (l <= rt && l <= mid)) return 'left';
        return mid <= rt ? 'center' : 'right';
      }
      const others = obstacles.filter((o) => o.owner !== b);
      const atLeft = others.filter((o) => Math.abs(o.x - r.x) < em * 0.3).length;
      // Right edges line up by chance easily: only an exact match of text of the same height counts.
      const atRight = others.filter((o) => Math.abs(o.x + o.w - r.x - r.w) < Math.max(1.5, em * 0.1) && Math.abs(o.h - r.h) < 0.25 * r.h).length;
      // Same width as its neighbours, like a column of prices: the nearer edge of the picture says.
      // One neighbour may line up by chance; a column is at least two.
      if (atRight >= 2 && (atRight > atLeft || (atRight === atLeft && r.x + r.w / 2 > size.w * 0.6))) return 'right';
      if (atLeft) return 'left';
      const before = scanFree(r, c, -1, b, em), after = scanFree(r, c, 1, b, em);
      if (Math.min(before, after) >= em * 0.4 && Math.abs(before - after) <= Math.max(8, 0.22 * Math.max(before, after))) return 'center';
      return isRtl(source) ? 'right' : 'left';
    };

    const unitOf = (b) => {
      const r = rectOf(b.box), first = parts(b)[0], c = px.colours(first);
      const count = b.lines ? b.lines.length : Math.max(1, b.text.split('\n').length);
      const rows = b.lines || (count === 1 ? [{ text: b.text, box: b.box }] : null);
      const em = rows
        // On a photo the letters can't be told from what is behind them, so the box has to do.
        ? middle(rows.map((l) => emOf(l.text, (c.busy > 10 ? ((l.box[2] - l.box[0]) / 1000) * px.H : px.inkHeight(l.box)) * k)))
        : (r.h / count) * 0.78;
      const tops = b.lines ? b.lines.map((l) => rectOf(l.box).y) : [];
      const pitch = tops.length > 1 ? middle(tops.slice(1).map((t, i) => t - tops[i])) : count > 1 ? r.h / count : em * 1.2;
      let side = sideOf(b, r, c, em);
      // Only what spans the picture flips (Arabic from the right): a narrow piece flipped would run into its neighbour in the next column.
      if (mirror && side !== 'center' && r.w > size.w * 0.55) side = side === 'left' ? 'right' : 'left';
      const letters = b.text.replace(/[^\p{L}]/gu, '');
      const caps = letters.length > 1 && letters === letters.toLocaleUpperCase() && letters !== letters.toLocaleLowerCase();
      // Models put line breaks wherever: kept only when they make a list of short lines.
      const rowsOut = b.translation.split('\n').map((s) => s.trim()).filter(Boolean);
      const list = rowsOut.length >= 3 && rowsOut.every((s) => s.length < 25);
      const text = list ? rowsOut.join('\n') : rowsOut.join(' ');
      const font = fontAt ? fontAt(first) : null;
      return {
        b, r, em, side, count, colour: c, pitch,
        weight: (font && font.weight) || weightOf(px.strokeShare(first, (em / k))),
        family: font && font.family,
        text: caps ? text.toLocaleUpperCase(target) : text,
        spots: parts(b),
      };
    };

    // How far a text may spread beyond its own box: up to whatever is not plain background,
    // other text, or the edge of the picture.
    const spread = (u, a, dir, limit, placed) => {
      const step = Math.max(2, u.em / 4);
      // Keeps the distance from the picture's edge the original had, up to a line's height.
      const edge = (gap) => Math.min(gap, u.em);
      const gaps = { left: edge(u.r.x), right: edge(size.w - u.r.x - u.r.w), up: edge(u.r.y), down: edge(size.h - u.r.y - u.r.h) };
      // Starts a little away from the box: letters often stick out of it by a pixel or two.
      const off = u.em * 0.2;
      let grown = 0, colour = u.colour.sides[dir[0]];
      while (grown + step <= limit) {
        const s = dir === 'right' ? { x: a.x + a.w + off + grown, y: a.y, w: step, h: a.h }
          : dir === 'left' ? { x: a.x - off - grown - step, y: a.y, w: step, h: a.h }
            : dir === 'down' ? { x: a.x, y: a.y + a.h + off + grown, w: a.w, h: step }
              : { x: a.x, y: a.y - off - grown - step, w: a.w, h: step };
        // Sideways only the middle of the line counts: lines above and below often reach a little into it.
        const band = dir === 'left' || dir === 'right' ? { ...s, y: s.y + s.h / 4, h: s.h / 2 } : s;
        if (s.x < gaps.left || s.y < gaps.up || s.x + s.w > size.w - gaps.right || s.y + s.h > size.h - gaps.down) break;
        if (obstacles.some((o) => o.owner !== u.b && shared(o, band)) || placed.some((p) => shared(p, band))) break;
        // On a photo there is no plain background to look for: text may lie on any of it.
        if (u.colour.busy <= 10) {
          colour = px.flat(toBox(band), colour, grown ? 7 : 20);
          if (!colour) break;
        }
        grown += step;
      }
      return grown;
    };
    const wider = (u, a, placed) => {
      // A paragraph keeps its column: widened a lot, it would run into the margin.
      const limit = u.count > 2 ? a.w * 0.08 : size.w;
      if (u.side === 'left') return { ...a, w: a.w + spread(u, a, 'right', limit, placed) };
      if (u.side === 'right') { const g = spread(u, a, 'left', limit, placed); return { ...a, x: a.x - g, w: a.w + g }; }
      const g = Math.min(spread(u, a, 'left', limit / 2, placed), spread(u, a, 'right', limit / 2, placed));
      return { ...a, x: a.x - g, w: a.w + 2 * g };
    };
    const lower = (u, a, placed) => ({ ...a, h: a.h + spread(u, a, 'down', size.h, placed) });
    const higher = (u, a, placed) => { const g = spread(u, a, 'up', size.h, placed); return { ...a, y: a.y - g, h: a.h + g }; };

    // Does the text fit this area at this size? Measured, so the browser's own line breaking
    // (Thai, Chinese, Arabic) decides, not a guess.
    const fits = (n, a, size2, u) => {
      n.style.width = a.w + 'px';
      n.style.fontSize = size2 + 'px';
      return n.scrollWidth <= a.w + 1 && n.offsetHeight <= a.h + size2 * 0.5;
    };

    // Lines of about one height in one colour are the same kind of text. Measured one by one
    // they come out a little different (marks and tails stretch some), so they share one size.
    const units = blocks.filter((b) => !b.skip && b.box).map(unitOf);
    const inkApart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const kinds = [];
    for (const u of units) {
      const kind = kinds.find((m) => Math.abs(m[0].em - u.em) <= 0.16 * Math.max(m[0].em, u.em) && m[0].weight === u.weight && inkApart(m[0].colour.ink, u.colour.ink) < 40);
      if (kind) kind.push(u);
      else kinds.push([u]);
    }
    for (const kind of kinds) {
      const em = middle(kind.map((u) => u.em)), weight = middle(kind.map((u) => Number(u.weight)));
      for (const u of kind) {
        u.kind = kind;
        u.em = em;
        u.weight = weight;
        u.colour.text = kind[0].colour.text;
        u.lead = clamp(u.pitch / em, leadingFloor(target), 1.7);
      }
    }

    const placed = [], tooLong = [], done = [];
    for (const u of units) {
      const b = u.b;
      // Weaker models give two texts one place: the second can't go there too.
      if (done.some((d) => shared(d.r, u.r) > 0.5 * Math.min(d.r.w * d.r.h, u.r.w * u.r.h))) {
        tooLong.push({ text: b.text, translation: b.translation, box: b.lines ? b.lines[0].box : b.box, spots: u.spots });
        continue;
      }
      const n = makeLabel(u);
      n.dir = isRtl(target) ? 'rtl' : 'ltr';
      n.lang = target;
      Object.assign(n.style, {
        color: u.colour.text, fontWeight: u.weight, lineHeight: u.lead, textAlign: u.side,
        textWrap: u.side === 'center' ? 'balance' : 'pretty', visibility: 'hidden',
      });
      if (u.family) n.style.fontFamily = u.family;
      frame.append(n);

      // Own box at the original size, then with the space around it, and only then smaller:
      // down to three quarters of the original, and never so small it can't be read.
      // Text flipped to the other side of its box (Arabic) may be up against the edge: it may then spread the other way too.
      const flipped = !mirror || u.side === 'center' ? null : u.side === 'left' ? { ...u, side: 'right' } : { ...u, side: 'left' };
      const own = u.r, wide = flipped ? wider(flipped, wider(u, own, placed), placed) : wider(u, own, placed);
      const deep = lower(u, wide, placed), tall = higher(u, deep, placed);
      // A short label (a button) has nowhere else to go, so it may give up more.
      const short = u.count === 1 && u.text.split(/\s+/).length <= 5;
      // So may a big headline: even much smaller it is still big, and a bubble would cover the picture.
      const floor = Math.min(u.em, Math.max(10, u.em * (short ? 0.6 : 0.74)), Math.max(24, u.em * 0.6));
      let area = null, final = u.em;
      for (const a of [own, wide, deep, tall]) if (fits(n, a, u.em, u)) { area = a; break; }
      for (let s = u.em * 0.96; !area && s >= floor; s -= u.em * 0.04) {
        if (fits(n, tall, s, u)) { area = tall; final = s; }
      }
      if (!area) {
        n.remove();
        tooLong.push({ text: b.text, translation: b.translation, box: b.lines ? b.lines[0].box : b.box, spots: u.spots });
        continue;
      }
      const unit = { ...u, n, area, final };
      position(unit);
      done.push(unit);
      // What the text really covers, which can be much less than the space it was allowed.
      const range = document.createRange();
      range.selectNodeContents(n);
      const ink = range.getBoundingClientRect(), box = frame.getBoundingClientRect();
      placed.push({ x: ink.left - box.left, y: ink.top - box.top, w: ink.width, h: ink.height });
    }

    // Text of one kind keeps one size: three cards in a row must not end up with three title sizes.
    for (const u of done) {
      const kin = done.filter((o) => o.kind === u.kind);
      const least = Math.min(...kin.map((o) => o.final / o.em));
      // One long outlier doesn't shrink the others past a slight step: legible first.
      const even = u.em * Math.max(least, 0.88);
      if (even < u.final) { u.final = even; position(u); }
    }
    for (const u of done) u.n.style.visibility = '';
    // Everything shown as it was, or left in place with a bubble, stays in the picture.
    const stays = blocks.filter((b) => b.box && !done.some((u) => u.b === b)).flatMap(parts);
    return { erase: done.flatMap((u) => u.spots), keep: stays, tooLong };
  }

  // Short text stays centred on the line it replaces; longer text starts where the original did.
  function position(u) {
    const { n, area, r, final, lead } = u;
    n.style.width = area.w + 'px';
    n.style.left = area.x + 'px';
    n.style.fontSize = final + 'px';
    const h = n.offsetHeight;
    const centred = u.count === 1 || (u.side === 'center' && h < r.h);
    const top = centred ? r.y + r.h / 2 - h / 2 : r.y - ((lead - 1) * final) / 2;
    const lowest = area.y + area.h - h + final * 0.5;
    n.style.top = Math.min(top, Math.max(lowest, area.y)) + 'px';
  }

  root.SnapTypeset = { set, isRtl };
})(globalThis);
