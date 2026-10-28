/* ============================================================
   js/expediente.js
   Gestión de documentos del empleado en Supabase Storage.
   ============================================================ */

let empleadoExpedienteActual = null;

async function abrirExpediente(empId) {
    const emp = appState.empleados.find(e => String(e.id) === String(empId));
    if (!emp) return;
    empleadoExpedienteActual = emp;
    
    gId('exp-nombre-empleado').innerText = emp.nombre;
    gId('exp-upload-input').value = ''; // Limpiar input
    
    await cargarArchivosExpediente(empId);
    openModal('modal-expediente');
}

async function cargarArchivosExpediente(empId) {
    const tbody = gId('tabla-expediente-body');
    tbody.innerHTML = '<tr><td colspan="3" class="text-center p-4 text-slate-500">Cargando archivos...</td></tr>';
    
    const { data, error } = await supabaseClient.storage
        .from('expediente')
        .list(`${empId}/`, { sortBy: { column: 'created_at', order: 'desc' } });

    if (error || !data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center p-4 text-slate-500">No hay documentos anexados.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(file => {
        const { data: urlData } = supabaseClient.storage.from('expediente').getPublicUrl(`${empId}/${file.name}`);
        return `<tr class="border-b border-slate-800">
            <td class="p-2 text-xs text-white">${file.name}</td>
            <td class="p-2 text-xs text-slate-400">${new Date(file.created_at).toLocaleDateString()}</td>
            <td class="p-2 text-right space-x-2">
                <a href="${urlData.publicUrl}" target="_blank" class="text-sky-400 hover:text-sky-300" title="Ver"><i class="fa-solid fa-eye"></i></a>
                <button onclick="eliminarArchivoExpediente('${file.name}')" class="text-rose-400 hover:text-rose-300" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
}

async function subirArchivoExpediente() {
    if (!empleadoExpedienteActual) return;
    const fileInput = gId('exp-upload-input');
    const file = fileInput.files[0];
    if (!file) return showToast('Seleccione un archivo', 'error');
    
    const filePath = `${empleadoExpedienteActual.id}/${Date.now()}_${file.name}`;
    showToast('Subiendo archivo...');

    const { error } = await supabaseClient.storage
        .from('expediente')
        .upload(filePath, file);

    if (error) {
        return showToast('Error al subir archivo: ' + error.message, 'error');
    }
    
    showToast('Archivo subido correctamente');
    fileInput.value = '';
    await cargarArchivosExpediente(empleadoExpedienteActual.id);
}

async function eliminarArchivoExpediente(nombreArchivo) {
    if (!empleadoExpedienteActual) return;
    if (!confirm('¿Eliminar este documento?')) return;
    
    const filePath = `${empleadoExpedienteActual.id}/${nombreArchivo}`;
    await supabaseClient.storage.from('expediente').remove([filePath]);
    showToast('Documento eliminado');
    await cargarArchivosExpediente(empleadoExpedienteActual.id);
}