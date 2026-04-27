// ═══════════════════════════════════════════════════════════════════════════════
// TABLAS DE COLOR — NCS, RAL, American Colors
// ═══════════════════════════════════════════════════════════════════════════════
import { rgbToLab } from './motor.js';

const RAL_DB = [
  ["RAL 1001","Beige",[194,176,120]],["RAL 1002","Amarillo arena",[197,176,96]],["RAL 1011","Beige pardo",[166,130,62]],
  ["RAL 1013","Blanco perla",[224,215,185]],["RAL 1014","Marfil",[219,202,138]],["RAL 1015","Marfil claro",[229,216,172]],
  ["RAL 1017","Amarillo azafrán",[251,190,21]],["RAL 1019","Beige grisáceo",[160,143,101]],["RAL 1020","Amarillo oliva",[162,148,89]],
  ["RAL 1024","Amarillo ocre",[187,152,73]],["RAL 1027","Curry",[162,124,0]],["RAL 2001","Naranja rojo",[182,62,22]],
  ["RAL 2003","Naranja pastel",[255,136,54]],["RAL 2012","Naranja salmón",[213,117,80]],["RAL 3009","Rojo óxido",[101,47,41]],
  ["RAL 3012","Rojo beige",[193,135,107]],["RAL 3014","Rojo viejo",[204,133,126]],["RAL 3015","Rosa claro",[228,190,189]],
  ["RAL 3022","Rojo salmón",[209,110,85]],["RAL 5007","Azul brillante",[54,105,155]],["RAL 5008","Azul gris",[39,72,95]],
  ["RAL 5009","Azul azure",[42,100,150]],["RAL 5012","Azul claro",[52,136,188]],["RAL 5014","Azul paloma",[93,134,168]],
  ["RAL 5015","Azul cielo",[34,113,179]],["RAL 5018","Azul turquesa",[0,122,115]],["RAL 5023","Azul distante",[72,107,154]],
  ["RAL 5024","Azul pastel",[105,155,184]],["RAL 5025","Azul perlado",[37,109,123]],["RAL 6003","Verde oliva",[64,86,42]],
  ["RAL 6013","Verde caña",[121,131,96]],["RAL 6019","Verde blancuzco",[176,208,172]],["RAL 6021","Verde pálido",[122,159,117]],
  ["RAL 6027","Verde claro",[125,188,176]],["RAL 6029","Verde menta",[0,131,81]],["RAL 7000","Gris ardilla",[122,142,145]],
  ["RAL 7001","Gris plata",[138,155,166]],["RAL 7002","Gris oliva",[130,128,103]],["RAL 7005","Gris ratón",[100,107,101]],
  ["RAL 7006","Gris beige",[111,104,90]],["RAL 7023","Gris concreto",[120,126,120]],["RAL 7030","Gris piedra",[139,142,133]],
  ["RAL 7032","Gris guijarro",[182,180,158]],["RAL 7034","Gris amarillo",[144,141,116]],["RAL 7035","Gris claro",[195,202,201]],
  ["RAL 7036","Gris platino",[151,148,141]],["RAL 7037","Gris polvo",[124,130,130]],["RAL 7038","Gris ágata",[181,184,180]],
  ["RAL 7039","Gris cuarzo",[109,108,100]],["RAL 7044","Gris seda",[181,182,178]],["RAL 7047","Gris telégris",[199,204,205]],
  ["RAL 8001","Marrón ocre",[146,99,45]],["RAL 8003","Marrón barro",[120,74,39]],["RAL 8007","Marrón ciervo",[99,63,37]],
  ["RAL 8011","Marrón nuez",[75,50,32]],["RAL 8014","Marrón sepia",[63,46,33]],["RAL 8017","Marrón chocolate",[60,37,30]],
  ["RAL 8019","Gris pardo",[57,46,43]],["RAL 8024","Marrón beige",[131,92,59]],["RAL 8025","Marrón pálido",[114,89,69]],
  ["RAL 8028","Marrón tierra",[82,61,44]],["RAL 9001","Blanco crema",[233,224,202]],["RAL 9002","Blanco gris",[215,213,203]],
  ["RAL 9003","Blanco señales",[244,244,244]],["RAL 9006","Blanco aluminio",[166,168,166]],["RAL 9010","Blanco puro",[250,250,250]],
  ["RAL 9016","Blanco tráfico",[240,242,234]],["RAL 9018","Blanco papiro",[215,221,212]],
];

export function nearRAL(r, g, b) {
  const [Lq, aq, bq] = rgbToLab(r, g, b);
  let best = RAL_DB[0], bD = Infinity;
  for (const e of RAL_DB) {
    const [Le, ae, be] = rgbToLab(e[2][0], e[2][1], e[2][2]);
    const d = (Lq - Le) ** 2 + (aq - ae) ** 2 + (bq - be) ** 2;
    if (d < bD) { bD = d; best = e; }
  }
  return { code: best[0], name: best[1], dE: Math.round(Math.sqrt(bD)) };
}

