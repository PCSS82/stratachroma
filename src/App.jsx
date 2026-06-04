import { useState, useRef, useEffect, useCallback, memo, useMemo } from "react";
import { analyzeImage, rgbToLab } from "./motor.js";
import { enrichLayer } from "./colors.js";

// ─── LAB → RGB ────────────────────────────────────────────────────────────────
function labToRgb(L, a, b) {
  const fy = (L + 16) / 116, fx = a / 500 + fy, fz = fy - b / 200;
  const cube = v => v ** 3 > 0.008856 ? v ** 3 : (v - 16 / 116) / 7.787;
  const x = cube(fx) * 0.95047, y = cube(fy), z = cube(fz) * 1.08883;
  const gam = c => c > 0.0031308 ? 1.055 * c ** (1 / 2.4) - 0.055 : 12.92 * c;
  const cl  = c => Math.round(Math.max(0, Math.min(1, gam(c))) * 255);
  return {
    r: cl(x * 3.2406 + y * -1.5372 + z * -0.4986),
    g: cl(x * -0.9689 + y * 1.8758 + z * 0.0415),
    b: cl(x * 0.0557  + y * -0.2040 + z * 1.0570),
  };
}

function rgbToHex({ r, g, b }) {
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// ─── MONTEA_COLOR ─────────────────────────────────────────────────────────────
const MONTEA_DEFAULT = { r: 30, g: 45, b: 107 };

function loadMonteaRef() {
  try {
    const s = localStorage.getItem("sc_montea_color");
    if (s) return JSON.parse(s);
  } catch {}
  return MONTEA_DEFAULT;
}

// ─── EXIF GPS desde foto ──────────────────────────────────────────────────────
// Extrae GPS, fecha y dispositivo del EXIF embebido en la imagen.
// Usa exifr (lazy import para no inflar el bundle inicial).
async function extractExif(file) {
  try {
    const exifr = (await import("exifr")).default;
    const d = await exifr.parse(file, {
      gps: true,
      translateValues: true,
      pick: ["DateTimeOriginal", "Make", "Model"],
    }) || {};
    return {
      gps: (d.latitude != null && d.longitude != null) ? {
        lat: d.latitude.toFixed(6),
        lon: d.longitude.toFixed(6),
        alt: d.altitude != null ? d.altitude.toFixed(1) + "m" : "N/A",
      } : null,
      datetime: d.DateTimeOriginal
        ? new Date(d.DateTimeOriginal).toLocaleString("es")
        : null,
      device: [d.Make, d.Model].filter(Boolean).join(" ") || null,
    };
  } catch {
    return { gps: null, datetime: null, device: null };
  }
}

// ─── PDF ──────────────────────────────────────────────────────────────────────
function buildPDFHtml(proj, code, date, layers, imgUrl, meta, notes, calibInfo) {
  const now      = new Date().toLocaleString("es");
  const isIOS    = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const closeAct = isIOS ? "history.back()" : "window.close()";
  const gps      = meta?.gps;

  const notesRows = layers.map((l, i) => {
    const n = notes?.[i] || "";
    return n
      ? `<tr><td style="color:#8B6914;font-weight:900;font-size:9px">${l.pos}</td><td style="font-size:7px;color:#555;padding:3px 5px">${n}</td></tr>`
      : "";
  }).join("");
  const hasNotes = layers.some((_, i) => notes?.[i]);

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SC·${proj}·${code}</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Courier New',monospace;padding:14px;font-size:8px;print-color-adjust:exact;-webkit-print-color-adjust:exact}
.topbar{position:fixed;top:0;left:0;right:0;background:#111;padding:10px 16px;display:flex;gap:10px;z-index:999;box-shadow:0 2px 8px rgba(0,0,0,.4)}
.topbar button{font-family:monospace;font-size:12px;padding:8px 18px;border:none;border-radius:3px;cursor:pointer;font-weight:700}
.btn-print{background:#c8a96e;color:#111}.btn-close{background:#555;color:#fff}
.content{margin-top:52px}
.hdr{display:flex;justify-content:space-between;border-bottom:2.5px solid #111;padding-bottom:10px;margin-bottom:10px}
.brand{font-size:20px;font-weight:300}.brand b{color:#8B6914}.info{text-align:right;font-size:7px;line-height:2;color:#555}
.mbox{display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin-bottom:8px;padding:6px 8px;background:#f9f7f2;border:1px solid #e8e0d0}
.mt{color:#aaa;text-transform:uppercase;letter-spacing:.07em;font-size:5.5px;margin-bottom:1px}.mv{color:#333;font-weight:700;font-size:7px}
.gps{grid-column:1/-1;background:#eef2ff;padding:4px 6px;font-size:6.5px;color:#224}
.calib{grid-column:1/-1;background:#fff8e6;padding:4px 6px;font-size:6.5px;color:#664;border-top:1px solid #e8d8a0}
.strip{display:flex;height:20px;overflow:hidden;border:1px solid #ddd;margin-bottom:8px}.strip div{flex:1}
.body{display:grid;grid-template-columns:${imgUrl ? "110px 1fr" : "1fr"};gap:10px}
img.foto{width:100%;border:1px solid #ddd;object-fit:contain}
table{width:100%;border-collapse:collapse;font-size:7px}
th{background:#111;color:#fff;padding:3.5px 5px;text-align:left;font-size:6px;white-space:nowrap}
td{padding:3px 5px;border-bottom:1px solid #f0ece4;vertical-align:middle}
tr:nth-child(even) td{background:#faf8f4}
.sw{display:inline-block;width:22px;height:22px;border-radius:2px;border:1px solid rgba(0,0,0,.12);vertical-align:middle}
.lnum{font-weight:900;color:#8B6914;font-size:10px}.hex{color:#8B6914;font-weight:700}.ncs{color:#003880}.amer{color:#0044aa;font-size:6px}
.notes-section{margin-top:8px;padding-top:6px;border-top:1px dashed #ddd}
.notes-section h4{font-size:6px;color:#aaa;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px}
.footer{margin-top:8px;padding-top:5px;border-top:1px solid #eee;font-size:5.5px;color:#aaa;display:flex;justify-content:space-between}
@media print{.topbar{display:none}.content{margin-top:0}@page{margin:7mm;size:A4}}
</style></head><body>
<div class="topbar">
  <button class="btn-print" onclick="window.print()">🖨 Imprimir / PDF</button>
  <button class="btn-close" onclick="${closeAct}">← Volver</button>
</div>
<div class="content">
<div class="hdr">
  <div><div class="brand">STRATA<b>CHROMA</b></div><div style="font-size:6px;color:#aaa">FICHA TÉCNICA · CALA ESTRATIGRÁFICA · v22</div></div>
  <div class="info">Proyecto: <b>${proj}</b><br>Código: <b style="color:#8B6914">${code}</b><br>${date} · ${layers.length} capas<br>${now}</div>
</div>
<div class="mbox">
  <div><div class="mt">Resolución</div><div class="mv">${meta?.size || "—"}</div></div>
  <div><div class="mt">Fecha foto</div><div class="mv">${meta?.datetime || "—"}</div></div>
  <div><div class="mt">Dispositivo</div><div class="mv">${meta?.device || "—"}</div></div>
  ${gps
    ? `<div class="gps">📍 Lat: <b>${gps.lat}</b> &nbsp; Lon: <b>${gps.lon}</b> &nbsp; Alt: <b>${gps.alt}</b> &nbsp; <span style="color:#aaa">(EXIF)</span></div>`
    : `<div class="gps" style="color:#aaa">📍 GPS no disponible en esta foto</div>`
  }
  ${calibInfo ? `<div class="calib">⚖ Calibración MONTEA_COLOR · Ref: ${calibInfo.refHex} · Medido: ${calibInfo.measHex} · ΔL:${calibInfo.dL} Δa:${calibInfo.da} Δb:${calibInfo.db}</div>` : ""}
</div>
<div class="strip">${layers.map(l => `<div style="background:${l.hex}"></div>`).join("")}</div>
<div class="body">
${imgUrl ? `<div><img class="foto" src="${imgUrl}" alt="Cala"/></div>` : ""}
<div><table>
<tr><th>#</th><th>Muestra</th><th>Nombre</th><th>HEX</th><th>NCS</th><th>RAL</th><th>American Colors</th><th>RGB</th></tr>
${layers.map(l => {
  const rgb = l.rgb || { r:128, g:128, b:128 };
  const lum = (rgb.r*299+rgb.g*587+rgb.b*114)/1000, fg = lum>140?"#111":"#fff";
  return `<tr><td class="lnum">${l.pos}</td><td><div class="sw" style="background:${l.hex};display:flex;align-items:center;justify-content:center"><span style="color:${fg};font-size:4.5px;font-family:monospace;font-weight:700">${l.hex}</span></div></td><td style="font-weight:600;white-space:nowrap">${l.name}</td><td class="hex">${l.hex}</td><td class="ncs">${l.ncs}</td><td style="font-size:6.5px;white-space:nowrap">${l.ral} <span style="color:#bbb;font-size:5px">ΔE${l.ralDE}</span></td><td class="amer">${l.american}</td><td style="font-size:6px">${rgb.r},${rgb.g},${rgb.b}</td></tr>`;
}).join("")}
</table>
${hasNotes ? `<div class="notes-section"><h4>Observaciones de campo</h4><table><tr><th>#</th><th>Nota</th></tr>${notesRows}</table></div>` : ""}
</div>
</div>
<div class="footer"><span>STRATACHROMA v22 · MC 1M P50 CIE-LAB · NCS · RAL · HEX · American Colors · MONTEA_COLOR</span><span>${now}</span></div>
</div></body></html>`;
}

function openPDF(proj, code, date, layers, imgUrl, meta, notes, calibInfo) {
  const html = buildPDFHtml(proj, code, date, layers, imgUrl, meta, notes, calibInfo);
  window.open(URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" })), "_blank");
}

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const GOLD = "#c8a96e";
const BG   = "#0d0c0a";
const TEXT  = "#e8e4d4";
const TEXT2 = "#a09070";
const MUTED = "#666";
const BORDER      = "rgba(255,255,255,.1)";
const BORDER_GOLD = "rgba(200,169,110,.35)";

const btn = (active, small) => ({
  background: active ? "rgba(200,169,110,.14)" : "rgba(255,255,255,.05)",
  border: `1px solid ${active ? BORDER_GOLD : BORDER}`,
  color: active ? GOLD : TEXT2,
  padding: small ? "8px 16px" : "12px 24px",
  fontFamily: "'Courier New',monospace",
  fontSize: small ? 10 : 11,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  cursor: "pointer",
  borderRadius: 3,
  transition: "all .15s",
  lineHeight: 1,
  WebkitTapHighlightColor: "transparent",
});

const inp = {
  width: "100%",
  background: "rgba(255,255,255,.07)",
  border: `1px solid ${BORDER}`,
  color: TEXT,
  padding: "14px 16px",
  fontFamily: "'Courier New',monospace",
  fontSize: 17,
  borderRadius: 3,
  outline: "none",
  WebkitAppearance: "none",
};

const lbl = {
  display: "block",
  fontSize: 10,
  color: MUTED,
  fontFamily: "monospace",
  letterSpacing: ".12em",
  textTransform: "uppercase",
  marginBottom: 7,
};

// ─── HEADER ───────────────────────────────────────────────────────────────────
const Hdr = memo(({ back }) => (
  <div style={{ borderBottom: `1px solid ${BORDER}`, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", background: BG }}>
    <div>
      <div style={{ fontSize: 9, color: MUTED, fontFamily: "monospace", letterSpacing: "0.14em", marginBottom: 2 }}>
        STRATACHROMA · v22 · MC 1M P50 CIE-LAB · EXIF · MONTEA_COLOR
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 300, color: TEXT, margin: 0, letterSpacing: ".05em" }}>
        STRATA<span style={{ color: GOLD }}>CHROMA</span>
      </h1>
    </div>
    {back && <button style={btn(false, true)} onClick={back}>← Inicio</button>}
  </div>
));

// ─── MODAL DOCUMENTACIÓN ─────────────────────────────────────────────────────
// Motor de voz:
//   - continuous:false + auto-restart (más fiable que continuous:true en móviles)
//   - listen.current = fn() pattern: siempre referencia la función fresca,
//     sin closures stale ni useEffect extra
//   - interimResults:true → texto en tiempo real mientras hablas
//   - Sin alert() — errores como estado inline
const LayerDocModal = memo(({ layer, layerIndex, initialNote, onSave, onClose }) => {
  const [note,      setNote]      = useState(initialNote || "");
  const [interim,   setInterim]   = useState("");
  const [recording, setRecording] = useState(false);
  const [micError,  setMicError]  = useState(null);

  const recRef    = useRef(null);
  const activeRef = useRef(false);
  const timerRef  = useRef(null);

  // listen.current siempre apunta a la función más reciente (no stale)
  const listen = useRef(null);
  listen.current = () => {
    if (!activeRef.current) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const rec = new SR();
    rec.lang           = "es-ES";
    rec.continuous     = false;  // más compatible en iOS/Android
    rec.interimResults = true;   // texto en tiempo real

    rec.onresult = ev => {
      let fin = "", tmp = "";
      for (let i = 0; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) fin += ev.results[i][0].transcript;
        else                        tmp += ev.results[i][0].transcript;
      }
      if (fin.trim()) {
        setNote(n => n ? n.trimEnd() + " " + fin.trim() : fin.trim());
        setInterim("");
      } else {
        setInterim(tmp);
      }
    };

    rec.onend = () => {
      setInterim("");
      if (activeRef.current) {
        timerRef.current = setTimeout(() => listen.current?.(), 250);
      } else {
        setRecording(false);
      }
    };

    rec.onerror = ev => {
      // "no-speech" y "aborted" son normales — onend reiniciará
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        activeRef.current = false;
        setRecording(false);
        setMicError("Micrófono bloqueado — toca el icono 🔒 en tu navegador y permite el acceso, luego vuelve a intentarlo.");
      }
      // Otros errores: onend ya reiniciará
    };

    recRef.current = rec;
    try { rec.start(); } catch {
      timerRef.current = setTimeout(() => listen.current?.(), 400);
    }
  };

  const startRec = () => {
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
      setMicError("Dictado no disponible en este navegador. Usa Chrome o Safari.");
      return;
    }
    setMicError(null);
    activeRef.current = true;
    setRecording(true);
    listen.current();
  };

  const stopRec = () => {
    activeRef.current = false;
    clearTimeout(timerRef.current);
    setInterim("");
    try { recRef.current?.abort(); } catch {}
    recRef.current = null;
    setRecording(false);
  };

  useEffect(() => () => {
    activeRef.current = false;
    clearTimeout(timerRef.current);
    try { recRef.current?.abort(); } catch {}
  }, []);

  const { r, g, b } = layer.rgb;
  const lum = (r * 299 + g * 587 + b * 114) / 1000;
  const fg  = lum > 140 ? "#111" : "#fff";

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.88)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) { stopRec(); onClose(); } }}>
      <div style={{ background: "#141210", border: `1px solid ${BORDER_GOLD}`, borderRadius: "12px 12px 0 0", width: "100%", maxWidth: 560, padding: "24px 20px 36px", maxHeight: "85vh", overflowY: "auto" }}>

        {/* Chip de color + info de capa */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <div style={{ width: 52, height: 52, background: layer.hex, borderRadius: 6, border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ color: fg, fontSize: 5.5, fontFamily: "monospace", fontWeight: 700, writingMode: "vertical-rl", transform: "rotate(180deg)" }}>{layer.hex}</span>
          </div>
          <div>
            <div style={{ fontSize: 10, color: GOLD, fontFamily: "monospace", letterSpacing: ".1em" }}>CAPA {layer.pos}</div>
            <div style={{ fontSize: 13, color: TEXT, fontFamily: "monospace", fontWeight: 600 }}>{layer.name}</div>
            <div style={{ fontSize: 9, color: TEXT2, fontFamily: "monospace" }}>{layer.ncs} · {layer.ral?.split(" — ")[0]}</div>
          </div>
          <button onClick={() => { stopRec(); onClose(); }} style={{ marginLeft: "auto", background: "none", border: "none", color: MUTED, fontSize: 20, cursor: "pointer", padding: "0 4px" }}>✕</button>
        </div>

        {/* Texto observaciones */}
        <label style={lbl}>Observaciones de campo</label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Describe esta capa: material, estado, época, intervenciones previas…"
          rows={5}
          style={{ ...inp, fontSize: 14, resize: "vertical", lineHeight: 1.6 }}
        />

        {/* Transcripción en tiempo real */}
        {interim && (
          <div style={{ marginTop: 6, padding: "6px 10px", background: "rgba(200,169,110,.06)", border: `1px solid ${BORDER_GOLD}`, borderRadius: 3, fontSize: 12, color: TEXT2, fontFamily: "monospace", fontStyle: "italic" }}>
            {interim}…
          </div>
        )}

        {/* Error de micrófono (inline, sin alert) */}
        {micError && (
          <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(180,60,60,.1)", border: "1px solid rgba(180,60,60,.3)", borderRadius: 3, fontSize: 9, color: "#e07870", fontFamily: "monospace", lineHeight: 1.6 }}>
            ⚠ {micError}
          </div>
        )}

        {/* Controles de voz */}
        <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={recording ? stopRec : startRec}
            style={{
              ...btn(recording, false),
              padding: "12px 20px",
              fontSize: 11,
              minWidth: 150,
              background: recording ? "rgba(180,60,60,.2)" : "rgba(255,255,255,.05)",
              borderColor: recording ? "rgba(220,80,80,.5)" : BORDER,
              color: recording ? "#e07070" : TEXT2,
            }}>
            {recording ? "⏹ Detener voz" : "🎙 Dictar nota"}
          </button>
          {recording && (
            <span style={{ fontSize: 9, color: "#e07070", fontFamily: "monospace", animation: "blink 1s ease-in-out infinite" }}>
              ● Escuchando…
            </span>
          )}
          {note && !recording && (
            <button onClick={() => setNote("")} style={{ ...btn(false, true), fontSize: 9 }}>✕ Limpiar</button>
          )}
        </div>

        {/* Guardar / Cancelar */}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button
            onClick={() => { stopRec(); onSave(layerIndex, note.trim()); onClose(); }}
            style={{ ...btn(true), flex: 1, padding: "14px", fontSize: 12 }}>
            ✓ Guardar nota
          </button>
          <button onClick={() => { stopRec(); onClose(); }} style={{ ...btn(false), padding: "14px 20px", fontSize: 11 }}>
            Cancelar
          </button>
        </div>
      </div>
      <style>{`@keyframes blink{0%,100%{opacity:.4}50%{opacity:1}}`}</style>
    </div>
  );
});

// ─── FILA DE CAPA ─────────────────────────────────────────────────────────────
const LayerRow = memo(({ layer, layerIndex, onCopy, copied, hasNote, onOpenNote }) => {
  const { r, g, b } = layer.rgb;
  const lum = (r * 299 + g * 587 + b * 114) / 1000;
  const fg  = lum > 140 ? "#111" : "#fff";
  return (
    <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
      <td style={{ padding: "10px 6px 10px 10px", color: GOLD, fontWeight: 900, fontSize: 15, width: 26, textAlign: "center", verticalAlign: "middle" }}>{layer.pos}</td>
      <td style={{ padding: "10px 6px", width: 46, verticalAlign: "middle" }}>
        <div
          onClick={() => onOpenNote(layerIndex)}
          title={hasNote ? "Nota guardada — toca para editar" : "Toca para documentar esta capa"}
          style={{ position: "relative", width: 38, height: 38, background: layer.hex, borderRadius: 4, border: `2px solid ${hasNote ? "rgba(80,200,120,.6)" : "rgba(200,100,50,.5)"}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: fg, fontSize: 4.5, fontFamily: "monospace", fontWeight: 700, writingMode: "vertical-rl", transform: "rotate(180deg)", opacity: .8 }}>{layer.hex}</span>
          <div style={{ position: "absolute", top: -5, right: -5, width: 12, height: 12, borderRadius: "50%", background: hasNote ? "#4cc87a" : "#e07840", border: `2px solid ${BG}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 6, color: "#fff", fontWeight: 900, lineHeight: 1 }}>{hasNote ? "✓" : "!"}</span>
          </div>
        </div>
      </td>
      <td style={{ padding: "10px 10px 10px 4px", verticalAlign: "middle" }}>
        <div style={{ fontSize: 10, color: TEXT, fontWeight: 600, marginBottom: 3, lineHeight: 1.3 }}>{layer.name}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 8.5, color: GOLD, fontWeight: 700, cursor: "pointer" }} onClick={() => onCopy(layer.hex)}>
            {copied === layer.hex ? "✓ copiado" : layer.hex}
          </span>
          <span style={{ fontSize: 8, color: "#5090d0" }}>{layer.ncs}</span>
          <span style={{ fontSize: 7.5, color: TEXT2 }}>{layer.ral} <span style={{ color: MUTED, fontSize: 7 }}>ΔE{layer.ralDE}</span></span>
          <span style={{ fontSize: 7.5, color: "#5580bb" }}>{layer.american}</span>
        </div>
      </td>
    </tr>
  );
});

// ─── PANTALLA DE PERMISO DE MICRÓFONO ────────────────────────────────────────
const MicPermissionScreen = memo(({ onAuthorize }) => (
  <div style={{
    minHeight: "100vh", background: BG, color: TEXT,
    fontFamily: "Georgia,serif", display: "flex", flexDirection: "column"
  }}>
    <div style={{ borderBottom: `1px solid ${BORDER}`, padding: "14px 20px", background: BG }}>
      <div style={{ fontSize: 9, color: MUTED, fontFamily: "monospace", letterSpacing: "0.14em", marginBottom: 2 }}>
        STRATACHROMA · v22 · MC 1M P50 CIE-LAB · EXIF · MONTEA_COLOR
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 300, color: TEXT, margin: 0, letterSpacing: ".05em" }}>
        STRATA<span style={{ color: GOLD }}>CHROMA</span>
      </h1>
    </div>
    <div style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 24px"
    }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: "rgba(200,169,110,.08)", border: `1px solid ${BORDER_GOLD}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 24px"
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </div>
        <div style={{
          fontSize: 10, color: GOLD, fontFamily: "monospace",
          letterSpacing: ".15em", textAlign: "center", marginBottom: 20
        }}>
          ACCESO AL MICRÓFONO
        </div>
        <div style={{
          fontSize: 15, color: TEXT, fontFamily: "monospace",
          lineHeight: 1.8, marginBottom: 12, textAlign: "center"
        }}>
          Esta app usa el micrófono únicamente para el dictado de voz.
        </div>
        <div style={{
          fontSize: 11, color: TEXT2, fontFamily: "monospace",
          lineHeight: 1.9, marginBottom: 36, textAlign: "center",
          padding: "0 8px"
        }}>
          No se realiza ninguna grabación ni almacenamiento de audio.
          El micrófono se activa solo mientras dictás observaciones de campo en la documentación de capas.
        </div>
        <button
          onClick={onAuthorize}
          style={{
            ...btn(true),
            width: "100%", padding: "18px", fontSize: 12,
            letterSpacing: ".15em"
          }}
        >
          AUTORIZAR Y CONTINUAR
        </button>
      </div>
    </div>
  </div>
));

// ─── LAYOUT WRAPPER ───────────────────────────────────────────────────────────
const Wrap = ({ children, back }) => (
  <div style={{ minHeight: "100vh", background: BG, color: TEXT, fontFamily: "Georgia,serif", display: "flex", flexDirection: "column" }}>
    <Hdr back={back} />
    <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>{children}</div>
    <style>{`
      ::-webkit-scrollbar{width:3px}
      ::-webkit-scrollbar-thumb{background:rgba(200,169,110,.2)}
      input,textarea{-webkit-tap-highlight-color:transparent;-webkit-appearance:none}
      @keyframes pulse{0%,100%{opacity:.07}50%{opacity:.7}}
    `}</style>
  </div>
);

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [scr, setScr] = useState(() => {
    try {
      return localStorage.getItem("sc_mic_consent") ? "home" : "mic-permission";
    } catch {
      return "mic-permission";
    }
  });

  useEffect(() => {
    const el = document.getElementById("splash");
    if (el) el.style.display = "none";
  }, []);
  const projRef = useRef(""), codeRef = useRef("");
  const [projD, setProjD] = useState(""), [codeD, setCodeD] = useState("");
  const [imgData, setImgData]   = useState(null);
  const [layers, setLayers]     = useState([]);
  const [status, setStatus]     = useState(""), [err, setErr] = useState(null);
  const [copied, setCopied]     = useState(null);
  const fRef = useRef(), cRef = useRef(), imgFileRef = useRef(null);
  const [imgMeta, setImgMeta]   = useState(null); // incluye .gps desde EXIF
  const today = new Date().toISOString().slice(0, 10);

  const [layerNotes, setLayerNotes]           = useState({});
  const [activeNoteLayer, setActiveNoteLayer] = useState(null);

  const [monteaRef, setMonteaRef]   = useState(loadMonteaRef);
  const [measHex, setMeasHex]       = useState("#1e2d6b");
  const [calibActive, setCalibActive] = useState(false);
  const [showCalib, setShowCalib]   = useState(false);
  const [editingRef, setEditingRef] = useState(false);

  const handleMicAuthorize = async () => {
    localStorage.setItem("sc_mic_consent", "granted");
    try {
      const stream = await navigator.mediaDevices?.getUserMedia({ audio: true });
      stream?.getTracks().forEach(t => t.stop());
    } catch {}
    setScr("home");
  };

  const refHex = useMemo(() => rgbToHex(monteaRef), [monteaRef]);

  const activeLayers = useMemo(() => {
    if (!calibActive) return layers;
    const h2r = h => { const v = parseInt(h.replace("#",""),16); return {r:(v>>16)&255,g:(v>>8)&255,b:v&255}; };
    const meas   = h2r(measHex);
    const refLAB = rgbToLab(monteaRef.r, monteaRef.g, monteaRef.b);
    const mLAB   = rgbToLab(meas.r, meas.g, meas.b);
    const dL = refLAB[0]-mLAB[0], da = refLAB[1]-mLAB[1], db = refLAB[2]-mLAB[2];
    return layers.map(layer => {
      const lab = layer.lab || {L:50,a:0,b:0};
      const cr  = labToRgb(lab.L+dL, lab.a+da, lab.b+db);
      return enrichLayer({...layer, rgb:cr, hex:rgbToHex(cr), lab:{L:lab.L+dL,a:lab.a+da,b:lab.b+db}});
    });
  }, [layers, calibActive, measHex, monteaRef]);

  const calibInfo = useMemo(() => {
    if (!calibActive) return null;
    const h2r = h => { const v = parseInt(h.replace("#",""),16); return {r:(v>>16)&255,g:(v>>8)&255,b:v&255}; };
    const meas   = h2r(measHex);
    const refLAB = rgbToLab(monteaRef.r, monteaRef.g, monteaRef.b);
    const mLAB   = rgbToLab(meas.r, meas.g, meas.b);
    return { refHex, measHex, dL:(refLAB[0]-mLAB[0]).toFixed(1), da:(refLAB[1]-mLAB[1]).toFixed(1), db:(refLAB[2]-mLAB[2]).toFixed(1) };
  }, [calibActive, measHex, monteaRef, refHex]);

  const allDocumented = useMemo(() =>
    activeLayers.length > 0 && activeLayers.every((_, i) => (layerNotes[i]||"").trim().length > 0),
    [activeLayers, layerNotes]);

  const docCount = useMemo(() =>
    activeLayers.filter((_, i) => (layerNotes[i]||"").trim().length > 0).length,
    [activeLayers, layerNotes]);

  const reset = () => {
    setImgData(null); setLayers([]); setStatus(""); setErr(null);
    setCopied(null); setImgMeta(null); imgFileRef.current = null;
    setLayerNotes({}); setActiveNoteLayer(null);
    setCalibActive(false); setShowCalib(false);
  };

  const home     = () => { setScr("home"); reset(); };
  const copyVal  = v => { navigator.clipboard?.writeText(v); setCopied(v); setTimeout(()=>setCopied(null),1500); };
  const saveNote = (idx, text) => setLayerNotes(prev => ({...prev,[idx]:text}));

  // ── Carga de imagen + extracción EXIF (GPS, fecha, dispositivo) ──────────────
  const pick = useCallback(async file => {
    if (!file?.type.startsWith("image/")) { setErr("El archivo no es una imagen"); return; }
    setErr(null); setStatus("Leyendo…"); imgFileRef.current = file;

    // Extraer EXIF (paralelo con lectura del archivo)
    const exif = await extractExif(file);

    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        setImgMeta({
          size:     `${img.width}×${img.height}px`,
          datetime: exif.datetime || new Date(file.lastModified).toLocaleString("es"),
          device:   exif.device   || navigator.userAgent.match(/\(([^)]+)\)/)?.[1]?.split(";")?.[1]?.trim() || navigator.platform || "—",
          filename: file.name,
          filesize: `${(file.size/1024).toFixed(1)} KB`,
          gps:      exif.gps, // null si la foto no tiene GPS en EXIF
        });
      };
      img.src = ev.target.result;
      setImgData({ url:ev.target.result, b64:ev.target.result.split(",")[1], mime:file.type, file });
      setStatus("✓ Lista");
    };
    reader.readAsDataURL(file);
  }, []);

  const analyze = async () => {
    setScr("analyzing"); setErr(null); setLayers([]); setLayerNotes({}); setCalibActive(false);
    try {
      const raw = await analyzeImage(imgData.file, setStatus);
      setLayers(raw.map(enrichLayer));
      setScr("result");
    } catch (e) {
      setErr(e.message);
      setScr("capture");
    }
  };

  const dlPDF = () => {
    if (!allDocumented) {
      const m = activeLayers.map((_,i)=>(layerNotes[i]||"").trim()?null:i+1).filter(Boolean);
      alert(`⚠ Documenta todas las capas antes de exportar.\nFaltan: ${m.join(", ")}`);
      return;
    }
    const p = projRef.current||projD, c = codeRef.current||codeD;
    openPDF(p, c, today, activeLayers, imgData?.url, imgMeta, layerNotes, calibInfo);
  };

  const dlCSV = () => {
    if (!allDocumented) {
      const m = activeLayers.map((_,i)=>(layerNotes[i]||"").trim()?null:i+1).filter(Boolean);
      alert(`⚠ Documenta todas las capas antes de exportar.\nFaltan: ${m.join(", ")}`);
      return;
    }
    const p   = projRef.current||projD, c = codeRef.current||codeD;
    const gps = imgMeta?.gps;
    const csv = [
      `# STRATACHROMA v22 | ${p} | ${c} | ${today}`,
      gps
        ? `# GPS (EXIF): Lat:${gps.lat} Lon:${gps.lon} Alt:${gps.alt}`
        : `# GPS: no disponible en esta foto`,
      calibInfo ? `# MONTEA_COLOR: Ref ${calibInfo.refHex} / Medido ${calibInfo.measHex} / ΔL${calibInfo.dL} Δa${calibInfo.da} Δb${calibInfo.db}` : "",
      "Capa,Nombre,HEX,NCS,RAL,dE,American,R,G,B,Notas",
      ...activeLayers.map((l,i)=>`${l.pos},"${l.name}",${l.hex},"${l.ncs}","${l.ral}",${l.ralDE},"${l.american}",${l.rgb.r},${l.rgb.g},${l.rgb.b},"${(layerNotes[i]||"").replace(/"/g,"'")}"`)
    ].filter(Boolean).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}));
    a.download = `${p}_${c}_${today}.csv`;
    a.click();
  };

  // ── MIC PERMISSION ──────────────────────────────────────────────────────────
  if (scr === "mic-permission") return (
    <MicPermissionScreen onAuthorize={handleMicAuthorize} />
  );

  // ── HOME ────────────────────────────────────────────────────────────────────
  if (scr === "home") return (
    <Wrap>
      <div style={{ padding: "40px 24px", maxWidth: 460 }}>
        <div style={{ fontFamily: "monospace", marginBottom: 40, lineHeight: 2 }}>
          <div style={{ fontSize: 12, color: TEXT2 }}>Análisis estratigráfico de calas de pintura</div>
          <div style={{ fontSize: 10, color: GOLD, marginTop: 4 }}>✦ MC 1,000,000 · P50 CIE-LAB · GPS desde EXIF</div>
          <div style={{ fontSize: 10, color: "#6699cc", marginTop: 2 }}>NCS · RAL · HEX · American Colors</div>
          <div style={{ fontSize: 10, color: TEXT2, marginTop: 2 }}>PDF · CSV · MONTEA_COLOR · Notas de voz</div>
        </div>
        <button style={{ ...btn(true), padding: "16px 28px", fontSize: 12 }} onClick={() => setScr("meta")}>
          + Nueva Cala
        </button>
      </div>
    </Wrap>
  );

  // ── META ────────────────────────────────────────────────────────────────────
  if (scr === "meta") return (
    <Wrap back={home}>
      <div style={{ padding: "28px 24px", maxWidth: 460 }}>
        <div style={{ fontSize: 10, color: GOLD, fontFamily: "monospace", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 24 }}>Nueva Cala</div>
        <div style={{ marginBottom: 20 }}>
          <label style={lbl}>Proyecto / Edificio</label>
          <input type="text" defaultValue={projD} placeholder="Ej: Iglesia_Central" style={inp}
            autoComplete="off" autoCorrect="off" spellCheck={false}
            onChange={e => projRef.current = e.target.value.trim()}
            onBlur={e => { projRef.current = e.target.value.trim(); setProjD(e.target.value.trim()); }} />
        </div>
        <div style={{ marginBottom: 28 }}>
          <label style={lbl}>Código de Cala</label>
          <input type="text" defaultValue={codeD} placeholder="Ej: CAL-01-A" style={inp}
            autoComplete="off" autoCorrect="off" spellCheck={false}
            onChange={e => codeRef.current = e.target.value.trim()}
            onBlur={e => { codeRef.current = e.target.value.trim(); setCodeD(e.target.value.trim()); }} />
        </div>
        <button style={{ ...btn(true), width: "100%", padding: "15px", fontSize: 12 }}
          onClick={() => {
            const p = projRef.current||projD, c = codeRef.current||codeD;
            if (p && c) setScr("capture");
            else alert("Completa los dos campos");
          }}>
          → Continuar
        </button>
      </div>
    </Wrap>
  );

  // ── CAPTURE ─────────────────────────────────────────────────────────────────
  if (scr === "capture") return (
    <Wrap back={() => setScr("meta")}>
      <div style={{ padding: "20px 24px", maxWidth: 560 }}>
        <div style={{ fontSize: 10, color: TEXT2, fontFamily: "monospace", marginBottom: 16 }}>
          <span style={{ color: GOLD }}>{projRef.current||projD}</span> / {codeRef.current||codeD}
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <button style={btn(false, true)} onClick={() => fRef.current?.click()}>📁 Archivo</button>
          <button style={btn(false, true)} onClick={() => cRef.current?.click()}>📷 Cámara</button>
          {imgData && <button style={btn(false, true)} onClick={() => { setImgData(null); setStatus(""); setImgMeta(null); imgFileRef.current=null; }}>✕ Quitar</button>}
        </div>

        <input ref={fRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e=>pick(e.target.files[0])} />
        <input ref={cRef} type="file" accept="image/*" capture="environment" style={{ display:"none" }} onChange={e=>pick(e.target.files[0])} />

        {!imgData && (
          <div
            onClick={() => fRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}
            style={{ border:`1px dashed ${BORDER}`, borderRadius:6, padding:"60px 20px", textAlign:"center", cursor:"pointer", color:MUTED, fontFamily:"monospace", fontSize:12, marginBottom:16 }}>
            Arrastra imagen de cala aquí
            <div style={{ fontSize:10, marginTop:10, color:TEXT2 }}>MC 1M P50 CIE-LAB</div>
          </div>
        )}

        {imgData && (
          <div style={{ marginBottom:16 }}>
            <img src={imgData.url} alt="" style={{ maxWidth:"100%", maxHeight:480, objectFit:"contain", borderRadius:4, border:`1px solid ${BORDER}`, display:"block" }} />
            {imgMeta && (
              <div style={{ marginTop:10, padding:"10px 14px", background:"rgba(200,169,110,.04)", border:`1px solid ${BORDER_GOLD}`, borderRadius:3, fontFamily:"monospace", fontSize:9, color:TEXT2, lineHeight:2 }}>
                <span style={{color:GOLD}}>✦</span> {imgMeta.filename} · {imgMeta.filesize} · {imgMeta.size}<br/>
                {imgMeta.datetime}
                {imgMeta.gps
                  ? <span style={{color:"#4cc87a"}}> · 📍 {imgMeta.gps.lat}, {imgMeta.gps.lon}</span>
                  : <span style={{color:MUTED}}> · Sin GPS en EXIF</span>
                }
              </div>
            )}
          </div>
        )}

        {status && <div style={{ padding:"10px 14px", background:"rgba(200,169,110,.04)", border:`1px solid ${BORDER_GOLD}`, borderRadius:3, fontSize:10, color:GOLD, fontFamily:"monospace", marginBottom:12 }}>{status}</div>}
        {err    && <div style={{ padding:12, background:"rgba(180,60,60,.08)", border:"1px solid rgba(180,60,60,.2)", borderRadius:3, fontSize:10, color:"#c87a7a", fontFamily:"monospace", marginBottom:12 }}>⚠ {err}</div>}

        <button style={{ ...btn(true), width:"100%", padding:16, fontSize:12, opacity:imgData?1:.4 }}
          onClick={() => { if (imgData) analyze(); }}>
          → Analizar · MC 1M P50 CIE-LAB
        </button>
      </div>
    </Wrap>
  );

  // ── ANALYZING ───────────────────────────────────────────────────────────────
  if (scr === "analyzing") return (
    <div style={{ minHeight:"100vh", background:BG, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:22 }}>
      <div style={{ fontSize:11, color:TEXT2, fontFamily:"monospace", letterSpacing:"0.2em", textTransform:"uppercase" }}>
        Procesando estratigrafía
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:4, width:280 }}>
        {[...Array(14)].map((_,i) => (
          <div key={i} style={{ height:6, borderRadius:1, background:`rgba(200,169,110,${0.08+(i/14)*0.14})`, animation:`pulse 1.8s ease-in-out ${i*.11}s infinite` }} />
        ))}
      </div>
      {status && <div style={{ fontSize:10, color:GOLD, fontFamily:"monospace", textAlign:"center", maxWidth:380, lineHeight:2.2, padding:"0 24px" }}>{status}</div>}
    </div>
  );

  // ── RESULT ──────────────────────────────────────────────────────────────────
  if (scr === "result") {
    const p = projRef.current||projD, c = codeRef.current||codeD;
    const gps = imgMeta?.gps;
    return (
      <Wrap back={home}>
        <div style={{ padding:"16px 20px" }}>

          <div style={{ marginBottom:12 }}>
            <span style={{ fontSize:14, color:GOLD, fontFamily:"monospace", fontWeight:700 }}>{p}</span>
            <span style={{ fontSize:10, color:TEXT2, fontFamily:"monospace" }}> / {c}</span>
            <span style={{ fontSize:9, color:MUTED, fontFamily:"monospace" }}> · {activeLayers.length} capas · {today}</span>
          </div>

          {/* GPS desde EXIF */}
          {gps
            ? <div style={{ padding:"7px 12px", background:"rgba(0,100,50,.08)", border:"1px solid rgba(0,150,80,.2)", borderRadius:3, fontSize:9, fontFamily:"monospace", color:"#4cc87a", marginBottom:12 }}>
                📍 {gps.lat}, {gps.lon} · Alt: {gps.alt} <span style={{color:MUTED}}>(EXIF)</span>
              </div>
            : <div style={{ padding:"7px 12px", background:"rgba(255,255,255,.02)", border:`1px solid ${BORDER}`, borderRadius:3, fontSize:9, fontFamily:"monospace", color:MUTED, marginBottom:12 }}>
                📍 Sin GPS — la foto no tiene coordenadas EXIF
              </div>
          }

          {/* MONTEA_COLOR */}
          <div style={{ marginBottom:12, border:`1px solid ${BORDER_GOLD}`, borderRadius:4, overflow:"hidden" }}>
            <button onClick={() => setShowCalib(v=>!v)}
              style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:calibActive?"rgba(200,169,110,.08)":"rgba(255,255,255,.02)", border:"none", cursor:"pointer", textAlign:"left" }}>
              <div style={{ width:20, height:20, background:refHex, borderRadius:3, border:`1px solid ${BORDER}`, flexShrink:0 }} />
              <span style={{ fontSize:9, color:GOLD, fontFamily:"monospace", letterSpacing:".1em", textTransform:"uppercase" }}>MONTEA_COLOR</span>
              {calibActive && <span style={{ fontSize:8, color:"#4cc87a", fontFamily:"monospace", marginLeft:4 }}>● Activa</span>}
              <span style={{ fontSize:9, color:MUTED, marginLeft:"auto" }}>{showCalib?"▲":"▼"}</span>
            </button>
            {showCalib && (
              <div style={{ padding:"14px 16px", borderTop:`1px solid ${BORDER}`, background:"rgba(0,0,0,.25)" }}>
                <div style={{ fontSize:9, color:TEXT2, fontFamily:"monospace", marginBottom:12, lineHeight:1.9 }}>
                  El color de control MONTEA_COLOR corrige la variación de iluminación.<br/>
                  Indica cómo aparece este azul en tu foto para calibrar todas las capas.
                </div>
                <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:14, flexWrap:"wrap" }}>
                  <div>
                    <div style={{ fontSize:8, color:MUTED, fontFamily:"monospace", marginBottom:4 }}>COLOR REFERENCIA</div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <div style={{ width:32, height:32, background:refHex, borderRadius:4, border:`2px solid ${BORDER_GOLD}` }} />
                      <span style={{ fontSize:10, color:GOLD, fontFamily:"monospace", fontWeight:700 }}>{refHex.toUpperCase()}</span>
                      {editingRef ? (
                        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                          <input type="color" defaultValue={refHex}
                            onChange={e => {
                              const v = parseInt(e.target.value.replace("#",""),16);
                              const nr = {r:(v>>16)&255,g:(v>>8)&255,b:v&255};
                              setMonteaRef(nr); localStorage.setItem("sc_montea_color",JSON.stringify(nr));
                            }}
                            style={{ width:40, height:32, border:"none", borderRadius:3, cursor:"pointer", padding:2 }} />
                          <button onClick={()=>setEditingRef(false)} style={{ ...btn(false,true), fontSize:9 }}>OK</button>
                          <button onClick={()=>{ setMonteaRef(MONTEA_DEFAULT); localStorage.setItem("sc_montea_color",JSON.stringify(MONTEA_DEFAULT)); setEditingRef(false); }} style={{ ...btn(false,true), fontSize:9, color:TEXT2 }}>Reset</button>
                        </div>
                      ) : (
                        <button onClick={()=>setEditingRef(true)} style={{ ...btn(false,true), fontSize:9 }}>Cambiar</button>
                      )}
                    </div>
                  </div>
                  <div style={{ color:MUTED, fontSize:14 }}>→</div>
                  <div>
                    <div style={{ fontSize:8, color:MUTED, fontFamily:"monospace", marginBottom:4 }}>COLOR EN TU FOTO</div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <div style={{ width:32, height:32, background:measHex, borderRadius:4, border:`1px solid ${BORDER}` }} />
                      <input type="color" value={measHex} onChange={e=>setMeasHex(e.target.value)}
                        style={{ width:40, height:32, border:"none", borderRadius:3, cursor:"pointer", padding:2 }} />
                      <span style={{ fontSize:9, color:TEXT2, fontFamily:"monospace" }}>{measHex.toUpperCase()}</span>
                    </div>
                  </div>
                </div>
                {calibInfo && calibActive && (
                  <div style={{ padding:"6px 10px", background:"rgba(200,169,110,.06)", borderRadius:3, fontSize:8, fontFamily:"monospace", color:TEXT2, marginBottom:10 }}>
                    Corrección LAB: ΔL {calibInfo.dL} · Δa {calibInfo.da} · Δb {calibInfo.db}
                  </div>
                )}
                <div style={{ display:"flex", gap:10 }}>
                  {!calibActive
                    ? <button onClick={()=>setCalibActive(true)} style={{ ...btn(true,true), fontSize:10, padding:"10px 16px" }}>⚖ Aplicar calibración</button>
                    : <button onClick={()=>setCalibActive(false)} style={{ ...btn(false,true), fontSize:10, padding:"10px 16px", color:"#e07070", borderColor:"rgba(200,80,80,.3)" }}>✕ Desactivar</button>
                  }
                </div>
              </div>
            )}
          </div>

          {/* Progreso documentación */}
          <div style={{ marginBottom:12, padding:"10px 14px", background:allDocumented?"rgba(60,180,80,.07)":"rgba(200,169,110,.04)", border:`1px solid ${allDocumented?"rgba(60,180,80,.3)":BORDER_GOLD}`, borderRadius:4, display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:9, color:allDocumented?"#4cc87a":GOLD, fontFamily:"monospace", letterSpacing:".08em" }}>
                {allDocumented ? "✓ TODAS LAS CAPAS DOCUMENTADAS" : `DOCUMENTACIÓN · ${docCount}/${activeLayers.length} capas`}
              </div>
              <div style={{ fontSize:8, color:TEXT2, fontFamily:"monospace", marginTop:3 }}>
                {allDocumented ? "Listo para exportar PDF y CSV" : "Toca cada cuadrado de color para dictar o escribir observaciones"}
              </div>
            </div>
            <div style={{ display:"flex", gap:3, flexWrap:"wrap", maxWidth:80, justifyContent:"flex-end" }}>
              {activeLayers.map((_,i) => (
                <div key={i} onClick={()=>setActiveNoteLayer(i)}
                  style={{ width:10, height:10, borderRadius:"50%", background:(layerNotes[i]||"").trim()?"#4cc87a":"#e07840", cursor:"pointer", border:"1px solid rgba(0,0,0,.2)" }} />
              ))}
            </div>
          </div>

          {/* Franja de colores */}
          <div style={{ display:"flex", height:20, borderRadius:3, overflow:"hidden", marginBottom:12, border:`1px solid ${BORDER}` }}>
            {activeLayers.map((l,i) => <div key={i} style={{ flex:1, background:l.hex }} title={`C${l.pos}: ${l.name}`} />)}
          </div>
          <div style={{ fontSize:8, color:GOLD, fontFamily:"monospace", marginBottom:14 }}>
            ✦ MC 1M P50 CIE-LAB · {activeLayers.length} capas{calibActive?" · ⚖ MONTEA_COLOR calibrado":""}
            {copied && <span style={{ marginLeft:10 }}>✓ {copied}</span>}
          </div>

          {/* Foto */}
          {imgData && (
            <div style={{ marginBottom:14 }}>
              <img src={imgData.url} alt="" style={{ width:"100%", borderRadius:4, border:`1px solid ${BORDER}` }} />
              {imgMeta && (
                <div style={{ marginTop:6, fontSize:7, color:TEXT2, fontFamily:"monospace", lineHeight:2 }}>
                  <div>📐 {imgMeta.size}</div>
                  <div>📅 {imgMeta.datetime}</div>
                  {gps && <div style={{color:"#4cc87a"}}>📍 {gps.lat}, {gps.lon}</div>}
                  {layers[0]?.bgInfo && <div>💡 {layers[0].bgInfo}</div>}
                </div>
              )}
            </div>
          )}

          {/* Tabla */}
          <div style={{ marginBottom:16 }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ borderBottom:`1px solid ${BORDER}` }}>
                  {["#","Color · Doc","Descripción"].map(h=>(
                    <th key={h} style={{ padding:"6px 8px", textAlign:"left", fontSize:7.5, color:TEXT2, letterSpacing:".1em", textTransform:"uppercase", background:"rgba(200,169,110,.06)", fontWeight:400 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeLayers.map((l,i)=>(
                  <LayerRow key={i} layer={l} layerIndex={i} onCopy={copyVal} copied={copied}
                    hasNote={(layerNotes[i]||"").trim().length>0}
                    onOpenNote={setActiveNoteLayer} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Acciones */}
          <div style={{ borderTop:`1px solid ${BORDER}`, paddingTop:16, display:"flex", flexDirection:"column", gap:10 }}>
            <button style={{ ...btn(allDocumented,false), width:"100%", padding:"16px", fontSize:12 }} onClick={dlPDF}>
              {allDocumented ? "🖨 Exportar PDF" : `🖨 PDF  (faltan ${activeLayers.length-docCount} notas)`}
            </button>
            <div style={{ display:"flex", gap:10 }}>
              <button style={{ ...btn(false), flex:1, fontSize:10 }} onClick={dlCSV}>↓ CSV</button>
              <button style={{ ...btn(false), flex:1, fontSize:10 }} onClick={()=>setScr("capture")}>← Foto</button>
              <button style={{ ...btn(false), flex:1, fontSize:10 }} onClick={home}>⌂ Inicio</button>
            </div>
          </div>
        </div>

        {activeNoteLayer !== null && activeLayers[activeNoteLayer] && (
          <LayerDocModal
            layer={activeLayers[activeNoteLayer]}
            layerIndex={activeNoteLayer}
            initialNote={layerNotes[activeNoteLayer] || ""}
            onSave={saveNote}
            onClose={() => setActiveNoteLayer(null)}
          />
        )}
      </Wrap>
    );
  }

  return null;
}
