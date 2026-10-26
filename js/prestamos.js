/* ============================================================
   js/prestamos.js
   Control de Préstamos, saldos y Anticipos de Prestaciones.
   ============================================================ */

let _debouncePrestamoTimer = null;

function obtenerAnticiposEmpleado(empId) {
    return (appState.anticipos || []).filter(a => String(a.empleado_id) === String(empId));
}

function totalAnticiposBs(empId) {
    return obtenerAnticiposEmpleado(empId).reduce((s, a) => s + Number(a.monto_bs || 0), 0);
}

function renderTablaPrestamos() {
    const tbody = gId('tabla-prestamos-body');
    if (!tbody) return;

    tbody.innerHTML = appState.empleados.map(e => {
        const saldoPres = Number(e.saldo_prestamo) || 0;
        const listaAntic = obtenerAnticiposEmpleado(e.id);
        const totalBs = listaAntic.reduce((s, a) => s + Number(a.monto_bs || 0), 0);

        return `<tr class="hover:bg-slate-900/50">
            <td class="p-3.5 font-bold text-white">${e.nombre}</td>
            <td class="p-3.5 font-mono text-slate-400">${e.cedula}</td>
            <td class="p-3.5"><input type="number" step="0.01" id="pres-saldo-${e.id}" value="${saldoPres.toFixed(2)}" class="w-28 bg-slate-950 border border-slate-700 rounded p-1.5 text-xs text-emerald-400 font-mono font-bold outline-none focus:border-emerald-500"></td>
            <td class="p-3.5">
                <div class="text-cyan-300 font-mono font-bold text-xs">Bs. ${fNum(totalBs)}</div>
                <div class="text-[10px] text-slate-500">${listaAntic.length} anticipo(s) registrado(s)</div>
            </td>
            <td class="p-3.5 text-right space-x-1">
                <button onclick="abrirModalAnticipos(${e.id})" class="bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-400 border border-cyan-500/30 text-xs px-3 py-1.5 rounded-lg font-medium transition" title="Registrar / ver anticipos con fecha"><i class="fa-solid fa-list mr-1"></i>Anticipos</button>
                <button onclick="guardarPrestamoFila(${e.id})" class="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 text-xs px-3 py-1.5 rounded-lg font-medium transition"><i class="fa-solid fa-save mr-1"></i>Saldo</button>
            </td>
        </tr>`;
    }).join('');
}

async function guardarPrestamoFila(empId) {
    const saldo = parseFloat(gId(`pres-saldo-${empId}`).value) || 0;
    const emp = appState.empleados.find(x => String(x.id) === String(empId));
    if (emp) { emp.saldo_prestamo = saldo; }

    clearTimeout(_debouncePrestamoTimer);
    _debouncePrestamoTimer = setTimeout(async () => {
        try { await supabaseClient.from('empleados').update({ saldo_prestamo: saldo }).eq('id', empId); } catch (e) {}
    }, 600);

    const rawDraft = localStorage.getItem('nomina_borrador_global');
    if (rawDraft) {
        try {
            let borrador = JSON.parse(rawDraft);
            if (borrador && borrador.filas) {
                if (borrador.filas[empId]) {
                    borrador.filas[empId].pr = saldo;
                } else {
                    borrador.filas[empId] = { df: 0, oa: 0, hd: 0, od: 0, ad: 0, pr: saldo };
                }
                localStorage.setItem('nomina_borrador_global', JSON.stringify(borrador));
                supabaseClient.from('prenomina_borrador').upsert([borrador]).then(() => {});
            }
        } catch (e) {}
    }

    if (typeof renderTablaNominaEditable === 'function') { renderTablaNominaEditable(); }
    showToast('Saldo de préstamo actualizado');
}

function abrirModalAnticipos(empId) {
    const emp = appState.empleados.find(x => String(x.id) === String(empId));
    if (!emp) return;

    gId('anticipo-emp-id').value = empId;
    gId('modal-anticipos-emp').innerText = emp.nombre;

    const hoy = new Date();
    gId('anticipo-fecha').value = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    gId('anticipo-monto').value = '';
    gId('anticipo-concepto').value = '';

    renderTablaAnticipos();
    openModal('modal-anticipos');
}

