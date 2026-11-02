/* ============================================================
   js/asistencia.js
   Integración con el dispositivo Dahua. Lee `asistencia_registros`
   en Supabase y calcula los días faltantes en la nómina.
   ============================================================ */

async function aplicarAsistenciaANomina() {
    if (typeof getFeatureFlag === 'function' && !getFeatureFlag('nomina.dahua_asistencia')) {
        return showToast('Módulo de asistencia biométrica desactivado', 'error');
    }

    const fechaPagoStr = gId('nom-fecha-proceso')?.value;
    if (!fechaPagoStr) return showToast('Falta la fecha de pago en la nómina', 'error');

    const fechaPago = new Date(fechaPagoStr + 'T00:00:00');
    const dia = fechaPago.getDate();
    let inicioQuincena, finQuincena;

    if (dia <= 15) {
        inicioQuincena = new Date(fechaPago.getFullYear(), fechaPago.getMonth(), 1);
        finQuincena = new Date(fechaPago.getFullYear(), fechaPago.getMonth(), 15);
    } else {
        inicioQuincena = new Date(fechaPago.getFullYear(), fechaPago.getMonth(), 16);
        finQuincena = new Date(fechaPago.getFullYear(), fechaPago.getMonth() + 1, 0);
    }

    const isoIni = fechaLocalISO(inicioQuincena);
    const isoFin = fechaLocalISO(finQuincena);

    showToast(`Leyendo asistencia del ${isoIni} al ${isoFin}...`);

    const { data: asistencia, error } = await supabaseClient
        .from('asistencia_registros')
        .select('device_user_id, cedula, fecha_hora, tipo')
        .gte('fecha_hora', isoIni + 'T00:00:00')
        .lte('fecha_hora', isoFin + 'T23:59:59');

    if (error) {
        console.error('Error leyendo asistencia:', error);
        return showToast('Error al leer asistencia de Supabase', 'error');
    }

    const { data: justificativos } = await supabaseClient
        .from('justificativos_faltas')
        .select('empleado_id, fecha_falta')
        .gte('fecha_falta', isoIni)
        .lte('fecha_falta', isoFin);

    const diasAsistidos = {};
    const diasAsistidosCedula = {};
    let ultimaFecha = null;

    (asistencia || []).forEach(r => {
        if (!r.fecha_hora) return;
        const fechaDia = r.fecha_hora.substring(0, 10);
        if (!ultimaFecha || fechaDia > ultimaFecha) ultimaFecha = fechaDia;
        if (r.device_user_id) {
            const k = String(r.device_user_id).trim();
            if (!diasAsistidos[k]) diasAsistidos[k] = new Set();
            diasAsistidos[k].add(fechaDia);
        }
        if (r.cedula) {
            const k = String(r.cedula).trim();
            if (!diasAsistidosCedula[k]) diasAsistidosCedula[k] = new Set();
            diasAsistidosCedula[k].add(fechaDia);
        }
    });

    const justSet = new Set((justificativos || []).map(j => `${j.empleado_id}|${j.fecha_falta}`));

    const habilesPeriodo = diasHabilesEnRango(inicioQuincena, finQuincena);
    const totalHabiles = habilesPeriodo.length;

    const emps = appState.empleados.filter(e => e.activo);
    let procesados = 0, sinID = 0, sinRegistros = 0;

    for (const e of emps) {
        const inputDf = gId(`df-${e.id}`);
        if (!inputDf) continue;

        if (!e.device_user_id && !e.cedula) {
            sinID++;
            continue;
        }

        const setDev = (e.device_user_id && diasAsistidos[String(e.device_user_id).trim()]) || null;
        const setCed = (e.cedula && diasAsistidosCedula[String(e.cedula).trim()]) || null;
        const asistidosSet = (setDev && setCed)
            ? new Set([...setDev, ...setCed])
            : (setDev || setCed || null);

        if (!asistidosSet) {
            // Sin lecturas del reloj para este empleado: no se puede afirmar que faltó
            sinRegistros++;
            continue;
        }

        const fIngreso = e.fecha_ingreso ? new Date(e.fecha_ingreso + 'T00:00:00') : null;
        let faltantes = 0;

        for (const diaHabil of habilesPeriodo) {
            if (fIngreso && diaHabil < fIngreso) continue;
            const clave = fechaLocalISO(diaHabil);
            if (ultimaFecha && clave > ultimaFecha) continue; // aún no sincronizado: no es falta
            if (asistidosSet.has(clave)) continue;
            if (justSet.has(`${e.id}|${clave}`)) continue;
            faltantes++;
        }

        inputDf.value = faltantes;
        procesados++;
    }

    recalcularTodaLaNomina();
    autoguardarBorradorNomina();

    const extras = [
        sinID > 0 ? `${sinID} sin ID Dahua` : '',
        sinRegistros > 0 ? `${sinRegistros} sin registros del reloj` : ''
    ].filter(Boolean).join(', ');

    showToast(`Asistencia aplicada: ${procesados} empleados (${totalHabiles} días hábiles)${extras ? `, ${extras}` : ''}`);
}

