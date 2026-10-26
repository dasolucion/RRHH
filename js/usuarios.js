/* ============================================================
   js/usuarios.js
   CRUD de usuarios y control de permisos por rol.
   Solo el rol MASTER puede crear/editar/eliminar usuarios.
   ============================================================ */

function renderTablaUsuarios() {
    const tbody = gId('tabla-usuarios-body');
    if (!tbody) return;

    tbody.innerHTML = appState.usuarios.map(u => {
        let rolBadge = '';
        let modulosTxt = '';

        if (u.rol === 'master') {
            rolBadge = `<span class="bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold"><i class="fa-solid fa-shield-halved mr-1"></i>Master (Total + Licencias)</span>`;
            modulosTxt = `<span class="text-emerald-300">Acceso Completo + Control de Licencias</span>`;
        } else if (u.rol === 'administrador') {
            rolBadge = `<span class="bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded text-[10px] font-bold"><i class="fa-solid fa-user-gear mr-1"></i>Administrador (Empresa)</span>`;
            modulosTxt = `<span class="text-slate-300">Gestión Operativa de la Empresa</span>`;
        } else {
            rolBadge = `<span class="bg-sky-950 text-sky-300 border border-sky-800 px-2 py-0.5 rounded text-[10px] font-semibold"><i class="fa-solid fa-eye mr-1"></i>Consulta / Auditor</span>`;
            modulosTxt = `<span class="text-sky-300/80">Solo Históricos y Recibos</span>`;
        }

        return `<tr class="hover:bg-slate-900/50 ${!u.activo ? 'opacity-50' : ''}">
            <td class="p-3.5 text-center"><input type="checkbox" ${u.activo ? 'checked' : ''} ${u.usuario === 'master' ? 'disabled' : ''} onchange="toggleEstadoUsuario(${u.id}, ${u.activo})" class="w-4 h-4 text-indigo-600 rounded bg-slate-950 border-slate-800 cursor-pointer"></td>
            <td class="p-3.5 font-bold text-white">${u.nombre}</td>
            <td class="p-3.5 font-mono text-indigo-300 font-semibold">${u.usuario}</td>
            <td class="p-3.5">${rolBadge}</td>
            <td class="p-3.5 text-[11px]">${modulosTxt}</td>
            <td class="p-3.5 text-right space-x-1">
                <button onclick="editarUsuario(${u.id})" class="text-indigo-400 hover:text-indigo-300 p-1.5" title="Editar"><i class="fa-solid fa-pen"></i></button>
                ${u.usuario !== 'master'
                    ? `<button onclick="eliminarUsuario(${u.id})" class="text-slate-500 hover:text-red-400 p-1.5" title="Eliminar"><i class="fa-solid fa-trash"></i></button>`
                    : '<span class="text-slate-600 px-1 text-xs" title="Protegido"><i class="fa-solid fa-lock"></i></span>'}
            </td>
        </tr>`;
    }).join('');
}

function abrirCrearUsuario() {
    if (appState.usuarioActual?.rol !== 'master') {
        return showToast('Solo el usuario Master puede crear usuarios', 'error');
    }
    gId('usr-id').value = '';
    gId('usr-nombre').value = '';
    gId('usr-login').value = '';
    gId('usr-clave').value = '';
    gId('usr-rol').value = 'consulta';
    gId('usr-activo').checked = true;
    gId('modal-usr-titulo').innerText = 'Nuevo Usuario';
    openModal('modal-usuario');
}

function editarUsuario(id) {
    if (appState.usuarioActual?.rol !== 'master') {
        return showToast('Solo el usuario Master puede editar usuarios', 'error');
    }
    const u = appState.usuarios.find(x => String(x.id) === String(id));
    if (!u) return;
    gId('usr-id').value = u.id;
    gId('usr-nombre').value = u.nombre;
    gId('usr-login').value = u.usuario;
    gId('usr-clave').value = u.clave;
    gId('usr-rol').value = u.rol;
    gId('usr-activo').checked = u.activo;
    gId('modal-usr-titulo').innerText = `Editar Usuario: ${u.usuario}`;
    openModal('modal-usuario');
}

