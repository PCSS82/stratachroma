// ═══════════════════════════════════════════════════════════════════════════════
// MOTOR MC 1M P50 CIE-LAB — análisis estratigráfico
// ═══════════════════════════════════════════════════════════════════════════════

export function rgbToLab(r, g, b) {
  let rl = r / 255, gl = g / 255, bl = b / 255;
  rl = rl > 0.04045 ? ((rl + 0.055) / 1.055) ** 2.4 : rl / 12.92;
  gl = gl > 0.04045 ? ((gl + 0.055) / 1.055) ** 2.4 : gl / 12.92;
  bl = bl > 0.04045 ? ((bl + 0.055) / 1.055) ** 2.4 : bl / 12.92;
  const X = (rl * 0.4124 + gl * 0.3576 + bl * 0.1805) / 0.95047;
  const Y = (rl * 0.2126 + gl * 0.7152 + bl * 0.0722) / 1.00000;
  const Z = (rl * 0.0193 + gl * 0.1192 + bl * 0.9505) / 1.08883;
  const f = v => v > 0.008856 ? v ** (1 / 3) : 7.787 * v + 16 / 116;
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

function makeLCG(s = 0xDEAD) {
  s = s >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000; };
}

function mcP50(pixels, N = 1_000_000) {
  const v = [];
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], a = pixels[i + 3];
    if (a < 20) continue;
    const br = r * .299 + g * .587 + b * .114;
    if (br < 35 || br > 250) continue;
    v.push(r, g, b);
  }
  if (v.length < 9) return [128, 128, 128];
  const n = (v.length / 3) | 0, smp = Math.min(N, n), rng = makeLCG(0xC0FFEE);
  let sL = 0, sA = 0, sB = 0, c = 0;
  for (let i = 0; i < smp; i++) {
    const idx = (rng() * n | 0) * 3;
    const [L, a, b] = rgbToLab(v[idx], v[idx + 1], v[idx + 2]);
    sL += L; sA += a; sB += b; c++;
  }
  if (!c) return [128, 128, 128];
  const cL = sL / c, cA = sA / c, cB = sB / c;
  let bD = Infinity, bR = 128, bG = 128, bBl = 128;
  const step = Math.max(1, (n / 8000) | 0);
  for (let i = 0; i < n; i += step) {
    const idx = i * 3;
    const [L, a, b] = rgbToLab(v[idx], v[idx + 1], v[idx + 2]);
    const d = (L - cL) ** 2 + (a - cA) ** 2 + (b - cB) ** 2;
    if (d < bD) { bD = d; bR = v[idx]; bG = v[idx + 1]; bBl = v[idx + 2]; }
  }
  return [bR, bG, bBl];
}

function measBg(ctx, w, h) {
  const z = [
    ctx.getImageData(0, Math.floor(h * .15), Math.floor(w * .20), Math.floor(h * .70)),
    ctx.getImageData(Math.floor(w * .80), Math.floor(h * .15), Math.floor(w * .20), Math.floor(h * .70)),
  ];
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (const d of z) for (let i = 0; i < d.data.length; i += 4) {
    const br = d.data[i] * .299 + d.data[i + 1] * .587 + d.data[i + 2] * .114;
    if (br > 85 && br < 215) { sr += d.data[i]; sg += d.data[i + 1]; sb += d.data[i + 2]; n++; }
  }
  if (n < 50) return null;
  return { r: sr / n, g: sg / n, b: sb / n };
}

function corrIllum(r, g, b, bg) {
  if (!bg) return [r, g, b];
  const kr = 188 / Math.max(bg.r, 1), kg = 143 / Math.max(bg.g, 1), kb = 78 / Math.max(bg.b, 1), bl = 0.38;
  return [
    Math.min(255, Math.max(0, Math.round(r * (1 - bl + kr * bl)))),
    Math.min(255, Math.max(0, Math.round(g * (1 - bl + kg * bl)))),
    Math.min(255, Math.max(0, Math.round(b * (1 - bl + kb * bl)))),
  ];
}

function findCol(ctx, w, h) {
  const sY = Math.floor(h * .06), sH = Math.floor(h * .88), data = ctx.getImageData(0, sY, w, sH).data;
  const dk = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let d = 0;
    for (let y = 0; y < sH; y += 3) { const i = (y * w + x) * 4; if (data[i] < 72 && data[i + 1] < 72 && data[i + 2] < 72) d++; }
    dk[x] = d;
  }
  const sm = new Float32Array(w);
  for (let x = 4; x < w - 4; x++) { let s = 0; for (let dx = -4; dx <= 4; dx++) s += dk[x + dx]; sm[x] = s / 9; }
  const mx = Math.max(...sm);
  if (mx < 2) return { x0: Math.floor(w * .28), x1: Math.floor(w * .72) };
  const th = mx * .18; let x0 = w, x1 = 0;
  for (let x = 0; x < w; x++) { if (sm[x] > th) { if (x < x0) x0 = x; if (x > x1) x1 = x; } }
  if (x1 - x0 < w * .04) { x0 = Math.floor(w * .28); x1 = Math.floor(w * .72); }
  const pad = Math.round((x1 - x0) * .05);
  return { x0: Math.max(0, x0 + pad), x1: Math.min(w, x1 - pad) };
}

