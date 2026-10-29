/* ============================================================
   js/liquidaciones.js
   Liquidación definitiva (finiquito) con cálculos de prestaciones,
   vacaciones y utilidades fraccionadas.
   ============================================================ */

function calcularPrestaciones() {
    const id = gId('pres-emp-select').value;
    const fc = gId('pres-fecha-calculo').value;
    const m = gId('pres-motivo').value;
    const descConcepto = gId('pres-desc-concepto').value.trim();
    const descMonto = parseFloat(gId('pres-desc-monto').value) || 0;

    if (!id || !fc) return showToast('Faltan datos de liquidación', 'error');

    const e = appState.empleados.find(x => String(x.id) === String(id));
    if (!e || !e.fecha_ingreso) return showToast('Empleado sin fecha de ingreso', 'error');

    const fi = new Date(e.fecha_ingreso + 'T00:00:00');
    const fca = new Date(fc + 'T00:00:00');
    if (fca < fi) return showToast('Fechas inválidas', 'error');

    let y = fca.getFullYear() - fi.getFullYear();
    let mo = fca.getMonth() - fi.getMonth();
    let d = fca.getDate() - fi.getDate();
    if (d < 0) { mo--; const p = new Date(fca.getFullYear(), fca.getMonth(), 0); d += p.getDate(); }
    if (mo < 0) { y--; mo += 12; }

    const mt = (y * 12) + mo;
    let dpAntig = 0;
    if (mt >= 6) {
        let frac = (mo >= 6) ? 1 : 0;
        dpAntig = (y + frac) * 30;
    } else if (mt >= 3) {
        dpAntig = 15;
    }

    const tasa = parseFloat(gId('nom-tasa-bcv').value) || 36.5;
    const sb = obtenerSalarioBaseParaFecha(e.id, fc, e.sueldo);
    const sd = sb / 30;
    const tuAntig = sd * dpAntig;
    const tbAntig = tuAntig * tasa;

    const mesesFrac = mo + (d / 30);
    const diasVacPorAnio = Math.min(30, 15 + Math.max(0, y));
    const diasBonoPorAnio = Math.min(30, 16 + Math.max(0, y));
    const dpVacFracc = (diasVacPorAnio / 12) * mesesFrac;
    const dpBonoFracc = (diasBonoPorAnio / 12) * mesesFrac;
    const tuVacFracc = sd * dpVacFracc;
    const tbVacFracc = tuVacFracc * tasa;
    const tuBonoFracc = sd * dpBonoFracc;
    const tbBonoFracc = tuBonoFracc * tasa;

    let diasTrabAnioUti = 360;
    const anioEgreso = fca.getFullYear();
    if (fi.getFullYear() === anioEgreso) {
        diasTrabAnioUti = ((fca.getMonth() - fi.getMonth()) * 30) + Math.max(0, fca.getDate() - fi.getDate());
    } else {
        diasTrabAnioUti = (fca.getMonth() * 30) + Math.min(30, fca.getDate());
    }
    diasTrabAnioUti = Math.max(0, Math.min(360, diasTrabAnioUti));

    const diasBaseUtilidad = appState.parametros.dias_utilidades || 30;
    const dpUtiFracc = (diasBaseUtilidad / 360) * diasTrabAnioUti;
    const tuUtiFracc = sd * dpUtiFracc;
    const tbUtiFracc = tuUtiFracc * tasa;

    const anticipoSocialBs = totalAnticiposBs(e.id);
    const anticipoSocialUSD = anticipoSocialBs / tasa;
    const deduccionesTotalesUSD = descMonto + anticipoSocialUSD;
    const deduccionesTotalesBs = deduccionesTotalesUSD * tasa;

    const subtotalUSD = tuAntig + tuVacFracc + tuBonoFracc + tuUtiFracc;
    const subtotalBs = subtotalUSD * tasa;
    const granTotalUSD = Math.max(0, subtotalUSD - deduccionesTotalesUSD);
    const granTotalBs = granTotalUSD * tasa;

    appState.calculoPrestacionesActual = {
        empleado: e, fecha_ingreso: e.fecha_ingreso, fecha_calculo: fc, motivo: m,
        tiempo_servicio: `${y}a, ${mo}m, ${d}d`, salario_base: sb, salario_diario: sd,
        tasa_bcv: tasa, dias_pagar: dpAntig, total_usd_antiguedad: tuAntig,
        total_bs_antiguedad: tbAntig, dias_vac_fracc: dpVacFracc.toFixed(2),
        total_usd_vac: tuVacFracc, total_bs_vac: tbVacFracc,
        dias_bono_fracc: dpBonoFracc.toFixed(2), total_usd_bono: tuBonoFracc,
        total_bs_bono: tbBonoFracc, dias_uti_fracc: dpUtiFracc.toFixed(2),
        total_usd_uti: tuUtiFracc, total_bs_uti: tbUtiFracc,
        desc_concepto: descConcepto || (anticipoSocialBs > 0 ? `Anticipos de Prestaciones (Bs. ${fNum(anticipoSocialBs)})` : 'Deducciones Varias'),
        desc_monto: deduccionesTotalesUSD, desc_monto_bs: deduccionesTotalesBs,
        subtotal_usd: subtotalUSD, subtotal_bs: subtotalBs,
        total_usd: granTotalUSD, total_bs: granTotalBs
    };

    gId('res-pres-emp-nombre').innerText = e.nombre;
    gId('res-pres-cedula').innerText = e.cedula;
    gId('res-pres-cargo').innerText = e.cargos?.nombre || '-';
    const [iy, im, iv] = e.fecha_ingreso.split('-');
    gId('res-pres-ingreso').innerText = `${iv}/${im}/${iy}`;
    const [cy, cm, cd] = fc.split('-');
    gId('res-pres-egreso').innerText = `${cd}/${cm}/${cy}`;
    gId('res-pres-tiempo').innerText = `${y}a, ${mo}m, ${d}d`;
    gId('lbl-pres-salario-diario').innerText = `$${sd.toFixed(2)}/día (Bs. ${fNum(sd * tasa)}/día)`;
    gId('lbl-tasa-bcv-pres').innerText = `${tasa.toFixed(2)} Bs/$`;

    gId('tabla-liq-body').innerHTML = `
        <tr class="hover:bg-slate-900/50"><td class="p-3">Garantía de Antigüedad (Art. 142 LOTTT)</td><td class="p-3 text-center font-bold text-amber-500">${dpAntig} d</td><td class="p-3 font-mono text-slate-300">$${sd.toFixed(2)}</td><td class="p-3 font-bold text-emerald-400 font-mono">$${tuAntig.toFixed(2)}</td><td class="p-3 font-bold text-slate-200 font-mono">Bs. ${fNum(tbAntig)}</td></tr>
        <tr class="hover:bg-slate-900/50"><td class="p-3">Vacaciones Fraccionadas (Art. 196 LOTTT)</td><td class="p-3 text-center font-bold text-teal-400">${dpVacFracc.toFixed(2)} d</td><td class="p-3 font-mono text-slate-300">$${sd.toFixed(2)}</td><td class="p-3 font-bold text-emerald-400 font-mono">$${tuVacFracc.toFixed(2)}</td><td class="p-3 font-bold text-slate-200 font-mono">Bs. ${fNum(tbVacFracc)}</td></tr>
        <tr class="hover:bg-slate-900/50"><td class="p-3">Bono Vacacional Fraccionado (Art. 196 LOTTT)</td><td class="p-3 text-center font-bold text-teal-400">${dpBonoFracc.toFixed(2)} d</td><td class="p-3 font-mono text-slate-300">$${sd.toFixed(2)}</td><td class="p-3 font-bold text-emerald-400 font-mono">$${tuBonoFracc.toFixed(2)}</td><td class="p-3 font-bold text-slate-200 font-mono">Bs. ${fNum(tbBonoFracc)}</td></tr>
        <tr class="hover:bg-slate-900/50"><td class="p-3">Utilidades Fraccionadas del Ejercicio (Art. 131 LOTTT)</td><td class="p-3 text-center font-bold text-rose-400">${dpUtiFracc.toFixed(2)} d</td><td class="p-3 font-mono text-slate-300">$${sd.toFixed(2)}</td><td class="p-3 font-bold text-emerald-400 font-mono">$${tuUtiFracc.toFixed(2)}</td><td class="p-3 font-bold text-slate-200 font-mono">Bs. ${fNum(tbUtiFracc)}</td></tr>
        ${deduccionesTotalesUSD > 0 ? `<tr class="bg-rose-950/20 text-rose-300 font-medium"><td class="p-3"><div class="font-bold flex items-center"><i class="fa-solid fa-minus-circle mr-1.5 text-rose-400"></i> (-) ${appState.calculoPrestacionesActual.desc_concepto}</div></td><td class="p-3 text-center font-bold text-rose-400">-</td><td class="p-3 font-mono text-slate-300">-</td><td class="p-3 font-bold text-rose-400 font-mono">-$${deduccionesTotalesUSD.toFixed(2)}</td><td class="p-3 font-bold text-rose-400 font-mono">-Bs. ${fNum(deduccionesTotalesBs)}</td></tr>` : ''}
    `;

    gId('tabla-liq-foot').innerHTML = `<tr><td colspan="3" class="p-3 text-right uppercase tracking-wider font-extrabold text-xs">Total Liquidación Definitiva:</td><td class="p-3 font-extrabold text-emerald-400 text-sm font-mono">$${granTotalUSD.toFixed(2)}</td><td class="p-3 font-extrabold text-emerald-400 text-sm font-mono">Bs. ${fNum(granTotalBs)}</td></tr>`;
    gId('res-pres-gran-total-usd').innerText = `$${granTotalUSD.toFixed(2)}`;
    gId('res-pres-gran-total-bs').innerText = `Bs. ${fNum(granTotalBs)}`;
    gId('pres-resultado-container').classList.remove('hidden');
    showToast('Liquidación calculada');
}

