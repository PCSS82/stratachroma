// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE DRIVE — OAuth2 via Google Identity Services (GIS)
// Sin backend. El token se gestiona en el browser con popup de Google.
// Funciona en HTTPS (Vercel). Para 2 usuarios con la misma cuenta Google.
// ═══════════════════════════════════════════════════════════════════════════════

// ⚠️  REEMPLAZA CON TU CLIENT ID DE GOOGLE CLOUD CONSOLE
// Instrucciones en README.md
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "TU_CLIENT_ID_AQUI.apps.googleusercontent.com";
export const ROOT_FOLDER_ID = import.meta.env.VITE_DRIVE_ROOT || "1DHDkWIlGKwPMJ6AcjhcwjNerQh8QPOnb";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const SCOPE = "https://www.googleapis.com/auth/drive.file";

let tokenClient = null;
let accessToken = null;
let tokenExpiry = 0;

// Inicializar GIS token client
function initTokenClient() {
  if (tokenClient) return;
  if (!window.google?.accounts?.oauth2) {
    throw new Error("Google Identity Services no cargó. Verifica tu conexión.");
  }
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPE,
    callback: () => {}, // se sobreescribe en getToken()
  });
}

// Obtener token (muestra popup Google si expiró)
export function getToken() {
  return new Promise((resolve, reject) => {
    if (accessToken && Date.now() < tokenExpiry) {
      resolve(accessToken);
      return;
    }
    try {
      initTokenClient();
    } catch (e) {
      reject(e);
      return;
    }
    tokenClient.callback = (resp) => {
      if (resp.error) {
        reject(new Error("Auth Google: " + resp.error));
        return;
      }
      accessToken = resp.access_token;
      tokenExpiry = Date.now() + (resp.expires_in - 60) * 1000;
      resolve(accessToken);
    };
    // prompt="" intenta token silencioso primero, "" = solo si es necesario
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

// ── API helpers ────────────────────────────────────────────────────────────────
async function driveGET(path, params = "") {
  const token = await getToken();
  const url = `${DRIVE_API}${path}${params ? "?" + params : ""}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Drive GET ${r.status}: ${await r.text().then(t => t.slice(0, 100))}`);
  return r.json();
}

async function drivePOST(path, body) {
  const token = await getToken();
  const r = await fetch(`${DRIVE_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Drive POST ${r.status}: ${await r.text().then(t => t.slice(0, 100))}`);
  return r.json();
}

async function driveUploadMultipart(name, parentId, mimeType, content) {
  const token = await getToken();
  const meta = JSON.stringify({ name, parents: [parentId] });
  const blob = typeof content === "string" ? new Blob([content], { type: mimeType }) : content;
  const boundary = "sc18_" + Date.now();
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${meta}\r\n`,
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ]);
  const r = await fetch(`${DRIVE_UPLOAD}/files?uploadType=multipart`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!r.ok) throw new Error(`Drive upload ${r.status}: ${await r.text().then(t => t.slice(0, 100))}`);
  return r.json();
}

// ── OPERACIONES DRIVE ──────────────────────────────────────────────────────────
export async function createFolder(name, parentId) {
  const r = await drivePOST("/files", {
    name,
    mimeType: "application/vnd.google-apps.folder",
    parents: [parentId],
  });
  return r.id;
}

export async function findOrCreateFolder(name, parentId) {
  // Buscar si ya existe
  const res = await driveGET(
    "/files",
    `q=name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)&pageSize=1`
  );
  if (res.files?.length > 0) return res.files[0].id;
  return createFolder(name, parentId);
}

export async function uploadText(filename, parentId, mimeType, text) {
  return driveUploadMultipart(filename, parentId, mimeType, text);
}

export async function uploadImage(filename, parentId, base64data, mimeType = "image/jpeg") {
  // Convertir base64 a Blob
  const byteCharacters = atob(base64data);
  const byteArray = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) byteArray[i] = byteCharacters.charCodeAt(i);
  const blob = new Blob([byteArray], { type: mimeType });
  return driveUploadMultipart(filename, parentId, mimeType, blob);
}

export async function listFolders(parentId) {
  const res = await driveGET(
    "/files",
    `q='${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name,createdTime)&orderBy=createdTime desc&pageSize=50`
  );
  return res.files || [];
}