function renderTablaAnticipos() {
    const empId = gId('anticipo-emp-id').value;
    const tbody = gId('tabla-anticipos-body');
    if (!tbody) return;

    const lista = obtenerAnticiposEmpleado(empId).slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-500">No hay anticipos registrados.</td></tr>';
    } else {
        tbody.innerHTML = lista.map(a => {
            const [y, m, d] = (a.fecha || '').split('-');
            const fechaFmt = (y && m && d) ? `${d}/${m}/${y}` : a.fecha;
            return `<tr class="hover:bg-slate-900/50">
                <td class="p-2.5 text-white font-mono">${fechaFmt}</td>
                <td class="p-2.5 text-cyan-300 font-mono font-bold">Bs. ${fNum(a.monto_bs)}</td>
                <td class="p-2.5 text-slate-400">${a.concepto || '-'}</td>
                <td class="p-2.5 text-right"><button onclick="eliminarAnticipo(${a.id})" class="text-rose-400 hover:text-rose-300 p-1.5"><i class="fa-solid fa-trash"></i></button></td>
            </tr>`;
        }).join('');
    }

    const totalBs = lista.reduce((s, a) => s + Number(a.monto_bs || 0), 0);
    gId('total-anticipos-bs').innerText = `Bs. ${fNum(totalBs)}`;
}

async function agregarAnticipo() {
    const empId = gId('anticipo-emp-id').value;
    const fecha = gId('anticipo-fecha').value;
    const monto = parseFloat(gId('anticipo-monto').value) || 0;
    const concepto = gId('anticipo-concepto').value.trim();

    if (!empId) return showToast('Empleado no seleccionado', 'error');
    if (!fecha) return showToast('Indique la fecha del anticipo', 'error');
    if (monto <= 0) return showToast('El monto debe ser mayor a 0', 'error');

    // Validación Legal Art. 144 LOTTT: Tope 75% del capital de garantía
    if (typeof getFeatureFlag === 'function' && getFeatureFlag('antiguedad.tope_75_anticipos')) {
        if (typeof computarPrestacionesMensuales === 'function') {
            const emp = appState.empleados.find(e => String(e.id) === String(empId));
            if (emp && emp.fecha_ingreso) {
                const calculo = computarPrestacionesMensuales(emp, fecha);
                const capitalDisponible = calculo.capitalFinalBs + calculo.totalDepositosBs;
                const limite75 = capitalDisponible * 0.75;
                const totalPrevio = totalAnticiposBs(empId);

                if ((totalPrevio + monto) > limite75 && limite75 > 0) {
                    const excedente = (totalPrevio + monto) - limite75;
                    if (!confirm(`ADVERTENCIA LEGAL (Art. 144 LOTTT):\nEste anticipo supera el límite legal del 75% del capital acumulado.\n\nTope legal permitido: Bs. ${fNum(limite75)}\nExcedente: Bs. ${fNum(excedente)}\n\n¿Desea autorizar la operación bajo responsabilidad de la empresa?`)) {
                        return;
                    }
                }
            }
        }
    }

    const nuevo = { empleado_id: parseInt(empId), monto_bs: monto, fecha: fecha, concepto: concepto || null };
    const insertado = await safeQuery(supabaseClient.from('anticipos_prestaciones').insert([nuevo]).select(), 'insert_anticipo');

    if (insertado && insertado[0]) {
        appState.anticipos.push(insertado[0]);
    } else {
        nuevo.id = Date.now();
        appState.anticipos.push(nuevo);
    }

    localStorage.setItem('nomina_anticipos_cache', JSON.stringify(appState.anticipos));
    gId('anticipo-monto').value = '';
    gId('anticipo-concepto').value = '';

    renderTablaAnticipos();
    renderTablaPrestamos();
    showToast('Anticipo registrado con éxito');
}

async function eliminarAnticipo(id) {
    if (!confirm('¿Eliminar este anticipo?')) return;

    await safeQuery(supabaseClient.from('anticipos_prestaciones').delete().eq('id', id), 'delete_anticipo');
    appState.anticipos = appState.anticipos.filter(x => String(x.id) !== String(id));
    localStorage.setItem('nomina_anticipos_cache', JSON.stringify(appState.anticipos));

    renderTablaAnticipos();
    renderTablaPrestamos();
    showToast('Anticipo eliminado');
}