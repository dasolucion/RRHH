/* ============================================================
   js/expediente.js
   Expediente digital con tipos de documento, hash y trazabilidad.
   ============================================================ */

const TIPOS_DOCUMENTO = {
    'cedula':              { label: 'Cédula de Identidad', icon: 'fa-id-card', color: 'sky' },
    'rif':                 { label: 'RIF', icon: 'fa-file-invoice', color: 'purple' },
    'planilla_ingreso':    { label: 'Planilla de Ingreso', icon: 'fa-file-signature', color: 'emerald' },
    'referencia':          { label: 'Referencia Personal/Laboral', icon: 'fa-address-book', color: 'amber' },
    'ivss':                { label: 'Constancia IVSS', icon: 'fa-shield-heart', color: 'rose' },
    'nomina':              { label: 'Recibo de Nómina', icon: 'fa-receipt', color: 'emerald' },
    'vacaciones':          { label: 'Recibo de Vacaciones', icon: 'fa-umbrella-beach', color: 'teal' },
    'prestaciones':        { label: 'Prestaciones / Antigüedad', icon: 'fa-piggy-bank', color: 'cyan' },
    'utilidades':          { label: 'Recibo de Utilidades', icon: 'fa-gift', color: 'rose' },
    'liquidacion':         { label: 'Liquidación Final', icon: 'fa-scale-balanced', color: 'amber' },
    'justificativo':       { label: 'Justificativo de Falta', icon: 'fa-file-medical', color: 'indigo' },
    'otro':                { label: 'Otro Documento', icon: 'fa-file', color: 'slate' }
};

let empleadoExpedienteActual = null;

async function abrirExpediente(empId) {
    const emp = appState.empleados.find(e => String(e.id) === String(empId));
    if (!emp) return;
    empleadoExpedienteActual = emp;
    
    gId('exp-nombre-empleado').innerText = emp.nombre;
    gId('exp-upload-input').value = '';
    gId('exp-nombre-doc').value = '';
    gId('exp-tipo-doc').value = 'cedula';
    gId('exp-visible-empleado').checked = false;
    
    await cargarArchivosExpediente(empId);
    openModal('modal-expediente');
}

async function cargarArchivosExpediente(empId) {
    const tbody = gId('tabla-expediente-body');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-slate-500">Cargando documentos...</td></tr>';
    
    const { data, error } = await supabaseClient
        .from('expediente_documentos')
        .select('*')
        .eq('empleado_id', empId)
        .order('created_at', { ascending: false });

    if (error) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-rose-400">Error: ' + error.message + '</td></tr>';
        return;
    }
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-slate-500">No hay documentos en el expediente.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(doc => {
        const tipo = TIPOS_DOCUMENTO[doc.tipo_documento] || TIPOS_DOCUMENTO['otro'];
        const fecha = new Date(doc.created_at).toLocaleDateString('es-VE');
        const badge = doc.visible_empleado
            ? '<span class="text-[9px] bg-emerald-950 text-emerald-300 px-1.5 py-0.5 rounded">Visible al empleado</span>'
            : '<span class="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">Solo sistema</span>';
        
        return `<tr class="border-b border-slate-800 hover:bg-slate-800/40">
            <td class="p-2">
                <div class="flex items-center gap-2">
                    <i class="fa-solid ${tipo.icon} text-${tipo.color}-400"></i>
                    <div>
                        <!-- TÍTULO: El nombre que se guardó (Ej: Cédula o Nomina 15/10/2026) -->
                        <div class="text-xs font-bold text-white">${doc.nombre_descriptivo}</div>
                        <!-- SUBTÍTULO: El tipo de documento -->
                        <div class="text-[9px] text-slate-400">${tipo.label}</div>
                    </div>
                </div>
            </td>
            <td class="p-2 text-[10px] text-slate-400 font-mono">${fecha}</td>
            <td class="p-2 text-center">${badge}</td>
            <td class="p-2 text-right space-x-1">
                <a href="${doc.url_archivo}" target="_blank" class="text-sky-400 hover:text-sky-300 p-1" title="Ver"><i class="fa-solid fa-eye"></i></a>
                <button onclick="toggleVisibilidadDocumento('${doc.id}', ${!doc.visible_empleado})" class="text-${doc.visible_empleado ? 'amber' : 'emerald'}-400 hover:opacity-70 p-1" title="Cambiar visibilidad"><i class="fa-solid fa-eye${doc.visible_empleado ? '-slash' : ''}"></i></button>
                <button onclick="eliminarDocumentoExpediente('${doc.id}', '${doc.url_archivo}')" class="text-rose-400 hover:text-rose-300 p-1" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
}

async function subirDocumentoExpediente() {
    if (!empleadoExpedienteActual) return;
    
    const file = gId('exp-upload-input').files[0];
    const tipo = gId('exp-tipo-doc').value;
    const nombreDescriptivo = gId('exp-nombre-doc').value.trim();
    const visible = gId('exp-visible-empleado').checked;
    
    if (!file) return showToast('Seleccioná un archivo', 'error');
    if (!nombreDescriptivo) return showToast('Asignale un nombre al documento', 'error');
    
    showToast('Calculando hash y subiendo...');
    
    // Calcular hash SHA-256 del archivo
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Subir a Storage
    const sanitized = nombreDescriptivo.replace(/[^a-zA-Z0-9]/g, '_');
    const filePath = `${empleadoExpedienteActual.id}/${Date.now()}_${sanitized}.${file.name.split('.').pop()}`;
    
    const { error: uploadError } = await supabaseClient.storage
        .from('expediente')
        .upload(filePath, file);
    
    if (uploadError) return showToast('Error al subir: ' + uploadError.message, 'error');
    
    const { data: urlData } = supabaseClient.storage.from('expediente').getPublicUrl(filePath);
    
    // Registrar en la tabla
    const { error: dbError } = await supabaseClient.from('expediente_documentos').insert([{
        empleado_id: empleadoExpedienteActual.id,
        tipo_documento: tipo,
        nombre_descriptivo: nombreDescriptivo,
        url_archivo: urlData.publicUrl,
        hash_sha256: hashHex,
        visible_empleado: visible,
        subido_por: appState.usuarioActual?.rol || 'sistema'
    }]);
    
    if (dbError) return showToast('Error en BD: ' + dbError.message, 'error');
    
    showToast('Documento cargado correctamente');
    gId('exp-upload-input').value = '';
    gId('exp-nombre-doc').value = '';
    await cargarArchivosExpediente(empleadoExpedienteActual.id);
}

async function toggleVisibilidadDocumento(docId, nuevoEstado) {
    await supabaseClient.from('expediente_documentos').update({ visible_empleado: nuevoEstado }).eq('id', docId);
    showToast(nuevoEstado ? 'Visible al empleado' : 'Oculto al empleado');
    await cargarArchivosExpediente(empleadoExpedienteActual.id);
}

async function eliminarDocumentoExpediente(docId, urlArchivo) {
    if (!confirm('¿Eliminar este documento del expediente?')) return;
    
    // Extraer el path del archivo desde la URL
    const path = urlArchivo.split('/expediente/')[1];
    if (path) await supabaseClient.storage.from('expediente').remove([decodeURIComponent(path)]);
    
    await supabaseClient.from('expediente_documentos').delete().eq('id', docId);
    showToast('Documento eliminado');
    await cargarArchivosExpediente(empleadoExpedienteActual.id);
}
