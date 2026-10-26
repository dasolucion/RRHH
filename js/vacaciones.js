/* ============================================================
   js/vacaciones.js
   Cálculo, guardado, recibos e historial de vacaciones.
   ============================================================ */

function onCambioEmpleadoVacaciones() {
    const id = gId('vac-emp-select').value;
    const e = appState.empleados.find(x => String(x.id) === String(id));
    if (!e) return;

    const ini = gId('vac-fecha-inicio').value || new Date().toISOString().split('T')[0];
    const a = e.fecha_ingreso ? calcularAntiguedadAnios(e.fecha_ingreso, ini) : 1;
    const h = new Date();

    gId('vac-periodo').value = `${h.getFullYear() - 1} a ${h.getFullYear()}`;
    gId('vac-dias-otorgados').value = 0;
    const dL = Math.min(30, 15 + Math.max(0, a - 1));
    gId('vac-dias-pendientes').value = dL;
}

function actualizarDiasPendientesVacaciones() {
    const id = gId('vac-emp-select').value;
    const e = appState.empleados.find(x => String(x.id) === String(id));
    const ini = gId('vac-fecha-inicio').value || new Date().toISOString().split('T')[0];
    const a = (e && e.fecha_ingreso) ? calcularAntiguedadAnios(e.fecha_ingreso, ini) : 1;
    const dL = Math.min(30, 15 + Math.max(0, a - 1));
    const o = parseFloat(gId('vac-dias-otorgados').value) || 0;
    gId('vac-dias-pendientes').value = Math.max(0, dL - o);
}

function calcularVacaciones() {
    const id = gId('vac-emp-select').value;
    const per = gId('vac-periodo').value;
    const ini = gId('vac-fecha-inicio').value;
    const otor = parseFloat(gId('vac-dias-otorgados').value) || 0;
    const pend = parseFloat(gId('vac-dias-pendientes').value);

    if (!id) return showToast('Seleccione un empleado', 'error');
    if (!ini) return showToast('Indique la fecha de inicio', 'error');
    if (!per) return showToast('Indique el período vacacional', 'error');
    if (isNaN(pend) || pend < 0) return showToast('Días pendientes inválidos', 'error');

    const e = appState.empleados.find(x => String(x.id) === String(id));
    if (!e) return showToast('Empleado no encontrado', 'error');

    const t = parseFloat(gId('nom-tasa-bcv').value) || 36.5;
    const sD = (Number(e.sueldo) || 0) / 30;
    const bD = (Number(e.bono_alimentacion) || 0) / 30;
    const subD = (Number(e.otros_ingresos) || 0) / 30;

    const a = e.fecha_ingreso ? calcularAntiguedadAnios(e.fecha_ingreso, ini) : 1;
    const dHabL = Math.min(30, 15 + Math.max(0, a - 1));
    const dBonoL = Math.min(30, 16 + Math.max(0, a - 1));
    const diasBonoAPagar = Math.max(0, dBonoL - otor);

    let curr = new Date(ini + 'T00:00:00');
    let hab = 0, fs = 0;
    while (hab < pend) {
        const dw = curr.getDay();
        if (dw === 0 || dw === 6 || esFeriadoNacional(curr)) fs++;
        else hab++;
        if (hab < pend) curr.setDate(curr.getDate() + 1);
    }

    let re = new Date(curr);
    re.setDate(re.getDate() + 1);
    while (re.getDay() === 0 || re.getDay() === 6 || esFeriadoNacional(re)) {
        re.setDate(re.getDate() + 1);
    }

    const fReinc = `${String(re.getDate()).padStart(2, '0')}/${String(re.getMonth() + 1).padStart(2, '0')}/${re.getFullYear()}`;
    const tCont = pend + fs;

    const mDLey = sD * pend;
    const mFsLey = sD * fs;
    const mBLey = sD * diasBonoAPagar;
    const mAlim = bD * tCont;
    const tLey = Math.max(0, mDLey + mFsLey + mBLey + mAlim);

    const mDSub = subD * pend;
    const mFsSub = subD * fs;
    const mBSub = subD * diasBonoAPagar;
    const tSub = Math.max(0, mDSub + mFsSub + mBSub);

    appState.calculoVacacionesActual = {
        empleado: e, periodo: per, fechaInicio: ini, fechaReincorporacion: fReinc,
        diasOtorgadosPrevios: otor, diasHabilesLegales: dHabL, diasHabilesDisfrute: pend,
        finesDeSemanaYFeriados: fs, totalDiasContinuos: tCont, diasBonoLegales: dBonoL,
        diasBonoAPagar: diasBonoAPagar, aniosAntiguedad: a, salarioDiarioBase: sD,
        bonoAlimDiario: bD, subsidioDiario: subD, montoDisfruteBrutoUSD: mDLey,
        montoDescansosUSD: mFsLey, montoBonoVacBrutoUSD: mBLey, montoBonoAlimUSD: mAlim,
        totalNetoLeyUSD: tLey, totalNetoLeyBs: tLey * t, totalNetoSubsidioUSD: tSub,
        totalNetoSubsidioBs: tSub * t, granTotalUSD: tLey + tSub, granTotalBs: (tLey + tSub) * t,
        tasaBCV: t
    };

    renderResultadoVacaciones(appState.calculoVacacionesActual);
}