async function guardarUsuario() {
    if (appState.usuarioActual?.rol !== 'master') {
        return showToast('Permiso denegado', 'error');
    }

    const id  = gId('usr-id').value;
    const nom = gId('usr-nombre').value.trim();
    const log = gId('usr-login').value.trim().toLowerCase();
    const cla = gId('usr-clave').value.trim();
    const rol = gId('usr-rol').value;
    const act = gId('usr-activo').checked;

    if (!nom || !log || !cla) return showToast('Complete todos los campos requeridos', 'error');

    const repetido = appState.usuarios.find(
        u => u.usuario.toLowerCase() === log && String(u.id) !== String(id)
    );
    if (repetido) return showToast('Ese nombre de usuario ya está en uso', 'error');

    const usuarioData = { nombre: nom, usuario: log, clave: cla, rol: rol, activo: act };

    if (id) {
        usuarioData.id = parseInt(id);
        const idx = appState.usuarios.findIndex(u => String(u.id) === String(id));
        // Protección del usuario master principal
        if (idx >= 0 && appState.usuarios[idx].usuario === 'master') {
            usuarioData.usuario = 'master';
            usuarioData.rol = 'master';
            usuarioData.activo = true;
        }
        await safeQuery(supabaseClient.from('usuarios').update(usuarioData).eq('id', id), 'update_usuario');
        if (idx >= 0) appState.usuarios[idx] = { ...appState.usuarios[idx], ...usuarioData };
    } else {
        const nuevo = await safeQuery(
            supabaseClient.from('usuarios').insert([usuarioData]).select(),
            'insert_usuario'
        );
        if (nuevo && nuevo[0]) {
            appState.usuarios.push(nuevo[0]);
        } else {
            usuarioData.id = Date.now();
            appState.usuarios.push(usuarioData);
        }
    }

    localStorage.setItem('nomina_usuarios', JSON.stringify(appState.usuarios));
    closeModal('modal-usuario');
    renderTablaUsuarios();
    showToast('Usuario guardado exitosamente en Supabase');
}

async function toggleEstadoUsuario(id, estadoActual) {
    if (appState.usuarioActual?.rol !== 'master') {
        return showToast('Permiso denegado', 'error');
    }
    const u = appState.usuarios.find(x => String(x.id) === String(id));
    if (u && u.usuario === 'master') {
        return showToast('El usuario Master principal no se puede desactivar', 'error');
    }
    if (u) {
        u.activo = !estadoActual;
        await safeQuery(
            supabaseClient.from('usuarios').update({ activo: u.activo }).eq('id', id),
            'toggle_usuario'
        );
        localStorage.setItem('nomina_usuarios', JSON.stringify(appState.usuarios));
        renderTablaUsuarios();
        showToast(`Usuario ${u.activo ? 'activado' : 'desactivado'}`);
    }
}

async function eliminarUsuario(id) {
    if (appState.usuarioActual?.rol !== 'master') {
        return showToast('Permiso denegado', 'error');
    }
    const u = appState.usuarios.find(x => String(x.id) === String(id));
    if (u && u.usuario === 'master') {
        return showToast('No es posible eliminar el usuario Master', 'error');
    }
    if (confirm(`¿Está seguro de eliminar al usuario ${u?.nombre}?`)) {
        await safeQuery(supabaseClient.from('usuarios').delete().eq('id', id), 'delete_usuario');
        appState.usuarios = appState.usuarios.filter(x => String(x.id) !== String(id));
        localStorage.setItem('nomina_usuarios', JSON.stringify(appState.usuarios));
        renderTablaUsuarios();
        showToast('Usuario eliminado de Supabase');
    }
}