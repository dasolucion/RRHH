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

// Detecta si la BD usa el esquema multiempresa y carga el registro de empresas ANTES de
// consultar cualquier tabla de negocio, para que el filtro por empresa_id ya esté activo.
async function prepararMultiempresaParaCarga() {
    if (esModoDemo() || !appState.esquemaOk) {
        appState.multiempresaActivo = false;
        return;
    }
    const cred = (typeof _obtenerCredencialesDb === 'function')
        ? _obtenerCredencialesDb()
        : { url: SUPABASE_URL, key: SUPABASE_ANON_KEY };
    try {
        const resp = await fetch(`${cred.url}/rest/v1/empresas?select=id,nombre,rif,activo&limit=1`, {
            headers: { apikey: cred.key, Authorization: `Bearer ${cred.key}` }
        });
        // 200/206 = tabla empresas disponible (aunque esté vacía); 404 = despliegue de una sola empresa.
        appState.multiempresaActivo = resp.status === 200 || resp.status === 206;
    } catch (e) {
        appState.multiempresaActivo = false;
    }
    if (appState.multiempresaActivo && typeof cargarEmpresasDesdeDb === 'function') {
        await cargarEmpresasDesdeDb();
    }
}

async function fetchAllData() {
    await prepararMultiempresaParaCarga();

    // En multiempresa no se cargan datos si la empresa activa no existe en Supabase.
    // Así se evita mostrar datos de Recordplast bajo una empresa local "fantasma".
    if (appState.multiempresaActivo) {
        const rifActivo = String((appState.parametros && appState.parametros.rif_empresa) || '').toUpperCase();
        const activaValida = (appState.empresas || []).some(e => e && e.id && String(e.rif).toUpperCase() === rifActivo);
        if (!activaValida) {
            limpiarEstadoNegocio();
            if (typeof showToast === 'function') showToast('Seleccione una empresa registrada en la base de datos.', 'error');
            return;
        }
    }

    // --- Departamentos ---
    const deptos = await safeQuery(
        supabaseClient.from('departamentos').select('*').order('nombre'),
        'departamentos'
    );
    if (deptos && deptos.length > 0) {
        appState.departamentos = deptos;
        lsSet('nomina_departamentos', JSON.stringify(deptos));
    } else {
        const localD = lsGet('nomina_departamentos');
        if (localD) appState.departamentos = JSON.parse(localD);
    }

    // --- Cargos ---
    const cargos = await safeQuery(
        supabaseClient.from('cargos').select('*').order('nombre'),
        'cargos'
    );
    if (cargos && cargos.length > 0) {
        appState.cargos = cargos;
        lsSet('nomina_cargos', JSON.stringify(cargos));
    } else {
        const localC = lsGet('nomina_cargos');
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
        lsSet('nomina_empleados', JSON.stringify(appState.empleados));
    } else {
        const localE = lsGet('nomina_empleados');
        if (localE) appState.empleados = JSON.parse(localE);
    }

    // --- Nóminas procesadas ---
    const nominas = await safeQuery(
        supabaseClient.from('nominas').select('*').order('id', { ascending: false }),
        'nominas'
    );
    if (nominas && nominas.length > 0) {
        appState.nominas = nominas;
        lsSet('nomina_procesadas', JSON.stringify(nominas));
    } else {
        const localN = lsGet('nomina_procesadas');
        if (localN) appState.nominas = JSON.parse(localN);
    }

    // --- Histórico salarial ---
    const histSal = await safeQuery(
        supabaseClient.from('historico_salarios').select('*').order('mes', { ascending: false }),
        'historico_salarios'
    );
    if (histSal && histSal.length > 0) {
        appState.historicoSalarios = histSal;
        lsSet('nomina_historico_salarios', JSON.stringify(histSal));
    } else {
        const localHS = lsGet('nomina_historico_salarios');
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
            try { return JSON.parse(lsGet('nomina_vacaciones_cache') || '[]'); }
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
        lsSet('nomina_vacaciones_cache', JSON.stringify(appState.vacaciones));
    } else {
        const localV = lsGet('nomina_vacaciones_cache');
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
        lsSet('nomina_utilidades', JSON.stringify(appState.utilidades));
    } else {
        const localU = lsGet('nomina_utilidades');
        if (localU) appState.utilidades = JSON.parse(localU);
    }

    // --- Prestaciones (liquidaciones) ---
    const prest = await safeQuery(
        supabaseClient.from('prestaciones').select('*').order('id', { ascending: false }),
        'prestaciones'
    );
    if (prest && prest.length > 0) {
        appState.prestaciones = prest;
        lsSet('nomina_prestaciones', JSON.stringify(prest));
    } else {
        const localP = lsGet('nomina_prestaciones');
        if (localP) appState.prestaciones = JSON.parse(localP);
    }

    // --- Anticipos de prestaciones ---
    const anticipos = await safeQuery(
        supabaseClient.from('anticipos_prestaciones').select('*').order('fecha', { ascending: false }),
        'anticipos_prestaciones'
    );
    if (anticipos && anticipos.length > 0) {
        appState.anticipos = anticipos;
        lsSet('nomina_anticipos_cache', JSON.stringify(anticipos));
    } else {
        const localA = lsGet('nomina_anticipos_cache');
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
        lsSet('nomina_antiguedad_cache', JSON.stringify(appState.antiguedad));
    } else {
        const localAnt = lsGet('nomina_antiguedad_cache');
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
        lsSet('nomina_usuarios', JSON.stringify(usrs));
    }

    // --- Parámetros corporativos + features_config ---
    // En multiempresa cada empresa tiene su propia fila; en despliegues de una sola empresa se usa id=1.
    const empresaIdActiva = (typeof obtenerEmpresaIdActiva === 'function') ? obtenerEmpresaIdActiva() : null;
    const rifActivo = String((appState.parametros && appState.parametros.rif_empresa) || '').toUpperCase();
    let queryParams = supabaseClient.from('parametros_config').select('*');
    if (appState.multiempresaActivo && empresaIdActiva) {
        queryParams = queryParams.eq('empresa_id', empresaIdActiva);
    } else if (appState.multiempresaActivo && rifActivo && rifActivo !== 'J-00000000-0') {
        // Empresa guardada sólo en este equipo: buscar su config por RIF. NUNCA caer a id=1,
        // porque eso hacía que al seleccionarla el sistema regresara a Recordplast.
        queryParams = queryParams.eq('rif_empresa', rifActivo);
    } else {
        queryParams = queryParams.eq('id', 1);
    }
    const paramConf = await safeQuery(queryParams.maybeSingle(), 'parametros');
    if (paramConf) {
        appState.parametros = {
            ...appState.parametros,
            nombre_empresa: paramConf.nombre_empresa || appState.parametros.nombre_empresa,
            rif_empresa: paramConf.rif_empresa || appState.parametros.rif_empresa,
            dias_utilidades: paramConf.dias_utilidades || 30,
            valor_ut: paramConf.valor_ut != null ? Number(paramConf.valor_ut) : (appState.parametros.valor_ut || 43.00),
            riesgo_ivss: paramConf.riesgo_ivss != null ? Number(paramConf.riesgo_ivss) : (appState.parametros.riesgo_ivss || 9),
            aplica_lpp: paramConf.aplica_lpp !== false,
            supabase_url: paramConf.supabase_url || appState.parametros.supabase_url || '',
            supabase_anon_key: paramConf.supabase_anon_key || appState.parametros.supabase_anon_key || '',
            licencia_estado: paramConf.licencia_estado || appState.parametros.licencia_estado || null,
            licencia_bloqueada: paramConf.licencia_bloqueada === true || paramConf.licencia_bloqueada === 'true',
            licencia_vencimiento: paramConf.licencia_vencimiento || appState.parametros.licencia_vencimiento || null,
            licencia_mensaje: paramConf.licencia_mensaje || appState.parametros.licencia_mensaje || null
        };
        try {
            lsSet('nomina_parametros', JSON.stringify(appState.parametros));
        } catch (e) {}
        // Registrar la empresa en el selector multiempresa (solo en DB mode)
        if (!esModoDemo() && typeof guardarEmpresaActivaEnRegistro === 'function') guardarEmpresaActivaEnRegistro();
        if (appState.multiempresaActivo && paramConf.rif_empresa) {
            const rifDb = String(paramConf.rif_empresa).toUpperCase();
            const activa = (appState.empresas || []).find(e => String(e.rif || '').toUpperCase() === rifDb);
            if (activa) {
                appState.empresaActiva = activa.rif;
                appState.empresaActivaId = activa.id || appState.empresaActivaId;
                appState.empresaRecienCreada = false;
                lsRemove('nomina_empresa_recien_creada');
                lsSet('nomina_empresa_activa', activa.rif);
            }
        }
        if (!esModoDemo() && typeof establecerEstadoConexion === 'function') {
            const hayAdvertencias = !appState.esquemaOk && Array.isArray(appState.esquemaFaltantes) && appState.esquemaFaltantes.length > 0;
            if (!hayAdvertencias) {
                establecerEstadoConexion('conectado',
                    appState.parametros.supabase_url ? 'Conectado a Supabase' : 'Conectado (base por defecto)');
            }
        }
    }
    if (paramConf && paramConf.features_config) {
        appState.features = paramConf.features_config;
        lsSet('nomina_features_config', JSON.stringify(paramConf.features_config));
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
        lsSet('nomina_tasas_mensuales', JSON.stringify(appState.tasasMensuales));
    } else {
        const tmLocal = lsGet('nomina_tasas_mensuales');
        if (tmLocal) {
            try {
                const p = JSON.parse(tmLocal);
                if (Array.isArray(p) && p.length > 0) appState.tasasMensuales = p;
            } catch (e) {}
        }
    }

    // --- Pre-nómina (borrador en nube) ---
    if (typeof cargarBorradorDesdeNube === 'function') await cargarBorradorDesdeNube();

    // --- Préstamos y abonos (Bloque 2C) ---
    const prestamosDb = await safeQuery(
        supabaseClient.from('prestamos_anticipos').select('*').order('fecha_otorgamiento', { ascending: false }),
        'prestamos_anticipos'
    );
    if (Array.isArray(prestamosDb)) {
        appState.prestamos = prestamosDb;
        lsSet('nomina_prestamos_cache', JSON.stringify(prestamosDb));
    } else {
        const localP = lsGet('nomina_prestamos_cache');
        if (localP) {
            try {
                const p = JSON.parse(localP);
                if (Array.isArray(p)) appState.prestamos = p;
            } catch (e) {}
        }
    }

    const abonosDb = await safeQuery(
        supabaseClient.from('prestamos_abonos').select('*').order('fecha_pago', { ascending: false }),
        'prestamos_abonos'
    );
    if (Array.isArray(abonosDb)) {
        appState.prestamosAbonos = abonosDb;
        lsSet('nomina_prestamos_abonos_cache', JSON.stringify(abonosDb));
    } else {
        const localA = lsGet('nomina_prestamos_abonos_cache');
        if (localA) {
            try {
                const a = JSON.parse(localA);
                if (Array.isArray(a)) appState.prestamosAbonos = a;
            } catch (e) {}
        }
    }

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
    if (typeof verificarLicenciaBloqueo === 'function') verificarLicenciaBloqueo();
}