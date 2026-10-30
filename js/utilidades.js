/* ============================================================
   js/utilidades.js
   Cálculo de utilidades, pagos parciales por %, historial y recibos.
   ============================================================ */

async function generarUtilidades() {
    // 2B.1 — Precargar tasa BCV desde API si el campo está vacío
    await precargarTasaUtilidades();

    const p = gId('uti-periodo').value;
    const f = gId('uti-fecha-pago').value;

    // 2B.2 — Sin fallbacks hardcodeados: solo tasa del input o de nómina
    const tasaInput  = parseFloat(gId('uti-tasa-bcv').value);
    const tasaNomina = parseFloat(gId('nom-tasa-bcv').value);
    const t = tasaInput > 0 ? tasaInput : (tasaNomina > 0 ? tasaNomina : 0);

    const porcentajeSolicitado = parseFloat(gId('uti-porcentaje').value);

    if (!p || !f) return showToast('Indique el período y la fecha de pago', 'error');
    if (!t || t <= 0) return showToast('Debe indicar la Tasa BCV antes de calcular (use el campo o sincronice)', 'error');
    if (isNaN(porcentajeSolicitado) || porcentajeSolicitado <= 0) return showToast('Indique un porcentaje válido mayor a 0', 'error');
    if (porcentajeSolicitado > 100) return showToast('El porcentaje no puede ser mayor a 100', 'error');

    appState.calculoUtilidadesActual = [];
    const emps = appState.empleados.filter(e => e.activo);
    if (emps.length === 0) return showToast('No hay empleados activos para calcular', 'error');

    const diasBaseUtilidad = appState.parametros.dias_utilidades || 30;
    let filasHtml = '';
    let huboAlgoQuePagar = false;

    emps.forEach(e => {
        const pagosPrevios = (appState.utilidades || []).filter(u =>
            String(u.empleado_id) === String(e.id) && String(u.periodo) === String(p)
        );
        const porcentajePagadoPrevio = pagosPrevios.reduce((s, u) => {
            const pct = (u.porcentaje_pagado !== undefined && u.porcentaje_pagado !== null) ? Number(u.porcentaje_pagado) : 100;
            return s + pct;
        }, 0);
        const porcentajeRestante = Math.max(0, 100 - porcentajePagadoPrevio);

        let dt = 360;
        if (e.fecha_ingreso) {
            const fI = new Date(e.fecha_ingreso + 'T00:00:00');
            const anioIngreso = fI.getFullYear();
            const anioPeriodo = parseInt(p);
            if (anioIngreso === anioPeriodo) {
                dt = ((12 - (fI.getMonth() + 1)) * 30) + Math.max(0, 30 - fI.getDate() + 1);
            } else if (anioIngreso > anioPeriodo) { dt = 0; }
        }

        if (dt <= 0 || porcentajeRestante <= 0) {
            if (porcentajeRestante <= 0) {
                filasHtml += `<tr class="opacity-50">
                    <td class="p-3"><div class="font-bold text-white">${e.nombre}</div><div class="text-[10px] text-slate-400">${e.cedula}</div></td>
                    <td class="p-3 text-slate-300 font-mono">${e.fecha_ingreso || '-'}</td>
                    <td class="p-3 text-center text-rose-400 font-bold">${dt} d</td>
                    <td class="p-3 text-center text-teal-400 font-bold">-</td>
                    <td class="p-3 text-center text-sky-400 font-bold">100.00%</td>
                    <td class="p-3 text-center text-slate-500 font-bold">0%</td>
                    <td class="p-3 text-right text-slate-500 font-mono" colspan="3">✓ Ya pagado al 100%</td>
                    <td class="p-3 text-right"><span class="text-emerald-400 text-[11px] font-bold"><i class="fa-solid fa-check"></i> Completado</span></td>
                </tr>`;
            }
            return;
        }

        const porcentajeAplicar = Math.min(porcentajeSolicitado, porcentajeRestante);
        const fraccion = porcentajeAplicar / 100;

        const sb = Number(e.sueldo) || 0;
        const dp = (diasBaseUtilidad / 360) * dt;
        const tu = (sb / 30) * dp;
        const tb = tu * t;
        const subMensual = Number(e.otros_ingresos) || 0;
        const subDiario = subMensual / 30;
        const subUSDTotal = subDiario * dp;
        const subBsTotal = subUSDTotal * t;
        const granUSDTotal = tu + subUSDTotal;
        const granBsTotal = tb + subBsTotal;

        const tuPago = tu * fraccion;
        const tbPago = tuPago * t;

        const retencionIncesUSD = (typeof getFeatureFlag === 'function' && getFeatureFlag('utilidades.inces')) ? (tuPago * 0.005) : 0;
        const retencionIncesBs = retencionIncesUSD * t;

        const tuPagoNeto = tuPago - retencionIncesUSD;
        const tbPagoNeto = tbPago - retencionIncesBs;

        const subUSDPago = (typeof getFeatureFlag === 'function' && getFeatureFlag('utilidades.subsidio')) ? (subUSDTotal * fraccion) : 0;
        const subBsPago = subUSDPago * t;

        const granUSDPago = tuPagoNeto + subUSDPago;
        const granBsPago = tbPagoNeto + subBsPago;
        const porcentajeAcumulado = porcentajePagadoPrevio + porcentajeAplicar;

        huboAlgoQuePagar = true;

        // 2B.3 — Congelar tasa al construir el objeto (x.tasa_bcv se usará tal cual al guardar)
        appState.calculoUtilidadesActual.push({
            empleado: e, periodo: p, fecha_pago: f, dias_trabajados: dt, dias_pagados: dp,
            salario_base: sb, subsidio_mensual: subMensual, subsidio_usd: subUSDPago,
            subsidio_bs: subBsPago, subsidio_usd_total: subUSDTotal, subsidio_bs_total: subBsTotal,
            tasa_bcv: t, total_usd: tuPago, total_bs: tbPago, total_usd_anual: tu,
            total_bs_anual: tb, gran_total_usd: granUSDPago, gran_total_bs: granBsPago,
            gran_total_usd_anual: granUSDTotal, gran_total_bs_anual: granBsTotal,
            porcentaje_pagado: porcentajeAplicar, porcentaje_pagado_previo: porcentajePagadoPrevio,
            porcentaje_acumulado: porcentajeAcumulado, porcentaje_restante: porcentajeRestante
        });

        const badgeEstado = porcentajeAcumulado >= 100
            ? `<span class="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-1.5 py-0.5 rounded">100%</span>`
            : `<span class="text-[10px] bg-amber-950 text-amber-300 border border-amber-800 px-1.5 py-0.5 rounded">${porcentajeAcumulado.toFixed(2)}%</span>`;

        filasHtml += `<tr class="hover:bg-slate-900/50 transition">
            <td class="p-3"><div class="font-bold text-white">${e.nombre}</div><div class="text-[10px] text-slate-400">${e.cedula}</div></td>
            <td class="p-3 text-slate-300 font-mono">${e.fecha_ingreso || '-'}</td>
            <td class="p-3 text-center text-rose-400 font-bold">${dt} d</td>
            <td class="p-3 text-center text-teal-400 font-bold">${dp.toFixed(2)} d</td>
            <td class="p-3 text-center text-sky-400 font-bold font-mono">${porcentajePagadoPrevio.toFixed(2)}%</td>
            <td class="p-3 text-center text-rose-300 font-bold font-mono">${porcentajeAplicar.toFixed(2)}%</td>
            <td class="p-3 text-right font-semibold text-emerald-400 font-mono">$${granUSDPago.toFixed(2)}</td>
            <td class="p-3 text-right font-semibold text-emerald-400 font-mono">Bs. ${fNum(granBsPago)}</td>
            <td class="p-3 text-right text-slate-300 font-mono">$${granUSDTotal.toFixed(2)} ${badgeEstado}</td>
            <td class="p-3 text-right space-x-1">
                <button onclick="verResumenUtilidadIndividual('${e.id}')" class="bg-sky-600/20 hover:bg-sky-600/40 text-sky-400 border border-sky-500/30 text-xs px-2.5 py-1 rounded-lg font-medium transition shadow" title="Ver Recibo"><i class="fa-solid fa-receipt"></i></button>
                <button onclick="enviarWhatsAppUtilidadActual('${e.id}')" class="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 text-xs px-2.5 py-1 rounded-lg font-medium transition shadow" title="Enviar por WhatsApp"><i class="fa-brands fa-whatsapp"></i></button>
            </td>
        </tr>`;
    });

    if (!filasHtml) {
        filasHtml = '<tr><td colspan="10" class="p-4 text-center text-slate-500">No hay empleados con días a pagar en el período.</td></tr>';
    }

    gId('tabla-utilidades-body').innerHTML = filasHtml;
    if (huboAlgoQuePagar) {
        gId('uti-resultados').classList.remove('hidden');
        showToast('Utilidades calculadas para pago parcial');
    } else {
        gId('uti-resultados').classList.add('hidden');
        showToast('Todos los empleados ya tienen el 100% pagado en este período', 'error');
    }
    verificarEstadoPeriodo();
}
function verificarEstadoPeriodo() {
    const p = gId('uti-periodo').value;
    const badge = gId('uti-estado-pago-periodo');
    const texto = gId('uti-estado-texto');
    const pct = gId('uti-estado-porcentaje');
    if (!p || !badge) return;

    const registrosPeriodo = (appState.utilidades || []).filter(u => String(u.periodo) === String(p));
    if (registrosPeriodo.length === 0) {
        badge.classList.add('hidden');
        return;
    }

    const empleadosUnicos = [...new Set(registrosPeriodo.map(r => String(r.empleado_id)))];
    let minPct = 100;

    empleadosUnicos.forEach(empId => {
        const pctEmp = registrosPeriodo
            .filter(r => String(r.empleado_id) === empId)
            .reduce((s, r) => s + Number(r.porcentaje_pagado !== undefined ? r.porcentaje_pagado : 100), 0);
        if (pctEmp < minPct) minPct = pctEmp;
    });

    badge.classList.remove('hidden');
    if (minPct >= 100) {
        texto.innerText = `Período ${p}: TODOS los empleados tienen el 100% pagado`;
        pct.className = 'font-mono font-bold text-emerald-400';
        pct.innerText = '100.00%';
    } else if (minPct > 0) {
        texto.innerText = `Período ${p}: hay pagos parciales registrados (mínimo pagado a un empleado)`;
        pct.className = 'font-mono font-bold text-amber-400';
        pct.innerText = `${minPct.toFixed(2)}% acumulado`;
    } else {
        badge.classList.add('hidden');
    }
}

