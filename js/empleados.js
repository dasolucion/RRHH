/* ============================================================
   js/empleados.js
   CRUD completo: Empleados, Departamentos, Cargos.
   Gestión de Documentos Laborales (Constancias/Amonestaciones).
   Gestión de Formulario AR-I (SENIAT) y Enlaces.
   Gestión de Enlaces del Portal del Empleado (Expediente).
   ============================================================ */

/* ---------------- RENDER DE TABLAS ---------------- */

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
            <td class="p-3.5 text-center min-w-[190px] space-x-1.5 whitespace-nowrap">
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

/* ---------------- EMPLEADOS: MODAL / CRUD ---------------- */

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

/* ---------------- DEPARTAMENTOS: MODAL / CRUD ---------------- */

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

/* ---------------- CARGOS: MODAL / CRUD ---------------- */

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

/* ============================================================
   PORTAL DEL EMPLEADO (GENERACIÓN DE ENLACE ÚNICO)
   ============================================================ */

async function generarEnlacePortal(empId) {
    const emp = appState.empleados.find(e => String(e.id) === String(empId));
    if (!emp) return;
    
    // 1. Buscar si ya tiene un token activo
    let { data: tokenData } = await supabaseClient
        .from('tokens_portal_empleado')
        .select('*')
        .eq('empleado_id', empId)
        .eq('activo', true)
        .maybeSingle();
    
    // 2. Si no tiene, crear uno nuevo
    if (!tokenData) {
        const { data: nuevo, error } = await supabaseClient
            .from('tokens_portal_empleado')
            .insert([{ empleado_id: empId }])
            .select()
            .single();
            
        if (error) return showToast('Error al crear el enlace: ' + error.message, 'error');
        tokenData = nuevo;
    }
    
    // 3. Construir la URL base
    const baseUrl = window.location.origin + window.location.pathname.replace(/index\.html$/, '').replace(/\/$/, '');
    const enlace = `${baseUrl}/mi_expediente.html?t=${tokenData.token}`;
    
    // 4. Copiar al portapapeles
    await navigator.clipboard.writeText(enlace).catch(() => {});
    showToast('Enlace del portal copiado al portapapeles.');
    
    // 5. Ofrecer envío por WhatsApp
    if (emp.telefono && confirm('Enlace copiado.\n\n¿Deseas enviarlo por WhatsApp ahora?')) {
        let tel = emp.telefono.replace(/\D/g, '');
        if (tel.startsWith('0')) tel = '58' + tel.substring(1);
        else if (tel.length === 10) tel = '58' + tel;
        
        const msj = `Hola ${emp.nombre}, este es tu acceso personal a tu expediente digital (recibos, vacaciones, prestaciones y más):\n\n${enlace}\n\nGuardá este enlace. Es personal e intransferible.`;
        window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msj)}`, '_blank');
    }
}

/* ============================================================
   GESTIÓN DE DOCUMENTOS LABORALES (CONSTANCIAS Y AMONESTACIONES)
   ============================================================ */

let empleadoDocumentoActual = null;

function abrirModalDocumentoLaboral(empId) {
    const emp = appState.empleados.find(e => String(e.id) === String(empId));
    if (!emp) return showToast('Empleado no encontrado', 'error');
    empleadoDocumentoActual = emp;
    gId('doc-emp-nombre').innerText = emp.nombre;
    gId('amon-fecha-falta').valueAsDate = new Date();
    toggleFormulariosDocumento();
    openModal('modal-constancia');
}

function toggleFormulariosDocumento() {
    const tipo = gId('doc-tipo').value;
    const esAmonestacion = tipo === 'amonestacion';
    
    gId('form-amonestacion-opciones').classList.toggle('hidden', !esAmonestacion);
    gId('campo-dirigido').classList.toggle('hidden', esAmonestacion);
    
    actualizarVistaPreviaDocumento();
}

function actualizarVistaPreviaDocumento() {
    const emp = empleadoDocumentoActual;
    if (!emp) return;

    const tipo = gId('doc-tipo').value;
    const ciudad = gId('const-ciudad').value.trim() || 'Caracas';
    const hoy = new Date();
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const fechaLetras = `${hoy.getDate()} días del mes de ${meses[hoy.getMonth()]} de ${hoy.getFullYear()}`;
    const [iy, im, id] = (emp.fecha_ingreso || '').split('-');
    const fechaIngresoFmt = (iy && im && id) ? `${id}/${im}/${iy}` : 'la fecha de ingreso';
    const cargo = emp.cargos?.nombre || emp.departamentos?.nombre || 'Trabajador(a)';
    const tasa = parseFloat(gId('nom-tasa-bcv')?.value) || 36.5;

    let html = '';

    if (tipo === 'amonestacion') {
        const causalTexto = gId('amon-causal').options[gId('amon-causal').selectedIndex].text;
        const hechos = gId('amon-hechos').value.trim() || 'Haber incurrido en incumplimiento de sus deberes laborales estipulados en su contrato.';
        const fechaFalta = gId('amon-fecha-falta').value || 'reciente';

        html = `
        <div class="bg-white text-black p-8 font-serif max-w-2xl mx-auto border border-black shadow-lg text-xs leading-relaxed" id="documento-impresion-papel">
            <div class="text-center border-b-2 border-black pb-3 mb-5 font-sans">
                <h2 class="text-base font-black uppercase tracking-wider text-black">${appState.parametros.nombre_empresa}</h2>
                <p class="text-[11px] text-slate-800 font-semibold">${appState.parametros.rif_empresa}</p>
                <p class="text-[9px] text-slate-600">DEPARTAMENTO DE GESTIÓN HUMANA Y RELACIONES LABORALES</p>
            </div>

            <div class="text-center my-4">
                <h3 class="text-sm font-bold uppercase tracking-widest text-rose-700 underline underline-offset-4">NOTIFICACIÓN DE AMONESTACIÓN ESCRITA</h3>
            </div>

            <p class="text-justify mb-4">
                En la ciudad de ${ciudad}, a los ${fechaLetras}, la empresa <strong>${appState.parametros.nombre_empresa}</strong> hace entrega formal de la presente <strong>AMONESTACIÓN ESCRITA</strong> al (la) ciudadano(a) <strong>${emp.nombre}</strong>, titular de la Cédula de Identidad N° <strong>${emp.cedula}</strong>, quien desempeña el cargo de <strong>${cargo}</strong>.
            </p>

            <div class="border border-black bg-slate-50 p-3 mb-4 space-y-1">
                <p><strong>CAUSAL LEGAL APLICADA:</strong> ${causalTexto}.</p>
                <p><strong>FECHA DE OCURRENCIA:</strong> ${fechaFalta}</p>
                <p class="text-justify"><strong>DESCRIPCIÓN DE LOS HECHOS:</strong> ${hechos}</p>
            </div>

            <p class="text-justify mb-4 indent-4">
                Se le exhorta formalmente a corregir dicha conducta y dar fiel cumplimiento a las obligaciones contractuales y de ley. De persistir en faltas similares, la empresa se reserva el derecho de rescindir la relación laboral conforme a lo estipulado en la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT).
            </p>

            <div class="pt-8 border-t border-black mt-8 text-[10px] font-sans">
                <div class="grid grid-cols-2 gap-8 mb-8">
                    <div class="text-center border-t border-black pt-1">
                        <p class="font-bold">POR LA EMPRESA</p>
                        <p class="text-[9px] text-slate-600">Gestión Humana / Administración</p>
                    </div>
                    <div class="text-center border-t border-black pt-1">
                        <p class="font-bold">EL TRABAJADOR</p>
                        <p class="text-[9px] text-slate-600">Firma en señal de Notificación</p>
                    </div>
                </div>
                <div class="border-t border-dashed border-slate-400 pt-3 text-center">
                    <p class="font-bold text-[9px] mb-6 uppercase text-slate-500">En caso de negativa del trabajador a firmar su notificación:</p>
                    <div class="grid grid-cols-2 gap-8 text-[9px]">
                        <div class="border-t border-black pt-1">Firma Testigo 1 / C.I.:</div>
                        <div class="border-t border-black pt-1">Firma Testigo 2 / C.I.:</div>
                    </div>
                </div>
            </div>
        </div>`;
    } else {
        const dirigido = gId('const-dirigido').value.trim() || 'A QUIEN PUEDA INTERESAR';
        const salarioBaseUSD = Number(emp.sueldo || 0);
        const salarioBaseBs = salarioBaseUSD * tasa;

        const parrafoSalario = tipo === 'constancia_con_sueldo'
            ? `devengando un salario básico mensual de <strong>$${salarioBaseUSD.toFixed(2)}</strong> (equivalente a <strong>Bs. ${fNum(salarioBaseBs)}</strong> a la tasa oficial del Banco Central de Venezuela).`
            : `demostrando durante su desempeño honestidad, puntualidad y responsabilidad en las funciones asignadas.`;

        html = `
        <div class="bg-white text-black p-8 font-serif max-w-2xl mx-auto border border-black shadow-lg text-xs leading-relaxed" id="documento-impresion-papel">
            <div class="text-center border-b-2 border-black pb-3 mb-5 font-sans">
                <h2 class="text-base font-black uppercase tracking-wider text-black">${appState.parametros.nombre_empresa}</h2>
                <p class="text-[11px] text-slate-800 font-semibold">${appState.parametros.rif_empresa}</p>
                <p class="text-[9px] text-slate-600">DEPARTAMENTO DE GESTIÓN HUMANA Y RELACIONES LABORALES</p>
            </div>

            <div class="text-center my-6">
                <h3 class="text-sm font-bold uppercase tracking-widest underline underline-offset-4 text-black">CONSTANCIA DE TRABAJO</h3>
            </div>

            <p class="mb-4 text-xs font-bold font-sans uppercase">${dirigido}:</p>

            <p class="text-justify mb-5 indent-6">
                Por medio de la presente se hace constar que el (la) ciudadano(a) <strong>${emp.nombre}</strong>, titular de la Cédula de Identidad N° <strong>${emp.cedula}</strong>, presta sus servicios en esta empresa desde el <strong>${fechaIngresoFmt}</strong>, desempeñando actualmente el cargo de <strong>${cargo}</strong>, ${parrafoSalario}
            </p>

            <p class="text-justify mb-10 indent-6">
                Constancia que se expide en cumplimiento del Artículo 84 de la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT), a petición de la parte interesada, en la ciudad de ${ciudad}, a los ${fechaLetras}.
            </p>

            <div class="pt-12 text-center border-t border-black mt-12 w-64 mx-auto font-sans">
                <p class="font-bold text-xs uppercase">${appState.parametros.nombre_empresa.split('/')[0].trim()}</p>
                <p class="text-[9px] text-slate-700">Recursos Humanos / Administración</p>
            </div>
        </div>`;
    }

    gId('area-impresion-constancia').innerHTML = html;
}

function imprimirDocumentoLaboral() {
    gId('print-container').innerHTML = gId('area-impresion-constancia').innerHTML;
    window.print();
}

/* ============================================================
   GESTIÓN DE ENLACES E IMPRESIÓN AR-I (SENIAT)
   ============================================================ */

let empleadoARIGestion = null;

function abrirModalGestionARI(empId) {
    const emp = appState.empleados.find(e => String(e.id) === String(empId));
    if (!emp) return showToast('Empleado no encontrado', 'error');
    
    empleadoARIGestion = emp;
    gId('ari-modal-emp-id').value = emp.id;
    gId('ari-modal-emp-nombre').innerText = emp.nombre;
    gId('ari-modal-pct-actual').innerText = `${Number(emp.islr_porcentaje || 0).toFixed(2)}%`;
    gId('ari-enlace-generado').value = '';
    gId('contenedor-acciones-enlace').classList.add('hidden');
    
    openModal('modal-gestion-ari');
}

async function generarTokenYEnlaceARI() {
    const emp = empleadoARIGestion;
    if (!emp) return;

    const token = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    const expiraEn = new Date(Date.now() + (72 * 60 * 60 * 1000)).toISOString(); // 72 horas

    const { error } = await supabaseClient
        .from('solicitudes_ari')
        .insert([{
            token: token,
            empleado_id: emp.id,
            expira_en: expiraEn,
            usado: false
        }]);

    if (error) {
        showToast('Error al generar enlace seguro', 'error');
        return;
    }

    const urlBase = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
    const urlCompleta = `${urlBase}/ari.html?t=${token}`;
    
    gId('ari-enlace-generado').value = urlCompleta;
    gId('contenedor-acciones-enlace').classList.remove('hidden');
    showToast('Enlace único generado exitosamente');
}

function copiarEnlaceARI() {
    const input = gId('ari-enlace-generado');
    if (!input || !input.value) return;
    navigator.clipboard.writeText(input.value);
    showToast('Enlace copiado al portapapeles');
}

function enviarWhatsAppEnlaceARI() {
    const emp = empleadoARIGestion;
    const url = gId('ari-enlace-generado').value;
    if (!emp || !url) return;
    
    let t = emp.telefono ? emp.telefono.replace(/\D/g, '') : '';
    if (!t) return showToast('El empleado no tiene teléfono registrado', 'error');
    if (t.startsWith('0')) t = '58' + t.substring(1); else if (t.length === 10) t = '58' + t;

    const msg = `Estimado(a) ${emp.nombre},\nLe hacemos entrega de su enlace único y seguro para completar el Formulario AR-I del SENIAT (Determinación de Retención de I.S.L.R.):\n\n${url}\n\nPor favor ingrese y complete sus datos. Este enlace es de un solo uso y expirará automáticamente una vez enviado.`;
    window.open(`https://wa.me/${t}?text=${encodeURIComponent(msg)}`, '_blank');
}

