/**
 * LoteroTracker - Aplicación 100% cliente para rastrear premios de TuLotero
 * 
 * Características:
 * - Autenticación OAuth con Google (Gmail + Drive)
 * - Parser de correos de TuLotero
 * - Almacenamiento local con IndexedDB
 * - Backup automático a Google Drive
 * - PWA instalable
 */

// ============================================
// CONFIGURACIÓN - REEMPLAZA CON TUS CREDENCIALES
// ============================================
const CONFIG = {
    // Obtén estas credenciales en https://console.cloud.google.com
    // 1. Crea un proyecto nuevo
    // 2. Habilita Gmail API y Google Drive API
    // 3. Crea credenciales OAuth 2.0 para "Aplicación web"
    // 4. Añade http://localhost:8080 a los orígenes autorizados
    // 5. Añade http://localhost:8080 a las URIs de redirección
    CLIENT_ID: '496619647020-dp42vrfilmdht9hhnukc9oanjivqngj1.apps.googleusercontent.com',
    
    // Scopes necesarios
    SCOPES: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/drive.file'
    ].join(' '),
    
    // Nombre del archivo de backup en Drive
    BACKUP_FILENAME: 'loterotracker_backup.json',
    
    // Carpeta en Drive para el backup
    DRIVE_FOLDER: 'LoteroTracker'
};

