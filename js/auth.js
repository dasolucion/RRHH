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

async function ejecutarLogin(e) {
    if (e && e.preventDefault) e.preventDefault();
    const usr = gId('login-username').value.trim();
    const pass = gId('login-password').value;
    const errDiv = gId('login-error');

    let coincidencia = appState.usuarios.find(
        u => u.usuario.toLowerCase() === usr.toLowerCase() && String(u.clave) === String(pass)
    );

    // En ventanas sin caché local, consultar Supabase antes de rechazar el acceso.
    if (!coincidencia) {
        const usrs = await safeQuery(
            supabaseClient.from('usuarios').select('*').order('id'),
            'login-usuarios'
        );
        if (usrs && usrs.length > 0) {
            appState.usuarios = usrs;
            try { localStorage.setItem('nomina_usuarios', JSON.stringify(usrs)); } catch (err) {}
            coincidencia = appState.usuarios.find(
                u => u.usuario.toLowerCase() === usr.toLowerCase() && String(u.clave) === String(pass)
            );
        }
    }

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

    if (typeof cargarRolesPermisos === 'function') {
        try { await cargarRolesPermisos(); }
        catch (e) { console.warn('No se pudo cargar permisos, usando defaults:', e); }
    }

    aplicarPermisosSegunRol();
    if (typeof fetchTasaBCV === 'function') fetchTasaBCV();
    if (typeof fetchAllData === 'function') fetchAllData();
}

/*
 * Herencia CRUD: borrar incluye ver/crear/editar; editar incluye ver/crear;
 * crear incluye ver. Imprimir y firmar se consultan de manera independiente.
 */
function permisoEfectivo(rol, modulo, perm) {
    if (rol === 'master') return true;

    const row = (appState.rolesPermisos || []).find(p => p.rol === rol && p.modulo === modulo);
    const defaults = (typeof PERMISOS_DEFAULT_POR_ROL !== 'undefined')
        ? (PERMISOS_DEFAULT_POR_ROL[rol]?.[modulo] || {})
        : {};
    const raw = key => row
        ? row[`puede_${key}`] === true || row[`puede_${key}`] === 'true' || row[`puede_${key}`] === 1
        : defaults[key] === true;

    const ver = raw('ver') || raw('crear') || raw('editar') || raw('borrar');
    const crear = raw('crear') || raw('editar') || raw('borrar');
    const editar = raw('editar') || raw('borrar');
    if (perm === 'ver') return ver;
    if (perm === 'crear') return crear;
    if (perm === 'editar') return editar;
    if (perm === 'borrar') return raw('borrar');
    if (perm === 'imprimir') return raw('imprimir');
    if (perm === 'firmar') return raw('firmar');
    return false;
}

function tienePermiso(modulo, accion) {
    const rol = appState.usuarioActual?.rol;
    if (!rol) return false;
    return permisoEfectivo(rol, modulo, accion);
}

