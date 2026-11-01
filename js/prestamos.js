/* ============================================================
   js/prestamos.js
   Préstamos, anticipos, abonos y recibos (Bloque 2C).

   Tablas Supabase:
   - prestamos_anticipos: id, empleado_id, tipo, monto_total,
     monto_abonado, saldo_pendiente, tasa_bcv, estado,
     fecha_otorgamiento, observaciones, created_at.
   - prestamos_abonos: id, prestamo_id, monto, tasa_bcv,
     fecha_pago, origen ('nomina'|'manual'|'externo'), nomina_id.

   Reglas:
   - El abono por nómina NO genera recibo aparte: se refleja en el
     recibo de nómina y queda vinculado con nomina_id (lote UUID).
   - Los abonos manuales/externos SÍ generan recibo.
   - La diferencia no descontada permanece en saldo_pendiente.
   ============================================================ */

let _debouncePrestamoTimer = null;
let _prestamosCargados = false;

/* ---------------- HELPERS DE DATOS ---------------- */

function _uuidPrestamo() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function obtenerAnticiposEmpleado(empId) {
    return (appState.anticipos || []).filter(a => String(a.empleado_id) === String(empId));
}

function totalAnticiposBs(empId) {
    return obtenerAnticiposEmpleado(empId).reduce((s, a) => s + Number(a.monto_bs || 0), 0);
}

function obtenerPrestamosEmpleado(empId) {
    return (appState.prestamos || []).filter(p => String(p.empleado_id) === String(empId));
}

function obtenerPrestamosActivosEmpleado(empId) {
    return obtenerPrestamosEmpleado(empId)
        .filter(p => Number(p.saldo_pendiente) > 0.009)
        .sort((a, b) => {
            const fa = new Date(a.fecha_otorgamiento || a.created_at || 0).getTime();
            const fb = new Date(b.fecha_otorgamiento || b.created_at || 0).getTime();
            return fa - fb;
        });
}

function obtenerAbonosPrestamo(prestamoId) {
    return (appState.prestamosAbonos || [])
        .filter(a => String(a.prestamo_id) === String(prestamoId))
        .sort((a, b) => new Date(b.fecha_pago || b.created_at || 0) - new Date(a.fecha_pago || a.created_at || 0));
}

function obtenerAbonosEmpleado(empId) {
    const ids = new Set(obtenerPrestamosEmpleado(empId).map(p => String(p.id)));
    return (appState.prestamosAbonos || [])
        .filter(a => ids.has(String(a.prestamo_id)))
        .sort((a, b) => new Date(b.fecha_pago || b.created_at || 0) - new Date(a.fecha_pago || a.created_at || 0));
}

/**
 * Saldo total de préstamos del empleado.
 * Si hay préstamos cargados, suma saldo_pendiente.
 * Si no hay filas (empresa con saldo legado), usa empleados.saldo_prestamo.
 */
function saldoPrestamosEmpleado(empId) {
    const prestamos = obtenerPrestamosEmpleado(empId);
    if (prestamos.length > 0) {
        return prestamos.reduce((s, p) => s + Math.max(0, Number(p.saldo_pendiente) || 0), 0);
    }
    const emp = appState.empleados.find(e => String(e.id) === String(empId));
    return Math.max(0, Number(emp?.saldo_prestamo) || 0);
}

function totalAbonadoEmpleado(empId) {
    return obtenerPrestamosEmpleado(empId).reduce((s, p) => s + Math.max(0, Number(p.monto_abonado) || 0), 0);
}

function persistirPrestamosLocal() {
    try {
        localStorage.setItem('nomina_prestamos_cache', JSON.stringify(appState.prestamos || []));
        localStorage.setItem('nomina_prestamos_abonos_cache', JSON.stringify(appState.prestamosAbonos || []));
    } catch (e) {}
}

async function cargarPrestamosYAbonos(force = false) {
    if (!force && _prestamosCargados) return;

    const [pres, abonos] = await Promise.all([
        safeQuery(
            supabaseClient.from('prestamos_anticipos').select('*').order('fecha_otorgamiento', { ascending: false }),
            'prestamos_anticipos'
        ),
        safeQuery(
            supabaseClient.from('prestamos_abonos').select('*').order('fecha_pago', { ascending: false }),
            'prestamos_abonos'
        )
    ]);

    if (Array.isArray(pres)) appState.prestamos = pres;
    if (Array.isArray(abonos)) appState.prestamosAbonos = abonos;
    _prestamosCargados = Array.isArray(pres) || Array.isArray(abonos);
    persistirPrestamosLocal();
}

/**
 * Migra el saldo legado (empleados.saldo_prestamo) a una fila de
 * prestamos_anticipos cuando el empleado aún no tiene préstamos formales.
 * Evita perder el saldo histórico al registrar el primer préstamo nuevo.
 * Devuelve la fila creada o null.
 */
async function migrarSaldoLegadoEmpleado(empId) {
    const emp = appState.empleados.find(e => String(e.id) === String(empId));
    if (!emp) return null;

    const legado = Number(emp.saldo_prestamo) || 0;
    if (legado <= 0.009) return null;
    if (obtenerPrestamosEmpleado(empId).length > 0) return null;

    const fila = {
        id: _uuidPrestamo(),
        empleado_id: parseInt(empId),
        tipo: 'prestamo',
        monto_total: legado,
        monto_abonado: 0,
        saldo_pendiente: legado,
        tasa_bcv: null,
        estado: 'activo',
        fecha_otorgamiento: fechaLocalISO(new Date()),
        observaciones: 'Saldo inicial (migrado del control anterior)'
    };

    const insertado = await safeQuery(
        supabaseClient.from('prestamos_anticipos').insert([fila]).select(),
        'migrar_saldo_legado'
    );

    const registro = (insertado && insertado[0]) ? insertado[0] : { ...fila, _local: true };
    if (!Array.isArray(appState.prestamos)) appState.prestamos = [];
    appState.prestamos.unshift(registro);
    return registro;
}

/**
 * Convierte el saldo pendiente de TODOS los empleados (empleados.saldo_prestamo)
 * en un préstamo activo "Saldo inicial", para que aparezca en la tabla y en el
 * detalle como si se hubiera otorgado hoy. Es idempotente: no duplica si el
 * empleado ya tiene préstamos formales.
 */
