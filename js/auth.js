/* ============================================================
   js/auth.js
   Login / logout / sesión / permisos por rol.
   Depende de: config.js (USUARIOS_DEFAULT), utils.js, state.js (appState).
   ============================================================ */

function verificarSesionInicial() {
    const ses = sessionStorage.getItem('nomina_usuario_activo');
    if (ses) {
        try {
            const u = JSON.parse(ses);
            appState.usuarioActual = u;
            iniciarSistemaAutenticado();
            return;
        } catch (e) {}
    }
    gId('login-screen').classList.remove('hidden');
    gId('app-wrapper').classList.add('hidden');
    gId('app-wrapper').classList.remove('flex');
}

function ejecutarLogin(e) {
    e.preventDefault();
    const usr = gId('login-username').value.trim();
    const pass = gId('login-password').value;
    const errDiv = gId('login-error');

    const coincidencia = appState.usuarios.find(
        u => u.usuario.toLowerCase() === usr.toLowerCase() && String(u.clave) === String(pass)
    );

    if (!coincidencia) {
        errDiv.innerText = 'Usuario o contraseña incorrectos.';
        errDiv.classList.remove('hidden');
        return;
    }
    if (!coincidencia.activo) {
        errDiv.innerText = 'El usuario se encuentra inactivo. Contacte al Administrador.';
        errDiv.classList.remove('hidden');
        return;
    }

    errDiv.classList.add('hidden');
    appState.usuarioActual = coincidencia;

    const sesionSegura = {
        id: coincidencia.id,
        nombre: coincidencia.nombre,
        usuario: coincidencia.usuario,
        rol: coincidencia.rol,
        activo: coincidencia.activo
    };
    sessionStorage.setItem('nomina_usuario_activo', JSON.stringify(sesionSegura));

    showToast(`Bienvenido(a), ${coincidencia.nombre}`);
    iniciarSistemaAutenticado();
}

function cerrarSesion() {
    sessionStorage.removeItem('nomina_usuario_activo');
    appState.usuarioActual = null;
    gId('login-username').value = '';
    gId('login-password').value = '';
    gId('login-error').classList.add('hidden');
    gId('app-wrapper').classList.add('hidden');
    gId('app-wrapper').classList.remove('flex');
    gId('login-screen').classList.remove('hidden');
    showToast('Sesión cerrada correctamente');
}

async function iniciarSistemaAutenticado() {
    gId('login-screen').classList.add('hidden');
    gId('app-wrapper').classList.remove('hidden');
    gId('app-wrapper').classList.add('flex');

    // Cargar permisos desde Supabase ANTES de aplicar
    if (typeof cargarRolesPermisos === 'function') {
        try { await cargarRolesPermisos(); }
        catch (e) { console.warn('No se pudo cargar permisos, usando defaults:', e); }
    }

    aplicarPermisosSegunRol();
    if (typeof fetchTasaBCV === 'function') fetchTasaBCV();
    if (typeof fetchAllData === 'function') fetchAllData();
}

function aplicarPermisosSegunRol() {
    const usr = appState.usuarioActual;
    if (!usr) return;

    const isMaster = usr.rol === 'master';
    const isAdmin = usr.rol === 'administrador';

    // --- Badge de usuario ---
    if (gId('user-badge-name')) gId('user-badge-name').innerText = usr.nombre || usr.usuario;
    if (gId('user-badge-role')) {
        if (isMaster) {
            gId('user-badge-role').innerText = 'Master (Superadmin)';
            gId('user-badge-role').className = 'text-[10px] text-emerald-400 font-bold truncate';
        } else if (isAdmin) {
            gId('user-badge-role').innerText = 'Administrador (RRHH)';
            gId('user-badge-role').className = 'text-[10px] text-indigo-400 font-bold truncate';
        } else {
            gId('user-badge-role').innerText = 'Consulta (Auditor)';
            gId('user-badge-role').className = 'text-[10px] text-sky-400 font-semibold truncate';
        }
    }

    // --- Visibilidad de módulos del sidebar según permisos ---
    // Usamos style.display (no la clase 'hidden') para no chocar con Feature Flags
    let primerModuloVisible = null;

    MODULOS_PERMISOS.forEach(m => {
        const btn = gId(`nav-${m.key}`);
        if (!btn) return;
        const puedeVer = tienePermiso(m.key, 'ver');
        if (puedeVer) {
            btn.style.display = '';
            if (!primerModuloVisible) primerModuloVisible = m.key;
        } else {
            btn.style.display = 'none';
        }
    });

    // --- Separadores del sidebar: solo si algún hijo es visible ---
    const SECCIONES_SEP = {
        'sep-personal':     ['departamentos', 'cargos', 'empleados'],
        'sep-salarios':     ['salarios', 'prestamos'],
        'sep-nomina':       ['nomina', 'historico'],
        'sep-vacaciones':   ['vacaciones', 'vacaciones-historico'],
        'sep-utilidades':   ['utilidades', 'utilidades-historico'],
        'sep-antiguedad':   ['antiguedad', 'antiguedad-historico'],
        'sep-liquidaciones':['liquidaciones', 'liquidaciones-historico'],
        'sep-impuestos':    ['impuestos'],
        'sep-usuarios':     ['usuarios', 'parametros']
    };
    Object.entries(SECCIONES_SEP).forEach(([sepId, hijos]) => {
        const sep = gId(sepId);
        if (!sep) return;
        const algunoVisible = hijos.some(m => tienePermiso(m, 'ver'));
        sep.style.display = algunoVisible ? '' : 'none';
    });

    // --- Panel de licencias/flags SOLO para MASTER ---
    const panelFlags = gId('panel-superadmin-features');
    if (panelFlags) panelFlags.style.display = isMaster ? '' : 'none';

    // --- Redirigir al primer módulo visible ---
    if (primerModuloVisible && typeof switchTab === 'function') {
        switchTab(primerModuloVisible);
    } else if (!primerModuloVisible) {
        showToast('Su usuario no tiene acceso a ningún módulo. Contacte al administrador.', 'error');
    }
}