function aplicarPermisosSegunRol() {
    const usr = appState.usuarioActual;
    if (!usr) return;

    const isMaster = usr.rol === 'master';
    const isAdmin = usr.rol === 'administrador';
    if (gId('user-badge-name')) gId('user-badge-name').innerText = usr.nombre || usr.usuario;
    if (gId('user-badge-role')) {
        gId('user-badge-role').innerText = isMaster ? 'Master (Superadmin)' :
            (isAdmin ? 'Administrador (RRHH)' : `Rol: ${usr.rol || 'Consulta'}`);
        gId('user-badge-role').className = isMaster
            ? 'text-[10px] text-emerald-400 font-bold truncate'
            : (isAdmin ? 'text-[10px] text-indigo-400 font-bold truncate' : 'text-[10px] text-sky-400 font-semibold truncate');
    }

    let primerModuloVisible = null;
    MODULOS_PERMISOS.forEach(m => {
        const btn = gId(`nav-${m.key}`);
        if (!btn) return;
        if (tienePermiso(m.key, 'ver')) {
            btn.style.display = '';
            if (!primerModuloVisible) primerModuloVisible = m.key;
        } else {
            btn.style.display = 'none';
        }
    });

    const seccionesSep = {
        'sep-personal': ['departamentos', 'cargos', 'empleados'],
        'sep-salarios': ['salarios', 'prestamos'],
        'sep-nomina': ['nomina', 'historico'],
        'sep-vacaciones': ['vacaciones', 'vacaciones-historico'],
        'sep-utilidades': ['utilidades', 'utilidades-historico'],
        'sep-antiguedad': ['antiguedad', 'antiguedad-historico'],
        'sep-liquidaciones': ['liquidaciones', 'liquidaciones-historico'],
        'sep-impuestos': ['impuestos'],
        'sep-usuarios': ['usuarios', 'parametros']
    };
    Object.entries(seccionesSep).forEach(([id, modulos]) => {
        const el = gId(id);
        if (el) el.style.display = modulos.some(m => tienePermiso(m, 'ver')) ? '' : 'none';
    });

    const panelFlags = gId('panel-superadmin-features');
    if (panelFlags) panelFlags.style.display = isMaster ? '' : 'none';

    if (typeof aplicarPermisosUI === 'function') aplicarPermisosUI();
    if (primerModuloVisible && typeof switchTab === 'function') switchTab(primerModuloVisible);
    else if (!primerModuloVisible) showToast('Su usuario no tiene acceso a ningún módulo. Contacte al administrador.', 'error');
}

function moduloDePermisoPara(control) {
    const tab = control.closest('.tab-content');
    if (tab?.id?.startsWith('tab-')) return tab.id.slice(4, -8);

    const modal = control.closest('[id^="modal-"]');
    if (modal) {
        const id = modal.id.toLowerCase();
        if (/empleado|depto|departamento|cargo|ari|constancia|expediente/.test(id)) return 'empleados';
        if (/prestamo|anticipo|abono/.test(id)) return 'prestamos';
        if (/vacacion/.test(id)) return 'vacaciones';
        if (/utilidad/.test(id)) return 'utilidades';
        if (/antiguedad|conciliacion/.test(id)) return 'antiguedad';
        if (/liquidacion|prestacion/.test(id)) return 'liquidaciones';
        if (/firma/.test(id)) return window.__moduloPermisoActual || 'nomina';
        if (/usuario|matriz/.test(id)) return 'usuarios';
        if (/nomina|recibo/.test(id)) return 'nomina';
    }

    const visible = document.querySelector('.tab-content:not(.hidden)');
    return visible?.id?.startsWith('tab-') ? visible.id.slice(4, -8) : window.__moduloPermisoActual;
}

function accionDePermisoPara(control) {
    const onclick = `${control.getAttribute('onclick') || ''} ${control.getAttribute('onchange') || ''} ${control.getAttribute('oninput') || ''}`.toLowerCase();
    const text = `${control.innerText || ''} ${control.title || ''} ${control.getAttribute('aria-label') || ''}`.toLowerCase();
    const target = `${onclick} ${text}`;

    if (/imprimir|\bprint\b|descargar.?pdf/.test(target)) return 'imprimir';
    if (/firmar|firma|enlace.*firma|abrirfirma/.test(target)) return 'firmar';
    if (/eliminar|borrar|\bdelete\b|anularenlace/.test(target)) return 'borrar';
    if (/editar|actualizar|guardar.?edicion/.test(target)) return 'editar';
    if (/crear|nuevo|agregar|insertar|guardar|procesar|calcular|generar|aplicar|importar|registrar|abonar|sincronizar|migrar|toggleestado|cambiar/.test(target)) {
        // Guardar un formulario existente cuenta como edición; un formulario nuevo como creación.
        const modal = control.closest('[id^="modal-"]');
        if (/guardar/.test(target) && modal) {
            const idInput = modal.querySelector('input[type="hidden"][id$="-id"]');
            return idInput?.value ? 'editar' : 'crear';
        }
        return /editar|actualizar/.test(target) ? 'editar' : 'crear';
    }
    if (/ver|detalle|recibo|consulta|cerrar|closemodal|switchtab|togglemobilemenu/.test(target)) return 'ver';
    // Botones operativos no identificados se cierran por defecto en solo lectura.
    return 'crear';
}

