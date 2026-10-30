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
            <td class="p-3.5 text-center min-w-[220px] space-x-1 whitespace-nowrap">
                <button onclick="abrirExpediente(${e.id})" class="text-emerald-400 hover:text-emerald-300 p-1.5 transition" title="Ver Expediente de Documentos"><i class="fa-solid fa-folder-open"></i></button>
                <button onclick="generarEnlacePortal(${e.id})" class="text-indigo-400 hover:text-indigo-300 p-1.5 transition" title="Portal del Empleado (Enviar Enlace)"><i class="fa-solid fa-user-shield"></i></button>
                <button data-feature="empleados.ari" onclick="abrirModalGestionARI(${e.id})" class="text-amber-400 hover:text-amber-300 p-1.5 transition" title="Gestionar Formulario AR-I (I.S.L.R.)"><i class="fa-solid fa-receipt"></i></button>
                <button data-feature="documentos.constancias" onclick="abrirModalDocumentoLaboral(${e.id})" class="text-teal-400 hover:text-teal-300 p-1.5 transition" title="Emitir Constancia o Amonestación"><i class="fa-solid fa-file-contract"></i></button>
                <button onclick="editarEmpleado(${e.id})" class="text-sky-400 hover:text-sky-300 p-1.5 transition" title="Editar"><i class="fa-solid fa-pen"></i></button>
                <button onclick="eliminarEmpleado(${e.id})" class="text-slate-500 hover:text-red-400 p-1.5 transition" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
    if (typeof aplicarFeatureFlagsDOM === 'function') aplicarFeatureFlagsDOM();
}
