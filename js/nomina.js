/* ============================================================
   js/nomina.js
   Motor principal de la Nómina: cálculo, borradores, TXT y recibos.
   ============================================================ */

let debounceTimerPreNomina = null;
let nominaTotalesCache = {};

/* ---------------- BORRADOR DE PRE-NÓMINA ---------------- */

function autoguardarBorradorNomina() {
    clearTimeout(debounceTimerPreNomina);
    debounceTimerPreNomina = setTimeout(() => { guardarBorradorNominaEnNube(false); }, 700);
}

async function guardarBorradorNominaEnNube(mostrarAlerta = false) {
    const emps = appState.empleados.filter(e => e.activo);
    if (emps.length === 0) return;

    const f = gId('nom-fecha-proceso')?.value || new Date().toISOString().split('T')[0];
    const t = parseFloat(gId('nom-tasa-bcv')?.value) || 36.5;
    const sM = parseFloat(gId('nom-salario-minimo')?.value) || 130;
    const lun = parseInt(gId('nom-lunes')?.value) || 2;

    const filas = {};
    emps.forEach(e => {
        filas[e.id] = {
            df: parseFloat(gId(`df-${e.id}`)?.value) || 0,
            hed: parseFloat(gId(`hed-${e.id}`)?.value) || 0,
            hnoct: parseFloat(gId(`hnoct-${e.id}`)?.value) || 0,
            fer: parseFloat(gId(`fer-${e.id}`)?.value) || 0,
            oa: parseFloat(gId(`oa-${e.id}`)?.value) || 0,
            hd: parseFloat(gId(`hd-${e.id}`)?.value) || 0,
            od: parseFloat(gId(`od-${e.id}`)?.value) || 0,
            ad: parseFloat(gId(`ad-${e.id}`)?.value) || 0,
            pr: parseFloat(gId(`pr-${e.id}`)?.value) || 0,
            islr: parseFloat(gId(`islr-${e.id}`)?.value) || 0
        };
    });

    const prenominaData = { id: 1, fecha_pago: f, tasa_bcv: t, salario_minimo: sM, lunes: lun, filas: filas, updated_at: new Date().toISOString() };

    await safeQuery(supabaseClient.from('prenomina_borrador').upsert([prenominaData]), 'upsert_prenomina');
    localStorage.setItem('nomina_borrador_global', JSON.stringify(prenominaData));

    const badge = gId('txt-ultima-prenomina');
    if (badge) badge.innerText = `Sincronizado: ${new Date().toLocaleTimeString('es-VE')}`;
    if (mostrarAlerta) showToast('Pre-nómina sincronizada en la nube');
}

function guardarBorradorNominaManual() { guardarBorradorNominaEnNube(true); }

async function cargarBorradorParaFechaActual() {
    await cargarBorradorDesdeNube();
    renderTablaNominaEditable();
}

async function cargarBorradorDesdeNube() {
    const data = await safeQuery(supabaseClient.from('prenomina_borrador').select('*').eq('id', 1).maybeSingle(), 'fetch_prenomina');
    if (data && data.filas) {
        localStorage.setItem('nomina_borrador_global', JSON.stringify(data));
        return data;
    }
    const local = localStorage.getItem('nomina_borrador_global');
    if (local) {
        try { return JSON.parse(local); } catch (e) {}
    }
    return null;
}

async function limpiarBorradorNomina() {
    if (!confirm('¿Desea restablecer todos los valores de la pre-nómina a cero?')) return;
    await safeQuery(supabaseClient.from('prenomina_borrador').delete().eq('id', 1), 'delete_prenomina');
    localStorage.removeItem('nomina_borrador_global');
    renderTablaNominaEditable();
    showToast('Valores de pre-nómina restablecidos');
}

/* ---------------- CÁLCULO DE NÓMINA ---------------- */

function renderTablaNominaEditable() {
    const emps = appState.empleados.filter(e => e.activo);
    const tbody = gId('tabla-nomina-editable-body');
    if (!tbody) return;

    let borrador = null;
    const rawDraft = localStorage.getItem('nomina_borrador_global');
    if (rawDraft) {
        try {
            borrador = JSON.parse(rawDraft);
            if (borrador.salario_minimo && gId('nom-salario-minimo')) gId('nom-salario-minimo').value = borrador.salario_minimo;
            if (borrador.lunes && gId('nom-lunes')) gId('nom-lunes').value = borrador.lunes;
            if (borrador.fecha_pago && gId('nom-fecha-proceso')) gId('nom-fecha-proceso').value = borrador.fecha_pago;
            if (borrador.tasa_bcv && gId('nom-tasa-bcv')) gId('nom-tasa-bcv').value = borrador.tasa_bcv;
            const badge = gId('txt-ultima-prenomina');
            if (badge && borrador.updated_at) {
                badge.innerText = `Pre-nómina: ${new Date(borrador.updated_at).toLocaleTimeString('es-VE')}`;
            }
        } catch (e) {}
    }

    tbody.innerHTML = emps.map(e => {
        const saldoPres = Number(e.saldo_prestamo) || 0;
        const prestamoSugeridoDef = saldoPres > 0 ? saldoPres.toFixed(2) : "0.00";
        const bEmp = borrador?.filas?.[e.id] || {};

        const safeNum = (val) => { const parsed = parseFloat(val); return isNaN(parsed) ? "0.00" : parsed.toFixed(2); };
        const safeInt = (val) => { const parsed = parseInt(val, 10); return isNaN(parsed) ? 0 : parsed; };

        const dfVal = safeInt(bEmp.df);
        const hedVal = safeInt(bEmp.hed);
        const hnoctVal = safeInt(bEmp.hnoct);
        const ferVal = safeInt(bEmp.fer);
        const oaVal = safeNum(bEmp.oa);
        const hdVal = safeInt(bEmp.hd);
        const odVal = safeNum(bEmp.od);
        const adVal = safeNum(bEmp.ad);
        const islrVal = bEmp.islr !== undefined ? safeNum(bEmp.islr) : safeNum(e.islr_porcentaje || 0);

        let prVal = prestamoSugeridoDef;
        if (bEmp.pr !== undefined) {
            const parsedPr = parseFloat(bEmp.pr);
            if (!isNaN(parsedPr)) prVal = parsedPr.toFixed(2);
        }

        return `<tr id="fila-emp-${e.id}" class="hover:bg-slate-900/50 transition">
            <td class="p-3" style="min-width: 170px;"><div class="font-bold text-white">${e.nombre}</div><div class="text-[10px] text-slate-400">${e.cedula}</div></td>
            <td class="p-3 text-center" style="min-width: 70px;"><input type="number" id="df-${e.id}" value="${dfVal}" min="0" oninput="actualizarFilaYTotales(${e.id}); autoguardarBorradorNomina();" style="width: 50px;" class="bg-slate-950 border border-slate-800 rounded text-center p-1 text-xs text-white outline-none"></td>
            <td class="p-3 text-center" style="min-width: 65px;"><input type="number" id="hed-${e.id}" value="${hedVal}" min="0" oninput="actualizarFilaYTotales(${e.id}); autoguardarBorradorNomina();" style="width: 50px;" class="bg-slate-950 border border-indigo-900/50 rounded text-center p-1 text-xs text-indigo-300 outline-none"></td>
            <td class="p-3 text-center" style="min-width: 65px;"><input type="number" id="hnoct-${e.id}" value="${hnoctVal}" min="0" oninput="actualizarFilaYTotales(${e.id}); autoguardarBorradorNomina();" style="width: 50px;" class="bg-slate-950 border border-indigo-900/50 rounded text-center p-1 text-xs text-indigo-300 outline-none"></td>
            <td class="p-3 text-center" style="min-width: 65px;"><input type="number" id="fer-${e.id}" value="${ferVal}" min="0" oninput="actualizarFilaYTotales(${e.id}); autoguardarBorradorNomina();" style="width: 50px;" class="bg-slate-950 border border-indigo-900/50 rounded text-center p-1 text-xs text-indigo-300 outline-none"></td>
            <td class="p-3" style="min-width: 95px;"><input type="number" step="0.01" id="oa-${e.id}" value="${oaVal}" oninput="actualizarFilaYTotales(${e.id}); autoguardarBorradorNomina();" style="width: 75px;" class="bg-slate-950 border border-slate-800 rounded p-1 text-xs text-white outline-none"></td>
            <td class="p-3 text-center" style="min-width: 70px;"><input type="number" id="hd-${e.id}" value="${hdVal}" min="0" oninput="actualizarFilaYTotales(${e.id}); autoguardarBorradorNomina();" style="width: 50px;" class="bg-slate-950 border border-slate-800 rounded text-center p-1 text-xs text-white outline-none"></td>
            <td class="p-3" style="min-width: 95px;"><input type="number" step="0.01" id="od-${e.id}" value="${odVal}" oninput="actualizarFilaYTotales(${e.id}); autoguardarBorradorNomina();" style="width: 75px;" class="bg-slate-950 border border-slate-800 rounded p-1 text-xs text-white outline-none"></td>
            <td class="p-3" style="min-width: 95px;"><input type="number" step="0.01" id="ad-${e.id}" value="${adVal}" oninput="actualizarFilaYTotales(${e.id}); autoguardarBorradorNomina();" style="width: 75px;" class="bg-slate-950 border border-slate-800 rounded p-1 text-xs text-white outline-none"></td>
            <td class="p-3" style="min-width: 95px;"><input type="number" step="0.01" id="pr-${e.id}" value="${prVal}" oninput="actualizarFilaYTotales(${e.id}); autoguardarBorradorNomina();" style="width: 75px;" class="bg-slate-950 border border-slate-800 rounded p-1 text-xs text-white outline-none"></td>
            <td class="p-3 text-center" style="min-width: 70px;"><input type="number" step="0.01" id="islr-${e.id}" value="${islrVal}" min="0" max="100" oninput="actualizarFilaYTotales(${e.id}); autoguardarBorradorNomina();" style="width: 55px;" class="bg-slate-950 border border-amber-900/50 rounded text-center p-1 text-xs text-amber-300 outline-none"></td>
            <td class="p-3 text-amber-400 font-medium" style="min-width: 95px;" id="ley-${e.id}">Bs. 0.00</td>
                <td class="p-3 text-amber-400 font-medium" style="min-width: 100px;" id="ley-${e.id}">Bs. 0.00</td>
            <td class="p-3 font-bold text-emerald-400" style="min-width: 140px;" id="salario-bs-${e.id}">Bs. 0.00</td>
            <td class="p-3 font-bold text-emerald-400" style="min-width: 140px;" id="alim-bs-${e.id}">Bs. 0.00</td>
            <td class="p-3 font-bold text-emerald-400" style="min-width: 140px;" id="subs-bs-${e.id}">Bs. 0.00</td>
        </tr>`;
    }).join('');

    recalcularTodaLaNomina();
}

