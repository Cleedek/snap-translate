// The pictures the store images translate, drawn on a canvas so every line's place is known.
// Each picture comes in Vietnamese (for every store language but Vietnamese) and in English
// (for the Vietnamese store page). Quick, the free translator, reads exactly these two.
// draw(name, lang) -> { canvas (2× for sharpness), w, h (CSS px), blocks: [{ text, lines: [{ text, box: {x,y,w,h} }] }] }
// The blocks are what Quick's reader would hand to Google Translate: one running text each.

const StorePictures = (() => {
  const FONT = '"Be Vietnam Pro"';
  const TEXT = {
    poster: {
      vi: { brand: 'KUMO SUSHI · QUẬN 1', head: ['Sushi tươi', 'mỗi ngày'], offer: ['Giảm 30% cho', 'đơn đầu tiên'], cta: 'Đặt bàn ngay', hours: 'Mở cửa 11:00 – 22:00' },
      en: { brand: 'KUMO SUSHI · DISTRICT 1', head: ['Fresh sushi', 'every day'], offer: ['30% off your', 'first order'], cta: 'Book a table', hours: 'Open 11:00 – 22:00' },
    },
    menu: {
      vi: {
        title: 'THỰC ĐƠN HÔM NAY',
        items: [['Phở bò tái', '55.000đ'], ['Bún chả Hà Nội', '50.000đ'], ['Bánh mì trứng ốp la', '25.000đ'], ['Cà phê muối', '30.000đ'], ['Trà chanh sả', '20.000đ']],
        foot: 'Giá đã bao gồm VAT · Mang về giảm 10%',
      },
      en: {
        title: 'TODAY’S MENU',
        items: [['Grilled salmon', '$14'], ['Mushroom risotto', '$11'], ['Caesar salad', '$9'], ['Iced lemon tea', '$4'], ['Chocolate cake', '$6']],
        foot: 'Prices include VAT · 10% off takeaway',
      },
    },
  };

  // Be Vietnam Pro has every Vietnamese letter; the photo is Edge Trim's sushi platter.
  const base = document.currentScript.src;
  let photo = null;
  async function load() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=block';
    document.head.append(link);
    await new Promise((r) => { link.onload = link.onerror = r; });
    const sample = 'Aa Ăă ươ ế ộ đ ’';
    await Promise.all([400, 500, 600, 700, 800].map((w) => document.fonts.load(`${w} 20px ${FONT}`, sample)));
  }
  async function loadPhoto() {
    if (photo) return photo;
    photo = new Image();
    photo.src = new URL('photos/sushi-platter.webp', base).href;
    await photo.decode();
    return photo;
  }

  function setup(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w * 2; canvas.height = h * 2;
    const g = canvas.getContext('2d');
    g.scale(2, 2);
    g.textBaseline = 'alphabetic';
    return { canvas, g };
  }

  // Writes one line and returns where its letters are (a little taller than the ink, as a reader's box is).
  function line(g, text, x, y, { size, weight, color, align = 'left', spacing = 0 }) {
    g.font = `${weight} ${size}px ${FONT}`;
    g.fillStyle = color;
    g.letterSpacing = `${spacing}px`;
    g.textAlign = align;
    g.fillText(text, x, y);
    const m = g.measureText(text);
    const left = align === 'center' ? x - m.width / 2 : align === 'right' ? x - m.width : x;
    const top = y - m.actualBoundingBoxAscent, bottom = y + m.actualBoundingBoxDescent;
    g.letterSpacing = '0px';
    return { text, box: { x: left - 2, y: top - 3, w: m.width + 4, h: bottom - top + 6 } };
  }
  const block = (...lines) => ({ text: lines.map((l) => l.text).join('\n'), lines });

  async function poster(lang) {
    const T = TEXT.poster[lang];
    const w = 520, h = 520;
    const { canvas, g } = setup(w, h);
    g.fillStyle = '#f4ead9';
    g.fillRect(0, 0, w, h);
    // A terracotta sun behind the plate.
    g.fillStyle = '#e0683f';
    g.beginPath(); g.arc(400, 392, 190, 0, Math.PI * 2); g.fill();
    const img = await loadPhoto();
    // The plate fills about 520 of the photo's 1158 px; drawn 330 px wide around (392, 392).
    const k = 330 / 530;
    g.drawImage(img, 392 - 579 * k, 392 - 571 * k, img.naturalWidth * k, img.naturalHeight * k);

    const blocks = [];
    blocks.push(block(line(g, T.brand, 40, 64, { size: 14, weight: 700, color: '#b4472a', spacing: 2.2 })));
    blocks.push(block(
      line(g, T.head[0], 38, 132, { size: 50, weight: 800, color: '#23201c', spacing: -1.2 }),
      line(g, T.head[1], 38, 188, { size: 50, weight: 800, color: '#23201c', spacing: -1.2 }),
    ));
    blocks.push(block(
      line(g, T.offer[0], 40, 236, { size: 21, weight: 500, color: '#4a443c' }),
      line(g, T.offer[1], 40, 264, { size: 21, weight: 500, color: '#4a443c' }),
    ));
    // The button: a dark pill, its words set in the middle.
    g.font = `600 17px ${FONT}`;
    // Wide enough that most translations fit on the button instead of in a bubble.
    const bw = Math.max(g.measureText(T.cta).width + 44, 210);
    g.fillStyle = '#23201c';
    g.beginPath(); g.roundRect(40, 300, bw, 48, 24); g.fill();
    blocks.push(block(line(g, T.cta, 40 + bw / 2, 330, { size: 17, weight: 600, color: '#fbf6ee', align: 'center' })));
    blocks.push(block(line(g, T.hours, 40, 476, { size: 14, weight: 500, color: '#6b6358' })));
    return { canvas, w, h, blocks };
  }

  async function menu(lang) {
    const T = TEXT.menu[lang];
    const w = 500, h = 470;
    const { canvas, g } = setup(w, h);
    // A slate board with a wooden frame.
    g.fillStyle = '#8a5a34';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#25292d';
    g.fillRect(14, 14, w - 28, h - 28);
    const grain = g.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, 340);
    grain.addColorStop(0, 'rgb(255 255 255 / .05)');
    grain.addColorStop(1, 'rgb(0 0 0 / .12)');
    g.fillStyle = grain;
    g.fillRect(14, 14, w - 28, h - 28);

    const blocks = [];
    blocks.push(block(line(g, T.title, w / 2, 74, { size: 25, weight: 700, color: '#f2c14e', align: 'center', spacing: 1.5 })));
    g.strokeStyle = 'rgb(242 193 78 / .5)';
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(170, 96); g.lineTo(330, 96); g.stroke();
    T.items.forEach(([name, price], i) => {
      const y = 152 + i * 54;
      blocks.push(block(line(g, name, 48, y, { size: 21, weight: 500, color: '#f4f1ea' })));
      blocks.push(block(line(g, price, w - 48, y, { size: 21, weight: 600, color: '#f2c14e', align: 'right' })));
    });
    blocks.push(block(line(g, T.foot, w / 2, 430, { size: 14, weight: 400, color: '#aaa69d', align: 'center' })));
    return { canvas, w, h, blocks };
  }

  const draw = (name, lang) => (name === 'poster' ? poster(lang) : menu(lang));
  return { load, draw, TEXT };
})();