async function migrarSaldosInicialesTodos() {
    if (typeof tienePermiso === 'function' && !tienePermiso('prestamos', 'crear')) {
        return { creados: 0, error: 'sin_permiso' };
    }

    if (typeof cargarPrestamosYAbonos === 'function') {
        try { await cargarPrestamosYAbonos(true); } catch (e) {}
    }

    const tasa = parseFloat(gId('nom-tasa-bcv')?.value)
        || parseFloat(gId('uti-tasa-bcv')?.value)
        || null;
    const hoy = fechaLocalISO(new Date());

    const filas = [];
    for (const emp of (appState.empleados || [])) {
        const saldo = Number(emp.saldo_prestamo) || 0;
        if (saldo <= 0.009) continue;
        if (obtenerPrestamosEmpleado(emp.id).length > 0) continue;

        filas.push({
            id: _uuidPrestamo(),
            empleado_id: parseInt(emp.id),
            tipo: 'prestamo',
            monto_total: saldo,
            monto_abonado: 0,
            saldo_pendiente: saldo,
            tasa_bcv: tasa && tasa > 0 ? tasa : null,
            estado: 'activo',
            fecha_otorgamiento: hoy,
            observaciones: 'Saldo inicial (migrado del control anterior)'
        });
    }

    if (filas.length === 0) return { creados: 0 };

    const insertados = await safeQuery(
        supabaseClient.from('prestamos_anticipos').insert(filas).select(),
        'migrar_saldos_iniciales'
    );

    const registros = (Array.isArray(insertados) && insertados.length > 0)
        ? insertados
        : filas.map(f => ({ ...f, _local: true }));

    if (!Array.isArray(appState.prestamos)) appState.prestamos = [];
    appState.prestamos = registros.concat(appState.prestamos);
    persistirPrestamosLocal();

    return {
        creados: registros.filter(r => !r._local).length,
        locales: registros.filter(r => r._local).length
    };
}

async function sincronizarSaldoEmpleado(empId) {
    const emp = appState.empleados.find(e => String(e.id) === String(empId));
    if (!emp) return;

    // Solo sincronizamos si el empleado tiene préstamos formales.
    // Si no, respetamos el saldo legado de empleados.saldo_prestamo.
    if (obtenerPrestamosEmpleado(empId).length === 0) return;

    const nuevoSaldo = saldoPrestamosEmpleado(empId);
    emp.saldo_prestamo = nuevoSaldo;
    await safeQuery(
        supabaseClient.from('empleados').update({ saldo_prestamo: nuevoSaldo }).eq('id', empId),
        'sync_saldo_prestamo'
    );
}

/* ---------------- TABLA PRINCIPAL ---------------- */

async function renderTablaPrestamos() {
    const tbody = gId('tabla-prestamos-body');
    if (!tbody) return;

    try { await cargarPrestamosYAbonos(false); } catch (e) {}

    const emps = appState.empleados || [];
    if (emps.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-slate-500">No hay empleados registrados.</td></tr>';
        return;
    }

    const puedeEditar = typeof tienePermiso === 'function' ? tienePermiso('prestamos', 'editar') : true;

    tbody.innerHTML = emps.map(e => {
        const activos = obtenerPrestamosActivosEmpleado(e.id);
        const saldo = saldoPrestamosEmpleado(e.id);
        const abonado = totalAbonadoEmpleado(e.id);
        const totalBs = totalAnticiposBs(e.id);
        const count = activos.length;

        const badgeCount = count > 0
            ? `<span class="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded font-bold">${count} activo(s)</span>`
            : `<span class="text-[10px] bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded">Sin préstamos</span>`;

        return `<tr class="hover:bg-slate-900/50">
            <td class="p-3.5 font-bold text-white">${e.nombre}</td>
            <td class="p-3.5 font-mono text-slate-400">${e.cedula || '-'}</td>
            <td class="p-3.5 text-center">${badgeCount}</td>
            <td class="p-3.5 font-mono font-bold ${saldo > 0 ? 'text-emerald-400' : 'text-slate-500'}">$${saldo.toFixed(2)}</td>
            <td class="p-3.5 font-mono text-cyan-300">$${abonado.toFixed(2)}</td>
            <td class="p-3.5">
                <div class="text-cyan-300 font-mono font-bold text-xs">Bs. ${fNum(totalBs)}</div>
                <div class="text-[10px] text-slate-500">${obtenerAnticiposEmpleado(e.id).length} anticipo(s) de prestaciones</div>
            </td>
            <td class="p-3.5 text-right space-x-1">
                ${puedeEditar ? `<button onclick="abrirModalDetallePrestamos(${e.id})" class="bg-sky-600/20 hover:bg-sky-600/40 text-sky-400 border border-sky-500/30 text-xs px-3 py-1.5 rounded-lg font-medium transition" title="Ver préstamos y registrar abonos"><i class="fa-solid fa-list mr-1"></i>Ver / Abonar</button>` : ''}
                <button onclick="abrirModalAnticipos(${e.id})" class="bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-400 border border-cyan-500/30 text-xs px-3 py-1.5 rounded-lg font-medium transition" title="Anticipos de prestaciones (LOTTT Art. 144)"><i class="fa-solid fa-hand-holding-dollar mr-1"></i>Anticipos</button>
            </td>
        </tr>`;
    }).join('');
}

/* Compatibilidad con llamadas antiguas: sincroniza el saldo desde los préstamos */
async function guardarPrestamoFila(empId) {
    await sincronizarSaldoEmpleado(empId);
    renderTablaPrestamos();
    showToast('Saldo sincronizado desde los préstamos');
}

/* ---------------- NUEVO PRÉSTAMO / ANTICIPO ---------------- */

function abrirModalNuevoPrestamo(empId) {
    if (typeof tienePermiso === 'function' && !tienePermiso('prestamos', 'crear')) {
        return showToast('No tiene permiso para crear préstamos', 'error');
    }

    const sel = gId('pres-nuevo-empleado');
    if (sel) {
        sel.innerHTML = '<option value="">-- Seleccionar empleado --</option>' +
            (appState.empleados || []).filter(e => e.activo).map(e =>
                `<option value="${e.id}">${e.nombre} (${e.cedula || '-'})</option>`
            ).join('');
        sel.value = empId ? String(empId) : '';
    }

    const tasa = gId('nom-tasa-bcv')?.value || gId('uti-tasa-bcv')?.value || '';
    if (gId('pres-nuevo-tipo')) gId('pres-nuevo-tipo').value = 'prestamo';
    if (gId('pres-nuevo-monto')) gId('pres-nuevo-monto').value = '';
    if (gId('pres-nuevo-tasa')) gId('pres-nuevo-tasa').value = tasa;
    if (gId('pres-nuevo-fecha')) gId('pres-nuevo-fecha').value = fechaLocalISO(new Date());
    if (gId('pres-nuevo-observaciones')) gId('pres-nuevo-observaciones').value = '';

    openModal('modal-prestamo-nuevo');
}