// ── GUARDADO COMPLETO ──────────────────────────────────────────────────────────
export async function saveCala(proj, code, date, layers, imgBase64, imgMeta, gps, onStatus) {
  // 1. Carpeta proyecto (reutilizar si existe)
  onStatus("📁 Carpeta proyecto…");
  const projId = await findOrCreateFolder(proj, ROOT_FOLDER_ID);

  // 2. Subcarpeta cala (siempre nueva)
  onStatus(`📁 Subcarpeta ${code}…`);
  const calaId = await createFolder(`${code}__${date}`, projId);

  // 3. JSON trazabilidad
  onStatus("💾 JSON…");
  const json = JSON.stringify({
    version: "SC_v18",
    proyecto: proj, codigo: code, fecha: date,
    timestamp: new Date().toISOString(),
    motor: "MC_1M_P50_CIE-LAB",
    gps: {
      latitud: gps?.lat || "N/A",
      longitud: gps?.lon || "N/A",
      altimetria: gps?.alt || "N/A",
      precision: gps?.acc || "N/A",
    },
    metadatos_foto: {
      resolucion: imgMeta?.size || "",
      fecha_foto: imgMeta?.datetime || "",
      dispositivo: imgMeta?.device || "",
      archivo: imgMeta?.filename || "",
      tamano_kb: imgMeta?.filesize || "",
      iluminacion_medida: layers[0]?.bgInfo || "",
    },
    capas: layers.map(l => ({
      numero: l.pos, nombre: l.name,
      hex: l.hex, ncs: l.ncs,
      ral: l.ral, ral_dE: l.ralDE,
      american_colors: l.american,
      rgb: l.rgb, lab: l.lab,
    })),
  }, null, 2);
  await uploadText(`${proj}_${code}.json`, calaId, "application/json", json);

  // 4. CSV auditoría
  onStatus("📊 CSV…");
  const csv = [
    `# STRATACHROMA v18 | ${proj} | ${code} | ${date}`,
    `# GPS: Lat:${gps?.lat || "N/A"} Lon:${gps?.lon || "N/A"} Alt:${gps?.alt || "N/A"} Precisión:${gps?.acc || "N/A"}`,
    `# Res: ${imgMeta?.size || ""} | ${imgMeta?.device || ""} | Ilum: ${layers[0]?.bgInfo || ""}`,
    "",
    "Capa,Nombre,HEX,NCS,RAL,RAL_dE,American_Colors,R,G,B,LAB_L,LAB_a,LAB_b",
    ...layers.map(l =>
      `${l.pos},"${l.name}",${l.hex},"${l.ncs}","${l.ral}",${l.ralDE},"${l.american}",${l.rgb.r},${l.rgb.g},${l.rgb.b},${l.lab?.L || ""},${l.lab?.a || ""},${l.lab?.b || ""}`
    ),
  ].join("\n");
  await uploadText(`${proj}_${code}.csv`, calaId, "text/csv", csv);

  // 5. Foto
  if (imgBase64) {
    onStatus("🖼 Foto…");
    await uploadImage(`${proj}_${code}_foto.jpg`, calaId, imgBase64);
  }

  return { projId, calaId };
}

// ── EXPEDIENTES — navegar, leer, eliminar ──────────────────────────────────────

// Listar archivos (no carpetas) dentro de una carpeta
export async function listFiles(parentId) {
  const res = await driveGET(
    "/files",
    `q='${parentId}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name,mimeType,createdTime,size)&orderBy=createdTime desc&pageSize=50`
  );
  return res.files || [];
}

// Leer contenido de un archivo JSON de Drive
export async function readJSON(fileId) {
  const token = await getToken();
  const r = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Read ${r.status}`);
  return r.json();
}

// Leer imagen como data URL
export async function readImageAsDataURL(fileId) {
  const token = await getToken();
  const r = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Read img ${r.status}`);
  const blob = await r.blob();
  return new Promise(res => {
    const reader = new FileReader();
    reader.onload = e => res(e.target.result);
    reader.readAsDataURL(blob);
  });
}

// Eliminar archivo o carpeta (manda a papelera)
export async function trashItem(fileId) {
  const token = await getToken();
  const r = await fetch(`${DRIVE_API}/files/${fileId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
  if (!r.ok) throw new Error(`Trash ${r.status}`);
  return r.json();
}
