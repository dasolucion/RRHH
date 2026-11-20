/* ============================================================
   js/state.js
   Estado global (appState), carga de caché, parámetros corporativos
   y sistema de Feature Flags (licencias por empresa).
   Debe cargarse después de config.js y utils.js.
   ============================================================ */

// --- Estado global de la aplicación ---
let appState = {
    departamentos: [], cargos: [], empleados: [], nominas: [], vacaciones: [],
    utilidades: [], antiguedad: [], prestaciones: [], historicoSalarios: [],
    anticipos: [], prestamos: [], prestamosAbonos: [],
    tasasMensuales: [], usuarios: [], usuarioActual: null, mesesEditablesActuales: [],
    rolesPermisos: [], // Matriz de permisos desde Supabase
    parametros: {
        nombre_empresa: 'DEMOSTRATIVA',
        rif_empresa: 'J-00000000-0',
        dias_utilidades: 30,
        valor_ut: 43.00,
        supabase_url: '',
        supabase_anon_key: ''
    },
    empresas: [],          // Registro local de empresas (multiempresa)
    empresaActiva: null,   // RIF de la empresa activa
    empresaRecienCreada: false, // true cuando se acaba de registrar una empresa nueva (estado en blanco, sin datos previos)
    estadoConexion: 'sinverificar', // sinverificar | comprobando | conectado | desconectado | cache | demo
    modoDatos: null,       // 'demo' | 'db' (null = auto según config)
    esquemaOk: false,
    esquemaFaltantes: [],
    licenciaBloqueada: false,
    licenciaMensaje: '',
    calculoVacacionesActual: null,
    calculoUtilidadesActual: [],
    calculoAntiguedadActual: null,
    calculoPrestacionesActual: null
};

// ============================================================
// MÓDULOS Y MATRIZ DE PERMISOS — Estructura
// ============================================================

const MODULOS_PERMISOS = [
    { key: 'dashboard',              label: 'Dashboard',              icon: 'fa-chart-pie' },
    { key: 'departamentos',          label: 'Departamentos',          icon: 'fa-building' },
    { key: 'cargos',                 label: 'Cargos',                 icon: 'fa-briefcase' },
    { key: 'empleados',              label: 'Empleados',              icon: 'fa-users' },
    { key: 'asistencia',             label: 'Asistencia',             icon: 'fa-fingerprint' },
    { key: 'salarios',               label: 'Histórico Salarial',     icon: 'fa-chart-line' },
    { key: 'prestamos',              label: 'Préstamos y Anticipos',  icon: 'fa-hand-holding-dollar' },
    { key: 'nomina',                 label: 'Procesar Nómina',        icon: 'fa-calculator' },
    { key: 'historico',              label: 'Nóminas Procesadas',     icon: 'fa-clock-rotate-left' },
    { key: 'vacaciones',             label: 'Calcular Vacaciones',    icon: 'fa-umbrella-beach' },
    { key: 'vacaciones-historico',   label: 'Vacaciones Procesadas',  icon: 'fa-folder-open' },
    { key: 'utilidades',             label: 'Calcular Utilidades',    icon: 'fa-gift' },
    { key: 'utilidades-historico',   label: 'Utilidades Procesadas',  icon: 'fa-box-archive' },
    { key: 'antiguedad',             label: 'Prestaciones Antigüedad',icon: 'fa-piggy-bank' },
    { key: 'antiguedad-historico',   label: 'Prestaciones Procesadas',icon: 'fa-coins' },
    { key: 'liquidaciones',          label: 'Liquidaciones',          icon: 'fa-scale-balanced' },
    { key: 'liquidaciones-historico',label: 'Liquidaciones Procesadas',icon: 'fa-file-signature' },
    { key: 'impuestos',              label: 'Deberes Formales / Cargas',icon: 'fa-building-columns' },
    { key: 'usuarios',               label: 'Usuarios',               icon: 'fa-users-gear' },
    { key: 'parametros',             label: 'Parámetros',             icon: 'fa-sliders' }
];

const PERMISOS_COLUMNAS = [
    { key: 'ver',      label: 'Ver',      icon: 'fa-eye' },
    { key: 'crear',    label: 'Crear',    icon: 'fa-plus' },
    { key: 'editar',   label: 'Editar',   icon: 'fa-pen' },
    { key: 'borrar',   label: 'Borrar',   icon: 'fa-trash' },
    { key: 'imprimir', label: 'Imprimir', icon: 'fa-print' },
    { key: 'firmar',   label: 'Firmar',   icon: 'fa-signature' }
];

// Permisos por defecto por rol (se usan si no hay fila en Supabase)
const PERMISOS_DEFAULT_POR_ROL = {
    administrador: {
        dashboard:               { ver: true,  imprimir: true },
        departamentos:           { ver: true,  crear: true,  editar: true,  borrar: true },
        cargos:                  { ver: true,  crear: true,  editar: true,  borrar: true },
        empleados:               { ver: true,  crear: true,  editar: true,  borrar: true,  imprimir: true, firmar: true },
        asistencia:              { ver: true,  editar: true,  imprimir: true },
        salarios:                { ver: true,  crear: true,  editar: true,  borrar: true,  imprimir: true },
        prestamos:               { ver: true,  crear: true,  editar: true,                imprimir: true, firmar: true },
        nomina:                  { ver: true,  crear: true,  editar: true,  borrar: true,  imprimir: true, firmar: true },
        historico:               { ver: true,                                              imprimir: true },
        vacaciones:              { ver: true,  crear: true,  editar: true,                imprimir: true, firmar: true },
        'vacaciones-historico':  { ver: true,                                              imprimir: true },
        utilidades:              { ver: true,  crear: true,  editar: true,                imprimir: true, firmar: true },
        'utilidades-historico':  { ver: true,                                              imprimir: true },
        antiguedad:              { ver: true,                                              imprimir: true, firmar: true },
        'antiguedad-historico':  { ver: true,                                              imprimir: true },
        liquidaciones:           { ver: true,  crear: true,                                imprimir: true, firmar: true },
        'liquidaciones-historico':{ ver: true,                                             imprimir: true },
        impuestos:               { ver: true,                                              imprimir: true },
        usuarios:                { ver: true },
        parametros:              { ver: true,  editar: true }
    },
    consulta: {
        dashboard:               { ver: true },
        historico:               { ver: true,  imprimir: true },
        'vacaciones-historico':  { ver: true,  imprimir: true },
        'utilidades-historico':  { ver: true,  imprimir: true },
        'antiguedad-historico':  { ver: true,  imprimir: true },
        'liquidaciones-historico':{ ver: true,  imprimir: true },
        impuestos:               { ver: true,  imprimir: true }
    }
};

// ============================================================
// FEATURE FLAGS — Lectura, aplicación al DOM y guardado
// ============================================================

function getFeatureFlag(key) {
    const def = DEFAULT_FEATURES[key]?.default ?? true;
    if (!appState.features) return def;
    const v = appState.features[key];
    if (v === undefined || v === null) return def;
    return v === true || v === 'true' || v === 1 || v === '1';
}