function calcularNominaFila(id) {
    const e = appState.empleados.find(x => String(x.id) === String(id));
    if (!e) return;

    const t = parseFloat(gId('nom-tasa-bcv').value) || 36.5;
    const sM = parseFloat(gId('nom-salario-minimo').value) || 130;
    const lun = parseInt(gId('nom-lunes').value) || 2;

    const sb = Number(e.sueldo) || 0;
    const bam = Number(e.bono_alimentacion) || 0;
    const oim = Number(e.otros_ingresos) || 0;
    const si = sb + bam + oim;
    const dia = si / 30;
    const base = dia * 15;

    const df = parseFloat(gId(`df-${id}`)?.value || 0);
    const oa = parseFloat(gId(`oa-${id}`)?.value || 0);
    const hd = parseFloat(gId(`hd-${id}`)?.value || 0);
    const od = parseFloat(gId(`od-${id}`)?.value || 0);
    const ad = parseFloat(gId(`ad-${id}`)?.value || 0);
    const pr = parseFloat(gId(`pr-${id}`)?.value || 0);

    const horaBase = (sb / 30) / 8;
    const diaBase = sb / 30;

    const hed = parseFloat(gId(`hed-${id}`)?.value || 0);
    const hnoct = parseFloat(gId(`hnoct-${id}`)?.value || 0);
    const fer = parseFloat(gId(`fer-${id}`)?.value || 0);
    const islrPct = parseFloat(gId(`islr-${id}`)?.value || 0);

    const montoHED = horaBase * 1.5 * hed;
    const montoNoct = horaBase * 0.30 * hnoct;
    const montoFer = diaBase * 1.5 * fer;
    const totalRecargosUSD = montoHED + montoNoct + montoFer;

    const sbBs = sb * t;
    const ivss = (Math.min(sbBs, 5 * sM) * 12 / 52) * 0.04 * lun;
    const rpe = (Math.min(sbBs, 10 * sM) * 12 / 52) * 0.005 * lun;
    const faov = (sbBs * 0.01) / 2;
    const leyU = (ivss + rpe + faov) / t;

    const salarioBaseDia = sb / 30;
    const baseSalarialImponibleUSD = Math.max(0, (salarioBaseDia * (15 - df)) + totalRecargosUSD);
    const islrUSD = baseSalarialImponibleUSD * (islrPct / 100);

    // --- CÁLCULOS EN DIVISAS ---
    const salarioUSD = ((sb / 30) * (15 - df)) - leyU - islrUSD;
    const alimUSD = ((bam / 30) * (15 - df));
    const subsUSD = ((oim / 30) * (15 - df)) + oa - ((dia / 8) * hd) - od - ad - pr + totalRecargosUSD;

    // --- CÁLCULOS EN BOLÍVARES ---
    const salarioBs = salarioUSD * t;
    const alimBs = alimUSD * t;
    const subsBs = subsUSD * t;

    const elLey = gId(`ley-${id}`);
    if (elLey) elLey.innerText = `Bs. ${(ivss + rpe + faov + (islrUSD * t)).toFixed(2)}`;
    
    // Inyectar los Bs junto con el equivalente en $
    if (gId(`salario-bs-${id}`)) gId(`salario-bs-${id}`).innerText = `Bs. ${salarioBs.toFixed(2)} ($${salarioUSD.toFixed(2)})`;
    if (gId(`alim-bs-${id}`)) gId(`alim-bs-${id}`).innerText = `Bs. ${alimBs.toFixed(2)} ($${alimUSD.toFixed(2)})`;
    if (gId(`subs-bs-${id}`)) gId(`subs-bs-${id}`).innerText = `Bs. ${subsBs.toFixed(2)} ($${subsUSD.toFixed(2)})`;

    // Guardamos para los totales
    nominaTotalesCache[id] = { salarioBs, alimBs, subsBs, salarioUSD, alimUSD, subsUSD };
}

function actualizarFilaYTotales(id) {
    calcularNominaFila(id);
    sumarTotalesNomina();
}

function recalcularTodaLaNomina() {
    appState.empleados.filter(e => e.activo).forEach(e => { calcularNominaFila(e.id); });
    sumarTotalesNomina();
}

function sumarTotalesNomina() {
    let ts = 0, ta = 0, tsub = 0;
    appState.empleados.filter(e => e.activo).forEach(e => {
        if (nominaTotalesCache[e.id]) { 
            ts += nominaTotalesCache[e.id].salarioBs; 
            ta += nominaTotalesCache[e.id].alimBs; 
            tsub += nominaTotalesCache[e.id].subsBs; 
        }
    });
    // Nota: Puedes usar estos totales si deseas mostrarlos en algún lado, 
    // por ahora actualizamos el botón superior global.
    if (gId('nom-total-usd')) gId('nom-total-usd').value = `$${((ts + ta + tsub) / (parseFloat(gId('nom-tasa-bcv').value) || 1)).toFixed(2)}`;
    if (gId('nom-total-bs')) gId('nom-total-bs').value = `Bs. ${(ts + ta + tsub).toFixed(2)}`;
}

/* ---------------- PROCESAR NÓMINA GLOBAL ---------------- */

async function procesarNominaGlobal() {
    const f = gId('nom-fecha-proceso').value;
    const t = parseFloat(gId('nom-tasa-bcv').value) || 36.5;
    const sM = parseFloat(gId('nom-salario-minimo').value) || 130;
    const lun = parseInt(gId('nom-lunes').value) || 2;

    if (!f) return showToast('Falta fecha de pago', 'error');
    const act = appState.empleados.filter(e => e.activo);
    if (!act.length) return;

    const regs = [];
    const empUpdates = [];

    for (const e of act) {
        const sb = Number(e.sueldo) || 0;
        const si = sb + (Number(e.bono_alimentacion) || 0) + (Number(e.otros_ingresos) || 0);
        const dia = si / 30;
        const base = dia * 15;

        const df = parseFloat(gId(`df-${e.id}`).value) || 0;
        const oa = parseFloat(gId(`oa-${e.id}`).value) || 0;
        const hd = parseFloat(gId(`hd-${e.id}`).value) || 0;
        const od = parseFloat(gId(`od-${e.id}`).value) || 0;
        const ad = parseFloat(gId(`ad-${e.id}`).value) || 0;
        const pr = parseFloat(gId(`pr-${e.id}`).value) || 0;

        const hed = (typeof getFeatureFlag === 'function' && getFeatureFlag('nomina.recargos_lottt')) ? (parseFloat(gId(`hed-${e.id}`)?.value) || 0) : 0;
        const hnoct = (typeof getFeatureFlag === 'function' && getFeatureFlag('nomina.recargos_lottt')) ? (parseFloat(gId(`hnoct-${e.id}`)?.value) || 0) : 0;
        const fer = (typeof getFeatureFlag === 'function' && getFeatureFlag('nomina.recargos_lottt')) ? (parseFloat(gId(`fer-${e.id}`)?.value) || 0) : 0;
        const islrPct = (typeof getFeatureFlag === 'function' && getFeatureFlag('nomina.islr')) ? (parseFloat(gId(`islr-${e.id}`)?.value) || 0) : 0;

        const horaBase = (sb / 30) / 8;
        const diaBase = sb / 30;

        const montoHED = horaBase * 1.5 * hed;
        const montoNoct = horaBase * 0.30 * hnoct;
        const montoFer = diaBase * 1.5 * fer;
        const totalRecargosUSD = montoHED + montoNoct + montoFer;

        const sbBs = sb * t;
        const ivss = (Math.min(sbBs, 5 * sM) * 12 / 52) * 0.04 * lun;
        const rpe = (Math.min(sbBs, 10 * sM) * 12 / 52) * 0.005 * lun;
        const faov = (sbBs * 0.01) / 2;
        const leyU = (ivss + rpe + faov) / t;

        const baseSalarialImponibleUSD = Math.max(0, ((sb / 30) * (15 - df)) + totalRecargosUSD);
        const islrUSD = baseSalarialImponibleUSD * (islrPct / 100);

        const netoU = base - (dia * df) + oa + totalRecargosUSD - ((dia / 8) * hd) - od - ad - pr - leyU - islrUSD;

        if (pr > 0) {
            const nuevoSaldo = Math.max(0, (Number(e.saldo_prestamo) || 0) - pr);
            e.saldo_prestamo = nuevoSaldo;
            empUpdates.push(supabaseClient.from('empleados').update({ saldo_prestamo: nuevoSaldo }).eq('id', e.id));
        }

        regs.push({
            fecha_pago: f, empleado_id: e.id, empleado: e.nombre, cargo: e.cargos?.nombre || '-',
            tasa_bcv: t, salario_minimo_bs: sM, salario_base: sb,
            bono_alimentacion: Number(e.bono_alimentacion) || 0, otros_ingresos: Number(e.otros_ingresos) || 0,
            dias_faltantes: df, otras_asignaciones: oa, horas_descuento: hd,
            otros_descuentos: od, adelantos: ad, prestamos: pr,
            hed: hed, hnoct: hnoct, fer: fer,
            recargos_lottt_usd: totalRecargosUSD,
            islr_porcentaje: islrPct, islr_usd: islrUSD, islr_bs: islrUSD * t,
            ivss_usd: ivss / t, rpe_usd: rpe / t, faov_usd: faov / t, descuentos_ley_usd: leyU,
            neto_usd: netoU, neto_bs: netoU * t, estado: 'Procesado'
        });
    }

    if (empUpdates.length > 0) await Promise.all(empUpdates);
    await supabaseClient.from('nominas').insert(regs);
    await safeQuery(supabaseClient.from('prenomina_borrador').delete().eq('id', 1), 'clear_prenomina');
    localStorage.removeItem('nomina_borrador_global');

    const [yStr, mStr, dStr] = f.split('-');
    if (parseInt(dStr) >= 20) {
        const mesClave = `${yStr}-${mStr}`;
        const salariosFinMes = act.map(e => ({
            empleado_id: e.id,
            mes: mesClave,
            sueldo_base: Number(e.sueldo) || 0,
            bono_alimentacion: Number(e.bono_alimentacion) || 0,
            subsidio: Number(e.otros_ingresos) || 0
        }));
        try { await supabaseClient.from('historico_salarios').upsert(salariosFinMes, { onConflict: 'empleado_id,mes' }); } catch (e) {}
    }

    showToast('Nómina procesada definitivamente con éxito');
    if (typeof fetchAllData === 'function') fetchAllData();
}

/* ---------------- HISTÓRICO Y RECIBOS ---------------- */