function renderResultadoVacaciones(v) {
    const [iy, im, id] = (v.empleado.fecha_ingreso || '').split('-');
    const fechaIngresoFmt = (iy && im && id) ? `${id}/${im}/${iy}` : (v.empleado.fecha_ingreso || '-');

    const [fiY, fiM, fiD] = (v.fechaInicio || '').split('-');
    const fechaInicioFmt = (fiY && fiM && fiD) ? `${fiD}/${fiM}/${fiY}` : (v.fechaInicio || '-');

    gId('res-vac-emp-nombre').innerText = v.empleado.nombre;
    gId('res-vac-cedula').innerText = v.empleado.cedula;
    gId('res-vac-cargo').innerText = v.empleado.cargos?.nombre || '-';
    gId('res-vac-ingreso').innerText = fechaIngresoFmt;
    gId('res-vac-antiguedad').innerText = `${v.aniosAntiguedad} año(s)`;
    gId('res-vac-periodo').innerText = v.periodo;
    gId('res-vac-reincorporacion').innerText = v.fechaReincorporacion;

    gId('lbl-salario-diario-base').innerText = `$${v.salarioDiarioBase.toFixed(2)}/día (Bs. ${fNum(v.salarioDiarioBase * v.tasaBCV)}/día)`;
    gId('lbl-tasa-bcv-vac').innerText = `${v.tasaBCV.toFixed(2)} Bs/$`;

    gId('tabla-vacaciones-body').innerHTML = `
        <tr class="hover:bg-slate-900/50"><td class="p-3 font-semibold text-white"><div>Días de Vacaciones / Disfrute Hábiles</div><span class="text-[10px] text-slate-400">Días a disfrutar en este período</span></td><td class="p-3 text-center font-bold text-teal-400">${v.diasHabilesDisfrute} d</td><td class="p-3 text-slate-300 font-mono">$${v.salarioDiarioBase.toFixed(2)}</td><td class="p-3 font-bold text-sky-400 font-mono">$${v.montoDisfruteBrutoUSD.toFixed(2)}</td><td class="p-3 font-bold text-slate-200 font-mono">Bs. ${fNum(v.montoDisfruteBrutoUSD * v.tasaBCV)}</td></tr>
        <tr class="hover:bg-slate-900/50"><td class="p-3 font-semibold text-white"><div>Fines de Semana y Feriados comprendidos</div><span class="text-[10px] text-slate-400">Descansos remunerados durante el período de disfrute</span></td><td class="p-3 text-center font-bold text-teal-400">${v.finesDeSemanaYFeriados} d</td><td class="p-3 text-slate-300 font-mono">$${v.salarioDiarioBase.toFixed(2)}</td><td class="p-3 font-bold text-sky-400 font-mono">$${v.montoDescansosUSD.toFixed(2)}</td><td class="p-3 font-bold text-slate-200 font-mono">Bs. ${fNum(v.montoDescansosUSD * v.tasaBCV)}</td></tr>
        <tr class="hover:bg-slate-900/50"><td class="p-3 font-semibold text-white"><div>Bono Vacacional Proporcional</div><span class="text-[10px] text-slate-400">Días legales (${v.diasBonoLegales}d) menos otorgados previos (${v.diasOtorgadosPrevios}d)</span></td><td class="p-3 text-center font-bold text-teal-400">${v.diasBonoAPagar} d</td><td class="p-3 text-slate-300 font-mono">$${v.salarioDiarioBase.toFixed(2)}</td><td class="p-3 font-bold text-sky-400 font-mono">$${v.montoBonoVacBrutoUSD.toFixed(2)}</td><td class="p-3 font-bold text-slate-200 font-mono">Bs. ${fNum(v.montoBonoVacBrutoUSD * v.tasaBCV)}</td></tr>
        <tr class="hover:bg-slate-900/50"><td class="p-3 font-semibold text-white"><div>Bono de Alimentación (Cestaticket período completo)</div><span class="text-[10px] text-slate-400">Días continuos de ausencia (${v.totalDiasContinuos} días)</span></td><td class="p-3 text-center font-bold text-teal-400">${v.totalDiasContinuos} d</td><td class="p-3 text-slate-300 font-mono">$${v.bonoAlimDiario.toFixed(2)}</td><td class="p-3 font-bold text-emerald-400 font-mono">$${v.montoBonoAlimUSD.toFixed(2)}</td><td class="p-3 font-bold text-slate-200 font-mono">Bs. ${fNum(v.montoBonoAlimUSD * v.tasaBCV)}</td></tr>
    `;

    gId('tabla-vacaciones-foot').innerHTML = `<tr><td colspan="3" class="p-3 text-right uppercase tracking-wider font-extrabold text-xs">Total Neto Legal LOTTT:</td><td class="p-3 font-extrabold text-emerald-400 text-sm font-mono">$${v.totalNetoLeyUSD.toFixed(2)}</td><td class="p-3 font-extrabold text-emerald-400 text-sm font-mono">Bs. ${fNum(v.totalNetoLeyBs)}</td></tr>`;
    gId('res-subsidio-total-usd').innerText = `$${v.totalNetoSubsidioUSD.toFixed(2)}`;
    gId('res-subsidio-total-bs').innerText = `Bs. ${fNum(v.totalNetoSubsidioBs)}`;
    gId('res-gran-total-usd').innerText = `$${v.granTotalUSD.toFixed(2)}`;
    gId('res-gran-total-bs').innerText = `Bs. ${fNum(v.granTotalBs)}`;

    gId('vac-resultado-container').classList.remove('hidden');
    showToast('Vacaciones calculadas exitosamente');
}

