import { useState, useRef, useCallback, useEffect, memo } from "react";
import { analyzeImage } from "./motor.js";
import { enrichLayer } from "./colors.js";
import { saveCala, listFolders, listFiles, readJSON, readImageAsDataURL, trashItem, ROOT_FOLDER_ID, getToken, signOut } from "./drive.js";

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

// ─── PDF ──────────────────────────────────────────────────────────────────────
// Genera HTML del PDF y lo abre. En iOS usa history.back() para volver.
function buildPDFHtml(proj, code, date, layers, imgUrl, meta, gps) {
  const now = new Date().toLocaleString("es");
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const closeAction = isIOS ? "history.back()" : "window.close()";
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
.strip{display:flex;height:20px;overflow:hidden;border:1px solid #ddd;margin-bottom:8px}.strip div{flex:1}
.body{display:grid;grid-template-columns:${imgUrl ? "110px 1fr" : "1fr"};gap:10px}
img.foto{width:100%;border:1px solid #ddd;object-fit:contain}
table{width:100%;border-collapse:collapse;font-size:7px}
th{background:#111;color:#fff;padding:3.5px 5px;text-align:left;font-size:6px;white-space:nowrap}
td{padding:3px 5px;border-bottom:1px solid #f0ece4;vertical-align:middle}
tr:nth-child(even) td{background:#faf8f4}
.sw{display:inline-block;width:22px;height:22px;border-radius:2px;border:1px solid rgba(0,0,0,.12);vertical-align:middle}
.lnum{font-weight:900;color:#8B6914;font-size:10px}.hex{color:#8B6914;font-weight:700}.ncs{color:#003880}.amer{color:#0044aa;font-size:6px}
.footer{margin-top:8px;padding-top:5px;border-top:1px solid #eee;font-size:5.5px;color:#ccc;display:flex;justify-content:space-between}
@media print{.topbar{display:none}.content{margin-top:0}@page{margin:7mm;size:A4}}
</style></head><body>
<div class="topbar">
  <button class="btn-print" onclick="window.print()">🖨 Imprimir / PDF</button>
  <button class="btn-close" onclick="${closeAction}">← Volver a la app</button>
</div>
<div class="content">
<div class="hdr">
  <div><div class="brand">STRATA<b>CHROMA</b></div><div style="font-size:6px;color:#aaa">FICHA TÉCNICA · CALA ESTRATIGRÁFICA · v18</div></div>
  <div class="info">Proyecto: <b>${proj}</b><br>Código: <b style="color:#8B6914">${code}</b><br>${date} · ${layers.length} capas<br>${now}</div>
</div>
<div class="mbox">
  <div><div class="mt">Resolución</div><div class="mv">${meta?.size || "—"}</div></div>
  <div><div class="mt">Fecha foto</div><div class="mv">${meta?.datetime || "—"}</div></div>
  <div><div class="mt">Dispositivo</div><div class="mv">${meta?.device || "—"}</div></div>
  <div class="gps">📍 Lat: <b>${gps?.lat || "N/A"}</b> &nbsp; Lon: <b>${gps?.lon || "N/A"}</b> &nbsp; Alt: <b>${gps?.alt || "N/A"}</b> &nbsp; Precisión: <b>${gps?.acc || "N/A"}</b></div>
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
</table></div>
</div>
<div class="footer"><span>STRATACHROMA v18 · MC 1M P50 CIE-LAB · NCS · RAL · HEX · American Colors</span><span>${now}</span></div>
</div>
</body></html>`;
}

function openPDF(proj, code, date, layers, imgUrl, meta, gps) {
  const html = buildPDFHtml(proj, code, date, layers, imgUrl, meta, gps);
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
      <div style={{ fontSize: 7, color: "#1c1b18", fontFamily: "monospace", letterSpacing: "0.16em" }}>STRATACHROMA · v18 · MC 1M P50 CIE-LAB · GPS</div>
      <h1 style={{ fontSize: 24, fontWeight: 300, color: "#e8e4d4", margin: 0, letterSpacing: ".05em" }}>STRATA<span style={{ color: G }}>CHROMA</span></h1>
    </div>
    {back && <button style={B(false, true)} onClick={back}>← Inicio</button>}
  </div>
));

const LayerRow = memo(({ layer, onCopy, copied }) => {
  const { r, g, b } = layer.rgb;
  const lum = (r * 299 + g * 587 + b * 114) / 1000, fg = lum > 140 ? "#111" : "#fff";
  return (
    <tr style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
      <td style={{ padding: "8px 10px", color: G, fontWeight: 900, fontSize: 16, width: 36, textAlign: "center" }}>{layer.pos}</td>
      <td style={{ padding: "8px 6px", width: 46 }}>
        <div onClick={() => onCopy(layer.hex)}
          style={{ width: 40, height: 40, background: layer.hex, borderRadius: 4, border: "1px solid rgba(255,255,255,.15)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: fg, fontSize: 5.5, fontFamily: "monospace", fontWeight: 700, writingMode: "vertical-rl", transform: "rotate(180deg)", opacity: .8 }}>{layer.hex}</span>
        </div>
      </td>
      <td style={{ padding: "8px 8px" }}>
        <div style={{ fontSize: 10, color: "#a09070", fontWeight: 600, marginBottom: 3 }}>{layer.name}</div>
        <div style={{ fontSize: 9, color: copied === layer.hex ? G : G, fontWeight: 700, cursor: "pointer" }} onClick={() => onCopy(layer.hex)}>{copied === layer.hex ? "✓ copiado" : layer.hex}</div>
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
  const [saving, setSaving] = useState(false), [saveMsg, setSaveMsg] = useState("");
  const [exps, setExps] = useState([]), [expLoading, setExpLoading] = useState(false);
  const [driveReady, setDriveReady] = useState(false);
  const [selProj, setSelProj] = useState(null);
  const [selCala, setSelCala] = useState(null);
  const [calas, setCalas] = useState([]);
  const [fichaData, setFichaData] = useState(null);
  const [fichaImg, setFichaImg] = useState(null);
  const fRef = useRef(), cRef = useRef(), imgFileRef = useRef(null);
  const [imgMeta, setImgMeta] = useState(null);
  const today = new Date().toISOString().slice(0, 10);

  const reset = () => { setImgData(null); setLayers([]); setStatus(""); setErr(null); setGps(null); setGpsStatus(""); setCopied(null); setSaving(false); setSaveMsg(""); setImgMeta(null); imgFileRef.current = null; };
  const home = () => { setScr("home"); reset(); };
  const copyVal = v => { navigator.clipboard?.writeText(v); setCopied(v); setTimeout(() => setCopied(null), 1500); };

  // Al montar: GPS automático + reconectar Drive si hay token guardado
  useEffect(() => {
    // GPS automático al abrir
    if (navigator.geolocation) {
      setGpsStatus("Obteniendo GPS…");
      navigator.geolocation.getCurrentPosition(
        p => {
          const pos = {
            lat: p.coords.latitude.toFixed(6),
            lon: p.coords.longitude.toFixed(6),
            alt: p.coords.altitude ? p.coords.altitude.toFixed(1) + "m" : "N/A",
            acc: p.coords.accuracy ? p.coords.accuracy.toFixed(0) + "m" : "N/A",
          };
          setGps(pos);
          setGpsStatus(`📍 ${pos.lat}, ${pos.lon}`);
        },
        () => setGpsStatus("GPS: permite acceso"),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
    // Reconectar Drive silencioso si hay token en localStorage
    const savedToken = localStorage.getItem("sc_gtoken");
    const savedExpiry = parseInt(localStorage.getItem("sc_gexpiry") || "0");
    if (savedToken && Date.now() < savedExpiry) {
      setDriveReady(true);
    } else {
      // Intentar reconexión silenciosa con GIS (sin popup)
      const tryReconnect = async () => {
        try {
          await getToken();
          setDriveReady(true);
        } catch { /* silencioso — usuario conecta manualmente si necesita */ }
      };
      // Esperar a que GIS cargue
      setTimeout(tryReconnect, 1500);
    }
  }, []);

  // Conectar Google Drive manualmente (muestra popup Google)
  const connectDrive = async () => {
    try {
      setDriveReady(false);
      await getToken();
      setDriveReady(true);
    } catch (e) {
      alert("Error conectando Drive: " + e.message.slice(0, 80));
    }
  };

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
    setScr("analyzing"); setErr(null); setLayers([]);
    try { const raw = await analyzeImage(imgData.file, setStatus); setLayers(raw.map(enrichLayer)); setScr("result"); }
    catch (e) { setErr(e.message); setScr("capture"); }
  };

  const handleSave = async () => {
    const p = projRef.current || projD, c = codeRef.current || codeD;
    let g = gps; if (!g) { g = await getGPS(); if (g) setGps(g); }

    // PDF siempre (local)
    openPDF(p, c, today, layers, imgData?.url, imgMeta, g);

    // Drive
    setSaving(true); setSaveMsg("Conectando a Drive…");
    try {
      const ids = await saveCala(p, c, today, layers, imgData?.b64, imgMeta, g, setSaveMsg);
      setSaveMsg(`✅ Guardado en Drive!\n📁 ${p} / ${c}_${today}`);
      setDriveReady(true);
      setTimeout(() => home(), 2500);
    } catch (e) {
      if (e.message.includes("Auth") || e.message.includes("popup")) {
        setSaveMsg("⚠ Necesitas autorizar Google Drive primero.\n→ Presiona 'Conectar Drive' en la pantalla principal.");
      } else {
        setSaveMsg(`⚠ ${e.message.slice(0, 100)}`);
      }
      setSaving(false);
    }
  };

  const dlCSV = () => {
    const p = projRef.current || projD, c = codeRef.current || codeD;
    const csv = [
      `# STRATACHROMA v18 | ${p} | ${c} | ${today}`,
      `# GPS: Lat:${gps?.lat || "N/A"} Lon:${gps?.lon || "N/A"} Alt:${gps?.alt || "N/A"}`,
      "Capa,Nombre,HEX,NCS,RAL,dE,American,R,G,B",
      ...layers.map(l => `${l.pos},"${l.name}",${l.hex},"${l.ncs}","${l.ral}",${l.ralDE},"${l.american}",${l.rgb.r},${l.rgb.g},${l.rgb.b}`)
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `${p}_${c}_${today}.csv`; a.click();
  };

  const loadExps = async () => {
    setExpLoading(true);
    try { setExps(await listFolders(ROOT_FOLDER_ID)); } catch { setExps([]); }
    finally { setExpLoading(false); }
  };

  const loadCalas = async (projId) => {
    setExpLoading(true);
    try { setCalas(await listFolders(projId)); } catch { setCalas([]); }
    finally { setExpLoading(false); }
  };

  const loadFicha = async (calaId) => {
    setExpLoading(true);
    setFichaData(null); setFichaImg(null);
    try {
      const files = await listFiles(calaId);
      // Leer JSON
      const jsonFile = files.find(f => f.name.endsWith(".json"));
      if (jsonFile) {
        const data = await readJSON(jsonFile.id);
        setFichaData(data);
      }
      // Leer foto si existe
      const imgFile = files.find(f => f.name.endsWith(".jpg") || f.name.endsWith(".jpeg") || f.name.endsWith(".png"));
      if (imgFile) {
        const dataUrl = await readImageAsDataURL(imgFile.id);
        setFichaImg(dataUrl);
      }
    } catch (e) { alert("Error cargando ficha: " + e.message); }
    finally { setExpLoading(false); }
  };

  const Wrap = ({ children, back }) => (
    <div style={{ minHeight: "100vh", background: "#0d0c0a", color: "#d4d0c0", fontFamily: "Georgia,serif", display: "flex", flexDirection: "column" }}>
      <Hdr back={back} />
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>{children}</div>
      <style>{`*{box-sizing:border-box}::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:rgba(200,169,110,.15)}
@keyframes pulse{0%,100%{opacity:.07}50%{opacity:.6}}input{-webkit-tap-highlight-color:transparent;-webkit-appearance:none}`}</style>
    </div>
  );

  // HOME
  if (scr === "home") return (
    <Wrap>
      <div style={{ padding: "36px 24px", maxWidth: 460 }}>
        {/* GPS status en home */}
        {gpsStatus && (
          <div style={{ fontSize: 8, color: gps ? "#60b060" : "#666", fontFamily: "monospace", marginBottom: 16, padding: "6px 10px", background: "rgba(0,80,40,.06)", borderRadius: 3 }}>
            {gps ? `📍 ${gps.lat}, ${gps.lon} · Alt:${gps.alt}` : `⏳ ${gpsStatus}`}
          </div>
        )}
        <div style={{ fontSize: 10, color: "#252320", lineHeight: 3.2, fontFamily: "monospace", marginBottom: 36 }}>
          Análisis estratigráfico de calas de pintura<br />
          <span style={{ color: G, fontSize: 9 }}>✦ MC 1,000,000 · P50 CIE-LAB · GPS altimetría</span><br />
          <span style={{ color: "#1a3355", fontSize: 9 }}>NCS · RAL · HEX · American Colors</span><br />
          PDF · CSV · Google Drive
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 320 }}>
          <button style={{ ...B(true), padding: "16px 24px", fontSize: 12 }} onClick={() => setScr("meta")}>+ Nueva Cala</button>
          <button style={{ ...B(false), padding: "14px 24px", fontSize: 11 }} onClick={() => { setScr("exps"); loadExps(); }}>📁 Expedientes Drive</button>
          {/* Mostrar estado Drive — solo botón de reconectar si falla */}
          <div style={{ fontSize: 8, fontFamily: "monospace", padding: "6px 0", color: driveReady ? "#60b060" : "#666" }}>
            {driveReady ? "✓ Google Drive conectado" : (
              <button style={{ ...B(false), padding: "10px 20px", fontSize: 10, borderColor: "rgba(100,160,100,.3)", color: "#60b060" }} onClick={connectDrive}>
                🔗 Conectar Google Drive
              </button>
            )}
          </div>
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
          <div style={{ fontSize: 8, color: "#2a2820", fontFamily: "monospace", marginTop: 7 }}>
            Drive: <span style={{ color: G }}>{projRef.current || projD || "Proyecto"}</span> / <span style={{ color: "#555" }}>{codeRef.current || codeD || "CAL-01"}_{today}</span>
          </div>
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
        {/* GPS — muestra automático si ya está, botón para actualizar */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
          <button style={{ ...B(gps ? true : false, true), flexShrink: 0 }} onClick={fetchGPS}>
            {gps ? "📍 GPS ✓" : "📍 GPS"}
          </button>
          <span style={{ fontSize: 9, color: gps ? "#60b060" : "#666", fontFamily: "monospace", lineHeight: 1.5 }}>
            {gps ? `${gps.lat}, ${gps.lon} · Alt:${gps.alt}` : gpsStatus || "Actualizando…"}
          </span>
        </div>
        {/* Foto */}
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
            <span style={{ fontSize: 9, color: "#2a2820", fontFamily: "monospace" }}> · {layers.length} capas · {today}</span>
          </div>
          {gps && <div style={{ padding: "7px 12px", background: "rgba(0,100,50,.06)", border: "1px solid rgba(0,150,80,.2)", borderRadius: 3, fontSize: 9, fontFamily: "monospace", color: "#60b060", marginBottom: 12 }}>
            📍 {gps.lat}, {gps.lon} · Alt:{gps.alt} · Prec:{gps.acc}
          </div>}
          {saveMsg && <div style={{ padding: "10px 14px", background: saveMsg.startsWith("✅") ? "rgba(60,180,80,.07)" : "rgba(180,60,0,.07)", border: `1px solid ${saveMsg.startsWith("✅") ? "rgba(60,180,80,.3)" : "rgba(180,60,0,.3)"}`, borderRadius: 3, fontSize: 10, fontFamily: "monospace", color: saveMsg.startsWith("✅") ? "#7ac87a" : "#c88060", marginBottom: 12, whiteSpace: "pre-line" }}>
            {saveMsg}
          </div>}
          {/* Franja */}
          <div style={{ display: "flex", height: 20, borderRadius: 3, overflow: "hidden", marginBottom: 12, border: "1px solid rgba(255,255,255,.07)" }}>
            {layers.map((l, i) => <div key={i} style={{ flex: 1, background: l.hex }} title={`C${l.pos}: ${l.name}`} />)}
          </div>
          <div style={{ fontSize: 8, color: G, fontFamily: "monospace", marginBottom: 14 }}>✦ MC 1M P50 CIE-LAB · {layers.length} capas{copied && <span style={{ marginLeft: 10 }}>✓ {copied}</span>}</div>
          {/* Layout */}
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
                    {["#", "Color", "Nombre / Códigos", "NCS · RAL", "American Colors"].map(h => (
                      <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontSize: 7.5, color: "#555", letterSpacing: ".1em", textTransform: "uppercase", background: "rgba(200,169,110,.06)", fontWeight: 400 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {layers.map((l, i) => <LayerRow key={i} layer={l} onCopy={copyVal} copied={copied} />)}
                </tbody>
              </table>
            </div>
          </div>
          {/* Acciones */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,.07)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <button style={{ ...B(true), width: "100%", padding: "16px", fontSize: 12, opacity: saving ? .5 : 1 }} onClick={handleSave} disabled={saving}>
              {saving ? (saveMsg.split("\n")[0] || "Guardando…") : "🖨 PDF  +  📁 Drive"}
            </button>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...B(false), flex: 1, fontSize: 10 }} onClick={dlCSV}>↓ CSV</button>
              <button style={{ ...B(false), flex: 1, fontSize: 10 }} onClick={() => { setScr("capture"); setSaveMsg(""); }}>← Foto</button>
              <button style={{ ...B(false), flex: 1, fontSize: 10 }} onClick={home}>⌂</button>
            </div>
          </div>
        </div>
      </Wrap>
    );
  }

  // ── EXPEDIENTES: lista de proyectos ──────────────────────────────────────────
  if (scr === "exps") return (
    <Wrap back={home}>
      <div style={{ padding: "20px 24px", maxWidth: 520 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 10, color: "#444", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: ".1em" }}>
            📁 Proyectos · {exps.length}
          </span>
          <button style={B(false, true)} onClick={loadExps}>↺</button>
        </div>
        {expLoading && <div style={{ fontSize: 11, color: "#555", fontFamily: "monospace", padding: "20px 0" }}>Cargando…</div>}
        {!expLoading && exps.length === 0 && (
          <div style={{ fontSize: 11, color: "#333", fontFamily: "monospace", fontStyle: "italic", padding: "24px 0" }}>
            Sin proyectos aún. Crea tu primera cala.
          </div>
        )}
        {exps.map((proj, i) => (
          <button key={i}
            onClick={() => { setSelProj(proj); setSelCala(null); setCalas([]); setScr("calas"); loadCalas(proj.id); }}
            style={{ display: "block", width: "100%", background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 4, padding: "16px", marginBottom: 8, cursor: "pointer", textAlign: "left", WebkitTapHighlightColor: "transparent" }}>
            <div style={{ fontSize: 13, color: G, fontFamily: "monospace", fontWeight: 700 }}>📁 {proj.name}</div>
            <div style={{ fontSize: 8, color: "#444", fontFamily: "monospace", marginTop: 4 }}>
              Creado: {new Date(proj.createdTime).toLocaleString("es")}
            </div>
            <div style={{ fontSize: 8, color: "#555", fontFamily: "monospace", marginTop: 2 }}>
              Toca para ver calas →
            </div>
          </button>
        ))}
        <div style={{ marginTop: 20 }}>
          <button style={{ ...B(true), width: "100%" }} onClick={() => { setScr("meta"); reset(); }}>+ Nueva Cala</button>
        </div>
      </div>
    </Wrap>
  );

  // ── EXPEDIENTES: calas de un proyecto ─────────────────────────────────────────
  if (scr === "calas") return (
    <Wrap back={() => { setScr("exps"); loadExps(); }}>
      <div style={{ padding: "20px 24px", maxWidth: 520 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, color: G, fontFamily: "monospace", fontWeight: 700 }}>📁 {selProj?.name}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
            <span style={{ fontSize: 9, color: "#444", fontFamily: "monospace" }}>{calas.length} calas</span>
            <button style={B(false, true)} onClick={() => loadCalas(selProj.id)}>↺</button>
          </div>
        </div>
        {expLoading && <div style={{ fontSize: 11, color: "#555", fontFamily: "monospace", padding: "16px 0" }}>Cargando calas…</div>}
        {!expLoading && calas.length === 0 && (
          <div style={{ fontSize: 11, color: "#333", fontFamily: "monospace", fontStyle: "italic", padding: "20px 0" }}>
            Sin calas en este proyecto.
          </div>
        )}
        {calas.map((cala, i) => {
          // nombre formato: CAL-01__2026-04-27
          const parts = cala.name.split("__");
          const code = parts[0] || cala.name;
          const date = parts[1] || "";
          return (
            <div key={i} style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 4, marginBottom: 8, overflow: "hidden" }}>
              <button
                onClick={() => { setSelCala(cala); setScr("ficha"); loadFicha(cala.id); }}
                style={{ display: "block", width: "100%", padding: "14px 16px", cursor: "pointer", textAlign: "left", background: "transparent", border: "none", WebkitTapHighlightColor: "transparent" }}>
                <div style={{ fontSize: 12, color: "#e8e4d4", fontFamily: "monospace", fontWeight: 600 }}>📋 {code}</div>
                <div style={{ fontSize: 8, color: "#555", fontFamily: "monospace", marginTop: 4 }}>
                  {date && `Fecha: ${date}`} · Toca para ver ficha →
                </div>
              </button>
              {/* Botón eliminar cala */}
              <div style={{ borderTop: "1px solid rgba(255,255,255,.05)", padding: "8px 16px", display: "flex", justifyContent: "flex-end" }}>
                <button
                  onClick={async () => {
                    if (!confirm(`¿Eliminar cala "${cala.name}"?\nSe moverá a la papelera de Drive.`)) return;
                    try {
                      await trashItem(cala.id);
                      loadCalas(selProj.id);
                    } catch (e) { alert("Error: " + e.message); }
                  }}
                  style={{ ...B(false, true), fontSize: 9, color: "#c87a7a", borderColor: "rgba(200,80,80,.2)" }}>
                  🗑 Eliminar
                </button>
              </div>
            </div>
          );
        })}
        <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
          <button style={{ ...B(true), flex: 1 }} onClick={() => {
            setProjD(selProj.name); projRef.current = selProj.name;
            setScr("meta");
          }}>+ Nueva Cala en {selProj?.name}</button>
        </div>
      </div>
    </Wrap>
  );

  // ── EXPEDIENTES: ficha de una cala ────────────────────────────────────────────
  if (scr === "ficha") return (
    <Wrap back={() => { setScr("calas"); }}>
      <div style={{ padding: "16px 20px" }}>
        {expLoading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 12 }}>
            <div style={{ fontSize: 9, color: G, fontFamily: "monospace" }}>Cargando ficha…</div>
            <div style={{ display: "flex", gap: 3 }}>
              {[...Array(8)].map((_, i) => <div key={i} style={{ width: 8, height: 8, borderRadius: 2, background: G, opacity: .3, animation: `pulse 1.2s ease-in-out ${i * .15}s infinite` }} />)}
            </div>
          </div>
        )}
        {!expLoading && fichaData && (
          <>
            {/* Header ficha */}
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 14, color: G, fontFamily: "monospace", fontWeight: 700 }}>{fichaData.proyecto}</span>
              <span style={{ fontSize: 10, color: "#555", fontFamily: "monospace" }}> / {fichaData.codigo}</span>
              <span style={{ fontSize: 8, color: "#2a2820", fontFamily: "monospace" }}> · {fichaData.capas?.length || 0} capas · {fichaData.fecha}</span>
            </div>
            {/* GPS */}
            {fichaData.gps?.latitud !== "N/A" && (
              <div style={{ padding: "6px 10px", background: "rgba(0,100,50,.06)", border: "1px solid rgba(0,150,80,.2)", borderRadius: 3, fontSize: 8, fontFamily: "monospace", color: "#60b060", marginBottom: 10 }}>
                📍 Lat:{fichaData.gps.latitud} Lon:{fichaData.gps.longitud} · Alt:{fichaData.gps.altimetria} · Prec:{fichaData.gps.precision}
              </div>
            )}
            {/* Meta foto */}
            {fichaData.metadatos_foto && (
              <div style={{ padding: "7px 10px", background: "rgba(200,169,110,.04)", border: "1px solid rgba(200,169,110,.1)", borderRadius: 3, fontSize: 8, fontFamily: "monospace", color: "#555", marginBottom: 10, lineHeight: 2 }}>
                📐 {fichaData.metadatos_foto.resolucion} · {fichaData.metadatos_foto.dispositivo}<br />
                📅 {fichaData.metadatos_foto.fecha_foto}
                {fichaData.metadatos_foto.iluminacion_medida && <> · 💡 {fichaData.metadatos_foto.iluminacion_medida}</>}
              </div>
            )}
            {/* Imagen si existe */}
            {fichaImg && (
              <img src={fichaImg} alt="Cala" style={{ maxWidth: "100%", maxHeight: 300, objectFit: "contain", borderRadius: 4, border: "1px solid rgba(255,255,255,.08)", display: "block", marginBottom: 12 }} />
            )}
            {/* Franja colores */}
            <div style={{ display: "flex", height: 18, borderRadius: 3, overflow: "hidden", marginBottom: 6, border: "1px solid rgba(255,255,255,.07)" }}>
              {fichaData.capas?.map((l, i) => <div key={i} style={{ flex: 1, background: l.hex }} title={`C${l.numero}: ${l.nombre}`} />)}
            </div>
            <div style={{ fontSize: 7.5, color: G, fontFamily: "monospace", marginBottom: 12 }}>
              ✦ {fichaData.capas?.length} capas · {fichaData.motor}
            </div>
            {/* Tabla capas */}
            <div style={{ overflowX: "auto", marginBottom: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 360 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,.12)" }}>
                    {["#", "Color", "Nombre", "HEX", "NCS", "RAL", "American Colors"].map(h => (
                      <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontSize: 7, color: "#555", letterSpacing: ".1em", textTransform: "uppercase", background: "rgba(200,169,110,.06)", fontWeight: 400 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fichaData.capas?.map((l, i) => {
                    const lum = l.rgb ? (l.rgb.r * 299 + l.rgb.g * 587 + l.rgb.b * 114) / 1000 : 128;
                    const fg = lum > 140 ? "#111" : "#fff";
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}>
                        <td style={{ padding: "6px 8px", color: G, fontWeight: 900, fontSize: 14 }}>{l.numero}</td>
                        <td style={{ padding: "6px 6px" }}>
                          <div onClick={() => copyVal(l.hex)} style={{ width: 36, height: 36, background: l.hex, borderRadius: 3, border: "1px solid rgba(255,255,255,.15)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ color: fg, fontSize: 5, fontFamily: "monospace", fontWeight: 700, writingMode: "vertical-rl", transform: "rotate(180deg)", opacity: .8 }}>{l.hex}</span>
                          </div>
                        </td>
                        <td style={{ padding: "6px 8px", color: "#a09070", fontWeight: 600, fontSize: 9, whiteSpace: "nowrap" }}>{l.nombre}</td>
                        <td style={{ padding: "6px 8px", color: G, fontWeight: 700, fontSize: 9, cursor: "pointer" }} onClick={() => copyVal(l.hex)}>{copied === l.hex ? "✓" : l.hex}</td>
                        <td style={{ padding: "6px 8px", color: "#5090d0", fontSize: 8.5, whiteSpace: "nowrap" }}>{l.ncs}</td>
                        <td style={{ padding: "6px 8px", color: "#bbb", fontSize: 8, whiteSpace: "nowrap" }}>{l.ral}</td>
                        <td style={{ padding: "6px 8px", color: "#5580bb", fontSize: 8 }}>{l.american_colors}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Acciones */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,.07)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <button style={{ ...B(true), width: "100%", padding: "14px" }}
                onClick={() => openPDF(fichaData.proyecto, fichaData.codigo, fichaData.fecha, fichaData.capas?.map(l => ({ pos: l.numero, name: l.nombre, hex: l.hex, ncs: l.ncs, ral: l.ral, ralDE: l.ral_dE || "—", american: l.american_colors, rgb: l.rgb || { r: 128, g: 128, b: 128 }, lab: l.lab || {} })) || [], fichaImg, fichaData.metadatos_foto, fichaData.gps)}>
                🖨 Imprimir PDF
              </button>
              <button style={{ ...B(false, true), color: "#c87a7a", borderColor: "rgba(200,80,80,.25)", padding: "11px" }}
                onClick={async () => {
                  if (!confirm(`¿Eliminar cala "${selCala?.name}"?\nSe moverá a la papelera de Drive.`)) return;
                  try {
                    await trashItem(selCala.id);
                    setScr("calas");
                    loadCalas(selProj.id);
                  } catch (e) { alert("Error: " + e.message); }
                }}>
                🗑 Eliminar esta cala
              </button>
              <button style={{ ...B(true), padding: "11px" }}
                onClick={() => { setProjD(fichaData.proyecto); projRef.current = fichaData.proyecto; setScr("meta"); }}>
                + Nueva Cala en {fichaData.proyecto}
              </button>
            </div>
          </>
        )}
      </div>
    </Wrap>
  );

  return null;
}