async function guardarNuevoPrestamo() {
    if (typeof tienePermiso === 'function' && !tienePermiso('prestamos', 'crear')) {
        return showToast('No tiene permiso para crear préstamos', 'error');
    }

    const empId = gId('pres-nuevo-empleado')?.value;
    const tipo = gId('pres-nuevo-tipo')?.value || 'prestamo';
    const monto = parseFloat(gId('pres-nuevo-monto')?.value) || 0;
    const tasa = parseFloat(gId('pres-nuevo-tasa')?.value) || 0;
    const fecha = gId('pres-nuevo-fecha')?.value;
    const obs = gId('pres-nuevo-observaciones')?.value.trim() || null;

    if (!empId) return showToast('Seleccione un empleado', 'error');
    if (monto <= 0) return showToast('El monto debe ser mayor a 0', 'error');
    if (!fecha) return showToast('Indique la fecha de otorgamiento', 'error');

    // Preservar saldo legado antes de crear el primer préstamo formal.
    try { await migrarSaldoLegadoEmpleado(empId); } catch (e) {
        console.warn('[Préstamos] No se pudo migrar el saldo legado:', e);
    }

    const fila = {
        id: _uuidPrestamo(),
        empleado_id: parseInt(empId),
        tipo,
        monto_total: monto,
        monto_abonado: 0,
        saldo_pendiente: monto,
        tasa_bcv: tasa > 0 ? tasa : null,
        estado: 'activo',
        fecha_otorgamiento: fecha,
        observaciones: obs
    };

    const insertado = await safeQuery(
        supabaseClient.from('prestamos_anticipos').insert([fila]).select(),
        'insert_prestamo_anticipo'
    );

    const registro = (insertado && insertado[0]) ? insertado[0] : { ...fila, _local: true };
    if (!Array.isArray(appState.prestamos)) appState.prestamos = [];
    appState.prestamos.unshift(registro);

    // Solo sincronizamos el saldo si el préstamo quedó realmente en Supabase.
    if (!registro._local) await sincronizarSaldoEmpleado(empId);
    persistirPrestamosLocal();

    closeModal('modal-prestamo-nuevo');
    await renderTablaPrestamos();

    // Si el modal de detalle estaba abierto, refrescarlo con el nuevo préstamo.
    if (gId('pres-detalle-emp-id')?.value && !gId('modal-prestamo-detalle')?.classList.contains('hidden')) {
        renderDetallePrestamos();
    }

    verReciboPrestamo(registro.id);

    if (registro._local) {
        showToast('Préstamo guardado LOCAL (Supabase no respondió). Se reintentará al sincronizar.', 'error');
    } else {
        showToast('Préstamo registrado. Recibo de entrega generado.');
    }
}

/* ---------------- DETALLE DE PRÉSTAMOS Y ABONOS ---------------- */

function abrirModalDetallePrestamos(empId) {
    const emp = appState.empleados.find(e => String(e.id) === String(empId));
    if (!emp) return showToast('Empleado no encontrado', 'error');

    if (gId('pres-detalle-emp-id')) gId('pres-detalle-emp-id').value = empId;
    if (gId('pres-detalle-emp')) gId('pres-detalle-emp').innerText = emp.nombre;

    renderDetallePrestamos();
    openModal('modal-prestamo-detalle');
}

function renderDetallePrestamos() {
    const empId = gId('pres-detalle-emp-id')?.value;
    if (!empId) return;

    const emp = appState.empleados.find(e => String(e.id) === String(empId));
    const prestamos = obtenerPrestamosEmpleado(empId)
        .sort((a, b) => new Date(b.fecha_otorgamiento || 0) - new Date(a.fecha_otorgamiento || 0));
    const abonos = obtenerAbonosEmpleado(empId);

    const saldo = saldoPrestamosEmpleado(empId);
    const abonado = totalAbonadoEmpleado(empId);
    const total = prestamos.reduce((s, p) => s + Number(p.monto_total || 0), 0);

    if (gId('pres-detalle-saldo')) gId('pres-detalle-saldo').innerText = `$${saldo.toFixed(2)}`;
    if (gId('pres-detalle-abonado')) gId('pres-detalle-abonado').innerText = `$${abonado.toFixed(2)}`;
    if (gId('pres-detalle-total')) gId('pres-detalle-total').innerText = `$${total.toFixed(2)}`;

    const tbodyP = gId('tabla-prestamos-detalle-body');
    if (tbodyP) {
        if (prestamos.length === 0) {
            tbodyP.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-slate-500">No hay préstamos registrados para este empleado.</td></tr>';
        } else {
            tbodyP.innerHTML = prestamos.map(p => {
                const saldoP = Math.max(0, Number(p.saldo_pendiente) || 0);
                const estado = saldoP <= 0.009
                    ? '<span class="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded font-bold">Pagado</span>'
                    : '<span class="text-[10px] bg-amber-950 text-amber-300 border border-amber-800 px-2 py-0.5 rounded font-bold">Activo</span>';
                return `<tr class="hover:bg-slate-900/50">
                    <td class="p-2.5 text-slate-300 font-mono">${p.fecha_otorgamiento || '-'}</td>
                    <td class="p-2.5 text-white font-semibold uppercase">${p.tipo || 'préstamo'}${/saldo inicial/i.test(p.observaciones || '') ? ' <span class="ml-1 text-[9px] bg-amber-950 text-amber-300 border border-amber-800 px-1.5 py-0.5 rounded font-bold normal-case">Inicial</span>' : ''}</td>
                    <td class="p-2.5 text-right font-mono text-slate-300">$${Number(p.monto_total || 0).toFixed(2)}</td>
                    <td class="p-2.5 text-right font-mono text-cyan-300">$${Number(p.monto_abonado || 0).toFixed(2)}</td>
                    <td class="p-2.5 text-right font-mono font-bold ${saldoP > 0 ? 'text-emerald-400' : 'text-slate-500'}">$${saldoP.toFixed(2)}</td>
                    <td class="p-2.5 text-center">${estado}</td>
                    <td class="p-2.5 text-right space-x-1">
                        ${saldoP > 0 ? `<button onclick="abrirModalAbono('${p.id}')" class="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 text-xs px-2.5 py-1 rounded-lg font-medium transition" title="Registrar abono"><i class="fa-solid fa-plus"></i></button>` : ''}
                        <button onclick="verReciboPrestamo('${p.id}')" class="bg-sky-600/20 hover:bg-sky-600/40 text-sky-400 border border-sky-500/30 text-xs px-2.5 py-1 rounded-lg font-medium transition" title="Recibo de entrega"><i class="fa-solid fa-receipt"></i></button>
                        <button onclick="abrirModalFirmaPrestamo('${p.id}')" class="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/30 text-xs px-2.5 py-1 rounded-lg font-medium transition" title="Firma digital (WhatsApp)"><i class="fa-solid fa-file-signature"></i></button>
                        <button onclick="enviarWhatsAppPrestamo('${p.id}')" class="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 text-xs px-2.5 py-1 rounded-lg font-medium transition" title="Enviar recibo por WhatsApp"><i class="fa-brands fa-whatsapp"></i></button>
                    </td>
                </tr>`;
            }).join('');
        }
    }

    const tbodyA = gId('tabla-abonos-detalle-body');
    if (tbodyA) {
        if (abonos.length === 0) {
            tbodyA.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-500">No hay abonos registrados.</td></tr>';
        } else {
            const puedeBorrar = typeof tienePermiso === 'function' ? tienePermiso('prestamos', 'borrar') : true;
            tbodyA.innerHTML = abonos.map(a => {
                const p = (appState.prestamos || []).find(x => String(x.id) === String(a.prestamo_id));
                const origenBadge = a.origen === 'nomina'
                    ? '<span class="text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded font-bold">Nómina</span>'
                    : (a.origen === 'externo'
                        ? '<span class="text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800 px-2 py-0.5 rounded font-bold">Externo</span>'
                        : '<span class="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded font-bold">Manual</span>');
                const puedeEliminar = puedeBorrar && a.origen !== 'nomina';
                return `<tr class="hover:bg-slate-900/50">
                    <td class="p-2.5 text-slate-300 font-mono">${a.fecha_pago || '-'}</td>
                    <td class="p-2.5 text-slate-400 text-[11px]">${p ? `${p.fecha_otorgamiento || '-'} / ${p.tipo || 'préstamo'}` : '-'}</td>
                    <td class="p-2.5 text-right font-mono font-bold text-emerald-400">$${Number(a.monto || 0).toFixed(2)}</td>
                    <td class="p-2.5 text-right font-mono text-slate-300">${Number(a.tasa_bcv || 0).toFixed(2)}</td>
                    <td class="p-2.5 text-center">${origenBadge}</td>
                    <td class="p-2.5 text-right space-x-1">
                        <button onclick="verReciboAbono('${a.id}')" class="bg-sky-600/20 hover:bg-sky-600/40 text-sky-400 border border-sky-500/30 text-xs px-2.5 py-1 rounded-lg font-medium transition" title="Recibo de abono"><i class="fa-solid fa-receipt"></i></button>
                        ${puedeEliminar ? `<button onclick="eliminarAbonoPrestamo('${a.id}')" class="bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 border border-rose-500/30 text-xs px-2.5 py-1 rounded-lg font-medium transition" title="Eliminar abono"><i class="fa-solid fa-trash"></i></button>` : ''}
                    </td>
                </tr>`;
            }).join('');
        }
    }
}