function renderHistoricoNominas() {
    const gr = {};
    const isMaster = appState.usuarioActual?.rol === 'master';
    const tbody = gId('tabla-historico-body');
    if (!tbody) return;

    appState.nominas.forEach(n => {
        if (!gr[n.fecha_pago]) gr[n.fecha_pago] = { c: 0, u: 0, b: 0, t: n.tasa_bcv, s: n.salario_minimo_bs };
        gr[n.fecha_pago].c++;
        gr[n.fecha_pago].u += Number(n.neto_usd);
        gr[n.fecha_pago].b += Number(n.neto_bs);
    });

    tbody.innerHTML = Object.keys(gr).sort().reverse().map(f => `
        <tr class="hover:bg-slate-900/50">
            <td class="p-3.5 font-bold text-white">${f}</td>
            <td class="p-3.5 text-center text-sky-400 font-semibold">${gr[f].c}</td>
            <td class="p-3.5 text-slate-300">Bs. ${Number(gr[f].t).toFixed(2)}</td>
            <td class="p-3.5 text-slate-300">Bs. ${Number(gr[f].s).toFixed(2)}</td>
            <td class="p-3.5 font-bold text-emerald-400">$${gr[f].u.toFixed(2)}</td>
            <td class="p-3.5 font-bold text-emerald-400">Bs. ${gr[f].b.toFixed(2)}</td>
            <td class="p-3.5 text-right space-x-1 sm:space-x-2">
                <button onclick="verDetalleNomina('${f}')" class="bg-sky-600/20 hover:bg-sky-600/40 text-sky-400 border border-sky-500/30 text-xs px-2.5 py-1 rounded-lg font-medium inline-flex items-center transition"><i class="fa-solid fa-list mr-1"></i> Resumen</button>
                <button onclick="verRecibosNomina('${f}')" class="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 text-xs px-2.5 py-1 rounded-lg font-medium inline-flex items-center transition"><i class="fa-solid fa-receipt mr-1"></i> Recibos</button>
                <button onclick="abrirModalFirmas('${f}')" class="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/30 text-xs px-2.5 py-1 rounded-lg font-medium inline-flex items-center transition"><i class="fa-solid fa-signature mr-1"></i> Firmas</button>
                <button onclick="generarTXTAlimentacion('${f}')" class="bg-teal-600/20 hover:bg-teal-600/40 text-teal-400 border border-teal-500/30 text-xs px-2.5 py-1 rounded-lg font-medium inline-flex items-center transition"><i class="fa-solid fa-file-lines mr-1"></i> TXT Alimentación</button>
                <button onclick="generarTXTSubsidio('${f}')" class="bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 border border-purple-500/30 text-xs px-2.5 py-1 rounded-lg font-medium inline-flex items-center transition"><i class="fa-solid fa-file-lines mr-1"></i> TXT Subsidio</button>
                <button onclick="abrirModalEditarNomina('${f}')" class="bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 border border-amber-500/30 text-xs px-2.5 py-1 rounded-lg font-medium inline-flex items-center transition"><i class="fa-solid fa-pen mr-1"></i> Editar</button>
                ${isMaster ? `<button onclick="eliminarNominaProcesada('${f}')" class="bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 border border-rose-500/30 text-xs px-2.5 py-1 rounded-lg font-medium inline-flex items-center transition"><i class="fa-solid fa-trash mr-1"></i> Eliminar</button>` : ''}
            </td>
        </tr>
    `).join('');
}

function formatearCedulaBanco(cedula) {
    const soloDigitos = String(cedula || '').replace(/\D/g, '');
    const soloDigitosPad = soloDigitos.padStart(9, '0').slice(-9);
    return ('V' + soloDigitosPad).slice(0, 10);
}

function formatearMontoFechaBanco(monto, fechaISO) {
    const montoSeguro = (Number(monto) || 0);
    const montoStr = montoSeguro.toFixed(2).replace('.', '');
    const [y, m, d] = String(fechaISO || '').split('-');
    const fechaStr = `${String(d).padStart(2, '0')}${String(m).padStart(2, '0')}${y}`;
    const combinado = `${montoStr}${fechaStr}`;
    return combinado.padStart(29, '0').slice(-29);
}

function descargarTXT(contenido, nombreArchivo) {
    const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombreArchivo;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
}

function generarTXTAlimentacion(fecha) {
    const regs = appState.nominas.filter(n => n.fecha_pago === fecha);
    if (regs.length === 0) return showToast('No hay registros para esta fecha', 'error');
    let contenido = '';
    regs.forEach(r => {
        const e = appState.empleados.find(x => String(x.id) === String(r.empleado_id)) || {};
        const cedulaFmt = formatearCedulaBanco(e.cedula || r.cedula || '');
        const t = Number(r.tasa_bcv) || 1;
        const bam = Number(r.bono_alimentacion) || 0;
        const df = Number(r.dias_faltantes) || 0;
        const alimColUSD = (bam / 30) * (15 - df);
        const montoBs = alimColUSD * t;
        const cadena29 = formatearMontoFechaBanco(montoBs, fecha);
        contenido += `${cedulaFmt}  ${cadena29}\n`;
    });
    if (!contenido.trim()) return showToast('Sin datos para exportar', 'error');
    const nombre = `ALIMENTACION_${fecha.replace(/-/g, '')}.txt`;
    descargarTXT(contenido, nombre);
    showToast(`Archivo TXT Alimentación generado (${regs.length} registros)`);
}

function generarTXTSubsidio(fecha) {
    const regs = appState.nominas.filter(n => n.fecha_pago === fecha);
    if (regs.length === 0) return showToast('No hay registros para esta fecha', 'error');
    let contenido = '';
    regs.forEach(r => {
        const e = appState.empleados.find(x => String(x.id) === String(r.empleado_id)) || {};
        const cedulaFmt = formatearCedulaBanco(e.cedula || r.cedula || '');
        const t = Number(r.tasa_bcv) || 1;
        const sb = Number(r.salario_base) || 0;
        const bam = Number(r.bono_alimentacion) || 0;
        const oim = Number(r.otros_ingresos) || 0;
        const oa = Number(r.otras_asignaciones) || 0;
        const df = Number(r.dias_faltantes) || 0;
        const hd = Number(r.horas_descuento) || 0;
        const od = Number(r.otros_descuentos) || 0;
        const ad = Number(r.adelantos) || 0;
        const pr = Number(r.prestamos) || 0;
        const recargos = Number(r.recargos_lottt_usd || 0);
        const islr = Number(r.islr_usd || 0);
        const dia = (sb + bam + oim) / 30;
        const subColUSD = ((oim / 30) * (15 - df)) + oa + recargos - ((dia / 8) * hd) - od - ad - pr - islr;
        const montoBs = subColUSD * t;
        const cadena29 = formatearMontoFechaBanco(montoBs, fecha);
        contenido += `${cedulaFmt}  ${cadena29}\n`;
    });
    if (!contenido.trim()) return showToast('Sin datos para exportar', 'error');
    const nombre = `SUBSIDIO_${fecha.replace(/-/g, '')}.txt`;
    descargarTXT(contenido, nombre);
    showToast(`Archivo TXT Subsidio generado (${regs.length} registros)`);
}

async function eliminarNominaProcesada(f) {
    if (appState.usuarioActual?.rol !== 'master') return showToast('No tiene permisos para eliminar registros', 'error');
    if (!confirm('¿Eliminar nómina? Se reintegrarán los montos amortizados a los préstamos.')) return;

    const nominasDeFecha = appState.nominas.filter(n => n.fecha_pago === f);
    const empReintegros = [];

    nominasDeFecha.forEach(n => {
        const montoPres = Number(n.prestamos) || 0;
        if (montoPres > 0) {
            const emp = appState.empleados.find(e => String(e.id) === String(n.empleado_id));
            if (emp) {
                const nuevoSaldo = (Number(emp.saldo_prestamo) || 0) + montoPres;
                emp.saldo_prestamo = nuevoSaldo;
                empReintegros.push(supabaseClient.from('empleados').update({ saldo_prestamo: nuevoSaldo }).eq('id', emp.id));
            }
        }
    });

    if (empReintegros.length > 0) await Promise.all(empReintegros);
    await supabaseClient.from('nominas').delete().eq('fecha_pago', f);
    showToast('Nómina eliminada y préstamos reintegrados');
    if (typeof fetchAllData === 'function') fetchAllData();
}

