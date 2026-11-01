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

        const asistidosSet = (e.device_user_id && diasAsistidos[String(e.device_user_id).trim()])
            || (e.cedula && diasAsistidosCedula[String(e.cedula).trim()])
            || null;

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
        if (String(r.tipo || '').toLowerCase() === 'salida') {
            if (!dia.salida || hora > dia.salida) dia.salida = hora;
        } else if (!dia.entrada || hora < dia.entrada) {
            dia.entrada = hora;
        }
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
        const dayMap = deviceMap || cedMap;
        const fuente = deviceMap ? 'device' : (cedMap ? 'cedula' : null);
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
                salida: reg ? reg.salida : null,
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

async function aplicarAsistenciaDesdeModulo() {
    if (typeof tienePermiso === 'function' && !tienePermiso('nomina', 'editar')) {
        return showToast('No tiene permiso para modificar la nómina', 'error');
    }
    await switchTab('nomina');
    await aplicarAsistenciaANomina();
}