/* ============================================================
   BLOQUE 3 — MÓDULO DE ASISTENCIA (consulta + justificativos)
   Lee asistencia_registros y justificativos_faltas.
   ============================================================ */

let _asistMesCache = null;
let _asistDatosCache = null;

const ASIST_DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function _asistMesActualISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function _asistFormatearMes(mesISO) {
    if (!mesISO) return '-';
    const [y, m] = mesISO.split('-').map(Number);
    const txt = new Date(y, m - 1, 1).toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });
    return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function _asistFechaCorta(iso) {
    if (!iso) return '-';
    const [y, m, d] = String(iso).substring(0, 10).split('-');
    return (y && m && d) ? `${d}/${m}/${y}` : iso;
}

async function renderModuloAsistencia(force = false) {
    if (typeof getFeatureFlag === 'function' && !getFeatureFlag('nomina.dahua_asistencia')) {
        return showToast('Módulo de asistencia biométrica desactivado', 'error');
    }

    const inputMes = gId('asist-mes');
    if (inputMes && !inputMes.value) inputMes.value = _asistMesActualISO();
    const mes = (inputMes && inputMes.value) || _asistMesActualISO();

    const tbody = gId('tabla-asistencia-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-slate-500">Cargando registros de asistencia...</td></tr>';

    const data = await cargarAsistenciaMes(mes, force);
    if (!data) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-rose-400">No se pudieron cargar los registros.</td></tr>';
        return;
    }

    const btnImport = gId('asist-btn-importar');
    if (btnImport) {
        const puedeImportar = typeof tienePermiso === 'function' ? tienePermiso('asistencia', 'editar') : true;
        btnImport.style.display = puedeImportar ? '' : 'none';
    }

    renderTablaAsistencia();
}

function _asistPoblarEmpleados() {
    const sel = gId('asist-emp');
    if (!sel) return;
    const actual = sel.value;
    const emps = (appState.empleados || []).filter(e => e.activo)
        .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
    sel.innerHTML = '<option value="">Todos los empleados</option>' +
        emps.map(e => `<option value="${e.id}">${e.nombre}</option>`).join('');
    sel.value = actual || '';
}

async function cargarAsistenciaMes(mes, force = false) {
    if (!force && _asistMesCache === mes && _asistDatosCache) return _asistDatosCache;

    const [y, m] = String(mes).split('-').map(Number);
    if (!y || !m) return null;

    const ini = new Date(y, m - 1, 1);
    const fin = new Date(y, m, 0);
    const isoIni = fechaLocalISO(ini);
    const isoFin = fechaLocalISO(fin);
    const habiles = diasHabilesEnRango(ini, fin);

    const { data: registros, error } = await supabaseClient
        .from('asistencia_registros')
        .select('device_user_id, cedula, fecha_hora, tipo')
        .gte('fecha_hora', isoIni + 'T00:00:00')
        .lte('fecha_hora', isoFin + 'T23:59:59')
        .order('fecha_hora', { ascending: true });

    if (error) {
        console.error('Error leyendo asistencia:', error);
        showToast('Error al leer asistencia de Supabase', 'error');
        return null;
    }

    const { data: justificativos } = await supabaseClient
        .from('justificativos_faltas')
        .select('id, empleado_id, fecha_falta, motivo')
        .gte('fecha_falta', isoIni)
        .lte('fecha_falta', isoFin);

    // Última fecha con datos del reloj dentro del mes (para no inventar faltas futuras)
    let ultimaFecha = null;
    (registros || []).forEach(r => {
        const f = String(r.fecha_hora || '').substring(0, 10);
        if (f && (!ultimaFecha || f > ultimaFecha)) ultimaFecha = f;
    });

    const justMap = new Map();
    (justificativos || []).forEach(j => {
        justMap.set(`${j.empleado_id}|${j.fecha_falta}`, j);
    });

    // Agrupar por ID de dispositivo y por cédula (respaldo)
    const porDevice = new Map();
    const porCedula = new Map();

    const agregar = (mapa, id, r, fecha, hora) => {
        if (!id) return;
        const k = String(id).trim();
        if (!mapa.has(k)) mapa.set(k, new Map());
        const dias = mapa.get(k);
        if (!dias.has(fecha)) dias.set(fecha, { entrada: null, salida: null, count: 0 });
        const dia = dias.get(fecha);
        dia.count++;
        if (!dia.entrada || hora < dia.entrada) dia.entrada = hora;
        if (!dia.salida || hora > dia.salida) dia.salida = hora;
    };

    (registros || []).forEach(r => {
        if (!r.fecha_hora) return;
        const fecha = String(r.fecha_hora).substring(0, 10);
        const hora = String(r.fecha_hora).substring(11, 16);
        agregar(porDevice, r.device_user_id, r, fecha, hora);
        agregar(porCedula, r.cedula, r, fecha, hora);
    });

    const emps = (appState.empleados || []).filter(e => e.activo).map(e => {
        const deviceMap = porDevice.get(String(e.device_user_id || '').trim()) || null;
        const cedMap = porCedula.get(String(e.cedula || '').trim()) || null;
        const dayMap = _asistUnirDias(deviceMap, cedMap);
        const fuente = dayMap ? (deviceMap && cedMap ? 'mixta' : (deviceMap ? 'device' : 'cedula')) : null;
        const tieneId = !!(e.device_user_id || e.cedula);
        const fIngreso = e.fecha_ingreso ? new Date(e.fecha_ingreso + 'T00:00:00') : null;

        const dias = [];
        let asistidos = 0, faltas = 0, justificadas = 0, sinDatos = 0;

        habiles.forEach(dh => {
            if (fIngreso && dh < fIngreso) return; // antes de ingresar: no aplica
            const fecha = fechaLocalISO(dh);
            const reg = dayMap ? dayMap.get(fecha) : null;
            const just = justMap.get(`${e.id}|${fecha}`) || null;

            let estado;
            if (reg) estado = 'asistida';
            else if (just) estado = 'justificada';
            else if (!tieneId || !dayMap) estado = 'sin_datos'; // sin ID o sin registros del reloj
            else if (!ultimaFecha || fecha > ultimaFecha) estado = 'sin_datos';
            else estado = 'falta';

            if (estado === 'asistida') asistidos++;
            else if (estado === 'falta') faltas++;
            else if (estado === 'justificada') justificadas++;
            else sinDatos++;

            dias.push({
                fecha,
                dow: dh.getDay(),
                estado,
                entrada: reg ? reg.entrada : null,
                salida: reg && reg.salida && reg.salida !== reg.entrada ? reg.salida : null,
                marcas: reg ? reg.count : 0,
                justificativo: just
            });
        });

        return { emp: e, dias, asistidos, faltas, justificadas, sinDatos, fuente, tieneId };
    });

    _asistMesCache = mes;
    _asistDatosCache = {
        mes,
        emps,
        habiles: habiles.length,
        ultimaFecha,
        totalRegistros: (registros || []).length
    };

    _asistPoblarEmpleados();
    return _asistDatosCache;
}

