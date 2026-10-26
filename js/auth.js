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

function iniciarSistemaAutenticado() {
    gId('login-screen').classList.add('hidden');
    gId('app-wrapper').classList.remove('hidden');
    gId('app-wrapper').classList.add('flex');
    aplicarPermisosSegunRol();
    if (typeof fetchTasaBCV === 'function') fetchTasaBCV();
    if (typeof fetchAllData === 'function') fetchAllData();
}

function aplicarPermisosSegunRol() {
    const usr = appState.usuarioActual;
    if (!usr) return;

    const isMaster = usr.rol === 'master';
    const isAdmin = usr.rol === 'administrador';
    const tienePoderOperativo = isMaster || isAdmin;

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

    const modulosOperativos = [
        'dashboard', 'departamentos', 'cargos', 'empleados', 'salarios',
        'prestamos', 'nomina', 'vacaciones', 'utilidades', 'antiguedad',
        'liquidaciones', 'impuestos', 'usuarios', 'parametros'
    ];
    const modulosConsulta = [
        'historico', 'vacaciones-historico', 'utilidades-historico',
        'antiguedad-historico', 'liquidaciones-historico', 'impuestos'
    ];
    const separadores = [
        'sep-personal', 'sep-salarios', 'sep-nomina', 'sep-vacaciones',
        'sep-utilidades', 'sep-antiguedad', 'sep-liquidaciones',
        'sep-impuestos', 'sep-usuarios'
    ];

    if (tienePoderOperativo) {
        modulosOperativos.forEach(m => { const btn = gId(`nav-${m}`); if (btn) btn.classList.remove('hidden'); });
        modulosConsulta.forEach(m => { const btn = gId(`nav-${m}`); if (btn) btn.classList.remove('hidden'); });
        separadores.forEach(s => { const el = gId(s); if (el) el.classList.remove('hidden'); });
        if (typeof switchTab === 'function') switchTab('dashboard');
    } else {
        modulosOperativos.forEach(m => { const btn = gId(`nav-${m}`); if (btn) btn.classList.add('hidden'); });
        modulosConsulta.forEach(m => { const btn = gId(`nav-${m}`); if (btn) btn.classList.remove('hidden'); });
        separadores.forEach(s => { const el = gId(s); if (el) el.classList.add('hidden'); });
        if (typeof switchTab === 'function') switchTab('historico');
    }

    // El panel de licencias/flags SOLO es visible para MASTER
    const panelFlags = gId('panel-superadmin-features');
    if (panelFlags) {
        if (isMaster) panelFlags.classList.remove('hidden');
        else panelFlags.classList.add('hidden');
    }
}