function esControlDeFiltro(control) {
    if (control.closest('#modal-matriz-permisos, #modal-usuario')) return false;
    if (control.matches('input[readonly], input[type="hidden"]')) return true;
    const handler = `${control.getAttribute('onchange') || ''} ${control.getAttribute('oninput') || ''}`.toLowerCase();
    if (control.matches('input[type="month"], input[type="date"]') && /render|filtrar|buscar|asistencia|impuesto|historico/.test(handler)) return true;
    return control.tagName === 'SELECT' && /render|filtrar|buscar|asistencia|historico|impuesto/.test(handler);
}

function aplicarPermisosUI(raiz = document) {
    if (!appState.usuarioActual) return;
    const controles = raiz.querySelectorAll('button, input:not([type="hidden"]), select, textarea, label[for^="input-"]');

    controles.forEach(control => {
        if (control.closest('#modal-matriz-permisos, #modal-usuario, #login-screen, #sidebar')) return;
        const modulo = moduloDePermisoPara(control);
        if (!modulo || !MODULOS_PERMISOS.some(m => m.key === modulo)) return;

        const accion = accionDePermisoPara(control);
        const permitido = tienePermiso(modulo, accion);
        const esInput = control.matches('input, select, textarea');
        if (esInput && esControlDeFiltro(control)) return;

        if (!permitido) {
            if (esInput) {
                control.disabled = true;
                control.setAttribute('data-permiso-deshabilitado', 'true');
            } else {
                control.style.display = 'none';
                control.setAttribute('data-permiso-oculto', 'true');
            }
        } else if (control.hasAttribute('data-permiso-deshabilitado')) {
            control.disabled = false;
            control.removeAttribute('data-permiso-deshabilitado');
        } else if (control.hasAttribute('data-permiso-oculto')) {
            control.style.display = '';
            control.removeAttribute('data-permiso-oculto');
        }
    });
}

function aplicarJerarquiaMatrizPermisos(input) {
    const rol = input.dataset.matrizRol;
    const modulo = input.dataset.matrizModulo;
    const permiso = input.dataset.matrizPerm;
    if (!rol || !modulo || !permiso || rol === 'master') return;

    const buscar = key => document.querySelector(
        `input[data-matriz-rol="${rol}"][data-matriz-modulo="${modulo}"][data-matriz-perm="${key}"]`
    );
    const marcar = (key, valor) => { const cb = buscar(key); if (cb) cb.checked = valor; };

    if (input.checked) {
        if (permiso === 'crear') marcar('ver', true);
        if (permiso === 'editar') { marcar('ver', true); marcar('crear', true); }
        if (permiso === 'borrar') { marcar('ver', true); marcar('crear', true); marcar('editar', true); }
    } else {
        if (permiso === 'ver') { marcar('crear', false); marcar('editar', false); marcar('borrar', false); }
        if (permiso === 'crear') { marcar('editar', false); marcar('borrar', false); }
        if (permiso === 'editar') marcar('borrar', false);
    }
}

document.addEventListener('change', event => {
    if (event.target.matches('input[data-matriz-perm]')) aplicarJerarquiaMatrizPermisos(event.target);
    aplicarPermisosUI();
}, true);

document.addEventListener('click', event => {
    const control = event.target.closest('button, a, label');
    if (!control || control.closest('#modal-matriz-permisos, #modal-usuario, #login-screen, #sidebar')) return;

    const navCall = control.getAttribute('onclick') || '';
    const navMatch = navCall.match(/switchTab\(['"]([^'"]+)['"]\)/);
    if (navMatch) window.__moduloPermisoActual = navMatch[1];

    const modulo = moduloDePermisoPara(control);
    if (!modulo || !MODULOS_PERMISOS.some(m => m.key === modulo)) return;
    const accion = accionDePermisoPara(control);
    if (!tienePermiso(modulo, accion)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showToast(`No tiene permiso para ${accion} en esta sección`, 'error');
    }
}, true);

// Controla también acciones y controles creados dinámicamente dentro de tablas/modales.
const observadorPermisos = new MutationObserver(mutations => {
    for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) aplicarPermisosUI(node);
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    observadorPermisos.observe(document.body, { childList: true, subtree: true });
    aplicarPermisosUI();
});
