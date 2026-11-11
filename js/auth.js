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

function esUsuarioSoloLectura() {
    const usr = appState.usuarioActual;
    if (!usr || usr.rol === 'master' || usr.rol === 'administrador') return false;

    // Compatibilidad con asignaciones de permisos por módulo cuando ya existan
    // en los datos del usuario; un permiso explícito de edición prevalece.
    const permisos = usr.permisos || usr.permissions;
    if (permisos && typeof permisos === 'object') {
        const tab = document.querySelector('.tab-content:not(.hidden)')?.id?.replace('tab-', '').replace('-content', '');
        const permiso = permisos[tab];
        if (permiso === 'editar' || permiso === 'gestionar' || permiso?.editar === true || permiso?.gestionar === true) return false;
    }
    return true;
}

function esAccionPermitidaSoloLectura(control) {
    if (control.matches('[data-readonly-allow]')) return true;
    const accion = (control.getAttribute('onclick') || '').toLowerCase();
    const texto = (control.innerText || control.getAttribute('aria-label') || control.title || '').trim().toLowerCase();

    // Mantener navegación, consulta de información y opciones de impresión.
    return /switchtab|togglemobilemenu|closemodal|cerrar|verdetalle|verrecibo|verpdf|imprimir|^ver[a-z_]/.test(accion) ||
        /^(ver|mostrar|imprimir|print|cerrar|volver|detalle|recibo)/.test(texto);
}

function aplicarModoSoloLectura() {
    if (!esUsuarioSoloLectura()) {
        document.querySelectorAll('[data-solo-lectura-oculto]').forEach(el => {
            el.classList.remove('hidden');
            el.removeAttribute('data-solo-lectura-oculto');
        });
        document.querySelectorAll('[data-solo-lectura-deshabilitado]').forEach(el => {
            el.disabled = false;
            el.removeAttribute('data-solo-lectura-deshabilitado');
        });
        return;
    }

    const zonas = document.querySelectorAll('.tab-content, .fixed.inset-0:not(#login-screen)');
    zonas.forEach(zona => {
        zona.querySelectorAll('button').forEach(btn => {
            if (esAccionPermitidaSoloLectura(btn)) return;
            btn.classList.add('hidden');
            btn.setAttribute('data-solo-lectura-oculto', 'true');
        });

        zona.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach(campo => {
            if (campo.readOnly || campo.disabled) return;
            const tipo = (campo.type || '').toLowerCase();
            const esFiltro = ['date', 'month', 'search'].includes(tipo) && !campo.closest('tr');
            const onchange = (campo.getAttribute('onchange') || '').toLowerCase();
            const selectSoloFiltro = campo.tagName === 'SELECT' && /render.*(historico|impuesto|reporte|tabla)|filtrar|buscar/.test(onchange);
            if (esFiltro || selectSoloFiltro) return;
            campo.disabled = true;
            campo.setAttribute('data-solo-lectura-deshabilitado', 'true');
        });
    });
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
            gId('user-badge-role').innerText = 'Consulta (Solo lectura)';
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

    // El panel de licencias/flags SOLO es visible para MASTER.
    const panelFlags = gId('panel-superadmin-features');
    if (panelFlags) {
        if (isMaster) panelFlags.classList.remove('hidden');
        else panelFlags.classList.add('hidden');
    }

    aplicarModoSoloLectura();
}

function imprimirListaEmpleados() {
    const container = gId('print-container');
    if (!container) return;
    const empleados = Array.isArray(appState.empleados) ? appState.empleados : [];
    const filas = empleados.map(e => `
        <tr>
            <td>${escaparTextoImpresion(e.cedula)}</td>
            <td>${escaparTextoImpresion(e.nombre)}</td>
            <td>${escaparTextoImpresion(e.departamentos?.nombre || '-')}</td>
            <td>${escaparTextoImpresion(e.cargos?.nombre || '-')}</td>
            <td>${escaparTextoImpresion(e.telefono || '-')}</td>
            <td>${escaparTextoImpresion(e.fecha_ingreso || '-')}</td>
            <td>${e.activo ? 'Activo' : 'Inactivo'}</td>
        </tr>`).join('');

    container.innerHTML = `
        <div style="font-family:Arial,sans-serif;color:#111;padding:12px">
            <h1 style="font-size:20px;margin:0 0 4px">Directorio de Personal</h1>
            <p style="font-size:11px;margin:0 0 12px">${escaparTextoImpresion(appState.parametros?.nombre_empresa || '')} · Fecha de impresión: ${new Date().toLocaleDateString('es-VE')}</p>
            <table style="width:100%;border-collapse:collapse;font-size:10px">
                <thead><tr>${['Cédula', 'Nombre', 'Departamento', 'Cargo', 'Teléfono', 'Fecha de ingreso', 'Estado'].map(t => `<th style="border:1px solid #777;background:#eee;padding:6px;text-align:left">${t}</th>`).join('')}</tr></thead>
                <tbody>${filas || '<tr><td colspan="7" style="padding:8px;text-align:center">No hay empleados registrados.</td></tr>'}</tbody>
            </table>
        </div>`;
    window.print();
}

function escaparTextoImpresion(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, caracter => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[caracter]));
}

function asegurarBotonImprimirEmpleados() {
    const titulo = document.querySelector('#tab-empleados-content h3');
    if (!titulo || gId('btn-imprimir-empleados')) return;
    const encabezado = titulo.parentElement;
    if (!encabezado) return;
    const boton = document.createElement('button');
    boton.id = 'btn-imprimir-empleados';
    boton.type = 'button';
    boton.className = 'bg-slate-700 hover:bg-slate-600 text-white text-xs px-3.5 py-2 rounded-lg font-semibold inline-flex items-center gap-2 transition';
    boton.setAttribute('onclick', 'imprimirListaEmpleados()');
    boton.innerHTML = '<i class="fa-solid fa-print"></i><span>Imprimir</span>';
    encabezado.appendChild(boton);
}

document.addEventListener('DOMContentLoaded', () => {
    asegurarBotonImprimirEmpleados();
    const observer = new MutationObserver(() => {
        asegurarBotonImprimirEmpleados();
        aplicarModoSoloLectura();
    });
    observer.observe(document.body, { childList: true, subtree: true });
});