/* ---------------- ABONOS ---------------- */

function abrirModalAbono(prestamoId) {
    if (typeof tienePermiso === 'function' && !tienePermiso('prestamos', 'editar') && !tienePermiso('prestamos', 'crear')) {
        return showToast('No tiene permiso para registrar abonos', 'error');
    }

    const p = (appState.prestamos || []).find(x => String(x.id) === String(prestamoId));
    if (!p) return showToast('Préstamo no encontrado', 'error');
    if (p._local) return showToast('Este préstamo aún no está sincronizado con Supabase. Use "Sincronizar" antes de abonar.', 'error');

    const emp = appState.empleados.find(e => String(e.id) === String(p.empleado_id));
    const saldo = Math.max(0, Number(p.saldo_pendiente) || 0);
    if (saldo <= 0.009) return showToast('Este préstamo ya está pagado', 'error');

    if (gId('pres-abono-prestamo-id')) gId('pres-abono-prestamo-id').value = prestamoId;
    if (gId('pres-abono-emp')) gId('pres-abono-emp').innerText = emp ? emp.nombre : '-';
    if (gId('pres-abono-saldo-max')) gId('pres-abono-saldo-max').innerText = `$${saldo.toFixed(2)}`;
    if (gId('pres-abono-monto')) gId('pres-abono-monto').value = saldo.toFixed(2);
    if (gId('pres-abono-tasa')) gId('pres-abono-tasa').value = Number(p.tasa_bcv || gId('nom-tasa-bcv')?.value || 0).toFixed(2);
    if (gId('pres-abono-fecha')) gId('pres-abono-fecha').value = fechaLocalISO(new Date());
    if (gId('pres-abono-origen')) gId('pres-abono-origen').value = 'manual';

    openModal('modal-prestamo-abono');
}

async function guardarAbonoPrestamo() {
    const prestamoId = gId('pres-abono-prestamo-id')?.value;
    const monto = parseFloat(gId('pres-abono-monto')?.value) || 0;
    const tasa = parseFloat(gId('pres-abono-tasa')?.value) || 0;
    const fecha = gId('pres-abono-fecha')?.value;
    const origen = gId('pres-abono-origen')?.value || 'manual';

    const p = (appState.prestamos || []).find(x => String(x.id) === String(prestamoId));
    if (!p) return showToast('Préstamo no encontrado', 'error');
    if (p._local) return showToast('Este préstamo aún no está sincronizado con Supabase. No se puede abonar todavía.', 'error');
    if (monto <= 0) return showToast('El monto del abono debe ser mayor a 0', 'error');
    if (!fecha) return showToast('Indique la fecha del abono', 'error');

    const saldo = Math.max(0, Number(p.saldo_pendiente) || 0);
    if (monto > saldo + 0.009) {
        return showToast(`El abono no puede superar el saldo pendiente ($${saldo.toFixed(2)})`, 'error');
    }

    const abono = {
        id: _uuidPrestamo(),
        prestamo_id: p.id,
        monto,
        tasa_bcv: tasa > 0 ? tasa : null,
        fecha_pago: fecha,
        origen,
        nomina_id: null
    };

    const insertado = await safeQuery(
        supabaseClient.from('prestamos_abonos').insert([abono]).select(),
        'insert_abono_prestamo'
    );
    const registro = (insertado && insertado[0]) ? insertado[0] : null;

    // Si el abono no se pudo guardar, NO se toca el saldo del préstamo.
    if (!registro) {
        return showToast('No se pudo guardar el abono en Supabase. El saldo del préstamo no fue modificado.', 'error');
    }

    if (!Array.isArray(appState.prestamosAbonos)) appState.prestamosAbonos = [];
    appState.prestamosAbonos.unshift(registro);

    p.monto_abonado = (Number(p.monto_abonado) || 0) + monto;
    p.saldo_pendiente = Math.max(0, saldo - monto);
    p.estado = p.saldo_pendiente <= 0.009 ? 'pagado' : 'activo';

    await safeQuery(
        supabaseClient.from('prestamos_anticipos').update({
            monto_abonado: p.monto_abonado,
            saldo_pendiente: p.saldo_pendiente,
            estado: p.estado
        }).eq('id', p.id),
        'update_saldo_prestamo'
    );

    await sincronizarSaldoEmpleado(p.empleado_id);
    persistirPrestamosLocal();

    closeModal('modal-prestamo-abono');
    renderDetallePrestamos();
    renderTablaPrestamos();
    verReciboAbono(registro.id);
    showToast('Abono registrado. Recibo generado.');
}

