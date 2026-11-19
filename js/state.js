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
        nombre_empresa: 'BOCANADA CAFÉ / GRUPO PRALUM, C.A.',
        rif_empresa: 'J-50088879-1',
        dias_utilidades: 30,
        valor_ut: 43.00,
        supabase_url: '',
        supabase_anon_key: ''
    },
    empresas: [],          // Registro local de empresas (multiempresa)
    empresaActiva: null,   // RIF de la empresa activa
    estadoConexion: 'sinverificar', // sinverificar | comprobando | conectado | desconectado | cache
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
    localStorage.setItem('nomina_features_config', JSON.stringify(nuevasFlags));
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
            localStorage.setItem('nomina_roles_permisos', JSON.stringify(appState.rolesPermisos));
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

function cargarCacheLocal() {
    // Credenciales de conexión Supabase (se preservan siempre)
    const p = localStorage.getItem('nomina_parametros');
    if (p) {
        try { appState.parametros = { ...appState.parametros, ...JSON.parse(p) }; }
        catch (e) { /* conserva defaults */ }
    }
    // Asegurar que el cliente Supabase use las credenciales guardadas
    if (typeof actualizarClienteSupabase === 'function') actualizarClienteSupabase();

    // Registro local de empresas (multiempresa)
    const emps = localStorage.getItem('nomina_empresas');
    if (emps) {
        try {
            const parsed = JSON.parse(emps);
            if (Array.isArray(parsed)) appState.empresas = parsed;
        } catch (e) { appState.empresas = []; }
    }
    appState.empresaActiva = localStorage.getItem('nomina_empresa_activa') || null;

    // Usuarios esenciales para login (master/sistema). Datos completos se cargan al conectar.
    appState.usuarios = [...USUARIOS_DEFAULT];

    // Estado inicial limpio: sin datos de negocio hasta verificar conexión
    limpiarEstadoNegocio();

    // Feature flags y matriz de permisos: esenciales para UI/roles
    const fc = localStorage.getItem('nomina_features_config');
    if (fc) {
        try { appState.features = JSON.parse(fc); } catch (e) {}
    }
    const rpCache = localStorage.getItem('nomina_roles_permisos');
    if (rpCache) {
        try {
            const parsed = JSON.parse(rpCache);
            if (Array.isArray(parsed)) appState.rolesPermisos = parsed;
        } catch (e) {}
    }

    if (typeof establecerEstadoConexion === 'function') establecerEstadoConexion('sinverificar');
    aplicarParametrosEnVista();
    if (typeof renderPanelFeatureFlags === 'function') renderPanelFeatureFlags();

    // Verificar conexión y, si está disponible, cargar datos desde Supabase
    if (typeof verificarConexionInicial === 'function') verificarConexionInicial().catch(console.warn);

    // Carga de permisos (no bloqueante, con fallback a defaults/caché)
    cargarRolesPermisos().catch(console.warn);
}

// ============================================================
// PARÁMETROS DE EMPRESA — Vista + guardado
// ============================================================

function aplicarParametrosEnVista() {
    const conectado = (typeof esConexionActiva === 'function') ? esConexionActiva() : appState.estadoConexion === 'conectado';

    if (gId('param-empresa-nombre')) gId('param-empresa-nombre').value = appState.parametros.nombre_empresa || '';
    if (gId('param-empresa-rif')) gId('param-empresa-rif').value = appState.parametros.rif_empresa || '';
    if (gId('param-dias-utilidades')) gId('param-dias-utilidades').value = appState.parametros.dias_utilidades || 30;
    if (gId('param-valor-ut')) gId('param-valor-ut').value = Number(appState.parametros.valor_ut || 43.00).toFixed(2);
    if (gId('param-riesgo-ivss')) gId('param-riesgo-ivss').value = String(appState.parametros.riesgo_ivss || 9);
    if (gId('param-aplica-lpp')) gId('param-aplica-lpp').checked = appState.parametros.aplica_lpp !== false;
    if (gId('param-supabase-url')) gId('param-supabase-url').value = appState.parametros.supabase_url || '';
    if (gId('param-supabase-key')) gId('param-supabase-key').value = appState.parametros.supabase_anon_key || '';

    if (typeof renderSelectorEmpresas === 'function') renderSelectorEmpresas();

    if (conectado) {
        const nombre = appState.parametros.nombre_empresa || 'EMPRESA';
        if (gId('brand-sidebar-title')) gId('brand-sidebar-title').innerText = nombre.split('/')[0].trim();
        if (gId('brand-sidebar-rif')) gId('brand-sidebar-rif').innerText = appState.parametros.rif_empresa || '';
        if (gId('badge-uti-dias-base')) gId('badge-uti-dias-base').innerHTML = `<i class="fa-solid fa-scale-balanced mr-1.5"></i> Base: ${appState.parametros.dias_utilidades || 30} Días`;
    } else {
        if (gId('brand-sidebar-title')) gId('brand-sidebar-title').innerText = 'Sistema RRHH';
        if (gId('brand-sidebar-rif')) gId('brand-sidebar-rif').innerText = 'Sin conexión';
        if (gId('badge-uti-dias-base')) gId('badge-uti-dias-base').innerHTML = `<i class="fa-solid fa-scale-balanced mr-1.5"></i> Base: -- Días`;
    }

    if (typeof renderTablaTasasMensuales === 'function') renderTablaTasasMensuales();
    if (typeof renderTablaUsuarios === 'function') renderTablaUsuarios();
}