function aplicarFeatureFlagsDOM() {
    document.querySelectorAll('[data-feature]').forEach(el => {
        const key = el.getAttribute('data-feature');
        const isEnabled = getFeatureFlag(key);
        if (isEnabled) {
            el.classList.remove('hidden');
            if (el.tagName === 'INPUT' || el.tagName === 'BUTTON' || el.tagName === 'SELECT') {
                el.removeAttribute('disabled');
            }
        } else {
            el.classList.add('hidden');
            if (el.tagName === 'INPUT' || el.tagName === 'BUTTON' || el.tagName === 'SELECT') {
                el.setAttribute('disabled', 'true');
            }
        }
    });
}

function renderPanelFeatureFlags() {
    const contenedor = gId('contenedor-features-checkboxes');
    if (!contenedor) return;

    const grupos = {};
    Object.keys(DEFAULT_FEATURES).forEach(key => {
        const item = DEFAULT_FEATURES[key];
        if (!grupos[item.cat]) grupos[item.cat] = [];
        grupos[item.cat].push({ key, label: item.label });
    });

    let html = '';
    Object.keys(grupos).forEach(cat => {
        html += `<div class="bg-slate-900 border border-slate-800 p-3.5 rounded-lg space-y-2">
            <h5 class="text-[11px] font-bold text-sky-400 uppercase tracking-wider border-b border-slate-800 pb-1">${cat}</h5>
            <div class="space-y-1.5">`;
        grupos[cat].forEach(opt => {
            const activo = getFeatureFlag(opt.key);
            html += `<label class="flex items-center space-x-2 text-xs text-slate-300 hover:text-white cursor-pointer select-none">
                <input type="checkbox" id="flag-${opt.key}" ${activo ? 'checked' : ''} class="w-3.5 h-3.5 rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer">
                <span class="text-[11px]">${opt.label}</span>
            </label>`;
        });
        html += `</div></div>`;
    });
    contenedor.innerHTML = html;
}

async function guardarFeatureFlagsConfig() {
    if (appState.usuarioActual?.rol !== 'master') {
        return showToast('Solo el Administrador Master puede modificar licencias', 'error');
    }
    const nuevasFlags = {};
    Object.keys(DEFAULT_FEATURES).forEach(key => {
        const chk = gId(`flag-${key}`);
        nuevasFlags[key] = chk ? chk.checked : true;
    });
    appState.features = nuevasFlags;
    lsSet('nomina_features_config', JSON.stringify(nuevasFlags));
    await safeQuery(
        supabaseClient.from('parametros_config').upsert([{ id: 1, features_config: nuevasFlags }]),
        'save_features_config'
    );
    aplicarFeatureFlagsDOM();
    showToast('Configuración de módulos actualizada y aplicada');
}

// ============================================================
// ROLES Y PERMISOS — Carga, verificación y fallback
// ============================================================

async function cargarRolesPermisos() {
    try {
        const { data, error } = await supabaseClient.from('roles_permisos').select('*');
        if (error) throw error;
        appState.rolesPermisos = data || [];
        try {
            lsSet('nomina_roles_permisos', JSON.stringify(appState.rolesPermisos));
        } catch (e) {}
    } catch (e) {
        console.warn('No se pudo cargar roles_permisos:', e.message);
        // Mantener la caché local cargada en cargarCacheLocal() o el fallback a defaults
    }
}

/**
 * Permiso efectivo: consulta tabla; si no hay fila, usa defaults por rol.
 * El rol Master siempre tiene todo (bypass).
 */
function permisoEfectivo(rol, modulo, perm) {
    if (rol === 'master') return true;
    const row = appState.rolesPermisos.find(p => p.rol === rol && p.modulo === modulo);
    if (row) return row[`puede_${perm}`] === true;
    const def = PERMISOS_DEFAULT_POR_ROL[rol]?.[modulo];
    return def ? def[perm] === true : false;
}

function tienePermiso(modulo, accion) {
    const rol = appState.usuarioActual?.rol;
    if (!rol) return false;
    return permisoEfectivo(rol, modulo, accion);
}

function contarModulosVisibles(rol) {
    return MODULOS_PERMISOS.filter(m => permisoEfectivo(rol, m.key, 'ver')).length;
}

// ============================================================
// CACHÉ LOCAL - Carga inicial desde localStorage
// ============================================================

function esConexionActiva() {
    return appState.estadoConexion === 'conectado';
}

function esModoDemo() {
    return appState.modoDatos === 'demo';
}

function limpiarEstadoNegocio() {
    appState.departamentos = [];
    appState.cargos = [];
    appState.empleados = [];
    appState.nominas = [];
    appState.vacaciones = [];
    appState.utilidades = [];
    appState.antiguedad = [];
    appState.prestaciones = [];
    appState.historicoSalarios = [];
    appState.anticipos = [];
    appState.prestamos = [];
    appState.prestamosAbonos = [];
    appState.tasasMensuales = [];
    appState.calculoVacacionesActual = null;
    appState.calculoUtilidadesActual = [];
    appState.calculoAntiguedadActual = null;
    appState.calculoPrestacionesActual = null;
}

function _migrarStorageAntiguo() {
    // Migra claves antiguas nomina_* (sin prefijo APP_ID) al namespace actual si no existen.
    // Evita migrar config de conexión/empresas para no mezclar sistemas desplegados en el mismo origen.
    try {
        const skip = new Set(['nomina_parametros', 'nomina_empresas', 'nomina_empresa_activa']);
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
        for (const k of keys) {
            if (!k || !k.startsWith('nomina_')) continue;
            if (skip.has(k)) continue;
            const nuevo = storageKey(k);
            if (localStorage.getItem(nuevo) == null) {
                const v = localStorage.getItem(k);
                if (v != null) localStorage.setItem(nuevo, v);
            }
        }
    } catch (e) {}
}

