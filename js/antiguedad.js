/* ============================================================
   js/antiguedad.js
   Prestaciones sociales (LOTTT Art. 142/143), conciliación
   mes a mes, cálculo trimestral + retroactivo, recibos.
   ============================================================ */

function obtenerSalarioBaseParaFecha(empId, fechaISO, sueldoActual) {
    const mesClave = fechaISO.substring(0, 7);

    const exacto = appState.historicoSalarios.find(h =>
        String(h.empleado_id) === String(empId) && h.mes === mesClave
    );
    if (exacto) return Number(exacto.sueldo_base) || Number(sueldoActual) || 0;

    const anteriores = appState.historicoSalarios
        .filter(h => String(h.empleado_id) === String(empId) && h.mes < mesClave)
        .sort((a, b) => b.mes.localeCompare(a.mes));

    if (anteriores.length === 0) return Number(sueldoActual) || 0;

    const ultimo = anteriores[0];
    const [uY, uM] = ultimo.mes.split('-').map(Number);
    const [qY, qM] = mesClave.split('-').map(Number);
    const diffMeses = (qY - uY) * 12 + (qM - uM);

    if (diffMeses >= 2) return Number(sueldoActual) || 0;
    return Number(ultimo.sueldo_base) || Number(sueldoActual) || 0;
}

function obtenerTasaMensualParaMes(mesClave, fallbackTasaDolar = 36.5) {
    const t = appState.tasasMensuales.find(x => x.mes === mesClave);
    let tasaPromedio = 47.56;
    let tasaDolar = fallbackTasaDolar;
    if (t) {
        tasaPromedio = Number(t.tasa_promedio !== undefined ? t.tasa_promedio : (t.tasa_anual || 47.56));
        tasaDolar = Number(t.tasa_dolar) || fallbackTasaDolar;
    }
    return { tasaPromedio: tasaPromedio, tasaMensual: tasaPromedio / 12, tasaDolar: tasaDolar };
}