function _asistBadgeEstado(item) {
    if (!item.tieneId) {
        return '<span class="text-[10px] bg-rose-950 text-rose-300 border border-rose-800 px-2 py-0.5 rounded font-bold">Sin ID Dahua</span>';
    }
    if (!item.fuente) {
        return '<span class="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded font-bold">Sin registros</span>';
    }
    if (item.faltas > 0) {
        return `<span class="text-[10px] bg-rose-950 text-rose-300 border border-rose-800 px-2 py-0.5 rounded font-bold">${item.faltas} falta${item.faltas > 1 ? 's' : ''}</span>`;
    }
    return '<span class="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded font-bold">Al día</span>';
}

function renderTablaAsistencia() {
    const tbody = gId('tabla-asistencia-body');
    if (!tbody || !_asistDatosCache) return;

    const filtro = gId('asist-emp') ? gId('asist-emp').value : '';
    let emps = _asistDatosCache.emps.slice();
    if (filtro) emps = emps.filter(x => String(x.emp.id) === String(filtro));

    emps.sort((a, b) => String(a.emp.nombre || '').localeCompare(String(b.emp.nombre || ''), 'es'));

    const totalAsist = emps.reduce((s, x) => s + x.asistidos, 0);
    const totalFaltas = emps.reduce((s, x) => s + x.faltas, 0);
    const totalJust = emps.reduce((s, x) => s + x.justificadas, 0);

    if (gId('asist-kpi-habiles')) gId('asist-kpi-habiles').innerText = _asistDatosCache.habiles;
    if (gId('asist-kpi-asistencias')) gId('asist-kpi-asistencias').innerText = totalAsist;
    if (gId('asist-kpi-faltas')) gId('asist-kpi-faltas').innerText = totalFaltas;
    if (gId('asist-kpi-justificadas')) gId('asist-kpi-justificadas').innerText = totalJust;

    const sync = gId('asist-ultima-sync');
    if (sync) {
        if (!_asistDatosCache.ultimaFecha) {
            sync.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-rose-400 mr-1"></i> Sin registros del reloj en este mes.';
        } else {
            const diasSinSync = Math.floor((new Date() - new Date(_asistDatosCache.ultimaFecha + 'T00:00:00')) / 86400000);
            const alerta = diasSinSync > 2
                ? ` <span class="text-amber-400 font-semibold">(hace ${diasSinSync} días)</span>`
                : '';
            sync.innerHTML = `<i class="fa-solid fa-clock-rotate-left text-emerald-400 mr-1"></i> Último registro del reloj: <strong class="text-slate-200">${_asistFechaCorta(_asistDatosCache.ultimaFecha)}</strong>${alerta}`;
        }
    }

    if (emps.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-slate-500">No hay empleados activos para mostrar.</td></tr>';
        return;
    }

    const puedeEditar = typeof tienePermiso === 'function' ? tienePermiso('asistencia', 'editar') : true;

    tbody.innerHTML = emps.map(x => {
        const e = x.emp;
        return `<tr class="hover:bg-slate-900/50">
            <td class="p-3 font-bold text-white">${e.nombre}</td>
            <td class="p-3 font-mono text-slate-400">${e.cedula || '-'}</td>
            <td class="p-3 text-center font-mono ${e.device_user_id ? 'text-amber-400 font-bold' : 'text-slate-600'}">${e.device_user_id || '—'}</td>
            <td class="p-3 text-center font-mono text-emerald-400 font-bold">${x.asistidos}</td>
            <td class="p-3 text-center font-mono ${x.faltas > 0 ? 'text-rose-400 font-bold' : 'text-slate-500'}">${x.faltas}</td>
            <td class="p-3 text-center font-mono text-sky-400">${x.justificadas}</td>
            <td class="p-3 text-center">${_asistBadgeEstado(x)}</td>
            <td class="p-3 text-right">
                <button onclick="abrirDetalleAsistencia(${e.id})" class="bg-sky-600/20 hover:bg-sky-600/40 text-sky-400 border border-sky-500/30 text-xs px-2.5 py-1 rounded-lg font-medium transition" title="Ver detalle diario"><i class="fa-solid fa-calendar-days mr-1"></i>Detalle</button>
                ${puedeEditar ? `<button onclick="justificarFaltaRapida(${e.id})" class="bg-sky-600/10 hover:bg-sky-600/30 text-sky-300 border border-sky-500/20 text-xs px-2.5 py-1 rounded-lg font-medium transition" title="Registrar justificativo"><i class="fa-solid fa-file-medical"></i></button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

async function abrirDetalleAsistencia(empId) {
    if (!_asistDatosCache) {
        const mes = (gId('asist-mes') && gId('asist-mes').value) || _asistMesActualISO();
        await cargarAsistenciaMes(mes);
    }
    if (!_asistDatosCache) return;

    const item = _asistDatosCache.emps.find(x => String(x.emp.id) === String(empId));
    if (!item) return showToast('Empleado no encontrado en la asistencia del mes', 'error');

    if (gId('asist-det-emp-id')) gId('asist-det-emp-id').value = empId;
    if (gId('asist-det-emp')) gId('asist-det-emp').innerText = item.emp.nombre;
    if (gId('asist-det-mes')) gId('asist-det-mes').innerText = _asistFormatearMes(_asistDatosCache.mes);
    if (gId('asist-det-habiles')) gId('asist-det-habiles').innerText = _asistDatosCache.habiles;
    if (gId('asist-det-asistidos')) gId('asist-det-asistidos').innerText = item.asistidos;
    if (gId('asist-det-faltas')) gId('asist-det-faltas').innerText = item.faltas;
    if (gId('asist-det-justificadas')) gId('asist-det-justificadas').innerText = item.justificadas;
    if (gId('asist-det-device')) gId('asist-det-device').innerText = item.emp.device_user_id || '—';

    renderDetalleAsistencia();
    openModal('modal-asistencia-detalle');
}

function renderDetalleAsistencia() {
    const tbody = gId('tabla-asistencia-detalle-body');
    const empId = gId('asist-det-emp-id') ? gId('asist-det-emp-id').value : null;
    if (!tbody || !_asistDatosCache || !empId) return;

    const item = _asistDatosCache.emps.find(x => String(x.emp.id) === String(empId));
    if (!item) return;

    const puedeEditar = typeof tienePermiso === 'function' ? tienePermiso('asistencia', 'editar') : true;

    if (item.dias.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-500">Sin días hábiles en el período.</td></tr>';
        return;
    }

    tbody.innerHTML = item.dias.map(d => {
        let badge, accion = '<span class="text-slate-600">—</span>';
        if (d.estado === 'asistida') {
            badge = '<span class="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded font-bold">Asistió</span>';
        } else if (d.estado === 'falta') {
            badge = '<span class="text-[10px] bg-rose-950 text-rose-300 border border-rose-800 px-2 py-0.5 rounded font-bold">Falta</span>';
            if (puedeEditar) accion = `<button onclick="justificarFaltaAsistencia('${empId}', '${d.fecha}')" class="bg-sky-600/20 hover:bg-sky-600/40 text-sky-300 border border-sky-500/30 text-[10px] px-2 py-1 rounded font-bold"><i class="fa-solid fa-file-medical mr-1"></i>Justificar</button>`;
        } else if (d.estado === 'justificada') {
            const motivo = d.justificativo?.motivo ? ` title="${String(d.justificativo.motivo).replace(/"/g, '&quot;')}"` : '';
            badge = `<span class="text-[10px] bg-sky-950 text-sky-300 border border-sky-800 px-2 py-0.5 rounded font-bold"${motivo}>Justificada</span>`;
            if (puedeEditar && d.justificativo) accion = `<button onclick="quitarJustificativoAsistencia('${d.justificativo.id}')" class="bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 text-[10px] px-2 py-1 rounded font-bold" title="Quitar justificativo"><i class="fa-solid fa-xmark"></i></button>`;
        } else {
            badge = '<span class="text-[10px] bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded">Sin datos</span>';
        }

        return `<tr class="hover:bg-slate-900/50">
            <td class="p-2.5 font-mono text-slate-300">${_asistFechaCorta(d.fecha)}</td>
            <td class="p-2.5 text-slate-400">${ASIST_DIAS_SEMANA[d.dow]}</td>
            <td class="p-2.5 text-center font-mono text-emerald-400">${d.entrada || '—'}</td>
            <td class="p-2.5 text-center font-mono text-rose-300">${d.salida || '—'}</td>
            <td class="p-2.5 text-center">${badge}</td>
            <td class="p-2.5 text-right">${accion}</td>
        </tr>`;
    }).join('');
}

async function justificarFaltaRapida(empId) {
    return abrirModalJustificativo(empId);
}

function abrirModalJustificativo(empId, fecha) {
    if (typeof tienePermiso === 'function' && !tienePermiso('asistencia', 'editar')) {
        return showToast('No tiene permiso para registrar justificativos', 'error');
    }
    if (!_asistDatosCache) return showToast('Primero cargue la asistencia del mes', 'error');

    const item = _asistDatosCache.emps.find(x => String(x.emp.id) === String(empId));
    if (!item) return showToast('Empleado no encontrado en la asistencia del mes', 'error');

    const pendientes = item.dias.filter(d => d.estado === 'falta');
    if (pendientes.length === 0) {
        return showToast('Este empleado no tiene faltas pendientes en el mes', 'info');
    }

    const sel = gId('just-fecha');
    if (sel) {
        sel.innerHTML = pendientes.map(d =>
            `<option value="${d.fecha}">${_asistFechaCorta(d.fecha)} (${ASIST_DIAS_SEMANA[d.dow]})</option>`
        ).join('');
        if (fecha && pendientes.some(d => d.fecha === fecha)) sel.value = fecha;
    }
    if (gId('just-emp-id')) gId('just-emp-id').value = empId;
    if (gId('just-emp-nombre')) gId('just-emp-nombre').innerText = item.emp.nombre;
    if (gId('just-motivo')) gId('just-motivo').value = '';

    openModal('modal-justificativo-falta');
}

async function justificarFaltaAsistencia(empId, fecha) {
    return abrirModalJustificativo(empId, fecha);
}

async function guardarJustificativoFalta() {
    if (typeof tienePermiso === 'function' && !tienePermiso('asistencia', 'editar')) {
        return showToast('No tiene permiso para registrar justificativos', 'error');
    }

    const empId = gId('just-emp-id') ? gId('just-emp-id').value : '';
    const fecha = gId('just-fecha') ? gId('just-fecha').value : '';
    const motivo = gId('just-motivo') ? gId('just-motivo').value.trim() : '';

    if (!empId || !fecha) return showToast('Indique la fecha de la falta', 'error');
    if (!motivo) return showToast('Indique el motivo del justificativo', 'error');

    const { error } = await supabaseClient.from('justificativos_faltas').insert([{
        empleado_id: parseInt(empId),
        fecha_falta: fecha,
        motivo: motivo
    }]);

    if (error) return showToast('Error al guardar justificativo: ' + error.message, 'error');

    closeModal('modal-justificativo-falta');
    await cargarAsistenciaMes(_asistMesCache, true);
    renderTablaAsistencia();
    if (gId('modal-asistencia-detalle') && !gId('modal-asistencia-detalle').classList.contains('hidden')) {
        renderDetalleAsistencia();
    }
    showToast('Justificativo registrado');
}

async function quitarJustificativoAsistencia(justId) {
    if (typeof tienePermiso === 'function' && !tienePermiso('asistencia', 'editar')) {
        return showToast('No tiene permiso para quitar justificativos', 'error');
    }
    if (!confirm('¿Quitar este justificativo? La falta volverá a contar.')) return;

    const { error } = await supabaseClient.from('justificativos_faltas').delete().eq('id', justId);
    if (error) return showToast('Error al quitar justificativo: ' + error.message, 'error');

    await cargarAsistenciaMes(_asistMesCache, true);
    renderTablaAsistencia();
    renderDetalleAsistencia();
    showToast('Justificativo eliminado');
}

async function recargarAsistencia() {
    await renderModuloAsistencia(true);
    showToast('Asistencia actualizada');
}

/* ============================================================
   CARGA MANUAL DEL REPORTE EXCEL DEL RELOJ (Dahua)
   Columnas esperadas: Tiempo | ID de usuario | Nombre | ...
   Por cada empleado y día se registra la primera marca como
   entrada y la última como salida. Un día con marcas = asistió.
   ============================================================ */

let _asistImport = null;

function _asistNormTxt(s) {
    return String(s == null ? '' : s)
        .trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function _asistDosDigitos(n) {
    return String(n).padStart(2, '0');
}

function _asistParseFechaHora(valor) {
    const conSegundos = (h, m, s) => `${_asistDosDigitos(h)}:${_asistDosDigitos(m)}:${_asistDosDigitos(s || 0)}`;

    if (valor instanceof Date && !isNaN(valor)) {
        return {
            fecha: `${valor.getFullYear()}-${_asistDosDigitos(valor.getMonth() + 1)}-${_asistDosDigitos(valor.getDate())}`,
            hora: conSegundos(valor.getHours(), valor.getMinutes(), valor.getSeconds())
        };
    }
    const s = String(valor == null ? '' : valor).trim();
    if (!s) return null;

    // 2026-04-29 13:24:06  /  2026-04-29T13:24:06
    let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
        return {
            fecha: `${m[1]}-${_asistDosDigitos(m[2])}-${_asistDosDigitos(m[3])}`,
            hora: conSegundos(m[4], m[5], m[6])
        };
    }
    // 29/04/2026 13:24:06  /  29/04/26 13:24
    m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
        const anio = m[3].length === 2 ? '20' + m[3] : m[3];
        return {
            fecha: `${anio}-${_asistDosDigitos(m[2])}-${_asistDosDigitos(m[1])}`,
            hora: conSegundos(m[4], m[5], m[6])
        };
    }
    // 2026-04-29 (sin hora): se ignora, no sirve para entrada/salida
    return null;
}

function _asistMapaEmpleados() {
    const porDevice = new Map();
    (appState.empleados || []).forEach(e => {
        if (e.device_user_id == null || String(e.device_user_id).trim() === '') return;
        const raw = String(e.device_user_id).trim();
        porDevice.set(raw, e);
        const num = parseInt(raw, 10);
        if (!isNaN(num)) porDevice.set(String(num), e);
    });
    return porDevice;
}

function _asistUnirDias(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    const out = new Map(a);
    b.forEach((dia, fecha) => {
        const prev = out.get(fecha);
        if (!prev) { out.set(fecha, dia); return; }
        out.set(fecha, {
            entrada: (!prev.entrada || (dia.entrada && dia.entrada < prev.entrada)) ? dia.entrada : prev.entrada,
            salida: (!prev.salida || (dia.salida && dia.salida > prev.salida)) ? dia.salida : prev.salida,
            count: (prev.count || 0) + (dia.count || 0)
        });
    });
    return out;
}

async function importarExcelAsistencia(ev) {
    const input = ev && ev.target;
    const file = input && input.files && input.files[0];
    if (input) input.value = ''; // permite volver a elegir el mismo archivo
    if (!file) return;

    if (typeof tienePermiso === 'function' && !tienePermiso('asistencia', 'editar')) {
        return showToast('No tiene permiso para importar asistencia', 'error');
    }
    if (typeof XLSX === 'undefined') {
        return showToast('La librería de Excel no está disponible. Verifique la conexión a internet.', 'error');
    }

    showToast('Leyendo ' + file.name + '...');

    try {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const hoja = wb.Sheets[wb.SheetNames[0]];
        if (!hoja) throw new Error('El archivo no contiene hojas');

        const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: '' });
        if (!filas || filas.length < 2) throw new Error('El archivo está vacío');

        // Detectar encabezados (Tiempo / ID de usuario / Nombre)
        let iTiempo = 0, iId = 1, iNombre = 2, filaEncabezado = -1;
        for (let i = 0; i < Math.min(filas.length, 25); i++) {
            const cols = (filas[i] || []).map(_asistNormTxt);
            const t = cols.findIndex(c => c === 'tiempo' || c === 'fecha' || c === 'fecha y hora' || c === 'fecha/hora');
            const id = cols.findIndex(c => c.includes('id de usuario') || c === 'id usuario' || c === 'id' || c === 'user id');
            const nom = cols.findIndex(c => c === 'nombre' || c === 'nombre de usuario' || c === 'empleado');
            if (t >= 0 && id >= 0) {
                iTiempo = t; iId = id; iNombre = nom >= 0 ? nom : -1;
                filaEncabezado = i;
                break;
            }
        }
        if (filaEncabezado < 0) {
            throw new Error('No se encontró el formato esperado (columnas "Tiempo" e "ID de usuario")');
        }

        const grupos = new Map(); // device|fecha -> { device, nombre, fecha, primera, ultima, marcas }
        const diasSet = new Set();
        let totalMarcas = 0, minFecha = null, maxFecha = null;

        for (let i = filaEncabezado + 1; i < filas.length; i++) {
            const fila = filas[i] || [];
            const marca = _asistParseFechaHora(fila[iTiempo]);
            if (!marca) continue;
            const device = String(fila[iId] == null ? '' : fila[iId]).trim();
            if (!device) continue;
            const nombre = iNombre >= 0 ? String(fila[iNombre] || '').trim() : '';

            totalMarcas++;
            diasSet.add(marca.fecha);
            if (!minFecha || marca.fecha < minFecha) minFecha = marca.fecha;
            if (!maxFecha || marca.fecha > maxFecha) maxFecha = marca.fecha;

            const clave = device + '|' + marca.fecha;
            if (!grupos.has(clave)) {
                grupos.set(clave, {
                    device, nombre, fecha: marca.fecha,
                    primera: marca.hora, ultima: marca.hora, marcas: 0
                });
            }
            const g = grupos.get(clave);
            g.marcas++;
            if (marca.hora < g.primera) g.primera = marca.hora;
            if (marca.hora > g.ultima) g.ultima = marca.hora;
            if (!g.nombre && nombre) g.nombre = nombre;
        }

        if (totalMarcas === 0) throw new Error('No se encontraron marcaciones con fecha y hora válidas');

        const porDevice = _asistMapaEmpleados();
        const noEncontrados = new Set();
        const empsEncontrados = new Set();
        grupos.forEach(g => {
            const emp = porDevice.get(g.device);
            if (emp) empsEncontrados.add(String(emp.id));
            else noEncontrados.add(g.device);
        });

        _asistImport = {
            archivo: file.name,
            grupos,
            totalMarcas,
            dias: diasSet.size,
            empleados: empsEncontrados.size,
            minFecha,
            maxFecha,
            noEncontrados: [...noEncontrados].sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0)),
            porDevice
        };

        abrirModalImportacionAsistencia();
    } catch (e) {
        console.error('Error importando Excel de asistencia:', e);
        showToast('No se pudo leer el archivo: ' + (e.message || e), 'error');
    }
}

