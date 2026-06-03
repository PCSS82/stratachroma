import { useState, useRef, useCallback, useEffect, memo, useMemo } from "react";
import { analyzeImage, rgbToLab } from "./motor.js";
import { enrichLayer } from "./colors.js";

// ─── GPS ──────────────────────────────────────────────────────────────────────
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

// Color referencia MONTEA — azul marino de control para calibración fotográfica
const MONTEA_COLOR_DEFAULT = { r: 30, g: 45, b: 107 }; // #1E2D6B

function loadMonteaRef() {
  try {
    const s = localStorage.getItem("sc_montea_color");
    if (s) return JSON.parse(s);
  } catch { /* ignore */ }
  return MONTEA_COLOR_DEFAULT;
}

// ─── PDF ──────────────────────────────────────────────────────────────────────
function buildPDFHtml(proj, code, date, layers, imgUrl, meta, gps, notes, calibInfo) {
  const now = new Date().toLocaleString("es");
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const closeAction = isIOS ? "history.back()" : "window.close()";
  const notesRows = layers.map((l, i) => {
    const n = notes?.[i] || "";
    return n ? `<tr><td style="color:#8B6914;font-weight:900;font-size:9px">${l.pos || l.numero}</td><td style="font-size:7px;color:#555;padding:3px 5px">${n}</td></tr>` : "";
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
.footer{margin-top:8px;padding-top:5px;border-top:1px solid #eee;font-size:5.5px;color:#ccc;display:flex;justify-content:space-between}
@media print{.topbar{display:none}.content{margin-top:0}@page{margin:7mm;size:A4}}
</style></head><body>
<div class="topbar">
  <button class="btn-print" onclick="window.print()">🖨 Imprimir / PDF</button>
  <button class="btn-close" onclick="${closeAction}">← Volver a la app</button>
</div>
<div class="content">
<div class="hdr">
  <div><div class="brand">STRATA<b>CHROMA</b></div><div style="font-size:6px;color:#aaa">FICHA TÉCNICA · CALA ESTRATIGRÁFICA · v19</div></div>
  <div class="info">Proyecto: <b>${proj}</b><br>Código: <b style="color:#8B6914">${code}</b><br>${date} · ${layers.length} capas<br>${now}</div>
</div>
<div class="mbox">
  <div><div class="mt">Resolución</div><div class="mv">${meta?.size || "—"}</div></div>
  <div><div class="mt">Fecha foto</div><div class="mv">${meta?.datetime || "—"}</div></div>
  <div><div class="mt">Dispositivo</div><div class="mv">${meta?.device || "—"}</div></div>
  <div class="gps">📍 Lat: <b>${gps?.lat || "N/A"}</b> &nbsp; Lon: <b>${gps?.lon || "N/A"}</b> &nbsp; Alt: <b>${gps?.alt || "N/A"}</b> &nbsp; Precisión: <b>${gps?.acc || "N/A"}</b></div>
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
  return `<tr><td class="lnum">${l.pos || l.numero}</td><td><div class="sw" style="background:${l.hex};display:flex;align-items:center;justify-content:center"><span style="color:${fg};font-size:4.5px;font-family:monospace;font-weight:700">${l.hex}</span></div></td><td style="font-weight:600;white-space:nowrap">${l.name || l.nombre}</td><td class="hex">${l.hex}</td><td class="ncs">${l.ncs}</td><td style="font-size:6.5px;white-space:nowrap">${l.ral} <span style="color:#bbb;font-size:5px">ΔE${l.ralDE || l.ral_dE || ""}</span></td><td class="amer">${l.american || l.american_colors}</td><td style="font-size:6px">${rgb.r},${rgb.g},${rgb.b}</td></tr>`;
}).join("")}
</table>
${hasNotes ? `<div class="notes-section"><h4>Observaciones de campo</h4><table><tr><th>#</th><th>Nota</th></tr>${notesRows}</table></div>` : ""}
</div>
</div>
<div class="footer"><span>STRATACHROMA v19 · MC 1M P50 CIE-LAB · NCS · RAL · HEX · American Colors · MONTEA_COLOR</span><span>${now}</span></div>
</div>
</body></html>`;
}

function openPDF(proj, code, date, layers, imgUrl, meta, gps, notes, calibInfo) {
  const html = buildPDFHtml(proj, code, date, layers, imgUrl, meta, gps, notes, calibInfo);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
}

// ─── ESTILOS ──────────────────────────────────────────────────────────────────
const G = "#c8a96e";
const B = (on, sm) => ({
  background: on ? "rgba(200,169,110,.12)" : "rgba(255,255,255,.04)",
  border: `1px solid ${on ? "rgba(200,169,110,.4)" : "rgba(255,255,255,.09)"}`,
  color: on ? G : "#555", padding: sm ? "8px 18px" : "12px 24px",
  fontFamily: "'Courier New',monospace", fontSize: sm ? 10 : 11,
  letterSpacing: "0.12em", textTransform: "uppercase",
  cursor: "pointer", borderRadius: 3, transition: "all .15s", lineHeight: 1,
  WebkitTapHighlightColor: "transparent",
});
const INP = {
  width: "100%", background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.14)",
  color: "#e8e4d4", padding: "14px 16px", fontFamily: "'Courier New',monospace", fontSize: 17,
  borderRadius: 3, outline: "none", WebkitAppearance: "none",
};
const LBL = { display: "block", fontSize: 10, color: "#555", fontFamily: "monospace", letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 7 };

const Hdr = memo(({ back }) => (
  <div style={{ borderBottom: "1px solid rgba(255,255,255,.06)", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
    <div>
      <div style={{ fontSize: 7, color: "#1c1b18", fontFamily: "monospace", letterSpacing: "0.16em" }}>STRATACHROMA · v19 · MC 1M P50 CIE-LAB · GPS · MONTEA_COLOR</div>
      <h1 style={{ fontSize: 24, fontWeight: 300, color: "#e8e4d4", margin: 0, letterSpacing: ".05em" }}>STRATA<span style={{ color: G }}>CHROMA</span></h1>
    </div>
    {back && <button style={B(false, true)} onClick={back}>← Inicio</button>}
  </div>
));

// ─── MODAL DOCUMENTACIÓN DE CAPA ─────────────────────────────────────────────
const LayerDocModal = memo(({ layer, layerIndex, initialNote, onSave, onClose }) => {
  const [note, setNote] = useState(initialNote || "");
  const [recording, setRecording] = useState(false);
  const recognizerRef = useRef(null);
  const activeRef = useRef(false); // tracks intent to record (avoids stale closure)
  const { r, g, b } = layer.rgb;
  const lum = (r * 299 + g * 587 + b * 114) / 1000;
  const fg = lum > 140 ? "#111" : "#fff";

  const createRec = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const rec = new SR();
    rec.lang = "es-ES";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = e => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) text += e.results[i][0].transcript + " ";
      }
      if (text) setNote(prev => prev ? prev + " " + text.trim() : text.trim());
    };
    // Auto-reconexión: si el navegador corta por silencio, reinicia solo
    rec.onend = () => {
      if (activeRef.current) {
        try { const r2 = createRec(); r2?.start(); recognizerRef.current = r2; }
        catch { activeRef.current = false; setRecording(false); }
      } else {
        setRecording(false);
      }
    };
    rec.onerror = e => {
      if (e.error === "no-speech" && activeRef.current) return; // silencio normal, onend reconectará
      activeRef.current = false; setRecording(false);
    };
    return rec;
  };

  const startRecording = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Reconocimiento de voz no disponible en este navegador.\nUsa Chrome o Safari."); return; }
    const rec = createRec();
    if (!rec) return;
    try { rec.start(); recognizerRef.current = rec; activeRef.current = true; setRecording(true); }
    catch { activeRef.current = false; setRecording(false); }
  };

  const stopRecording = () => {
    activeRef.current = false;
    recognizerRef.current?.stop();
    setRecording(false);
  };

  useEffect(() => () => { activeRef.current = false; recognizerRef.current?.stop(); }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#141210", border: "1px solid rgba(200,169,110,.2)", borderRadius: "12px 12px 0 0", width: "100%", maxWidth: 560, padding: "24px 20px 32px", maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <div style={{ width: 52, height: 52, background: layer.hex, borderRadius: 6, border: "1px solid rgba(255,255,255,.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ color: fg, fontSize: 5.5, fontFamily: "monospace", fontWeight: 700, writingMode: "vertical-rl", transform: "rotate(180deg)" }}>{layer.hex}</span>
          </div>
          <div>
            <div style={{ fontSize: 10, color: G, fontFamily: "monospace", letterSpacing: ".1em" }}>CAPA {layer.pos}</div>
            <div style={{ fontSize: 13, color: "#e8e4d4", fontFamily: "monospace", fontWeight: 600 }}>{layer.name}</div>
            <div style={{ fontSize: 9, color: "#444", fontFamily: "monospace" }}>{layer.ncs} · {layer.ral?.split(" — ")[0]}</div>
          </div>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", color: "#444", fontSize: 20, cursor: "pointer", padding: "0 4px" }}>✕</button>
        </div>

        <label style={LBL}>Observaciones de campo</label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Describe esta capa: material, estado, época, intervenciones previas…"
          rows={5}
          style={{ ...INP, fontSize: 14, resize: "vertical", lineHeight: 1.6 }}
        />

        <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center" }}>
          <button
            onClick={recording ? stopRecording : startRecording}
            style={{ ...B(recording, false), padding: "12px 20px", fontSize: 11, minWidth: 140,
              background: recording ? "rgba(180,60,60,.18)" : "rgba(255,255,255,.04)",
              borderColor: recording ? "rgba(220,80,80,.5)" : "rgba(255,255,255,.09)",
              color: recording ? "#e07070" : "#555" }}>
            {recording ? "⏹ Detener" : "🎙 Dictar"}
          </button>
          {recording && <span style={{ fontSize: 9, color: "#e07070", fontFamily: "monospace", animation: "pulse 1s ease-in-out infinite" }}>● Grabando…</span>}
          {note && !recording && <button onClick={() => setNote("")} style={{ ...B(false, true), fontSize: 9, color: "#888" }}>✕ Limpiar</button>}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button
            onClick={() => { onSave(layerIndex, note.trim()); onClose(); }}
            style={{ ...B(true), flex: 1, padding: "14px", fontSize: 12 }}>
            ✓ Guardar nota
          </button>
          <button onClick={onClose} style={{ ...B(false), padding: "14px 20px", fontSize: 11 }}>Cancelar</button>
        </div>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}`}</style>
    </div>
  );
});

