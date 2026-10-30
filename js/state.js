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
    anticipos: [],
    tasasMensuales: [], usuarios: [], usuarioActual: null, mesesEditablesActuales: [],
    rolesPermisos: [], // <-- NUEVO: matriz de permisos desde Supabase
    parametros: {
        nombre_empresa: 'BOCANADA CAFÉ / GRUPO PRALUM, C.A.',
        rif_empresa: 'J-50088879-1',
        dias_utilidades: 30,
        valor_ut: 43.00 // <-- NUEVO DEFAULT
    },
    calculoVacacionesActual: null,
    calculoUtilidadesActual: [],
    calculoAntiguedadActual: null,
    calculoPrestacionesActual: null
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
// CACHÉ LOCAL — Carga inicial desde localStorage
// ============================================================

function cargarCacheLocal() {
    const p = localStorage.getItem('nomina_parametros');
    if (p) appState.parametros = JSON.parse(p);

    const u = localStorage.getItem('nomina_usuarios');
    if (u) appState.usuarios = JSON.parse(u);
    else {
        appState.usuarios = [...USUARIOS_DEFAULT];
        localStorage.setItem('nomina_usuarios', JSON.stringify(appState.usuarios));
    }

    const tm = localStorage.getItem('nomina_tasas_mensuales');
    if (tm) {
        try {
            const parsed = JSON.parse(tm);
            if (Array.isArray(parsed) && parsed.length > 0) {
                appState.tasasMensuales = parsed.map(t => {
                    const prom = Number(t.tasa_promedio !== undefined ? t.tasa_promedio : (t.tasa_anual || 0));
                    const men = Number(t.tasa_mensual !== undefined ? t.tasa_mensual : (prom / 12));
                    return { mes: t.mes, tasa_promedio: prom, tasa_anual: prom, tasa_mensual: men, tasa_dolar: Number(t.tasa_dolar || 0) };
                });
            } else {
                appState.tasasMensuales = [];
            }
        } catch (e) {
            appState.tasasMensuales = [];
        }
    } else {
        appState.tasasMensuales = [];
        localStorage.setItem('nomina_tasas_mensuales', JSON.stringify(appState.tasasMensuales));
    }

    const hs = localStorage.getItem('nomina_historico_salarios');
    if (hs) appState.historicoSalarios = JSON.parse(hs);

    const ant = localStorage.getItem('nomina_antiguedad_cache');
    if (ant) appState.antiguedad = JSON.parse(ant);

    const vacCache = localStorage.getItem('nomina_vacaciones_cache');
    if (vacCache) {
        try { appState.vacaciones = JSON.parse(vacCache).map(normalizarRegistroJson); } catch (e) {}
    }

    const anticCache = localStorage.getItem('nomina_anticipos_cache');
    if (anticCache) {
        try { appState.anticipos = JSON.parse(anticCache); } catch (e) {}
    }

    aplicarParametrosEnVista();

    const fc = localStorage.getItem('nomina_features_config');
    if (fc) {
        try { appState.features = JSON.parse(fc); } catch (e) {}
    }

    // Cargar matriz de permisos desde Supabase (no bloqueante)
    cargarRolesPermisos().catch(console.warn);
}

// ============================================================
// ROLES Y PERMISOS — Carga y verificación
// ============================================================

async function cargarRolesPermisos() {
    try {
        const { data, error } = await supabaseClient.from('roles_permisos').select('*');
        if (error) throw error;
        appState.rolesPermisos = data || [];
    } catch (e) {
        console.warn('No se pudo cargar roles_permisos:', e.message);
        appState.rolesPermisos = [];
    }
}

function tienePermiso(modulo, accion) {
    const rol = appState.usuarioActual?.rol;
    if (!rol) return false;
    if (rol === 'master') return true; // Master siempre tiene todo
    const perm = appState.rolesPermisos.find(p => p.rol === rol && p.modulo === modulo);
    if (!perm) return false;
    const map = {
        ver: 'puede_ver',
        crear: 'puede_crear',
        editar: 'puede_editar',
        borrar: 'puede_borrar',
        imprimir: 'puede_imprimir',
        firmar: 'puede_firmar'
    };
    return perm[map[accion]] === true;
}

// ============================================================
// PARÁMETROS DE EMPRESA — Vista + guardado
// ============================================================

function aplicarParametrosEnVista() {
    if (gId('param-empresa-nombre')) gId('param-empresa-nombre').value = appState.parametros.nombre_empresa;
    if (gId('param-empresa-rif')) gId('param-empresa-rif').value = appState.parametros.rif_empresa;
    if (gId('param-dias-utilidades')) gId('param-dias-utilidades').value = appState.parametros.dias_utilidades;
    if (gId('param-valor-ut')) gId('param-valor-ut').value = Number(appState.parametros.valor_ut || 43.00).toFixed(2);
    if (gId('param-riesgo-ivss')) gId('param-riesgo-ivss').value = String(appState.parametros.riesgo_ivss || 9);
    if (gId('param-aplica-lpp')) gId('param-aplica-lpp').checked = appState.parametros.aplica_lpp !== false;

    if (gId('brand-sidebar-title')) gId('brand-sidebar-title').innerText = appState.parametros.nombre_empresa.split('/')[0].trim();
    if (gId('brand-sidebar-rif')) gId('brand-sidebar-rif').innerText = appState.parametros.rif_empresa;
    if (gId('badge-uti-dias-base')) gId('badge-uti-dias-base').innerHTML = `<i class="fa-solid fa-scale-balanced mr-1.5"></i> Base: ${appState.parametros.dias_utilidades} Días`;

    // ⚠️ Estas funciones se cargan en Fase 2 (tasas.js / usuarios.js).
    // Al ejecutarse en DOMContentLoaded, todos los scripts ya están disponibles.
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

    try {
        await supabaseClient.from('parametros_config').upsert([{
            id: 1,
            nombre_empresa: appState.parametros.nombre_empresa,
            rif_empresa: appState.parametros.rif_empresa,
            dias_utilidades: appState.parametros.dias_utilidades,
            valor_ut: appState.parametros.valor_ut,
            riesgo_ivss: appState.parametros.riesgo_ivss,
            aplica_lpp: appState.parametros.aplica_lpp
        }]);
    } catch (e) {}

    localStorage.setItem('nomina_parametros', JSON.stringify(appState.parametros));
    aplicarParametrosEnVista();
    showToast('Parámetros corporativos guardados exitosamente');
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
