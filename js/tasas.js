/* ============================================================
   js/tasas.js
   Gestión de tasas BCV mensuales, sincronización API y Excel.
   ============================================================ */

async function guardarTasasMensualesPermanente() {
    if (appState.usuarioActual?.rol !== 'master') return showToast('No tiene permisos para modificar tasas', 'error');

    appState.tasasMensuales.sort((a, b) => b.mes.localeCompare(a.mes));
    localStorage.setItem('nomina_tasas_mensuales', JSON.stringify(appState.tasasMensuales));

    const payloadSupabase = appState.tasasMensuales.map(t => {
        const prom = Number(t.tasa_promedio !== undefined ? t.tasa_promedio : (t.tasa_anual || 47.56));
        const men = Number(t.tasa_mensual !== undefined ? t.tasa_mensual : (prom / 12));
        return { mes: t.mes, tasa_promedio: prom, tasa_anual: prom, tasa_mensual: men, tasa_dolar: Number(t.tasa_dolar || 36.50) };
    });

    let errorDetectado = null;
    const chunkSize = 40;
    for (let i = 0; i < payloadSupabase.length; i += chunkSize) {
        const chunk = payloadSupabase.slice(i, i + chunkSize);
        let { error } = await supabaseClient.from('tasas_mensuales').upsert(chunk, { onConflict: 'mes' });
        if (error) {
            const chunkAlt = chunk.map(x => ({ mes: x.mes, tasa_promedio: x.tasa_promedio, tasa_mensual: x.tasa_mensual, tasa_dolar: x.tasa_dolar }));
            const retry = await supabaseClient.from('tasas_mensuales').upsert(chunkAlt, { onConflict: 'mes' });
            if (retry.error) errorDetectado = retry.error;
        }
    }

    renderTablaTasasMensuales();
    if (errorDetectado) {
        showToast(`Guardado en Local. Supabase: ${errorDetectado.message || 'error'}`, 'error');
    } else {
        showToast(`${appState.tasasMensuales.length} tasas guardadas en Supabase`);
    }
}

async function agregarTasaMensual() {
    if (appState.usuarioActual?.rol !== 'master') return showToast('No tiene permisos para modificar tasas', 'error');

    const m = gId('tasa-mes-input').value;
    const tp = parseFloat(gId('tasa-prom-anual-input').value) || 47.56;
    const tm = tp / 12;
    const td = parseFloat(gId('tasa-dolar-mes-input').value) || 36.5;
    if (!m) return showToast('Seleccione el mes', 'error');

    const registro = { mes: m, tasa_promedio: tp, tasa_anual: tp, tasa_mensual: tm, tasa_dolar: td };
    const idx = appState.tasasMensuales.findIndex(x => x.mes === m);
    if (idx >= 0) appState.tasasMensuales[idx] = registro;
    else appState.tasasMensuales.push(registro);

    await guardarTasasMensualesPermanente();
}

async function eliminarTasaMensual(mes) {
    if (appState.usuarioActual?.rol !== 'master') return showToast('No tiene permisos para eliminar tasas', 'error');
    appState.tasasMensuales = appState.tasasMensuales.filter(x => x.mes !== mes);
    localStorage.setItem('nomina_tasas_mensuales', JSON.stringify(appState.tasasMensuales));
    try { await supabaseClient.from('tasas_mensuales').delete().eq('mes', mes); } catch (e) {}
    renderTablaTasasMensuales();
    showToast('Tasa eliminada');
}

function renderTablaTasasMensuales() {
    const tbody = gId('tabla-tasas-mes-body');
    if (!tbody) return;

    const isMaster = appState.usuarioActual?.rol === 'master';
    tbody.innerHTML = appState.tasasMensuales.map(t => {
        const prom = Number(t.tasa_promedio !== undefined ? t.tasa_promedio : (t.tasa_anual || 47.56));
        const mens = Number(t.tasa_mensual !== undefined ? t.tasa_mensual : (prom / 12));
        return `<tr class="hover:bg-slate-900/50">
            <td class="p-3 font-bold text-white font-mono">${t.mes}</td>
            <td class="p-3 text-cyan-300 font-mono font-semibold">${prom.toFixed(2)}%</td>
            <td class="p-3 text-amber-300 font-mono font-semibold">${mens.toFixed(3)}%</td>
            <td class="p-3 text-emerald-400 font-mono font-bold">Bs. ${Number(t.tasa_dolar || 36.5).toFixed(2)}</td>
            <td class="p-3 text-right">${isMaster ? `<button onclick="eliminarTasaMensual('${t.mes}')" class="text-slate-500 hover:text-red-400 p-1"><i class="fa-solid fa-trash"></i></button>` : '-'}</td>
        </tr>`;
    }).join('');
}