function verDetalleNomina(f) {
    const regs = appState.nominas.filter(n => n.fecha_pago === f);
    gId('detalle-fecha-pago').innerText = f;
    gId('print-fecha-pago').innerText = f;

    let tb = 0, ta = 0, ti = 0, tr = 0, tf = 0, to = 0, tu = 0, tbs = 0;
    let tSal = 0, tAlim = 0, tSub = 0, tRec = 0, tIslr = 0;

    gId('tabla-detalle-body').innerHTML = regs.map(r => {
        const sq = Number(r.salario_base) / 2;
        const as = (Number(r.bono_alimentacion) / 2) + (Number(r.otros_ingresos) / 2) + Number(r.otras_asignaciones);
        let ivss = Number(r.ivss_usd);
        if (ivss === 0 && Number(r.salario_base) > 0) ivss = ((Math.min(Number(r.salario_base) * r.tasa_bcv, 5 * r.salario_minimo_bs) * 12 / 52) * 0.04 * 2) / r.tasa_bcv;
        let rpe = Number(r.rpe_usd);
        if (rpe === 0 && Number(r.salario_base) > 0) rpe = ((Math.min(Number(r.salario_base) * r.tasa_bcv, 10 * r.salario_minimo_bs) * 12 / 52) * 0.005 * 2) / r.tasa_bcv;
        let faov = Number(r.faov_usd);
        if (faov === 0 && Number(r.salario_base) > 0) faov = (((Number(r.salario_base) * r.tasa_bcv) * 0.01) / 2) / r.tasa_bcv;

        const recargosUsd = Number(r.recargos_lottt_usd || 0);
        const islrUsd = Number(r.islr_usd || 0);

        const od = Number(r.otros_descuentos) + Number(r.adelantos) + Number(r.prestamos);
        const nu = Number(r.neto_usd || r.neto || 0);
        const nb = Number(r.neto_bs);
        const t = Number(r.tasa_bcv) || 1;
        const sb = Number(r.salario_base) || 0;
        const bam = Number(r.bono_alimentacion) || 0;
        const oim = Number(r.otros_ingresos) || 0;
        const oav = Number(r.otras_asignaciones) || 0;
        const dfv = Number(r.dias_faltantes) || 0;
        const hdv = Number(r.horas_descuento) || 0;
        const odv = Number(r.otros_descuentos) || 0;
        const adv = Number(r.adelantos) || 0;
        const prv = Number(r.prestamos) || 0;
        const dia = (sb + bam + oim) / 30;
        const leyUsd = ivss + rpe + faov;
        const salarioColUsd = ((sb / 30) * (15 - dfv)) - leyUsd - islrUsd;
        const alimColUsd = (bam / 30) * (15 - dfv);
        const subColUsd = ((oim / 30) * (15 - dfv)) + oav + recargosUsd - ((dia / 8) * hdv) - odv - adv - prv;
        const salarioColBs = salarioColUsd * t;
        const alimColBs = alimColUsd * t;
        const subColBs = subColUsd * t;

        tb += sq; ta += as + recargosUsd; ti += ivss; tr += rpe; tf += faov; to += od + islrUsd; tu += nu; tbs += nb;
        tSal += salarioColBs; tAlim += alimColBs; tSub += subColBs;
        tRec += recargosUsd * t;
        tIslr += islrUsd * t;

        return `<tr class="hover:bg-slate-800/40">
            <td class="p-2.5 font-semibold text-white">${r.empleado}</td>
            <td class="p-2.5 text-slate-400">${r.cargo || '-'}</td>
            <td class="p-2.5 text-slate-300">$${sq.toFixed(2)}</td>
            <td class="p-2.5 text-emerald-400">$${as.toFixed(2)}</td>
            <td class="p-2.5 text-amber-400">$${ivss.toFixed(2)}</td>
            <td class="p-2.5 text-amber-400">$${rpe.toFixed(2)}</td>
            <td class="p-2.5 text-amber-400">$${faov.toFixed(2)}</td>
            <td class="p-2.5 text-rose-400">$${od.toFixed(2)}</td>
            <td class="p-2.5 text-sky-400 font-semibold">Bs. ${fNum(salarioColBs)}</td>
            <td class="p-2.5 text-teal-400 font-semibold">Bs. ${fNum(alimColBs)}</td>
            <td class="p-2.5 text-purple-400 font-semibold">Bs. ${fNum(subColBs)}</td>
            <td class="p-2.5 font-bold text-emerald-400">$${nu.toFixed(2)}</td>
            <td class="p-2.5 font-bold text-emerald-400">Bs. ${nb.toFixed(2)}</td>
        </tr>`;
    }).join('');

    gId('tabla-detalle-foot').innerHTML = `<tr>
        <td colspan="2" class="p-2.5 text-slate-300 text-right uppercase">Totales:</td>
        <td class="p-2.5 text-white">$${tb.toFixed(2)}</td>
        <td class="p-2.5 text-emerald-400">$${ta.toFixed(2)}</td>
        <td class="p-2.5 text-amber-400">$${ti.toFixed(2)}</td>
        <td class="p-2.5 text-amber-400">$${tr.toFixed(2)}</td>
        <td class="p-2.5 text-amber-400">$${tf.toFixed(2)}</td>
        <td class="p-2.5 text-rose-400">$${to.toFixed(2)}</td>
        <td class="p-2.5 text-sky-400 font-bold">Bs. ${fNum(tSal)}</td>
        <td class="p-2.5 text-teal-400 font-bold">Bs. ${fNum(tAlim)}</td>
        <td class="p-2.5 text-purple-400 font-bold">Bs. ${fNum(tSub)}</td>
        <td class="p-2.5 text-emerald-400">$${tu.toFixed(2)}</td>
        <td class="p-2.5 text-emerald-400">Bs. ${tbs.toFixed(2)}</td>
    </tr>`;
    openModal('modal-detalle-nomina');
}

function verRecibosNomina(fecha) {
    const regs = appState.nominas.filter(n => n.fecha_pago === fecha);
    gId('recibos-fecha-pago').innerText = fecha;
    let html = '';
    for (let i = 0; i < regs.length; i += 2) {
        html += `<div class="print-page mb-12 print:mb-0">${generarHTMLReciboSolo(regs[i], fecha)}${regs[i + 1] ? `<div class="divisor-recibo opacity-50 print:opacity-100 my-6 print:my-0"></div>${generarHTMLReciboSolo(regs[i + 1], fecha)}` : ''}</div>`;
    }
    gId('area-impresion-recibos').innerHTML = html;
    openModal('modal-recibos-nomina');
}

function generarHTMLReciboSolo(r, fecha) {
    const e = appState.empleados.find(x => String(x.id) === String(r.empleado_id)) || {};
    const t = Number(r.tasa_bcv || 1);
    const sM = Number(r.salario_minimo_bs || 130);
    const sm = Number(r.salario_base || 0);
    const bam = Number(r.bono_alimentacion || 0);
    const oim = Number(r.otros_ingresos || 0);
    const sim = sm + bam + oim;
    const sqb = (sm / 2) * t;
    const bab = (bam / 2) * t;
    const oib = (oim / 2) * t;
    const oab = Number(r.otras_asignaciones || 0) * t;

    const horaBaseUSD = (sm / 30) / 8;
    const diaBaseUSD = sm / 30;
    const hedV = Number(r.hed || 0);
    const hnoctV = Number(r.hnoct || 0);
    const ferV = Number(r.fer || 0);
    const montoHEDBs = horaBaseUSD * 1.5 * hedV * t;
    const montoNoctBs = horaBaseUSD * 0.30 * hnoctV * t;
    const montoFerBs = diaBaseUSD * 1.5 * ferV * t;
    const totalRecargosBs = montoHEDBs + montoNoctBs + montoFerBs;

    const tab = sqb + bab + oib + oab + totalRecargosBs;

    let sso = Number(r.ivss_usd || 0) * t;
    if (sso === 0 && sm > 0) sso = (Math.min(sm * t, 5 * sM) * 12 / 52) * 0.04 * 2;
    let lph = Number(r.faov_usd || 0) * t;
    if (lph === 0 && sm > 0) lph = ((sm * t) * 0.01) / 2;
    let rpe = Number(r.rpe_usd || 0) * t;
    if (rpe === 0 && sm > 0) rpe = (Math.min(sm * t, 10 * sM) * 12 / 52) * 0.005 * 2;

    const islrPctVal = Number(r.islr_porcentaje || 0);
    let islrBs = Number(r.islr_usd || 0) * t;
    if (islrBs === 0 && islrPctVal > 0) {
        const salBaseDiaUSD = sm / 30;
        const baseImp = Math.max(0, (salBaseDiaUSD * (15 - Number(r.dias_faltantes || 0))) +
            ((horaBaseUSD * 1.5 * hedV) + (horaBaseUSD * 0.30 * hnoctV) + (diaBaseUSD * 1.5 * ferV)));
        islrBs = baseImp * (islrPctVal / 100) * t;
    }

    const dfb = ((sim / 30) * Number(r.dias_faltantes || 0)) * t;
    const hdb = (((sim / 30) / 8) * Number(r.horas_descuento || 0)) * t;
    const prb = (Number(r.prestamos || 0) + Number(r.adelantos || 0)) * t;
    const odb = Number(r.otros_descuentos || 0) * t;
    const tdb = dfb + sso + lph + rpe + islrBs + prb + odb + hdb;
    const tnb = r.neto_bs ? Number(r.neto_bs) : (tab - tdb);

    const dfv = Number(r.dias_faltantes || 0);
    const hdv = Number(r.horas_descuento || 0);
    const odv = Number(r.otros_descuentos || 0);
    const adv = Number(r.adelantos || 0);
    const prv = Number(r.prestamos || 0);
    const oav = Number(r.otras_asignaciones || 0);
    const diav = sim / 30;

    const salarioBs = ((sm / 30) * (15 - dfv)) * t - (sso + lph + rpe + islrBs);
    const alimBs = ((bam / 30) * (15 - dfv)) * t;
    const subsBs = ((oim / 30) * (15 - dfv)) * t + (oav * t) - (((diav / 8) * hdv) * t) - (odv * t) - (adv * t) - (prv * t) + totalRecargosBs;

    const [y, m, d] = fecha.split('-');
    const fO = new Date(y, m - 1, d);
    const qT = fO.getDate() <= 15 ? '1ERA QUINCENA' : '2DA QUINCENA';
    const mN = fO.toLocaleString('es-ES', { month: 'long' }).toUpperCase();
    const tP = `RECIBO DE PAGO ${qT} DE ${mN} ${y}`;

    return `
    <div class="recibo-card bg-white text-black p-3 print:p-2 rounded-lg shadow-xl border border-slate-300 font-sans max-w-3xl mx-auto w-full relative group">
        <button onclick="enviarWhatsAppRecibo(${r.empleado_id}, '${fecha}')" class="absolute top-3 right-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg transition-all opacity-40 group-hover:opacity-100 print-hidden" title="Enviar WhatsApp"><i class="fa-brands fa-whatsapp text-lg"></i></button>
        <div>
            <div class="flex justify-between items-start mb-1 pb-0.5 border-b border-black">
                <div><h2 class="text-xl print:text-base print:leading-tight font-black tracking-widest text-black uppercase">${appState.parametros.nombre_empresa.split('/')[0].trim()}</h2></div>
                <div class="text-right print:leading-tight pr-10 print:pr-0"><h3 class="text-xs print:text-[10px] font-extrabold text-black uppercase">${appState.parametros.nombre_empresa}</h3><p class="text-[10px] print:text-[8.5px] text-slate-800 font-semibold">${appState.parametros.rif_empresa}</p></div>
            </div>
            <div class="bg-[#dbece0] text-center font-bold text-[10.5px] print:text-[9px] py-0.5 border border-black mb-1 uppercase tracking-wider text-black">${tP}</div>
            <table class="w-full text-[10px] print:text-[8.5px] border border-black mb-1 font-semibold">
                <tr><td class="bg-slate-100 px-1 py-0.5 border-r border-b border-black w-28 font-bold text-black">TRABAJADOR</td><td class="px-1 py-0.5 border-r border-b border-black font-bold uppercase text-black">${r.empleado}</td><td class="bg-slate-100 px-1 py-0.5 border-r border-b border-black w-16 font-bold text-black">CARGO</td><td class="px-1 py-0.5 border-b border-black uppercase font-bold text-black">${r.cargo || e.cargos?.nombre || '-'}</td></tr>
                <tr><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black font-bold text-black">CÉDULA</td><td class="px-1.5 py-0.5 border-r border-b border-black text-black">${e.cedula || r.cedula || '-'}</td><td class="bg-slate-100 px-1.5 py-0.5 border-r border-b border-black font-bold text-black">F. INGRESO</td><td class="px-1.5 py-0.5 border-b border-black text-black">${e.fecha_ingreso || '-'}</td></tr>
                <tr><td class="bg-slate-100 px-1.5 py-0.5 border-r border-black font-bold text-black">SALARIO MENSUAL</td><td colspan="3" class="px-1.5 py-0.5 font-bold text-black">${fNum(sm * t)} Bs. ($${sm.toFixed(2)}) | Tasa: ${t.toFixed(2)} Bs/$</td></tr>
            </table>
            <table class="w-full text-[10px] print:text-[8.5px] border border-black mb-1">
                <thead><tr class="bg-[#dbece0] font-bold border-b border-black text-black"><th class="px-1.5 py-0.5 text-left border-r border-black text-black" colspan="2">ASIGNACIÓN</th><th class="px-1.5 py-0.5 text-right w-28 text-black">MONTO (BS)</th></tr></thead>
                <tbody class="divide-y divide-slate-300">
                    <tr><td class="px-1.5 py-0.5 text-black">Salario quincenal (15 d)</td><td class="px-1.5 py-0.5 text-center w-12 text-slate-800">15 d</td><td class="px-1.5 py-0.5 text-right font-mono text-black">${fNum(sqb)}</td></tr>
                    <tr><td class="px-1.5 py-0.5 text-black" colspan="2">Bono de alimentación</td><td class="px-1.5 py-0.5 text-right font-mono text-black">${fNum(bab)}</td></tr>
                    <tr><td class="px-1.5 py-0.5 text-black" colspan="2">Subsidio especial no obligatorio</td><td class="px-1.5 py-0.5 text-right font-mono text-black">${fNum(oib + oab)}</td></tr>
                    ${hedV > 0 ? `<tr><td class="px-1.5 py-0.5 text-black">Horas Extras Diurnas (Recargo 50%)</td><td class="px-1.5 py-0.5 text-center text-slate-800">${hedV} h</td><td class="px-1.5 py-0.5 text-right font-mono text-black">${fNum(montoHEDBs)}</td></tr>` : ''}
                    ${hnoctV > 0 ? `<tr><td class="px-1.5 py-0.5 text-black">Bono Nocturno (Recargo 30%)</td><td class="px-1.5 py-0.5 text-center text-slate-800">${hnoctV} h</td><td class="px-1.5 py-0.5 text-right font-mono text-black">${fNum(montoNoctBs)}</td></tr>` : ''}
                    ${ferV > 0 ? `<tr><td class="px-1.5 py-0.5 text-black">Feriados/Descanso Trabajados (1.5x)</td><td class="px-1.5 py-0.5 text-center text-slate-800">${ferV} d</td><td class="px-1.5 py-0.5 text-right font-mono text-black">${fNum(montoFerBs)}</td></tr>` : ''}
                </tbody>
                <tfoot><tr class="font-bold border-t border-black bg-slate-50 text-black"><td class="px-1.5 py-0.5" colspan="2">TOTAL ASIGNACIONES</td><td class="px-1.5 py-0.5 text-right font-mono font-bold text-black">${fNum(tab)}</td></tr></tfoot>
            </table>
            <table class="w-full text-[9.5px] print:text-[8px] border border-black mb-1">
                <tbody class="divide-y divide-slate-200">
                    <tr><td class="px-1.5 py-0.5 text-black">Días no laborados (${r.dias_faltantes || 0} d)</td><td class="px-1.5 py-0.5 text-right font-mono w-28 text-black">${fNum(dfb)}</td></tr>
                    <tr><td class="px-1.5 py-0.5 text-black">S.S.O. / IVSS (4%)</td><td class="px-1.5 py-0.5 text-right font-mono text-black">${fNum(sso)}</td></tr>
                    <tr><td class="px-1.5 py-0.5 text-black">L.P.H. / FAOV (1%)</td><td class="px-1.5 py-0.5 text-right font-mono text-black">${fNum(lph)}</td></tr>
                    <tr><td class="px-1.5 py-0.5 text-black">Paro Forzoso / RPE (0,5%)</td><td class="px-1.5 py-0.5 text-right font-mono text-black">${fNum(rpe)}</td></tr>
                    ${islrBs > 0 ? `<tr><td class="px-1.5 py-0.5 text-black">I.S.L.R. Retención (${islrPctVal.toFixed(2)}%)</td><td class="px-1.5 py-0.5 text-right font-mono text-black">${fNum(islrBs)}</td></tr>` : ''}
                    <tr><td class="px-1.5 py-0.5 text-black">Préstamos / Adelantos amortizados</td><td class="px-1.5 py-0.5 text-right font-mono text-black">${fNum(prb)}</td></tr>
                    <tr><td class="px-1.5 py-0.5 text-black">Otras deducciones</td><td class="px-1.5 py-0.5 text-right font-mono text-black">${fNum(odb)}</td></tr>
                    <tr><td class="px-1.5 py-0.5 text-black">Horas descontadas (${r.horas_descuento || 0} hrs)</td><td class="px-1.5 py-0.5 text-right font-mono text-black">${fNum(hdb)}</td></tr>
                </tbody>
                <tfoot><tr class="font-bold border-t border-black bg-slate-50 text-black"><td class="px-1.5 py-0.5">TOTAL DEDUCCIONES</td><td class="px-1.5 py-0.5 text-right font-mono font-bold text-black">${fNum(tdb)}</td></tr></tfoot>
            </table>
        </div>
        <div>
            <div class="grid grid-cols-3 gap-1 mb-1 text-[9px] print:text-[8px]">
                <div class="bg-[#e0f2fe] border border-black p-1 text-center text-black"><div class="font-bold uppercase text-[7.5px] leading-tight">Salario</div><div class="font-mono font-bold leading-tight">Bs. ${fNum(salarioBs)}</div></div>
                <div class="bg-[#dcfce7] border border-black p-1 text-center text-black"><div class="font-bold uppercase text-[7.5px] leading-tight">Alimentación</div><div class="font-mono font-bold leading-tight">Bs. ${fNum(alimBs)}</div></div>
                <div class="bg-[#fef3c7] border border-black p-1 text-center text-black"><div class="font-bold uppercase text-[7.5px] leading-tight">Subsidio</div><div class="font-mono font-bold leading-tight">Bs. ${fNum(subsBs)}</div></div>
            </div>
            <div class="flex justify-between items-center bg-[#dbece0] border border-black p-1 font-bold text-[10.5px] print:text-[9.5px] mb-1 text-black">
                <span>TOTAL NETO A COBRAR</span>
                <span class="font-mono text-xs print:text-[10px] text-black">${fNum(tnb)} Bs.</span>
            </div>
            <div class="border border-black p-1 mb-1 text-[7.5px] text-black leading-tight bg-slate-50"><strong>OBSERVACIÓN:</strong> El subsidio no posee naturaleza salarial, ya que no desprende de la intención retributiva del trabajo prestado sino un beneficio eminentemente social para cubrir parte de sus gastos por bienes y/o servicios básicos en que incurre el trabajador. Por tal motivo se otorga como una ayuda al trabajador sin que sea de carácter obligatorio en futuras ocasiones.</div>
            <div class="border-t border-black pt-1">
                <h4 class="text-center font-extrabold text-[8.5px] tracking-wider mb-2 text-black">RECIBO CONFORME</h4>
                <div class="grid grid-cols-2 gap-4 text-[9px] font-semibold text-black">
                    <div class="flex items-end"><span class="mr-1">FIRMA:</span><span class="border-b border-black flex-1"></span></div>
                    <div class="flex items-end"><span class="mr-1">CÉDULA:</span><span class="border-b border-black flex-1 font-bold"></span></div>
                </div>
            </div>
        </div>
    </div>`;
}