async function guardarVacaciones() {
    const v = appState.calculoVacacionesActual;
    if (!v) return;

    const empleadoLimpio = {
        id: v.empleado.id, nombre: v.empleado.nombre, cedula: v.empleado.cedula,
        telefono: v.empleado.telefono, fecha_ingreso: v.empleado.fecha_ingreso,
        cargo: v.empleado.cargos?.nombre || '-', departamento: v.empleado.departamentos?.nombre || '-'
    };

    const calculoLimpio = { ...v, empleado: empleadoLimpio };
    const p = {
        empleado_id: v.empleado.id, empleado: v.empleado.nombre, periodo: v.periodo,
        fecha_inicio: v.fechaInicio, gran_total_usd: Number(v.granTotalUSD) || 0,
        gran_total_bs: Number(v.granTotalBs) || 0, total_usd: Number(v.granTotalUSD) || 0,
        total_bs: Number(v.granTotalBs) || 0, detalle_calculo: calculoLimpio
    };

    const insertado = await safeQuery(supabaseClient.from('vacaciones').insert([p]).select(), 'insert_vacaciones');
    let registroLocal = { ...p, id: Date.now(), created_at: new Date().toISOString() };

    if (insertado && insertado[0]) {
        registroLocal = { ...insertado[0], id: insertado[0].id, created_at: insertado[0].created_at || registroLocal.created_at };
        showToast('Liquidación de vacaciones guardada en la nube');
    } else {
        showToast('Guardado localmente (Supabase no respondió)', 'error');
    }

    appState.vacaciones.unshift(registroLocal);
    localStorage.setItem('nomina_vacaciones_cache', JSON.stringify(appState.vacaciones));
    renderHistoricoVacaciones();
}