function cargarCacheLocal() {
    _migrarStorageAntiguo();

    let savedParams = null;
    const p = lsGet('nomina_parametros');
    if (p) {
        try { savedParams = JSON.parse(p); } catch (e) { savedParams = null; }
    }

    const modoGuardado = lsGet('nomina_modo_datos');
    const prefillUrl = (savedParams && savedParams.supabase_url) || (typeof DEFAULT_SUPABASE_URL !== 'undefined' ? DEFAULT_SUPABASE_URL : '') || '';
    const prefillKey = (savedParams && savedParams.supabase_anon_key) || (typeof DEFAULT_SUPABASE_ANON_KEY !== 'undefined' ? DEFAULT_SUPABASE_ANON_KEY : '') || '';
    const tieneCreds = !!(prefillUrl && prefillKey && /^https?:\/\//i.test(prefillUrl));
    const tieneCredsGuardados = !!(savedParams && savedParams.supabase_url && savedParams.supabase_anon_key && /^https?:\/\//i.test(String(savedParams.supabase_url || '')) && String(savedParams.supabase_anon_key || '').trim().length > 10);
    // El despliegue puede traer credenciales preconfiguradas (DEFAULT_SUPABASE_URL / DEFAULT_SUPABASE_ANON_KEY).
    // Son válidas en CUALQUIER PC aunque el localStorage esté vacío (equipo nuevo, se cerró sesión, otro navegador).
    // Si están registradas, se conecta directo sin exigir que se haya presionado "Conectar" aquí.
    const tieneCredsDespliegue = !!(
        typeof DEFAULT_SUPABASE_URL !== 'undefined' &&
        typeof DEFAULT_SUPABASE_ANON_KEY !== 'undefined' &&
        /^https?:\/\//i.test(String(DEFAULT_SUPABASE_URL || '')) &&
        String(DEFAULT_SUPABASE_ANON_KEY || '').trim().length > 10
    );
    const autoConectar = (modoGuardado === 'db') || tieneCredsGuardados || tieneCredsDespliegue;

    appState.esquemaOk = false;
    appState.esquemaFaltantes = [];
    appState.licenciaBloqueada = false;
    appState.licenciaMensaje = '';
    appState.empresas = [];
    appState.empresaActiva = null;
    appState.rolesPermisos = [];
    appState.features = (typeof DEFAULT_FEATURES !== 'undefined') ? { ...DEFAULT_FEATURES } : (appState.features || {});

    // Si ya fue conectado/configurado a BD, reconectar automáticamente (sin mostrar datos de cliente hasta verificar)
    if (autoConectar && tieneCreds) {
        appState.modoDatos = 'db';
        const rifGuardado = (savedParams && savedParams.rif_empresa) ? String(savedParams.rif_empresa).trim().toUpperCase() : '';
        const nomGuardado = (savedParams && savedParams.nombre_empresa) ? String(savedParams.nombre_empresa) : '';
        appState.parametros = {
            nombre_empresa: nomGuardado || 'DEMOSTRATIVA',
            rif_empresa: rifGuardado || 'J-00000000-0',
            dias_utilidades: (savedParams && savedParams.dias_utilidades) || 30,
            valor_ut: (savedParams && savedParams.valor_ut) != null ? Number(savedParams.valor_ut) : 43.00,
            riesgo_ivss: (savedParams && savedParams.riesgo_ivss) != null ? Number(savedParams.riesgo_ivss) : 9,
            aplica_lpp: savedParams && savedParams.aplica_lpp === false ? false : true,
            supabase_url: prefillUrl,
            supabase_anon_key: prefillKey
        };
        // Restaurar el registro de empresas y la empresa activa guardadas (multiempresa)
        appState.empresas = [];
        try {
            const empsRaw = lsGet('nomina_empresas');
            if (empsRaw) { const emps = JSON.parse(empsRaw); if (Array.isArray(emps)) appState.empresas = emps; }
        } catch (e) {}
        appState.empresaActiva = lsGet('nomina_empresa_activa') || rifGuardado || null;
        // Si la empresa activa es una recién creada, mantener estado en blanco (sin cargar datos previos).
        appState.empresaRecienCreada = !!lsGet('nomina_empresa_recien_creada');
        appState.usuarios = [...USUARIOS_DEFAULT];
        limpiarEstadoNegocio();
        if (typeof actualizarClienteSupabase === 'function') actualizarClienteSupabase();
        establecerEstadoConexion('sinverificar', 'Reconectando a base de datos...');
        aplicarParametrosEnVista();
        if (typeof renderPanelFeatureFlags === 'function') renderPanelFeatureFlags();
        if (typeof renderDashboard === 'function') renderDashboard();

        if (typeof verificarConexionInicial === 'function') {
            verificarConexionInicial().catch((e) => {
                console.warn('Error reconectando:', e);
                limpiarEstadoNegocio();
                establecerEstadoConexion('desconectado', 'No se pudo reconectar. Verifique la conexión.');
                aplicarParametrosEnVista();
                if (typeof renderDashboard === 'function') renderDashboard();
            });
        }
        return;
    }

    // Primera vez / sin BD configurada: modo demostrativo local (sin rastro de datos de cliente)
    appState.modoDatos = 'demo';
    appState.parametros = {
        nombre_empresa: 'DEMOSTRATIVA',
        rif_empresa: 'J-00000000-0',
        dias_utilidades: 30,
        valor_ut: 43.00,
        riesgo_ivss: 9,
        aplica_lpp: true,
        supabase_url: prefillUrl,
        supabase_anon_key: prefillKey
    };
    appState.usuarios = [...USUARIOS_DEFAULT];

    if (typeof actualizarClienteSupabase === 'function') actualizarClienteSupabase();

    limpiarEstadoNegocio();
    // No cargar datos demo visibles ni caches de BD; mantener demostrativo en blanco
    appState.usuarios = [...USUARIOS_DEFAULT];

    establecerEstadoConexion('demo', 'Modo Demo (datos en este equipo). Conecte la base de datos para trabajar con su empresa.');
    aplicarParametrosEnVista();
    if (typeof renderPanelFeatureFlags === 'function') renderPanelFeatureFlags();
    if (typeof renderDashboard === 'function') renderDashboard();
}

function cargarDatosDemoLocal() {
    if (typeof createDemoSupabaseClient !== 'function') return;
    // Asegurar que supabaseClient sea demo en modo demo
    if (esModoDemo() && typeof actualizarClienteSupabase === 'function') {
        actualizarClienteSupabase();
    }
    const g = (t) => (typeof _demoReadTable === 'function' ? _demoReadTable(t) : []);
    appState.departamentos = g('departamentos');
    appState.cargos = g('cargos');
    appState.empleados = _demoPopulateRelations ? _demoPopulateRelations('empleados', g('empleados')) : g('empleados');
    appState.nominas = g('nominas');
    appState.vacaciones = g('vacaciones');
    appState.utilidades = g('utilidades');
    appState.prestaciones = g('prestaciones');
    appState.antiguedad = g('antiguedad');
    appState.historicoSalarios = g('historico_salarios');
    appState.anticipos = g('anticipos_prestaciones');
    appState.prestamos = g('prestamos_anticipos');
    appState.prestamosAbonos = g('prestamos_abonos');
    appState.tasasMensuales = g('tasas_mensuales');
    const u = g('usuarios'); if (Array.isArray(u) && u.length) appState.usuarios = u; else appState.usuarios = [...USUARIOS_DEFAULT];
    const rp = g('roles_permisos'); if (Array.isArray(rp) && rp.length) appState.rolesPermisos = rp;
    const pc = g('parametros_config');
    if (Array.isArray(pc) && pc.length) {
        const p = pc[0];
        appState.parametros = { ...appState.parametros, ...p };
    }
}

// ============================================================
// PARÁMETROS DE EMPRESA — Vista + guardado
// ============================================================

function aplicarParametrosEnVista() {
    const conectado = (typeof esConexionActiva === 'function') ? esConexionActiva() : appState.estadoConexion === 'conectado';
    const demo = (typeof esModoDemo === 'function') ? esModoDemo() : appState.estadoConexion === 'demo';

    // En estado pre-conexión/demo siempre mostrar empresa demostrativa (sin datos de cliente)
    const nombreVista = conectado ? (appState.parametros.nombre_empresa || '') : 'DEMOSTRATIVA';
    const rifVista = conectado ? (appState.parametros.rif_empresa || '') : 'J-00000000-0';

    if (gId('param-empresa-nombre')) gId('param-empresa-nombre').value = nombreVista;
    if (gId('param-empresa-rif')) gId('param-empresa-rif').value = rifVista;
    if (gId('param-dias-utilidades')) gId('param-dias-utilidades').value = appState.parametros.dias_utilidades || 30;
    if (gId('param-valor-ut')) gId('param-valor-ut').value = Number(appState.parametros.valor_ut || 43.00).toFixed(2);
    if (gId('param-riesgo-ivss')) gId('param-riesgo-ivss').value = String(appState.parametros.riesgo_ivss || 9);
    if (gId('param-aplica-lpp')) gId('param-aplica-lpp').checked = appState.parametros.aplica_lpp !== false;
    // Campos de conexión: prellenar con guardado/default si existen
    if (gId('param-supabase-url')) gId('param-supabase-url').value = appState.parametros.supabase_url || '';
    if (gId('param-supabase-key')) gId('param-supabase-key').value = appState.parametros.supabase_anon_key || '';

    if (typeof renderSelectorEmpresas === 'function') renderSelectorEmpresas();

    if (conectado) {
        const nombre = appState.parametros.nombre_empresa || 'EMPRESA';
        if (gId('brand-sidebar-title')) gId('brand-sidebar-title').innerText = (nombre || '').split('/')[0].trim() || 'Sistema RRHH';
        if (gId('brand-sidebar-rif')) gId('brand-sidebar-rif').innerText = appState.parametros.rif_empresa || '';
        if (gId('badge-uti-dias-base')) gId('badge-uti-dias-base').innerHTML = `<i class="fa-solid fa-scale-balanced mr-1.5"></i> Base: ${appState.parametros.dias_utilidades || 30} Días`;
    } else {
        if (gId('brand-sidebar-title')) gId('brand-sidebar-title').innerText = 'DEMOSTRATIVA';
        if (gId('brand-sidebar-rif')) gId('brand-sidebar-rif').innerText = 'J-00000000-0';
        if (gId('badge-uti-dias-base')) gId('badge-uti-dias-base').innerHTML = `<i class="fa-solid fa-scale-balanced mr-1.5"></i> Base: ${appState.parametros.dias_utilidades || 30} Días`;
    }

    if (typeof renderTablaTasasMensuales === 'function') renderTablaTasasMensuales();
    if (typeof renderTablaUsuarios === 'function') renderTablaUsuarios();
}

async function guardarParametrosGenerales() {
    const rol = appState.usuarioActual?.rol;
    if (rol !== 'master' && rol !== 'administrador') {
        return showToast('No tiene permisos para modificar parámetros', 'error');
    }
    appState.parametros.nombre_empresa = gId('param-empresa-nombre').value || '';
    appState.parametros.rif_empresa = gId('param-empresa-rif').value || '';
    appState.parametros.dias_utilidades = parseInt(gId('param-dias-utilidades').value) || 30;
    appState.parametros.valor_ut = parseFloat(gId('param-valor-ut').value) || 43.00;
    appState.parametros.riesgo_ivss = parseFloat(gId('param-riesgo-ivss').value) || 9;
    appState.parametros.aplica_lpp = gId('param-aplica-lpp').checked;
    appState.parametros.supabase_url = (gId('param-supabase-url') ? gId('param-supabase-url').value.trim() : '') || '';
    appState.parametros.supabase_anon_key = (gId('param-supabase-key') ? gId('param-supabase-key').value.trim() : '') || '';

    // Persistencia local de configuración
    lsSet('nomina_parametros', JSON.stringify(appState.parametros));
    guardarEmpresaActivaEnRegistro();

    // Recrear cliente si aplica
    if (typeof actualizarClienteSupabase === 'function') actualizarClienteSupabase();

    const payload = {
        id: 1,
        nombre_empresa: appState.parametros.nombre_empresa,
        rif_empresa: appState.parametros.rif_empresa,
        dias_utilidades: appState.parametros.dias_utilidades,
        valor_ut: appState.parametros.valor_ut,
        riesgo_ivss: appState.parametros.riesgo_ivss,
        aplica_lpp: appState.parametros.aplica_lpp
    };
    const payloadConexion = {
        ...payload,
        supabase_url: appState.parametros.supabase_url || null,
        supabase_anon_key: appState.parametros.supabase_anon_key || null
    };

    if (esModoDemo()) {
        // Guardar en demo DB local
        try { await supabaseClient.from('parametros_config').upsert([payloadConexion]); } catch (e) {}
        aplicarParametrosEnVista();
        showToast('Parámetros guardados en modo demo (este equipo)');
        return;
    }

    // Modo DB: solo sincronizar si esquema listo; si no, guardar config local y pedir verificación
    if (!appState.esquemaOk) {
        aplicarParametrosEnVista();
        showToast('Parámetros guardados localmente. Verifique el esquema de la base de datos para sincronizar.', 'error');
        return;
    }

    try {
        const res = await supabaseClient.from('parametros_config').upsert([payloadConexion]);
        if (res && res.error) {
            await supabaseClient.from('parametros_config').upsert([payload]);
        }
    } catch (e) {}

    if (typeof fetchAllData === 'function') {
        // Si se acaba de crear una empresa nueva, no recargar datos de la empresa anterior (estado en blanco).
        if (!appState.empresaRecienCreada) {
            try { await fetchAllData(); } catch (e) { console.warn(e); }
        }
    }
    if (typeof cargarRolesPermisos === 'function') cargarRolesPermisos().catch(console.warn);
    aplicarParametrosEnVista();
    showToast('Parámetros corporativos guardados en la base de datos');
}

// ============================================================
// MULTIEMPRESA — Registro local, selector y creación rápida
// ============================================================

function guardarEmpresaActivaEnRegistro() {
    const rif = (appState.parametros.rif_empresa || '').trim();
    if (!rif) return;
    if (!Array.isArray(appState.empresas)) appState.empresas = [];
    const copia = JSON.parse(JSON.stringify(appState.parametros));
    const idx = appState.empresas.findIndex(e => String(e.rif).toUpperCase() === rif.toUpperCase());
    const entrada = { rif, nombre: appState.parametros.nombre_empresa, parametros: copia };
    if (idx >= 0) appState.empresas[idx] = entrada;
    else appState.empresas.push(entrada);
    appState.empresaActiva = rif;
    lsSet('nomina_empresas', JSON.stringify(appState.empresas));
    lsSet('nomina_empresa_activa', rif);
}

function renderSelectorEmpresas() {
    const sel = gId('param-empresa-selector');
    if (!sel) return;
    const conectado = (typeof esConexionActiva === 'function') ? esConexionActiva() : appState.estadoConexion === 'conectado';
    if (!conectado) {
        sel.innerHTML = `<option value="">Sin conexión — conecte Supabase para cargar empresa</option>`;
        sel.disabled = true;
        return;
    }
    sel.disabled = false;
    const lista = Array.isArray(appState.empresas) ? appState.empresas.slice() : [];
    const rifActual = String(appState.parametros.rif_empresa || '').trim().toUpperCase();
    if (rifActual && !lista.some(e => String(e.rif).toUpperCase() === rifActual)) {
        lista.unshift({ rif: appState.parametros.rif_empresa, nombre: appState.parametros.nombre_empresa });
    }
    sel.innerHTML = lista.length
        ? lista.map(e => `<option value="${e.rif}" ${String(e.rif).toUpperCase() === rifActual ? 'selected' : ''}>${e.nombre || e.rif} — ${e.rif}</option>`).join('')
        : `<option value="">(Sin empresas registradas)</option>`;
}

function abrirModalNuevaEmpresa() {
    if (gId('nueva-empresa-rif')) gId('nueva-empresa-rif').value = '';
    if (gId('nueva-empresa-nombre')) gId('nueva-empresa-nombre').value = '';
    openModal('modal-nueva-empresa');
}

function abrirSelectorEmpresaDb() {
    const cont = gId('selector-empresas-lista');
    const modal = gId('modal-selector-empresa');
    if (!cont || !modal) return;
    const lista = (Array.isArray(appState.empresas) ? appState.empresas : []).filter(e => e && e.rif).slice();
    if (!lista.length) { closeModal('modal-selector-empresa'); return; }
    cont.innerHTML = lista.map(e => `<button onclick="elegirEmpresa('${String(e.rif).replace(/'/g, "''")}')" class="w-full text-left bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg p-3 flex items-center justify-between gap-2 transition">
        <span class="text-xs font-bold text-slate-100">${esc(e.nombre || e.rif)}</span>
        <span class="text-[11px] text-slate-400 font-mono">${esc(e.rif)}</span>
    </button>`).join('');
    openModal('modal-selector-empresa');
}

function elegirEmpresa(rif) {
    if (gId('modal-selector-empresa')) closeModal('modal-selector-empresa');
    if (rif && typeof cambiarEmpresaActiva === 'function') cambiarEmpresaActiva(rif);
}

async function crearNuevaEmpresa() {
    const rol = appState.usuarioActual?.rol;
    if (rol !== 'master' && rol !== 'administrador') {
        return showToast('No tiene permisos para crear empresas', 'error');
    }
    const rif = (gId('nueva-empresa-rif')?.value || '').trim().toUpperCase();
    const nombre = (gId('nueva-empresa-nombre')?.value || '').trim();
    if (!rif || !nombre) return showToast('Indique RIF y razón social de la nueva empresa', 'error');

    const existente = (appState.empresas || []).find(e => String(e.rif).toUpperCase() === rif);
    if (existente && !confirm(`La empresa ${existente.nombre} ya existe. ¿Desea activarla?`)) return;
    if (existente) {
        closeModal('modal-nueva-empresa');
        return cambiarEmpresaActiva(rif);
    }

    // Nueva empresa: solo RIF + razón social. El resto se completa luego en esta misma pestaña.
    appState.parametros = {
        ...appState.parametros,
        nombre_empresa: nombre,
        rif_empresa: rif,
        dias_utilidades: 30,
        valor_ut: appState.parametros.valor_ut || 43.00,
        riesgo_ivss: 9,
        aplica_lpp: true
    };
    // Empresa recién creada: estado en blanco sin datos previos (no se borra la base de datos,
    // solo se muestra el estado vacío para cargar empleados/cargos/departamentos de la nueva empresa).
    appState.empresaRecienCreada = true;
    lsSet('nomina_empresa_recien_creada', rif);
    if (typeof limpiarEstadoNegocio === 'function') limpiarEstadoNegocio();
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof renderDepartamentos === 'function') renderDepartamentos();
    if (typeof renderCargos === 'function') renderCargos();
    if (typeof renderEmpleados === 'function') renderEmpleados();

    guardarEmpresaActivaEnRegistro();
    lsSet('nomina_parametros', JSON.stringify(appState.parametros));
    aplicarParametrosEnVista();
    closeModal('modal-nueva-empresa');
    await guardarParametrosGenerales();
}

async function cambiarEmpresaActiva(rif) {
    const entrada = (appState.empresas || []).find(e => String(e.rif).toUpperCase() === String(rif).toUpperCase());
    if (!entrada) return showToast('Empresa no encontrada en el registro local', 'error');
    // Si se activa una empresa recién creada, mantener estado en blanco; si es una empresa registrada, cargar sus datos.
    const esEmpresaNueva = (lsGet('nomina_empresa_recien_creada') || '') === String(rif || '').toUpperCase();
    appState.empresaRecienCreada = esEmpresaNueva;
    if (!esEmpresaNueva) lsRemove('nomina_empresa_recien_creada');
    if (!esEmpresaNueva) {
        // Limpiar estado previo para no mezclar datos entre empresas al cambiar.
        limpiarEstadoNegocio();
    }
    appState.parametros = {
        ...appState.parametros,
        ...(entrada.parametros || {}),
        rif_empresa: entrada.rif,
        nombre_empresa: entrada.nombre || entrada.parametros?.nombre_empresa || entrada.rif
    };
    appState.empresaActiva = entrada.rif;
    lsSet('nomina_parametros', JSON.stringify(appState.parametros));
    lsSet('nomina_empresa_activa', entrada.rif);
    if (typeof actualizarClienteSupabase === 'function') actualizarClienteSupabase();
    aplicarParametrosEnVista();
    showToast(`Empresa activa: ${appState.parametros.nombre_empresa}`);
    if (typeof fetchAllData === 'function') fetchAllData().catch(console.warn);
}

function establecerEstadoConexion(estado, detalle) {
    appState.estadoConexion = estado || 'sinverificar';
    const mapa = {
        conectado:    { color: 'bg-emerald-500', text: 'Conectado a Supabase',           cls: 'text-emerald-400' },
        comprobando:  { color: 'bg-amber-500',   text: 'Comprobando conexión...',        cls: 'text-amber-400' },
        cache:        { color: 'bg-sky-500',     text: 'Sin conexión (caché local)',     cls: 'text-sky-400' },
        desconectado: { color: 'bg-rose-500',    text: 'Desconectado',                   cls: 'text-rose-400' },
        sinverificar: { color: 'bg-slate-600',   text: 'Sin verificar',                  cls: 'text-slate-400' },
        demo:         { color: 'bg-violet-500',  text: 'Modo Demo (datos en este equipo)', cls: 'text-violet-400' }
    };
    const m = mapa[appState.estadoConexion] || mapa.sinverificar;
    const dot = gId('supabase-status-dot');
    const txt = gId('supabase-status');
    const txtParam = gId('supabase-status-param');
    if (dot) dot.className = 'w-2 h-2 rounded-full ' + m.color;
    if (txt) { txt.innerText = detalle || m.text; txt.className = 'text-[11px] font-semibold ' + m.cls; }
    if (txtParam) { txtParam.innerText = detalle || m.text; txtParam.className = 'font-bold ' + m.cls; }
}

async function verificarConexionInicial() {
    if (esModoDemo()) {
        establecerEstadoConexion('demo', 'Modo Demo (datos en este equipo)');
        actualizarClienteSupabase();
        aplicarParametrosEnVista();
        if (typeof renderDashboard === 'function') renderDashboard();
        return;
    }

    const creds = _obtenerCredencialesDb();
    if (!creds.url || !creds.key) {
        appState.modoDatos = 'demo';
        establecerEstadoConexion('demo', 'Modo Demo (datos en este equipo)');
        actualizarClienteSupabase();
        aplicarParametrosEnVista();
        return;
    }

    establecerEstadoConexion('comprobando');
    let ok = false;
    try {
        const resp = await fetch(`${creds.url}/rest/v1/parametros_config?select=id&limit=1`, {
            headers: { apikey: creds.key, Authorization: `Bearer ${creds.key}` }
        });
        // 200 ok, 404 table not found (DB reachable but schema missing), 401/403 auth issues
        ok = resp.status === 200 || resp.status === 206 || resp.status === 404 || resp.status === 400;
        // But 401/403 means bad creds; treat as not ok
        if (resp.status === 401 || resp.status === 403) ok = false;
        // 404 means endpoint/table missing but server reachable - connection OK for our purposes
        if (resp.status === 404) ok = true;
    } catch (e) {
        ok = false;
    }

    if (!ok) {
        limpiarEstadoNegocio();
        establecerEstadoConexion('desconectado');
        aplicarParametrosEnVista();
        if (typeof renderDashboard === 'function') renderDashboard();
        return;
    }

    // Conexión alcanzable: verificar esquema
    actualizarClienteSupabase();
    const verif = (typeof verificarEsquemaDb === 'function') ? await verificarEsquemaDb() : { ok: true, faltantes: [], errores: [] };
    appState.esquemaOk = !!verif.ok;
    appState.esquemaFaltantes = verif.faltantes || [];

    if (!verif.ok) {
        const faltantes = verif.faltantes || [];
        const tablasFaltantes = faltantes.filter(f => String(f).startsWith('Tabla faltante:')).map(f => String(f).replace('Tabla faltante: ','').trim());
        const core = ['parametros_config','usuarios','empleados','departamentos','cargos'];
        const bloqueante = tablasFaltantes.some(t => core.includes(t));
        appState.modoDatos = 'db';
        actualizarEstadoEsquemaUI(verif);

        if (!bloqueante) {
            // Tablas núcleo presentes: permitir operar con advertencias
            lsSet('nomina_modo_datos', 'db');
            establecerEstadoConexion('conectado', 'Conectado (esquema con advertencias)');
            if (typeof fetchAllData === 'function') {
                try {
                    await fetchAllData();
                    if (typeof cargarRolesPermisos === 'function') cargarRolesPermisos().catch(console.warn);
                } catch (e) {
                    console.warn('Error cargando datos:', e);
                }
            }
            aplicarParametrosEnVista();
            if (typeof renderDashboard === 'function') renderDashboard();
            return;
        }

        // Esquema crítico faltante (base nueva): requerir creación/actualización antes de operar con datos
        establecerEstadoConexion('conectado', 'Conectado (esquema pendiente)');
        limpiarEstadoNegocio();
        aplicarParametrosEnVista();
        if (typeof renderDashboard === 'function') renderDashboard();
        return;
    }

    // Esquema OK: modo DB completo
    appState.modoDatos = 'db';
    lsSet('nomina_modo_datos', 'db');
    limpiarDatosDemoLocal();
    establecerEstadoConexion('conectado', creds.url === DEFAULT_SUPABASE_URL ? 'Conectado (base por defecto)' : 'Conectado a Supabase');

    if (typeof fetchAllData === 'function') {
        try {
            await fetchAllData();
            if (typeof cargarRolesPermisos === 'function') cargarRolesPermisos().catch(console.warn);
        } catch (e) {
            console.warn('Error cargando datos:', e);
        }
    }
    aplicarParametrosEnVista();
    actualizarEstadoEsquemaUI({ ok: true, faltantes: [], errores: [] });
    if (typeof renderDashboard === 'function') renderDashboard();
}

async function probarConexionSupabase() {
    const urlInput = (gId('param-supabase-url')?.value || '').trim();
    const keyInput = (gId('param-supabase-key')?.value || '').trim();

    // Si el usuario borra credenciales y no hay defaults, volver a modo demo
    if (!urlInput && !keyInput && !DEFAULT_SUPABASE_URL) {
        appState.parametros = {
            ...appState.parametros,
            nombre_empresa: 'DEMOSTRATIVA',
            rif_empresa: 'J-00000000-0',
            supabase_url: '',
            supabase_anon_key: ''
        };
        appState.empresas = [];
        appState.empresaActiva = null;
        appState.usuarios = [...USUARIOS_DEFAULT];
        appState.modoDatos = 'demo';
        appState.esquemaOk = false;
        appState.esquemaFaltantes = [];
        lsSet('nomina_parametros', JSON.stringify(appState.parametros));
        lsSet('nomina_modo_datos', 'demo');
        actualizarClienteSupabase();
        limpiarEstadoNegocio();
        establecerEstadoConexion('demo', 'Modo Demo (empresa demostrativa, sin datos)');
        aplicarParametrosEnVista();
        if (typeof renderDashboard === 'function') renderDashboard();
        return showToast('Modo demo activado (empresa demostrativa, sin datos)');
    }

    const url = (urlInput || DEFAULT_SUPABASE_URL || '').replace(/\/+$/, '');
    const key = keyInput || DEFAULT_SUPABASE_ANON_KEY || '';

    if (!/^https?:\/\//i.test(url)) {
        establecerEstadoConexion('desconectado');
        return showToast('URL de Supabase inválida (debe iniciar con https://)', 'error');
    }
    if (!key) {
        establecerEstadoConexion('desconectado');
        return showToast('Debe indicar la clave anónima (anon key)', 'error');
    }

    establecerEstadoConexion('comprobando');
    let reachable = false;
    try {
        // Validación ligera: consultar endpoint REST (parametros_config) para confirmar URL + anon key.
        // 200/206/400/404 => servidor alcanzable y credenciales aceptadas (404 puede indicar esquema faltante).
        // 401/403 => credenciales inválidas.
        const resp = await fetch(`${url}/rest/v1/parametros_config?select=id&limit=1`, {
            headers: { apikey: key, Authorization: `Bearer ${key}` }
        });
        if (resp.status === 401 || resp.status === 403) {
            reachable = false;
            showToast(`Credenciales rechazadas (HTTP ${resp.status}). Verifique URL y anon key.`, 'error');
        } else if (resp.ok || resp.status === 400 || resp.status === 404 || resp.status === 406) {
            reachable = true;
        } else {
            reachable = false;
            showToast(`No se pudo validar la conexión (HTTP ${resp.status}). Verifique URL y anon key.`, 'error');
        }
    } catch (e) {
        reachable = false;
        showToast('No se pudo conectar con Supabase. Verifique URL y conexión a internet.', 'error');
    }

    if (!reachable) {
        limpiarEstadoNegocio();
        establecerEstadoConexion('desconectado');
        aplicarParametrosEnVista();
        if (typeof renderDashboard === 'function') renderDashboard();
        return;
    }

    // Guardar credenciales configuradas y pasar a verificación de esquema
    appState.parametros.supabase_url = urlInput || (DEFAULT_SUPABASE_URL ? '' : url);
    appState.parametros.supabase_anon_key = keyInput || (DEFAULT_SUPABASE_ANON_KEY ? '' : key);
    // Si usaron defaults implícitos, mantener campos claros pero usar defaults; si ingresaron, guardar
    if (urlInput) appState.parametros.supabase_url = urlInput.replace(/\/+$/, '');
    if (keyInput) appState.parametros.supabase_anon_key = keyInput;
    lsSet('nomina_parametros', JSON.stringify(appState.parametros));
    appState.modoDatos = 'db';
    actualizarClienteSupabase();

    establecerEstadoConexion('conectado', 'Conectado. Verificando esquema de base de datos...');
    showToast('Conexión verificada. Revisando tablas y campos...');

    const verif = (typeof verificarEsquemaDb === 'function') ? await verificarEsquemaDb() : { ok: true, faltantes: [], errores: [] };
    appState.esquemaOk = !!verif.ok;
    appState.esquemaFaltantes = verif.faltantes || [];
    actualizarEstadoEsquemaUI(verif);

    if (!verif.ok) {
        const faltantes = verif.faltantes || [];
        const tablasFaltantes = faltantes.filter(f => String(f).startsWith('Tabla faltante:')).map(f => String(f).replace('Tabla faltante: ','').trim());
        const core = ['parametros_config','usuarios','empleados','departamentos','cargos'];
        const bloqueante = tablasFaltantes.some(t => core.includes(t));
        appState.modoDatos = 'db';
        actualizarEstadoEsquemaUI(verif);
        if (bloqueante) {
            establecerEstadoConexion('conectado', 'Conectado (esquema pendiente de creación/actualización)');
            limpiarEstadoNegocio();
            aplicarParametrosEnVista();
            if (typeof renderDashboard === 'function') renderDashboard();
            showToast('Conexión OK, pero faltan tablas esenciales. Genere y ejecute el SQL de esquema.', 'error');
            return;
        }
        lsSet('nomina_modo_datos', 'db');
        establecerEstadoConexion('conectado', 'Conectado (esquema con advertencias)');
        if (typeof fetchAllData === 'function') {
            try {
                await fetchAllData();
                if (typeof cargarRolesPermisos === 'function') cargarRolesPermisos().catch(console.warn);
                aplicarParametrosEnVista();
                showToast('Conectado. Esquema con advertencias: puede completar tablas/campos desde "Verificar esquema".');
            } catch (e) {
                console.warn(e);
                showToast('Conectado, pero no se pudieron cargar todos los datos', 'error');
            }
        }
        return;
    }

    // Esquema listo: activar modo DB y quitar datos demo locales
    lsSet('nomina_modo_datos', 'db');
    limpiarDatosDemoLocal();
    establecerEstadoConexion('conectado', 'Conectado a Supabase (esquema listo)');
    if (typeof fetchAllData === 'function') {
        try {
            await fetchAllData();
            if (typeof cargarRolesPermisos === 'function') cargarRolesPermisos().catch(console.warn);
            aplicarParametrosEnVista();
            showToast('Base de datos lista. Datos cargados desde Supabase.');
        } catch (e) {
            console.warn(e);
            showToast('Conectado, pero no se pudieron cargar todos los datos', 'error');
        }
    }
}

function limpiarDatosDemoLocal() {
    try {
        const prefix = storageKey('');
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
        for (const k of keys) {
            if (!k || !k.startsWith(prefix)) continue;
            // conservar configuración de conexión y modo
            if (k === storageKey('nomina_parametros')) continue;
            if (k === storageKey('nomina_modo_datos')) continue;
            // eliminar datos demo (tablas demo y cachés de negocio)
            if (k.indexOf('demo_db__') !== -1) { localStorage.removeItem(k); continue; }
            // eliminar cachés de negocio antiguas; mantener solo lo esencial de config
            const keep = ['nomina_parametros','nomina_modo_datos'];
            const isKeep = keep.some(x => k === storageKey(x));
            if (!isKeep && k.startsWith(storageKey('nomina_'))) {
                localStorage.removeItem(k);
            }
        }
    } catch (e) {}
}

function actualizarEstadoEsquemaUI(verif) {
    const el = gId('db-schema-status');
    const btn = gId('btn-crear-esquema');
    const falt = (verif && verif.faltantes) ? verif.faltantes : [];
    const errs = (verif && verif.errores) ? verif.errores : [];
    if (el) {
        if (verif && verif.ok) {
            el.innerHTML = `<span class="text-emerald-400 font-semibold"><i class="fa-solid fa-circle-check mr-1"></i> Esquema completo y listo.</span>`;
        } else {
            const items = falt.slice(0, 8).map(x => `<li>${x}</li>`).join('');
            const more = falt.length > 8 ? `<li>... y ${falt.length - 8} más</li>` : '';
            const errItems = errs.slice(0,3).map(x => `<li class="text-amber-400">${x}</li>`).join('');
            el.innerHTML = `<div class="text-rose-400 font-semibold mb-1"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Esquema incompleto o faltante</div>
                <ul class="list-disc ml-4 text-[11px] text-slate-300 space-y-0.5">${items}${more}${errItems}</ul>
                <p class="text-[11px] text-slate-400 mt-2">Genere el SQL y ejecútelo en Supabase (SQL Editor), luego verifique nuevamente. El sistema trabajará con la base de datos cuando el esquema esté completo.</p>`;
        }
    }
    if (btn) {
        if (verif && verif.ok) {
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
            btn.innerHTML = '<i class="fa-solid fa-check"></i><span>Esquema listo</span>';
        } else if (esConexionActiva() && appState.modoDatos === 'db') {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            btn.innerHTML = '<i class="fa-solid fa-database"></i><span>Generar SQL de tablas</span>';
        }
    }
}

async function verificarEsquemaUI() {
    if (esModoDemo()) return showToast('Conecte una base de datos Supabase para verificar el esquema', 'error');
    establecerEstadoConexion('comprobando', 'Verificando esquema...');
    const verif = (typeof verificarEsquemaDb === 'function') ? await verificarEsquemaDb() : { ok: false, faltantes: ['Verificador no disponible'], errores: [] };
    appState.esquemaOk = !!verif.ok;
    appState.esquemaFaltantes = verif.faltantes || [];
    actualizarEstadoEsquemaUI(verif);

    if (verif.ok) {
        establecerEstadoConexion('conectado', 'Conectado a Supabase (esquema listo)');
        lsSet('nomina_modo_datos', 'db');
        limpiarDatosDemoLocal();
        if (typeof fetchAllData === 'function') await fetchAllData();
        aplicarParametrosEnVista();
        showToast('Esquema verificado correctamente. Sistema listo para usar la base de datos.');
        return;
    }

    const faltantes = verif.faltantes || [];
    const tablasFaltantes = faltantes.filter(f => String(f).startsWith('Tabla faltante:')).map(f => String(f).replace('Tabla faltante: ','').trim());
    const core = ['parametros_config','usuarios','empleados','departamentos','cargos'];
    const bloqueante = tablasFaltantes.some(t => core.includes(t));
    if (!bloqueante) {
        lsSet('nomina_modo_datos', 'db');
        establecerEstadoConexion('conectado', 'Conectado (esquema con advertencias)');
        if (typeof fetchAllData === 'function') {
            try { await fetchAllData(); } catch (e) { console.warn(e); }
        }
        aplicarParametrosEnVista();
        showToast('Conectado con advertencias de esquema. Puede generar el SQL para completar tablas/campos faltantes.');
        return;
    }

    establecerEstadoConexion('conectado', 'Conectado (esquema pendiente)');
    limpiarEstadoNegocio();
    aplicarParametrosEnVista();
    showToast('Faltan tablas esenciales. Genere y ejecute el SQL en Supabase, luego verifique nuevamente.', 'error');
}

function abrirModalEsquemaSql() {
    const sql = (typeof generarSqlEsquemaCompleto === 'function') ? generarSqlEsquemaCompleto() : '-- No disponible';
    let modal = gId('modal-esquema-sql');
    if (!modal) {
        // crear modal dinámicamente si no existe
        modal = document.createElement('div');
        modal.id = 'modal-esquema-sql';
        modal.className = 'fixed inset-0 bg-slate-950/85 backdrop-blur-sm hidden items-center justify-center p-4 z-50';
        modal.innerHTML = `<div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
          <div class="flex justify-between items-center p-4 border-b border-slate-800"><h3 class="text-base font-bold text-white"><i class="fa-solid fa-database text-sky-400 mr-2"></i>SQL de creación/actualización de tablas</h3><button onclick="closeModal('modal-esquema-sql')" class="text-slate-400 hover:text-white p-1"><i class="fa-solid fa-xmark text-lg"></i></button></div>
          <div class="p-4 overflow-auto flex-1"><p class="text-[11px] text-slate-400 mb-2">Copie este script y ejecútelo en <strong>Supabase → SQL Editor</strong>. Luego pulse "Verificar esquema".</p><textarea id="esquema-sql-text" readonly class="w-full h-[50vh] bg-slate-950 border border-slate-800 rounded-lg p-3 text-[11px] font-mono text-slate-200"></textarea></div>
          <div class="p-4 border-t border-slate-800 flex justify-end gap-2"><button onclick="copiarSqlEsquema()" class="bg-sky-600 hover:bg-sky-500 text-white text-xs px-4 py-2 rounded-lg font-bold"><i class="fa-solid fa-copy mr-1"></i>Copiar SQL</button><button onclick="closeModal('modal-esquema-sql')" class="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-4 py-2 rounded-lg font-bold">Cerrar</button></div>
        </div>`;
        document.body.appendChild(modal);
    }
    const ta = gId('esquema-sql-text');
    if (ta) ta.value = sql;
    openModal('modal-esquema-sql');
}

function copiarSqlEsquema() {
    const ta = gId('esquema-sql-text');
    if (!ta) return;
    const txt = ta.value || '';
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(() => showToast('SQL copiado al portapapeles')).catch(() => { ta.select(); document.execCommand('copy'); showToast('SQL copiado'); });
    } else {
        ta.select(); document.execCommand('copy'); showToast('SQL copiado');
    }
}

