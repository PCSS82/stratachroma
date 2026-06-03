import { useState, useRef, useCallback, useEffect, memo, useMemo } from "react";
import { analyzeImage, rgbToLab } from "./motor.js";
import { enrichLayer } from "./colors.js";
import exifr from "exifr";

// ─── GPS (manual/fallback) ────────────────────────────────────────────────────
function getGPS() {
  return new Promise(res => {
    if (!navigator.geolocation) { res(null); return; }
    navigator.geolocation.getCurrentPosition(
      p => res({
        lat: p.coords.latitude.toFixed(6),
        lon: p.coords.longitude.toFixed(6),
        alt: p.coords.altitude ? p.coords.altitude.toFixed(1) + "m" : "N/A",
        acc: p.coords.accuracy ? p.coords.accuracy.toFixed(0) + "m" : "N/A",
      }),
      () => res(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

// ─── LAB → RGB ────────────────────────────────────────────────────────────────
function labToRgb(L, a, b) {
  const fy = (L + 16) / 116, fx = a / 500 + fy, fz = fy - b / 200;
  const cube = v => v ** 3 > 0.008856 ? v ** 3 : (v - 16 / 116) / 7.787;
  const x = cube(fx) * 0.95047, y = cube(fy), z = cube(fz) * 1.08883;
  const gam = c => c > 0.0031308 ? 1.055 * c ** (1 / 2.4) - 0.055 : 12.92 * c;
  const cl = c => Math.round(Math.max(0, Math.min(1, gam(c))) * 255);
  return {
    r: cl(x * 3.2406 + y * -1.5372 + z * -0.4986),
    g: cl(x * -0.9689 + y * 1.8758 + z * 0.0415),
    b: cl(x * 0.0557 + y * -0.2040 + z * 1.0570),
  };
}

function rgbToHex({ r, g, b }) {
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

const MONTEA_DEFAULT = { r: 30, g: 45, b: 107 };

function loadMonteaRef() {
  try {
    const s = localStorage.getItem("sc_montea_color");
    if (s) return JSON.parse(s);
  } catch {}
  return MONTEA_DEFAULT;
}

// ─── PDF ──────────────────────────────────────────────────────────────────────
function buildPDFHtml(proj, code, date, layers, imgUrl, meta, gps, notes, calibInfo) {
  const now = new Date().toLocaleString("es");
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const closeAction = isIOS ? "history.back()" : "window.close()";
  const notesRows = layers.map((l, i) => {
    const n = notes?.[i] || "";
    return n ? `<tr><td style="color:#8B6914;font-weight:900;font-size:9px">${l.pos}</td><td style="font-size:7px;color:#555;padding:3px 5px">${n}</td></tr>` : "";
  }).join("");
  const hasNotes = layers.some((_, i) => notes?.[i]);

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SC·${proj}·${code}</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Courier New',monospace;padding:14px;font-size:8px;print-color-adjust:exact;-webkit-print-color-adjust:exact}
.topbar{position:fixed;top:0;left:0;right:0;background:#111;padding:10px 16px;display:flex;gap:10px;z-index:999;box-shadow:0 2px 8px rgba(0,0,0,.4)}
.topbar button{font-family:monospace;font-size:12px;padding:8px 18px;border:none;border-radius:3px;cursor:pointer;font-weight:700}
.btn-print{background:#c8a96e;color:#111}
.btn-close{background:#555;color:#fff}
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
  <button class="btn-close" onclick="${closeAction}">← Volver</button>
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
  <div class="gps">📍 Lat: <b>${gps?.lat || "N/A"}</b> &nbsp; Lon: <b>${gps?.lon || "N/A"}</b> &nbsp; Alt: <b>${gps?.alt || "N/A"}</b> &nbsp; ${gps?.acc === "EXIF" ? "Fuente: <b>EXIF foto</b>" : `Precisión: <b>${gps?.acc || "N/A"}</b>`}</div>
  ${calibInfo ? `<div class="calib">⚖ Calibración MONTEA_COLOR activa · Ref: ${calibInfo.refHex} · Medido: ${calibInfo.measHex} · ΔL:${calibInfo.dL} Δa:${calibInfo.da} Δb:${calibInfo.db}</div>` : ""}
</div>
<div class="strip">${layers.map(l => `<div style="background:${l.hex}"></div>`).join("")}</div>
<div class="body">
${imgUrl ? `<div><img class="foto" src="${imgUrl}" alt="Cala"/></div>` : ""}
<div><table>
<tr><th>#</th><th>Muestra</th><th>Nombre</th><th>HEX</th><th>NCS</th><th>RAL</th><th>American Colors</th><th>RGB</th></tr>
${layers.map(l => {
  const rgb = l.rgb || { r: 128, g: 128, b: 128 };
  const lum = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000, fg = lum > 140 ? "#111" : "#fff";
  return `<tr><td class="lnum">${l.pos}</td><td><div class="sw" style="background:${l.hex};display:flex;align-items:center;justify-content:center"><span style="color:${fg};font-size:4.5px;font-family:monospace;font-weight:700">${l.hex}</span></div></td><td style="font-weight:600;white-space:nowrap">${l.name}</td><td class="hex">${l.hex}</td><td class="ncs">${l.ncs}</td><td style="font-size:6.5px;white-space:nowrap">${l.ral} <span style="color:#bbb;font-size:5px">ΔE${l.ralDE}</span></td><td class="amer">${l.american}</td><td style="font-size:6px">${rgb.r},${rgb.g},${rgb.b}</td></tr>`;
}).join("")}
</table>
${hasNotes ? `<div class="notes-section"><h4>Observaciones de campo</h4><table><tr><th>#</th><th>Nota</th></tr>${notesRows}</table></div>` : ""}
</div>
</div>
<div class="footer"><span>STRATACHROMA v22 · MC 1M P50 CIE-LAB · NCS · RAL · HEX · American Colors · MONTEA_COLOR · EXIF</span><span>${now}</span></div>
</div>
</body></html>`;
}

function openPDF(proj, code, date, layers, imgUrl, meta, gps, notes, calibInfo) {
  const html = buildPDFHtml(proj, code, date, layers, imgUrl, meta, gps, notes, calibInfo);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  window.open(URL.createObjectURL(blob), "_blank");
}

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const GOLD = "#c8a96e";
const BG = "#0d0c0a";
const BG2 = "#181614";
const TEXT = "#e8e4d4";
const TEXT2 = "#a09070";
const MUTED = "#666";
const BORDER = "rgba(255,255,255,.1)";
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

// ─── SPEECH RECOGNITION HOOK ─────────────────────────────────────────────────
function hasSpeechAPI() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

function useSpeechRecognition({ onFinal, onInterim }) {
  const recRef       = useRef(null);
  const activeRef    = useRef(false);
  const timerRef     = useRef(null);
  const onFinalRef   = useRef(onFinal);
  const onInterimRef = useRef(onInterim);

  onFinalRef.current   = onFinal;
  onInterimRef.current = onInterim;

  const startRec = useCallback(() => {
    if (!activeRef.current || !hasSpeechAPI()) return;
    const SR  = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang            = "es-ES";
    rec.continuous      = !IS_IOS;   // continuous en desktop/Android; false en iOS
    rec.interimResults  = true;
    rec.maxAlternatives = 1;

    rec.onresult = e => {
      let final = "", interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final   += e.results[i][0].transcript;
        else                       interim += e.results[i][0].transcript;
      }
      if (final.trim()) { onFinalRef.current(final.trim()); onInterimRef.current(""); }
      else if (interim)   onInterimRef.current(interim);
    };

    rec.onend = () => {
      onInterimRef.current("");
      if (activeRef.current) timerRef.current = setTimeout(startRec, 150);
    };

    rec.onerror = e => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        activeRef.current = false; // para el reinicio
      }
      // no-speech / aborted → onend se encarga del reinicio
    };

    recRef.current = rec;
    try { rec.start(); } catch {
      timerRef.current = setTimeout(startRec, 400);
    }
  }, []);

  const start = useCallback(() => {
    if (!hasSpeechAPI()) return false;
    activeRef.current = true;
    startRec();
    return true;
  }, [startRec]);

  const stop = useCallback(() => {
    activeRef.current = false;
    clearTimeout(timerRef.current);
    onInterimRef.current("");
    try { recRef.current?.abort(); } catch {}
    recRef.current = null;
  }, []);

  useEffect(() => () => {
    activeRef.current = false;
    clearTimeout(timerRef.current);
    try { recRef.current?.abort(); } catch {}
  }, []);

  return { start, stop };
}

// ─── MODAL DOCUMENTACIÓN ──────────────────────────────────────────────────────
const LayerDocModal = memo(({ layer, layerIndex, initialNote, onSave, onClose }) => {
  const [note, setNote]       = useState(initialNote || "");
  const [interim, setInterim] = useState("");
  const [recording, setRecording] = useState(false);

  const handleFinal = useCallback(text => {
    setNote(prev => prev ? prev.trimEnd() + " " + text : text);
  }, []);

  const { start, stop } = useSpeechRecognition({
    onFinal: handleFinal,
    onInterim: setInterim,
  });

  // Refs estables para usar dentro de effects sin closures stale
  const stopRef  = useRef(stop);
  const startRef = useRef(start);
  stopRef.current  = stop;
  startRef.current = start;

  // Solicitar permiso de micrófono vía getUserMedia y arrancar la transcripción.
  // getUserMedia dispara el diálogo nativo del browser (solo la primera vez);
  // en usos posteriores, el permiso ya está concedido y arranca sin diálogo.
  const activateMic = useCallback(async () => {
    if (!hasSpeechAPI()) return false;
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop()); // libera el stream; el permiso queda concedido
      } catch {
        return false; // permiso denegado — el browser ya informó al usuario
      }
    }
    return startRef.current();
  }, []);

  // Auto-arranque al montar el modal.
  // Intenta arrancar la transcripción directamente. Si el permiso ya está
  // concedido (sesión previa), funciona sin ningún diálogo. Si el permiso
  // aún no fue concedido, el SpeechRecognition lanza "not-allowed" y el hook
  // lo para silenciosamente; el usuario verá el botón "🎙 Dictar".
  useEffect(() => {
    let cancelled = false;
    const ok = startRef.current();
    if (!cancelled && ok) setRecording(true);
    return () => { cancelled = true; stopRef.current(); };
  }, []); // eslint-disable-line

  const toggle = useCallback(async () => {
    if (recording) {
      stopRef.current(); setRecording(false);
    } else {
      const ok = await activateMic();
      if (ok) setRecording(true);
    }
  }, [recording, activateMic]);

  const { r, g, b } = layer.rgb;
  const lum = (r * 299 + g * 587 + b * 114) / 1000;
  const fg  = lum > 140 ? "#111" : "#fff";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.88)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) { stopRef.current(); onClose(); } }}>
      <div style={{ background: "#141210", border: `1px solid ${BORDER_GOLD}`, borderRadius: "12px 12px 0 0", width: "100%", maxWidth: 560, padding: "24px 20px 36px", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <div style={{ width: 52, height: 52, background: layer.hex, borderRadius: 6, border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ color: fg, fontSize: 5.5, fontFamily: "monospace", fontWeight: 700, writingMode: "vertical-rl", transform: "rotate(180deg)" }}>{layer.hex}</span>
          </div>
          <div>
            <div style={{ fontSize: 10, color: GOLD, fontFamily: "monospace", letterSpacing: ".1em" }}>CAPA {layer.pos}</div>
            <div style={{ fontSize: 13, color: TEXT, fontFamily: "monospace", fontWeight: 600 }}>{layer.name}</div>
            <div style={{ fontSize: 9, color: TEXT2, fontFamily: "monospace" }}>{layer.ncs} · {layer.ral?.split(" — ")[0]}</div>
          </div>
          <button onClick={() => { stopRef.current(); onClose(); }} style={{ marginLeft: "auto", background: "none", border: "none", color: MUTED, fontSize: 20, cursor: "pointer", padding: "0 4px" }}>✕</button>
        </div>

        <label style={lbl}>Observaciones de campo</label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={recording ? "Habla ahora — se transcribe automáticamente…" : "Toca «Dictar» o escribe aquí…"}
          rows={5}
          style={{ ...inp, fontSize: 14, resize: "vertical", lineHeight: 1.6 }}
        />

        {interim && (
          <div style={{ marginTop: 6, padding: "6px 10px", background: "rgba(200,169,110,.06)", border: `1px solid ${BORDER_GOLD}`, borderRadius: 3, fontSize: 12, color: TEXT2, fontFamily: "monospace", fontStyle: "italic" }}>
            {interim}…
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={toggle}
            style={{ ...btn(recording, false), padding: "12px 20px", fontSize: 11, minWidth: 140,
              background: recording ? "rgba(180,60,60,.2)" : "rgba(255,255,255,.05)",
              borderColor: recording ? "rgba(220,80,80,.5)" : BORDER,
              color: recording ? "#e07070" : TEXT2 }}>
            {recording ? "⏹ Detener" : "🎙 Dictar"}
          </button>
          {recording
            ? <span style={{ fontSize: 9, color: "#e07070", fontFamily: "monospace", animation: "blink 1s ease-in-out infinite" }}>● Escuchando…</span>
            : hasSpeechAPI() && <span style={{ fontSize: 9, color: MUTED, fontFamily: "monospace" }}>Toca para dictar</span>}
          {note && !recording && <button onClick={() => setNote("")} style={{ ...btn(false, true), fontSize: 9 }}>✕ Limpiar</button>}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button
            onClick={() => { stopRef.current(); onSave(layerIndex, note.trim()); onClose(); }}
            style={{ ...btn(true), flex: 1, padding: "14px", fontSize: 12 }}>
            ✓ Guardar nota
          </button>
          <button onClick={() => { stopRef.current(); onClose(); }} style={{ ...btn(false), padding: "14px 20px", fontSize: 11 }}>Cancelar</button>
        </div>
      </div>
      <style>{`@keyframes blink{0%,100%{opacity:.4}50%{opacity:1}}`}</style>
    </div>
  );
});

// ─── FILA DE CAPA ─────────────────────────────────────────────────────────────
const LayerRow = memo(({ layer, layerIndex, onCopy, copied, hasNote, onOpenNote }) => {
  const { r, g, b } = layer.rgb;
  const lum = (r * 299 + g * 587 + b * 114) / 1000, fg = lum > 140 ? "#111" : "#fff";
  return (
    <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
      <td style={{ padding: "8px 10px", color: GOLD, fontWeight: 900, fontSize: 16, width: 36, textAlign: "center" }}>{layer.pos}</td>
      <td style={{ padding: "8px 6px", width: 54 }}>
        {/* button en lugar de div para que el tap funcione en iOS Safari */}
        <button
          onClick={() => onOpenNote(layerIndex)}
          title={hasNote ? "Nota guardada — toca para editar" : "Toca para documentar esta capa"}
          style={{ position: "relative", width: 40, height: 40, background: layer.hex, borderRadius: 4, border: `2px solid ${hasNote ? "rgba(80,200,120,.6)" : "rgba(200,100,50,.5)"}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, WebkitAppearance: "none" }}>
          <span style={{ color: fg, fontSize: 5.5, fontFamily: "monospace", fontWeight: 700, writingMode: "vertical-rl", transform: "rotate(180deg)", opacity: .8 }}>{layer.hex}</span>
          <div style={{ position: "absolute", top: -5, right: -5, width: 12, height: 12, borderRadius: "50%", background: hasNote ? "#4cc87a" : "#e07840", border: `2px solid ${BG}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 6, color: "#fff", fontWeight: 900, lineHeight: 1 }}>{hasNote ? "✓" : "!"}</span>
          </div>
        </button>
      </td>
      <td style={{ padding: "8px 8px" }}>
        <div style={{ fontSize: 10, color: TEXT2, fontWeight: 600, marginBottom: 3 }}>{layer.name}</div>
        <div style={{ fontSize: 9, color: GOLD, fontWeight: 700, cursor: "pointer" }} onClick={() => onCopy(layer.hex)}>
          {copied === layer.hex ? "✓ copiado" : layer.hex}
        </div>
      </td>
      <td style={{ padding: "8px 6px" }}>
        <div style={{ fontSize: 9, color: "#5090d0", marginBottom: 2 }}>{layer.ncs}</div>
        <div style={{ fontSize: 8.5, color: TEXT2 }}>{layer.ral} <span style={{ color: MUTED, fontSize: 7 }}>ΔE{layer.ralDE}</span></div>
      </td>
      <td style={{ padding: "8px 8px" }}>
        <div style={{ fontSize: 8, color: "#5580bb" }}>{layer.american}</div>
      </td>
    </tr>
  );
});

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
      @keyframes blink{0%,100%{opacity:.4}50%{opacity:1}}
    `}</style>
  </div>
);

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [scr, setScr] = useState("home");
  const projRef = useRef(""), codeRef = useRef("");
  const [projD, setProjD] = useState(""), [codeD, setCodeD] = useState("");
  const [imgData, setImgData] = useState(null);
  const [layers, setLayers] = useState([]);
  const [status, setStatus] = useState(""), [err, setErr] = useState(null);
  const [gps, setGps] = useState(null), [gpsStatus, setGpsStatus] = useState("");
  const [copied, setCopied] = useState(null);
  const fRef = useRef(), cRef = useRef(), imgFileRef = useRef(null);
  const [imgMeta, setImgMeta] = useState(null);
  const today = new Date().toISOString().slice(0, 10);

  const [layerNotes, setLayerNotes] = useState({});
  const [activeNoteLayer, setActiveNoteLayer] = useState(null);

  const [monteaRef, setMonteaRef] = useState(loadMonteaRef);
  const [measHex, setMeasHex] = useState("#1e2d6b");
  const [calibActive, setCalibActive] = useState(false);
  const [showCalib, setShowCalib] = useState(false);
  const [editingRef, setEditingRef] = useState(false);

  const refHex = useMemo(() => rgbToHex(monteaRef), [monteaRef]);

  const activeLayers = useMemo(() => {
    if (!calibActive) return layers;
    const hexToRgb = h => { const v = parseInt(h.replace("#", ""), 16); return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 }; };
    const meas = hexToRgb(measHex);
    const refLAB = rgbToLab(monteaRef.r, monteaRef.g, monteaRef.b);
    const measLAB = rgbToLab(meas.r, meas.g, meas.b);
    const dL = refLAB[0] - measLAB[0], da = refLAB[1] - measLAB[1], db = refLAB[2] - measLAB[2];
    return layers.map(layer => {
      const lab = layer.lab || { L: 50, a: 0, b: 0 };
      const corrRgb = labToRgb(lab.L + dL, lab.a + da, lab.b + db);
      return enrichLayer({ ...layer, rgb: corrRgb, hex: rgbToHex(corrRgb), lab: { L: lab.L + dL, a: lab.a + da, b: lab.b + db } });
    });
  }, [layers, calibActive, measHex, monteaRef]);

  const calibInfo = useMemo(() => {
    if (!calibActive) return null;
    const hexToRgb = h => { const v = parseInt(h.replace("#", ""), 16); return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 }; };
    const meas = hexToRgb(measHex);
    const refLAB = rgbToLab(monteaRef.r, monteaRef.g, monteaRef.b);
    const measLAB = rgbToLab(meas.r, meas.g, meas.b);
    return { refHex, measHex, dL: (refLAB[0] - measLAB[0]).toFixed(1), da: (refLAB[1] - measLAB[1]).toFixed(1), db: (refLAB[2] - measLAB[2]).toFixed(1) };
  }, [calibActive, measHex, monteaRef, refHex]);

  const allDocumented = useMemo(() =>
    activeLayers.length > 0 && activeLayers.every((_, i) => (layerNotes[i] || "").trim().length > 0),
    [activeLayers, layerNotes]);

  const docCount = useMemo(() =>
    activeLayers.filter((_, i) => (layerNotes[i] || "").trim().length > 0).length,
    [activeLayers, layerNotes]);

  const reset = () => {
    setImgData(null); setLayers([]); setStatus(""); setErr(null); setGps(null); setGpsStatus("");
    setCopied(null); setImgMeta(null); imgFileRef.current = null;
    setLayerNotes({}); setActiveNoteLayer(null); setCalibActive(false); setShowCalib(false);
  };

  const home = () => { setScr("home"); reset(); };
  const copyVal = v => { navigator.clipboard?.writeText(v); setCopied(v); setTimeout(() => setCopied(null), 1500); };
  const saveNote = (idx, text) => setLayerNotes(prev => ({ ...prev, [idx]: text }));

  // Auto-fetch GPS del dispositivo al entrar en capture (silencioso, sin bloquear).
  // El GPS del EXIF de la foto tiene prioridad y sobreescribirá este valor.
  useEffect(() => {
    if (scr !== "capture" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      p => {
        const pos = {
          lat: p.coords.latitude.toFixed(6),
          lon: p.coords.longitude.toFixed(6),
          alt: p.coords.altitude ? p.coords.altitude.toFixed(1) + "m" : "N/A",
          acc: p.coords.accuracy ? p.coords.accuracy.toFixed(0) + "m" : "N/A",
        };
        setGps(prev => prev || pos);           // no sobreescribe si ya hay GPS (EXIF)
        setGpsStatus(prev => prev || "📍 GPS dispositivo");
      },
      () => {},  // fallo silencioso
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 30000 }
    );
  }, [scr]);

  const pick = useCallback(async file => {
    if (!file?.type.startsWith("image/")) { setErr("Archivo no es imagen"); return; }
    setErr(null); setStatus("Leyendo…"); imgFileRef.current = file;

    // Extraer GPS y fecha desde metadatos EXIF de la foto
    let exifDatetime = null;
    try {
      const exif = await exifr.parse(file, { gps: true, pick: ["DateTimeOriginal", "GPSAltitude", "GPSAltitudeRef"] });
      if (exif?.latitude != null && exif?.longitude != null) {
        const altRef = exif.GPSAltitudeRef; // 0 = sobre nivel del mar, 1 = bajo
        const altVal = exif.GPSAltitude;
        setGps({
          lat: exif.latitude.toFixed(6),
          lon: exif.longitude.toFixed(6),
          alt: altVal != null ? `${altRef === 1 ? "-" : ""}${altVal.toFixed(1)}m` : "N/A",
          acc: "EXIF",
        });
        setGpsStatus("📍 GPS desde foto");
      }
      if (exif?.DateTimeOriginal) {
        exifDatetime = new Date(exif.DateTimeOriginal).toLocaleString("es");
      }
    } catch { /* sin EXIF o EXIF sin GPS — continuar */ }

    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => setImgMeta({
        size: `${img.width}×${img.height}px`,
        datetime: exifDatetime || new Date(file.lastModified).toLocaleString("es"),
        device: navigator.userAgent.match(/\(([^)]+)\)/)?.[1]?.split(";")?.[1]?.trim() || navigator.platform || "—",
        filename: file.name,
        filesize: `${(file.size / 1024).toFixed(1)} KB`,
      });
      img.src = ev.target.result;
      setImgData({ url: ev.target.result, b64: ev.target.result.split(",")[1], mime: file.type, file });
      setStatus("✓ Lista");
    };
    reader.readAsDataURL(file);
  }, []);

  const fetchGPS = async () => {
    setGpsStatus("Obteniendo GPS…");
    const pos = await getGPS();
    if (pos) { setGps(pos); setGpsStatus(`📍 ${pos.lat}, ${pos.lon} Alt:${pos.alt}`); }
    else setGpsStatus("GPS no disponible — permite acceso en el navegador");
  };

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
      const missing = activeLayers.map((_, i) => (layerNotes[i] || "").trim() ? null : i + 1).filter(Boolean);
      alert(`⚠ Documenta todas las capas antes de exportar.\nCapas pendientes: ${missing.join(", ")}`);
      return;
    }
    const p = projRef.current || projD, c = codeRef.current || codeD;
    openPDF(p, c, today, activeLayers, imgData?.url, imgMeta, gps, layerNotes, calibInfo);
  };

  const dlCSV = () => {
    if (!allDocumented) {
      const missing = activeLayers.map((_, i) => (layerNotes[i] || "").trim() ? null : i + 1).filter(Boolean);
      alert(`⚠ Documenta todas las capas antes de exportar.\nCapas pendientes: ${missing.join(", ")}`);
      return;
    }
    const p = projRef.current || projD, c = codeRef.current || codeD;
    const csv = [
      `# STRATACHROMA v22 | ${p} | ${c} | ${today}`,
      `# GPS: Lat:${gps?.lat || "N/A"} Lon:${gps?.lon || "N/A"} Alt:${gps?.alt || "N/A"}`,
      calibInfo ? `# Calibración MONTEA_COLOR: Ref ${calibInfo.refHex} / Medido ${calibInfo.measHex} / ΔL${calibInfo.dL} Δa${calibInfo.da} Δb${calibInfo.db}` : "",
      "Capa,Nombre,HEX,NCS,RAL,dE,American,R,G,B,Notas",
      ...activeLayers.map((l, i) => `${l.pos},"${l.name}",${l.hex},"${l.ncs}","${l.ral}",${l.ralDE},"${l.american}",${l.rgb.r},${l.rgb.g},${l.rgb.b},"${(layerNotes[i] || "").replace(/"/g, "'")}"`)
    ].filter(Boolean).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `${p}_${c}_${today}.csv`;
    a.click();
  };

  // ── HOME ──────────────────────────────────────────────────────────────────
  if (scr === "home") return (
    <Wrap>
      <div style={{ padding: "40px 24px", maxWidth: 460 }}>
        <div style={{ fontFamily: "monospace", marginBottom: 36, lineHeight: 1.9 }}>
          <div style={{ fontSize: 12, color: TEXT2 }}>Análisis estratigráfico de calas de pintura</div>
          <div style={{ fontSize: 10, color: GOLD, marginTop: 4 }}>✦ MC 1,000,000 · P50 CIE-LAB · EXIF · MONTEA_COLOR</div>
          <div style={{ fontSize: 10, color: "#6699cc", marginTop: 2 }}>NCS · RAL · HEX · American Colors</div>
          <div style={{ fontSize: 10, color: TEXT2, marginTop: 2 }}>PDF · CSV · Sin cuenta requerida</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 320 }}>
          <button style={{ ...btn(true), padding: "16px 24px", fontSize: 12 }} onClick={() => setScr("meta")}>
            + Nueva Cala
          </button>
        </div>
      </div>
    </Wrap>
  );

  // ── META ──────────────────────────────────────────────────────────────────
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
            const p = projRef.current || projD, c = codeRef.current || codeD;
            if (p && c) setScr("capture");
            else alert("Completa los dos campos");
          }}>
          → Continuar
        </button>
      </div>
    </Wrap>
  );

  // ── CAPTURE ───────────────────────────────────────────────────────────────
  if (scr === "capture") return (
    <Wrap back={() => setScr("meta")}>
      <div style={{ padding: "20px 24px", maxWidth: 560 }}>
        <div style={{ fontSize: 10, color: TEXT2, fontFamily: "monospace", marginBottom: 16 }}>
          <span style={{ color: GOLD }}>{projRef.current || projD}</span> / {codeRef.current || codeD}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
          <button style={{ ...btn(!!gps, true), flexShrink: 0 }} onClick={fetchGPS}
            title={gps ? "Actualizar GPS del dispositivo" : "Capturar ubicación GPS"}>
            {gps ? "📍 GPS ✓" : "📍 GPS"}
          </button>
          <span style={{ fontSize: 9, color: gps ? "#4cc87a" : MUTED, fontFamily: "monospace", lineHeight: 1.5 }}>
            {gps
              ? `${gps.lat}, ${gps.lon} · Alt: ${gps.alt}${gps.acc === "EXIF" ? " · 📷 EXIF" : ` · ±${gps.acc}`}`
              : gpsStatus || "Buscando GPS…"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <button style={btn(false, true)} onClick={() => fRef.current?.click()}>📁 Archivo</button>
          <button style={btn(false, true)} onClick={() => cRef.current?.click()}>📷 Cámara</button>
          {imgData && <button style={btn(false, true)} onClick={() => { setImgData(null); setStatus(""); setImgMeta(null); imgFileRef.current = null; }}>✕ Quitar</button>}
        </div>
        <input ref={fRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => pick(e.target.files[0])} />
        <input ref={cRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => pick(e.target.files[0])} />
        {!imgData && (
          <div
            onClick={() => fRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}
            style={{ border: `1px dashed ${BORDER}`, borderRadius: 6, padding: "60px 20px", textAlign: "center", cursor: "pointer", color: MUTED, fontFamily: "monospace", fontSize: 12, marginBottom: 16 }}>
            Arrastra imagen de cala aquí
            <div style={{ fontSize: 10, marginTop: 10, color: TEXT2 }}>MC 1M P50 CIE-LAB</div>
          </div>
        )}
        {imgData && (
          <div style={{ marginBottom: 16 }}>
            <img src={imgData.url} alt="" style={{ maxWidth: "100%", maxHeight: 480, objectFit: "contain", borderRadius: 4, border: `1px solid ${BORDER}`, display: "block" }} />
            {imgMeta && (
              <div style={{ marginTop: 10, padding: "10px 14px", background: "rgba(200,169,110,.04)", border: `1px solid ${BORDER_GOLD}`, borderRadius: 3, fontFamily: "monospace", fontSize: 9, color: TEXT2, lineHeight: 2 }}>
                <span style={{ color: GOLD }}>✦</span> {imgMeta.filename} · {imgMeta.filesize} · {imgMeta.size}<br />
                {imgMeta.datetime}
                {gps?.acc === "EXIF" && <><br /><span style={{ color: "#4cc87a" }}>📍 {gps.lat}, {gps.lon} · Alt: {gps.alt} · EXIF</span></>}
              </div>
            )}
          </div>
        )}
        {status && <div style={{ padding: "10px 14px", background: "rgba(200,169,110,.04)", border: `1px solid ${BORDER_GOLD}`, borderRadius: 3, fontSize: 10, color: GOLD, fontFamily: "monospace", marginBottom: 12 }}>{status}</div>}
        {err && <div style={{ padding: 12, background: "rgba(180,60,60,.08)", border: "1px solid rgba(180,60,60,.2)", borderRadius: 3, fontSize: 10, color: "#c87a7a", fontFamily: "monospace", marginBottom: 12 }}>⚠ {err}</div>}
        <button style={{ ...btn(true), width: "100%", padding: 16, fontSize: 12, opacity: imgData ? 1 : .4 }}
          onClick={() => { if (imgData) analyze(); }}>
          → Analizar · MC 1M P50 CIE-LAB
        </button>
      </div>
    </Wrap>
  );

  // ── ANALYZING ─────────────────────────────────────────────────────────────
  if (scr === "analyzing") return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22 }}>
      <div style={{ fontSize: 11, color: TEXT2, fontFamily: "monospace", letterSpacing: "0.2em", textTransform: "uppercase" }}>
        Procesando estratigrafía
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, width: 280 }}>
        {[...Array(14)].map((_, i) => (
          <div key={i} style={{ height: 6, borderRadius: 1, background: `rgba(200,169,110,${0.08 + (i / 14) * 0.12})`, animation: `pulse 1.8s ease-in-out ${i * .11}s infinite` }} />
        ))}
      </div>
      {status && <div style={{ fontSize: 10, color: GOLD, fontFamily: "monospace", textAlign: "center", maxWidth: 380, lineHeight: 2.2, padding: "0 24px" }}>{status}</div>}
    </div>
  );

  // ── RESULT ────────────────────────────────────────────────────────────────
  if (scr === "result") {
    const p = projRef.current || projD, c = codeRef.current || codeD;
    return (
      <Wrap back={home}>
        <div style={{ padding: "16px 20px" }}>
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 14, color: GOLD, fontFamily: "monospace", fontWeight: 700 }}>{p}</span>
            <span style={{ fontSize: 10, color: TEXT2, fontFamily: "monospace" }}> / {c}</span>
            <span style={{ fontSize: 9, color: MUTED, fontFamily: "monospace" }}> · {activeLayers.length} capas · {today}</span>
          </div>

          {gps && (
            <div style={{ padding: "7px 12px", background: "rgba(0,100,50,.08)", border: "1px solid rgba(0,150,80,.2)", borderRadius: 3, fontSize: 9, fontFamily: "monospace", color: "#4cc87a", marginBottom: 12 }}>
              📍 {gps.lat}, {gps.lon} · Alt: {gps.alt} · Prec: {gps.acc}
            </div>
          )}

          {/* MONTEA_COLOR calibración */}
          <div style={{ marginBottom: 12, border: `1px solid ${BORDER_GOLD}`, borderRadius: 4, overflow: "hidden" }}>
            <button onClick={() => setShowCalib(v => !v)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: calibActive ? "rgba(200,169,110,.08)" : "rgba(255,255,255,.02)", border: "none", cursor: "pointer", textAlign: "left" }}>
              <div style={{ width: 20, height: 20, background: refHex, borderRadius: 3, border: `1px solid ${BORDER}`, flexShrink: 0 }} />
              <span style={{ fontSize: 9, color: GOLD, fontFamily: "monospace", letterSpacing: ".1em", textTransform: "uppercase" }}>MONTEA_COLOR</span>
              {calibActive && <span style={{ fontSize: 8, color: "#4cc87a", fontFamily: "monospace", marginLeft: 4 }}>● Calibración activa</span>}
              <span style={{ fontSize: 9, color: MUTED, marginLeft: "auto" }}>{showCalib ? "▲" : "▼"}</span>
            </button>
            {showCalib && (
              <div style={{ padding: "14px 16px", borderTop: `1px solid ${BORDER}`, background: "rgba(0,0,0,.25)" }}>
                <div style={{ fontSize: 9, color: TEXT2, fontFamily: "monospace", marginBottom: 12, lineHeight: 1.9 }}>
                  El color de control MONTEA_COLOR corrige la variación de iluminación.<br />
                  Indica cómo aparece este azul en tu foto para calibrar todas las capas.
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 8, color: MUTED, fontFamily: "monospace", marginBottom: 4 }}>COLOR REFERENCIA</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 32, height: 32, background: refHex, borderRadius: 4, border: `2px solid ${BORDER_GOLD}` }} />
                      <span style={{ fontSize: 10, color: GOLD, fontFamily: "monospace", fontWeight: 700 }}>{refHex.toUpperCase()}</span>
                      {editingRef ? (
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input type="color" defaultValue={refHex}
                            onChange={e => {
                              const hex = e.target.value;
                              const v = parseInt(hex.replace("#", ""), 16);
                              const newRef = { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
                              setMonteaRef(newRef);
                              localStorage.setItem("sc_montea_color", JSON.stringify(newRef));
                            }}
                            style={{ width: 40, height: 32, border: "none", borderRadius: 3, cursor: "pointer", padding: 2 }} />
                          <button onClick={() => setEditingRef(false)} style={{ ...btn(false, true), fontSize: 9 }}>OK</button>
                          <button onClick={() => { setMonteaRef(MONTEA_DEFAULT); localStorage.setItem("sc_montea_color", JSON.stringify(MONTEA_DEFAULT)); setEditingRef(false); }} style={{ ...btn(false, true), fontSize: 9, color: TEXT2 }}>Reset</button>
                        </div>
                      ) : (
                        <button onClick={() => setEditingRef(true)} style={{ ...btn(false, true), fontSize: 9 }}>Cambiar</button>
                      )}
                    </div>
                  </div>
                  <div style={{ color: MUTED, fontSize: 14 }}>→</div>
                  <div>
                    <div style={{ fontSize: 8, color: MUTED, fontFamily: "monospace", marginBottom: 4 }}>COLOR EN TU FOTO</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 32, height: 32, background: measHex, borderRadius: 4, border: `1px solid ${BORDER}` }} />
                      <input type="color" value={measHex} onChange={e => setMeasHex(e.target.value)}
                        style={{ width: 40, height: 32, border: "none", borderRadius: 3, cursor: "pointer", padding: 2 }} />
                      <span style={{ fontSize: 9, color: TEXT2, fontFamily: "monospace" }}>{measHex.toUpperCase()}</span>
                    </div>
                  </div>
                </div>
                {calibInfo && calibActive && (
                  <div style={{ padding: "6px 10px", background: "rgba(200,169,110,.06)", borderRadius: 3, fontSize: 8, fontFamily: "monospace", color: TEXT2, marginBottom: 10 }}>
                    Corrección LAB: ΔL {calibInfo.dL} · Δa {calibInfo.da} · Δb {calibInfo.db}
                  </div>
                )}
                <div style={{ display: "flex", gap: 10 }}>
                  {!calibActive ? (
                    <button onClick={() => setCalibActive(true)} style={{ ...btn(true, true), fontSize: 10, padding: "10px 16px" }}>⚖ Aplicar calibración</button>
                  ) : (
                    <button onClick={() => setCalibActive(false)} style={{ ...btn(false, true), fontSize: 10, padding: "10px 16px", color: "#e07070", borderColor: "rgba(200,80,80,.3)" }}>✕ Desactivar</button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Documentación progress */}
          <div style={{ marginBottom: 12, padding: "10px 14px", background: allDocumented ? "rgba(60,180,80,.07)" : "rgba(200,169,110,.04)", border: `1px solid ${allDocumented ? "rgba(60,180,80,.3)" : BORDER_GOLD}`, borderRadius: 4, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: allDocumented ? "#4cc87a" : GOLD, fontFamily: "monospace", letterSpacing: ".08em" }}>
                {allDocumented ? "✓ TODAS LAS CAPAS DOCUMENTADAS" : `DOCUMENTACIÓN · ${docCount}/${activeLayers.length} capas`}
              </div>
              <div style={{ fontSize: 8, color: TEXT2, fontFamily: "monospace", marginTop: 3 }}>
                {allDocumented ? "Listo para exportar PDF y CSV" : "Toca cada cuadrado de color para dictar o escribir observaciones"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap", maxWidth: 80, justifyContent: "flex-end" }}>
              {activeLayers.map((_, i) => (
                <button key={i} onClick={() => setActiveNoteLayer(i)}
                  style={{ width: 10, height: 10, borderRadius: "50%", background: (layerNotes[i] || "").trim() ? "#4cc87a" : "#e07840", cursor: "pointer", border: "1px solid rgba(0,0,0,.2)", padding: 0, WebkitAppearance: "none" }} />
              ))}
            </div>
          </div>

          {/* Franja de colores */}
          <div style={{ display: "flex", height: 20, borderRadius: 3, overflow: "hidden", marginBottom: 12, border: `1px solid ${BORDER}` }}>
            {activeLayers.map((l, i) => <div key={i} style={{ flex: 1, background: l.hex }} title={`C${l.pos}: ${l.name}`} />)}
          </div>
          <div style={{ fontSize: 8, color: GOLD, fontFamily: "monospace", marginBottom: 14 }}>
            ✦ MC 1M P50 CIE-LAB · {activeLayers.length} capas{calibActive ? " · ⚖ MONTEA_COLOR calibrado" : ""}
            {copied && <span style={{ marginLeft: 10 }}>✓ {copied}</span>}
          </div>

          {/* Tabla */}
          <div style={{ display: "grid", gridTemplateColumns: imgData ? "min(130px,24%) 1fr" : "1fr", gap: 14, alignItems: "start", marginBottom: 16 }}>
            {imgData && (
              <div style={{ position: "sticky", top: 10 }}>
                <img src={imgData.url} alt="" style={{ width: "100%", borderRadius: 4, border: `1px solid ${BORDER}` }} />
                {imgMeta && (
                  <div style={{ marginTop: 6, fontSize: 7, color: TEXT2, fontFamily: "monospace", lineHeight: 2 }}>
                    <div>📐 {imgMeta.size}</div>
                    <div>📅 {imgMeta.datetime}</div>
                    {layers[0]?.bgInfo && <div>💡 {layers[0].bgInfo}</div>}
                  </div>
                )}
              </div>
            )}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 380 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                    {["#", "Color · Doc", "Nombre / Códigos", "NCS · RAL", "American Colors"].map(h => (
                      <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontSize: 7.5, color: TEXT2, letterSpacing: ".1em", textTransform: "uppercase", background: "rgba(200,169,110,.06)", fontWeight: 400 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeLayers.map((l, i) => (
                    <LayerRow key={i} layer={l} layerIndex={i} onCopy={copyVal} copied={copied}
                      hasNote={(layerNotes[i] || "").trim().length > 0}
                      onOpenNote={setActiveNoteLayer} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Acciones */}
          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <button style={{ ...btn(allDocumented, false), width: "100%", padding: "16px", fontSize: 12 }} onClick={dlPDF}>
              {allDocumented ? "🖨 Exportar PDF" : `🖨 PDF  (faltan ${activeLayers.length - docCount} notas)`}
            </button>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...btn(false), flex: 1, fontSize: 10 }} onClick={dlCSV}>↓ CSV</button>
              <button style={{ ...btn(false), flex: 1, fontSize: 10 }} onClick={() => setScr("capture")}>← Foto</button>
              <button style={{ ...btn(false), flex: 1, fontSize: 10 }} onClick={home}>⌂ Inicio</button>
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
