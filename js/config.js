/* ============================================================
   js/config.js
   Configuración global, cliente Supabase y constantes inmutables.
   NO contiene lógica de negocio ni funciones de UI.
   ============================================================ */

// --- Identidad del sistema (aisla localStorage entre despliegues: rrhh, record, cliente-x, etc.) ---
const APP_ID = 'record'; // CAMBIAR por un ID único en cada despliegue/copia del sistema

// --- Credenciales Supabase del despliegue ---
// Dejar vacías ('') para que el sistema inicie en MODO DEMO (localStorage) y el cliente configure su BD.
// Si se preconfiguran, el sistema intentará conectarse a esa base de datos.
const DEFAULT_SUPABASE_URL = 'https://kvlkmpvnyvudlgbqoyer.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2bGttcHZueXZ1ZGxnYnFveWVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4NDkyOTIsImV4cCI6MjEwNjQyNTI5Mn0.u3rjdRm2zcvKJ8GyivRRdr03REZi7c0EfpnZ9oAORrw';

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

// Tablas que Conviven con `empresa_id` cuando el despliegue usa multiempresa en una sola BD.
const TABLAS_POR_EMPRESA = [
    'departamentos', 'cargos', 'empleados', 'nominas', 'historico_salarios', 'vacaciones',
    'utilidades', 'prestaciones', 'antiguedad', 'anticipos_prestaciones', 'prestamos_anticipos',
    'prestamos_abonos', 'asistencia_registros', 'justificativos_faltas', 'expediente_documentos',
    'prenomina_borrador', 'firmas_recibos', 'tokens_portal_empleado', 'solicitudes_ari'
];

// Envuelve el query builder para que, en modo multiempresa, TODA lectura filtre por la empresa
// activa y TODA escritura le asigne su empresa_id. Así no hay que tocar cada pantalla.
function envolverClientePorEmpresa(client) {
    if (!client || client.__envueltoPorEmpresa) return client;
    const fromOriginal = client.from.bind(client);
    client.from = function (tabla) {
        const qb = fromOriginal(tabla);
        const porEmpresa = TABLAS_POR_EMPRESA.indexOf(tabla) !== -1;
        const idActivo = () => (typeof obtenerEmpresaIdActiva === 'function') ? obtenerEmpresaIdActiva() : null;
        if (porEmpresa) {
            const inyectar = (fnOriginal) => function (valores, opciones) {
                const id = idActivo();
                if (id) {
                    if (Array.isArray(valores)) {
                        valores = valores.map(v => (v && typeof v === 'object') ? Object.assign({}, v, { empresa_id: v.empresa_id || id }) : v);
                    } else if (valores && typeof valores === 'object') {
                        valores = Object.assign({}, valores, { empresa_id: valores.empresa_id || id });
                    }
                }
                return fnOriginal(valores, opciones);
            };
            if (typeof qb.insert === 'function') qb.insert = inyectar(qb.insert.bind(qb));
            if (typeof qb.upsert === 'function') qb.upsert = inyectar(qb.upsert.bind(qb));
            if (typeof qb.update === 'function') qb.update = inyectar(qb.update.bind(qb));
            const selectOriginal = qb.select.bind(qb);
            qb.select = function (columnas, opciones) {
                const salida = selectOriginal(columnas, opciones);
                const id = idActivo();
                if (id && salida && typeof salida.eq === 'function') salida.eq('empresa_id', id);
                return salida;
            };
        }
        return qb;
    };
    client.__envueltoPorEmpresa = true;
    return client;
}

function actualizarClienteSupabase() {
    // Forzar recreación según modo/config actual
    if (esModoDemoActivo() && typeof createDemoSupabaseClient === 'function') {
        supabaseClient = createDemoSupabaseClient();
        _sbConfig = { mode: 'demo', url: null, key: null };
        return supabaseClient;
    }
    _sbConfig = { url: null, key: null, mode: null };
    const cliente = getSupabaseClient();
    return envolverClientePorEmpresa(cliente);
}

// Inicializar cliente al cargar
supabaseClient = envolverClientePorEmpresa(getSupabaseClient());

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