function abrirModalEsquemaSqlMulti() {
    const sql = (typeof generarSqlMultiEmpresa === 'function') ? generarSqlMultiEmpresa() : '-- No disponible';
    let modal = gId('modal-esquema-sql-multi');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-esquema-sql-multi';
        modal.className = 'fixed inset-0 bg-slate-950/85 backdrop-blur-sm hidden items-center justify-center p-4 z-50';
        modal.innerHTML = `<div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
          <div class="flex justify-between items-center p-4 border-b border-slate-800"><h3 class="text-base font-bold text-white"><i class="fa-solid fa-layer-group text-indigo-400 mr-2"></i>SQL Multiempresa: varias empresas en la misma base</h3><button onclick="closeModal('modal-esquema-sql-multi')" class="text-slate-400 hover:text-white p-1"><i class="fa-solid fa-xmark text-lg"></i></button></div>
          <div class="p-4 overflow-auto flex-1"><p class="text-[11px] text-slate-400 mb-2">Script para habilitar el uso multiempresa con <code>empresa_id</code> en la misma base de datos (mismo proyecto Supabase). Copie y ejecútelo en <strong>Supabase → SQL Editor</strong>, luego use "Verificar esquema".</p><textarea id="esquema-sql-multi-text" readonly class="w-full h-[55vh] bg-slate-950 border border-slate-800 rounded-lg p-3 text-[11px] font-mono text-slate-200"></textarea></div>
          <div class="p-4 border-t border-slate-800 flex justify-end gap-2"><button onclick="copiarSqlMulti()" class="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-lg"><i class="fa-solid fa-copy mr-1"></i>Copiar SQL</button><button onclick="closeModal('modal-esquema-sql-multi')" class="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold px-4 py-2 rounded-lg">Cerrar</button></div>
        </div>`;
        document.body.appendChild(modal);
    }
    const ta = gId('esquema-sql-multi-text');
    if (ta) ta.value = sql;
    openModal('modal-esquema-sql-multi');
}