async function procesarUtilidadesGlobal() {
    if (appState.calculoUtilidadesActual.length === 0) return;

    const payloadSupabase = appState.calculoUtilidadesActual.map(x => ({
        periodo: x.periodo, fecha_pago: x.fecha_pago, empleado_id: x.empleado.id,
        empleado: x.empleado.nombre, cargo: x.empleado.cargos?.nombre || '-', tasa_bcv: x.tasa_bcv,
        salario_base: x.salario_base, dias_trabajados: x.dias_trabajados, dias_pagados: x.dias_pagados,
        total_usd: x.total_usd, total_bs: x.total_bs, subsidio_usd: x.subsidio_usd,
        subsidio_bs: x.subsidio_bs, gran_total_usd: x.gran_total_usd, gran_total_bs: x.gran_total_bs,
        porcentaje_pagado: x.porcentaje_pagado, porcentaje_acumulado: x.porcentaje_acumulado,
        total_usd_anual: x.total_usd_anual, total_bs_anual: x.total_bs_anual,
        gran_total_usd_anual: x.gran_total_usd_anual, gran_total_bs_anual: x.gran_total_bs_anual,
        detalle_calculo: x
    }));

    const insertado = await safeQuery(supabaseClient.from('utilidades').insert(payloadSupabase).select(), 'insert_utilidades');
    let registrosNuevos = [];

    if (insertado && insertado.length > 0) {
        registrosNuevos = insertado;
    } else {
        registrosNuevos = payloadSupabase.map((reg, idx) => ({
            ...reg, id: Date.now() + idx, created_at: new Date().toISOString(), _local: true
        }));
        console.warn('[Utilidades] Guardado solo en local (Supabase falló)');
    }

    registrosNuevos.forEach(reg => appState.utilidades.unshift(reg));
    localStorage.setItem('nomina_utilidades', JSON.stringify(appState.utilidades));

    gId('uti-resultados').classList.add('hidden');
    renderHistoricoUtilidades();
    showToast('Pago parcial de utilidades guardado en la nube');
}