async function guardarPrestaciones() {
    const p = appState.calculoPrestacionesActual;
    if (!p) return;

    const pay = {
        empleado_id: p.empleado.id, empleado: p.empleado.nombre,
        cargo: p.empleado.cargos?.nombre || '-', fecha_ingreso: p.fecha_ingreso,
        fecha_calculo: p.fecha_calculo, motivo: p.motivo, tiempo_servicio: p.tiempo_servicio,
        dias_pagar: p.dias_pagar, salario_base: p.salario_base, tasa_bcv: p.tasa_bcv,
        total_usd: p.total_usd, total_bs: p.total_bs, detalle_calculo: p
    };

    await safeQuery(supabaseClient.from('prestaciones').insert([pay]));
    fetchAllData();
    showToast('Liquidación guardada en el histórico');
}

function renderHistoricoPrestaciones() {
    const isMaster = appState.usuarioActual?.rol === 'master';
    const tbody = gId('tabla-historico-prestaciones-body');
    if (!tbody) return;

    tbody.innerHTML = appState.prestaciones.map(p => {
        const [cy, cm, cd] = (p.fecha_calculo || '').split('-');
        return `<tr class="hover:bg-slate-900/50">
            <td class="p-3.5 text-slate-300 font-mono text-xs">${cd}/${cm}/${cy}</td>
            <td class="p-3.5 font-bold text-white">${p.empleado}</td>
            <td class="p-3.5 text-amber-400 font-semibold">${p.motivo}</td>
            <td class="p-3.5 text-slate-400 text-[10px]">${p.tiempo_servicio}</td>
            <td class="p-3.5 text-center text-teal-400 font-bold">${p.dias_pagar} d</td>
            <td class="p-3.5 font-bold text-emerald-400 font-mono">$${Number(p.total_usd).toFixed(2)}</td>
            <td class="p-3.5 font-bold text-emerald-400 font-mono">Bs. ${fNum(p.total_bs)}</td>
            <td class="p-3.5 text-right space-x-1 sm:space-x-2">
                <button onclick="verReciboPrestacionesHistorico(${p.id})" class="bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 border border-amber-500/30 text-xs px-2.5 py-1 rounded-lg font-medium inline-flex items-center space-x-1 transition"><i class="fa-solid fa-receipt text-[11px]"></i><span>Ver Recibo</span></button>
               <button onclick="abrirFirmaLiquidacion('${p.id}')" class="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/30 text-xs px-2.5 py-1 rounded-lg font-medium inline-flex items-center space-x-1 transition" title="Firmar"><i class="fa-solid fa-signature"></i></button>
                ${isMaster ? `<button onclick="eliminarPrestacionesProcesadas(${p.id})" class="bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 border border-rose-500/30 text-xs px-2.5 py-1 rounded-lg font-medium inline-flex items-center space-x-1 transition"><i class="fa-solid fa-trash text-[11px]"></i></button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

async function eliminarPrestacionesProcesadas(id) {
    if (appState.usuarioActual?.rol !== 'master') return showToast('No tiene permisos para eliminar registros', 'error');
    if (confirm('¿Eliminar liquidación?')) {
        await safeQuery(supabaseClient.from('prestaciones').delete().eq('id', id));
        fetchAllData();
    }
}

function verReciboPrestacionesHistorico(id) {
    const p = appState.prestaciones.find(x => String(x.id) === String(id));
    if (p && p.detalle_calculo) {
        appState.calculoPrestacionesActual = p.detalle_calculo;
        const r = appState.calculoPrestacionesActual;
        gId('recibos-fecha-pago').innerText = `Liquidación - ${r.empleado.nombre}`;
        gId('area-impresion-recibos').innerHTML = `<div class="print-page relative group"><button onclick="enviarWhatsAppPrestaciones()" class="absolute top-4 right-4 bg-emerald-500 text-white rounded-full w-9 h-9 opacity-40 group-hover:opacity-100 print-hidden" title="WhatsApp"><i class="fa-brands fa-whatsapp text-xl"></i></button>${generarHTMLReciboPrestaciones(r)}</div>`;
        openModal('modal-recibos-nomina');
    }
}

function imprimirReciboPrestaciones() {
    const p = appState.calculoPrestacionesActual;
    if (p) {
        gId('print-container').innerHTML = `<div class="print-page">${generarHTMLReciboPrestaciones(p)}</div>`;
        window.print();
    }
}

function enviarWhatsAppPrestaciones() {
    const p = appState.calculoPrestacionesActual;
    if (!p || !p.empleado) return;
    const emp = p.empleado;
    let t = emp.telefono ? emp.telefono.replace(/\D/g, '') : '';
    if (!t) return showToast('Sin teléfono registrado', 'error');
    if (t.startsWith('0')) t = '58' + t.substring(1); else if (t.length === 10) t = '58' + t;

    const msg = `LIQUIDACIÓN FINAL DE TRABAJO\n${appState.parametros.nombre_empresa}\n\nTrabajador: ${emp.nombre}\nCargo: ${p.cargo || emp.cargos?.nombre || '-'}\nMotivo: ${p.motivo}\nFecha Egreso: ${p.fecha_calculo}\nTiempo: ${p.tiempo_servicio}\n\nGRAN TOTAL A COBRAR:\nBs. ${fNum(Number(p.total_bs))} ($${Number(p.total_usd).toFixed(2)})`;
    window.open(`https://wa.me/${t}?text=${encodeURIComponent(msg)}`, '_blank');
}

function generarHTMLReciboPrestaciones(p) {
    const emp = p.empleado;
    const [iy, im, id] = p.fecha_ingreso.split('-');
    const [cy, cm, cd] = p.fecha_calculo.split('-');

    return `<div class="recibo-prestaciones-print bg-white text-black p-4 font-sans max-w-4xl mx-auto border-2 border-black my-2 text-[10px]">
        <div class="flex justify-between items-start mb-2 pb-1 border-b-2 border-black"><div><h2 class="text-xl font-black tracking-widest text-black uppercase">${appState.parametros.nombre_empresa.split('/')[0].trim()}</h2></div><div class="text-right"><h3 class="text-xs font-extrabold text-black uppercase">${appState.parametros.nombre_empresa}</h3><p class="text-[9px] text-slate-800 font-semibold">${appState.parametros.rif_empresa}</p></div></div>
        <div class="bg-[#fef3c7] text-center font-bold text-[10px] py-1 border border-black mb-2 uppercase tracking-wider text-black">RECIBO DE FINIQUITO Y LIQUIDACIÓN DEFINITIVA</div>
        <table class="w-full text-[9.5px] border border-black mb-2 font-semibold">
            <tr><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black w-32 font-bold text-black">TRABAJADOR</td><td class="px-1.5 py-0.5 border-r border-b border-black font-bold uppercase text-black">${emp.nombre}</td><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black w-24 font-bold text-black">CÉDULA</td><td class="px-1.5 py-0.5 border-b border-black text-black">${emp.cedula || '-'}</td></tr>
            <tr><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black font-bold text-black">CARGO</td><td class="px-1.5 py-0.5 border-r border-b border-black uppercase text-black">${p.cargo || emp.cargos?.nombre || '-'}</td><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black font-bold text-black">MOTIVO</td><td class="px-1.5 py-0.5 border-b border-black uppercase text-black">${p.motivo}</td></tr>
            <tr><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black font-bold text-black">FECHA INGRESO</td><td class="px-1.5 py-0.5 border-r border-b border-black text-black">${id}/${im}/${iy}</td><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black font-bold text-black">FECHA EGRESO</td><td class="px-1.5 py-0.5 border-b border-black font-bold text-rose-600">${cd}/${cm}/${cy}</td></tr>
            <tr><td class="bg-slate-100 px-1.5 py-0.5 border-r border-black font-bold text-black">TIEMPO SERVICIO</td><td class="px-1.5 py-0.5 border-r border-black font-bold text-black">${p.tiempo_servicio}</td><td class="bg-slate-100 px-1.5 py-0.5 border-r border-black font-bold text-black">TASA BCV APLICADA</td><td class="px-1.5 py-0.5 font-bold text-black">${Number(p.tasa_bcv).toFixed(2)} Bs/$</td></tr>
        </table>
        <table class="w-full text-[9px] border border-black mb-2">
            <thead><tr class="bg-[#fef3c7] font-bold border-b border-black text-black"><th class="px-1.5 py-0.5 text-left border-r border-black text-black">CONCEPTO LEGAL</th><th class="px-1.5 py-0.5 text-center border-r border-black w-24 text-black">DÍAS</th><th class="px-1.5 py-0.5 text-right border-r border-black w-24 text-black">SALARIO DIARIO ($)</th><th class="px-1.5 py-0.5 text-right border-r border-black w-28 text-black">MONTO ($)</th><th class="px-1.5 py-0.5 text-right text-black w-36">MONTO (BS)</th></tr></thead>
            <tbody class="divide-y divide-slate-300">
                <tr><td class="px-1.5 py-0.5">Garantía de Antigüedad (Art. 142 LOTTT)</td><td class="px-1.5 py-0.5 text-center font-mono text-black">${p.dias_pagar} d</td><td class="px-1.5 py-0.5 text-right font-mono text-black">$${Number(p.salario_diario).toFixed(2)}</td><td class="px-1.5 py-0.5 text-right font-mono font-bold text-black">$${Number(p.total_usd_antiguedad || p.total_usd).toFixed(2)}</td><td class="px-1.5 py-0.5 text-right font-mono font-bold text-black">${fNum(p.total_bs_antiguedad || p.total_bs)}</td></tr>
                <tr><td class="px-1.5 py-0.5">Vacaciones Fraccionadas</td><td class="px-1.5 py-0.5 text-center font-mono text-black">${p.dias_vac_fracc || 0} d</td><td class="px-1.5 py-0.5 text-right font-mono text-black">$${Number(p.salario_diario).toFixed(2)}</td><td class="px-1.5 py-0.5 text-right font-mono font-bold text-black">$${Number(p.total_usd_vac || 0).toFixed(2)}</td><td class="px-1.5 py-0.5 text-right font-mono font-bold text-black">${fNum(p.total_bs_vac || 0)}</td></tr>
                <tr><td class="px-1.5 py-0.5">Bono Vacacional Fraccionado</td><td class="px-1.5 py-0.5 text-center font-mono text-black">${p.dias_bono_fracc || 0} d</td><td class="px-1.5 py-0.5 text-right font-mono text-black">$${Number(p.salario_diario).toFixed(2)}</td><td class="px-1.5 py-0.5 text-right font-mono font-bold text-black">$${Number(p.total_usd_bono || 0).toFixed(2)}</td><td class="px-1.5 py-0.5 text-right font-mono font-bold text-black">${fNum(p.total_bs_bono || 0)}</td></tr>
                <tr><td class="px-1.5 py-0.5">Utilidades Fraccionadas</td><td class="px-1.5 py-0.5 text-center font-mono text-black">${p.dias_uti_fracc || 0} d</td><td class="px-1.5 py-0.5 text-right font-mono text-black">$${Number(p.salario_diario).toFixed(2)}</td><td class="px-1.5 py-0.5 text-right font-mono font-bold text-black">$${Number(p.total_usd_uti || 0).toFixed(2)}</td><td class="px-1.5 py-0.5 text-right font-mono font-bold text-black">${fNum(p.total_bs_uti || 0)}</td></tr>
                ${p.desc_monto > 0 ? `<tr class="bg-slate-100 font-bold text-black"><td class="px-1.5 py-0.5">(-) ${p.desc_concepto || 'Deducciones'}</td><td class="px-1.5 py-0.5 text-center font-mono">-</td><td class="px-1.5 py-0.5 text-right font-mono">-</td><td class="px-1.5 py-0.5 text-right font-mono text-rose-600">-$${Number(p.desc_monto).toFixed(2)}</td><td class="px-1.5 py-0.5 text-right font-mono text-rose-600">-${fNum(Number(p.desc_monto_bs || p.desc_monto * p.tasa_bcv))}</td></tr>` : ''}
            </tbody>
        </table>
        <div class="flex justify-between items-center bg-[#fef3c7] border-2 border-black p-1.5 font-bold text-[10px] mb-3 mt-4 text-black"><span class="uppercase font-black">GRAN TOTAL NETO A LIQUIDAR:</span><span class="font-mono text-xs font-black text-black">$${Number(p.total_usd).toFixed(2)} / ${fNum(p.total_bs)} Bs</span></div>
        <div class="border-t border-black pt-2 mt-6 text-black"><h4 class="text-center font-extrabold text-[9px] tracking-wider mb-4 text-black">RECIBO CONFORME</h4>
            <div class="grid grid-cols-2 gap-8 text-[9.5px] font-semibold text-black">
                <div class="flex items-end"><span class="mr-2">PATRONO:</span><span class="border-b border-black flex-1"></span></div>
                <div class="flex items-end"><span class="mr-2">TRABAJADOR:</span><span class="border-b border-black flex-1"></span></div>
            </div>
        </div>
    </div>`;
}