async function eliminarAbonoPrestamo(abonoId) {
    if (typeof tienePermiso === 'function' && !tienePermiso('prestamos', 'borrar')) {
        return showToast('No tiene permiso para eliminar abonos', 'error');
    }

    const a = (appState.prestamosAbonos || []).find(x => String(x.id) === String(abonoId));
    if (!a) return showToast('Abono no encontrado', 'error');
    if (a.origen === 'nomina') {
        return showToast('Este abono proviene de una nómina. Elimine la nómina procesada para revertirlo.', 'error');
    }
    if (!confirm(`¿Eliminar el abono de $${Number(a.monto || 0).toFixed(2)} del ${a.fecha_pago}?`)) return;

    await safeQuery(supabaseClient.from('prestamos_abonos').delete().eq('id', abonoId), 'delete_abono_prestamo');

    const p = (appState.prestamos || []).find(x => String(x.id) === String(a.prestamo_id));
    if (p) {
        p.monto_abonado = Math.max(0, (Number(p.monto_abonado) || 0) - Number(a.monto || 0));
        p.saldo_pendiente = (Number(p.saldo_pendiente) || 0) + Number(a.monto || 0);
        p.estado = 'activo';
        await safeQuery(
            supabaseClient.from('prestamos_anticipos').update({
                monto_abonado: p.monto_abonado,
                saldo_pendiente: p.saldo_pendiente,
                estado: p.estado
            }).eq('id', p.id),
            'revert_saldo_prestamo'
        );
        await sincronizarSaldoEmpleado(p.empleado_id);
    }

    appState.prestamosAbonos = (appState.prestamosAbonos || []).filter(x => String(x.id) !== String(abonoId));
    persistirPrestamosLocal();
    renderDetallePrestamos();
    renderTablaPrestamos();
    showToast('Abono eliminado y saldo restituido');
}

/* ---------------- INTEGRACIÓN CON NÓMINA ---------------- */

function obtenerLoteNominaUUID(n) {
    if (!n) return null;
    let d = n.detalle_calculo;
    if (typeof d === 'string') {
        try { d = JSON.parse(d); } catch (e) { d = null; }
    }
    return (d && d.lote_uuid) ? String(d.lote_uuid) : null;
}

/**
 * Aplica los descuentos de préstamos de una nómina:
 * - Reparte el monto descontado entre los préstamos activos (más antiguo primero).
 * - Registra un abono por cada préstamo con origen='nomina' y nomina_id=loteUUID.
 * - NO genera recibo extra (el recibo de nómina ya muestra el descuento).
 * - Lo que no se descuente queda en saldo_pendiente.
 */
async function aplicarAbonosNomina(regs, loteUUID, tasa, fechaPago) {
    if (!Array.isArray(regs) || regs.length === 0) return;

    const abonos = [];
    const updates = [];
    const empsTocados = new Set();

    for (const r of regs) {
        const pr = Number(r.prestamos) || 0;
        if (pr <= 0) continue;

        const empId = r.empleado_id;
        const prestamos = obtenerPrestamosActivosEmpleado(empId);
        let restante = pr;

        if (prestamos.length === 0) {
            // Compatibilidad con saldo legado en empleados.saldo_prestamo
            const emp = appState.empleados.find(e => String(e.id) === String(empId));
            if (emp) {
                emp.saldo_prestamo = Math.max(0, (Number(emp.saldo_prestamo) || 0) - pr);
                updates.push(supabaseClient.from('empleados').update({ saldo_prestamo: emp.saldo_prestamo }).eq('id', emp.id));
            }
            continue;
        }

        for (const p of prestamos) {
            if (restante <= 0.009) break;
            const saldo = Math.max(0, Number(p.saldo_pendiente) || 0);
            if (saldo <= 0.009) continue;

            const monto = Math.min(saldo, restante);
            abonos.push({
                id: _uuidPrestamo(),
                prestamo_id: p.id,
                monto,
                tasa_bcv: tasa > 0 ? tasa : null,
                fecha_pago: fechaPago,
                origen: 'nomina',
                nomina_id: loteUUID
            });

            p.monto_abonado = (Number(p.monto_abonado) || 0) + monto;
            p.saldo_pendiente = Math.max(0, saldo - monto);
            p.estado = p.saldo_pendiente <= 0.009 ? 'pagado' : 'activo';

            updates.push(supabaseClient.from('prestamos_anticipos').update({
                monto_abonado: p.monto_abonado,
                saldo_pendiente: p.saldo_pendiente,
                estado: p.estado
            }).eq('id', p.id));

            restante -= monto;
        }

        // El saldo del empleado siempre refleja la suma de préstamos activos
        const emp = appState.empleados.find(e => String(e.id) === String(empId));
        if (emp) {
            emp.saldo_prestamo = saldoPrestamosEmpleado(empId);
            updates.push(supabaseClient.from('empleados').update({ saldo_prestamo: emp.saldo_prestamo }).eq('id', emp.id));
            empsTocados.add(String(empId));
        }
    }

    if (abonos.length > 0) {
        const insertados = await safeQuery(
            supabaseClient.from('prestamos_abonos').insert(abonos).select(),
            'insert_abonos_nomina'
        );
        if (Array.isArray(insertados) && insertados.length > 0) {
            appState.prestamosAbonos = (appState.prestamosAbonos || []).concat(insertados);
        } else {
            appState.prestamosAbonos = (appState.prestamosAbonos || []).concat(
                abonos.map(a => ({ ...a, _local: true }))
            );
        }
    }

    if (updates.length > 0) await Promise.all(updates);
    persistirPrestamosLocal();
    return { abonos: abonos.length, empleados: empsTocados.size };
}

/**
 * Revierte los abonos de una nómina (al eliminar o editar la nómina).
 * Si se indica empId, revierte solo los abonos de los préstamos de ese
 * empleado dentro del lote (necesario al editar una fila de la nómina).
 * Devuelve true si encontró y revirtió al menos un abono.
 */
