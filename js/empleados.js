/* ============================================================
   js/empleados.js
   CRUD completo: Empleados, Departamentos y Cargos.
   Incluye renderizado de las 3 tablas y los modales asociados.
   ============================================================ */

/* ---------- RENDER DE TABLAS ---------- */

function renderDepartamentos() {
    const tbody = gId('tabla-deptos-body');
    if (!tbody) return;
    tbody.innerHTML = appState.departamentos.map(d => `
        <tr class="hover:bg-slate-900/50">
            <td class="p-3.5 font-mono text-slate-400 text-xs">#${d.id}</td>
            <td class="p-3.5 font-semibold text-white">${d.nombre}</td>
            <td class="p-3.5 text-right space-x-1">
                <button onclick="editarDepartamento(${d.id})" class="text-amber-400 p-1 hover:text-amber-300"><i class="fa-solid fa-pen"></i></button>
                <button onclick="eliminarDepartamento(${d.id})" class="text-slate-500 hover:text-red-400 p-1"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function renderCargos() {
    const tbody = gId('tabla-cargos-body');
    if (!tbody) return;
    tbody.innerHTML = appState.cargos.map(c => `
        <tr class="hover:bg-slate-900/50">
            <td class="p-3.5 font-mono text-slate-400 text-xs">#${c.id}</td>
            <td class="p-3.5 font-semibold text-white">${c.nombre}</td>
            <td class="p-3.5 text-right space-x-1">
                <button onclick="editarCargo(${c.id})" class="text-purple-400 p-1 hover:text-purple-300"><i class="fa-solid fa-pen"></i></button>
                <button onclick="eliminarCargo(${c.id})" class="text-slate-500 hover:text-red-400 p-1"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function renderEmpleados() {
    const tbody = gId('tabla-empleados-body');
    if (!tbody) return;
    tbody.innerHTML = appState.empleados.map(e => `
        <tr class="hover:bg-slate-900/50 ${!e.activo ? 'opacity-50' : ''}">
            <td class="p-3.5 text-center">
                <input type="checkbox" ${e.activo ? 'checked' : ''} onchange="toggleEstadoEmpleado(${e.id}, ${e.activo})" class="w-4 h-4 text-sky-500 rounded bg-slate-950 border-slate-800 cursor-pointer">
            </td>
            <td class="p-3.5 font-mono text-slate-400 text-[11px]">${e.fecha_ingreso || ''}</td>
            <td class="p-3.5 font-semibold text-slate-200">${e.cedula}</td>
            <td class="p-3.5 font-bold text-white">${e.nombre}</td>
            <td class="p-3.5 text-slate-400">${e.telefono || '-'}</td>
            <td class="p-3.5 text-amber-400">${e.departamentos?.nombre || '-'}</td>
            <td class="p-3.5 text-purple-400">${e.cargos?.nombre || '-'}</td>
            <td class="p-3.5 text-slate-300 font-medium">$${Number(e.sueldo).toFixed(2)}</td>
            <td class="p-3.5 text-emerald-400">$${Number(e.bono_alimentacion).toFixed(2)}</td>
            <td class="p-3.5 text-sky-400" data-feature="empleados.subsidio">$${Number(e.otros_ingresos).toFixed(2)}</td>
            <td class="p-3.5 text-center font-mono text-xs ${e.device_user_id ? 'text-amber-400 font-bold' : 'text-slate-600'}" data-feature="empleados.dahua">${e.device_user_id || '—'}</td>
            <td class="p-3.5 text-center min-w-[150px] space-x-1.5 whitespace-nowrap">
                <button data-feature="empleados.ari" onclick="abrirModalGestionARI(${e.id})" class="text-amber-400 hover:text-amber-300 p-1.5 transition" title="Gestionar Formulario AR-I (I.S.L.R.)"><i class="fa-solid fa-receipt"></i></button>
                <button data-feature="documentos.constancias" onclick="abrirModalDocumentoLaboral(${e.id})" class="text-teal-400 hover:text-teal-300 p-1.5 transition" title="Emitir Constancia o Amonestación"><i class="fa-solid fa-file-contract"></i></button>
                // En la columna de acciones, junto a los otros botones:
<button onclick="abrirExpediente(${e.id})" class="text-indigo-400 hover:text-indigo-300 p-1.5 transition" title="Expediente Digital"><i class="fa-solid fa-folder-open"></i></button>
                <button onclick="editarEmpleado(${e.id})" class="text-sky-400 hover:text-sky-300 p-1.5 transition" title="Editar"><i class="fa-solid fa-pen"></i></button>
                <button onclick="eliminarEmpleado(${e.id})" class="text-slate-500 hover:text-red-400 p-1.5 transition" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
    if (typeof aplicarFeatureFlagsDOM === 'function') aplicarFeatureFlagsDOM();
}

/* ---------- EMPLEADOS: MODAL / CRUD ---------- */

function abrirCrearEmpleado() {
    ['emp-id', 'emp-fecha', 'emp-cedula', 'emp-nombre', 'emp-telefono', 'emp-device-user-id'].forEach(id => gId(id).value = '');
    ['emp-sueldo', 'emp-bono-alim', 'emp-otros-ing', 'emp-islr'].forEach(id => gId(id).value = '0');
    gId('emp-depto-select').value = '';
    gId('emp-cargo-select').value = '';
    gId('emp-activo').checked = true;
    openModal('modal-empleado');
}

function editarEmpleado(id) {
    const e = appState.empleados.find(x => String(x.id) === String(id));
    if (!e) return;
    gId('emp-id').value = e.id;
    gId('emp-fecha').value = e.fecha_ingreso || '';
    gId('emp-cedula').value = e.cedula || '';
    gId('emp-nombre').value = e.nombre || '';
    gId('emp-telefono').value = e.telefono || '';
    gId('emp-depto-select').value = e.departamento_id || '';
    gId('emp-cargo-select').value = e.cargo_id || '';
    gId('emp-sueldo').value = e.sueldo || 0;
    gId('emp-bono-alim').value = e.bono_alimentacion || 0;
    gId('emp-otros-ing').value = e.otros_ingresos || 0;
    gId('emp-device-user-id').value = e.device_user_id || '';
    gId('emp-islr').value = e.islr_porcentaje || 0;
    gId('emp-activo').checked = e.activo;
    openModal('modal-empleado');
}

async function guardarEmpleado() {
    const id = gId('emp-id').value;
    const p = {
        fecha_ingreso: gId('emp-fecha').value || null,
        cedula: gId('emp-cedula').value,
        nombre: gId('emp-nombre').value,
        telefono: gId('emp-telefono').value,
        departamento_id: gId('emp-depto-select').value || null,
        cargo_id: gId('emp-cargo-select').value || null,
        sueldo: parseFloat(gId('emp-sueldo').value) || 0,
        bono_alimentacion: parseFloat(gId('emp-bono-alim').value) || 0,
        otros_ingresos: parseFloat(gId('emp-otros-ing').value) || 0,
        device_user_id: gId('emp-device-user-id').value.trim() || null,
        islr_porcentaje: parseFloat(gId('emp-islr').value) || 0,
        activo: gId('emp-activo').checked
    };
    if (!p.cedula || !p.nombre) return showToast('Faltan datos obligatorios', 'error');
    try {
        if (id) { await supabaseClient.from('empleados').update(p).eq('id', id); }
        else { await supabaseClient.from('empleados').insert([p]); }
    } catch (e) { console.warn('Error al guardar empleado:', e); }
    closeModal('modal-empleado');
    if (typeof fetchAllData === 'function') fetchAllData();
    showToast('Empleado guardado exitosamente');
}

async function toggleEstadoEmpleado(id, v) {
    try { await supabaseClient.from('empleados').update({ activo: !v }).eq('id', id); }
    catch (e) {}
    const emp = appState.empleados.find(x => String(x.id) === String(id));
    if (emp) emp.activo = !v;
    if (typeof fetchAllData === 'function') fetchAllData();
}

async function eliminarEmpleado(id) {
    if (!confirm('¿Eliminar empleado?')) return;
    try { await supabaseClient.from('empleados').delete().eq('id', id); }
    catch (e) {}
    appState.empleados = appState.empleados.filter(x => String(x.id) !== String(id));
    if (typeof fetchAllData === 'function') fetchAllData();
}

/* ---------- DEPARTAMENTOS: MODAL / CRUD ---------- */

function abrirCrearDepartamento() {
    gId('depto-id').value = '';
    gId('depto-nombre').value = '';
    openModal('modal-departamento');
}

function editarDepartamento(id) {
    const d = appState.departamentos.find(x => String(x.id) === String(id));
    if (d) {
        gId('depto-id').value = d.id;
        gId('depto-nombre').value = d.nombre;
        openModal('modal-departamento');
    }
}

async function guardarDepartamento() {
    const id = gId('depto-id').value;
    const n = gId('depto-nombre').value;
    if (!n) return;
    try {
        await (id
            ? supabaseClient.from('departamentos').update({ nombre: n }).eq('id', id)
            : supabaseClient.from('departamentos').insert([{ nombre: n }]));
    } catch (e) {}
    closeModal('modal-departamento');
    if (typeof fetchAllData === 'function') fetchAllData();
}

async function eliminarDepartamento(id) {
    if (!confirm('¿Eliminar depto?')) return;
    try { await supabaseClient.from('departamentos').delete().eq('id', id); }
    catch (e) {}
    appState.departamentos = appState.departamentos.filter(x => String(x.id) !== String(id));
    if (typeof fetchAllData === 'function') fetchAllData();
}

/* ---------- CARGOS: MODAL / CRUD ---------- */

function abrirCrearCargo() {
    gId('cargo-id').value = '';
    gId('cargo-nombre').value = '';
    openModal('modal-cargo');
}

function editarCargo(id) {
    const c = appState.cargos.find(x => String(x.id) === String(id));
    if (c) {
        gId('cargo-id').value = c.id;
        gId('cargo-nombre').value = c.nombre;
        openModal('modal-cargo');
    }
}

async function guardarCargo() {
    const id = gId('cargo-id').value;
    const n = gId('cargo-nombre').value;
    if (!n) return;
    try {
        await (id
            ? supabaseClient.from('cargos').update({ nombre: n }).eq('id', id)
            : supabaseClient.from('cargos').insert([{ nombre: n }]));
    } catch (e) {}
    closeModal('modal-cargo');
    if (typeof fetchAllData === 'function') fetchAllData();
}

async function eliminarCargo(id) {
    if (!confirm('¿Eliminar cargo?')) return;
    try { await supabaseClient.from('cargos').delete().eq('id', id); }
    catch (e) {}
    appState.cargos = appState.cargos.filter(x => String(x.id) !== String(id));
    if (typeof fetchAllData === 'function') fetchAllData();
}
