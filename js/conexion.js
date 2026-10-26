/* ============================================================
   js/conexion.js
   Capa de conexión y carga de datos desde Supabase.
   
   NOTA ARQUITECTÓNICA:
   En el monolito original, la creación del cliente Supabase vive en
   config.js (const supabaseClient = supabase.createClient(...)).
   Este archivo alberga fetchAllData(), que es la pieza real de
   sincronización entre Supabase y appState + localStorage.
   
   Los typeof-guards en las llamadas a funciones de módulos que aún
   no existen (mensajes 3 y 4) permiten que el login y CRUD básicos
   funcionen antes de completar la migración.
   ============================================================ */

async function fetchAllData() {
    // --- Departamentos ---
    const deptos = await safeQuery(
        supabaseClient.from('departamentos').select('*').order('nombre'),
        'departamentos'
    );
    if (deptos && deptos.length > 0) {
        appState.departamentos = deptos;
        localStorage.setItem('nomina_departamentos', JSON.stringify(deptos));
    } else {
        const localD = localStorage.getItem('nomina_departamentos');
        if (localD) appState.departamentos = JSON.parse(localD);
    }

    // --- Cargos ---
    const cargos = await safeQuery(
        supabaseClient.from('cargos').select('*').order('nombre'),
        'cargos'
    );
    if (cargos && cargos.length > 0) {
        appState.cargos = cargos;
        localStorage.setItem('nomina_cargos', JSON.stringify(cargos));
    } else {
        const localC = localStorage.getItem('nomina_cargos');
        if (localC) appState.cargos = JSON.parse(localC);
    }

    // --- Empleados (con join a deptos/cargos) ---
    let emps = await safeQuery(
        supabaseClient.from('empleados')
            .select('*, departamentos(nombre), cargos(nombre)')
            .order('id', { ascending: false }),
        'empleados_join'
    );
    if (!emps) {
        emps = await safeQuery(
            supabaseClient.from('empleados').select('*').order('id', { ascending: false }),
            'empleados_simple'
        );
    }
    if (emps && emps.length > 0) {
        appState.empleados = emps.map(e => ({
            ...e,
            departamentos: e.departamentos || appState.departamentos.find(d => String(d.id) === String(e.departamento_id)) || null,
            cargos: e.cargos || appState.cargos.find(c => String(c.id) === String(e.cargo_id)) || null
        }));
        localStorage.setItem('nomina_empleados', JSON.stringify(appState.empleados));
    } else {
        const localE = localStorage.getItem('nomina_empleados');
        if (localE) appState.empleados = JSON.parse(localE);
    }

    // --- Nóminas procesadas ---
    const nominas = await safeQuery(
        supabaseClient.from('nominas').select('*').order('id', { ascending: false }),
        'nominas'
    );
    if (nominas && nominas.length > 0) {
        appState.nominas = nominas;
        localStorage.setItem('nomina_procesadas', JSON.stringify(nominas));
    } else {
        const localN = localStorage.getItem('nomina_procesadas');
        if (localN) appState.nominas = JSON.parse(localN);
    }

    // --- Histórico salarial ---
    const histSal = await safeQuery(
        supabaseClient.from('historico_salarios').select('*').order('mes', { ascending: false }),
        'historico_salarios'
    );
    if (histSal && histSal.length > 0) {
        appState.historicoSalarios = histSal;
        localStorage.setItem('nomina_historico_salarios', JSON.stringify(histSal));
    } else {
        const localHS = localStorage.getItem('nomina_historico_salarios');
        if (localHS) {
            try { appState.historicoSalarios = JSON.parse(localHS); }
            catch (e) { appState.historicoSalarios = []; }
        }
    }

    // --- Vacaciones ---
    const vacs = await safeQuery(
        supabaseClient.from('vacaciones').select('*').order('id', { ascending: false }),
        'vacaciones'
    );
    if (vacs && vacs.length > 0) {
        const localVacs = (() => {
            try { return JSON.parse(localStorage.getItem('nomina_vacaciones_cache') || '[]'); }
            catch (e) { return []; }
        })();
        appState.vacaciones = vacs.map(v => {
            const normalizado = normalizarRegistroJson(v);
            if (!normalizado.detalle_calculo) {
                const localMatch = localVacs.find(lv => String(lv.id) === String(normalizado.id));
                if (localMatch && localMatch.detalle_calculo) {
                    normalizado.detalle_calculo = localMatch.detalle_calculo;
                }
            }
            return normalizado;
        });
        localStorage.setItem('nomina_vacaciones_cache', JSON.stringify(appState.vacaciones));
    } else {
        const localV = localStorage.getItem('nomina_vacaciones_cache');
        if (localV) {
            try { appState.vacaciones = JSON.parse(localV).map(normalizarRegistroJson); }
            catch (e) {}
        }
    }

    // --- Utilidades ---
    const utis = await safeQuery(
        supabaseClient.from('utilidades').select('*').order('id', { ascending: false }),
        'utilidades'
    );
    if (utis && utis.length > 0) {
        appState.utilidades = utis.map(u => {
            const det = typeof u.detalle_calculo === 'string'
                ? JSON.parse(u.detalle_calculo)
                : (u.detalle_calculo || {});
            return { ...det, ...u };
        });
        localStorage.setItem('nomina_utilidades', JSON.stringify(appState.utilidades));
    } else {
        const localU = localStorage.getItem('nomina_utilidades');
        if (localU) appState.utilidades = JSON.parse(localU);
    }

    // --- Prestaciones (liquidaciones) ---
    const prest = await safeQuery(
        supabaseClient.from('prestaciones').select('*').order('id', { ascending: false }),
        'prestaciones'
    );
    if (prest && prest.length > 0) {
        appState.prestaciones = prest;
        localStorage.setItem('nomina_prestaciones', JSON.stringify(prest));
    } else {
        const localP = localStorage.getItem('nomina_prestaciones');
        if (localP) appState.prestaciones = JSON.parse(localP);
    }

    // --- Anticipos de prestaciones ---
    const anticipos = await safeQuery(
        supabaseClient.from('anticipos_prestaciones').select('*').order('fecha', { ascending: false }),
        'anticipos_prestaciones'
    );
    if (anticipos && anticipos.length > 0) {
        appState.anticipos = anticipos;
        localStorage.setItem('nomina_anticipos_cache', JSON.stringify(anticipos));
    } else {
        const localA = localStorage.getItem('nomina_anticipos_cache');
        if (localA) {
            try { appState.anticipos = JSON.parse(localA); }
            catch (e) { appState.anticipos = []; }
        } else {
            appState.anticipos = [];
        }
    }

    // --- Antigüedad procesada ---
    const antProcesadas = await safeQuery(
        supabaseClient.from('antiguedad').select('*').order('id', { ascending: false }),
        'antiguedad'
    );
    if (antProcesadas && antProcesadas.length > 0) {
        appState.antiguedad = antProcesadas.map(normalizarRegistroJson);
        localStorage.setItem('nomina_antiguedad_cache', JSON.stringify(appState.antiguedad));
    } else {
        const localAnt = localStorage.getItem('nomina_antiguedad_cache');
        if (localAnt) {
            try { appState.antiguedad = JSON.parse(localAnt); }
            catch (e) { appState.antiguedad = []; }
        }
    }

    // --- Usuarios ---
    const usrs = await safeQuery(
        supabaseClient.from('usuarios').select('*').order('id'),
        'usuarios'
    );
    if (usrs && usrs.length > 0) {
        appState.usuarios = usrs;
        localStorage.setItem('nomina_usuarios', JSON.stringify(usrs));
    }

    // --- Parámetros corporativos + features_config ---
    const paramConf = await safeQuery(
        supabaseClient.from('parametros_config').select('*').eq('id', 1).maybeSingle(),
        'parametros'
    );
    if (paramConf) {
        appState.parametros = {
            nombre_empresa: paramConf.nombre_empresa || appState.parametros.nombre_empresa,
            rif_empresa: paramConf.rif_empresa || appState.parametros.rif_empresa,
            dias_utilidades: paramConf.dias_utilidades || 30
        };
    }
    if (paramConf && paramConf.features_config) {
        appState.features = paramConf.features_config;
        localStorage.setItem('nomina_features_config', JSON.stringify(paramConf.features_config));
    }
    if (typeof renderPanelFeatureFlags === 'function') renderPanelFeatureFlags();
    if (typeof aplicarFeatureFlagsDOM === 'function') aplicarFeatureFlagsDOM();

    // --- Tasas mensuales BCV ---
    const tasas = await safeQuery(
        supabaseClient.from('tasas_mensuales').select('*').order('mes', { ascending: false }),
        'tasas_mensuales'
    );
    if (tasas && tasas.length > 0) {
        appState.tasasMensuales = tasas.map(t => {
            const an = Number(t.tasa_promedio !== undefined ? t.tasa_promedio : (t.tasa_anual || 47.56));
            const men = Number(t.tasa_mensual !== undefined ? t.tasa_mensual : (an / 12));
            return { mes: t.mes, tasa_promedio: an, tasa_anual: an, tasa_mensual: men, tasa_dolar: Number(t.tasa_dolar || 36.50) };
        });
        localStorage.setItem('nomina_tasas_mensuales', JSON.stringify(appState.tasasMensuales));
    } else {
        const tmLocal = localStorage.getItem('nomina_tasas_mensuales');
        if (tmLocal) {
            try {
                const p = JSON.parse(tmLocal);
                if (Array.isArray(p) && p.length > 0) appState.tasasMensuales = p;
            } catch (e) {}
        }
    }

    // --- Pre-nómina (borrador en nube) ---
    if (typeof cargarBorradorDesdeNube === 'function') await cargarBorradorDesdeNube();

    // --- Refresh de toda la vista ---
    aplicarParametrosEnVista();

    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof renderDepartamentos === 'function') renderDepartamentos();
    if (typeof renderCargos === 'function') renderCargos();
    if (typeof renderEmpleados === 'function') renderEmpleados();
    if (typeof renderTablaPrestamos === 'function') renderTablaPrestamos();
    if (typeof renderTablaNominaEditable === 'function') renderTablaNominaEditable();
    if (typeof renderHistoricoNominas === 'function') renderHistoricoNominas();
    if (typeof renderHistoricoVacaciones === 'function') renderHistoricoVacaciones();
    if (typeof renderHistoricoUtilidades === 'function') renderHistoricoUtilidades();
    if (typeof renderHistoricoAntiguedad === 'function') renderHistoricoAntiguedad();
    if (typeof renderHistoricoPrestaciones === 'function') renderHistoricoPrestaciones();
    if (typeof renderTablaUsuarios === 'function') renderTablaUsuarios();
    if (typeof populateSelects === 'function') populateSelects();
}