async function revertirAbonosNomina(nomina, empId = null) {
    const lote = obtenerLoteNominaUUID(nomina);
    if (!lote) return false;

    let abonos = (appState.prestamosAbonos || []).filter(a => String(a.nomina_id) === String(lote));

    if (empId !== null && empId !== undefined) {
        abonos = abonos.filter(a => {
            const p = (appState.prestamos || []).find(x => String(x.id) === String(a.prestamo_id));
            return p && String(p.empleado_id) === String(empId);
        });
    }

    if (abonos.length === 0) return false;

    const ids = abonos.map(a => a.id);
    await safeQuery(
        supabaseClient.from('prestamos_abonos').delete().in('id', ids),
        'delete_abonos_nomina'
    );

    const updates = [];
    const emps = new Set();

    for (const a of abonos) {
        const p = (appState.prestamos || []).find(x => String(x.id) === String(a.prestamo_id));
        if (!p) continue;
        const monto = Number(a.monto) || 0;
        p.monto_abonado = Math.max(0, (Number(p.monto_abonado) || 0) - monto);
        p.saldo_pendiente = (Number(p.saldo_pendiente) || 0) + monto;
        p.estado = p.saldo_pendiente <= 0.009 ? 'pagado' : 'activo';
        updates.push(supabaseClient.from('prestamos_anticipos').update({
            monto_abonado: p.monto_abonado,
            saldo_pendiente: p.saldo_pendiente,
            estado: p.estado
        }).eq('id', p.id));
        emps.add(String(p.empleado_id));
    }

    for (const empId of emps) {
        const emp = appState.empleados.find(e => String(e.id) === empId);
        if (emp) {
            emp.saldo_prestamo = saldoPrestamosEmpleado(empId);
            updates.push(supabaseClient.from('empleados').update({ saldo_prestamo: emp.saldo_prestamo }).eq('id', emp.id));
        }
    }

    if (updates.length > 0) await Promise.all(updates);

    const idsRevertidos = new Set(abonos.map(a => String(a.id)));
    appState.prestamosAbonos = (appState.prestamosAbonos || []).filter(a => !idsRevertidos.has(String(a.id)));
    persistirPrestamosLocal();
    return true;
}

/* ---------------- RECIBOS ---------------- */

function _datosEmpresaRecibo() {
    return {
        nombre: appState.parametros?.nombre_empresa || 'EMPRESA',
        rif: appState.parametros?.rif_empresa || 'J-00000000-0'
    };
}

function _fechaRecibo(f) {
    if (!f) return '-';
    const [y, m, d] = String(f).split('-');
    return (y && m && d) ? `${d}/${m}/${y}` : f;
}

function generarHTMLReciboPrestamo(p) {
    const emp = appState.empleados.find(e => String(e.id) === String(p.empleado_id));
    const empresa = _datosEmpresaRecibo();
    const tasa = Number(p.tasa_bcv) || 0;
    const montoBs = tasa > 0 ? Number(p.monto_total || 0) * tasa : 0;
    const saldo = Number(p.saldo_pendiente) || 0;
    const tipoTxt = String(p.tipo || 'prestamo').toUpperCase();

    return `<div class="recibo-prestamo-print bg-white text-black p-4 font-sans max-w-4xl mx-auto border-2 border-black my-2 text-[10px]">
        <div class="flex justify-between items-start mb-2 pb-1 border-b-2 border-black">
            <div><h2 class="text-xl font-black tracking-widest text-black uppercase">${empresa.nombre.split('/')[0].trim()}</h2></div>
            <div class="text-right"><h3 class="text-xs font-extrabold text-black uppercase">${empresa.nombre}</h3><p class="text-[9px] text-slate-800 font-semibold">${empresa.rif}</p></div>
        </div>
        <div class="bg-[#fde0e0] text-center font-bold text-[10px] py-1 border border-black mb-2 uppercase tracking-wider text-black">
            RECIBO DE ENTREGA DE ${tipoTxt} — ${p.fecha_otorgamiento || '-'}
        </div>
        <table class="w-full text-[9.5px] border border-black mb-2 font-semibold">
            <tr><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black w-32 font-bold text-black">TRABAJADOR</td><td class="px-1.5 py-0.5 border-r border-b border-black font-bold uppercase text-black">${emp?.nombre || '-'}</td><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black w-24 font-bold text-black">CÉDULA</td><td class="px-1.5 py-0.5 border-b border-black text-black">${emp?.cedula || '-'}</td></tr>
            <tr><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black font-bold text-black">CARGO</td><td class="px-1.5 py-0.5 border-r border-b border-black uppercase text-black">${emp?.cargos?.nombre || '-'}</td><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black font-bold text-black">FECHA</td><td class="px-1.5 py-0.5 border-b border-black text-black">${_fechaRecibo(p.fecha_otorgamiento)}</td></tr>
            <tr><td class="bg-slate-100 px-1.5 py-0.5 border-r border-black font-bold text-black">TASA BCV</td><td class="px-1.5 py-0.5 border-r border-black text-black">${tasa > 0 ? tasa.toFixed(2) + ' Bs/$' : 'No indicada'}</td><td class="bg-slate-100 px-1.5 py-0.5 border-r border-black font-bold text-black">ESTADO</td><td class="px-1.5 py-0.5 font-bold uppercase text-black">${p.estado || 'activo'}</td></tr>
        </table>
        <table class="w-full text-[10px] border border-black mb-2">
            <thead><tr class="bg-[#fde0e0] font-bold border-b border-black text-black"><th class="px-2 py-1 text-left border-r border-black">CONCEPTO</th><th class="px-2 py-1 text-right border-r border-black">MONTO ($)</th><th class="px-2 py-1 text-right border-r border-black">MONTO (BS)</th><th class="px-2 py-1 text-right">SALDO PENDIENTE ($)</th></tr></thead>
            <tbody><tr>
                <td class="px-2 py-1.5 font-semibold uppercase text-black">${tipoTxt} otorgado al trabajador</td>
                <td class="px-2 py-1.5 text-right font-mono font-bold text-black">$${Number(p.monto_total || 0).toFixed(2)}</td>
                <td class="px-2 py-1.5 text-right font-mono font-bold text-black">${tasa > 0 ? 'Bs. ' + fNum(montoBs) : '-'}</td>
                <td class="px-2 py-1.5 text-right font-mono font-bold text-black">$${saldo.toFixed(2)}</td>
            </tr></tbody>
        </table>
        ${p.observaciones ? `<div class="border border-black p-1.5 mb-2 text-[8.5px] text-black leading-tight bg-slate-50"><strong>OBSERVACIONES:</strong> ${p.observaciones}</div>` : ''}
        <div class="border border-black p-1.5 mb-2 text-[8.5px] text-black leading-tight bg-slate-50">
            <strong>CONDICIONES:</strong> El trabajador autoriza el descuento de las cuotas correspondientes en su nómina, hasta la cancelación total del saldo pendiente. El saldo insoluto se mantiene exigible conforme a la LOTTT y a las políticas internas de la empresa.
        </div>
        <div class="border-t border-black pt-2 mt-2"><h4 class="text-center font-extrabold text-[9px] tracking-wider mb-4 text-black">RECIBO CONFORME</h4>
            <div class="grid grid-cols-2 gap-8 text-[9.5px] font-semibold text-black">
                <div class="flex items-end"><span class="mr-2">FIRMA PATRONO:</span><span class="border-b border-black flex-1"></span></div>
                <div class="flex items-end"><span class="mr-2">FIRMA TRABAJADOR:</span><span class="border-b border-black flex-1"></span></div>
            </div>
        </div>
    </div>`;
}

