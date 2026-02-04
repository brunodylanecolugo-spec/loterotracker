# 🎰 LoteroTracker

**Rastrea automáticamente tus premios de TuLotero** desde tu correo Gmail, con almacenamiento local y backup en Google Drive.

## ✨ Características

- 🔐 **100% Privado**: Todos los datos se guardan en tu dispositivo y tu Drive personal
- 📧 **Lectura automática**: Escanea correos de TuLotero buscando premios
- 📱 **PWA Instalable**: Funciona como app nativa en Android/iOS
- ☁️ **Backup automático**: Guarda copias de seguridad en Google Drive
- 📊 **Estadísticas**: Visualiza tus premios por juego y por mes
- 🔄 **Offline**: Funciona sin conexión gracias al Service Worker

## 🚀 Configuración Rápida

### Paso 1: Crear Proyecto en Google Cloud Console

1. Ve a [Google Cloud Console](https://console.cloud.google.com)
2. Crea un nuevo proyecto (ej: "LoteroTracker")
3. Ve a **APIs y Servicios** > **Biblioteca**
4. Busca y habilita:
   - **Gmail API**
   - **Google Drive API**

### Paso 2: Configurar Pantalla de Consentimiento OAuth

1. Ve a **APIs y Servicios** > **Pantalla de consentimiento OAuth**
2. Selecciona **Externo** (o Interno si es G Suite)
3. Rellena:
   - Nombre de la app: `LoteroTracker`
   - Email de soporte
   - Logo (opcional)
4. En **Scopes**, añade:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/drive.file`
5. En **Usuarios de prueba**, añade tu email (obligatorio mientras esté en modo "Pruebas")

### Paso 3: Crear Credenciales OAuth

1. Ve a **APIs y Servicios** > **Credenciales**
2. Click en **Crear credenciales** > **ID de cliente de OAuth**
3. Tipo: **Aplicación web**
4. Nombre: `LoteroTracker Web`
5. **Orígenes de JavaScript autorizados**:
   ```
   http://localhost:8080
   http://localhost:3000
   http://127.0.0.1:8080
   ```
6. **URIs de redirección autorizados**:
   ```
   http://localhost:8080
   http://localhost:8080/
   http://localhost:3000
   http://127.0.0.1:8080
   ```
7. Click en **Crear** y copia el **Client ID**

### Paso 4: Configurar la Aplicación

1. Abre `app.js`
2. Busca la sección `CONFIG` al inicio del archivo
3. Reemplaza `TU_CLIENT_ID.apps.googleusercontent.com` con tu Client ID real:

```javascript
const CONFIG = {
    CLIENT_ID: 'xxxxx-xxxxx.apps.googleusercontent.com',
    // ...resto de la configuración
};
```

### Paso 5: Ejecutar la Aplicación

**Opción A - Servidor Python (recomendado):**
```bash
cd tulotero-tracker
python3 -m http.server 8080
```

**Opción B - Node.js con http-server:**
```bash
npm install -g http-server
cd tulotero-tracker
http-server -p 8080
```

**Opción C - PHP:**
```bash
cd tulotero-tracker
php -S localhost:8080
```

Luego abre: http://localhost:8080

## 📱 Instalar como App

### Android
1. Abre la web en Chrome
2. Pulsa el menú (⋮) > "Añadir a pantalla de inicio"
3. O acepta el banner de instalación que aparece

### iOS
1. Abre la web en Safari
2. Pulsa el botón de compartir
3. Selecciona "Añadir a pantalla de inicio"

## 🔧 Estructura del Proyecto

```
tulotero-tracker/
├── index.html      # Página principal con UI
├── app.js          # Lógica de la aplicación
├── sw.js           # Service Worker para offline
├── manifest.json   # Configuración PWA
├── icon.svg        # Icono de la aplicación
└── README.md       # Este archivo
```

## 🗄️ Almacenamiento de Datos

### Local (IndexedDB)
Los datos se guardan en el navegador usando IndexedDB:
- **premios**: Lista de premios con todos los detalles
- **config**: Configuración y última sincronización
- **syncs**: Historial de sincronizaciones

### Google Drive
El backup se guarda en tu Drive personal:
- Carpeta: `LoteroTracker/`
- Archivo: `loterotracker_backup.json`

## 📧 Correos que Detecta

La app busca correos de `info@tulotero.es` con asunto que contenga "Premio en el boleto" y extrae:

| Campo | Descripción |
|-------|-------------|
| Código | Identificador del boleto (ej: CUZWKLF25934) |
| Juego | Euromillones, Primitiva, Bonoloto, El Gordo, etc. |
| Importe | Cantidad ganada |
| Fecha Sorteo | Fecha del sorteo |
| Administración | Administración de lotería |
| Grupo | Nombre del grupo si es participación compartida |
| Combinación | Números ganadores |

## 🛡️ Privacidad

- **Sin servidor propio**: Todo el código se ejecuta en tu navegador
- **Datos locales**: IndexedDB almacena todo en tu dispositivo
- **Tu Drive**: El backup va a tu propio Google Drive
- **Scopes mínimos**: Solo pedimos permisos de lectura de Gmail y escritura en una carpeta de Drive
- **Sin tracking**: No hay analytics ni telemetría

## 🐛 Solución de Problemas

### "Error 400: redirect_uri_mismatch"
- Verifica que la URL en tu navegador coincida exactamente con la configurada en las credenciales OAuth
- Incluye o excluye la barra final `/` según corresponda

### "Este app aún no está verificada"
- Normal en modo desarrollo
- Haz clic en "Avanzado" > "Ir a LoteroTracker (no seguro)"
- Esto es seguro porque TÚ eres el desarrollador

### No encuentra correos
- Asegúrate de que los correos de TuLotero están en tu bandeja de entrada (no spam)
- Verifica que el remitente es `info@tulotero.es`

### La app no se instala
- Asegúrate de acceder por HTTPS (en producción) o localhost
- Chrome en Android es el más compatible

## 📝 Próximas Funciones

- [ ] Sincronización automática semanal (Background Sync)
- [ ] Notificaciones push de nuevos premios
- [ ] Exportar datos a Excel
- [ ] Compartir resumen con el grupo
- [ ] Modo oscuro
- [ ] Calculadora de participaciones en grupo

## 📄 Licencia

MIT - Usa, modifica y comparte libremente.

---

Hecho con ❤️ para la comunidad lotera