async function imprimirPlanillaARISENIAT() {
    const emp = empleadoARIGestion;
    if (!emp) return;

    const utVigente = Number(appState.parametros?.valor_ut || 9.00);

    const { data } = await supabaseClient
        .from('solicitudes_ari')
        .select('*')
        .eq('empleado_id', emp.id)
        .eq('usado', true)
        .order('fecha_completado', { ascending: false })
        .limit(1)
        .maybeSingle();

    const d = data?.datos_declaracion || {
        ingreso_anual_bs: (Number(emp.sueldo || 0) * 12 * 36.5),
        ingreso_anual_ut: ((Number(emp.sueldo || 0) * 12 * 36.5) / utVigente),
        desgravamen_tipo: 'unico',
        desgravamen_ut: 774,
        detalles_desgravamen: null,
        cargas_familiares: 0,
        porcentaje_determinado: emp.islr_porcentaje || 0,
        valor_ut_aplicado: utVigente
    };

    const fechaFmt = data?.fecha_completado ? new Date(data.fecha_completado).toLocaleDateString('es-VE') : new Date().toLocaleDateString('es-VE');

    let filasDesgravamenHTML = '';
    if (d.desgravamen_tipo === 'detallado' && d.detalles_desgravamen) {
        const det = d.detalles_desgravamen;
        filasDesgravamenHTML = `
            <tr class="border-b border-black text-[9px] bg-slate-50"><td class="p-1 pl-4">• Institutos docentes (Educación):</td><td class="p-1 text-right font-mono">Bs. ${fNum(det.educacion_bs)}</td><td class="p-1 text-right font-mono">-${(det.educacion_bs / d.valor_ut_aplicado).toFixed(2)} U.T.</td></tr>
            <tr class="border-b border-black text-[9px] bg-slate-50"><td class="p-1 pl-4">• Primas seguro HCM:</td><td class="p-1 text-right font-mono">Bs. ${fNum(det.seguro_bs)}</td><td class="p-1 text-right font-mono">-${(det.seguro_bs / d.valor_ut_aplicado).toFixed(2)} U.T.</td></tr>
            <tr class="border-b border-black text-[9px] bg-slate-50"><td class="p-1 pl-4">• Servicios médicos y odontológicos:</td><td class="p-1 text-right font-mono">Bs. ${fNum(det.medico_bs)}</td><td class="p-1 text-right font-mono">-${(det.medico_bs / d.valor_ut_aplicado).toFixed(2)} U.T.</td></tr>
            <tr class="border-b border-black text-[9px] bg-slate-50"><td class="p-1 pl-4">• Vivienda principal (Intereses o alquiler):</td><td class="p-1 text-right font-mono">Bs. ${fNum(det.vivienda_bs)}</td><td class="p-1 text-right font-mono">-${(det.vivienda_bs / d.valor_ut_aplicado).toFixed(2)} U.T.</td></tr>
            <tr class="border-b border-black font-bold"><td class="p-1.5">2. Total Desgravámenes Detallados (Art. 59 LISLR)</td><td class="p-1.5 text-right">-</td><td class="p-1.5 font-mono text-right">-${Number(d.desgravamen_ut).toFixed(2)} U.T.</td></tr>
        `;
    } else {
        filasDesgravamenHTML = `
            <tr class="border-b border-black"><td class="p-1.5">2. Desgravamen Aplicado (Único 774 U.T. - Art. 59 LISLR)</td><td class="p-1.5 text-right">-</td><td class="p-1.5 font-mono text-right">-774.00 U.T.</td></tr>
        `;
    }

    const html = `
    <div class="bg-white text-black p-8 font-sans max-w-3xl mx-auto border-2 border-black text-[11px] leading-tight space-y-4">
        <div class="flex justify-between items-start border-b-2 border-black pb-2">
            <div>
                <p class="font-extrabold uppercase text-[9px]">REPÚBLICA BOLIVARIANA DE VENEZUELA</p>
                <p class="font-bold text-[9px]">MINISTERIO DEL PODER POPULAR DE ECONOMÍA Y FINANZAS - SENIAT</p>
                <h2 class="text-sm font-black mt-1 uppercase">FORMULARIO AR-I (DECRETO N° 1808)</h2>
            </div>
            <div class="text-right">
                <p class="text-[9px] font-bold">FECHA DE DECLARACIÓN</p>
                <p class="font-mono text-xs font-black">${fechaFmt}</p>
                <p class="text-[9px] text-slate-600 font-mono">U.T.: Bs. ${Number(d.valor_ut_aplicado).toFixed(2)}</p>
            </div>
        </div>

        <table class="w-full border border-black text-[10px]">
            <tr class="bg-slate-100 font-bold border-b border-black"><td colspan="4" class="p-1 uppercase">A. DATOS DEL TRABAJADOR Y AGENTE DE RETENCIÓN</td></tr>
            <tr class="border-b border-black"><td class="p-1.5 font-bold w-32">APELLIDOS Y NOMBRES:</td><td class="p-1.5 uppercase font-bold">${emp.nombre}</td><td class="p-1.5 font-bold w-24">CÉDULA / RIF:</td><td class="p-1.5 font-mono">${emp.cedula}</td></tr>
            <tr class="border-b border-black"><td class="p-1.5 font-bold">EMPRESA (PATRONO):</td><td class="p-1.5 uppercase">${appState.parametros.nombre_empresa}</td><td class="p-1.5 font-bold">RIF EMPRESA:</td><td class="p-1.5 font-mono">${appState.parametros.rif_empresa}</td></tr>
        </table>

        <table class="w-full border border-black text-[10px]">
            <tr class="bg-slate-100 font-bold border-b border-black"><td class="p-1" colspan="2">B. DETERMINACIÓN DEL PORCENTAJE DE RETENCIÓN</td><td class="p-1 text-right font-mono">VALORES EN U.T.</td></tr>
            <tr class="border-b border-black"><td class="p-1.5">1. Total Remuneraciones Normales Proyectadas en el Año</td><td class="p-1.5 font-mono text-right">Bs. ${Number(d.ingreso_anual_bs).toLocaleString('es-VE',{minimumFractionDigits:2})}</td><td class="p-1.5 font-mono font-bold text-right">${Number(d.ingreso_anual_ut).toFixed(2)} U.T.</td></tr>
            ${filasDesgravamenHTML}
            <tr class="border-b border-black"><td class="p-1.5">3. Rebaja Personal (Art. 61 LISLR)</td><td class="p-1.5 text-right">-</td><td class="p-1.5 font-mono text-right">-10.00 U.T.</td></tr>
            <tr class="border-b border-black"><td class="p-1.5">4. Cargas Familiares Declaradas (${d.cargas_familiares} personas x 10 U.T.)</td><td class="p-1.5 text-right">-</td><td class="p-1.5 font-mono text-right">-${(Number(d.cargas_familiares) * 10).toFixed(2)} U.T.</td></tr>
            <tr class="bg-slate-200 font-bold border-t-2 border-black text-xs"><td class="p-2 uppercase" colspan="2">PORCENTAJE DE RETENCIÓN FINAL DETERMINADO:</td><td class="p-2 font-mono font-black text-right text-sm">${Number(d.porcentaje_determinado).toFixed(2)}%</td></tr>
        </table>

        <p class="text-[9px] text-justify leading-tight">
            Declaro bajo fe de juramento que las informaciones contenidas en este formulario son copia fiel de mis asignaciones salariales proyectadas y gastos desgravables para el presente ejercicio fiscal, en cumplimiento de lo establecido en el Reglamento Parcial de la Ley de Impuesto sobre la Renta en Materia de Retenciones (Decreto N° 1808).
        </p>

        <div class="grid grid-cols-2 gap-12 pt-12 border-t border-black text-center text-[10px] font-bold">
            <div>
                <div class="border-t border-black pt-1">FIRMA DEL TRABAJADOR DECLARANTE</div>
                <p class="text-[9px] font-normal font-mono">C.I. ${emp.cedula}</p>
            </div>
            <div>
                <div class="border-t border-black pt-1">AGENTE DE RETENCIÓN (FIRMA Y SELLO)</div>
                <p class="text-[9px] font-normal">${appState.parametros.nombre_empresa.split('/')[0].trim()}</p>
            </div>
        </div>
    </div>`;

    gId('print-container').innerHTML = html;
    window.print();
}