function generarHTMLReciboAbono(a, p) {
    const emp = appState.empleados.find(e => String(e.id) === String(p?.empleado_id));
    const empresa = _datosEmpresaRecibo();
    const tasa = Number(a.tasa_bcv) || Number(p?.tasa_bcv) || 0;
    const monto = Number(a.monto) || 0;
    const montoBs = tasa > 0 ? monto * tasa : 0;
    const saldoDespues = Number(p?.saldo_pendiente) || 0;
    const saldoAntes = saldoDespues + monto;
    const origenTxt = a.origen === 'nomina' ? 'DESCUENTO POR NÓMINA' : (a.origen === 'externo' ? 'PAGO EXTERNO' : 'ABONO MANUAL');

    return `<div class="recibo-abono-print bg-white text-black p-4 font-sans max-w-4xl mx-auto border-2 border-black my-2 text-[10px]">
        <div class="flex justify-between items-start mb-2 pb-1 border-b-2 border-black">
            <div><h2 class="text-xl font-black tracking-widest text-black uppercase">${empresa.nombre.split('/')[0].trim()}</h2></div>
            <div class="text-right"><h3 class="text-xs font-extrabold text-black uppercase">${empresa.nombre}</h3><p class="text-[9px] text-slate-800 font-semibold">${empresa.rif}</p></div>
        </div>
        <div class="bg-[#fde0e0] text-center font-bold text-[10px] py-1 border border-black mb-2 uppercase tracking-wider text-black">
            RECIBO DE ABONO A PRÉSTAMO — ${_fechaRecibo(a.fecha_pago)}
        </div>
        <table class="w-full text-[9.5px] border border-black mb-2 font-semibold">
            <tr><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black w-32 font-bold text-black">TRABAJADOR</td><td class="px-1.5 py-0.5 border-r border-b border-black font-bold uppercase text-black">${emp?.nombre || '-'}</td><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black w-24 font-bold text-black">CÉDULA</td><td class="px-1.5 py-0.5 border-b border-black text-black">${emp?.cedula || '-'}</td></tr>
            <tr><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black font-bold text-black">ORIGEN</td><td class="px-1.5 py-0.5 border-r border-b border-black uppercase text-black">${origenTxt}</td><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black font-bold text-black">FECHA ABONO</td><td class="px-1.5 py-0.5 border-b border-black text-black">${_fechaRecibo(a.fecha_pago)}</td></tr>
            <tr><td class="bg-slate-100 px-1.5 py-0.5 border-r border-black font-bold text-black">PRÉSTAMO</td><td class="px-1.5 py-0.5 border-r border-black text-black">${p ? `${p.tipo || 'préstamo'} del ${_fechaRecibo(p.fecha_otorgamiento)}` : '-'}</td><td class="bg-slate-100 px-1.5 py-0.5 border-r border-black font-bold text-black">TASA BCV</td><td class="px-1.5 py-0.5 font-bold text-black">${tasa > 0 ? tasa.toFixed(2) + ' Bs/$' : '-'}</td></tr>
        </table>
        <table class="w-full text-[10px] border border-black mb-2">
            <thead><tr class="bg-[#fde0e0] font-bold border-b border-black text-black"><th class="px-2 py-1 text-left border-r border-black">CONCEPTO</th><th class="px-2 py-1 text-right border-r border-black">ABONO ($)</th><th class="px-2 py-1 text-right border-r border-black">ABONO (BS)</th><th class="px-2 py-1 text-right">SALDO DESPUÉS ($)</th></tr></thead>
            <tbody><tr>
                <td class="px-2 py-1.5 font-semibold uppercase text-black">Abono a préstamo</td>
                <td class="px-2 py-1.5 text-right font-mono font-bold text-black">$${monto.toFixed(2)}</td>
                <td class="px-2 py-1.5 text-right font-mono font-bold text-black">${tasa > 0 ? 'Bs. ' + fNum(montoBs) : '-'}</td>
                <td class="px-2 py-1.5 text-right font-mono font-bold text-black">$${saldoDespues.toFixed(2)}</td>
            </tr></tbody>
        </table>
        <div class="border border-black p-1.5 mb-2 text-[8.5px] text-black leading-tight bg-slate-50">
            <strong>RESUMEN:</strong> Saldo anterior: $${saldoAntes.toFixed(2)} — Abono: $${monto.toFixed(2)} — Saldo pendiente: $${saldoDespues.toFixed(2)}.
        </div>
        <div class="border-t border-black pt-2 mt-2"><h4 class="text-center font-extrabold text-[9px] tracking-wider mb-4 text-black">RECIBO CONFORME</h4>
            <div class="grid grid-cols-2 gap-8 text-[9.5px] font-semibold text-black">
                <div class="flex items-end"><span class="mr-2">FIRMA PATRONO:</span><span class="border-b border-black flex-1"></span></div>
                <div class="flex items-end"><span class="mr-2">FIRMA TRABAJADOR:</span><span class="border-b border-black flex-1"></span></div>
            </div>
        </div>
    </div>`;
}

function verReciboPrestamo(prestamoId) {
    const p = (appState.prestamos || []).find(x => String(x.id) === String(prestamoId));
    if (!p) return showToast('Préstamo no encontrado', 'error');

    if (gId('recibos-fecha-pago')) {
        gId('recibos-fecha-pago').innerText = `Préstamo ${p.tipo || ''} ${p.fecha_otorgamiento || ''}`;
    }
    if (gId('area-impresion-recibos')) {
        gId('area-impresion-recibos').innerHTML =
            `<div class="print-page relative group">
                <button onclick="enviarWhatsAppPrestamo('${p.id}')" class="absolute top-4 right-4 bg-emerald-500 text-white rounded-full w-9 h-9 opacity-40 group-hover:opacity-100 print-hidden" title="WhatsApp"><i class="fa-brands fa-whatsapp text-xl"></i></button>
                ${generarHTMLReciboPrestamo(p)}
            </div>`;
    }
    openModal('modal-recibos-nomina');
}

function verReciboAbono(abonoId) {
    const a = (appState.prestamosAbonos || []).find(x => String(x.id) === String(abonoId));
    if (!a) return showToast('Abono no encontrado', 'error');
    const p = (appState.prestamos || []).find(x => String(x.id) === String(a.prestamo_id));
    if (!p) return showToast('Préstamo no encontrado', 'error');

    if (gId('recibos-fecha-pago')) {
        gId('recibos-fecha-pago').innerText = `Abono ${a.fecha_pago || ''}`;
    }
    if (gId('area-impresion-recibos')) {
        gId('area-impresion-recibos').innerHTML =
            `<div class="print-page relative group">
                <button onclick="enviarWhatsAppAbono('${a.id}')" class="absolute top-4 right-4 bg-emerald-500 text-white rounded-full w-9 h-9 opacity-40 group-hover:opacity-100 print-hidden" title="WhatsApp"><i class="fa-brands fa-whatsapp text-xl"></i></button>
                ${generarHTMLReciboAbono(a, p)}
            </div>`;
    }
    openModal('modal-recibos-nomina');
}

