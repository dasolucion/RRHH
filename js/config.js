/* ============================================================
   js/config.js
   Configuración global, cliente Supabase y constantes inmutables.
   NO contiene lógica de negocio ni funciones de UI.
   ============================================================ */

// --- Identidad del sistema (aisla localStorage entre despliegues: rrhh, record, cliente-x, etc.) ---
const APP_ID = 'rrhh'; // CAMBIAR por un ID único en cada despliegue/copia del sistema

// --- Credenciales Supabase del despliegue ---
// Dejar vacías ('') para que el sistema inicie en MODO DEMO (localStorage) y el cliente configure su BD.
// Si se preconfiguran, el sistema intentará conectarse a esa base de datos.
const DEFAULT_SUPABASE_URL = 'https://nrfplwpmwplpbskidtqs.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yZnBsd3Btd3BscGJza2lkdHFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1OTA4MjIsImV4cCI6MjEwMzE2NjgyMn0.PZXrE9KtAVF2e4RbyM3-m1ClS8R8QaTCctLzZKAAYdQ';

// Compatibilidad con código existente
const SUPABASE_URL = DEFAULT_SUPABASE_URL;
const SUPABASE_ANON_KEY = DEFAULT_SUPABASE_ANON_KEY;

// --- Helpers de almacenamiento local (namespaced por APP_ID) ---
function storageKey(key) { return `${APP_ID}__${key}`; }
function lsGet(key) { try { return localStorage.getItem(storageKey(key)); } catch (e) { return null; } }
function lsSet(key, value) { try { localStorage.setItem(storageKey(key), value); } catch (e) {} }
function lsRemove(key) { try { localStorage.removeItem(storageKey(key)); } catch (e) {} }

// Cliente Supabase (real o demo según modo/configuración)
let supabaseClient = null;
let _sbConfig = { url: null, key: null, mode: null };

function crearClienteSupabase(url, key) {
    return supabase.createClient(url, key);
}