function computarPrestacionesMensuales(emp, fechaCorte) {
    const fi = new Date(emp.fecha_ingreso + 'T00:00:00');
    const fca = new Date(fechaCorte + 'T00:00:00');
    const diasBaseUtilidad = appState.parametros.dias_utilidades || 30;

    const anticiposEmp = obtenerAnticiposEmpleado(emp.id)
        .map(a => ({ ...a, aplicado: false }))
        .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    const filas = [];
    let capitalAcumulado = 0;
    let saldoIntereses = 0;
    let interesesAcumulados = 0;
    let anticiposAplicados = 0;
    let totalDepositosBs = 0;
    let ultimoSdIntegralUSD = 0;
    let ultimoSdIntegralBs = 0;
    let tasaUltima = 36.5;
    let diasAdicionalesCobrados = 0;

    let cursor = new Date(fi.getFullYear(), fi.getMonth(), 1);
    let mesContador = 0;

    while (cursor <= fca) {
        const mesClave = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
        const infoTasas = obtenerTasaMensualParaMes(mesClave, 36.5);
        const fechaISO = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-01`;
        const sbUSD = obtenerSalarioBaseParaFecha(emp.id, fechaISO, emp.sueldo);

        const sdUSD = sbUSD / 30;
        const alicVacUSD = sdUSD * (15 / 360);
        const alicUtiUSD = sdUSD * (diasBaseUtilidad / 360);
        const sdIntegralUSD = sdUSD + alicVacUSD + alicUtiUSD;
        const siQuincenalUSD = sdIntegralUSD * 15;
        const siMensualBs = siQuincenalUSD * infoTasas.tasaDolar;

        ultimoSdIntegralUSD = sdIntegralUSD;
        ultimoSdIntegralBs = sdIntegralUSD * infoTasas.tasaDolar;
        tasaUltima = infoTasas.tasaDolar;

        let depositoBs = 0;
        let diasAcreditados = 0;
        if (mesContador > 0 && mesContador % 3 === 0) {
            diasAcreditados = 15;
            if (mesContador >= 24 && mesContador % 12 === 0) {
                diasAcreditados += 2;
                diasAdicionalesCobrados += 2;
            }
            depositoBs = diasAcreditados * sdIntegralUSD * infoTasas.tasaDolar;
            capitalAcumulado += depositoBs;
            saldoIntereses += depositoBs;
            totalDepositosBs += depositoBs;
        }

        let interesesMes = 0;
        if (saldoIntereses > 0) {
            interesesMes = saldoIntereses * (infoTasas.tasaMensual / 100);
            interesesAcumulados += interesesMes;
        }

        const capitalParaMostrar = capitalAcumulado;
        const interesesParaMostrar = interesesAcumulados;

        let anticipoAplicado = 0;
        let interesesPagadosPorAnticipo = 0;
        let capitalPagadoPorAnticipo = 0;
        const inicioMes = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        const finMes = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59);

        anticiposEmp.forEach(a => {
            if (a.aplicado) return;
            const fAnt = new Date(a.fecha + 'T00:00:00');
            if (fAnt >= inicioMes && fAnt <= finMes) {
                let restante = Number(a.monto_bs) || 0;
                if (interesesAcumulados > 0) {
                    const pagoInt = Math.min(restante, interesesAcumulados);
                    interesesAcumulados -= pagoInt;
                    interesesPagadosPorAnticipo += pagoInt;
                    restante -= pagoInt;
                }
                if (restante > 0) {
                    const pagoCap = Math.min(restante, capitalAcumulado);
                    capitalAcumulado -= pagoCap;
                    capitalPagadoPorAnticipo += pagoCap;
                    restante -= pagoCap;
                }
                saldoIntereses = capitalAcumulado;
                anticipoAplicado += Number(a.monto_bs);
                anticiposAplicados += Number(a.monto_bs);
                a.aplicado = true;
            }
        });

        filas.push({
            mes: mesClave, sbUSD, sdUSD, alicVacUSD, alicUtiUSD,
            siQuincenalUSD, tasaDolar: infoTasas.tasaDolar, siMensualBs,
            depositoBs, diasAcreditados, capitalAcumulado: capitalParaMostrar,
            tasaMensual: infoTasas.tasaMensual, interesesMes,
            interesesAcumulados: interesesParaMostrar, anticipoAplicado,
            interesesPagadosPorAnticipo, capitalPagadoPorAnticipo
        });

        cursor.setMonth(cursor.getMonth() + 1);
        mesContador++;
    }

    const ultimoMesHist = appState.historicoSalarios
        .filter(h => String(h.empleado_id) === String(emp.id))
        .map(h => h.mes)
        .sort((a, b) => b.localeCompare(a))[0];

    if (ultimoMesHist) {
        const sbFinalUSD = obtenerSalarioBaseParaFecha(emp.id, ultimoMesHist + '-01', emp.sueldo);
        const sdFinalUSD = sbFinalUSD / 30;
        const alicVacFinalUSD = sdFinalUSD * (15 / 360);
        const alicUtiFinalUSD = sdFinalUSD * (diasBaseUtilidad / 360);
        ultimoSdIntegralUSD = sdFinalUSD + alicVacFinalUSD + alicUtiFinalUSD;
        const infoTasasFinal = obtenerTasaMensualParaMes(ultimoMesHist, 36.5);
        ultimoSdIntegralBs = ultimoSdIntegralUSD * infoTasasFinal.tasaDolar;
        tasaUltima = infoTasasFinal.tasaDolar;
    }

    return {
        filas, capitalFinalBs: capitalAcumulado, interesesFinalBs: interesesAcumulados,
        anticiposAplicadosBs: anticiposAplicados,
        totalAnticiposBs: anticiposEmp.reduce((s, a) => s + Number(a.monto_bs || 0), 0),
        totalDepositosBs, ultimoSdIntegralUSD, ultimoSdIntegralBs, tasaUltima,
        diasAdicionalesCobrados
    };
}

function calcularAntiguedad() {
    const id = gId('ant-emp-select').value;
    const fc = gId('ant-fecha-corte').value;
    if (!id || !fc) return showToast('Indique el empleado y la fecha de corte', 'error');

    const e = appState.empleados.find(x => String(x.id) === String(id));
    if (!e || !e.fecha_ingreso) return showToast('Empleado sin fecha de ingreso', 'error');

    const fi = new Date(e.fecha_ingreso + 'T00:00:00');
    const fca = new Date(fc + 'T00:00:00');
    if (fca < fi) return showToast('La fecha de corte no puede ser anterior al ingreso', 'error');

    let y = fca.getFullYear() - fi.getFullYear();
    let mo = fca.getMonth() - fi.getMonth();
    let d = fca.getDate() - fi.getDate();
    if (d < 0) { mo--; const prev = new Date(fca.getFullYear(), fca.getMonth(), 0); d += prev.getDate(); }
    if (mo < 0) { y--; mo += 12; }

    const totalMeses = (y * 12) + mo;
    const mesesFracAdic = mo + (d / 30);

    let diasAdicionales = 0;
    if (y >= 1) {
        const raw = (y - 1) * 2 + (mesesFracAdic / 12) * 2;
        diasAdicionales = Math.round(raw * 10) / 10;
    }

    const trimestres = Math.floor(totalMeses / 3);
    const diasTrimestrales = trimestres * 15;
    const totalDiasGarantia = diasTrimestrales + diasAdicionales;

    const calc = computarPrestacionesMensuales(e, fc);
    const capitalAcumuladoBs = calc.capitalFinalBs;
    const interesesTotalesBs = calc.interesesFinalBs;
    const anticiposAplicadosBs = calc.anticiposAplicadosBs;
    const totalAnticiposBs = calc.totalAnticiposBs;
    const tasaDolarCorte = calc.tasaUltima;
    const sdIntegralActualUSD = calc.ultimoSdIntegralUSD;
    const sdIntegralActualBs = calc.ultimoSdIntegralBs;

    const tasaDelDia = parseFloat(gId('nom-tasa-bcv').value) || tasaDolarCorte;
    const totalGarantiaNetoBs = Math.max(0, capitalAcumuladoBs + interesesTotalesBs);
    const totalGarantiaNetoUSD = totalGarantiaNetoBs / tasaDelDia;

    let diasRetroBase = y * 30;
    if (mo >= 6) diasRetroBase += 30;
    else if (mo >= 3) diasRetroBase += 15;
    const totalDiasRetro = diasRetroBase + Math.round(diasAdicionales);
    const totalRetroBrutoBs = totalDiasRetro * sdIntegralActualBs;
    const totalRetroNetoBs = Math.max(0, totalRetroBrutoBs - totalAnticiposBs);
    const totalRetroNetoUSD = totalRetroNetoBs / tasaDelDia;

    const esMetodo1Mayor = totalGarantiaNetoBs >= totalRetroNetoBs;
    const montoDefinitivoBs = esMetodo1Mayor ? totalGarantiaNetoBs : totalRetroNetoBs;
    const montoDefinitivoUSD = montoDefinitivoBs / tasaDelDia;
    const adicionalPorAnioBs = diasAdicionales * sdIntegralActualBs;
    const subTotalBs = (0.75 * capitalAcumuladoBs) + interesesTotalesBs + adicionalPorAnioBs;

    appState.calculoAntiguedadActual = {
        empleado: e, fecha_ingreso: e.fecha_ingreso, fecha_corte: fc,
        tiempo_servicio: `${y}a, ${mo}m, ${d}d`, anios: y, meses: mo, dias: d,
        trimestres: trimestres, dias_trimestrales: diasTrimestrales,
        dias_adicionales: diasAdicionales, total_dias_garantia: totalDiasGarantia,
        capital_acumulado_bs: capitalAcumuladoBs, intereses_totales_bs: interesesTotalesBs,
        anticipos_usd: totalAnticiposBs / tasaDelDia, anticipos_bs: totalAnticiposBs,
        anticipos_aplicados_bs: anticiposAplicadosBs, adicional_por_anio_bs: adicionalPorAnioBs,
        subtotal_bs: subTotalBs, total_metodo1_bs: totalGarantiaNetoBs,
        total_metodo1_usd: totalGarantiaNetoUSD, dias_retro_base: diasRetroBase,
        total_dias_retro: totalDiasRetro, sd_integral_usd: sdIntegralActualUSD,
        sd_integral_bs: sdIntegralActualBs, total_metodo2_bs: totalRetroNetoBs,
        total_metodo2_usd: totalRetroNetoUSD,
        criterio_favorable: esMetodo1Mayor ? 'Garantía Trimestral + Intereses (Art. 142 a, b)' : 'Cálculo Retroactivo 30 d/año (Art. 142 c)',
        monto_definitivo_bs: montoDefinitivoBs, monto_definitivo_usd: montoDefinitivoUSD,
        tasa_bcv: tasaDolarCorte, tasa_dia_conversion: tasaDelDia
    };

    gId('res-ant-emp-nombre').innerText = e.nombre;
    gId('res-ant-cedula').innerText = e.cedula;
    gId('res-ant-cargo').innerText = e.cargos?.nombre || '-';
    gId('res-ant-ingreso').innerText = e.fecha_ingreso;
    gId('res-ant-corte').innerText = fc;
    gId('res-ant-tiempo').innerText = `${y} años, ${mo} meses, ${d} días`;
    gId('ant-m1-trimestres').innerText = `${trimestres} trimestres`;
    gId('ant-m1-dias-trim').innerText = `${diasTrimestrales} días`;
    gId('ant-m1-dias-adic').innerText = `${diasAdicionales} días`;
    gId('ant-m1-total-dias').innerText = `${totalDiasGarantia} días`;
    gId('ant-m1-capital-bs').innerText = `Bs. ${fNum(calc.totalDepositosBs)}`;
    gId('ant-m1-intereses-bs').innerText = `Bs. ${fNum(interesesTotalesBs)}`;
    gId('ant-m1-anticipos-usd').innerText = `Bs. ${fNum(anticiposAplicadosBs)} (${calc.filas.filter(f => f.anticipoAplicado > 0).length} anticipo/s aplicado/s)`;
    gId('ant-m1-total-bs').innerText = `Bs. ${fNum(totalGarantiaNetoBs)}`;
    gId('ant-m1-total-usd').innerText = `$${totalGarantiaNetoUSD.toFixed(2)}`;
    gId('ant-m2-anios').innerText = `${y} años (${mo} meses frac)`;
    gId('ant-m2-dias-base').innerText = `${diasRetroBase} días`;
    gId('ant-m2-dias-adic').innerText = `${Math.round(diasAdicionales)} días`;
    gId('ant-m2-total-dias').innerText = `${totalDiasRetro} días`;
    gId('ant-m2-salario-diario').innerText = `$${sdIntegralActualUSD.toFixed(2)}/día`;
    gId('ant-m2-salario-diario-bs').innerText = `Bs. ${fNum(sdIntegralActualBs)}/día`;
    gId('ant-m2-anticipos-usd').innerText = `-Bs. ${fNum(totalAnticiposBs)}`;
    gId('ant-m2-total-bs').innerText = `Bs. ${fNum(totalRetroNetoBs)}`;
    gId('ant-m2-total-usd').innerText = `$${totalRetroNetoUSD.toFixed(2)}`;
    gId('lbl-criterio-favorable').innerHTML = `Criterio aplicado: <strong class="text-cyan-300 font-bold">${appState.calculoAntiguedadActual.criterio_favorable}</strong> — <span class="text-slate-400">Sub-Total informativo (75% + Int + Adic): Bs. ${fNum(subTotalBs)}</span>`;
    gId('res-ant-gran-total-bs').innerText = `Bs. ${fNum(montoDefinitivoBs)}`;
    gId('res-ant-gran-total-usd').innerText = `$${montoDefinitivoUSD.toFixed(2)}`;
    gId('ant-resultado-container').classList.remove('hidden');
    showToast('Prestaciones calculadas · Adicional: ' + diasAdicionales + ' días · USD con tasa del día: ' + tasaDelDia.toFixed(2));
}

async function guardarAntiguedad() {
    const a = appState.calculoAntiguedadActual;
    if (!a) return;

    const reg = {
        empleado_id: a.empleado.id, empleado: a.empleado.nombre,
        cargo: a.empleado.cargos?.nombre || '-', fecha_ingreso: a.fecha_ingreso,
        fecha_corte: a.fecha_corte, tiempo_servicio: a.tiempo_servicio,
        total_metodo1_bs: a.total_metodo1_bs, total_metodo2_bs: a.total_metodo2_bs,
        monto_definitivo_bs: a.monto_definitivo_bs, monto_definitivo_usd: a.monto_definitivo_usd,
        tasa_bcv: a.tasa_bcv, detalle_calculo: a
    };

    await safeQuery(supabaseClient.from('antiguedad').insert([reg]));
    const list = JSON.parse(localStorage.getItem('nomina_antiguedad_cache') || '[]');
    reg.id = Date.now();
    list.unshift(reg);
    localStorage.setItem('nomina_antiguedad_cache', JSON.stringify(list));
    appState.antiguedad = list;

    if (a.monto_definitivo_bs > 0) {
        const yaExiste = appState.anticipos.find(ant =>
            String(ant.empleado_id) === String(a.empleado.id) &&
            ant.fecha === a.fecha_corte &&
            Math.abs(Number(ant.monto_bs) - a.monto_definitivo_bs) < 0.01
        );

        if (yaExiste) {
            if (!confirm('Ya existe un anticipo registrado con la misma fecha y monto.\n\n¿Desea registrarlo de nuevo?\n\n(Recomendado: Cancelar para evitar duplicados)')) {
                fetchAllData();
                showToast('Garantía guardada (sin registrar anticipo duplicado)');
                return;
            }
        }

        const anticipoData = {
            empleado_id: a.empleado.id,
            monto_bs: a.monto_definitivo_bs,
            fecha: a.fecha_corte,
            concepto: `Pago de prestaciones al ${a.fecha_corte} (${a.criterio_favorable})`
        };

        const insertado = await safeQuery(supabaseClient.from('anticipos_prestaciones').insert([anticipoData]).select(), 'insert_anticipo_pago_prestaciones');

        if (insertado && insertado[0]) {
            appState.anticipos.push(insertado[0]);
        } else {
            anticipoData.id = Date.now();
            appState.anticipos.push(anticipoData);
        }
        localStorage.setItem('nomina_anticipos_cache', JSON.stringify(appState.anticipos));
        renderTablaPrestamos();
    }

    fetchAllData();
    showToast(`Garantía guardada · Anticipo de Bs. ${fNum(a.monto_definitivo_bs)} registrado al ${a.fecha_corte}`);
}

function generarConciliacion() {
    const empId = gId('ant-emp-select').value;
    const fc = gId('ant-fecha-corte').value;
    if (!empId || !fc) return showToast('Seleccione empleado y fecha de corte primero', 'error');
    const emp = appState.empleados.find(x => String(x.id) === String(empId));
    if (!emp || !emp.fecha_ingreso) return showToast('Empleado sin fecha de ingreso', 'error');

    const fi = new Date(emp.fecha_ingreso + 'T00:00:00');
    const fca = new Date(fc + 'T00:00:00');
    if (fca < fi) return showToast('Fecha de corte inválida', 'error');

    const calc = computarPrestacionesMensuales(emp, fc);
    renderConciliacion(emp, calc.filas, fc, calc);
}

function renderConciliacion(emp, filas, fechaCorte, calc) {
    gId('conciliacion-subtitulo').innerHTML = `<strong class="text-cyan-300">${emp.nombre}</strong> · C.I. ${emp.cedula} · Ingreso: <span class="font-mono">${emp.fecha_ingreso}</span> · Corte: <span class="font-mono">${fechaCorte}</span>`;

    const totalAnticipos = calc.anticiposAplicadosBs;
    const totalDepositos = filas.reduce((s, f) => s + f.depositoBs, 0);
    const capitalFinal = calc.capitalFinalBs;
    const interesesFinal = calc.interesesFinalBs;

    let html = `
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4 text-xs">
            <div class="bg-slate-950 border border-slate-800 p-3 rounded-lg"><span class="text-slate-400 text-[10px] uppercase block">Total Depósitos</span><strong class="text-cyan-300 font-mono text-sm">Bs. ${fNum(totalDepositos)}</strong></div>
            <div class="bg-slate-950 border border-slate-800 p-3 rounded-lg"><span class="text-slate-400 text-[10px] uppercase block">Intereses Acum.</span><strong class="text-amber-400 font-mono text-sm">Bs. ${fNum(interesesFinal)}</strong></div>
            <div class="bg-slate-950 border border-slate-800 p-3 rounded-lg"><span class="text-slate-400 text-[10px] uppercase block">Anticipos Aplicados</span><strong class="text-rose-400 font-mono text-sm">Bs. ${fNum(totalAnticipos)}</strong></div>
            <div class="bg-slate-950 border border-slate-800 p-3 rounded-lg"><span class="text-slate-400 text-[10px] uppercase block">Capital Final</span><strong class="text-emerald-400 font-mono text-sm">Bs. ${fNum(capitalFinal)}</strong></div>
            <div class="bg-slate-950 border border-slate-800 p-3 rounded-lg"><span class="text-slate-400 text-[10px] uppercase block">Total Garantía</span><strong class="text-emerald-300 font-mono text-sm">Bs. ${fNum(capitalFinal + interesesFinal)}</strong></div>
        </div>
        <div class="overflow-auto custom-scrollbar border border-slate-800 rounded-lg" style="max-height: 65vh;">
            <table class="w-full text-[10.5px] whitespace-nowrap">
                <thead class="bg-slate-950 text-slate-400 uppercase text-[9px] sticky top-0 z-20 shadow-[0_1px_0_0_#1e293b]">
                    <tr>
                        <th class="p-2 text-left">Mes</th><th class="p-2 text-right">Sal. Mens. ($)</th><th class="p-2 text-right">Sal. Diario ($)</th>
                        <th class="p-2 text-right">Frac. Vac. ($)</th><th class="p-2 text-right">Frac. Uti. ($)</th><th class="p-2 text-right">Sal. Int. Quinc. ($)</th>
                        <th class="p-2 text-right">Tasa $ BCV</th><th class="p-2 text-right">Sal. Int. Mens. (Bs)</th>
                        <th class="p-2 text-center text-cyan-400">Días Acre.</th><th class="p-2 text-right text-cyan-300">Depósito (Bs)</th>
                        <th class="p-2 text-right text-emerald-300">Acum. Prest. (Bs)</th><th class="p-2 text-right">Tasa Int. %</th>
                        <th class="p-2 text-right text-amber-300">Int. Mes (Bs)</th><th class="p-2 text-right text-amber-400">Int. Acum. (Bs)</th>
                        <th class="p-2 text-right text-rose-400">Anticipo (Bs)</th>
                    </tr>
                </thead><tbody class="divide-y divide-slate-800/50">`;

    filas.forEach(f => {
        const esDep = f.depositoBs > 0, esAnt = f.anticipoAplicado > 0;
        let cls = 'hover:bg-slate-900/40';
        if (esDep) cls = 'bg-cyan-950/20 hover:bg-cyan-950/30';
        if (esAnt) cls = 'bg-rose-950/20 hover:bg-rose-950/30';

        html += `<tr class="${cls}">
            <td class="p-2 font-mono text-white">${f.mes}</td>
            <td class="p-2 text-right text-slate-300 font-mono">${f.sbUSD.toFixed(2)}</td>
            <td class="p-2 text-right text-slate-400 font-mono">${f.sdUSD.toFixed(2)}</td>
            <td class="p-2 text-right text-slate-400 font-mono">${f.alicVacUSD.toFixed(2)}</td>
            <td class="p-2 text-right text-slate-400 font-mono">${f.alicUtiUSD.toFixed(2)}</td>
            <td class="p-2 text-right text-sky-300 font-mono">${f.siQuincenalUSD.toFixed(2)}</td>
            <td class="p-2 text-right text-slate-400 font-mono">${f.tasaDolar.toFixed(2)}</td>
            <td class="p-2 text-right text-slate-300 font-mono">${fNum(f.siMensualBs)}</td>
            <td class="p-2 text-center text-cyan-400 font-bold">${f.diasAcreditados > 0 ? f.diasAcreditados : '-'}</td>
            <td class="p-2 text-right text-cyan-300 font-mono font-bold">${esDep ? fNum(f.depositoBs) : '-'}</td>
            <td class="p-2 text-right text-emerald-300 font-mono font-bold">${fNum(f.capitalAcumulado)}</td>
            <td class="p-2 text-right text-slate-300 font-mono">${f.tasaMensual.toFixed(3)}%</td>
            <td class="p-2 text-right text-amber-300 font-mono">${f.interesesMes > 0 ? fNum(f.interesesMes) : '-'}</td>
            <td class="p-2 text-right text-amber-400 font-mono font-bold">${fNum(f.interesesAcumulados)}</td>
            <td class="p-2 text-right text-rose-400 font-mono font-bold">${esAnt ? '-' + fNum(f.anticipoAplicado) : '-'}</td>
        </tr>`;
    });

    html += `</tbody>
        <tfoot class="bg-slate-950 font-bold border-t-2 border-slate-700 sticky bottom-0">
            <tr>
                <td colspan="9" class="p-2.5 text-right text-slate-200 uppercase">TOTALES:</td>
                <td class="p-2.5 text-right text-cyan-300 font-mono">Bs. ${fNum(totalDepositos)}</td>
                <td class="p-2.5 text-right text-emerald-300 font-mono">Bs. ${fNum(capitalFinal)}</td>
                <td class="p-2.5"></td><td class="p-2.5"></td>
                <td class="p-2.5 text-right text-amber-400 font-mono">Bs. ${fNum(interesesFinal)}</td>
                <td class="p-2.5 text-right text-rose-400 font-mono">Bs. ${fNum(totalAnticipos)}</td>
            </tr>
        </tfoot></table></div>`;

    gId('area-conciliacion').innerHTML = html;
    openModal('modal-conciliacion');
}

function imprimirConciliacion() {
    const cont = gId('area-conciliacion');
    if (!cont) return;
    const titulo = gId('conciliacion-subtitulo').innerText;
    gId('print-container').innerHTML = `<div class="p-4"><h2 class="text-base font-bold mb-1">Conciliación Mes a Mes — Prestaciones Sociales (LOTTT Art. 142/143)</h2><p class="text-xs mb-3">${titulo}</p>${cont.innerHTML}</div>`;
    window.print();
}

function renderHistoricoAntiguedad() {
    const isMaster = appState.usuarioActual?.rol === 'master';
    const tbody = gId('tabla-historico-antiguedad-body');
    if (!tbody) return;

    tbody.innerHTML = appState.antiguedad.map(a => {
        const [cy, cm, cd] = (a.fecha_corte || '').split('-');
        const fCorte = (cy && cm && cd) ? `${cd}/${cm}/${cy}` : (a.fecha_corte || '-');

        return `<tr class="hover:bg-slate-900/50">
            <td class="p-3.5 text-slate-300 font-mono text-xs">${fCorte}</td>
            <td class="p-3.5 font-bold text-white">${a.empleado}</td>
            <td class="p-3.5 text-slate-400 text-[11px]">${a.tiempo_servicio}</td>
            <td class="p-3.5 text-cyan-300 font-mono font-semibold">Bs. ${fNum(a.total_metodo1_bs || 0)}</td>
            <td class="p-3.5 text-purple-300 font-mono font-semibold">Bs. ${fNum(a.total_metodo2_bs || 0)}</td>
            <td class="p-3.5 font-bold text-emerald-400 font-mono">Bs. ${fNum(a.monto_definitivo_bs || 0)}</td>
            <td class="p-3.5 font-bold text-emerald-400 font-mono">$${Number(a.monto_definitivo_usd || 0).toFixed(2)}</td>
            <td class="p-3.5 text-right space-x-1 sm:space-x-2">
                <button onclick="verReciboAntiguedadHistorico('${a.id}')" class="bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-400 border border-cyan-500/30 text-xs px-2.5 py-1 rounded-lg font-medium inline-flex items-center space-x-1 transition"><i class="fa-solid fa-receipt text-[11px]"></i><span>Estado</span></button>
              <button onclick="abrirFirmaPrestacion('${a.id}')" class="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/30 text-xs px-2.5 py-1 rounded-lg font-medium inline-flex items-center space-x-1 transition" title="Firmar"><i class="fa-solid fa-signature"></i></button>
                ${isMaster ? `<button onclick="eliminarAntiguedadProcesada('${a.id}')" class="bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 border border-rose-500/30 text-xs px-2.5 py-1 rounded-lg font-medium inline-flex items-center space-x-1 transition"><i class="fa-solid fa-trash text-[11px]"></i></button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

async function eliminarAntiguedadProcesada(id) {
    if (appState.usuarioActual?.rol !== 'master') return showToast('No tiene permisos para eliminar registros', 'error');
    if (!confirm('¿Eliminar registro de prestaciones de antigüedad?')) return;

    await safeQuery(supabaseClient.from('antiguedad').delete().eq('id', id));
    const list = JSON.parse(localStorage.getItem('nomina_antiguedad_cache') || '[]').filter(x => String(x.id) !== String(id));
    localStorage.setItem('nomina_antiguedad_cache', JSON.stringify(list));
    appState.antiguedad = list;
    fetchAllData();
    showToast('Registro eliminado');
}

function verReciboAntiguedadHistorico(id) {
    const a = appState.antiguedad.find(x => String(x.id) === String(id));
    if (a && a.detalle_calculo) {
        appState.calculoAntiguedadActual = a.detalle_calculo;
        gId('recibos-fecha-pago').innerText = `Garantía Antigüedad - ${a.empleado}`;
        gId('area-impresion-recibos').innerHTML = `<div class="print-page relative group"><button onclick="enviarWhatsAppAntiguedad()" class="absolute top-4 right-4 bg-emerald-500 text-white rounded-full w-9 h-9 opacity-40 group-hover:opacity-100 print-hidden" title="WhatsApp"><i class="fa-brands fa-whatsapp text-xl"></i></button>${generarHTMLReciboAntiguedad(a.detalle_calculo)}</div>`;
        openModal('modal-recibos-nomina');
    }
}

function imprimirReciboAntiguedad() {
    const a = appState.calculoAntiguedadActual;
    if (a) {
        gId('print-container').innerHTML = `<div class="print-page">${generarHTMLReciboAntiguedad(a)}</div>`;
        window.print();
    }
}

function enviarWhatsAppAntiguedad() {
    const a = appState.calculoAntiguedadActual;
    if (!a || !a.empleado) return;
    let t = a.empleado.telefono ? a.empleado.telefono.replace(/\D/g, '') : '';
    if (!t) return showToast('Sin teléfono registrado', 'error');
    if (t.startsWith('0')) t = '58' + t.substring(1); else if (t.length === 10) t = '58' + t;

    const msg = `ESTADO DE CUENTA - PRESTACIONES SOCIALES (LOTTT Art. 142)\n${appState.parametros.nombre_empresa}\n\nTrabajador: ${a.empleado.nombre}\nCédula: ${a.empleado.cedula || '-'}\nFecha Ingreso: ${a.fecha_ingreso}\nFecha de Corte: ${a.fecha_corte}\nTiempo de Servicio: ${a.tiempo_servicio}\n\nMONTO DEFINITIVO (Art. 142 d):\nBs. ${fNum(a.monto_definitivo_bs)} ($${Number(a.monto_definitivo_usd).toFixed(2)})\nCriterio aplicado: ${a.criterio_favorable}`;
    window.open(`https://wa.me/${t}?text=${encodeURIComponent(msg)}`, '_blank');
}

function generarHTMLReciboAntiguedad(a) {
    const emp = a.empleado;
    const [iy, im, id] = (a.fecha_ingreso || '').split('-');
    const [cy, cm, cd] = (a.fecha_corte || '').split('-');

    return `<div class="recibo-antiguedad-print bg-white text-black p-4 font-sans max-w-4xl mx-auto border-2 border-black my-2 text-[10px]">
        <div class="flex justify-between items-start mb-2 pb-1 border-b-2 border-black"><div><h2 class="text-xl font-black tracking-widest text-black uppercase">${appState.parametros.nombre_empresa.split('/')[0].trim()}</h2></div><div class="text-right"><h3 class="text-xs font-extrabold text-black uppercase">${appState.parametros.nombre_empresa}</h3><p class="text-[9px] text-slate-800 font-semibold">${appState.parametros.rif_empresa}</p></div></div>
        <div class="bg-[#cffafe] text-center font-bold text-[10px] py-1 border border-black mb-2 uppercase tracking-wider text-black">ESTADO DE CUENTA Y GARANTÍA DE PRESTACIONES SOCIALES (LOTTT ART. 142 & 143)</div>
        <table class="w-full text-[9.5px] border border-black mb-2 font-semibold">
            <tr><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black w-32 font-bold text-black">TRABAJADOR</td><td class="px-1.5 py-0.5 border-r border-b border-black font-bold uppercase text-black">${emp.nombre}</td><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black w-24 font-bold text-black">CÉDULA</td><td class="px-1.5 py-0.5 border-b border-black text-black">${emp.cedula || '-'}</td></tr>
            <tr><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black font-bold text-black">CARGO</td><td class="px-1.5 py-0.5 border-r border-b border-black uppercase text-black">${emp.cargos?.nombre || '-'}</td><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black font-bold text-black">DEPARTAMENTO</td><td class="px-1.5 py-0.5 border-b border-black uppercase text-black">${emp.departamentos?.nombre || '-'}</td></tr>
            <tr><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black font-bold text-black">FECHA INGRESO</td><td class="px-1.5 py-0.5 border-r border-b border-black text-black">${id}/${im}/${iy}</td><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black font-bold text-black">FECHA DE CORTE</td><td class="px-1.5 py-0.5 border-b border-black font-bold text-black">${cd}/${cm}/${cy}</td></tr>
            <tr><td class="bg-slate-100 px-1.5 py-0.5 border-r border-black font-bold text-black">TIEMPO SERVICIO</td><td class="px-1.5 py-0.5 border-r border-black font-bold text-black">${a.tiempo_servicio}</td><td class="bg-slate-100 px-1.5 py-0.5 border-r border-black font-bold text-black">TASA BCV / SAL. INT. DIARIO</td><td class="px-1.5 py-0.5 font-bold text-black">${Number(a.tasa_bcv).toFixed(2)} Bs/$ | Bs. ${fNum(a.sd_integral_bs)}</td></tr>
        </table>
        <div class="font-bold text-[9px] uppercase text-black mb-0.5">1. Garantía Trimestral y Rendimientos en Bolívares</div>
        <table class="w-full text-[9px] border border-black mb-2">
            <thead><tr class="bg-[#cffafe] font-bold border-b border-black text-black"><th class="px-1.5 py-0.5 text-left border-r border-black text-black">CONCEPTO LEGAL</th><th class="px-1.5 py-0.5 text-center border-r border-black w-20 text-black">DÍAS</th><th class="px-1.5 py-0.5 text-right border-r border-black w-32 text-black">TOTAL (BS)</th><th class="px-1.5 py-0.5 text-right w-28 text-black">EQUIV. ($)</th></tr></thead>
            <tbody class="divide-y divide-slate-300">
                <tr><td class="px-1.5 py-0.5 text-black">Depósito Trimestral acumulado (${a.trimestres} trimestres) + Adicionales</td><td class="px-1.5 py-0.5 text-center font-mono text-black">${a.total_dias_garantia} d</td><td class="px-1.5 py-0.5 text-right font-mono font-bold text-black">${fNum(a.capital_acumulado_bs)}</td><td class="px-1.5 py-0.5 text-right font-mono text-black">$${(a.capital_acumulado_bs / a.tasa_bcv).toFixed(2)}</td></tr>
                <tr><td class="px-1.5 py-0.5 text-black">Intereses devengados</td><td class="px-1.5 py-0.5 text-center font-mono text-black">-</td><td class="px-1.5 py-0.5 text-right font-mono font-bold text-black">${fNum(a.intereses_totales_bs)}</td><td class="px-1.5 py-0.5 text-right font-mono text-black">$${(a.intereses_totales_bs / a.tasa_bcv).toFixed(2)}</td></tr>
            </tbody>
            <tfoot><tr class="font-bold border-t border-black bg-slate-50 text-black"><td class="px-1.5 py-0.5" colspan="2">TOTAL NETO GARANTÍA</td><td class="px-1.5 py-0.5 text-right font-mono font-bold text-black">${fNum(a.total_metodo1_bs)} Bs</td><td class="px-1.5 py-0.5 text-right font-mono font-bold text-black">$${Number(a.total_metodo1_usd).toFixed(2)}</td></tr></tfoot>
        </table>
        <div class="font-bold text-[9px] uppercase text-black mb-0.5">2. Cálculo Retroactivo 30 d/año (Art. 142 lit. c)</div>
        <table class="w-full text-[9px] border border-black mb-2">
            <thead><tr class="bg-slate-100 font-bold border-b border-black text-black"><th class="px-1.5 py-0.5 text-left border-r border-black text-black">DESCRIPCIÓN</th><th class="px-1.5 py-0.5 text-center border-r border-black w-20 text-black">DÍAS</th><th class="px-1.5 py-0.5 text-right border-r border-black w-32 text-black">TOTAL (BS)</th><th class="px-1.5 py-0.5 text-right w-28 text-black">EQUIV. ($)</th></tr></thead>
            <tbody><tr><td class="px-1.5 py-0.5 text-black">Retroactivo - Anticipos</td><td class="px-1.5 py-0.5 text-center font-mono text-black">${a.total_dias_retro} d</td><td class="px-1.5 py-0.5 text-right font-mono font-bold text-black">${fNum(a.total_metodo2_bs)}</td><td class="px-1.5 py-0.5 text-right font-mono font-bold text-black">$${Number(a.total_metodo2_usd).toFixed(2)}</td></tr></tbody>
        </table>
        <div class="flex justify-between items-center bg-[#cffafe] border-2 border-black p-1.5 font-bold text-[10px] mb-2 text-black"><span class="uppercase font-black">MONTO DEFINITIVO (ART. 142 LIT. D):</span><span class="font-mono text-xs font-black text-black">${fNum(a.monto_definitivo_bs)} Bs / $${Number(a.monto_definitivo_usd).toFixed(2)}</span></div>
        <div class="border-t border-black pt-2 mt-4"><h4 class="text-center font-extrabold text-[9px] tracking-wider mb-4 text-black">CONSTANCIA CONFORME</h4>
            <div class="grid grid-cols-2 gap-8 text-[9.5px] font-semibold text-black">
                <div class="flex items-end"><span class="mr-2">PATRONO:</span><span class="border-b border-black flex-1"></span></div>
                <div class="flex items-end"><span class="mr-2">TRABAJADOR:</span><span class="border-b border-black flex-1"></span></div>
            </div>
        </div>
    </div>`;
}
