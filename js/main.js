/* ============================================================
   js/main.js — VERSIÓN DEFINITIVA
   Último archivo en cargarse. Orquesta la inicialización y la
   navegación (switchTab). Reemplaza por completo al main.js
   preliminar que te entregué en el mensaje de prueba de login.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Setear fechas por defecto en formularios
    if (gId('nom-fecha-proceso')) gId('nom-fecha-proceso').valueAsDate = new Date();
    if (gId('vac-fecha-inicio')) gId('vac-fecha-inicio').valueAsDate = new Date();
    if (gId('uti-fecha-pago')) gId('uti-fecha-pago').valueAsDate = new Date();
    if (gId('ant-fecha-corte')) gId('ant-fecha-corte').valueAsDate = new Date();
    if (gId('pres-fecha-calculo')) gId('pres-fecha-calculo').valueAsDate = new Date();

    const hoy = new Date();
    if (gId('tasa-mes-input')) {
        gId('tasa-mes-input').value = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    }

    // 2. Verificar conexión/esquema ANTES de mostrar el login.
    iniciarAplicacion();
});

function _bootEstado(texto, detalle) {
    const s = gId('boot-status');
    const d = gId('boot-detail');
    if (s) s.innerText = texto || 'Verificando...';
    if (d) d.innerText = detalle || '';
}

async function iniciarAplicacion() {
    _bootEstado('Verificando el sistema', 'Leyendo configuración de este equipo...');

    try {
        // Configura el modo (demo o db) y el cliente, sin mostrar datos de cliente.
        cargarCacheLocal();

        if (appState.modoDatos === 'db') {
            _bootEstado('Conectando a la base de datos', 'Comprobando credenciales y esquema...');
            if (typeof verificarConexionInicial === 'function') {
                await verificarConexionInicial();
            }

            if (appState.esquemaOk) {
                _bootEstado('Cargando usuarios y empresas', 'Leyendo el registro de empresas de la base de datos...');
                if (typeof cargarEmpresasDesdeDb === 'function') {
                    try { await cargarEmpresasDesdeDb(); } catch (e) { console.warn('No se pudieron cargar las empresas:', e); }
                }
                if (typeof renderSelectorEmpresas === 'function') renderSelectorEmpresas();
            }
        } else {
            _bootEstado('Preparando modo demo', 'No hay credenciales: los datos se guardan en este equipo.');
        }

        appState.arranqueVerificado = true;
        _bootEstado(
            appState.estadoConexion === 'conectado' ? 'Conexión verificada' : 'Listo',
            appState.estadoConexion === 'conectado'
                ? 'Base de datos disponible. Ingrese sus credenciales.'
                : (appState.modoDatos === 'demo' ? 'Modo demo activo.' : 'Base de datos no disponible.')
        );
    } catch (e) {
        console.warn('Error durante la verificación inicial:', e);
        _bootEstado('No se pudo verificar', String(e && e.message ? e.message : e));
    } finally {
        // Pequeña pausa para que se lea el estado y luego mostrar login o sesión activa.
        await new Promise(r => setTimeout(r, 350));
        const boot = gId('boot-screen');
        if (boot) boot.classList.add('hidden');
        verificarSesionInicial();
    }
}

async function switchTab(tab) {
    const usr = appState.usuarioActual;
    const isMaster = usr?.rol === 'master';
    const modulosConsultaPermitidos = ['historico', 'vacaciones-historico', 'utilidades-historico', 'antiguedad-historico', 'liquidaciones-historico', 'impuestos'];

    // La matriz de permisos manda. El fallback mantiene el comportamiento
    // histórico si state.js aún no cargó tienePermiso().
    const permitido = (typeof tienePermiso === 'function')
        ? tienePermiso(tab, 'ver')
        : modulosConsultaPermitidos.includes(tab);

    if (!isMaster && !permitido) {
        showToast('No tiene permisos para acceder a esta sección', 'error');
        return;
    }

    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('bg-slate-800', 'text-sky-400', 'border', 'border-slate-700');
        btn.classList.add('text-slate-400');
    });

    const btn = gId(`nav-${tab}`);
    if (btn) {
        btn.classList.add('bg-slate-800', 'text-sky-400', 'border', 'border-slate-700');
        btn.classList.remove('text-slate-400');
    }

    const content = gId(`tab-${tab}-content`);
    if (content) content.classList.remove('hidden');

    if (window.innerWidth < 768) {
        const sb = gId('sidebar');
        if (sb && !sb.classList.contains('-translate-x-full')) {
            toggleMobileMenu();
        }
    }

    if (tab === 'nomina') {
        await cargarBorradorDesdeNube();
        renderTablaNominaEditable();
    } else if (tab === 'asistencia') {
        await renderModuloAsistencia();
    } else if (tab === 'historico') {
        renderHistoricoNominas();
    } else if (tab === 'prestamos') {
        renderTablaPrestamos();
    } else if (tab === 'salarios') {
        alCambiarEmpleadoHistorico();
    } else if (tab === 'usuarios') {
        renderTablaUsuarios();
    } else if (tab === 'parametros') {
        renderTablaTasasMensuales();
    } else if (tab === 'vacaciones-historico') {
        renderHistoricoVacaciones();
    } else if (tab === 'impuestos') {
        if (typeof inicializarTabImpuestos === 'function') inicializarTabImpuestos();
    } else if (tab === 'utilidades-historico') {
        renderHistoricoUtilidades();
    } else if (tab === 'antiguedad-historico') {
        renderHistoricoAntiguedad();
    } else if (tab === 'liquidaciones-historico') {
        renderHistoricoPrestaciones();
    }

    if (tab === 'vacaciones' || tab === 'antiguedad' || tab === 'liquidaciones' || tab === 'salarios') {
        populateSelects();
    }
}