function copiarSqlMulti() {
    const ta = gId('esquema-sql-multi-text');
    if (!ta) return;
    const txt = ta.value || '';
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(() => showToast('SQL multiempresa copiado al portapapeles')).catch(() => { ta.select(); document.execCommand('copy'); showToast('SQL multiempresa copiado'); });
    } else {
        ta.select(); document.execCommand('copy'); showToast('SQL multiempresa copiado');
    }
}

// ============================================================
// LICENCIA / BLOQUEO POR SUSCRIPCIÓN
// ============================================================

function verificarLicenciaBloqueo() {
    if (esModoDemo()) {
        appState.licenciaBloqueada = false;
        const ov = gId('license-block-overlay');
        if (ov) { ov.classList.add('hidden'); ov.classList.remove('flex'); }
        return false;
    }
    const p = appState.parametros || {};
    let bloqueada = false;
    let mensaje = String(p.licencia_mensaje || '').replace(/\s*por falta de pago\.?/ig, '').replace(/\s{2,}/g, ' ').trim();

    if (p.licencia_bloqueada === true || p.licencia_estado === 'bloqueada' || p.licencia_estado === 'suspendida') {
        bloqueada = true;
    }
    if (p.licencia_vencimiento) {
        try {
            const hoy = new Date(); hoy.setHours(0,0,0,0);
            const venc = new Date(p.licencia_vencimiento + 'T00:00:00');
            if (!isNaN(venc.getTime()) && venc < hoy) {
                bloqueada = true;
                if (!mensaje) mensaje = 'Servicio suspendido. Contacte al proveedor.';
            }
        } catch (e) {}
    }

    appState.licenciaBloqueada = bloqueada;
    appState.licenciaMensaje = (mensaje || 'Servicio suspendido. Contacte al proveedor.').replace(/\s*por falta de pago\.?/ig, '').replace(/\s{2,}/g, ' ').trim();
    const ov = gId('license-block-overlay');
    if (ov) {
        const msg = gId('license-block-message');
        if (msg) msg.innerText = appState.licenciaMensaje;
        if (bloqueada) { ov.classList.remove('hidden'); ov.classList.add('flex'); }
        else { ov.classList.add('hidden'); ov.classList.remove('flex'); }
    }
    return bloqueada;
}