function renderHistoricoUtilidades() {
    const gr = {};
    const isMaster = appState.usuarioActual?.rol === 'master';
    const tbody = gId('tabla-historico-utilidades-body');
    if (!tbody) return;

    appState.utilidades.forEach(u => {
        const k = `${u.periodo}|${u.fecha_pago}`;
        if (!gr[k]) gr[k] = {
            p: u.periodo, f: u.fecha_pago, c: 0, tu: 0, tsub: 0, tgt: 0, tgtb: 0,
            porcentaje_pagado: 0, porcentaje_acumulado_min: 100, porcentaje_acumulado_max: 0
        };
        gr[k].c++;
        gr[k].tu += Number(u.total_usd) || 0;
        gr[k].tsub += Number(u.subsidio_usd) || 0;
        gr[k].tgt += Number(u.gran_total_usd || u.total_usd) || 0;
        gr[k].tgtb += Number(u.gran_total_bs || u.total_bs) || 0;
        const pct = Number(u.porcentaje_pagado !== undefined ? u.porcentaje_pagado : 100);
        gr[k].porcentaje_pagado = pct;
        const pctAcum = Number(u.porcentaje_acumulado !== undefined ? u.porcentaje_acumulado : 100);
        if (pctAcum < gr[k].porcentaje_acumulado_min) gr[k].porcentaje_acumulado_min = pctAcum;
        if (pctAcum > gr[k].porcentaje_acumulado_max) gr[k].porcentaje_acumulado_max = pctAcum;
    });

    tbody.innerHTML = Object.keys(gr).sort().reverse().map(k => {
        const g = gr[k];
        let estadoBadge = '';
        if (g.porcentaje_acumulado_min >= 100) {
            estadoBadge = `<span class="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded font-bold"><i class="fa-solid fa-check"></i> Completado</span>`;
        } else {
            estadoBadge = `<span class="text-[10px] bg-amber-950 text-amber-300 border border-amber-800 px-2 py-0.5 rounded font-bold"><i class="fa-solid fa-clock"></i> Parcial</span>`;
        }

        return `<tr class="hover:bg-slate-900/50">
            <td class="p-3.5 font-bold text-white">${g.p}</td>
            <td class="p-3.5 text-slate-300 font-mono">${g.f}</td>
            <td class="p-3.5 text-center text-sky-400 font-semibold">${g.c}</td>
            <td class="p-3.5 text-center text-rose-300 font-bold font-mono">${g.porcentaje_pagado.toFixed(2)}%</td>
            <td class="p-3.5 text-center text-amber-300 font-bold font-mono">${g.porcentaje_acumulado_min.toFixed(2)}%${g.porcentaje_acumulado_max !== g.porcentaje_acumulado_min ? ` - ${g.porcentaje_acumulado_max.toFixed(2)}%` : ''}</td>
            <td class="p-3.5 text-center">${estadoBadge}</td>
            <td class="p-3.5 text-slate-300 font-mono">$${g.tu.toFixed(2)}</td>
            <td class="p-3.5 text-amber-400 font-mono">$${g.tsub.toFixed(2)}</td>
            <td class="p-3.5 font-bold text-emerald-400 font-mono">$${g.tgt.toFixed(2)}</td>
            <td class="p-3.5 font-bold text-emerald-400 font-mono">Bs. ${fNum(g.tgtb)}</td>
            <td class="p-3.5 text-right space-x-1">
                <button onclick="verDetalleUtilidades('${g.p}', '${g.f}')" class="bg-sky-600/20 hover:bg-sky-600/40 text-sky-400 border border-sky-500/30 text-xs px-2.5 py-1 rounded-lg font-medium inline-flex items-center space-x-1 transition"><i class="fa-solid fa-list text-[11px]"></i><span>Resumen</span></button>
                <button onclick="verRecibosUtilidadesHistorico('${g.p}', '${g.f}')" class="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 text-xs px-2.5 py-1 rounded-lg font-medium inline-flex items-center space-x-1 transition"><i class="fa-solid fa-receipt text-[11px]"></i><span>Recibos</span></button>
               <button onclick="abrirFirmaUtilidades('${g.p}', '${g.f}')" class="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/30 text-xs px-2.5 py-1 rounded-lg font-medium inline-flex items-center space-x-1 transition" title="Firmar Lote"><i class="fa-solid fa-signature"></i><span>Firmas</span></button>
                ${isMaster ? `<button onclick="eliminarUtilidadesProcesadas('${g.p}', '${g.f}')" class="bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 border border-rose-500/30 text-xs px-2.5 py-1 rounded-lg font-medium inline-flex items-center space-x-1 transition"><i class="fa-solid fa-trash text-[11px]"></i></button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

async function eliminarUtilidadesProcesadas(p, f) {
    if (appState.usuarioActual?.rol !== 'master') return showToast('No tiene permisos para eliminar registros', 'error');
    if (!confirm(`¿Eliminar el pago parcial de utilidades del período ${p} con fecha ${f}?`)) return;

    await safeQuery(supabaseClient.from('utilidades').delete().eq('periodo', p).eq('fecha_pago', f), 'delete_utilidades');

    const antes = appState.utilidades.length;
    appState.utilidades = appState.utilidades.filter(u => !(String(u.periodo) === String(p) && String(u.fecha_pago) === String(f)));
    const eliminados = antes - appState.utilidades.length;
    localStorage.setItem('nomina_utilidades', JSON.stringify(appState.utilidades));

    renderHistoricoUtilidades();
    verificarEstadoPeriodo();
    showToast(`Pago parcial eliminado (${eliminados} registro/s)`);
}

function verResumenUtilidadIndividual(id) {
    const u = appState.calculoUtilidadesActual.find(x => String(x.empleado.id) === String(id));
    if (u) {
        gId('recibos-fecha-pago').innerText = `${u.periodo} (${u.fecha_pago})`;
        gId('area-impresion-recibos').innerHTML = `<div class="print-page relative group"><button onclick="enviarWhatsAppUtilidadActual('${id}')" class="absolute top-4 right-4 bg-emerald-500 text-white rounded-full w-9 h-9 opacity-40 group-hover:opacity-100 print-hidden" title="WhatsApp"><i class="fa-brands fa-whatsapp text-xl"></i></button>${generarHTMLReciboUtilidad(u)}</div>`;
        openModal('modal-recibos-nomina');
    }
}

function verRecibosUtilidadesHistorico(p, f) {
    const regs = appState.utilidades.filter(u => u.periodo === p && u.fecha_pago === f);
    gId('recibos-fecha-pago').innerText = `${p} (${f})`;
    let html = '';

    for (let i = 0; i < regs.length; i += 2) {
        const r1 = { ...regs[i], empleado: { nombre: regs[i].empleado, cedula: appState.empleados.find(e => String(e.id) === String(regs[i].empleado_id))?.cedula, cargos: { nombre: regs[i].cargo }, fecha_ingreso: appState.empleados.find(e => String(e.id) === String(regs[i].empleado_id))?.fecha_ingreso } };
        html += `<div class="print-page mb-12 print:mb-0 relative group"><button onclick="enviarWhatsAppUtilidadHistorico(${regs[i].id})" class="absolute top-4 right-4 bg-emerald-500 text-white rounded-full w-9 h-9 opacity-40 group-hover:opacity-100 print-hidden" title="WhatsApp"><i class="fa-brands fa-whatsapp text-xl"></i></button>${generarHTMLReciboUtilidad(r1)}`;
        if (regs[i + 1]) {
            const r2 = { ...regs[i + 1], empleado: { nombre: regs[i + 1].empleado, cedula: appState.empleados.find(e => String(e.id) === String(regs[i + 1].empleado_id))?.cedula, cargos: { nombre: regs[i + 1].cargo }, fecha_ingreso: appState.empleados.find(e => String(e.id) === String(regs[i + 1].empleado_id))?.fecha_ingreso } };
            html += `<div class="divisor-recibo opacity-50 print:opacity-100 my-6 print:my-0"></div><div class="relative group"><button onclick="enviarWhatsAppUtilidadHistorico(${regs[i + 1].id})" class="absolute top-4 right-4 bg-emerald-500 text-white rounded-full w-9 h-9 opacity-40 group-hover:opacity-100 print-hidden" title="WhatsApp"><i class="fa-brands fa-whatsapp text-xl"></i></button>${generarHTMLReciboUtilidad(r2)}</div>`;
        }
        html += `</div>`;
    }

    gId('area-impresion-recibos').innerHTML = html;
    openModal('modal-recibos-nomina');
}

function generarHTMLReciboUtilidad(r) {
    const emp = r.empleado;
    const [y, m, d] = r.fecha_pago.split('-');
    const subUSD = Number(r.subsidio_usd) || 0;
    const subBs = Number(r.subsidio_bs) || 0;
    const tuBrutoUSD = Number(r.total_usd_anual ? (r.total_usd_anual * (Number(r.porcentaje_pagado || 100) / 100)) : r.total_usd) || 0;
    const incesUSD = (typeof getFeatureFlag === 'function' && getFeatureFlag('utilidades.inces')) ? (tuBrutoUSD * 0.005) : 0;
    const incesBs = incesUSD * Number(r.tasa_bcv || 1);

    const granUSD = Number(r.gran_total_usd || (tuBrutoUSD - incesUSD + subUSD));
    const granBs = Number(r.gran_total_bs || ((tuBrutoUSD - incesUSD + subUSD) * Number(r.tasa_bcv || 1)));

    return `<div class="recibo-utilidades-print bg-white text-black p-4 font-sans max-w-4xl mx-auto border-2 border-black my-2 text-[10px]">
        <div class="flex justify-between items-start mb-2 pb-1 border-b-2 border-black"><div><h2 class="text-xl font-black tracking-widest text-black uppercase">${appState.parametros.nombre_empresa.split('/')[0].trim()}</h2></div><div class="text-right"><h3 class="text-xs font-extrabold text-black uppercase">${appState.parametros.nombre_empresa}</h3><p class="text-[9px] text-slate-800 font-semibold">${appState.parametros.rif_empresa}</p></div></div>
        <div class="bg-[#fde0e0] text-center font-bold text-[10px] py-1 border border-black mb-2 uppercase tracking-wider text-black">RECIBO DE PAGO DE UTILIDADES (PERÍODO ${r.periodo})${r.porcentaje_pagado !== undefined && Number(r.porcentaje_pagado) < 100 ? ` — PAGO PARCIAL: ${Number(r.porcentaje_pagado).toFixed(2)}%` : ''}</div>
        <table class="w-full text-[9.5px] border border-black mb-2 font-semibold">
            <tr><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black w-32 font-bold text-black">TRABAJADOR</td><td class="px-1.5 py-0.5 border-r border-b border-black font-bold uppercase text-black">${emp.nombre}</td><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black w-24 font-bold text-black">CÉDULA</td><td class="px-1.5 py-0.5 border-b border-black text-black">${emp.cedula || '-'}</td></tr>
            <tr><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black font-bold text-black">CARGO</td><td class="px-1.5 py-0.5 border-r border-b border-black uppercase text-black">${emp.cargos?.nombre || '-'}</td><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black font-bold text-black">FECHA PAGO</td><td class="px-1.5 py-0.5 border-b border-black uppercase text-black">${d}/${m}/${y}</td></tr>
            <tr><td class="bg-slate-100 px-1.5 py-0.5 border-r border-black font-bold text-black">FECHA INGRESO</td><td class="px-1.5 py-0.5 border-r border-black text-black">${emp.fecha_ingreso || '-'}</td><td class="bg-slate-100 px-1.5 py-0.5 border-r border-black font-bold text-black">TASA BCV APLICADA</td><td class="px-1.5 py-0.5 font-bold text-black">${Number(r.tasa_bcv).toFixed(2)} Bs/$</td></tr>
        </table>
        <div class="font-bold text-[9px] uppercase text-black mb-0.5">1. Detalle de Cálculo Legal de Utilidades (Art. 131 LOTTT)</div>
        <table class="w-full text-[9px] border border-black mb-2">
           <thead><tr class="bg-[#fde0e0] font-bold border-b border-black text-black"><th class="px-1.5 py-0.5 text-center border-r border-black">DÍAS TRAB.</th><th class="px-1.5 py-0.5 text-center border-r border-black">DÍAS A PAGAR</th><th class="px-1.5 py-0.5 text-center border-r border-black">% PAGADO</th><th class="px-1.5 py-0.5 text-right border-r border-black">MONTO BRUTO ($)</th>${incesUSD > 0 ? '<th class="px-1.5 py-0.5 text-right border-r border-black text-rose-700">(-) INCES 0.5% ($)</th>' : ''}<th class="px-1.5 py-0.5 text-right border-r border-black">NETO LEY ($)</th><th class="px-1.5 py-0.5 text-right">NETO LEY (BS)</th></tr></thead>
            <tbody class="divide-y divide-slate-300">
                <tr>
                    <td class="px-1.5 py-0.5 text-center font-mono">${r.dias_trabajados} d</td>
                    <td class="px-1.5 py-0.5 text-center font-mono">${Number(r.dias_pagados).toFixed(2)} d</td>
                    <td class="px-1.5 py-0.5 text-center font-mono font-bold">${Number(r.porcentaje_pagado !== undefined ? r.porcentaje_pagado : 100).toFixed(2)}%</td>
                    <td class="px-1.5 py-0.5 text-right font-mono">$${tuBrutoUSD.toFixed(2)}</td>
                    ${incesUSD > 0 ? `<td class="px-1.5 py-0.5 text-right font-mono text-rose-700 font-semibold">-$${incesUSD.toFixed(2)}</td>` : ''}
                    <td class="px-1.5 py-0.5 text-right font-mono font-bold">$${(tuBrutoUSD - incesUSD).toFixed(2)}</td>
                    <td class="px-1.5 py-0.5 text-right font-mono font-bold">${fNum((tuBrutoUSD - incesUSD) * Number(r.tasa_bcv))}</td>
                </tr>
            </tbody>
        </table>
        <div class="bg-slate-50 border border-black p-2 mb-2 flex justify-between items-center text-[9px] text-black"><div><span class="font-bold uppercase text-black">2. Subsidio Especial No Obligatorio</span><span class="text-[8px] text-slate-700 block">Asignación voluntaria complementaria otorgada por la empresa</span></div><div class="text-right"><span class="text-[8px] uppercase font-bold text-slate-700 block">Total Subsidio Especial:</span><span class="font-mono font-bold text-black text-[9.5px]">$${subUSD.toFixed(2)} / ${fNum(subBs)} Bs</span></div></div>
        <div class="flex justify-between items-center bg-[#fde0e0] border-2 border-black p-1.5 font-bold text-[10px] mb-2 text-black"><span class="uppercase font-black">GRAN TOTAL UTILIDADES A COBRAR:</span><span class="font-mono text-xs font-black text-black">$${granUSD.toFixed(2)} / ${fNum(granBs)} Bs</span></div>
        <div class="border border-black p-1.5 mb-2 text-[8.5px] text-black leading-tight bg-slate-50"><strong>OBSERVACIONES:</strong> El subsidio no posee naturaleza salarial, ya que no desprende de la intención retributiva del trabajo prestado sino un beneficio eminentemente social para cubrir parte de sus gastos por bienes y/o servicios básicos en que incurre el trabajador. Por tal motivo se otorga como una ayuda al trabajador sin que sea de carácter obligatorio en futuras ocasiones.</div>
        <div class="border-t border-black pt-2 mt-2"><h4 class="text-center font-extrabold text-[9px] tracking-wider mb-4 text-black">RECIBO CONFORME DE UTILIDADES</h4>
            <div class="grid grid-cols-2 gap-8 text-[9.5px] font-semibold text-black">
                <div class="flex items-end"><span class="mr-2">FIRMA PATRONO:</span><span class="border-b border-black flex-1"></span></div>
                <div class="flex items-end"><span class="mr-2">FIRMA TRABAJADOR:</span><span class="border-b border-black flex-1"></span></div>
            </div>
        </div>
    </div>`;
}

function enviarWhatsAppUtilidadActual(id) {
    const u = appState.calculoUtilidadesActual.find(x => String(x.empleado.id) === String(id));
    if (!u) return;
    let t = u.empleado.telefono ? u.empleado.telefono.replace(/\D/g, '') : '';
    if (!t) return showToast('El empleado no tiene teléfono registrado', 'error');
    if (t.startsWith('0')) t = '58' + t.substring(1); else if (t.length === 10) t = '58' + t;

    const empresa = appState.parametros?.nombre_empresa || 'NóminaApp';
    const pct = Number(u.porcentaje_pagado) || 100;
    const pctTxt = pct < 100 ? ` — Pago Parcial: ${pct.toFixed(2)}%` : '';

    const msg =
        `*RECIBO DE PAGO DE UTILIDADES (PERÍODO ${u.periodo})${pctTxt}*\n` +
        `${empresa}\n\n` +
        `Trabajador: ${u.empleado.nombre}\n` +
        `Fecha de Pago: ${u.fecha_pago}\n` +
        `Tasa BCV aplicada: ${Number(u.tasa_bcv).toFixed(2)} Bs/$\n\n` +
        `*GRAN TOTAL A COBRAR:*\n` +
        `Bs. ${fNum(Number(u.gran_total_bs))} ($${Number(u.gran_total_usd).toFixed(2)})\n\n` +
        `Por favor, confirma la recepción de tu pago.`;

    window.open(`https://wa.me/${t}?text=${encodeURIComponent(msg)}`, '_blank');
}

function enviarWhatsAppUtilidadHistorico(id) {
    const r = appState.utilidades.find(x => String(x.id) === String(id));
    if (!r) return;
    const e = appState.empleados.find(x => String(x.id) === String(r.empleado_id));
    let t = e?.telefono ? e.telefono.replace(/\D/g, '') : '';
    if (!t) return showToast('Sin teléfono', 'error');
    if (t.startsWith('0')) t = '58' + t.substring(1); else if (t.length === 10) t = '58' + t;

    const msg = `RECIBO DE PAGO DE UTILIDADES (PERÍODO ${r.periodo})\n${appState.parametros.nombre_empresa}\n\nTrabajador: ${r.empleado}\nFecha de Pago: ${r.fecha_pago}\n\nPor favor, confirma la recepción de tu pago.`;
    window.open(`https://wa.me/${t}?text=${encodeURIComponent(msg)}`, '_blank');
}

function verDetalleUtilidades(p, f) {
    const regs = appState.utilidades.filter(u => u.periodo === p && u.fecha_pago === f);
    gId('detalle-uti-periodo').innerText = `${p} (${f})`;
    gId('print-uti-periodo').innerText = p;
    gId('print-uti-fecha').innerText = f;

    let tUti = 0, tSub = 0, tTotU = 0, tTotB = 0;

    gId('tabla-detalle-utilidades-body').innerHTML = regs.map(r => {
        const dTrab = r.dias_trabajados || 0;
        const dPag = Number(r.dias_pagados) || 0;
        const pct = Number(r.porcentaje_pagado !== undefined ? r.porcentaje_pagado : 100);
        const utiU = Number(r.total_usd) || 0;
        const subU = Number(r.subsidio_usd) || 0;
        const totU = Number(r.gran_total_usd || (utiU + subU));
        const totB = Number(r.gran_total_bs || r.total_bs);

        tUti += utiU; tSub += subU; tTotU += totU; tTotB += totB;

        return `<tr class="hover:bg-slate-800/40">
            <td class="p-2.5 font-semibold text-white">${r.empleado}</td>
            <td class="p-2.5 text-slate-400">${r.cargo || '-'}</td>
            <td class="p-2.5 text-center text-rose-400">${dTrab} d</td>
            <td class="p-2.5 text-center text-teal-400">${dPag.toFixed(2)} d</td>
            <td class="p-2.5 text-center text-sky-400 font-mono">${pct.toFixed(2)}%</td>
            <td class="p-2.5 text-slate-300 font-mono">$${utiU.toFixed(2)}</td>
            <td class="p-2.5 text-amber-400 font-mono">$${subU.toFixed(2)}</td>
            <td class="p-2.5 font-bold text-emerald-400 font-mono">$${totU.toFixed(2)}</td>
            <td class="p-2.5 font-bold text-emerald-400 font-mono">Bs. ${fNum(totB)}</td>
        </tr>`;
    }).join('');

    gId('tabla-detalle-utilidades-foot').innerHTML = `<tr>
        <td colspan="5" class="p-2.5 text-slate-300 text-right uppercase">Totales:</td>
        <td class="p-2.5 text-white font-mono">$${tUti.toFixed(2)}</td>
        <td class="p-2.5 text-amber-400 font-mono">$${tSub.toFixed(2)}</td>
        <td class="p-2.5 text-emerald-400 font-bold font-mono">$${tTotU.toFixed(2)}</td>
        <td class="p-2.5 text-emerald-400 font-bold font-mono">Bs. ${fNum(tTotB)}</td>
    </tr>`;

    openModal('modal-detalle-utilidades');
}

function imprimirDesgloseUtilidades() {
    gId('print-container').innerHTML = `<div class="p-4">${gId('area-impresion-utilidades').innerHTML}</div>`;
    window.print();
}
function abrirModalFirmaUtilidades(periodo, fecha) {
    const regs = appState.utilidades.filter(u => u.periodo === periodo && u.fecha_pago === fecha);
    const docs = regs.map(u => ({
        id: u.id,
        empleado: u.empleado,
        empleado_id: u.empleado_id,
        neto_bs: u.gran_total_bs || u.total_bs,
        periodo: `${periodo} (${fecha})`
    }));
    abrirModalFirmaGenerico('utilidades', docs);
}
/* ============================================================
   2B — Precarga automática de la tasa BCV en el módulo de Utilidades
   ============================================================ */

async function precargarTasaUtilidades() {
    const input = gId('uti-tasa-bcv');
    if (!input) return;
    // No sobreescribir un override manual
    if (input.value && parseFloat(input.value) > 0) return;

    try {
        if (typeof fetchTasaBCV === 'function') {
            await fetchTasaBCV();
        }
        // fetchTasaBCV() normalmente llena nom-tasa-bcv; copiamos si uti sigue vacío
        const nomTasa = gId('nom-tasa-bcv');
        if ((!input.value || parseFloat(input.value) <= 0) && nomTasa && parseFloat(nomTasa.value) > 0) {
            input.value = nomTasa.value;
        }
    } catch (e) {
        console.warn('[Utilidades] No se pudo precargar tasa BCV:', e);
    }
}

/* Listeners de cambio en período / fecha de pago (idempotentes) */
(function attachUtilidadesListeners() {
    const tryAttach = () => {
        const up = gId('uti-periodo');
        const uf = gId('uti-fecha-pago');
        if (up && !up._tasaListener) {
            up.addEventListener('change', () => { precargarTasaUtilidades(); });
            up._tasaListener = true;
        }
        if (uf && !uf._tasaListener) {
            uf.addEventListener('change', () => { precargarTasaUtilidades(); });
            uf._tasaListener = true;
        }
    };
    if (typeof document === 'undefined') return;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryAttach);
    } else {
        tryAttach();
    }
})();