/* ---------------- WHATSAPP ---------------- */

function _telefonoWhatsApp(emp) {
    let t = emp?.telefono ? String(emp.telefono).replace(/\D/g, '') : '';
    if (!t) return '';
    if (t.startsWith('0')) t = '58' + t.substring(1);
    else if (t.length === 10) t = '58' + t;
    return t;
}

function enviarWhatsAppPrestamo(prestamoId) {
    const p = (appState.prestamos || []).find(x => String(x.id) === String(prestamoId));
    if (!p) return;
    const emp = appState.empleados.find(e => String(e.id) === String(p.empleado_id));
    const tel = _telefonoWhatsApp(emp);
    if (!tel) return showToast('El empleado no tiene teléfono registrado', 'error');

    const empresa = appState.parametros?.nombre_empresa || 'NóminaApp';
    const tasa = Number(p.tasa_bcv) || 0;
    const montoBs = tasa > 0 ? Number(p.monto_total || 0) * tasa : 0;

    const msg =
        `*RECIBO DE ENTREGA DE ${String(p.tipo || 'PRÉSTAMO').toUpperCase()}*\n` +
        `${empresa}\n\n` +
        `Trabajador: ${emp?.nombre || '-'}\n` +
        `Fecha: ${_fechaRecibo(p.fecha_otorgamiento)}\n` +
        `Monto: $${Number(p.monto_total || 0).toFixed(2)}${tasa > 0 ? ` / Bs. ${fNum(montoBs)}` : ''}\n` +
        `Saldo pendiente: $${Number(p.saldo_pendiente || 0).toFixed(2)}\n\n` +
        `Por favor, confirma la recepción del préstamo.`;

    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank');
}

function enviarWhatsAppAbono(abonoId) {
    const a = (appState.prestamosAbonos || []).find(x => String(x.id) === String(abonoId));
    if (!a) return;
    const p = (appState.prestamos || []).find(x => String(x.id) === String(a.prestamo_id));
    const emp = appState.empleados.find(e => String(e.id) === String(p?.empleado_id));
    const tel = _telefonoWhatsApp(emp);
    if (!tel) return showToast('El empleado no tiene teléfono registrado', 'error');

    const empresa = appState.parametros?.nombre_empresa || 'NóminaApp';
    const tasa = Number(a.tasa_bcv) || Number(p?.tasa_bcv) || 0;
    const monto = Number(a.monto) || 0;
    const montoBs = tasa > 0 ? monto * tasa : 0;
    const saldo = Number(p?.saldo_pendiente) || 0;

    const msg =
        `*RECIBO DE ABONO A PRÉSTAMO*\n` +
        `${empresa}\n\n` +
        `Trabajador: ${emp?.nombre || '-'}\n` +
        `Fecha: ${_fechaRecibo(a.fecha_pago)}\n` +
        `Abono: $${monto.toFixed(2)}${tasa > 0 ? ` / Bs. ${fNum(montoBs)}` : ''}\n` +
        `Saldo pendiente: $${saldo.toFixed(2)}\n\n` +
        `Por favor, confirma la recepción del abono.`;

    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank');
}

/* ============================================================
   ANTICIPOS DE PRESTACIONES (LOTTT Art. 144)
   Se mantiene el flujo existente: tabla anticipos_prestaciones.
   ============================================================ */

function abrirModalAnticipos(empId) {
    const emp = appState.empleados.find(x => String(x.id) === String(empId));
    if (!emp) return;

    gId('anticipo-emp-id').value = empId;
    gId('modal-anticipos-emp').innerText = emp.nombre;

    renderTablaAnticipos();
    openModal('modal-anticipos');
}

/* Solo consulta: los adelantos de prestaciones se registran desde el módulo de
   Prestaciones / Antigüedad. Aquí únicamente se visualizan. */
function renderTablaAnticipos() {
    const empId = gId('anticipo-emp-id').value;
    const tbody = gId('tabla-anticipos-body');
    if (!tbody) return;

    const lista = obtenerAnticiposEmpleado(empId).slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-slate-500">No hay adelantos de prestaciones registrados.</td></tr>';
    } else {
        tbody.innerHTML = lista.map(a => {
            const [y, m, d] = (a.fecha || '').split('-');
            const fechaFmt = (y && m && d) ? `${d}/${m}/${y}` : a.fecha;
            const concepto = (a.concepto && String(a.concepto).trim())
                ? a.concepto
                : `Anticipo de prestaciones ${fechaFmt}`;
            return `<tr class="hover:bg-slate-900/50">
                <td class="p-2.5 text-white font-mono">${fechaFmt}</td>
                <td class="p-2.5 text-cyan-300 font-mono font-bold">Bs. ${fNum(a.monto_bs)}</td>
                <td class="p-2.5 text-slate-400">${concepto}</td>
            </tr>`;
        }).join('');
    }

    const totalBs = lista.reduce((s, a) => s + Number(a.monto_bs || 0), 0);
    if (gId('total-anticipos-bs')) gId('total-anticipos-bs').innerText = `Bs. ${fNum(totalBs)}`;
}

/* ============================================================
   FIRMA DIGITAL DEL PRÉSTAMO / ANTICIPO
   Igual que en Nómina: se genera un enlace único con vigencia
   de 30 minutos; al firmar, el PDF queda en el expediente del
   empleado. Reutiliza abrirModalFirmaGenerico() de nomina.js.
   ============================================================ */

async function abrirModalFirmaPrestamo(prestamoId) {
    if (!(appState.prestamos || []).find(x => String(x.id) === String(prestamoId))) {
        try { await cargarPrestamosYAbonos(true); } catch (e) {}
    }
    const p = (appState.prestamos || []).find(x => String(x.id) === String(prestamoId));
    if (!p) return showToast('Préstamo no encontrado', 'error');
    if (p._local) return showToast('Este préstamo aún no está sincronizado con Supabase. Sincronice antes de firmar.', 'error');

    const emp = appState.empleados.find(e => String(e.id) === String(p.empleado_id));
    if (!emp) return showToast('Empleado no encontrado', 'error');

    const tipoLabel = String(p.tipo || 'prestamo') === 'anticipo' ? 'Anticipo' : 'Préstamo';
    const tasa = Number(p.tasa_bcv) || 0;
    const montoBs = tasa > 0 ? Number(p.monto_total || 0) * tasa : 0;
    const montoLabel = `$${Number(p.monto_total || 0).toFixed(2)}` + (tasa > 0 ? ` / Bs. ${fNum(montoBs)}` : '');

    abrirModalFirmaGenerico('prestamo', [{
        id: p.id,
        empleado: emp.nombre,
        empleado_id: p.empleado_id,
        neto_bs: montoBs,
        monto_label: montoLabel,
        periodo: `${tipoLabel} ${_fechaRecibo(p.fecha_otorgamiento)} — ${montoLabel}`
    }]);
}