function renderHistoricoVacaciones() {
    const isMaster = appState.usuarioActual?.rol === 'master';
    const tbody = gId('tabla-historico-vacaciones-body');
    if (!tbody) return;

    if (!appState.vacaciones || appState.vacaciones.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-slate-500">No hay registros de vacaciones procesadas.</td></tr>`;
        return;
    }

    tbody.innerHTML = appState.vacaciones.map(v => {
        const fIni = v.fecha_inicio || v.detalle_calculo?.fechaInicio || '-';
        let fechaRegistro = '-';
        if (v.created_at) {
            try {
                const d = new Date(v.created_at);
                fechaRegistro = !isNaN(d.getTime()) ? d.toLocaleDateString('es-VE') : String(v.created_at).substring(0, 10);
            } catch (e) { fechaRegistro = String(v.created_at).substring(0, 10); }
        }
        const fReinc = v.detalle_calculo?.fechaReincorporacion || '-';
        const totUSD = Number(v.gran_total_usd !== undefined ? v.gran_total_usd : (v.total_usd || 0));
        const totBs = Number(v.gran_total_bs !== undefined ? v.gran_total_bs : (v.total_bs || 0));

        return `<tr class="hover:bg-slate-900/50">
            <td class="p-3.5 text-slate-400 font-mono text-xs">${fechaRegistro}</td>
            <td class="p-3.5 font-bold text-white">${v.empleado || '-'}</td>
            <td class="p-3.5 text-center text-sky-400 font-semibold">${v.periodo || '-'}</td>
            <td class="p-3.5 text-center text-teal-400 font-mono">${fIni}</td>
            <td class="p-3.5 text-center text-slate-300 font-mono">${fReinc}</td>
            <td class="p-3.5 font-bold text-emerald-400">$${totUSD.toFixed(2)}</td>
            <td class="p-3.5 font-bold text-emerald-400">Bs. ${fNum(totBs)}</td>
            <td class="p-3.5 text-right space-x-1 sm:space-x-2">
                <button onclick="verReciboVacacionHistorico('${v.id}')" class="bg-teal-600/20 hover:bg-teal-600/40 text-teal-400 border border-teal-500/30 text-xs px-2.5 py-1 rounded-lg font-medium inline-flex items-center space-x-1 transition"><i class="fa-solid fa-receipt text-[11px]"></i><span>Ver Recibo</span></button>
                ${isMaster ? `<button onclick="eliminarVacacionProcesada('${v.id}')" class="bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 border border-rose-500/30 text-xs px-2.5 py-1 rounded-lg font-medium inline-flex items-center space-x-1 transition"><i class="fa-solid fa-trash text-[11px]"></i></button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

async function eliminarVacacionProcesada(id) {
    if (appState.usuarioActual?.rol !== 'master') return showToast('No tiene permisos para eliminar registros', 'error');
    if (confirm('¿Desea eliminar este registro de vacaciones?')) {
        await safeQuery(supabaseClient.from('vacaciones').delete().eq('id', id), 'delete_vacaciones');
        appState.vacaciones = appState.vacaciones.filter(x => String(x.id) !== String(id));
        localStorage.setItem('nomina_vacaciones_cache', JSON.stringify(appState.vacaciones));
        renderHistoricoVacaciones();
        showToast('Registro de vacaciones eliminado');
    }
}

function verReciboVacacionHistorico(id) {
    const v = appState.vacaciones.find(x => String(x.id) === String(id));
    if (!v) return showToast('Registro no encontrado', 'error');

    let detalle = normalizarRegistroJson(v).detalle_calculo;
    if (!detalle) {
        try {
            const localVacs = JSON.parse(localStorage.getItem('nomina_vacaciones_cache') || '[]');
            const localMatch = localVacs.find(lv => String(lv.id) === String(id));
            if (localMatch && localMatch.detalle_calculo) {
                detalle = normalizarRegistroJson(localMatch).detalle_calculo;
            }
        } catch (e) {}
    }
    if (!detalle) { return showToast('No hay información detallada guardada', 'error'); }

    appState.calculoVacacionesActual = detalle;
    gId('recibos-fecha-pago').innerText = `Vacaciones - ${v.empleado}`;
    gId('area-impresion-recibos').innerHTML = `<div class="print-page relative group"><button onclick="enviarWhatsAppVacaciones()" class="absolute top-4 right-4 bg-emerald-500 text-white rounded-full w-9 h-9 opacity-40 group-hover:opacity-100 print-hidden" title="WhatsApp"><i class="fa-brands fa-whatsapp text-xl"></i></button>${generarHTMLReciboVacacionImpresion(detalle)}</div>`;
    openModal('modal-recibos-nomina');
}

function generarHTMLReciboVacacionImpresion(v) {
    const emp = v.empleado || {};
    const nombreCargo = typeof emp.cargo === 'string' ? emp.cargo : (emp.cargos?.nombre || '-');
    const nombreDepto = typeof emp.departamento === 'string' ? emp.departamento : (emp.departamentos?.nombre || '-');

    const [iy, im, id] = (emp.fecha_ingreso || '').split('-');
    const fechaIngresoFmt = (iy && im && id) ? `${id}/${im}/${iy}` : (emp.fecha_ingreso || '-');

    const [fiY, fiM, fiD] = (v.fechaInicio || '').split('-');
    const fechaInicioFmt = (fiY && fiM && fiD) ? `${fiD}/${fiM}/${fiY}` : (v.fechaInicio || '-');

    return `<div class="recibo-vacaciones-print bg-white text-black p-4 font-sans max-w-4xl mx-auto border-2 border-black my-2 text-[10px]">
        <div class="flex justify-between items-start mb-2 pb-1 border-b-2 border-black"><div><h2 class="text-xl font-black tracking-widest text-black uppercase">${appState.parametros.nombre_empresa.split('/')[0].trim()}</h2></div><div class="text-right"><h3 class="text-xs font-extrabold text-black uppercase">${appState.parametros.nombre_empresa}</h3><p class="text-[9px] text-slate-800 font-semibold">${appState.parametros.rif_empresa}</p></div></div>
        <div class="bg-[#dbece0] text-center font-bold text-[10px] py-1 border border-black mb-2 uppercase tracking-wider text-black">LIQUIDACIÓN DE VACACIONES (${v.periodo})</div>
        <table class="w-full text-[9.5px] border border-black mb-2 font-semibold">
            <tr><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black w-32 font-bold text-black">TRABAJADOR</td><td class="px-1.5 py-0.5 border-r border-b border-black font-bold uppercase text-black">${emp.nombre || '-'}</td><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black w-24 font-bold text-black">CÉDULA</td><td class="px-1.5 py-0.5 border-b border-black text-black">${emp.cedula || '-'}</td></tr>
            <tr><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black font-bold text-black">CARGO</td><td class="px-1.5 py-0.5 border-r border-b border-black uppercase text-black">${nombreCargo}</td><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black font-bold text-black">DEPARTAMENTO</td><td class="px-1.5 py-0.5 border-b border-black uppercase text-black">${nombreDepto}</td></tr>
            <tr><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black font-bold text-black">FECHA INGRESO</td><td class="px-1.5 py-0.5 border-r border-b border-black text-black">${fechaIngresoFmt}</td><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black font-bold text-black">ANTIGÜEDAD</td><td class="px-1.5 py-0.5 border-b border-black font-bold text-black">${v.aniosAntiguedad} año(s)</td></tr>
            <tr><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black font-bold text-black">FECHA INICIO</td><td class="px-1.5 py-0.5 border-r border-b border-black text-black">${fechaInicioFmt}</td><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black font-bold text-black">REINCORPORACIÓN</td><td class="px-1.5 py-0.5 font-bold text-black">${v.fechaReincorporacion}</td></tr>
        </table>
        ${v.diasOtorgadosPrevios > 0 ? `<div class="bg-slate-50 border border-black p-1.5 mb-2 text-[9px] text-black"><strong>NOTA INFORMATIVA DE CONTROL:</strong> Consta en el expediente del trabajador que se le han otorgado <strong>${v.diasOtorgadosPrevios} días</strong> previamente dentro de este mismo período vacacional. (Dichos días no alteran ni descuentan el cálculo económico del presente disfrute).</div>` : ''}
        <div class="font-bold text-[9px] uppercase text-black mb-0.5">1. Liquidación Legal LOTTT (Salario Base + Cestaticket) | Tasa BCV: ${v.tasaBCV.toFixed(2)} Bs/$</div>
        <table class="w-full text-[9px] border border-black mb-2">
            <thead><tr class="bg-[#dbece0] font-bold border-b border-black text-black"><th class="px-1.5 py-0.5 text-left border-r border-black text-black">CONCEPTO LEGAL</th><th class="px-1.5 py-0.5 text-center border-r border-black w-14 text-black">DÍAS</th><th class="px-1.5 py-0.5 text-right border-r border-black w-24 text-black">MONTO ($)</th><th class="px-1.5 py-0.5 text-right w-32 text-black">MONTO (BS)</th></tr></thead>
            <tbody class="divide-y divide-slate-300">
                <tr><td class="px-1.5 py-0.5 text-black">Vacaciones Hábiles (Disfrute)</td><td class="px-1.5 py-0.5 text-center font-mono text-black">${v.diasHabilesDisfrute} d</td><td class="px-1.5 py-0.5 text-right font-mono text-black">$${v.montoDisfruteBrutoUSD.toFixed(2)}</td><td class="px-1.5 py-0.5 text-right font-mono text-black">${fNum(v.montoDisfruteBrutoUSD * v.tasaBCV)}</td></tr>
                <tr><td class="px-1.5 py-0.5 text-black">Fines Semana y Feriados</td><td class="px-1.5 py-0.5 text-center font-mono text-black">${v.finesDeSemanaYFeriados} d</td><td class="px-1.5 py-0.5 text-right font-mono text-black">$${v.montoDescansosUSD.toFixed(2)}</td><td class="px-1.5 py-0.5 text-right font-mono text-black">${fNum(v.montoDescansosUSD * v.tasaBCV)}</td></tr>
                <tr><td class="px-1.5 py-0.5 text-black">Bono Vacacional</td><td class="px-1.5 py-0.5 text-center font-mono text-black">${v.diasBonoAPagar} d</td><td class="px-1.5 py-0.5 text-right font-mono text-black">$${v.montoBonoVacBrutoUSD.toFixed(2)}</td><td class="px-1.5 py-0.5 text-right font-mono text-black">${fNum(v.montoBonoVacBrutoUSD * v.tasaBCV)}</td></tr>
                <tr><td class="px-1.5 py-0.5 text-black">Bono de Alimentación</td><td class="px-1.5 py-0.5 text-center font-mono text-black">${v.totalDiasContinuos} d</td><td class="px-1.5 py-0.5 text-right font-mono text-black">$${v.montoBonoAlimUSD.toFixed(2)}</td><td class="px-1.5 py-0.5 text-right font-mono text-black">${fNum(v.montoBonoAlimUSD * v.tasaBCV)}</td></tr>
            </tbody>
            <tfoot><tr class="font-bold border-t border-black bg-slate-50 text-black"><td class="px-1.5 py-0.5" colspan="2">TOTAL NETO LEGAL LOTTT</td><td class="px-1.5 py-0.5 text-right font-mono text-black">$${v.totalNetoLeyUSD.toFixed(2)}</td><td class="px-1.5 py-0.5 text-right font-mono text-black">${fNum(v.totalNetoLeyBs)} Bs</td></tr></tfoot>
        </table>
        <div class="bg-slate-50 border border-black p-2 mb-2 flex justify-between items-center text-[9px] text-black">
            <div><span class="font-bold uppercase text-black">2. Subsidio Especial No Obligatorio</span><span class="text-[8px] text-slate-700 block">Asignación voluntaria complementaria otorgada por la empresa</span></div>
            <div class="text-right"><span class="text-[8px] uppercase font-bold text-slate-700 block">Total Subsidio Especial a Pagar:</span><span class="font-mono font-bold text-black text-[9.5px]">$${v.totalNetoSubsidioUSD.toFixed(2)} / ${fNum(v.totalNetoSubsidioBs)} Bs</span></div>
        </div>
        <div class="flex justify-between items-center bg-[#dbece0] border-2 border-black p-1.5 font-bold text-[10px] mb-2 text-black">
            <span class="uppercase font-black">GRAN TOTAL A COBRAR (LEY + SUBSIDIO):</span>
            <span class="font-mono text-xs font-black text-black">$${v.granTotalUSD.toFixed(2)} / ${fNum(v.granTotalBs)} Bs</span>
        </div>
        <div class="border border-black p-1.5 mb-2 text-[8.5px] text-black leading-tight bg-slate-50"><strong>OBSERVACIONES:</strong> El subsidio no posee naturaleza salarial, ya que no desprende de la intención retributiva del trabajo prestado sino un beneficio eminentemente social para cubrir parte de sus gastos por bienes y/o servicios básicos en que incurre el trabajador. Por tal motivo se otorga como una ayuda al trabajador sin que sea de carácter obligatorio en futuras ocasiones.</div>
        <div class="border-t border-black pt-2 mt-2"><h4 class="text-center font-extrabold text-[9px] tracking-wider mb-4 text-black">RECIBO CONFORME DE VACACIONES</h4>
            <div class="grid grid-cols-2 gap-8 text-[9.5px] font-semibold text-black">
                <div class="flex items-end"><span class="mr-2">FIRMA PATRONO:</span><span class="border-b border-black flex-1"></span></div>
                <div class="flex items-end"><span class="mr-2">FIRMA TRABAJADOR:</span><span class="border-b border-black flex-1"></span></div>
            </div>
        </div>
    </div>`;
}

function imprimirReciboVacaciones() {
    const v = appState.calculoVacacionesActual;
    if (!v) return;
    gId('print-container').innerHTML = `<div class="print-page">${generarHTMLReciboVacacionImpresion(v)}</div>`;
    window.print();
}

function enviarWhatsAppVacaciones() {
    const v = appState.calculoVacacionesActual;
    if (!v) return;
    let t = v.empleado.telefono ? v.empleado.telefono.replace(/\D/g, '') : '';
    if (!t) return showToast('Sin teléfono registrado', 'error');
    if (t.startsWith('0')) t = '58' + t.substring(1); else if (t.length === 10) t = '58' + t;

    const msg = `LIQUIDACIÓN DE VACACIONES\n${appState.parametros.nombre_empresa}\n\nHola ${v.empleado.nombre}, aquí tienes el detalle de tu liquidación de vacaciones para el período ${v.periodo}:\n\nFecha de Inicio: ${v.fechaInicio}\nFecha de Reincorporación: ${v.fechaReincorporacion}\nTasa BCV: ${v.tasaBCV.toFixed(2)} Bs/$\n\nGRAN TOTAL NETO A COBRAR:\nBs. ${fNum(v.granTotalBs)} ($${v.granTotalUSD.toFixed(2)})\n\nPor favor, confirma la recepción de esta liquidación.`;
    window.open(`https://wa.me/${t}?text=${encodeURIComponent(msg)}`, '_blank');
}