// ============================================
// BASE DE DATOS LOCAL (IndexedDB con wrapper simple)
// ============================================
class LocalDatabase {
    constructor() {
        this.dbName = 'LoteroTrackerDB';
        this.dbVersion = 1;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Tabla de premios
                if (!db.objectStoreNames.contains('premios')) {
                    const premiosStore = db.createObjectStore('premios', { keyPath: 'id', autoIncrement: true });
                    premiosStore.createIndex('codigo', 'codigo', { unique: true });
                    premiosStore.createIndex('fecha', 'fecha', { unique: false });
                    premiosStore.createIndex('juego', 'juego', { unique: false });
                }

                // Tabla de configuración
                if (!db.objectStoreNames.contains('config')) {
                    db.createObjectStore('config', { keyPath: 'key' });
                }

                // Tabla de sincronizaciones
                if (!db.objectStoreNames.contains('syncs')) {
                    const syncsStore = db.createObjectStore('syncs', { keyPath: 'id', autoIncrement: true });
                    syncsStore.createIndex('fecha', 'fecha', { unique: false });
                }
            };
        });
    }

    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async get(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.get(value);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async put(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async add(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.add(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async delete(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clear(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clearAll() {
        await this.clear('premios');
        await this.clear('config');
        await this.clear('syncs');
    }
}

// ============================================
// AUTENTICACIÓN GOOGLE OAUTH
// ============================================
class GoogleAuth {
    constructor() {
        this.accessToken = null;
        this.user = null;
    }

    // Inicia el flujo OAuth
    async login() {
        // Construir URL de autorización
        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.set('client_id', CONFIG.CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', window.location.origin + window.location.pathname);
        authUrl.searchParams.set('response_type', 'token');
        authUrl.searchParams.set('scope', CONFIG.SCOPES);
        authUrl.searchParams.set('include_granted_scopes', 'true');
        authUrl.searchParams.set('prompt', 'consent');

        // Redirigir a Google
        window.location.href = authUrl.toString();
    }

    // Procesa el token de la URL después del redirect
    handleRedirect() {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        
        if (params.has('access_token')) {
            this.accessToken = params.get('access_token');
            
            // Guardar en sessionStorage (temporal, se pierde al cerrar)
            sessionStorage.setItem('google_token', this.accessToken);
            
            // Limpiar URL
            history.replaceState(null, '', window.location.pathname);
            
            return true;
        }
        
        // Intentar recuperar de sessionStorage
        const savedToken = sessionStorage.getItem('google_token');
        if (savedToken) {
            this.accessToken = savedToken;
            return true;
        }
        
        return false;
    }

    // Obtiene información del usuario
    async getUserInfo() {
        if (!this.accessToken) return null;

        try {
            const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    this.logout();
                    return null;
                }
                throw new Error('Error obteniendo info de usuario');
            }

            this.user = await response.json();
            return this.user;
        } catch (error) {
            console.error('Error getUserInfo:', error);
            return null;
        }
    }

    logout() {
        this.accessToken = null;
        this.user = null;
        sessionStorage.removeItem('google_token');
    }

    isLoggedIn() {
        return !!this.accessToken;
    }
}

// ============================================
// GMAIL API SERVICE
// ============================================
class GmailService {
    constructor(auth) {
        this.auth = auth;
        this.baseUrl = 'https://gmail.googleapis.com/gmail/v1/users/me';
    }

    async fetch(endpoint, options = {}) {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers: {
                'Authorization': `Bearer ${this.auth.accessToken}`,
                ...options.headers
            }
        });

        if (!response.ok) {
            throw new Error(`Gmail API error: ${response.status}`);
        }

        return response.json();
    }

    // Busca correos de TuLotero con premios
    async searchPrizeEmails(afterDate = null) {
        // Query para buscar correos de TuLotero que hablan de premios
        let query = 'from:info@tulotero.es subject:"Premio en el boleto"';
        
        if (afterDate) {
            const dateStr = afterDate.toISOString().split('T')[0].replace(/-/g, '/');
            query += ` after:${dateStr}`;
        }

        const result = await this.fetch(`/messages?q=${encodeURIComponent(query)}&maxResults=100`);
        return result.messages || [];
    }

    // Obtiene el contenido de un correo
    async getMessage(messageId) {
        return this.fetch(`/messages/${messageId}?format=full`);
    }

    // Decodifica el cuerpo del mensaje
    decodeBody(message) {
        let body = '';

        const getBodyFromParts = (parts) => {
            for (const part of parts) {
                if (part.mimeType === 'text/plain' && part.body.data) {
                    body += atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
                } else if (part.mimeType === 'text/html' && part.body.data) {
                    // Convertir HTML a texto
                    const html = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
                    const temp = document.createElement('div');
                    temp.innerHTML = html;
                    body += temp.textContent || temp.innerText;
                } else if (part.parts) {
                    getBodyFromParts(part.parts);
                }
            }
        };

        if (message.payload.parts) {
            getBodyFromParts(message.payload.parts);
        } else if (message.payload.body.data) {
            body = atob(message.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        }

        return body;
    }
}

// ============================================
// PARSER DE CORREOS DE TULOTERO
// ============================================
class TuLoteroParser {
    // Detecta el tipo de juego por el asunto o contenido
    detectGame(subject, body) {
        const text = (subject + ' ' + body).toLowerCase();
        
        if (text.includes('euromillones') || text.includes('euromillon')) return 'Euromillones';
        if (text.includes('primitiva')) return 'Primitiva';
        if (text.includes('bonoloto')) return 'Bonoloto';
        if (text.includes('gordo')) return 'El Gordo';
        if (text.includes('lotería nacional') || text.includes('loteria nacional')) return 'Lotería Nacional';
        if (text.includes('quiniela')) return 'Quiniela';
        
        return 'Otro';
    }

    // Extrae los datos del correo
    parse(emailData, body) {
        const subject = emailData.payload.headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
        const date = emailData.payload.headers.find(h => h.name.toLowerCase() === 'date')?.value || '';
        
        // Extraer código del boleto del asunto
        // Formato: "Premio en el boleto de Euromillones CUZWKLF25934"
        const codigoMatch = subject.match(/([A-Z0-9]{10,})/);
        const codigo = codigoMatch ? codigoMatch[1] : `UNKNOWN_${emailData.id}`;

        // Extraer importe del premio
        // Patrones posibles:
        // "un premio de 13,83 €"
        // "Premio: 13,83 €"
        const premioPatterns = [
            /premio de ([\d.,]+)\s*€/i,
            /Premio:\s*([\d.,]+)\s*€/i,
            /has ganado ([\d.,]+)\s*€/i,
            /importe[:\s]+([\d.,]+)\s*€/i
        ];

        let importe = 0;
        for (const pattern of premioPatterns) {
            const match = body.match(pattern);
            if (match) {
                // Convertir formato español (1.234,56) a número
                importe = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
                break;
            }
        }

        // Extraer fecha del sorteo
        // "Sorteo: 03/02/26 21:00"
        const sorteoMatch = body.match(/Sorteo:\s*(\d{2}\/\d{2}\/\d{2})/);
        let fechaSorteo = null;
        if (sorteoMatch) {
            const [dia, mes, año] = sorteoMatch[1].split('/');
            fechaSorteo = new Date(2000 + parseInt(año), parseInt(mes) - 1, parseInt(dia));
        }

        // Extraer administración
        const adminMatch = body.match(/Admin\.?:\s*(\S+)/i);
        const administracion = adminMatch ? adminMatch[1] : null;

        // Extraer grupo si es participación en grupo
        const grupoMatch = body.match(/Grupo:\s*(.+?)(?:\n|Fecha)/i);
        const grupo = grupoMatch ? grupoMatch[1].trim() : null;

        // Extraer número de apuestas
        const apuestasMatch = body.match(/Apuestas:\s*(\d+)/i);
        const numApuestas = apuestasMatch ? parseInt(apuestasMatch[1]) : 1;

        // Extraer coste total
        const costeMatch = body.match(/Total Apuesta:\s*([\d.,]+)\s*€/i);
        let costeTotal = 0;
        if (costeMatch) {
            costeTotal = parseFloat(costeMatch[1].replace(/\./g, '').replace(',', '.'));
        }

        // Extraer combinación ganadora
        const combinacionMatch = body.match(/Combinación:\s*([\d,]+)/i);
        const combinacion = combinacionMatch ? combinacionMatch[1] : null;

        // Extraer estrellas (Euromillones)
        const estrellasMatch = body.match(/Estrellas:\s*([\d,\s]+)/i);
        const estrellas = estrellasMatch ? estrellasMatch[1].trim() : null;

        return {
            emailId: emailData.id,
            codigo,
            juego: this.detectGame(subject, body),
            importe,
            fecha: new Date(date),
            fechaSorteo,
            administracion,
            grupo,
            numApuestas,
            costeTotal,
            combinacion,
            estrellas,
            asunto: subject,
            procesadoEn: new Date()
        };
    }
}

// ============================================
// GOOGLE DRIVE BACKUP SERVICE
// ============================================
class DriveBackupService {
    constructor(auth) {
        this.auth = auth;
        this.baseUrl = 'https://www.googleapis.com/drive/v3';
        this.uploadUrl = 'https://www.googleapis.com/upload/drive/v3';
    }

    async fetch(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${this.auth.accessToken}`,
                ...options.headers
            }
        });

        if (!response.ok) {
            throw new Error(`Drive API error: ${response.status}`);
        }

        return response.json();
    }

    // Busca o crea la carpeta de la app
    async getOrCreateFolder() {
        // Buscar carpeta existente
        const query = `name='${CONFIG.DRIVE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const result = await this.fetch(`${this.baseUrl}/files?q=${encodeURIComponent(query)}`);

        if (result.files && result.files.length > 0) {
            return result.files[0].id;
        }

        // Crear carpeta
        const folderMetadata = {
            name: CONFIG.DRIVE_FOLDER,
            mimeType: 'application/vnd.google-apps.folder'
        };

        const createResult = await this.fetch(`${this.baseUrl}/files`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(folderMetadata)
        });

        return createResult.id;
    }

    // Busca el archivo de backup
    async findBackupFile(folderId) {
        const query = `name='${CONFIG.BACKUP_FILENAME}' and '${folderId}' in parents and trashed=false`;
        const result = await this.fetch(`${this.baseUrl}/files?q=${encodeURIComponent(query)}`);

        if (result.files && result.files.length > 0) {
            return result.files[0].id;
        }

        return null;
    }

    // Guarda el backup
    async saveBackup(data) {
        const folderId = await this.getOrCreateFolder();
        const existingFileId = await this.findBackupFile(folderId);

        const metadata = {
            name: CONFIG.BACKUP_FILENAME,
            mimeType: 'application/json',
            parents: existingFileId ? undefined : [folderId]
        };

        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        formData.append('file', new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));

        const url = existingFileId 
            ? `${this.uploadUrl}/files/${existingFileId}?uploadType=multipart`
            : `${this.uploadUrl}/files?uploadType=multipart`;

        const response = await fetch(url, {
            method: existingFileId ? 'PATCH' : 'POST',
            headers: {
                'Authorization': `Bearer ${this.auth.accessToken}`
            },
            body: formData
        });

        if (!response.ok) {
            throw new Error('Error guardando backup');
        }

        return response.json();
    }

    // Carga el backup
    async loadBackup() {
        try {
            const folderId = await this.getOrCreateFolder();
            const fileId = await this.findBackupFile(folderId);

            if (!fileId) {
                return null;
            }

            const response = await fetch(`${this.baseUrl}/files/${fileId}?alt=media`, {
                headers: {
                    'Authorization': `Bearer ${this.auth.accessToken}`
                }
            });

            if (!response.ok) {
                return null;
            }

            return response.json();
        } catch (error) {
            console.error('Error cargando backup:', error);
            return null;
        }
    }
}

// ============================================
// APLICACIÓN PRINCIPAL
// ============================================
class LoteroTrackerApp {
    constructor() {
        this.db = new LocalDatabase();
        this.auth = new GoogleAuth();
        this.gmail = null;
        this.parser = new TuLoteroParser();
        this.drive = null;
        this.premios = [];
        this.deferredInstallPrompt = null;
    }

    async init() {
        // Inicializar base de datos
        await this.db.init();

        // Cargar premios guardados
        this.premios = await this.db.getAll('premios');

        // Manejar redirect de OAuth
        const isLoggedIn = this.auth.handleRedirect();

        if (isLoggedIn) {
            this.gmail = new GmailService(this.auth);
            this.drive = new DriveBackupService(this.auth);
            await this.showMainApp();
        } else {
            this.showLoginScreen();
        }

        // Setup event listeners
        this.setupEventListeners();

        // Setup PWA install
        this.setupPWAInstall();
    }

    showLoginScreen() {
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('mainApp').classList.add('hidden');
    }

    async showMainApp() {
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');

        // Obtener info del usuario
        const user = await this.auth.getUserInfo();
        if (user) {
            document.getElementById('userName').textContent = user.given_name || user.name || 'Usuario';
            document.getElementById('userAvatar').textContent = (user.given_name || user.name || 'U')[0].toUpperCase();
            document.getElementById('settingsEmail').textContent = user.email;
        }

        // Actualizar UI
        this.updateUI();
    }

    setupEventListeners() {
        // Login
        document.getElementById('googleLoginBtn').addEventListener('click', () => {
            this.auth.login();
        });

        // Sync
        document.getElementById('syncBtn').addEventListener('click', () => {
            this.syncEmails();
        });

        // Backup
        document.getElementById('backupBtn').addEventListener('click', () => {
            this.createBackup();
        });

        // Tabs
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Settings
        document.getElementById('userBadge').addEventListener('click', () => {
            this.openSettings();
        });

        document.getElementById('closeSettings').addEventListener('click', () => {
            this.closeSettings();
        });

        document.getElementById('overlay').addEventListener('click', () => {
            this.closeSettings();
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });

        // Clear data
        document.getElementById('clearDataBtn').addEventListener('click', () => {
            this.clearAllData();
        });

        // Install PWA
        document.getElementById('installBtn')?.addEventListener('click', () => {
            this.installPWA();
        });
    }

    setupPWAInstall() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredInstallPrompt = e;
            document.getElementById('installBanner')?.classList.remove('hidden');
        });

        window.addEventListener('appinstalled', () => {
            document.getElementById('installBanner')?.classList.add('hidden');
            this.deferredInstallPrompt = null;
        });
    }

    async installPWA() {
        if (this.deferredInstallPrompt) {
            this.deferredInstallPrompt.prompt();
            const { outcome } = await this.deferredInstallPrompt.userChoice;
            if (outcome === 'accepted') {
                this.showToast('¡App instalada!');
            }
            this.deferredInstallPrompt = null;
        }
    }

    async syncEmails() {
        const btn = document.getElementById('syncBtn');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Sincronizando...';

        try {
            // Obtener última fecha de sincronización
            const lastSync = await this.db.get('config', 'lastSync');
            const afterDate = lastSync ? new Date(lastSync.value) : null;

            // Buscar correos
            const messages = await this.gmail.searchPrizeEmails(afterDate);
            this.showToast(`Encontrados ${messages.length} correos`);

            let newPremios = 0;

            for (const msg of messages) {
                // Verificar si ya procesamos este correo
                const existing = await this.db.getByIndex('premios', 'codigo', msg.id);
                if (existing) continue;

                // Obtener contenido completo
                const fullMessage = await this.gmail.getMessage(msg.id);
                const body = this.gmail.decodeBody(fullMessage);

                // Parsear datos
                const premio = this.parser.parse(fullMessage, body);

                // Verificar que tiene un importe válido
                if (premio.importe > 0) {
                    try {
                        await this.db.add('premios', premio);
                        newPremios++;
                    } catch (e) {
                        // Probablemente duplicado por código
                        console.log('Premio duplicado:', premio.codigo);
                    }
                }
            }

            // Guardar fecha de sincronización
            await this.db.put('config', { key: 'lastSync', value: new Date().toISOString() });

            // Recargar premios
            this.premios = await this.db.getAll('premios');
            this.updateUI();

            this.showToast(`✅ ${newPremios} nuevos premios encontrados`);

        } catch (error) {
            console.error('Error sincronizando:', error);
            this.showToast('❌ Error al sincronizar');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }

    async createBackup() {
        const btn = document.getElementById('backupBtn');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Guardando...';

        try {
            const backupData = {
                version: 1,
                exportedAt: new Date().toISOString(),
                premios: this.premios,
                config: await this.db.getAll('config')
            };

            await this.drive.saveBackup(backupData);
            this.showToast('✅ Backup guardado en Google Drive');

        } catch (error) {
            console.error('Error backup:', error);
            this.showToast('❌ Error al guardar backup');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }

    async restoreFromBackup() {
        try {
            const backup = await this.drive.loadBackup();
            if (!backup || !backup.premios) {
                return false;
            }

            // Restaurar premios
            for (const premio of backup.premios) {
                try {
                    await this.db.add('premios', premio);
                } catch (e) {
                    // Ignorar duplicados
                }
            }

            this.premios = await this.db.getAll('premios');
            this.updateUI();
            this.showToast('✅ Datos restaurados desde backup');
            return true;

        } catch (error) {
            console.error('Error restaurando backup:', error);
            return false;
        }
    }

    updateUI() {
        // Calcular estadísticas
        const totalPremios = this.premios.reduce((sum, p) => sum + p.importe, 0);
        
        // Premios de esta semana
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);
        
        const premiosSemana = this.premios
            .filter(p => new Date(p.fecha) >= weekStart)
            .reduce((sum, p) => sum + p.importe, 0);

        // Actualizar stats
        document.getElementById('totalPremios').textContent = this.formatMoney(totalPremios);
        document.getElementById('premiosSemana').textContent = this.formatMoney(premiosSemana);
        document.getElementById('numPremios').textContent = this.premios.length;

        // Tendencia
        const premiosTrend = document.getElementById('premiosTrend');
        if (this.premios.length > 0) {
            const avgPremio = totalPremios / this.premios.length;
            premiosTrend.textContent = `Media: ${this.formatMoney(avgPremio)} por premio`;
        }

        // Última sincronización
        this.db.get('config', 'lastSync').then(lastSync => {
            if (lastSync) {
                const date = new Date(lastSync.value);
                document.getElementById('lastSync').textContent = `Últ. sync: ${this.formatDate(date)}`;
                document.getElementById('settingsLastSync').textContent = this.formatDateTime(date);
            }
        });

        // Settings
        document.getElementById('settingsPremiosCount').textContent = `${this.premios.length} premios`;

        // Lista de premios
        this.renderPrizeList();

        // Gráficos
        this.renderCharts();
    }

    renderPrizeList() {
        const container = document.getElementById('prizeList');

        if (this.premios.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🎫</div>
                    <div class="empty-title">Sin premios registrados</div>
                    <p>Pulsa "Sincronizar Correos" para buscar tus premios</p>
                </div>
            `;
            return;
        }

        // Ordenar por fecha descendente
        const sorted = [...this.premios].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        container.innerHTML = sorted.slice(0, 20).map(premio => `
            <div class="prize-card" data-id="${premio.id}">
                <div class="prize-icon ${this.getGameClass(premio.juego)}">
                    ${this.getGameEmoji(premio.juego)}
                </div>
                <div class="prize-info">
                    <div class="prize-game">${premio.juego}</div>
                    <div class="prize-details">${this.formatDate(new Date(premio.fecha))} · ${premio.codigo}</div>
                </div>
                <div class="prize-amount">+${this.formatMoney(premio.importe)}</div>
            </div>
        `).join('');
    }

    renderCharts() {
        // Gráfico por juego
        const gameStats = {};
        this.premios.forEach(p => {
            gameStats[p.juego] = (gameStats[p.juego] || 0) + p.importe;
        });

        const maxGame = Math.max(...Object.values(gameStats), 1);
        const gameColors = {
            'Euromillones': '#fbbf24',
            'Primitiva': '#3b82f6',
            'Bonoloto': '#ec4899',
            'El Gordo': '#8b5cf6',
            'Lotería Nacional': '#10b981',
            'Quiniela': '#f97316',
            'Otro': '#6b7280'
        };

        const gameChartHtml = Object.entries(gameStats)
            .sort((a, b) => b[1] - a[1])
            .map(([game, amount]) => `
                <div class="bar-item">
                    <div class="bar-label">${game}</div>
                    <div class="bar-container">
                        <div class="bar-fill" style="width: ${(amount / maxGame) * 100}%; background: ${gameColors[game] || '#6b7280'}"></div>
                    </div>
                    <div class="bar-value">${this.formatMoney(amount)}</div>
                </div>
            `).join('');

        document.getElementById('gameChart').innerHTML = gameChartHtml || '<p style="color: var(--text-muted); text-align: center;">Sin datos</p>';

        // Gráfico por mes (últimos 4 meses)
        const monthStats = {};
        const now = new Date();
        
        for (let i = 0; i < 4; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthStats[key] = 0;
        }

        this.premios.forEach(p => {
            const d = new Date(p.fecha);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (key in monthStats) {
                monthStats[key] += p.importe;
            }
        });

        const maxMonth = Math.max(...Object.values(monthStats), 1);
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

        const monthChartHtml = Object.entries(monthStats)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([month, amount]) => {
                const [year, m] = month.split('-');
                const label = `${monthNames[parseInt(m) - 1]} ${year.slice(2)}`;
                return `
                    <div class="bar-item">
                        <div class="bar-label">${label}</div>
                        <div class="bar-container">
                            <div class="bar-fill" style="width: ${(amount / maxMonth) * 100}%; background: var(--primary)"></div>
                        </div>
                        <div class="bar-value">${this.formatMoney(amount)}</div>
                    </div>
                `;
            }).join('');

        document.getElementById('monthChart').innerHTML = monthChartHtml;
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        document.getElementById('premiosTab').classList.toggle('hidden', tabName !== 'premios');
        document.getElementById('estadisticasTab').classList.toggle('hidden', tabName !== 'estadisticas');
    }

    openSettings() {
        document.getElementById('settingsPanel').classList.add('open');
        document.getElementById('overlay').classList.add('show');
    }

    closeSettings() {
        document.getElementById('settingsPanel').classList.remove('open');
        document.getElementById('overlay').classList.remove('show');
    }

    logout() {
        this.auth.logout();
        this.closeSettings();
        this.showLoginScreen();
    }

    async clearAllData() {
        if (!confirm('¿Estás seguro? Se borrarán TODOS los datos locales.')) return;
        
        await this.db.clearAll();
        this.premios = [];
        this.updateUI();
        this.showToast('Datos borrados');
        this.closeSettings();
    }

    // Utilidades
    formatMoney(amount) {
        return amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    }

    formatDate(date) {
        return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    }

    formatDateTime(date) {
        return date.toLocaleDateString('es-ES', { 
            day: '2-digit', 
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    getGameClass(game) {
        const classes = {
            'Euromillones': 'euromillones',
            'Primitiva': 'primitiva',
            'Bonoloto': 'bonoloto',
            'El Gordo': 'gordo',
            'Lotería Nacional': 'loteria'
        };
        return classes[game] || 'loteria';
    }

    getGameEmoji(game) {
        const emojis = {
            'Euromillones': '🌟',
            'Primitiva': '🔵',
            'Bonoloto': '🎀',
            'El Gordo': '🎄',
            'Lotería Nacional': '🎫',
            'Quiniela': '⚽'
        };
        return emojis[game] || '🎰';
    }

    showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
}

// ============================================
// REGISTRO DEL SERVICE WORKER
// ============================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('SW registrado:', registration.scope);
                
                // Escuchar mensajes del SW
                navigator.serviceWorker.addEventListener('message', (event) => {
                    if (event.data.type === 'SYNC_REQUESTED') {
                        app.syncEmails();
                    }
                });
            })
            .catch((error) => {
                console.log('Error registrando SW:', error);
            });
    });
}

// ============================================
// INICIAR APLICACIÓN
// ============================================
const app = new LoteroTrackerApp();
app.init();
