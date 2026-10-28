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
        const si = Number(e.sueldo) + Number(e.bono_alimentacion) + Number(e.otros_ingresos);
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
            <td class="p-3 font-semibold text-sky-400" style="min-width: 95px;">$${si.toFixed(2)}</td>
            <td class="p-3 text-center" style="min-width: 70px;"><input type="number" id="df-${e.id}" value="${dfVal}" min="0" autocomplete="off" oninput="actualizarFilaYTotales(${e.id}); autoguardarBorradorNomina();" style="width: 50px;" class="bg-slate-950 border border-slate-800 rounded text-center p-1 text-xs text-white focus:border-emerald-500 outline-none"></td>
            <td class="p-3 text-center" data-feature="nomina.recargos_lottt" style="min-width: 65px;"><input type="number" id="hed-${e.id}" value="${hedVal}" min="0" autocomplete="off" oninput="actualizarFilaYTotales(${e.id}); autoguardarBorradorNomina();" style="width: 50px;" class="bg-slate-950 border border-indigo-900/50 rounded text-center p-1 text-xs text-indigo-300 focus:border-indigo-500 outline-none"></td>
            <td class="p-3 text-center" data-feature="nomina.recargos_lottt" style="min-width: 65px;"><input type="number" id="hnoct-${e.id}" value="${hnoctVal}" min="0" autocomplete="off" oninput="actualizarFilaYTotales(${e.id}); autoguardarBorradorNomina();" style="width: 50px;" class="bg-slate-950 border border-indigo-900/50 rounded text-center p-1 text-xs text-indigo-300 focus:border-indigo-500 outline-none"></td>
            <td class="p-3 text-center" data-feature="nomina.recargos_lottt" style="min-width: 65px;"><input type="number" id="fer-${e.id}" value="${ferVal}" min="0" autocomplete="off" oninput="actualizarFilaYTotales(${e.id}); autoguardarBorradorNomina();" style="width: 50px;" class="bg-slate-950 border border-indigo-900/50 rounded text-center p-1 text-xs text-indigo-300 focus:border-indigo-500 outline-none"></td>
            <td class="p-3" style="min-width: 95px;"><input type="number" step="0.01" id="oa-${e.id}" value="${oaVal}" autocomplete="off" oninput="actualizarFilaYTotales(${e.id}); autoguardarBorradorNomina();" style="width: 75px;" class="bg-slate-950 border border-slate-800 rounded p-1 text-xs text-white focus:border-emerald-500 outline-none"></td>
            <td class="p-3 text-center" style="min-width: 70px;"><input type="number" id="hd-${e.id}" value="${hdVal}" min="0" autocomplete="off" oninput="actualizarFilaYTotales(${e.id}); autoguardarBorradorNomina();" style="width: 50px;" class="bg-slate-950 border border-slate-800 rounded text-center p-1 text-xs text-white focus:border-emerald-500 outline-none"></td>
            <td class="p-3" style="min-width: 95px;"><input type="number" step="0.01" id="od-${e.id}" value="${odVal}" autocomplete="off" oninput="actualizarFilaYTotales(${e.id}); autoguardarBorradorNomina();" style="width: 75px;" class="bg-slate-950 border border-slate-800 rounded p-1 text-xs text-white focus:border-emerald-500 outline-none"></td>
            <td class="p-3" data-feature="nomina.adelantos" style="min-width: 95px;"><input type="number" step="0.01" id="ad-${e.id}" value="${adVal}" autocomplete="off" oninput="actualizarFilaYTotales(${e.id}); autoguardarBorradorNomina();" style="width: 75px;" class="bg-slate-950 border border-slate-800 rounded p-1 text-xs text-white focus:border-emerald-500 outline-none"></td>
            <td class="p-3" data-feature="nomina.prestamos" style="min-width: 95px;"><input type="number" step="0.01" id="pr-${e.id}" value="${prVal}" autocomplete="off" oninput="actualizarFilaYTotales(${e.id}); autoguardarBorradorNomina();" style="width: 75px;" class="bg-slate-950 border border-slate-800 rounded p-1 text-xs text-white focus:border-emerald-500 outline-none"></td>
            <td class="p-3 text-center" data-feature="nomina.islr" style="min-width: 70px;"><input type="number" step="0.01" id="islr-${e.id}" value="${islrVal}" min="0" max="100" autocomplete="off" oninput="actualizarFilaYTotales(${e.id}); autoguardarBorradorNomina();" style="width: 55px;" class="bg-slate-950 border border-amber-900/50 rounded text-center p-1 text-xs text-amber-300 focus:border-amber-500 outline-none"></td>
            <td class="p-3 text-amber-400 font-medium" style="min-width: 95px;" id="ley-${e.id}">Bs. 0.00</td>
            <td class="p-3 font-bold text-emerald-400" style="min-width: 85px;" id="neto-usd-${e.id}">$0.00</td>
            <td class="p-3 font-bold text-emerald-400" style="min-width: 100px;" id="neto-bs-${e.id}">Bs. 0.00</td>
        </tr>`;
    }).join('');

    recalcularTodaLaNomina();
    if (typeof aplicarFeatureFlagsDOM === 'function') aplicarFeatureFlagsDOM();
}

function calcularNominaFila(id) {
    const e = appState.empleados.find(x => String(x.id) === String(id));
    if (!e) return { u: 0, b: 0 };

    const t = parseFloat(gId('nom-tasa-bcv').value) || 36.5;
    const sM = parseFloat(gId('nom-salario-minimo').value) || 130;
    const lun = parseInt(gId('nom-lunes').value) || 2;

    const sb = Number(e.sueldo) || 0;
    const si = sb + (Number(e.bono_alimentacion) || 0) + (Number(e.otros_ingresos) || 0);
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

    const hed = (typeof getFeatureFlag === 'function' && getFeatureFlag('nomina.recargos_lottt')) ? parseFloat(gId(`hed-${id}`)?.value || 0) : 0;
    const hnoct = (typeof getFeatureFlag === 'function' && getFeatureFlag('nomina.recargos_lottt')) ? parseFloat(gId(`hnoct-${id}`)?.value || 0) : 0;
    const fer = (typeof getFeatureFlag === 'function' && getFeatureFlag('nomina.recargos_lottt')) ? parseFloat(gId(`fer-${id}`)?.value || 0) : 0;
    const islrPct = (typeof getFeatureFlag === 'function' && getFeatureFlag('nomina.islr')) ? parseFloat(gId(`islr-${id}`)?.value || 0) : 0;

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

    const totalAsignacionesUSD = base - (dia * df) + totalRecargosUSD + oa;
    const netoU = totalAsignacionesUSD - ((dia / 8) * hd) - od - ad - pr - leyU - islrUSD;
    const netoB = netoU * t;

    const elLey = gId(`ley-${id}`);
    if (elLey) elLey.innerText = `Bs. ${(ivss + rpe + faov + (islrUSD * t)).toFixed(2)}`;

    const elNetoU = gId(`neto-usd-${id}`);
    if (elNetoU) elNetoU.innerText = `$${netoU.toFixed(2)}`;

    const elNetoB = gId(`neto-bs-${id}`);
    if (elNetoB) elNetoB.innerText = `Bs. ${netoB.toFixed(2)}`;

    nominaTotalesCache[id] = { u: netoU, b: netoB };
    return nominaTotalesCache[id];
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
    let tu = 0, tb = 0;
    appState.empleados.filter(e => e.activo).forEach(e => {
        if (nominaTotalesCache[e.id]) { tu += nominaTotalesCache[e.id].u; tb += nominaTotalesCache[e.id].b; }
    });
    if (gId('nom-total-usd')) gId('nom-total-usd').value = `$${tu.toFixed(2)}`;
    if (gId('nom-total-bs')) gId('nom-total-bs').value = `Bs. ${tb.toFixed(2)}`;
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
                <button onclick="generarEnlaceFirma('${f}')" class="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/30 text-xs px-2.5 py-1 rounded-lg font-medium inline-flex items-center transition"><i class="fa-solid fa-signature mr-1"></i> Enviar a Firmar</button>
                <button onclick="generarTXTAlimentacion('${f}')" class="bg-teal-600/20 hover:bg-teal-600/40 text-teal-400 border border-teal-500/30 text-xs px-2.5 py-1 rounded-lg font-medium inline-flex items-center transition"><i class="fa-solid fa-file-lines mr-1"></i> TXT Alimentación</button>
                <button onclick="generarTXTSubsidio('${f}')" class="bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 border border-purple-500/30 text-xs px-2.5 py-1 rounded-lg font-medium inline-flex items-center transition"><i class="fa-solid fa-file-lines mr-1"></i> TXT Subsidio</button>
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

async function generarEnlaceFirma(fechaPago) {
    const regs = appState.nominas.filter(n => n.fecha_pago === fechaPago);
    if (regs.length === 0) return showToast('No hay recibos para esta fecha', 'error');
    
    // Por simplicidad, generamos enlaces para todos los empleados de esa nómina
    let enlacesGenerados = 0;
    
    for (const r of regs) {
        const token = crypto.randomUUID(); // Genera un ID único
        
        const { error } = await supabaseClient.from('firmas_recibos').insert([{
            token: token,
            nomina_id: r.id, // Asumiendo que tienes el ID del registro
            empleado_id: r.empleado_id,
            estado: 'pendiente'
        }]);
        
        if (!error) {
            enlacesGenerados++;
            const baseUrl = window.location.origin; // Ej: https://tuapp.github.io
            const enlace = `${baseUrl}/firma.html?token=${token}`;
            
            // Opcional: Abrir WhatsApp automáticamente
            const emp = appState.empleados.find(e => String(e.id) === String(r.empleado_id));
            if (emp && emp.telefono) {
                let tel = emp.telefono.replace(/\D/g, '');
                if (tel.startsWith('0')) tel = '58' + tel.substring(1);
                const msj = `Hola ${emp.nombre}, por favor firma tu recibo de nómina aquí: ${enlace}`;
                window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msj)}`, '_blank');
            }
        }
    }
    showToast(`${enlacesGenerados} enlaces de firma generados`);
}