function enviarWhatsAppRecibo(id, f) {
    const r = appState.nominas.find(x => String(x.empleado_id) === String(id) && x.fecha_pago === f);
    const e = appState.empleados.find(x => String(x.id) === String(id));
    if (!r || !e || !e.telefono) return showToast('Sin teléfono registrado', 'error');

    let t = e.telefono.replace(/\D/g, '');
    if (t.startsWith('0')) t = '58' + t.substring(1);
    else if (t.length === 10) t = '58' + t;

    const tasa = Number(r.tasa_bcv || 1);
    const sM = Number(r.salario_minimo_bs || 130);
    const sm = Number(r.salario_base || 0);
    const bam = Number(r.bono_alimentacion || 0);
    const oim = Number(r.otros_ingresos || 0);
    const sqb = (sm / 2) * tasa; const bab = (bam / 2) * tasa; const oib = (oim / 2) * tasa;
    const oab = Number(r.otras_asignaciones || 0) * tasa; const tab = sqb + bab + oib + oab;
    
    let sso = Number(r.ivss_usd || 0) * tasa; if (sso === 0 && sm > 0) sso = (Math.min(sm * tasa, 5 * sM) * 12 / 52) * 0.04 * 2;
    let lph = Number(r.faov_usd || 0) * tasa; if (lph === 0 && sm > 0) lph = ((sm * tasa) * 0.01) / 2;
    let rpe = Number(r.rpe_usd || 0) * tasa; if (rpe === 0 && sm > 0) rpe = (Math.min(sm * tasa, 10 * sM) * 12 / 52) * 0.005 * 2;
    
    const dfb = (((sm + bam + oim) / 30) * Number(r.dias_faltantes || 0)) * tasa;
    const hdb = ((((sm + bam + oim) / 30) / 8) * Number(r.horas_descuento || 0)) * tasa;
    const prb = (Number(r.prestamos || 0) + Number(r.adelantos || 0)) * tasa;
    const odb = Number(r.otros_descuentos || 0) * tasa;
    const tdb = dfb + sso + lph + rpe + prb + odb + hdb;
    const tnb = r.neto_bs ? Number(r.neto_bs) : (tab - tdb);
    
    const [y, m, d] = f.split('-');
    const fO = new Date(y, m - 1, d);
    const qT = fO.getDate() <= 15 ? '1ERA QUINCENA' : '2DA QUINCENA';
    const mN = fO.toLocaleString('es-ES', { month: 'long' }).toUpperCase();
    const msg = `RECIBO DE PAGO - ${qT} DE ${mN} ${y}\n${appState.parametros.nombre_empresa}\n\nTrabajador: ${r.empleado}\nCédula: ${e.cedula || r.cedula || '-'}\nCargo: ${r.cargo || e.cargos?.nombre || '-'}\nFecha de Pago: ${f}\nTasa BCV: ${tasa.toFixed(2)} Bs/$\n\nASIGNACIONES:\n- Salario quincenal (15 d): Bs. ${fNum(sqb)} ($${(sm / 2).toFixed(2)})\n- Bono alimentación: Bs. ${fNum(bab)} ($${(bam / 2).toFixed(2)})\n- Subsidio / Otras asig.: Bs. ${fNum(oib + oab)} ($${((oim / 2) + Number(r.otras_asignaciones || 0)).toFixed(2)})\nTotal Asignaciones: Bs. ${fNum(tab)}\n\nDEDUCCIONES:\n${r.dias_faltantes > 0 ? `- Días no trabajados (${r.dias_faltantes} d): Bs. ${fNum(dfb)}\n` : ''}- S.S.O / IVSS (4%): Bs. ${fNum(sso)}\n- L.P.H. / FAOV (1%): Bs. ${fNum(lph)}\n- Paro Forzoso / RPE (0.5%): Bs. ${fNum(rpe)}\n${prb > 0 ? `- Préstamos / Adelantos: Bs. ${fNum(prb)}\n` : ''}${r.horas_descuento > 0 ? `- Horas descontadas (${r.horas_descuento} hrs): Bs. ${fNum(hdb)}\n` : ''}${odb > 0 ? `- Otros desc.: Bs. ${fNum(odb)}\n` : ''}Total Deducciones: Bs. ${fNum(tdb)}\n\nTOTAL NETO A COBRAR:\nBs. ${fNum(tnb)}\n\nObservación: El subsidio no posee naturaleza salarial.\n\nPor favor, confirma la recepción de tu pago.`;
    window.open(`https://wa.me/${t}?text=${encodeURIComponent(msg)}`, '_blank');
}