function _obtenerCredencialesDb() {
    const p = (typeof appState !== 'undefined' && appState && appState.parametros) ? appState.parametros : null;
    let url = (p && p.supabase_url) || DEFAULT_SUPABASE_URL || '';
    let key = (p && p.supabase_anon_key) || DEFAULT_SUPABASE_ANON_KEY || '';
    if (url && !/^https?:\/\//i.test(url)) { url = DEFAULT_SUPABASE_URL || ''; key = DEFAULT_SUPABASE_ANON_KEY || ''; }
    return { url: (url || '').replace(/\/+$/, ''), key: key || '' };
}

function tieneCredencialesDb() {
    const c = _obtenerCredencialesDb();
    return !!(c.url && c.key);
}

function esModoDemoActivo() {
    if (typeof appState !== 'undefined' && appState) {
        if (appState.modoDatos === 'demo') return true;
        if (appState.modoDatos === 'db') return false;
    }
    return !tieneCredencialesDb();
}

function getSupabaseClient() {
    // Modo demo: usar cliente local (localStorage)
    if (esModoDemoActivo() && typeof createDemoSupabaseClient === 'function') {
        if (!supabaseClient || _sbConfig.mode !== 'demo') {
            supabaseClient = createDemoSupabaseClient();
            _sbConfig = { mode: 'demo', url: null, key: null };
        }
        return supabaseClient;
    }

    const { url, key } = _obtenerCredencialesDb();
    if (!url || !key) {
        // Sin credenciales y sin demo disponible: intentar demo si existe
        if (typeof createDemoSupabaseClient === 'function') {
            supabaseClient = createDemoSupabaseClient();
            _sbConfig = { mode: 'demo', url: null, key: null };
            return supabaseClient;
        }
        return null;
    }

    if (!supabaseClient || _sbConfig.mode !== 'db' || _sbConfig.url !== url || _sbConfig.key !== key) {
        try {
            supabaseClient = crearClienteSupabase(url, key);
            _sbConfig = { mode: 'db', url, key };
        } catch (e) {
            console.warn('Configuración Supabase inválida:', e.message);
            if (typeof createDemoSupabaseClient === 'function') {
                supabaseClient = createDemoSupabaseClient();
                _sbConfig = { mode: 'demo', url: null, key: null };
            } else {
                supabaseClient = null;
            }
        }
    }
    return supabaseClient;
}

function actualizarClienteSupabase() {
    // Forzar recreación según modo/config actual
    if (esModoDemoActivo() && typeof createDemoSupabaseClient === 'function') {
        supabaseClient = createDemoSupabaseClient();
        _sbConfig = { mode: 'demo', url: null, key: null };
        return supabaseClient;
    }
    _sbConfig = { url: null, key: null, mode: null };
    return getSupabaseClient();
}

// Inicializar cliente al cargar
supabaseClient = getSupabaseClient();

// --- Usuarios de respaldo local (si Supabase no responde o está vacío) ---
const USUARIOS_DEFAULT = [
    { id: 1, nombre: 'Super Administrador', usuario: 'master',       clave: 'master123',   rol: 'master',    activo: true },
    { id: 2, nombre: 'Auditor de Consulta', usuario: 'consulta',     clave: 'consulta123', rol: 'consulta',  activo: true }
];

// --- Matriz de Feature Flags (módulos activables/desactivables por licencia) ---
const DEFAULT_FEATURES = {
    // 1. Personal y Empleados
    'empleados.subsidio':           { label: 'Subsidio Especial en Ficha', cat: '1. Empleados', default: true },
    'empleados.dahua':              { label: 'Integración ID Reloj Dahua', cat: '1. Empleados', default: true },
    'empleados.ari':                { label: 'Gestión y Enlaces Formulario AR-I (SENIAT)', cat: '1. Empleados', default: true },
    'documentos.constancias':       { label: 'Constancias de Trabajo y Amonestaciones', cat: '1. Empleados', default: true },

    // 2. Procesar Nómina
    'nomina.dahua_asistencia':      { label: 'Botón Aplicar Asistencia Biométrica', cat: '2. Nómina', default: true },
    'nomina.prenomina':             { label: 'Pre-Nómina y Borradores en Nube', cat: '2. Nómina', default: true },
    'nomina.recargos_lottt':        { label: 'Recargos LOTTT (Feriados)', cat: '2. Nómina', default: true },
    'nomina.horas_extras':          { label: 'Columna Horas Extras Diurnas', cat: '2. Nómina', default: true },
    'nomina.horas_nocturnas':       { label: 'Columna Horas Nocturnas', cat: '2. Nómina', default: true },
    'nomina.islr':                  { label: 'Retención I.S.L.R. (%) [AR-I]', cat: '2. Nómina', default: true },
    'nomina.subsidio':              { label: 'Columna Subsidio Especial', cat: '2. Nómina', default: true },
    'nomina.prestamos':             { label: 'Descuento de Préstamos y Saldos', cat: '2. Nómina', default: true },
    'nomina.adelantos':             { label: 'Descuento de Adelantos', cat: '2. Nómina', default: true },
    'nomina.txt_banco':             { label: 'Generación TXT Bancario (Alim/Sub)', cat: '2. Nómina', default: true },

    // 3. Vacaciones
    'vacaciones.subsidio':          { label: 'Subsidio Especial de Vacaciones', cat: '3. Vacaciones', default: true },
    'vacaciones.whatsapp':          { label: 'Botón Envío Recibo por WhatsApp', cat: '3. Vacaciones', default: true },

    // 4. Utilidades
    'utilidades.pagos_parciales':   { label: 'Modalidad Pagos Parciales (%)', cat: '4. Utilidades', default: true },
    'utilidades.subsidio':          { label: 'Subsidio Especial en Utilidades', cat: '4. Utilidades', default: true },
    'utilidades.inces':             { label: 'Retención Legal 0.5% INCES (Art. 14)', cat: '4. Utilidades', default: true },
    'utilidades.imprimir_resumen':  { label: 'Botón Imprimir Resumen General', cat: '4. Utilidades', default: true },

    // 5. Antigüedad y Prestaciones
    'antiguedad.tope_75_anticipos': { label: 'Bloquear Anticipos > 75% Capital (Art. 144)', cat: '5. Prestaciones', default: true },
    'antiguedad.conciliacion':      { label: 'Módulo Conciliación Mes a Mes', cat: '5. Prestaciones', default: true },
    'antiguedad.intereses_bcv':     { label: 'Devengo de Intereses Mensuales BCV', cat: '5. Prestaciones', default: true },

    // 6. Deberes Formales e Impuestos Patronales
    'impuestos.modulo':             { label: 'Módulo Deberes Formales / Cargas Patronales', cat: '6. Deberes Formales', default: true },
    'impuestos.lpp':                { label: 'Contribución Especial 9% Pensiones (LPP)', cat: '6. Deberes Formales', default: true },

    // 7. Liquidaciones
    'liquidaciones.modulo':         { label: 'Módulo de Liquidaciones Definitivas (Finiquitos)', cat: '7. Liquidaciones', default: true }
};
