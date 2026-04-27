# STRATACHROMA v18
Análisis estratigráfico de calas de pintura · MC 1M P50 CIE-LAB · GPS · Google Drive

## Deploy en 10 minutos (gratis)

### Paso 1 — Crear cuenta GitHub
1. Ve a https://github.com/signup → crea cuenta gratis
2. Crea repo nuevo: "stratachroma" → Public o Private

### Paso 2 — Subir código a GitHub
```bash
cd stratachroma
git init
git add .
git commit -m "STRATACHROMA v18"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/stratachroma.git
git push -u origin main
```

### Paso 3 — Google Cloud Console (5 min)
1. Ve a https://console.cloud.google.com
2. Crea proyecto nuevo: "StrataChroma"
3. APIs & Services → Enable APIs → busca "Google Drive API" → Enable
4. APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
5. Application type: **Web application**
6. Name: "StrataChroma"
7. Authorized JavaScript origins:
   - `http://localhost:5173` (desarrollo)
   - `https://TU_APP.vercel.app` (producción — lo sabrás en Paso 4)
8. Copia el **Client ID** (termina en `.apps.googleusercontent.com`)

### Paso 4 — Deploy en Vercel (gratis)
1. Ve a https://vercel.com → "Sign up with GitHub"
2. "Add New Project" → importa tu repo "stratachroma"
3. Framework: **Vite**
4. Environment Variables:
   - `VITE_GOOGLE_CLIENT_ID` = tu Client ID del paso 3
   - `VITE_DRIVE_ROOT` = `1DHDkWIlGKwPMJ6AcjhcwjNerQh8QPOnb`
5. Deploy → te da URL tipo `stratachroma-xxx.vercel.app`
6. **Vuelve a Google Cloud Console** y agrega esa URL a "Authorized JavaScript origins"

### Paso 5 — Desarrollo local
```bash
npm install
cp .env.example .env.local
# Edita .env.local con tu Client ID
npm run dev
```

## GPS
- Android Chrome: funciona automáticamente en HTTPS
- iOS Safari: funciona en HTTPS · al primer uso pide permiso
- En desarrollo local (localhost): funciona también

## Drive
- Primera vez: popup de Google para autorizar
- Después: silencioso (token en memoria de sesión)
- Guarda en: tu Drive → carpeta `{Proyecto}/{Cala}_{fecha}/`

## Estructura Drive
```
StrataChroma_Root/
  {Proyecto}/
    {Codigo}__{Fecha}/
      {Proyecto}_{Codigo}.json   ← trazabilidad completa
      {Proyecto}_{Codigo}.csv    ← auditoría
      {Proyecto}_{Codigo}_foto.jpg
```