function imprimirDesglose() {
    gId('print-container').innerHTML = `<div class="p-4">${gId('area-impresion').innerHTML}</div>`;
    window.print();
}

function imprimirRecibos() {
    gId('print-container').innerHTML = gId('area-impresion-recibos').innerHTML;
    window.print();
}

/* ============================================================
   GESTIÓN DE FIRMAS DIGITALES (MODAL POR EMPLEADO)
   ============================================================ */

let firmaFechaActual = null;

async function abrirModalFirmas(fechaPago) {
    firmaFechaActual = fechaPago;
    const regs = appState.nominas.filter(n => n.fecha_pago === fechaPago);

    gId('firmas-fecha-titulo').innerText = fechaPago;
    gId('tabla-firmas-body').innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-500">Cargando estados...</td></tr>';
    openModal('modal-gestion-firmas');

    const { data: firmasExistentes } = await supabaseClient
        .from('firmas_recibos')
        .select('*')
        .eq('tipo_documento', 'nomina')
        .in('documento_id', regs.map(r => r.id));

    const mapaFirmas = {};
    (firmasExistentes || []).forEach(f => { mapaFirmas[String(f.documento_id)] = f; });

    gId('tabla-firmas-body').innerHTML = regs.map(r => {
        const firma = mapaFirmas[String(r.id)];
        let estadoBadge, acciones, tiempoRestante = '-';

        if (!firma) {
            estadoBadge = '<span class="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">Sin enlace</span>';
            acciones = `<button onclick="generarEnlaceIndividual(${r.id}, ${r.empleado_id})" class="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] px-2.5 py-1 rounded font-bold"><i class="fa-solid fa-link mr-1"></i> Generar</button>`;
        } else if (firma.estado === 'pendiente') {
            const expirado = firma.expira_en && new Date(firma.expira_en) < new Date();
            if (expirado) {
                estadoBadge = '<span class="text-[10px] bg-rose-950 text-rose-300 border border-rose-800 px-2 py-0.5 rounded font-bold">Expirado</span>';
                acciones = `
                    <button onclick="anularEnlaceFirma('${firma.token}')" class="bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 text-[10px] px-2 py-1 rounded" title="Eliminar"><i class="fa-solid fa-xmark"></i></button>
                    <button onclick="renovarEnlaceFirma('${firma.token}')" class="bg-amber-600 hover:bg-amber-500 text-white text-[10px] px-2 py-1 rounded font-bold" title="Renovar 30 min"><i class="fa-solid fa-rotate-right mr-1"></i> Renovar</button>
                `;
            } else {
                estadoBadge = '<span class="text-[10px] bg-amber-950 text-amber-300 border border-amber-800 px-2 py-0.5 rounded font-bold">Pendiente</span>';
                acciones = `
                    <button onclick="copiarEnlaceFirma('${firma.token}')" class="bg-slate-700 hover:bg-slate-600 text-white text-[10px] px-2 py-1 rounded" title="Copiar"><i class="fa-solid fa-copy"></i></button>
                    <button onclick="enviarWAEnlaceFirma('${firma.token}', ${r.empleado_id})" class="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] px-2 py-1 rounded" title="WhatsApp"><i class="fa-brands fa-whatsapp"></i></button>
                    <button onclick="anularEnlaceFirma('${firma.token}')" class="bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 text-[10px] px-2 py-1 rounded" title="Anular"><i class="fa-solid fa-xmark"></i></button>
                `;
                tiempoRestante = `<span data-expira="${firma.expira_en}" class="font-mono">${formatearTiempoRestante(firma.expira_en)}</span>`;
            }
        } else {
            estadoBadge = '<span class="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded font-bold"><i class="fa-solid fa-check mr-0.5"></i> Firmado</span>';
            tiempoRestante = '<span class="text-[10px] text-emerald-400"><i class="fa-solid fa-check"></i></span>';
            acciones = `
                <a href="${firma.url_pdf_firmado}" target="_blank" class="bg-sky-600 hover:bg-sky-500 text-white text-[10px] px-2 py-1 rounded inline-block" title="Ver PDF"><i class="fa-solid fa-file-pdf"></i></a>
                <button onclick="anularEnlaceFirma('${firma.token}')" class="bg-slate-700 hover:bg-slate-600 text-white text-[10px] px-2 py-1 rounded" title="Regenerar"><i class="fa-solid fa-rotate"></i></button>
            `;
        }

        return `<tr class="border-b border-slate-800 hover:bg-slate-800/40">
            <td class="p-2 text-xs font-semibold text-white">${r.empleado}</td>
            <td class="p-2 text-center">${estadoBadge}</td>
            <td class="p-2 text-center text-[10px] text-slate-400 font-mono">${r.neto_bs ? 'Bs. ' + fNum(r.neto_bs) : '-'}</td>
            <td class="p-2 text-center text-[10px]">${tiempoRestante}</td>
            <td class="p-2 text-right space-x-1">${acciones}</td>
        </tr>`;
    }).join('');

    // Actualizar countdowns cada segundo
    if (_countdownFirmasInterval) clearInterval(_countdownFirmasInterval);
    _countdownFirmasInterval = setInterval(() => {
        document.querySelectorAll('[data-expira]').forEach(el => {
            const expira = el.getAttribute('data-expira');
            const restante = formatearTiempoRestante(expira);
            el.textContent = restante;
            el.style.color = restante === 'EXPIRADO' ? '#f87171' : (restante.startsWith('0:') ? '#fbbf24' : '');
        });
    }, 1000);
}

function generarUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

async function generarEnlaceIndividual(nominaId, empleadoId, tipoDoc = 'nomina', periodoLabel = null) {
    const token = generarUUID();
    const periodo = periodoLabel || formatearPeriodoNomina(firmaFechaActual);

    const { error } = await supabaseClient.from('firmas_recibos').insert([{
        token: token,
        documento_id: nominaId,
        empleado_id: empleadoId,
        tipo_documento: tipoDoc,
        periodo_nomina: periodo,
        nomina_fecha_pago: firmaFechaActual,   // ← NUEVO: para recargar modal
        estado: 'pendiente',
        fecha_emision: new Date().toISOString()
    }]);

    if (error) {
        console.error('Error Supabase:', error);
        return showToast('Error al generar enlace: ' + error.message, 'error');
    }
    showToast('Enlace generado (válido 30 min)');
    await abrirModalFirmas(firmaFechaActual);
}

// Helper: tiempo restante formateado
function formatearTiempoRestante(expiraEn) {
    if (!expiraEn) return 'Sin expiración';
    const ms = new Date(expiraEn) - new Date();
    if (ms <= 0) return 'EXPIRADO';
    const min = Math.floor(ms / 60000);
    const seg = Math.floor((ms % 60000) / 1000);
    return `${min}:${String(seg).padStart(2, '0')}`;
}

// Interval global para actualizar los countdowns
let _countdownFirmasInterval = null;

function obtenerEnlaceFirma(token) {
    const baseUrl = window.location.origin + window.location.pathname.replace(/index\.html$/, '').replace(/\/$/, '');
    return `${baseUrl}/firma.html?token=${token}`;
}

function copiarEnlaceFirma(token) {
    const enlace = obtenerEnlaceFirma(token);
    navigator.clipboard.writeText(enlace).then(() => {
        showToast('Enlace copiado al portapapeles');
    }).catch(() => {
        prompt('Copiá este enlace manualmente:', enlace);
    });
}