async function guardarParametrosGenerales() {
    const rol = appState.usuarioActual?.rol;
    if (rol !== 'master' && rol !== 'administrador') {
        return showToast('No tiene permisos para modificar parámetros', 'error');
    }
    appState.parametros.nombre_empresa = gId('param-empresa-nombre').value || 'EMPRESA';
    appState.parametros.rif_empresa = gId('param-empresa-rif').value || 'J-00000000-0';
    appState.parametros.dias_utilidades = parseInt(gId('param-dias-utilidades').value) || 30;
    appState.parametros.valor_ut = parseFloat(gId('param-valor-ut').value) || 43.00;
    appState.parametros.riesgo_ivss = parseFloat(gId('param-riesgo-ivss').value) || 9;
    appState.parametros.aplica_lpp = gId('param-aplica-lpp').checked;
    appState.parametros.supabase_url = (gId('param-supabase-url') ? gId('param-supabase-url').value.trim() : '') || '';
    appState.parametros.supabase_anon_key = (gId('param-supabase-key') ? gId('param-supabase-key').value.trim() : '') || '';

    // Persistencia local inmediata (funciona incluso sin conexión)
    localStorage.setItem('nomina_parametros', JSON.stringify(appState.parametros));
    guardarEmpresaActivaEnRegistro();

    // Recrear el cliente con la configuración nueva antes de sincronizar
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
    try {
        // Intenta guardar también la conexión; si las columnas aún no existen
        // (esquema anterior), reintenta solo con los parámetros clásicos.
        const res = await supabaseClient.from('parametros_config').upsert([payloadConexion]);
        if (res && res.error) {
            await supabaseClient.from('parametros_config').upsert([payload]);
        }
    } catch (e) {}

    if (typeof fetchAllData === 'function') {
        try { await fetchAllData(); showToast('Datos cargados desde la base'); }
        catch (e) { showToast('No se pudieron cargar los datos', 'error'); console.warn(e); }
    }
    // Actualizar matriz de permisos después de recargar datos
    if (typeof cargarRolesPermisos === 'function') cargarRolesPermisos().catch(console.warn);
    aplicarParametrosEnVista();
    showToast('Parámetros corporativos guardados exitosamente');
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
    localStorage.setItem('nomina_empresas', JSON.stringify(appState.empresas));
    localStorage.setItem('nomina_empresa_activa', rif);
}