export function toNCS(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const mx = Math.max(rn, gn, bn), mn = Math.min(rn, gn, bn), d = mx - mn;
  const S = Math.round((1 - mx) * 100), C = mx === 0 ? 0 : Math.round(d / mx * 100);
  if (C < 6 || d < 0.06) return `NCS S ${String(S).padStart(2, "0")}00-N`;
  let h = 0;
  if (mx === rn) h = ((gn - bn) / d * 60 + 360) % 360;
  else if (mx === gn) h = (bn - rn) / d * 60 + 120;
  else h = (rn - gn) / d * 60 + 240;
  let hue;
  if (h < 30) hue = `Y${90 - Math.round(h / 30 * 10) * 10 || 10}R`;
  else if (h < 60) hue = "Y";
  else if (h < 90) hue = `G${Math.round((90 - h) / 30 * 90)}Y`;
  else if (h < 120) hue = `G${Math.round((120 - h) / 30 * 50)}Y`;
  else if (h < 180) hue = h < 150 ? "G" : `B${Math.round((180 - h) / 30 * 50)}G`;
  else if (h < 240) hue = h < 210 ? "B" : "B";
  else if (h < 300) hue = h < 270 ? `R${Math.round((300 - h) / 60 * 70)}B` : `R${Math.round((h - 240) / 60 * 30)}B`;
  else hue = "R";
  return `NCS S ${String(S).padStart(2, "0")}${String(C).padStart(2, "0")}-${hue}`;
}

export function toAmerican(r, g, b) {
  const br = (r * 299 + g * 587 + b * 114) / 1000;
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const mx = Math.max(rn, gn, bn), mn = Math.min(rn, gn, bn), d = mx - mn;
  const sat = mx === 0 ? 0 : d / mx;
  const wP = Math.round(br / 255 * 100), bP = Math.round((1 - mx) * 100);
  if (sat < 0.10) return `Blanco:${wP}% Negro:${100 - wP}%`;
  let h = 0;
  if (mx === rn) h = ((gn - bn) / d * 60 + 360) % 360;
  else if (mx === gn) h = (bn - rn) / d * 60 + 120;
  else h = (rn - gn) / d * 60 + 240;
  const cP = Math.round(sat * (1 - bP / 100) * 80);
  const cn = h < 25 || h >= 335 ? "Rojo" : h < 75 ? "Amarillo" : h < 150 ? "Verde" : h < 195 ? "Verde-Azul" : h < 260 ? "Azul" : "Violeta";
  const pts = [];
  if (wP > 15) pts.push(`Blanco:${wP}%`);
  if (bP > 8) pts.push(`Negro:${bP}%`);
  pts.push(`${cn}:${cP}%`);
  return pts.join(" + ");
}

export function layerName(r, g, b) {
  const br = (r * 299 + g * 587 + b * 114) / 1000;
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const mx = Math.max(rn, gn, bn), mn = Math.min(rn, gn, bn), d = mx - mn;
  const sat = mx === 0 ? 0 : d / mx;
  if (sat < 0.12) {
    if (br > 228) return "Blanco / Cal";
    if (br > 192) return "Blanco sucio";
    if (br > 155) return "Gris muy claro";
    if (br > 118) return "Gris claro";
    if (br > 82) return "Gris medio";
    if (br > 48) return "Gris oscuro";
    return "Marrón muy oscuro";
  }
  let h = 0;
  if (mx === rn) h = ((gn - bn) / d * 60 + 360) % 360;
  else if (mx === gn) h = (bn - rn) / d * 60 + 120;
  else h = (rn - gn) / d * 60 + 240;
  const lum = br / 255;
  if (h < 22 || h >= 335) return sat < 0.35 ? "Rosa envejecido" : "Rojo";
  if (h < 45) return lum < 0.35 ? "Marrón rojizo" : "Naranja / Teja";
  if (h < 70) return lum < 0.55 ? "Ocre / Dorado" : "Amarillo";
  if (h < 105) return lum < 0.50 ? "Oliva / Musgo" : "Verde amarillento";
  if (h < 150) return sat < 0.28 ? "Verde grisáceo" : "Verde";
  if (h < 185) return "Verde azulado";
  if (h < 258) return sat < 0.28 ? "Azul grisáceo" : "Azul";
  if (h < 295) return "Azul violeta";
  return "Violeta";
}

export function enrichLayer(layer) {
  const { r, g, b } = layer.rgb;
  const ral = nearRAL(r, g, b);
  return {
    ...layer,
    name: layerName(r, g, b),
    ral: `${ral.code} — ${ral.name}`,
    ralDE: ral.dE,
    ncs: toNCS(r, g, b),
    american: toAmerican(r, g, b),
  };
}