function enviarWAEnlaceFirma(token, empleadoId) {
    const emp = appState.empleados.find(e => String(e.id) === String(empleadoId));
    if (!emp || !emp.telefono) return showToast('Empleado sin teléfono', 'error');

    let tel = emp.telefono.replace(/\D/g, '');
    if (tel.startsWith('0')) tel = '58' + tel.substring(1);
    else if (tel.length === 10) tel = '58' + tel;

    const enlace = obtenerEnlaceFirma(token);
    const msj = `Hola ${emp.nombre}, tu recibo de nómina del ${firmaFechaActual} está listo para firma digital. Ingresá aquí desde tu celular:\n\n${enlace}\n\nUna vez firmado, podrás descargar tu copia.`;
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msj)}`, '_blank');
}

async function anularEnlaceFirma(token) {
    console.log('[Anular] Token recibido:', token);
    
    // 1. Buscar la firma
    const { data: firma, error: errFirma } = await supabaseClient
        .from('firmas_recibos')
        .select('*')
        .eq('token', token)
        .maybeSingle();

    if (errFirma) {
        console.error('[Anular] Error buscando firma:', errFirma);
        return showToast('Error: ' + errFirma.message, 'error');
    }
    if (!firma) {
        console.warn('[Anular] No se encontró la firma');
        return showToast('Enlace no encontrado', 'error');
    }

    const yaFirmado = firma.estado === 'firmado';
    const msg = yaFirmado
        ? '⚠️ Este documento YA fue firmado.\n\nAl anular se eliminará el enlace, el PDF firmado del storage y la entrada del expediente.\n\n¿Continuar?'
        : '¿Anular este enlace? Podrás generar uno nuevo después.';

    if (!window.confirm(msg)) return;

    // 2. Determinar la fecha de pago (para recargar el modal correcto)
    let fechaPagoRecarga = firmaFechaActual;
    if (!fechaPagoRecarga || !appState.nominas.find(n => n.fecha_pago === fechaPagoRecarga)) {
        // Fallback: buscar en nominas por documento_id
        const { data: nom } = await supabaseClient
            .from('nominas')
            .select('fecha_pago')
            .eq('id', firma.documento_id)
            .maybeSingle();
        fechaPagoRecarga = nom?.fecha_pago || firmaFechaActual;
    }
    console.log('[Anular] Fecha para recargar modal:', fechaPagoRecarga);

    // 3. Si estaba firmado, limpiar PDF + expediente
    if (yaFirmado && firma.url_pdf_firmado) {
        try {
            const path = firma.url_pdf_firmado.split('/expediente/')[1];
            if (path) {
                await supabaseClient.storage.from('expediente').remove([decodeURIComponent(path)]);
            }
            await supabaseClient
                .from('expediente_documentos')
                .delete()
                .eq('empleado_id', firma.empleado_id)
                .eq('url_archivo', firma.url_pdf_firmado);
            console.log('[Anular] PDF y expediente limpiados');
        } catch (e) { console.warn('[Anular] No se pudo limpiar PDF:', e); }
    }

    // 4. Borrar la fila del token — CON manejo de error visible
    const { error: delError, count } = await supabaseClient
        .from('firmas_recibos')
        .delete()
        .eq('token', token);

    if (delError) {
        console.error('[Anular] Error eliminando fila:', delError);
        return showToast('Error al anular: ' + delError.message, 'error');
    }
    console.log('[Anular] Fila eliminada. Count:', count);

    showToast(yaFirmado ? 'Enlace + PDF eliminados' : 'Enlace anulado');

    // 5. Recargar el modal
    if (fechaPagoRecarga) {
        await abrirModalFirmas(fechaPagoRecarga);
    } else {
        closeModal('modal-gestion-firmas');
    }
}
async function generarTodosEnlacesFaltantes() {
    const regs = appState.nominas.filter(n => n.fecha_pago === firmaFechaActual);
    const { data: existentes } = await supabaseClient
        .from('firmas_recibos')
        .select('documento_id')
        .eq('tipo_documento', 'nomina')
        .in('documento_id', regs.map(r => r.id));

    const existentesSet = new Set((existentes || []).map(e => String(e.documento_id)));
    const faltantes = regs.filter(r => !existentesSet.has(String(r.id)));

    if (faltantes.length === 0) return showToast('Todos los empleados ya tienen enlace', 'info');

    showToast(`Generando ${faltantes.length} enlaces...`);
    for (const r of faltantes) {
        await generarEnlaceIndividual(r.id, r.empleado_id);
    }
}

async function abrirJustificativoFalta(empId) {
    const emp = appState.empleados.find(e => String(e.id) === String(empId));
    if (!emp) return;
    
    const motivo = prompt(`Justificativo de falta para ${emp.nombre}\n\nMotivo:`);
    if (!motivo) return;
    
    const fechaFalta = prompt('Fecha de la falta (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
    if (!fechaFalta) return;
    
    const { error } = await supabaseClient.from('justificativos_faltas').insert([{
        empleado_id: empId,
        fecha_falta: fechaFalta,
        motivo: motivo
    }]);
    
    if (error) return showToast('Error: ' + error.message, 'error');
    
    // Reducir los días faltantes automáticamente
    const inputDf = gId(`df-${empId}`);
    const actual = parseFloat(inputDf.value) || 0;
    if (actual > 0) {
        inputDf.value = Math.max(0, actual - 1);
        actualizarFilaYTotales(empId);
    }
    
    showToast('Justificativo registrado. Días faltantes reducidos.');
}

// Convierte "2026-10-15" → "15/10/2026"
function formatearPeriodoNomina(fechaPago) {
    if (!fechaPago) return null;
    
    // Si ya viene en formato DD/MM/YYYY (por si acaso)
    if (fechaPago.includes('/')) return fechaPago;
    
    // Si viene en formato YYYY-MM-DD
    const [year, month, day] = fechaPago.split('-');
    if (!year || !month || !day) return fechaPago;
    
    const numDia = parseInt(day);
    let diaQuincena = '15';
    
    // Si es mayor a 15, calculamos el último día del mes
    if (numDia > 15) {
        const ultimoDia = new Date(parseInt(year), parseInt(month), 0).getDate();
        diaQuincena = ultimoDia.toString().padStart(2, '0');
    }
    
    return `${diaQuincena}/${month}/${year}`;
}


// Renovar un enlace expirado (da 30 min más)
async function renovarEnlaceFirma(token) {
    if (!confirm('¿Renovar este enlace por 30 minutos más?')) return;
    const nuevaExp = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { error } = await supabaseClient
        .from('firmas_recibos')
        .update({ expira_en: nuevaExp, estado: 'pendiente' })
        .eq('token', token);
    if (error) return showToast('Error: ' + error.message, 'error');
    showToast('Enlace renovado por 30 minutos');
    await abrirModalFirmas(firmaFechaActual);
}

/* Cierra el modal de firmas limpiando el interval */
function cerrarModalFirmas() {
    try {
        if (typeof _countdownFirmasInterval !== 'undefined' && _countdownFirmasInterval) {
            clearInterval(_countdownFirmasInterval);
            _countdownFirmasInterval = null;
        }
    } catch (e) { console.warn('Error limpiando countdown:', e); }

    const el = gId('modal-gestion-firmas');
    if (el) {
        el.classList.add('hidden');
        el.classList.remove('flex');
    }
}

/* ============================================================
   GESTIÓN GENÉRICA DE FIRMAS (Para Vacaciones, Utilidades, etc.)
   ============================================================ */

async function abrirModalFirmaGenerico(tipo, docs) {
    if (!docs || docs.length === 0) return showToast('No hay documentos para firmar', 'error');

    gId('firmas-fecha-titulo').innerText = docs[0]?.periodo || 'Documentos';
    gId('tabla-firmas-body').innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-500">Cargando estados...</td></tr>';
    openModal('modal-gestion-firmas');

    // Guardamos temporalmente los docs en una variable global para que las funciones puedan consultarla
    window._docsFirmaActuales = docs;

    const { data: firmasExistentes } = await supabaseClient
        .from('firmas_recibos')
        .select('*')
        .eq('tipo_documento', tipo)
        .in('documento_id', docs.map(d => d.id));

    const mapaFirmas = {};
    (firmasExistentes || []).forEach(f => { mapaFirmas[String(f.documento_id)] = f; });

    gId('tabla-firmas-body').innerHTML = docs.map(r => {
        const firma = mapaFirmas[String(r.id)];
        let estadoBadge, acciones;

        // Validación de seguridad por si el empleado_id viene nulo
        const safeEmpId = r.empleado_id || 'null'; 

        if (!firma) {
            estadoBadge = '<span class="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">Sin enlace</span>';
            acciones = `<button onclick="generarEnlaceGenerico('${tipo}', '${r.id}')" class="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] px-2.5 py-1 rounded font-bold"><i class="fa-solid fa-link mr-1"></i> Generar</button>`;
        } else if (firma.estado === 'pendiente') {
            estadoBadge = '<span class="text-[10px] bg-amber-950 text-amber-300 border border-amber-800 px-2 py-0.5 rounded font-bold">Pendiente</span>';
            acciones = `
                <button onclick="copiarEnlaceFirma('${firma.token}')" class="bg-slate-700 hover:bg-slate-600 text-white text-[10px] px-2 py-1 rounded" title="Copiar"><i class="fa-solid fa-copy"></i></button>
                <button onclick="enviarWAEnlaceGenerico('${firma.token}', ${safeEmpId}, '${tipo}')" class="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] px-2 py-1 rounded" title="WhatsApp"><i class="fa-brands fa-whatsapp"></i></button>
                <button onclick="anularEnlaceFirma('${firma.token}')" class="bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 text-[10px] px-2 py-1 rounded" title="Anular"><i class="fa-solid fa-xmark"></i></button>
            `;
        } else {
            estadoBadge = '<span class="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded font-bold"><i class="fa-solid fa-check"></i> Firmado</span>';
            acciones = `
                <a href="${firma.url_pdf_firmado}" target="_blank" class="bg-sky-600 hover:bg-sky-500 text-white text-[10px] px-2 py-1 rounded inline-block" title="Ver PDF"><i class="fa-solid fa-file-pdf"></i></a>
                <button onclick="anularEnlaceFirma('${firma.token}')" class="bg-slate-700 hover:bg-slate-600 text-white text-[10px] px-2 py-1 rounded" title="Regenerar"><i class="fa-solid fa-rotate"></i></button>
            `;
        }

        return `<tr class="border-b border-slate-800 hover:bg-slate-800/40">
            <td class="p-2 text-xs font-semibold text-white">${r.empleado}</td>
            <td class="p-2 text-center">${estadoBadge}</td>
            <td class="p-2 text-center text-[10px] text-slate-400 font-mono">${r.neto_bs ? 'Bs. ' + fNum(r.neto_bs) : '-'}</td>
            <td class="p-2 text-center text-[10px] text-slate-400">${r.periodo}</td>
            <td class="p-2 text-right space-x-1">${acciones}</td>
        </tr>`;
    }).join('');
}
async function generarEnlaceGenerico(tipo, docId) {
    // Buscamos el documento en la memoria para obtener los datos reales de forma segura
    const docInfo = window._docsFirmaActuales.find(d => String(d.id) === String(docId));
    if (!docInfo) return showToast('Error: Documento no encontrado en memoria', 'error');

    const token = generarUUID();
    const { error } = await supabaseClient.from('firmas_recibos').insert([{
        token: token,
        documento_id: docId,
        empleado_id: docInfo.empleado_id,
        tipo_documento: tipo,
        periodo_nomina: docInfo.periodo,
        estado: 'pendiente',
        fecha_emision: new Date().toISOString()
    }]);

    if (error) {
        console.error(error);
        return showToast('Error al generar: ' + error.message, 'error');
    }
    
    showToast('Enlace generado correctamente');
    
    // Recargamos el modal pasando el mismo tipo y los docs
    abrirModalFirmaGenerico(tipo, window._docsFirmaActuales);
}

function enviarWAEnlaceGenerico(token, empId, tipo) {
    if (empId === 'null' || !empId) return showToast('Empleado no tiene ID válido', 'error');

    const emp = appState.empleados.find(e => String(e.id) === String(empId));
    if (!emp || !emp.telefono) return showToast('Empleado sin teléfono registrado', 'error');
    
    // Buscamos el período desde la memoria para el mensaje
    const docInfo = window._docsFirmaActuales.find(d => d.token === token) || window._docsFirmaActuales[0];
    const periodoStr = docInfo ? docInfo.periodo : '';

    let tel = emp.telefono.replace(/\D/g, '');
    if (tel.startsWith('0')) tel = '58' + tel.substring(1); 
    else if (tel.length === 10) tel = '58' + tel;

    const baseUrl = window.location.origin + window.location.pathname.replace(/index\.html$/, '').replace(/\/$/, '');
    const enlace = `${baseUrl}/firma.html?token=${token}`;
    const msj = `Hola ${emp.nombre}, tu recibo de ${tipo} (${periodoStr}) está listo para firma digital. Ingresá aquí:\n\n${enlace}`;
    
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msj)}`, '_blank');
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
   FUNCIONES DE ENLACE PARA OTROS MÓDULOS
   ============================================================ */

function abrirFirmaVacacion(id) {
    const v = appState.vacaciones.find(x => String(x.id) === String(id));
    if (!v) return showToast('No se encontró el registro', 'error');
    const empId = v.empleado_id || (v.detalle_calculo?.empleado?.id);
    
    abrirModalFirmaGenerico('vacaciones', [{ 
        id: v.id, 
        empleado: v.empleado, 
        empleado_id: empId, 
        neto_bs: v.gran_total_bs || 0, 
        periodo: `Vacaciones ${v.periodo}` 
    }]);
}

