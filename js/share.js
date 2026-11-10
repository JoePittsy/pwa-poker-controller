// Draws a result card as an image and hands it to the system share sheet (or downloads it).
const C = { ink: '#14112b', paper: '#f6eedb', bg: '#17143a', dot: '#221d52', blue: '#3050e0', red: '#ff4f38', yellow: '#ffc21a', mint: '#22c998' };
const W = 1080, H = 1080;
const font = (px, w = 800) => `${w} ${px}px Bricolage, system-ui, sans-serif`;

function box(ctx, x, y, w, h, r, fill, shadow = 14) {
  if (shadow) { ctx.fillStyle = C.ink; ctx.beginPath(); ctx.roundRect(x + shadow, y + shadow, w, h, r); ctx.fill(); }
  ctx.fillStyle = fill; ctx.strokeStyle = C.ink; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); ctx.stroke();
}

// card: { kicker, title, sub, tiles: [[value, label], ...], accent }
export async function drawCard({ kicker, title, sub, tiles, accent = C.blue }) {
  try { await document.fonts.load(font(40)); } catch { /* fall back to the system font */ }
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.dot;
  for (let y = 22; y < H; y += 44) for (let x = 22; x < W; x += 44) { ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill(); }
  // the cloth
  ctx.save(); ctx.translate(W / 2, 500); ctx.rotate(-0.012); box(ctx, -470, -400, 940, 790, 70, accent, 18); ctx.restore();
  // logo
  ctx.save(); ctx.translate(90, 150); ctx.rotate(-0.05);
  ctx.font = font(92); ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.ink; ctx.fillText('PAD POKER', 8, 8);
  ctx.fillStyle = C.paper; ctx.fillText('PAD ', 0, 0);
  ctx.fillStyle = C.yellow; ctx.fillText('POKER', ctx.measureText('PAD ').width, 0);
  ctx.restore();
  // headline
  ctx.textAlign = 'left';
  ctx.font = font(40, 700); ctx.fillStyle = C.paper; ctx.fillText(kicker.toUpperCase(), 110, 270);
  let size = 120; ctx.font = font(size);
  while (ctx.measureText(title).width > 860 && size > 50) { size -= 6; ctx.font = font(size); }
  ctx.fillStyle = C.ink; ctx.fillText(title, 116, 276 + size);
  ctx.fillStyle = C.yellow; ctx.fillText(title, 110, 270 + size);
  if (sub) { ctx.font = font(40, 600); ctx.fillStyle = C.paper; ctx.fillText(sub, 110, 300 + size + 40); }
  // stat tiles, three to a row
  const tw = 270, th = 150, gx = 25, x0 = 110, y0 = 500;
  tiles.forEach(([value, label], i) => {
    const x = x0 + (i % 3) * (tw + gx), y = y0 + Math.floor(i / 3) * (th + 26);
    box(ctx, x, y, tw, th, 22, C.paper, 9);
    ctx.fillStyle = C.ink;
    let vs = 62; ctx.font = font(vs);
    while (ctx.measureText(String(value)).width > tw - 40 && vs > 26) { vs -= 4; ctx.font = font(vs); }
    ctx.fillText(String(value), x + 20, y + 76);
    ctx.font = font(28, 500); ctx.fillText(label, x + 20, y + 122);
  });
  // footer
  ctx.font = font(34, 600); ctx.fillStyle = C.paper; ctx.textAlign = 'center';
  ctx.fillText('joepittsy.github.io/pwa-poker-controller', W / 2, H - 70);
  return cv;
}

// Returns 'shared', 'saved' or 'failed'.
export async function shareCard(card, filename = 'pad-poker.png') {
  const cv = await drawCard(card);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  if (!blob) return 'failed';
  const file = new File([blob], filename, { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Pad Poker' }); return 'shared'; }
  } catch (e) {
    if (e?.name === 'AbortError') return 'shared'; // they closed the sheet
    // fall through to a download, e.g. when the press did not count as a tap
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'saved';
}