function abrirModalImportacionAsistencia() {
    if (!_asistImport) return;

    const d = _asistImport;
    if (gId('imp-asist-archivo')) gId('imp-asist-archivo').innerText = d.archivo;
    if (gId('imp-asist-marcas')) gId('imp-asist-marcas').innerText = d.totalMarcas.toLocaleString('es-VE');
    if (gId('imp-asist-dias')) gId('imp-asist-dias').innerText = d.dias.toLocaleString('es-VE');
    if (gId('imp-asist-emps')) gId('imp-asist-emps').innerText = d.empleados;
    if (gId('imp-asist-rango')) gId('imp-asist-rango').innerText = `${_asistFechaCorta(d.minFecha)} - ${_asistFechaCorta(d.maxFecha)}`;

    // Por defecto, el mes que se está consultando en el módulo
    const mes = (gId('asist-mes') && gId('asist-mes').value) || _asistMesActualISO();
    const [y, m] = mes.split('-').map(Number);
    const primero = `${mes}-01`;
    const ultimo = fechaLocalISO(new Date(y, m, 0));
    if (gId('imp-asist-desde')) gId('imp-asist-desde').value = primero;
    if (gId('imp-asist-hasta')) gId('imp-asist-hasta').value = ultimo;

    const wrap = gId('imp-asist-no-encontrados-wrap');
    if (wrap) {
        if (d.noEncontrados.length > 0) {
            wrap.classList.remove('hidden');
            const lista = d.noEncontrados.slice(0, 25).join(', ');
            gId('imp-asist-no-encontrados').innerText = d.noEncontrados.length > 25
                ? `${lista}... (${d.noEncontrados.length} en total)`
                : lista;
        } else {
            wrap.classList.add('hidden');
        }
    }

    if (gId('imp-asist-progress-wrap')) gId('imp-asist-progress-wrap').classList.add('hidden');
    if (gId('imp-asist-progress-bar')) gId('imp-asist-progress-bar').style.width = '0%';
    if (gId('imp-asist-progress-txt')) gId('imp-asist-progress-txt').innerText = '0%';
    if (gId('imp-asist-btn-confirmar')) {
        gId('imp-asist-btn-confirmar').disabled = false;
        gId('imp-asist-btn-confirmar').classList.remove('opacity-50', 'cursor-not-allowed');
    }

    openModal('modal-asistencia-import');
}