function abrirFirmaPrestacion(id) {
    const a = appState.antiguedad.find(x => String(x.id) === String(id));
    if (!a) return showToast('No se encontró el registro', 'error');
    const empId = a.empleado_id || (a.detalle_calculo?.empleado?.id);
    
    abrirModalFirmaGenerico('prestaciones', [{ 
        id: a.id, 
        empleado: a.empleado, 
        empleado_id: empId, 
        neto_bs: a.monto_definitivo_bs || 0, 
        periodo: `Corte ${a.fecha_corte}` 
    }]);
}

function abrirFirmaLiquidacion(id) {
    const p = appState.prestaciones.find(x => String(x.id) === String(id));
    if (!p) return showToast('No se encontró el registro', 'error');
    const empId = p.empleado_id || (p.detalle_calculo?.empleado?.id);
    
    abrirModalFirmaGenerico('liquidacion', [{ 
        id: p.id, 
        empleado: p.empleado, 
        empleado_id: empId, 
        neto_bs: p.total_bs || 0, 
        periodo: `Egreso ${p.fecha_calculo}` 
    }]);
}

function abrirFirmaUtilidades(periodo, fecha) {
    const regs = appState.utilidades.filter(u => String(u.periodo) === String(periodo) && String(u.fecha_pago) === String(fecha));
    
    const docs = regs.map(u => ({
        id: u.id,
        empleado: u.empleado,
        empleado_id: u.empleado_id,
        neto_bs: u.gran_total_bs || u.total_bs,
        periodo: `${periodo}`
    }));
    
    abrirModalFirmaGenerico('utilidades', docs);
}
/* ============================================================
   EDICIÓN DE NÓMINAS PROCESADAS
   ============================================================ */

let _nominasEditando = [];

function abrirModalEditarNomina(fecha) {
    const regs = appState.nominas.filter(n => n.fecha_pago === fecha);
    if (regs.length === 0) return showToast('No hay registros para editar', 'error');

    gId('edit-nom-fecha').innerText = fecha;
    _nominasEditando = regs.map(r => ({ ...r })); // Copia para no modificar el estado hasta guardar

    gId('tabla-editar-nomina-body').innerHTML = _nominasEditando.map((r, idx) => `
        <tr id="edit-row-${idx}" class="hover:bg-slate-800/40">
            <td class="p-2 font-bold text-white text-xs">${r.empleado}</td>
            <td class="p-2 text-center"><input type="number" id="edit-df-${idx}" value="${r.dias_faltantes || 0}" class="w-14 bg-slate-950 border border-slate-700 rounded p-1 text-xs text-white text-center" oninput="recalcularFilaEdit(${idx})"></td>
            <td class="p-2 text-center"><input type="number" id="edit-hed-${idx}" value="${r.hed || 0}" class="w-12 bg-slate-950 border border-slate-700 rounded p-1 text-xs text-indigo-300 text-center" oninput="recalcularFilaEdit(${idx})"></td>
            <td class="p-2 text-center"><input type="number" id="edit-hnoct-${idx}" value="${r.hnoct || 0}" class="w-12 bg-slate-950 border border-slate-700 rounded p-1 text-xs text-indigo-300 text-center" oninput="recalcularFilaEdit(${idx})"></td>
            <td class="p-2 text-center"><input type="number" id="edit-fer-${idx}" value="${r.fer || 0}" class="w-12 bg-slate-950 border border-slate-700 rounded p-1 text-xs text-indigo-300 text-center" oninput="recalcularFilaEdit(${idx})"></td>
            <td class="p-2"><input type="number" step="0.01" id="edit-oa-${idx}" value="${r.otras_asignaciones || 0}" class="w-16 bg-slate-950 border border-slate-700 rounded p-1 text-xs text-white" oninput="recalcularFilaEdit(${idx})"></td>
            <td class="p-2 text-center"><input type="number" id="edit-hd-${idx}" value="${r.horas_descuento || 0}" class="w-12 bg-slate-950 border border-slate-700 rounded p-1 text-xs text-white text-center" oninput="recalcularFilaEdit(${idx})"></td>
            <td class="p-2"><input type="number" step="0.01" id="edit-od-${idx}" value="${r.otros_descuentos || 0}" class="w-16 bg-slate-950 border border-slate-700 rounded p-1 text-xs text-white" oninput="recalcularFilaEdit(${idx})"></td>
            <td class="p-2"><input type="number" step="0.01" id="edit-ad-${idx}" value="${r.adelantos || 0}" class="w-16 bg-slate-950 border border-slate-700 rounded p-1 text-xs text-white" oninput="recalcularFilaEdit(${idx})"></td>
            <td class="p-2"><input type="number" step="0.01" id="edit-pr-${idx}" value="${r.prestamos || 0}" class="w-16 bg-slate-950 border border-slate-700 rounded p-1 text-xs text-white" oninput="recalcularFilaEdit(${idx})"></td>
            <td class="p-2 text-center"><input type="number" step="0.01" id="edit-islr-${idx}" value="${r.islr_porcentaje || 0}" class="w-12 bg-slate-950 border border-slate-700 rounded p-1 text-xs text-amber-300 text-center" oninput="recalcularFilaEdit(${idx})"></td>
            <td class="p-2 text-amber-400 font-medium" id="edit-ley-${idx}">Bs. ${(Number(r.ivss_usd) + Number(r.rpe_usd) + Number(r.faov_usd) + Number(r.islr_usd)).toFixed(2)}</td>
            <td class="p-2 font-bold text-emerald-400" id="edit-neto-usd-${idx}">$${Number(r.neto_usd).toFixed(2)}</td>
            <td class="p-2 font-bold text-emerald-400" id="edit-neto-bs-${idx}">Bs. ${Number(r.neto_bs).toFixed(2)}</td>
        </tr>
    `).join('');

    openModal('modal-editar-nomina');
}

function recalcularFilaEdit(idx) {
    const r = _nominasEditando[idx];
    const t = Number(r.tasa_bcv) || 1;
    const sM = Number(r.salario_minimo_bs) || 130;
    const sb = Number(r.salario_base) || 0;
    const bam = Number(r.bono_alimentacion) || 0;
    const oim = Number(r.otros_ingresos) || 0;
    const sim = sb + bam + oim;
    const dia = sim / 30;
    const base = dia * 15;

    const df = parseFloat(gId(`edit-df-${idx}`).value) || 0;
    const hed = parseFloat(gId(`edit-hed-${idx}`).value) || 0;
    const hnoct = parseFloat(gId(`edit-hnoct-${idx}`).value) || 0;
    const fer = parseFloat(gId(`edit-fer-${idx}`).value) || 0;
    const oa = parseFloat(gId(`edit-oa-${idx}`).value) || 0;
    const hd = parseFloat(gId(`edit-hd-${idx}`).value) || 0;
    const od = parseFloat(gId(`edit-od-${idx}`).value) || 0;
    const ad = parseFloat(gId(`edit-ad-${idx}`).value) || 0;
    const pr = parseFloat(gId(`edit-pr-${idx}`).value) || 0;
    const islrPct = parseFloat(gId(`edit-islr-${idx}`).value) || 0;

    const horaBase = (sb / 30) / 8;
    const diaBase = sb / 30;
    const montoHED = horaBase * 1.5 * hed;
    const montoNoct = horaBase * 0.30 * hnoct;
    const montoFer = diaBase * 1.5 * fer;
    const totalRecargosUSD = montoHED + montoNoct + montoFer;

    const sbBs = sb * t;
    const ivss = (Math.min(sbBs, 5 * sM) * 12 / 52) * 0.04 * 2;
    const rpe = (Math.min(sbBs, 10 * sM) * 12 / 52) * 0.005 * 2;
    const faov = (sbBs * 0.01) / 2;
    const leyU = (ivss + rpe + faov) / t;

    const baseSalarialImponibleUSD = Math.max(0, ((sb / 30) * (15 - df)) + totalRecargosUSD);
    const islrUSD = baseSalarialImponibleUSD * (islrPct / 100);

    const netoU = base - (dia * df) + oa + totalRecargosUSD - ((dia / 8) * hd) - od - ad - pr - leyU - islrUSD;
    const netoB = netoU * t;

    gId(`edit-ley-${idx}`).innerText = `Bs. ${(ivss + rpe + faov + (islrUSD * t)).toFixed(2)}`;
    gId(`edit-neto-usd-${idx}`).innerText = `$${netoU.toFixed(2)}`;
    gId(`edit-neto-bs-${idx}`).innerText = `Bs. ${netoB.toFixed(2)}`;

    // Guardar valores calculados en el objeto temporal
    r._new_df = df; r._new_hed = hed; r._new_hnoct = hnoct; r._new_fer = fer;
    r._new_oa = oa; r._new_hd = hd; r._new_od = od; r._new_ad = ad; r._new_pr = pr; r._new_islr = islrPct;
    r._new_netoU = netoU; r._new_netoB = netoB; r._new_leyU = leyU; r._new_islrUSD = islrUSD;
    r._new_ivss = ivss / t; r._new_rpe = rpe / t; r._new_faov = faov / t; r._new_recargos = totalRecargosUSD;
}

async function guardarEdicionNomina() {
    if (!confirm('¿Guardar los ajustes realizados a esta nómina? Se actualizarán los saldos de préstamos si hubo cambios.')) return;

    const empUpdates = [];
    let cambios = 0;

    for (const r of _nominasEditando) {
        if (r._new_df === undefined) continue; // Si no se tocó la fila, saltar

        const prDiff = r._new_pr - Number(r.prestamos);
        
        const updateData = {
            dias_faltantes: r._new_df, hed: r._new_hed, hnoct: r._new_hnoct, fer: r._new_fer,
            otras_asignaciones: r._new_oa, horas_descuento: r._new_hd, otros_descuentos: r._new_od,
            adelantos: r._new_ad, prestamos: r._new_pr, islr_porcentaje: r._new_islr,
            recargos_lottt_usd: r._new_recargos, islr_usd: r._new_islrUSD, islr_bs: r._new_islrUSD * r.tasa_bcv,
            ivss_usd: r._new_ivss, rpe_usd: r._new_rpe, faov_usd: r._new_faov, descuentos_ley_usd: r._new_leyU,
            neto_usd: r._new_netoU, neto_bs: r._new_netoB
        };
        
        await supabaseClient.from('nominas').update(updateData).eq('id', r.id);

        if (prDiff !== 0) {
            const emp = appState.empleados.find(e => String(e.id) === String(r.empleado_id));
            if (emp) {
                const nuevoSaldo = Math.max(0, (Number(emp.saldo_prestamo) || 0) - prDiff);
                emp.saldo_prestamo = nuevoSaldo;
                empUpdates.push(supabaseClient.from('empleados').update({ saldo_prestamo: nuevoSaldo }).eq('id', emp.id));
            }
        }
        cambios++;
    }

    if (empUpdates.length > 0) await Promise.all(empUpdates);
    
    closeModal('modal-editar-nomina');
    showToast(`Nómina editada correctamente (${cambios} registros actualizados)`);
    if (typeof fetchAllData === 'function') fetchAllData();
}