function renderSelectorEmpresas() {
    const sel = gId('param-empresa-selector');
    if (!sel) return;
    const conectado = (typeof esConexionActiva === 'function') ? esConexionActiva() : appState.estadoConexion === 'conectado';
    if (!conectado) {
        sel.innerHTML = `<option value="">Sin conexión — verifique Supabase para cargar empresa</option>`;
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
    guardarEmpresaActivaEnRegistro();
    localStorage.setItem('nomina_parametros', JSON.stringify(appState.parametros));
    aplicarParametrosEnVista();
    closeModal('modal-nueva-empresa');
    await guardarParametrosGenerales();
}

async function cambiarEmpresaActiva(rif) {
    const entrada = (appState.empresas || []).find(e => String(e.rif).toUpperCase() === String(rif).toUpperCase());
    if (!entrada) return showToast('Empresa no encontrada en el registro local', 'error');
    appState.parametros = {
        ...appState.parametros,
        ...(entrada.parametros || {}),
        rif_empresa: entrada.rif,
        nombre_empresa: entrada.nombre || entrada.parametros?.nombre_empresa || entrada.rif
    };
    appState.empresaActiva = entrada.rif;
    localStorage.setItem('nomina_parametros', JSON.stringify(appState.parametros));
    localStorage.setItem('nomina_empresa_activa', entrada.rif);
    if (typeof actualizarClienteSupabase === 'function') actualizarClienteSupabase();
    aplicarParametrosEnVista();
    showToast(`Empresa activa: ${appState.parametros.nombre_empresa}`);
    if (typeof fetchAllData === 'function') fetchAllData().catch(console.warn);
}

function establecerEstadoConexion(estado, detalle) {
    appState.estadoConexion = estado || 'sinverificar';
    const mapa = {
        conectado:    { color: 'bg-emerald-500', text: 'Conectado a Supabase',      cls: 'text-emerald-400' },
        comprobando:  { color: 'bg-amber-500',   text: 'Comprobando conexión...',   cls: 'text-amber-400' },
        cache:        { color: 'bg-sky-500',     text: 'Sin conexión (caché local)', cls: 'text-sky-400' },
        desconectado: { color: 'bg-rose-500',    text: 'Desconectado',               cls: 'text-rose-400' },
        sinverificar: { color: 'bg-slate-600',   text: 'Sin verificar',              cls: 'text-slate-400' }
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
    const url = (appState.parametros.supabase_url || SUPABASE_URL).replace(/\/+$/, '');
    const key = appState.parametros.supabase_anon_key || SUPABASE_ANON_KEY;
    establecerEstadoConexion('comprobando');
    let ok = false;
    try {
        const resp = await fetch(`${url}/rest/v1/parametros_config?select=id&limit=1`, {
            headers: { apikey: key, Authorization: `Bearer ${key}` }
        });
        ok = resp.ok;
    } catch (e) {
        ok = false;
    }

    if (ok) {
        // Asegurar cliente actualizado con la configuración vigente antes de cargar datos
        if (typeof actualizarClienteSupabase === 'function') actualizarClienteSupabase();
        if (typeof fetchAllData === 'function') {
            try {
                await fetchAllData();
                if (typeof cargarRolesPermisos === 'function') cargarRolesPermisos().catch(console.warn);
            } catch (e) {
                console.warn('Error cargando datos tras verificar conexión:', e);
            }
        }
        establecerEstadoConexion('conectado',
            appState.parametros.supabase_url ? 'Conectado a Supabase' : 'Conectado (base por defecto)');
        aplicarParametrosEnVista();
        if (typeof renderDashboard === 'function') renderDashboard();
    } else {
        limpiarEstadoNegocio();
        establecerEstadoConexion('desconectado');
        aplicarParametrosEnVista();
        if (typeof renderDashboard === 'function') renderDashboard();
    }
}

async function probarConexionSupabase() {
    const url = ((gId('param-supabase-url')?.value || '').trim() || SUPABASE_URL).replace(/\/+$/, '');
    const key = (gId('param-supabase-key')?.value || '').trim() || SUPABASE_ANON_KEY;

    if (!/^https?:\/\//i.test(url)) {
        establecerEstadoConexion('desconectado');
        return showToast('URL de Supabase inválida (debe iniciar con https://)', 'error');
    }

    establecerEstadoConexion('comprobando');
    let ok = false;
    try {
        const resp = await fetch(`${url}/rest/v1/parametros_config?select=id&limit=1`, {
            headers: { apikey: key, Authorization: `Bearer ${key}` }
        });
        ok = resp.ok;
        if (!ok) showToast(`Supabase respondió ${resp.status}. Verifique URL y anon key.`, 'error');
    } catch (e) {
        showToast('No se pudo conectar con Supabase. Verifique la URL y su conexión a internet.', 'error');
    }

    if (!ok) {
        limpiarEstadoNegocio();
        establecerEstadoConexion('desconectado');
        aplicarParametrosEnVista();
        if (typeof renderDashboard === 'function') renderDashboard();
        return;
    }

    // Guardar la configuración de conexión y recrear el cliente Supabase
    appState.parametros.supabase_url = url;
    appState.parametros.supabase_anon_key = key;
    try { localStorage.setItem('nomina_parametros', JSON.stringify(appState.parametros)); } catch (e) {}
    if (typeof actualizarClienteSupabase === 'function') actualizarClienteSupabase();

    establecerEstadoConexion('conectado');
    showToast('Conexión verificada. Cargando datos desde Supabase...');

    if (typeof fetchAllData === 'function') {
        try {
            await fetchAllData();
            if (typeof cargarRolesPermisos === 'function') cargarRolesPermisos().catch(console.warn);
            aplicarParametrosEnVista();
            establecerEstadoConexion('conectado', 'Conectado a Supabase');
            showToast('Datos cargados desde Supabase correctamente');
        } catch (e) {
            console.warn(e);
            establecerEstadoConexion('cache', 'Conectado, usando caché local');
            showToast('Conectado, pero no se pudieron cargar todos los datos', 'error');
        }
    } else {
        aplicarParametrosEnVista();
    }
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