function importarExcelBCV(e) {
    if (appState.usuarioActual?.rol !== 'master') return showToast('Permiso denegado', 'error');
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(evt) {
        try {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false });
            const mesesMap = { 'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04', 'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08', 'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12' };
            let currentYear = null;
            let importados = 0;

            for (let r = 0; r < jsonRows.length; r++) {
                const row = jsonRows[r];
                if (!row || row.length === 0) continue;

                const col0 = String(row[0] || '').trim();
                if (/^\d{4}$/.test(col0)) currentYear = col0;

                const mesNombre = col0.toLowerCase();
                if (currentYear && mesesMap[mesNombre]) {
                    const mesNum = mesesMap[mesNombre];
                    const mesClave = `${currentYear}-${mesNum}`;
                    const parseVal = (v) => {
                        if (typeof v === 'number') return v;
                        if (!v) return null;
                        const s = String(v).replace(/\s/g, '').replace(',', '.');
                        const num = parseFloat(s);
                        return isNaN(num) ? null : num;
                    };

                    let tasaProm = null;
                    if (row[3] !== undefined) tasaProm = parseVal(row[3]);
                    if ((!tasaProm || tasaProm <= 0) && row[4] !== undefined) tasaProm = parseVal(row[4]);
                    if ((!tasaProm || tasaProm <= 0) && row[5] !== undefined) tasaProm = parseVal(row[5]);

                    if (tasaProm !== null && tasaProm > 0) {
                        const existente = appState.tasasMensuales.find(x => x.mes === mesClave);
                        const tasaDolar = existente?.tasa_dolar || 36.50;
                        const tasaMensual = tasaProm / 12;
                        const item = { mes: mesClave, tasa_promedio: tasaProm, tasa_anual: tasaProm, tasa_mensual: tasaMensual, tasa_dolar: tasaDolar };

                        const idx = appState.tasasMensuales.findIndex(x => x.mes === mesClave);
                        if (idx >= 0) appState.tasasMensuales[idx] = item;
                        else appState.tasasMensuales.push(item);
                        importados++;
                    }
                }
            }

            if (importados > 0) {
                await guardarTasasMensualesPermanente();
                showToast(`¡Éxito! ${importados} tasas importadas`);
            } else {
                showToast('No se encontraron filas con el formato del BCV', 'error');
            }
        } catch (ex) {
            showToast('Error al procesar el archivo Excel', 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

async function fetchTasaBCV() {
    if (gId('icon-sync-bcv')) gId('icon-sync-bcv').classList.add('fa-spin');
    let exito = false;

    try {
        const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', { cache: 'no-store' });
        const data = await response.json();
        if (data && (data.promedio || data.price)) {
            const valor = Number(data.promedio || data.price);
            aplicarTasaEnVistas(valor);
            exito = true;
            showToast(`Tasa BCV: ${valor.toFixed(2)} Bs/$`);
        }
    } catch (e1) {}

    if (!exito) {
        try {
            const resp2 = await fetch('https://rates.dolarvzla.com/bcv/current.json', { cache: 'no-store' });
            const d2 = await resp2.json();
            if (d2 && d2.current && d2.current.usd) {
                const valor2 = Number(d2.current.usd);
                aplicarTasaEnVistas(valor2);
                exito = true;
            }
        } catch (e2) {}
    }

    if (!exito) {
        const valActual = parseFloat(gId('nom-tasa-bcv')?.value) || 36.50;
        aplicarTasaEnVistas(valActual);
    }

    if (gId('icon-sync-bcv')) gId('icon-sync-bcv').classList.remove('fa-spin');
}

function aplicarTasaEnVistas(tasa) {
    if (gId('nom-tasa-bcv')) gId('nom-tasa-bcv').value = tasa.toFixed(2);
    if (gId('uti-tasa-bcv')) gId('uti-tasa-bcv').value = tasa.toFixed(2);
    if (gId('tasa-dolar-mes-input')) gId('tasa-dolar-mes-input').value = tasa.toFixed(2);
    if (typeof recalcularTodaLaNomina === 'function') recalcularTodaLaNomina();
}

async function sincronizarTasasCierreMesBCV() {
    if (appState.usuarioActual?.rol !== 'master') return showToast('Permiso denegado', 'error');
    const btnSync = gId('btn-sync-tasas-mes');
    if (btnSync) btnSync.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Sincronizando...';

    try {
        const resp = await fetch('https://ve.dolarapi.com/v1/historicos/dolares/oficial');
        const cotizaciones = await resp.json();
        if (!Array.isArray(cotizaciones) || cotizaciones.length === 0) throw new Error('Sin datos');

        const cierresPorMes = {};
        cotizaciones.forEach(c => {
            if (!c.fecha || !c.promedio) return;
            cierresPorMes[c.fecha.substring(0, 7)] = Number(c.promedio);
        });

        Object.keys(cierresPorMes).forEach(m => {
            const tasaDolar = cierresPorMes[m];
            const idx = appState.tasasMensuales.findIndex(t => t.mes === m);
            if (idx >= 0) {
                appState.tasasMensuales[idx].tasa_dolar = tasaDolar;
            } else {
                const tp = 47.56;
                appState.tasasMensuales.push({ mes: m, tasa_promedio: tp, tasa_anual: tp, tasa_mensual: tp / 12, tasa_dolar: tasaDolar });
            }
        });

        await guardarTasasMensualesPermanente();
        showToast(`Cierres BCV sincronizados (${Object.keys(cierresPorMes).length} meses)`);
    } catch (err) {
        showToast('No se pudieron obtener históricos de DolarApi', 'error');
    } finally {
        if (btnSync) btnSync.innerHTML = '<i class="fa-solid fa-cloud-arrow-down mr-1"></i> Sincronizar Cierres BCV';
    }
}