function detectBounds(ctx, x0, x1, h) {
  const cw = x1 - x0; if (cw < 4) return [];
  const dash = [];
  for (let y = 2; y < h - 2; y++) {
    const row = ctx.getImageData(x0, y, cw, 1).data; let dk = 0, runs = 0, inR = false;
    for (let i = 0; i < row.length; i += 4) {
      const iD = row[i] < 72 && row[i + 1] < 72 && row[i + 2] < 72;
      if (iD) { dk++; if (!inR) { runs++; inR = true; } } else inR = false;
    }
    if (dk >= 3 && runs >= 2) dash.push(y);
  }
  const dashC = []; let grp = [];
  for (const y of dash) {
    if (grp.length === 0 || y - grp[grp.length - 1] <= 5) grp.push(y);
    else { dashC.push(Math.round(grp.reduce((s, v) => s + v, 0) / grp.length)); grp = [y]; }
  }
  if (grp.length) dashC.push(Math.round(grp.reduce((s, v) => s + v, 0) / grp.length));
  const WIN = 5, rowLab = [];
  for (let y = 0; y < h; y += 2) {
    const row = ctx.getImageData(x0, y, cw, 1).data; let sL = 0, sA = 0, sB = 0, cnt = 0;
    for (let i = 0; i < row.length; i += 4) {
      const br = row[i] * .299 + row[i + 1] * .587 + row[i + 2] * .114;
      if (br < 35 || br > 250) continue;
      const [L, a, b] = rgbToLab(row[i], row[i + 1], row[i + 2]);
      sL += L; sA += a; sB += b; cnt++;
    }
    if (cnt > 0) rowLab.push({ y, L: sL / cnt, a: sA / cnt, b: sB / cnt });
  }
  const colorC = [];
  for (let i = WIN; i < rowLab.length - WIN; i++) {
    const p = rowLab.slice(i - WIN, i), nx = rowLab.slice(i + 1, i + WIN + 1);
    const avg = arr => arr.reduce((s, r) => s + r, 0) / arr.length;
    const dE = Math.sqrt(["L", "a", "b"].map(k => avg(nx.map(r => r[k])) - avg(p.map(r => r[k]))).reduce((s, v) => s + v * v, 0));
    if (dE > 9) colorC.push(rowLab[i].y);
  }
  const MIN_GAP = Math.floor(h * .022), all = [...dashC, ...colorC].sort((a, b) => a - b), merged = []; let last = -999;
  for (const y of all) {
    if (y - last > MIN_GAP) { merged.push(y); last = y; }
    else if (dashC.includes(y)) { if (merged.length) merged[merged.length - 1] = y; last = y; }
  }
  return merged;
}

export async function analyzeImage(file, onP) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onerror = () => rej(new Error("Imagen inválida"));
      img.onload = () => {
        try {
          const MAX = 1800, scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const W = Math.round(img.width * scale), H = Math.round(img.height * scale);
          const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
          const ctx = canvas.getContext("2d", { willReadFrequently: true }); ctx.drawImage(img, 0, 0, W, H);
          onP("1/5 · Iluminación…"); const bg = measBg(ctx, W, H);
          const bgInfo = bg ? `RGB(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})` : "—";
          onP("2/5 · Columna…"); const { x0, x1 } = findCol(ctx, W, H);
          const dividers = detectBounds(ctx, x0, x1, H);
          const yS = Math.floor(H * .02), yE = Math.floor(H * .98);
          const bounds = [yS, ...dividers.filter(d => d > yS + 8 && d < yE - 8), yE];
          onP(`3/5 · ${bounds.length - 1} capas · MC 1M…`);
          const colW = Math.max(1, x1 - x0), MIN_H = Math.floor(H * .018), layers = [];
          for (let i = 0; i < bounds.length - 1; i++) {
            const y0 = bounds[i], y1 = bounds[i + 1]; if (y1 - y0 < MIN_H) continue;
            onP(`4/5 · Capa ${layers.length + 1}/${bounds.length - 1}…`);
            const marg = Math.min(22, Math.floor((y1 - y0) * .12)), segH = Math.max(2, y1 - marg - y0 - marg);
            const seg = ctx.getImageData(x0, y0 + marg, colW, segH);
            const [rR, gR, bR] = mcP50(seg.data, 1_000_000);
            const [r, g, b] = corrIllum(rR, gR, bR, bg);
            const hx = v => v.toString(16).padStart(2, "0").toUpperCase();
            const hex = `#${hx(r)}${hx(g)}${hx(b)}`;
            const rn = r / 255, gn = g / 255, bn = b / 255;
            const mx2 = Math.max(rn, gn, bn), mn = Math.min(rn, gn, bn), dv = mx2 - mn, lv = (mx2 + mn) / 2;
            const sv = dv === 0 ? 0 : dv / (1 - Math.abs(2 * lv - 1)); let hv = 0;
            if (dv > 0) { if (mx2 === rn) hv = ((gn - bn) / dv + 6) % 6; else if (mx2 === gn) hv = (bn - rn) / dv + 2; else hv = (rn - gn) / dv + 4; hv = Math.round(hv * 60); }
            const [La, aa, ba] = rgbToLab(r, g, b);
            layers.push({ pos: layers.length + 1, hex, rgb: { r, g, b }, hsl: { h: hv, s: Math.round(sv * 100), l: Math.round(lv * 100) }, lab: { L: Math.round(La), a: Math.round(aa), b: Math.round(ba) }, bgInfo, res: `${W}x${H}` });
          }
          onP(`5/5 · ${layers.length} capas`);
          if (!layers.length) rej(new Error("Sin capas detectadas."));
          else res(layers);
        } catch (e) { rej(new Error("Motor: " + e.message)); }
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}
