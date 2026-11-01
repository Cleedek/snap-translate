// Snap Translate: everything drawn on the page. Added only when you ask for a
// translation, and drawn inside a shadow root so the site's CSS can't reach it.

(() => {
  if (window.__snapTranslate) return;
  window.__snapTranslate = true;

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    .ui {
      color-scheme: dark;
      --bg: oklch(0.185 0.008 290);
      --panel: oklch(0.225 0.010 290);
      --panel-hover: oklch(0.255 0.012 290);
      --line: oklch(0.29 0.012 290);
      --line-strong: oklch(0.36 0.014 290);
      --text: oklch(0.94 0.006 290);
      --muted: oklch(0.70 0.014 290);
      --faint: oklch(0.56 0.014 290);
      --accent: oklch(0.54 0.23 293);
      --accent-hover: oklch(0.60 0.21 293);
      --accent-soft: oklch(0.54 0.23 293 / .22);
      --thumb: oklch(0.97 0.004 290);
      --success: oklch(0.86 0.13 150);
      --danger: oklch(0.72 0.16 22);
      --ease: cubic-bezier(.25, 1, .5, 1);
      font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
      -webkit-font-smoothing: antialiased;
      color: var(--text);
    }

    /* ---------- picking an area ---------- */

    .pick { position: fixed; inset: 0; cursor: crosshair; background: oklch(0.1 0.01 290 / .38); }
    .pick.dragging { background: transparent; }
    .box {
      position: fixed; display: none; border: 1.5px solid var(--thumb); border-radius: 4px;
      box-shadow: 0 0 0 9999px oklch(0.1 0.01 290 / .38), 0 0 0 1px oklch(0.1 0.01 290 / .5) inset;
    }
    .pick.dragging .box { display: block; }
    .tip {
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%); padding: 7px 12px;
      background: var(--bg); border: 1px solid var(--line); border-radius: 999px;
      box-shadow: 0 8px 24px oklch(0.1 0.01 290 / .45); white-space: nowrap; pointer-events: none;
    }
    .tip kbd { font: 600 11px/1 system-ui, sans-serif; padding: 2px 5px; border-radius: 5px; background: var(--panel); border: 1px solid var(--line-strong); }

    /* ---------- the result ---------- */

    .frame { position: absolute; border: 1.5px solid var(--accent); border-radius: 4px; pointer-events: none; }
    /* A translation painted over the original text: its background and letter colours come from the picture. */
    .label {
      position: absolute; pointer-events: auto; display: flex; align-items: center; justify-content: center; text-align: center;
      padding: 0 2px; border-radius: 2px; line-height: 1.12; font-weight: 600; cursor: default; overflow: hidden;
      overflow-wrap: break-word; hyphens: auto; animation: fade .2s var(--ease);
    }
    @keyframes fade { from { opacity: 0; } }
    /* Too long to fit its spot: the original stays visible, outlined, with a line to a bubble. */
    .spot { position: absolute; border: 1.5px solid var(--thumb); border-radius: 3px; box-shadow: 0 0 0 1px oklch(0.1 0.01 290 / .45), inset 0 0 0 1px oklch(0.1 0.01 290 / .45); }
    .links { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; }
    .links path { fill: none; stroke: var(--thumb); stroke-width: 1.5; }
    .links path.halo { stroke: oklch(0.1 0.01 290 / .5); stroke-width: 4; }
    .links circle { fill: var(--thumb); stroke: oklch(0.1 0.01 290 / .5); stroke-width: 1; }
    .callout {
      position: absolute; max-width: 240px; padding: 6px 9px; pointer-events: auto; cursor: default;
      background: var(--bg); color: var(--text); border: 1px solid var(--line-strong); border-radius: 8px;
      box-shadow: 0 6px 18px oklch(0.1 0.01 290 / .45); font-size: 13px; line-height: 1.35; font-weight: 500;
      white-space: pre-wrap; overflow-wrap: break-word; animation: fade .2s var(--ease);
    }

    .card {
      position: absolute; width: 340px; max-height: min(60vh, 520px); display: flex; flex-direction: column;
      background: var(--bg); border: 1px solid var(--line); border-radius: 12px;
      box-shadow: 0 12px 36px oklch(0.1 0.01 290 / .55);
      animation: in .18s var(--ease);
    }
    @keyframes in { from { opacity: 0; transform: translateY(4px); } }
    .head { display: flex; align-items: center; gap: 8px; padding: 9px 8px 9px 12px; border-bottom: 1px solid var(--line); }
    .title { flex: 1; min-width: 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .card.collapsed .head { border-bottom: 0; }
    .body { overflow-y: auto; padding: 4px 12px; }
    .foot { display: flex; align-items: center; gap: 8px; min-height: 36px; padding: 5px 6px 5px 12px; border-top: 1px solid var(--line); }
    .model { flex: 1; min-width: 0; font-size: 11px; color: var(--faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    button {
      font: inherit; color: var(--text); background: var(--panel); border: 1px solid var(--line);
      border-radius: 8px; padding: 4px 9px; cursor: pointer;
      transition: background-color .15s var(--ease), border-color .15s var(--ease), color .15s var(--ease);
    }
    button:hover { background: var(--panel-hover); border-color: var(--line-strong); }
    button.primary { background: var(--accent); border-color: var(--accent); color: oklch(0.99 0.003 290); font-weight: 600; }
    button.primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
    button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .icon { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; color: var(--muted); background: transparent; border-color: transparent; }
    .icon:hover { color: var(--text); }
    .icon.done { color: var(--success); }

    .segmented { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; padding: 2px; background: var(--panel); border: 1px solid var(--line); border-radius: 999px; }
    .segmented button { border: 0; border-radius: 999px; background: transparent; color: var(--muted); padding: 3px 9px; font-size: 11.5px; white-space: nowrap; }
    .segmented button:hover { background: var(--panel-hover); color: var(--text); }
    .segmented button[aria-pressed="true"] { background: var(--thumb); color: oklch(0.2 0.012 290); font-weight: 600; box-shadow: 0 1px 2px oklch(0.1 0.01 290 / .4); }

    .block { padding: 9px 0; cursor: copy; }
    .block + .block { border-top: 1px solid var(--line); }
        /* The original on top, small and grey; the translation under it is what you read. */
    .src { margin: 0 0 3px; font-size: 12px; color: var(--muted); white-space: pre-wrap; }
    .tr { margin: 0; font-size: 14px; line-height: 1.45; white-space: pre-wrap; }
    .block.copied .tr::after { content: "  " attr(data-copied); color: var(--success); font-size: 11px; font-weight: 600; }
    .empty { margin: 10px 0; color: var(--muted); }
    .error { margin: 10px 0 8px; color: var(--danger); }
    .actions { display: flex; gap: 6px; margin-bottom: 10px; }

    .loading { display: flex; align-items: center; gap: 10px; padding: 12px 0; color: var(--muted); }
    .spinner { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--line-strong); border-top-color: var(--accent); animation: spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    @media (prefers-reduced-motion: reduce) {
      * { transition: none !important; animation: none !important; }
    }
  `;

  const ICON = {
    copy: '<svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 3.2V3a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    check: '<svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  };

  let host, ui;

  function ensureHost() {
    if (host && host.isConnected) return;
    host = document.createElement('snap-translate');
    host.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>${CSS}</style><div class="ui"></div>`;
    ui = root.querySelector('.ui');
    document.documentElement.appendChild(host);
  }

  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const send = (msg) => chrome.runtime.sendMessage(msg).catch((e) => ({ ok: false, error: e.message }));

  const t = SnapI18n.t;

  chrome.runtime.onMessage.addListener(async (msg) => {
    await SnapI18n.load();
    if (msg.type === 'pick') pick();
    if (msg.type === 'image') image(msg.src);
  });

  // ---------- picking an area ----------

  let stopPick = null;

  function pick(tipText = t('Drag over the text you want translated')) {
    ensureHost();
    if (stopPick) stopPick();
    const layer = el('div', 'pick', `<div class="tip">${esc(tipText)} · <kbd>Esc</kbd> ${esc(t('to cancel'))}</div>`);
    const box = el('div', 'box');
    layer.append(box);
    ui.append(layer);
    let from = null, rect = null;

    const draw = (e) => {
      const x = Math.min(from.x, e.clientX), y = Math.min(from.y, e.clientY);
      rect = { x, y, w: Math.abs(e.clientX - from.x), h: Math.abs(e.clientY - from.y) };
      Object.assign(box.style, { left: x + 'px', top: y + 'px', width: rect.w + 'px', height: rect.h + 'px' });
    };
    layer.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      from = { x: e.clientX, y: e.clientY };
      layer.setPointerCapture(e.pointerId);
      layer.classList.add('dragging');
      draw(e);
    });
    layer.addEventListener('pointermove', (e) => { if (from) draw(e); });
    layer.addEventListener('pointerup', () => {
      if (!from) return;
      stop();
      if (rect && rect.w >= 8 && rect.h >= 8) run(rect);
    });
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); stop(); } };
    window.addEventListener('keydown', onKey, true);

    function stop() {
      layer.remove();
      window.removeEventListener('keydown', onKey, true);
      stopPick = null;
    }
    stopPick = stop;
  }

  // ---------- a right-clicked picture ----------

  async function image(src) {
    ensureHost();
    const area = (i) => { const r = i.getBoundingClientRect(); return r.width * r.height; };
    const img = [...document.images].filter((i) => i.currentSrc === src || i.src === src).sort((a, b) => area(b) - area(a))[0];
    if (!img) return pick(t('Couldn’t find that picture. Drag over it instead'));
    let r = img.getBoundingClientRect();
    if ((r.top < 0 || r.bottom > innerHeight) && r.height <= innerHeight) {
      img.scrollIntoView({ block: 'center', behavior: 'instant' });
      await frames();
      r = img.getBoundingClientRect();
    }
    // Only the part on screen can be captured.
    const x = Math.max(0, r.left), y = Math.max(0, r.top);
    const rect = { x, y, w: Math.min(innerWidth, r.right) - x, h: Math.min(innerHeight, r.bottom) - y };
    if (rect.w < 8 || rect.h < 8) return pick();
    run(rect);
  }

  // ---------- capture, ask, show ----------

  let current = null; // the result on screen: { frame, card, onKey }

  async function run(rect) {
    clear();
    // Our own picker and old results must not be in the screenshot.
    host.style.visibility = 'hidden';
    await frames();
    const shot = await send({ type: 'capture', rect, vw: innerWidth });
    host.style.visibility = '';
    // Page position, so the result stays on the picture when the page scrolls.
    const pos = { x: rect.x + scrollX, y: rect.y + scrollY, w: rect.w, h: rect.h };
    const view = show(pos);
    if (!shot.ok) return view.error(shot.error, null);
    view.ask(shot.img);
  }

  function clear() {
    if (!current) return;
    current.frame.remove();
    current.card.remove();
    window.removeEventListener('keydown', current.onKey, true);
    current = null;
  }

  function show(pos) {
    const frame = el('div', 'frame');
    Object.assign(frame.style, { left: pos.x + 'px', top: pos.y + 'px', width: pos.w + 'px', height: pos.h + 'px' });
    const card = el('div', 'card', `
      <div class="head">
        <span class="title">${esc(t('Translating…'))}</span>
        <button class="icon copy" title="${esc(t('Copy translation'))}" aria-label="${esc(t('Copy translation'))}" hidden>${ICON.copy}</button>
        <button class="icon close" title="${esc(t('Close (Esc)'))}" aria-label="${esc(t('Close'))}">${ICON.close}</button>
      </div>
      <div class="body"></div>
      <div class="foot" hidden>
        <span class="model"></span>
        <div class="segmented" role="group" aria-label="${esc(t('Show translation'))}" hidden>
          <button data-view="list" aria-pressed="true">${esc(t('List'))}</button>
          <button data-view="picture" aria-pressed="false">${esc(t('On picture'))}</button>
        </div>
      </div>`);
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', t('Translation'));
    ui.append(frame, card);
    const $ = (s) => card.querySelector(s);
    const body = $('.body');

    const onKey = (e) => { if (e.key === 'Escape' && !stopPick) clear(); };
    window.addEventListener('keydown', onKey, true);
    current = { frame, card, onKey };
    $('.close').addEventListener('click', clear);

    // Beside the picture if there is room, otherwise below or above it, always on screen.
    const place = () => {
      const W = 340, gap = 10, m = 8, h = card.offsetHeight;
      const vx = scrollX, vy = scrollY, vw = document.documentElement.clientWidth, vh = innerHeight;
      let left, top;
      if (pos.x + pos.w + gap + W <= vx + vw - m) { left = pos.x + pos.w + gap; top = pos.y; }
      else if (pos.x - gap - W >= vx + m) { left = pos.x - gap - W; top = pos.y; }
      else {
        left = Math.min(Math.max(pos.x, vx + m), vx + vw - W - m);
        top = pos.y + pos.h + gap + h <= vy + vh - m ? pos.y + pos.h + gap : pos.y - gap - h;
      }
      top = Math.min(Math.max(top, vy + m), vy + vh - h - m);
      Object.assign(card.style, { left: left + 'px', top: top + 'px' });
    };

    const loading = () => {
      $('.title').textContent = t('Translating…');
      body.innerHTML = `<div class="loading" role="status"><div class="spinner"></div>${esc(t('Reading the picture…'))}</div>`;
      place();
    };

    const error = (message, img) => {
      $('.title').textContent = t('Couldn’t translate');
      body.innerHTML = `<p class="error">${esc(message)}</p><div class="actions"></div>`;
      const actions = body.querySelector('.actions');
      if (img) {
        const retry = el('button', 'primary', esc(t('Try again')));
        retry.addEventListener('click', () => ask(img));
        actions.append(retry);
      }
      const settings = el('button', '', esc(t('Open settings')));
      settings.addEventListener('click', () => send({ type: 'options' }));
      actions.append(settings);
      place();
    };

    const ask = async (img) => {
      loading();
      const res = await send({ type: 'ask', img });
      if (!current || current.card !== card) return; // closed while waiting
      if (!res.ok) return error(res.error, img);
      render(res, img);
    };

    const render = ({ result, source, target, model }, img) => {
      const { blocks } = result;
      const name = (l) => `${l.flag} ${l.name.charAt(0).toLocaleUpperCase() + l.name.slice(1)}`.trim();
      $('.title').textContent = source ? `${name(source)} → ${name(target)}` : name(target);
      $('.model').textContent = model;
      $('.foot').hidden = false;
      if (!blocks.length) {
        body.innerHTML = `<p class="empty">${esc(t('No text found in this area.'))}</p>`;
        return place();
      }
      body.innerHTML = '';
      for (const b of blocks) {
        const row = el('div', 'block', `${b.text && b.text !== b.translation ? `<p class="src">${esc(b.text)}</p>` : ''}<p class="tr" data-copied="${esc(t('Copied'))}">${esc(b.translation)}</p>`);
        row.title = t('Click to copy');
        row.addEventListener('click', () => copy(b.translation).then(() => {
          row.classList.add('copied');
          setTimeout(() => row.classList.remove('copied'), 1200);
        }));
        body.append(row);
      }
      const copyAll = $('.copy');
      copyAll.hidden = false;
      copyAll.onclick = () => copy(blocks.map((b) => b.translation).join('\n\n')).then(() => {
        copyAll.innerHTML = ICON.check;
        copyAll.classList.add('done');
        setTimeout(() => { copyAll.innerHTML = ICON.copy; copyAll.classList.remove('done'); }, 1200);
      });
      if (blocks.some((b) => b.box)) setupViews(blocks, img);
      place();
    };

    // "On picture" puts each translation where the original text was, like Google Lens:
    // over the picture's own background, in the letters' colour, sized to the same box.
    // The choice is remembered for the next translation.
    const setupViews = async (blocks, img) => {
      const seg = $('.segmented');
      seg.hidden = false;
      const colours = await sampler(img).catch(() => null);
      const rectOf = ([y1, x1, y2, x2]) => ({ x: (x1 / 1000) * pos.w, y: (y1 / 1000) * pos.h, w: ((x2 - x1) / 1000) * pos.w, h: ((y2 - y1) / 1000) * pos.h });
      // Painted over the original. Null (and removed again) when it would only fit at an unreadable size.
      const label = (box, text, original, lines) => {
        const r = rectOf(box);
        // 2 px more on each side, so no antialiased edge of the original peeks out.
        const w = r.w + 4, h = r.h + 4;
        const c = colours ? colours(box) : { bg: 'var(--bg)', text: 'var(--text)' };
        const n = el('div', 'label onpic');
        n.textContent = text;
        n.title = original;
        Object.assign(n.style, {
          left: r.x - 2 + 'px', top: r.y - 2 + 'px',
          width: w + 'px', height: h + 'px', background: c.fill || c.bg, color: c.text,
          // Soft edge in the same colour, so the patch blends into gradients and photos.
          boxShadow: `0 0 4px 3px ${c.bg}`,
        });
        frame.append(n);
        if (fit(n, h / lines)) return n;
        n.remove();
        return null;
      };
      const paint = () => {
        const tooLong = [];
        for (const b of blocks.filter((x) => x.box)) {
          const tr = b.translation.split('\n');
          // Line by line when the translation kept the original's line breaks (Quick does).
          // Never the whole paragraph then: its box can span other text between its lines.
          if (b.lines && b.lines.length > 1 && tr.length === b.lines.length) {
            b.lines.forEach((l, i) => label(l.box, tr[i], l.text, 1) || tooLong.push({ text: l.text, translation: tr[i], box: l.box, spots: [l.box] }));
          } else if (b.lines && b.lines.length > 1) {
            // Line breaks lost: one bubble for the paragraph, each of its lines outlined.
            tooLong.push({ text: b.text, translation: b.translation, box: b.lines[0].box, spots: b.lines.map((l) => l.box) });
          } else if (!label(b.box, b.translation, b.text, Math.max(1, b.text.split('\n').length))) {
            tooLong.push({ text: b.text, translation: b.translation, box: b.box, spots: [b.box] });
          }
        }
        callouts(tooLong);
      };
      // A translation too long for its spot goes in a bubble next to it, with a line to the
      // original, which stays visible and outlined. Each bubble takes the nearest free place.
      const callouts = (list) => {
        if (!list.length) return;
        const taken = [...frame.querySelectorAll('.label')].map((n) => ({ x: n.offsetLeft, y: n.offsetTop, w: n.offsetWidth, h: n.offsetHeight }));
        taken.push({ x: card.offsetLeft - frame.offsetLeft, y: card.offsetTop - frame.offsetTop, w: card.offsetWidth, h: card.offsetHeight });
        list.forEach((b) => b.spots.forEach((s) => taken.push(rectOf(s))));
        const shared = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        // What's on screen right now, in the frame's own coordinates.
        const minX = scrollX - pos.x + 8, maxX = scrollX - pos.x + document.documentElement.clientWidth - 8, minY = -pos.y + 8;
        const links = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        links.setAttribute('class', 'links onpic');
        frame.append(links);
        for (const b of list.sort((p, q) => p.box[0] - q.box[0] || p.box[1] - q.box[1])) {
          const r = rectOf(b.box);
          for (const s of b.spots.map(rectOf)) {
            const spot = el('div', 'spot onpic');
            Object.assign(spot.style, { left: s.x - 2 + 'px', top: s.y - 2 + 'px', width: s.w + 4 + 'px', height: s.h + 4 + 'px' });
            frame.append(spot);
          }
          const bubble = el('div', 'callout onpic');
          bubble.textContent = b.translation;
          bubble.title = b.text;
          frame.append(bubble);
          const w = bubble.offsetWidth, h = bubble.offsetHeight, gap = 14, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
          const tries = [
            [cx - w / 2, r.y + r.h + gap], [cx - w / 2, r.y - gap - h],
            [r.x + r.w + gap, cy - h / 2], [r.x - gap - w, cy - h / 2],
            [pos.w + gap, cy - h / 2], [-gap - w, cy - h / 2],
          ].map(([x, y]) => {
            const at = { x: Math.min(Math.max(x, minX), maxX - w), y: Math.max(y, minY), w, h };
            const clash = taken.reduce((sum, o) => sum + shared(at, o), 0);
            return { at, score: clash * 100 + Math.hypot(at.x + w / 2 - cx, at.y + h / 2 - cy) };
          });
          const { at } = tries.reduce((best, c) => (c.score < best.score ? c : best));
          Object.assign(bubble.style, { left: at.x + 'px', top: at.y + 'px' });
          taken.push(at);
          // From the edge of the original to the nearest edge of the bubble.
          const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
          const bx = at.x + w / 2, by = at.y + h / 2;
          const from = [clamp(bx, r.x - 2, r.x + r.w + 2), clamp(by, r.y - 2, r.y + r.h + 2)];
          const to = [clamp(from[0], at.x, at.x + w), clamp(from[1], at.y, at.y + h)];
          const d = `M${from[0]} ${from[1]}L${to[0]} ${to[1]}`;
          links.insertAdjacentHTML('beforeend', `<path class="halo" d="${d}"/><path d="${d}"/><circle cx="${from[0]}" cy="${from[1]}" r="2.5"/>`);
        }
      };
      const choose = (view) => {
        const onPicture = view === 'picture';
        seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.view === view)));
        frame.querySelectorAll('.onpic').forEach((n) => n.remove());
        body.hidden = onPicture;
        card.classList.toggle('collapsed', onPicture);
        // The card goes first, so the bubbles can keep clear of it.
        place();
        if (onPicture) paint();
      };
      seg.querySelectorAll('button').forEach((btn) => btn.addEventListener('click', () => {
        choose(btn.dataset.view);
        chrome.storage.local.set({ view: btn.dataset.view }).catch(() => {});
      }));
      const { view } = await chrome.storage.local.get('view').catch(() => ({}));
      if (view === 'picture' && current && current.card === card) choose('picture');
    };

    return { ask, error };
  }

  // Starts at the size of one original line and shrinks until the translation fits its box.
  // False when it would have to go below 11 px (or below the original's own size, if that is smaller).
  function fit(label, lineHeight) {
    const start = Math.max(8, Math.min(48, lineHeight * 0.78)), smallest = Math.min(11, start);
    let size = start;
    const over = () => label.scrollHeight > label.clientHeight + 1 || label.scrollWidth > label.clientWidth + 1;
    label.style.fontSize = size + 'px';
    while (size > smallest && over()) {
      size -= 0.5;
      label.style.fontSize = size + 'px';
    }
    return !over();
  }

  // Colours from the screenshot: the background just around a piece of text,
  // and the colour of its letters (the pixels inside that differ most from it).
  async function sampler(img) {
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
    const median = (list) => [0, 1, 2].map((k) => list.map((c) => c[k]).sort((a, b) => a - b)[list.length >> 1]);
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const lum = (c) => {
      const [r, g2, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * r + 0.7152 * g2 + 0.0722 * b;
    };
    const contrast = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); };
    const rgb = (c) => `rgb(${c.map(Math.round).join(',')})`;

    return (box) => {
      const y1 = (box[0] / 1000) * H, x1 = (box[1] / 1000) * W, y2 = (box[2] / 1000) * H, x2 = (box[3] / 1000) * W;
      // Left and right ends sampled apart, so a patch on a gradient fades like the picture does.
      const left = [], right = [], m = 3;
      for (let i = 0; i <= 24; i++) {
        const x = x1 + ((x2 - x1) * i) / 24, y = y1 + ((y2 - y1) * i) / 24;
        (i < 12 ? left : right).push(at(x, y1 - m), at(x, y2 + m));
        left.push(at(x1 - m, y));
        right.push(at(x2 + m, y));
      }
      const bg = median(left.concat(right)), bgL = median(left), bgR = median(right);
      const ink = [];
      for (let i = 1; i < 40; i++) for (let j = 1; j < 16; j++) {
        const c = at(x1 + ((x2 - x1) * i) / 40, y1 + ((y2 - y1) * j) / 16);
        if (dist(c, bg) > 60) ink.push(c);
      }
      ink.sort((a, b) => dist(b, bg) - dist(a, bg));
      let text = ink.length ? median(ink.slice(0, Math.max(1, ink.length >> 1))) : null;
      // Too little contrast to read: plain black or white, whichever suits the background.
      if (!text || contrast(text, bg) < 3) text = lum(bg) > 0.4 ? [17, 17, 17] : [250, 250, 250];
      return { bg: rgb(bg), fill: `linear-gradient(to right, ${rgb(bgL)}, ${rgb(bgR)})`, text: rgb(text) };
    };
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      // Some pages block the clipboard API; the old way still works there.
      const t = Object.assign(document.createElement('textarea'), { value: text });
      t.style.cssText = 'position:fixed;opacity:0;';
      document.body.append(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
  }
})();