// ============================================================
// DASHBOARD (KPIs) y POPULATE SELECTS
// ============================================================

function renderDashboard() {
    const act = appState.empleados.filter(e => e.activo);
    const tm = act.reduce((a, e) =>
        a + Number(e.sueldo) + Number(e.bono_alimentacion) + Number(e.otros_ingresos), 0);
    if (gId('kpi-total-nomina')) gId('kpi-total-nomina').innerText = `$${tm.toFixed(2)}`;
    if (gId('kpi-total-empleados')) gId('kpi-total-empleados').innerText = act.length;
    if (gId('kpi-total-deptos')) gId('kpi-total-deptos').innerText = appState.departamentos.length;
    if (gId('kpi-total-cargos')) gId('kpi-total-cargos').innerText = appState.cargos.length;
}

function populateSelects() {
    const opts = (arr) => '<option value="">-- Seleccionar --</option>' +
        arr.map(x => `<option value="${x.id}">${x.nombre}</option>`).join('');

    const empOpts = '<option value="">-- Seleccionar --</option>' +
        appState.empleados.filter(e => e.activo)
            .map(x => `<option value="${x.id}">${x.nombre}</option>`).join('');

    if (gId('emp-depto-select')) gId('emp-depto-select').innerHTML = opts(appState.departamentos);
    if (gId('emp-cargo-select')) gId('emp-cargo-select').innerHTML = opts(appState.cargos);

    if (gId('vac-emp-select') && gId('vac-emp-select').children.length <= 1) gId('vac-emp-select').innerHTML = empOpts;
    if (gId('ant-emp-select') && gId('ant-emp-select').children.length <= 1) gId('ant-emp-select').innerHTML = empOpts;
    if (gId('pres-emp-select') && gId('pres-emp-select').children.length <= 1) gId('pres-emp-select').innerHTML = empOpts;
    if (gId('hist-sal-emp-select') && gId('hist-sal-emp-select').children.length <= 1) gId('hist-sal-emp-select').innerHTML = empOpts;
}
