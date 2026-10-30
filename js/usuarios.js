/* ============================================================
   js/usuarios.js
   CRUD de usuarios y matriz de permisos por rol.
   Solo el rol MASTER puede crear/editar/eliminar usuarios y editar la matriz.
   ============================================================ */

function renderTablaUsuarios() {
    const tbody = gId('tabla-usuarios-body');
    if (!tbody) return;

    tbody.innerHTML = appState.usuarios.map(u => {
        let rolBadge = '';
        let modulosTxt = '';

        if (u.rol === 'master') {
            rolBadge = `<span class="bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold"><i class="fa-solid fa-shield-halved mr-1"></i>Master (Total + Licencias)</span>`;
            modulosTxt = `<span class="text-emerald-300">Acceso total (${MODULOS_PERMISOS.length}/${MODULOS_PERMISOS.length} módulos) + Licencias</span>`;
        } else if (u.rol === 'administrador') {
            rolBadge = `<span class="bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded text-[10px] font-bold"><i class="fa-solid fa-user-gear mr-1"></i>Administrador (Empresa)</span>`;
            modulosTxt = `<span class="text-slate-300">${contarModulosVisibles('administrador')}/${MODULOS_PERMISOS.length} módulos visibles</span>`;
        } else {
            rolBadge = `<span class="bg-sky-950 text-sky-300 border border-sky-800 px-2 py-0.5 rounded text-[10px] font-semibold"><i class="fa-solid fa-eye mr-1"></i>Consulta / Auditor</span>`;
            modulosTxt = `<span class="text-sky-300/80">${contarModulosVisibles('consulta')}/${MODULOS_PERMISOS.length} módulos visibles</span>`;
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

// ============================================================
// MATRIZ DE PERMISOS POR ROL
// ============================================================

function abrirMatrizPermisos() {
    if (appState.usuarioActual?.rol !== 'master') {
        return showToast('Solo el usuario Master puede gestionar la matriz de permisos', 'error');
    }
    const sel = gId('matriz-permisos-rol');
    if (sel) sel.value = 'administrador';
    renderMatrizPermisos('administrador');
    openModal('modal-matriz-permisos');
}

function renderMatrizPermisos(rol) {
    const tbody = gId('tabla-matriz-permisos-body');
    if (!tbody) return;

    const isMaster = rol === 'master';

    tbody.innerHTML = MODULOS_PERMISOS.map(m => {
        const dbRow = appState.rolesPermisos.find(p => p.rol === rol && p.modulo === m.key);
        const def = PERMISOS_DEFAULT_POR_ROL[rol]?.[m.key] || {};
        const getVal = (perm) => dbRow ? dbRow[`puede_${perm}`] === true : def[perm] === true;

        const checks = PERMISOS_COLUMNAS.map(p => {
            const checked = isMaster ? true : getVal(p.key);
            return `<td class="p-2 text-center">
                <input type="checkbox"
                    data-matriz-rol="${rol}"
                    data-matriz-modulo="${m.key}"
                    data-matriz-perm="${p.key}"
                    ${checked ? 'checked' : ''}
                    ${isMaster ? 'disabled' : ''}
                    class="w-4 h-4 text-indigo-600 rounded bg-slate-950 border-slate-800 cursor-pointer disabled:opacity-50">
            </td>`;
        }).join('');

        return `<tr class="hover:bg-slate-900/50 ${isMaster ? 'opacity-70' : ''}">
            <td class="p-2.5">
                <div class="flex items-center space-x-2">
                    <i class="fa-solid ${m.icon} text-indigo-400 text-xs w-4 text-center"></i>
                    <span class="font-semibold text-white text-xs">${m.label}</span>
                </div>
            </td>
            ${checks}
        </tr>`;
    }).join('');
}

function renderMatrizPermisosConDefaults(rol) {
    const tbody = gId('tabla-matriz-permisos-body');
    if (!tbody) return;

    tbody.innerHTML = MODULOS_PERMISOS.map(m => {
        const def = PERMISOS_DEFAULT_POR_ROL[rol]?.[m.key] || {};
        const checks = PERMISOS_COLUMNAS.map(p => {
            const checked = def[p.key] === true;
            return `<td class="p-2 text-center">
                <input type="checkbox"
                    data-matriz-rol="${rol}"
                    data-matriz-modulo="${m.key}"
                    data-matriz-perm="${p.key}"
                    ${checked ? 'checked' : ''}
                    class="w-4 h-4 text-indigo-600 rounded bg-slate-950 border-slate-800 cursor-pointer">
            </td>`;
        }).join('');
        return `<tr class="hover:bg-slate-900/50">
            <td class="p-2.5">
                <div class="flex items-center space-x-2">
                    <i class="fa-solid ${m.icon} text-indigo-400 text-xs w-4 text-center"></i>
                    <span class="font-semibold text-white text-xs">${m.label}</span>
                </div>
            </td>
            ${checks}
        </tr>`;
    }).join('');
}

function restaurarPermisosDefault() {
    const rol = gId('matriz-permisos-rol')?.value;
    if (!rol || rol === 'master') return;
    if (!confirm(`¿Restaurar los permisos por defecto del rol "${rol}"?\n\nNo se guardará hasta presionar "Guardar Matriz".`)) return;
    renderMatrizPermisosConDefaults(rol);
    showToast('Defaults cargados en pantalla. Presione "Guardar Matriz" para aplicarlos.');
}

async function guardarMatrizPermisos() {
    const rol = gId('matriz-permisos-rol')?.value;
    if (!rol || rol === 'master') {
        return showToast('El rol Master no puede modificarse (siempre tiene acceso total)', 'error');
    }

    // 1. Construir filas a partir de los checkboxes renderizados en la tabla
    const rows = [];
    MODULOS_PERMISOS.forEach(m => {
        const row = { rol, modulo: m.key };
        PERMISOS_COLUMNAS.forEach(p => {
            const cb = document.querySelector(
                `input[data-matriz-rol="${rol}"][data-matriz-modulo="${m.key}"][data-matriz-perm="${p.key}"]`
            );
            row[`puede_${p.key}`] = cb ? cb.checked === true : false;
        });
        rows.push(row);
    });

    if (rows.length === 0) {
        return showToast('No hay módulos para guardar', 'error');
    }

    // 2. Upsert en Supabase (onConflict por rol+modulo)
    const resultado = await safeQuery(
        supabaseClient.from('roles_permisos').upsert(rows, { onConflict: 'rol,modulo' }).select(),
        'upsert_roles_permisos'
    );

    // 3. Actualizar appState en memoria (aunque Supabase falle, la UI queda coherente)
    if (!Array.isArray(appState.rolesPermisos)) appState.rolesPermisos = [];
    appState.rolesPermisos = appState.rolesPermisos.filter(p => p.rol !== rol);
    rows.forEach(r => appState.rolesPermisos.push({ ...r }));

    // 4. Recargar permisos desde BD si fue posible (para tener IDs/created_at reales)
    if (resultado && Array.isArray(resultado) && resultado.length > 0) {
        try {
            if (typeof cargarRolesPermisos === 'function') {
                await cargarRolesPermisos();
            }
        } catch (e) {
            console.warn('[Permisos] No se pudo recargar desde BD, usando memoria local:', e);
        }
    }

    // 5. Re-aplicar permisos al usuario actual (por si su propio rol cambió)
    if (typeof aplicarPermisosSegunRol === 'function') {
        aplicarPermisosSegunRol();
    }

    // 6. Refrescar tabla de usuarios (columna "Módulos Asignados")
    renderTablaUsuarios();

    if (resultado && Array.isArray(resultado) && resultado.length > 0) {
        showToast(`Matriz de permisos actualizada para "${rol}" en Supabase`);
    } else {
        showToast(`Matriz guardada LOCAL para "${rol}" (Supabase no respondió, revise conexión)`, 'error');
    }
}