// ─── FILA DE CAPA ─────────────────────────────────────────────────────────────
const LayerRow = memo(({ layer, layerIndex, onCopy, copied, hasNote, onOpenNote }) => {
  const { r, g, b } = layer.rgb;
  const lum = (r * 299 + g * 587 + b * 114) / 1000, fg = lum > 140 ? "#111" : "#fff";
  return (
    <tr style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
      <td style={{ padding: "8px 10px", color: G, fontWeight: 900, fontSize: 16, width: 36, textAlign: "center" }}>{layer.pos}</td>
      <td style={{ padding: "8px 6px", width: 54 }}>
        <div onClick={() => onOpenNote(layerIndex)}
          title={hasNote ? "Nota guardada — clic para editar" : "Clic para documentar esta capa"}
          style={{ position: "relative", width: 40, height: 40, background: layer.hex, borderRadius: 4, border: `2px solid ${hasNote ? "rgba(80,200,120,.6)" : "rgba(200,100,50,.5)"}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: fg, fontSize: 5.5, fontFamily: "monospace", fontWeight: 700, writingMode: "vertical-rl", transform: "rotate(180deg)", opacity: .8 }}>{layer.hex}</span>
          <div style={{ position: "absolute", top: -5, right: -5, width: 12, height: 12, borderRadius: "50%", background: hasNote ? "#4cc87a" : "#e07840", border: "2px solid #141210", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 6, color: "#fff", fontWeight: 900, lineHeight: 1 }}>{hasNote ? "✓" : "!"}</span>
          </div>
        </div>
      </td>
      <td style={{ padding: "8px 8px" }}>
        <div style={{ fontSize: 10, color: "#a09070", fontWeight: 600, marginBottom: 3 }}>{layer.name}</div>
        <div style={{ fontSize: 9, color: G, fontWeight: 700, cursor: "pointer" }} onClick={() => onCopy(layer.hex)}>{copied === layer.hex ? "✓ copiado" : layer.hex}</div>
      </td>
      <td style={{ padding: "8px 6px" }}>
        <div style={{ fontSize: 9, color: "#5090d0", marginBottom: 2 }}>{layer.ncs}</div>
        <div style={{ fontSize: 8.5, color: "#bbb" }}>{layer.ral} <span style={{ color: "#444", fontSize: 7 }}>ΔE{layer.ralDE}</span></div>
      </td>
      <td style={{ padding: "8px 8px" }}>
        <div style={{ fontSize: 8, color: "#5580bb" }}>{layer.american}</div>
      </td>
    </tr>
  );
});

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

  // Documentación de capas
  const [layerNotes, setLayerNotes] = useState({});
  const [activeNoteLayer, setActiveNoteLayer] = useState(null);

  // Calibración MONTEA_COLOR
  const [monteaColorRef, setMonteaColorRef] = useState(loadMonteaRef);
  const [measuredRefHex, setMeasuredRefHex] = useState("#1e2d6b");
  const [calibrationActive, setCalibrationActive] = useState(false);
  const [showCalibPanel, setShowCalibPanel] = useState(false);
  const [editingRef, setEditingRef] = useState(false);

  const refHex = useMemo(() => rgbToHex(monteaColorRef), [monteaColorRef]);

  // Capas calibradas (corrección LAB a partir de MONTEA_COLOR)
  const activeLayers = useMemo(() => {
    if (!calibrationActive) return layers;
    const hexToRgb = h => {
      const v = parseInt(h.replace("#", ""), 16);
      return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
    };
    const meas = hexToRgb(measuredRefHex);
    const refLAB = rgbToLab(monteaColorRef.r, monteaColorRef.g, monteaColorRef.b);
    const measLAB = rgbToLab(meas.r, meas.g, meas.b);
    const dL = refLAB[0] - measLAB[0], da = refLAB[1] - measLAB[1], db = refLAB[2] - measLAB[2];
    return layers.map(layer => {
      const lab = layer.lab || { L: 50, a: 0, b: 0 };
      const corrRgb = labToRgb(lab.L + dL, lab.a + da, lab.b + db);
      return enrichLayer({ ...layer, rgb: corrRgb, hex: rgbToHex(corrRgb), lab: { L: lab.L + dL, a: lab.a + da, b: lab.b + db } });
    });
  }, [layers, calibrationActive, measuredRefHex, monteaColorRef]);

  const calibInfo = useMemo(() => {
    if (!calibrationActive) return null;
    const hexToRgb = h => { const v = parseInt(h.replace("#", ""), 16); return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 }; };
    const meas = hexToRgb(measuredRefHex);
    const refLAB = rgbToLab(monteaColorRef.r, monteaColorRef.g, monteaColorRef.b);
    const measLAB = rgbToLab(meas.r, meas.g, meas.b);
    return { refHex, measHex: measuredRefHex, dL: (refLAB[0] - measLAB[0]).toFixed(1), da: (refLAB[1] - measLAB[1]).toFixed(1), db: (refLAB[2] - measLAB[2]).toFixed(1) };
  }, [calibrationActive, measuredRefHex, monteaColorRef, refHex]);

  const allDocumented = useMemo(() =>
    activeLayers.length > 0 && activeLayers.every((_, i) => (layerNotes[i] || "").trim().length > 0),
    [activeLayers, layerNotes]);

  const docCount = useMemo(() =>
    activeLayers.filter((_, i) => (layerNotes[i] || "").trim().length > 0).length,
    [activeLayers, layerNotes]);

  const reset = () => {
    setImgData(null); setLayers([]); setStatus(""); setErr(null); setGps(null); setGpsStatus("");
    setCopied(null); setImgMeta(null); imgFileRef.current = null;
    setLayerNotes({}); setActiveNoteLayer(null); setCalibrationActive(false); setShowCalibPanel(false);
  };
  const home = () => { setScr("home"); reset(); };
  const copyVal = v => { navigator.clipboard?.writeText(v); setCopied(v); setTimeout(() => setCopied(null), 1500); };
  const saveNote = (idx, text) => setLayerNotes(prev => ({ ...prev, [idx]: text }));

  useEffect(() => {
    if (navigator.geolocation) {
      setGpsStatus("Obteniendo GPS…");
      navigator.geolocation.getCurrentPosition(
        p => {
          const pos = { lat: p.coords.latitude.toFixed(6), lon: p.coords.longitude.toFixed(6), alt: p.coords.altitude ? p.coords.altitude.toFixed(1) + "m" : "N/A", acc: p.coords.accuracy ? p.coords.accuracy.toFixed(0) + "m" : "N/A" };
          setGps(pos); setGpsStatus(`📍 ${pos.lat}, ${pos.lon}`);
        },
        () => setGpsStatus("GPS: permite acceso"),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  }, []);

  const pick = useCallback(async file => {
    if (!file?.type.startsWith("image/")) { setErr("No es imagen"); return; }
    setErr(null); setStatus("Leyendo…"); imgFileRef.current = file;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => setImgMeta({
        size: `${img.width}×${img.height}px`,
        datetime: new Date(file.lastModified).toLocaleString("es"),
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
    else setGpsStatus("GPS no disponible (permite acceso en el navegador)");
  };

  const analyze = async () => {
    setScr("analyzing"); setErr(null); setLayers([]); setLayerNotes({}); setCalibrationActive(false);
    try { const raw = await analyzeImage(imgData.file, setStatus); setLayers(raw.map(enrichLayer)); setScr("result"); }
    catch (e) { setErr(e.message); setScr("capture"); }
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
      `# STRATACHROMA v19 | ${p} | ${c} | ${today}`,
      `# GPS: Lat:${gps?.lat || "N/A"} Lon:${gps?.lon || "N/A"} Alt:${gps?.alt || "N/A"}`,
      calibInfo ? `# Calibración MONTEA_COLOR: Ref ${calibInfo.refHex} / Medido ${calibInfo.measHex} / ΔL${calibInfo.dL} Δa${calibInfo.da} Δb${calibInfo.db}` : "",
      "Capa,Nombre,HEX,NCS,RAL,dE,American,R,G,B,Notas",
      ...activeLayers.map((l, i) => `${l.pos},"${l.name}",${l.hex},"${l.ncs}","${l.ral}",${l.ralDE},"${l.american}",${l.rgb.r},${l.rgb.g},${l.rgb.b},"${(layerNotes[i] || "").replace(/"/g, "'")}"`)
    ].filter(Boolean).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `${p}_${c}_${today}.csv`; a.click();
  };

  const Wrap = ({ children, back }) => (
    <div style={{ minHeight: "100vh", background: "#0d0c0a", color: "#d4d0c0", fontFamily: "Georgia,serif", display: "flex", flexDirection: "column" }}>
      <Hdr back={back} />
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>{children}</div>
      <style>{`*{box-sizing:border-box}::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:rgba(200,169,110,.15)}
@keyframes pulse{0%,100%{opacity:.07}50%{opacity:.6}}input,textarea{-webkit-tap-highlight-color:transparent;-webkit-appearance:none}`}</style>
    </div>
  );

  // HOME
  if (scr === "home") return (
    <Wrap>
      <div style={{ padding: "36px 24px", maxWidth: 460 }}>
        {gpsStatus && (
          <div style={{ fontSize: 8, color: gps ? "#60b060" : "#666", fontFamily: "monospace", marginBottom: 16, padding: "6px 10px", background: "rgba(0,80,40,.06)", borderRadius: 3 }}>
            {gps ? `📍 ${gps.lat}, ${gps.lon} · Alt:${gps.alt}` : `⏳ ${gpsStatus}`}
          </div>
        )}
        <div style={{ fontSize: 10, color: "#252320", lineHeight: 3.2, fontFamily: "monospace", marginBottom: 36 }}>
          Análisis estratigráfico de calas de pintura<br />
          <span style={{ color: G, fontSize: 9 }}>✦ MC 1,000,000 · P50 CIE-LAB · GPS altimetría</span><br />
          <span style={{ color: "#1a3355", fontSize: 9 }}>NCS · RAL · HEX · American Colors</span><br />
          PDF · CSV · MONTEA_COLOR · Sin cuenta requerida
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 320 }}>
          <button style={{ ...B(true), padding: "16px 24px", fontSize: 12 }} onClick={() => setScr("meta")}>+ Nueva Cala</button>
        </div>
      </div>
    </Wrap>
  );

  // META
  if (scr === "meta") return (
    <Wrap back={home}>
      <div style={{ padding: "28px 24px", maxWidth: 460 }}>
        <div style={{ fontSize: 10, color: G, fontFamily: "monospace", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 24 }}>Nueva Cala</div>
        <div style={{ marginBottom: 20 }}>
          <label style={LBL}>Proyecto / Edificio</label>
          <input type="text" defaultValue={projD} placeholder="Ej: Iglesia_Central" style={INP}
            autoComplete="off" autoCorrect="off" spellCheck={false}
            onChange={e => projRef.current = e.target.value.trim()}
            onBlur={e => { projRef.current = e.target.value.trim(); setProjD(e.target.value.trim()); }} />
        </div>
        <div style={{ marginBottom: 28 }}>
          <label style={LBL}>Código de Cala</label>
          <input type="text" defaultValue={codeD} placeholder="Ej: CAL-01-A" style={INP}
            autoComplete="off" autoCorrect="off" spellCheck={false}
            onChange={e => codeRef.current = e.target.value.trim()}
            onBlur={e => { codeRef.current = e.target.value.trim(); setCodeD(e.target.value.trim()); }} />
        </div>
        <button style={{ ...B(true), width: "100%", padding: "15px", fontSize: 12 }}
          onClick={() => { const p = projRef.current || projD, c = codeRef.current || codeD; if (p && c) setScr("capture"); else alert("Completa los dos campos"); }}>
          → Continuar
        </button>
      </div>
    </Wrap>
  );

  // CAPTURE
  if (scr === "capture") return (
    <Wrap back={() => setScr("meta")}>
      <div style={{ padding: "20px 24px", maxWidth: 560 }}>
        <div style={{ fontSize: 10, color: "#444", fontFamily: "monospace", marginBottom: 16 }}>
          <span style={{ color: G }}>{projRef.current || projD}</span> / {codeRef.current || codeD}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
          <button style={{ ...B(gps ? true : false, true), flexShrink: 0 }} onClick={fetchGPS}>{gps ? "📍 GPS ✓" : "📍 GPS"}</button>
          <span style={{ fontSize: 9, color: gps ? "#60b060" : "#666", fontFamily: "monospace", lineHeight: 1.5 }}>
            {gps ? `${gps.lat}, ${gps.lon} · Alt:${gps.alt}` : gpsStatus || "Actualizando…"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <button style={B(false, true)} onClick={() => fRef.current?.click()}>📁 Archivo</button>
          <button style={B(false, true)} onClick={() => cRef.current?.click()}>📷 Cámara</button>
          {imgData && <button style={B(false, true)} onClick={() => { setImgData(null); setStatus(""); setImgMeta(null); imgFileRef.current = null; }}>✕</button>}
        </div>
        <input ref={fRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => pick(e.target.files[0])} />
        <input ref={cRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => pick(e.target.files[0])} />
        {!imgData && (
          <div onClick={() => fRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}
            style={{ border: "1px dashed rgba(255,255,255,.08)", borderRadius: 6, padding: "60px 20px", textAlign: "center", cursor: "pointer", color: "#222", fontFamily: "monospace", fontSize: 12, marginBottom: 16 }}>
            Arrastra imagen de cala aquí
            <div style={{ fontSize: 10, marginTop: 10, color: "#181614" }}>MC 1M P50 CIE-LAB</div>
          </div>
        )}
        {imgData && (
          <div style={{ marginBottom: 16 }}>
            <img src={imgData.url} alt="" style={{ maxWidth: "100%", maxHeight: 480, objectFit: "contain", borderRadius: 4, border: "1px solid rgba(255,255,255,.07)", display: "block" }} />
            {imgMeta && <div style={{ marginTop: 10, padding: "10px 14px", background: "rgba(200,169,110,.04)", border: "1px solid rgba(200,169,110,.1)", borderRadius: 3, fontFamily: "monospace", fontSize: 9, color: "#444", lineHeight: 2 }}>
              <span style={{ color: G }}>✦</span> {imgMeta.filename} · {imgMeta.filesize} · {imgMeta.size}<br />{imgMeta.datetime}
            </div>}
          </div>
        )}
        {status && <div style={{ padding: "10px 14px", background: "rgba(200,169,110,.04)", border: "1px solid rgba(200,169,110,.12)", borderRadius: 3, fontSize: 10, color: G, fontFamily: "monospace", marginBottom: 12 }}>{status}</div>}
        {err && <div style={{ padding: 12, background: "rgba(180,60,60,.08)", border: "1px solid rgba(180,60,60,.2)", borderRadius: 3, fontSize: 10, color: "#c87a7a", fontFamily: "monospace", marginBottom: 12 }}>⚠ {err}</div>}
        <button style={{ ...B(true), width: "100%", padding: 16, fontSize: 12, opacity: imgData ? 1 : .4 }} onClick={() => { if (imgData) analyze(); }}>
          → Analizar · MC 1M P50 CIE-LAB
        </button>
      </div>
    </Wrap>
  );

  // ANALYZING
  if (scr === "analyzing") return (
    <div style={{ minHeight: "100vh", background: "#0d0c0a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22 }}>
      <div style={{ fontSize: 11, color: "#282520", fontFamily: "monospace", letterSpacing: "0.2em", textTransform: "uppercase" }}>Procesando estratigrafía</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, width: 280 }}>
        {[...Array(14)].map((_, i) => <div key={i} style={{ height: 6, borderRadius: 1, background: `rgba(200,169,110,${0.05 + (i / 14) * 0.08})`, animation: `pulse 1.8s ease-in-out ${i * .11}s infinite` }} />)}
      </div>
      {status && <div style={{ fontSize: 10, color: G, fontFamily: "monospace", textAlign: "center", maxWidth: 380, lineHeight: 2.2, padding: "0 24px" }}>{status}</div>}
      <style>{`@keyframes pulse{0%,100%{opacity:.07}50%{opacity:.6}}`}</style>
    </div>
  );

  // RESULT
  if (scr === "result") {
    const p = projRef.current || projD, c = codeRef.current || codeD;
    return (
      <Wrap back={home}>
        <div style={{ padding: "16px 20px" }}>
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 14, color: G, fontFamily: "monospace", fontWeight: 700 }}>{p}</span>
            <span style={{ fontSize: 10, color: "#555", fontFamily: "monospace" }}> / {c}</span>
            <span style={{ fontSize: 9, color: "#2a2820", fontFamily: "monospace" }}> · {activeLayers.length} capas · {today}</span>
          </div>
          {gps && <div style={{ padding: "7px 12px", background: "rgba(0,100,50,.06)", border: "1px solid rgba(0,150,80,.2)", borderRadius: 3, fontSize: 9, fontFamily: "monospace", color: "#60b060", marginBottom: 12 }}>
            📍 {gps.lat}, {gps.lon} · Alt:{gps.alt} · Prec:{gps.acc}
          </div>}

          {/* MONTEA_COLOR calibración */}
          <div style={{ marginBottom: 12, border: "1px solid rgba(200,169,110,.15)", borderRadius: 4, overflow: "hidden" }}>
            <button onClick={() => setShowCalibPanel(v => !v)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: calibrationActive ? "rgba(200,169,110,.08)" : "rgba(255,255,255,.02)", border: "none", cursor: "pointer", textAlign: "left" }}>
              <div style={{ width: 20, height: 20, background: refHex, borderRadius: 3, border: "1px solid rgba(255,255,255,.2)", flexShrink: 0 }} />
              <span style={{ fontSize: 9, color: G, fontFamily: "monospace", letterSpacing: ".1em", textTransform: "uppercase" }}>MONTEA_COLOR</span>
              {calibrationActive && <span style={{ fontSize: 8, color: "#4cc87a", fontFamily: "monospace", marginLeft: 4 }}>● Calibración activa</span>}
              <span style={{ fontSize: 9, color: "#444", marginLeft: "auto" }}>{showCalibPanel ? "▲" : "▼"}</span>
            </button>
            {showCalibPanel && (
              <div style={{ padding: "14px 16px", borderTop: "1px solid rgba(255,255,255,.06)", background: "rgba(0,0,0,.2)" }}>
                <div style={{ fontSize: 8, color: "#555", fontFamily: "monospace", marginBottom: 12, lineHeight: 1.8 }}>
                  El color de control MONTEA_COLOR corrige la variación de iluminación (luz natural, sombra, filtros).<br/>
                  Indica cómo aparece este azul en tu foto para calibrar automáticamente todas las capas.
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 8, color: "#555", fontFamily: "monospace", marginBottom: 4 }}>COLOR REFERENCIA</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 32, height: 32, background: refHex, borderRadius: 4, border: "2px solid rgba(200,169,110,.4)" }} />
                      <span style={{ fontSize: 10, color: G, fontFamily: "monospace", fontWeight: 700 }}>{refHex.toUpperCase()}</span>
                      {editingRef ? (
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input type="color" defaultValue={refHex}
                            onChange={e => {
                              const hex = e.target.value;
                              const v = parseInt(hex.replace("#", ""), 16);
                              const newRef = { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
                              setMonteaColorRef(newRef);
                              localStorage.setItem("sc_montea_color", JSON.stringify(newRef));
                            }}
                            style={{ width: 40, height: 32, border: "none", borderRadius: 3, cursor: "pointer", padding: 2 }} />
                          <button onClick={() => setEditingRef(false)} style={{ ...B(false, true), fontSize: 9 }}>OK</button>
                          <button onClick={() => { setMonteaColorRef(MONTEA_COLOR_DEFAULT); localStorage.setItem("sc_montea_color", JSON.stringify(MONTEA_COLOR_DEFAULT)); setEditingRef(false); }} style={{ ...B(false, true), fontSize: 9, color: "#888" }}>Reset</button>
                        </div>
                      ) : (
                        <button onClick={() => setEditingRef(true)} style={{ ...B(false, true), fontSize: 9 }}>Cambiar</button>
                      )}
                    </div>
                  </div>
                  <div style={{ color: "#333", fontSize: 14 }}>→</div>
                  <div>
                    <div style={{ fontSize: 8, color: "#555", fontFamily: "monospace", marginBottom: 4 }}>COLOR EN TU FOTO</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 32, height: 32, background: measuredRefHex, borderRadius: 4, border: "1px solid rgba(255,255,255,.2)" }} />
                      <input type="color" value={measuredRefHex} onChange={e => setMeasuredRefHex(e.target.value)}
                        style={{ width: 40, height: 32, border: "none", borderRadius: 3, cursor: "pointer", padding: 2 }} />
                      <span style={{ fontSize: 9, color: "#888", fontFamily: "monospace" }}>{measuredRefHex.toUpperCase()}</span>
                    </div>
                  </div>
                </div>
                {calibInfo && calibrationActive && (
                  <div style={{ padding: "6px 10px", background: "rgba(200,169,110,.06)", borderRadius: 3, fontSize: 8, fontFamily: "monospace", color: "#888", marginBottom: 10 }}>
                    Corrección LAB: ΔL {calibInfo.dL} · Δa {calibInfo.da} · Δb {calibInfo.db}
                  </div>
                )}
                <div style={{ display: "flex", gap: 10 }}>
                  {!calibrationActive ? (
                    <button onClick={() => setCalibrationActive(true)} style={{ ...B(true, true), fontSize: 10, padding: "10px 16px" }}>⚖ Aplicar calibración</button>
                  ) : (
                    <button onClick={() => setCalibrationActive(false)} style={{ ...B(false, true), fontSize: 10, padding: "10px 16px", color: "#e07070", borderColor: "rgba(200,80,80,.3)" }}>✕ Desactivar</button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Documentación progress */}
          <div style={{ marginBottom: 12, padding: "10px 14px", background: allDocumented ? "rgba(60,180,80,.07)" : "rgba(200,169,110,.04)", border: `1px solid ${allDocumented ? "rgba(60,180,80,.3)" : "rgba(200,169,110,.15)"}`, borderRadius: 4, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: allDocumented ? "#4cc87a" : G, fontFamily: "monospace", letterSpacing: ".08em" }}>
                {allDocumented ? "✓ TODAS LAS CAPAS DOCUMENTADAS" : `DOCUMENTACIÓN · ${docCount}/${activeLayers.length} capas`}
              </div>
              <div style={{ fontSize: 8, color: "#444", fontFamily: "monospace", marginTop: 3 }}>
                {allDocumented ? "Listo para exportar PDF y CSV" : "Toca cada cuadrado de color para dictar o escribir observaciones"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap", maxWidth: 80, justifyContent: "flex-end" }}>
              {activeLayers.map((_, i) => (
                <div key={i} onClick={() => setActiveNoteLayer(i)} style={{ width: 10, height: 10, borderRadius: "50%", background: (layerNotes[i] || "").trim() ? "#4cc87a" : "#e07840", cursor: "pointer", border: "1px solid rgba(0,0,0,.2)" }} />
              ))}
            </div>
          </div>

          {/* Franja de colores */}
          <div style={{ display: "flex", height: 20, borderRadius: 3, overflow: "hidden", marginBottom: 12, border: "1px solid rgba(255,255,255,.07)" }}>
            {activeLayers.map((l, i) => <div key={i} style={{ flex: 1, background: l.hex }} title={`C${l.pos}: ${l.name}`} />)}
          </div>
          <div style={{ fontSize: 8, color: G, fontFamily: "monospace", marginBottom: 14 }}>
            ✦ MC 1M P50 CIE-LAB · {activeLayers.length} capas{calibrationActive ? " · ⚖ MONTEA_COLOR calibrado" : ""}{copied && <span style={{ marginLeft: 10 }}>✓ {copied}</span>}
          </div>

          {/* Tabla */}
          <div style={{ display: "grid", gridTemplateColumns: imgData ? "min(130px,24%) 1fr" : "1fr", gap: 14, alignItems: "start", marginBottom: 16 }}>
            {imgData && (
              <div style={{ position: "sticky", top: 10 }}>
                <img src={imgData.url} alt="" style={{ width: "100%", borderRadius: 4, border: "1px solid rgba(255,255,255,.08)" }} />
                {imgMeta && <div style={{ marginTop: 6, fontSize: 7, color: "#222", fontFamily: "monospace", lineHeight: 2 }}>
                  <div>📐 {imgMeta.size}</div>
                  <div>📅 {imgMeta.datetime}</div>
                  {layers[0]?.bgInfo && <div>💡 {layers[0].bgInfo}</div>}
                </div>}
              </div>
            )}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 380 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,.12)" }}>
                    {["#", "Color · Doc", "Nombre / Códigos", "NCS · RAL", "American Colors"].map(h => (
                      <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontSize: 7.5, color: "#555", letterSpacing: ".1em", textTransform: "uppercase", background: "rgba(200,169,110,.06)", fontWeight: 400 }}>{h}</th>
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
          <div style={{ borderTop: "1px solid rgba(255,255,255,.07)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <button style={{ ...B(allDocumented, false), width: "100%", padding: "16px", fontSize: 12 }} onClick={dlPDF}>
              {allDocumented ? "🖨 Exportar PDF" : `🖨 PDF  (faltan ${activeLayers.length - docCount} notas)`}
            </button>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...B(false), flex: 1, fontSize: 10 }} onClick={dlCSV}>↓ CSV</button>
              <button style={{ ...B(false), flex: 1, fontSize: 10 }} onClick={() => setScr("capture")}>← Foto</button>
              <button style={{ ...B(false), flex: 1, fontSize: 10 }} onClick={home}>⌂</button>
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
