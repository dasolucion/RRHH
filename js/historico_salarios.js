/* ============================================================
   js/historico_salarios.js
   Historial salarial mes a mes para el cálculo de prestaciones.
   ============================================================ */

function alCambiarEmpleadoHistorico() {
    const empId = gId('hist-sal-emp-select').value;
    const emp = appState.empleados.find(e => String(e.id) === String(empId));
    const badge = gId('badge-salarios-info');
    if (emp && badge) {
        badge.innerHTML = `<span class="text-white font-bold">${emp.nombre}</span> | Ingreso: <span class="font-mono text-cyan-400">${emp.fecha_ingreso || 'N/D'}</span> | Salario actual: <span class="text-emerald-400 font-bold">$${Number(emp.sueldo).toFixed(2)}</span>`;
    }
}

function generarMesesHistorico() {
    const empId = gId('hist-sal-emp-select').value;
    if (!empId) return showToast('Seleccione un empleado', 'error');
    const emp = appState.empleados.find(e => String(e.id) === String(empId));
    if (!emp || !emp.fecha_ingreso) return showToast('Empleado sin fecha de ingreso', 'error');

    const [iy, im] = emp.fecha_ingreso.split('-');
    let startYear = parseInt(iy);
    let startMonth = parseInt(im);
    const hoy = new Date();
    const endYear = hoy.getFullYear();
    const endMonth = hoy.getMonth() + 1;

    const meses = [];
    let cy = startYear;
    let cm = startMonth;

    while (cy < endYear || (cy === endYear && cm <= endMonth)) {
        const mesClave = `${cy}-${String(cm).padStart(2, '0')}`;
        const existente = appState.historicoSalarios.find(h => String(h.empleado_id) === String(empId) && h.mes === mesClave);
        meses.push({
            mes: mesClave,
            sueldo_base: existente ? Number(existente.sueldo_base) : Number(emp.sueldo || 0),
            bono_alimentacion: existente ? Number(existente.bono_alimentacion) : Number(emp.bono_alimentacion || 0),
            subsidio: existente ? Number(existente.subsidio) : Number(emp.otros_ingresos || 0)
        });
        cm++;
        if (cm > 12) { cm = 1; cy++; }
    }

    meses.sort((a, b) => b.mes.localeCompare(a.mes));
    appState.mesesEditablesActuales = meses;
    renderTablaMesesEditables();
    showToast('Meses generados desde la fecha de ingreso');
}

function renderTablaMesesEditables() {
    const tbody = gId('tabla-salarios-body');
    if (!tbody) return;

    if (appState.mesesEditablesActuales.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">Sin datos que mostrar.</td></tr>`;
        return;
    }

    tbody.innerHTML = appState.mesesEditablesActuales.map((m, idx) => {
        const totalDevengado = m.sueldo_base + m.bono_alimentacion + m.subsidio;
        return `<tr class="hover:bg-slate-900/50">
            <td class="p-3 font-bold text-white font-mono text-xs">${m.mes}</td>
            <td class="p-3"><input type="number" step="0.01" value="${m.sueldo_base.toFixed(2)}" oninput="actualizarFilaMes(${idx}, 'sueldo_base', this.value)" class="w-28 bg-slate-950 border border-slate-700 rounded p-1.5 text-xs text-white font-mono outline-none focus:border-cyan-500"></td>
            <td class="p-3"><input type="number" step="0.01" value="${m.bono_alimentacion.toFixed(2)}" oninput="actualizarFilaMes(${idx}, 'bono_alimentacion', this.value)" class="w-28 bg-slate-950 border border-slate-700 rounded p-1.5 text-xs text-emerald-400 font-mono outline-none focus:border-cyan-500"></td>
            <td class="p-3"><input type="number" step="0.01" value="${m.subsidio.toFixed(2)}" oninput="actualizarFilaMes(${idx}, 'subsidio', this.value)" class="w-28 bg-slate-950 border border-slate-700 rounded p-1.5 text-xs text-sky-400 font-mono outline-none focus:border-cyan-500"></td>
            <td class="p-3 font-bold text-emerald-400 font-mono" id="td-tot-devengado-${idx}">$${totalDevengado.toFixed(2)}</td>
        </tr>`;
    }).join('');
}

function actualizarFilaMes(idx, campo, valor) {
    const val = parseFloat(valor) || 0;
    if (appState.mesesEditablesActuales[idx]) {
        appState.mesesEditablesActuales[idx][campo] = val;
        const m = appState.mesesEditablesActuales[idx];
        const totEl = gId(`td-tot-devengado-${idx}`);
        if (totEl) totEl.innerText = `$${(m.sueldo_base + m.bono_alimentacion + m.subsidio).toFixed(2)}`;
    }
}

async function guardarHistoricoMeses() {
    const empId = gId('hist-sal-emp-select').value;
    if (!empId || appState.mesesEditablesActuales.length === 0) {
        return showToast('No hay datos generados para guardar', 'error');
    }

    const registros = appState.mesesEditablesActuales.map(m => ({
        empleado_id: parseInt(empId, 10),
        mes: m.mes,
        sueldo_base: m.sueldo_base,
        bono_alimentacion: m.bono_alimentacion,
        subsidio: m.subsidio
    }));

    try { await supabaseClient.from('historico_salarios').upsert(registros, { onConflict: 'empleado_id,mes' }); } catch (e) {}

    registros.forEach(r => {
        const idx = appState.historicoSalarios.findIndex(x => String(x.empleado_id) === String(r.empleado_id) && x.mes === r.mes);
        if (idx >= 0) appState.historicoSalarios[idx] = { ...appState.historicoSalarios[idx], ...r };
        else appState.historicoSalarios.push({ id: Date.now() + Math.random(), ...r });
    });

    localStorage.setItem('nomina_historico_salarios', JSON.stringify(appState.historicoSalarios));
    showToast('Historial salarial guardado exitosamente');
}