function _asistSetProgreso(pct, texto) {
    if (gId('imp-asist-progress-bar')) gId('imp-asist-progress-bar').style.width = Math.max(0, Math.min(100, pct)) + '%';
    if (gId('imp-asist-progress-txt')) gId('imp-asist-progress-txt').innerText = Math.round(pct) + '%';
    if (texto) showToast(texto);
}

async function _asistRegistrosExistentes(desde, hasta) {
    const out = [];
    const page = 1000;
    let from = 0;

    while (true) {
        const { data, error } = await supabaseClient
            .from('asistencia_registros')
            .select('id, device_user_id, fecha_hora')
            .gte('fecha_hora', desde + 'T00:00:00')
            .lte('fecha_hora', hasta + 'T23:59:59')
            .order('id', { ascending: true })
            .range(from, from + page - 1);

        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < page) break;
        from += page;
        if (from > 500000) break;
    }
    return out;
}

async function confirmarImportacionAsistencia() {
    if (typeof tienePermiso === 'function' && !tienePermiso('asistencia', 'editar')) {
        return showToast('No tiene permiso para importar asistencia', 'error');
    }
    if (!_asistImport) return showToast('Primero seleccione un archivo Excel', 'error');

    const desde = gId('imp-asist-desde') ? gId('imp-asist-desde').value : '';
    const hasta = gId('imp-asist-hasta') ? gId('imp-asist-hasta').value : '';
    if (!desde || !hasta) return showToast('Indique el rango de fechas a importar', 'error');
    if (desde > hasta) return showToast('La fecha "desde" no puede ser mayor que "hasta"', 'error');

    const btn = gId('imp-asist-btn-confirmar');
    if (btn) {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
    }
    if (gId('imp-asist-progress-wrap')) gId('imp-asist-progress-wrap').classList.remove('hidden');
    _asistSetProgreso(0);

    try {
        // Construir filas: primera marca = entrada, última = salida
        const filas = [];
        let diasImportar = 0, sinEmpleado = 0;

        _asistImport.grupos.forEach(g => {
            if (g.fecha < desde || g.fecha > hasta) return;
            const emp = _asistImport.porDevice.get(g.device);
            if (!emp) { sinEmpleado++; return; }

            diasImportar++;
            const dev = String(g.device).trim();
            const base = {
                cedula: emp.cedula || null,
                device_user_id: dev,
                device_name: 'Importado Excel',
                device_user_id_num: /^\d+$/.test(dev) ? parseInt(dev, 10) : null
            };

            filas.push({
                ...base,
                fecha_hora: `${g.fecha}T${g.primera}+00:00`,
                tipo: 'entrada'
            });
            if (g.ultima && g.ultima !== g.primera) {
                filas.push({
                    ...base,
                    fecha_hora: `${g.fecha}T${g.ultima}+00:00`,
                    tipo: 'salida'
                });
            }
        });

        if (filas.length === 0) {
            if (gId('imp-asist-progress-wrap')) gId('imp-asist-progress-wrap').classList.add('hidden');
            if (btn) { btn.disabled = false; btn.classList.remove('opacity-50', 'cursor-not-allowed'); }
            return showToast('No hay marcaciones en el rango seleccionado para empleados del sistema', 'info');
        }

        // Evitar duplicados exactos (mismo dispositivo + mismo timestamp)
        _asistSetProgreso(5, 'Revisando registros existentes...');
        const existentes = await _asistRegistrosExistentes(desde, hasta);
        const clavesExistentes = new Set(
            existentes.map(r => String(r.device_user_id || '').trim() + '|' + String(r.fecha_hora || '').substring(0, 19))
        );
        const clavesNuevas = new Set();
        const aInsertar = [];
        let duplicadas = 0;

        filas.forEach(f => {
            const clave = f.device_user_id + '|' + f.fecha_hora.substring(0, 19);
            if (clavesExistentes.has(clave) || clavesNuevas.has(clave)) { duplicadas++; return; }
            clavesNuevas.add(clave);
            aInsertar.push(f);
        });

        if (aInsertar.length === 0) {
            if (gId('imp-asist-progress-wrap')) gId('imp-asist-progress-wrap').classList.add('hidden');
            if (btn) { btn.disabled = false; btn.classList.remove('opacity-50', 'cursor-not-allowed'); }
            closeModal('modal-asistencia-import');
            return showToast(`Todas las marcaciones del rango ya estaban registradas (${duplicadas} duplicadas)`, 'info');
        }

        // Insertar por lotes para no saturar la API
        const lote = 500;
        let insertadas = 0;

        for (let i = 0; i < aInsertar.length; i += lote) {
            const batch = aInsertar.slice(i, i + lote);
            const { error } = await supabaseClient.from('asistencia_registros').insert(batch);
            if (error) throw new Error(`Error al guardar (lote ${Math.floor(i / lote) + 1}): ${error.message}`);

            insertadas += batch.length;
            _asistSetProgreso(10 + (insertadas / aInsertar.length) * 90);
            await new Promise(r => setTimeout(r, 0));
        }

        _asistSetProgreso(100);
        closeModal('modal-asistencia-import');

        _asistMesCache = null;
        _asistDatosCache = null;
        await renderModuloAsistencia(true);

        const extras = [];
        if (duplicadas > 0) extras.push(`${duplicadas} duplicadas omitidas`);
        if (sinEmpleado > 0) extras.push(`${sinEmpleado} días sin empleado`);
        showToast(`Importación completa: ${insertadas} marcaciones en ${diasImportar} días${extras.length ? ` (${extras.join(', ')})` : ''}`);
    } catch (e) {
        console.error('Error importando asistencia:', e);
        showToast('Error al importar: ' + (e.message || e), 'error');
        if (gId('imp-asist-progress-wrap')) gId('imp-asist-progress-wrap').classList.add('hidden');
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }
}

async function aplicarAsistenciaDesdeModulo() {
    if (typeof tienePermiso === 'function' && !tienePermiso('nomina', 'editar')) {
        return showToast('No tiene permiso para modificar la nómina', 'error');
    }
    await switchTab('nomina');
    await aplicarAsistenciaANomina();
}