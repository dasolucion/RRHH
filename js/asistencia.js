/* ============================================================
   js/asistencia.js
   Integración con el dispositivo Dahua. Lee `asistencia_registros`
   en Supabase y calcula los días faltantes en la nómina.
   ============================================================ */

async function aplicarAsistenciaANomina() {
    if (typeof getFeatureFlag === 'function' && !getFeatureFlag('nomina.dahua_asistencia')) {
        return showToast('Módulo de asistencia biométrica desactivado', 'error');
    }

    const fechaPagoStr = gId('nom-fecha-proceso')?.value;
    if (!fechaPagoStr) return showToast('Falta la fecha de pago en la nómina', 'error');

    const fechaPago = new Date(fechaPagoStr + 'T00:00:00');
    const dia = fechaPago.getDate();
    let inicioQuincena, finQuincena;

    if (dia <= 15) {
        inicioQuincena = new Date(fechaPago.getFullYear(), fechaPago.getMonth(), 1);
        finQuincena = new Date(fechaPago.getFullYear(), fechaPago.getMonth(), 15);
    } else {
        inicioQuincena = new Date(fechaPago.getFullYear(), fechaPago.getMonth(), 16);
        finQuincena = new Date(fechaPago.getFullYear(), fechaPago.getMonth() + 1, 0);
    }

    const isoIni = fechaLocalISO(inicioQuincena);
    const isoFin = fechaLocalISO(finQuincena);

    showToast(`Leyendo asistencia del ${isoIni} al ${isoFin}...`);

    const { data: asistencia, error } = await supabaseClient
        .from('asistencia_registros')
        .select('device_user_id, fecha_hora, tipo')
        .gte('fecha_hora', isoIni + 'T00:00:00')
        .lte('fecha_hora', isoFin + 'T23:59:59');

    if (error) {
        console.error('Error leyendo asistencia:', error);
        return showToast('Error al leer asistencia de Supabase', 'error');
    }

    const diasAsistidos = {};
    (asistencia || []).forEach(r => {
        if (!r.device_user_id || !r.fecha_hora) return;
        const fechaDia = r.fecha_hora.substring(0, 10);
        if (!diasAsistidos[r.device_user_id]) diasAsistidos[r.device_user_id] = new Set();
        diasAsistidos[r.device_user_id].add(fechaDia);
    });

    const habilesPeriodo = diasHabilesEnRango(inicioQuincena, finQuincena);
    const totalHabiles = habilesPeriodo.length;

    const emps = appState.empleados.filter(e => e.activo);
    let procesados = 0, sinID = 0;

    for (const e of emps) {
        const inputDf = gId(`df-${e.id}`);
        if (!inputDf) continue;

        if (!e.device_user_id) {
            sinID++;
            continue;
        }

        const asistidosSet = diasAsistidos[String(e.device_user_id).trim()] || new Set();
        const fIngreso = e.fecha_ingreso ? new Date(e.fecha_ingreso + 'T00:00:00') : null;
        let faltantes = 0;

        for (const diaHabil of habilesPeriodo) {
            if (fIngreso && diaHabil < fIngreso) continue;
            const clave = fechaLocalISO(diaHabil);
            if (!asistidosSet.has(clave)) faltantes++;
        }

        inputDf.value = faltantes;
        procesados++;
    }

    recalcularTodaLaNomina();
    autoguardarBorradorNomina();

    showToast(`Asistencia aplicada: ${procesados} empleados (${totalHabiles} días hábiles)${sinID > 0 ? `, ${sinID} sin ID Dahua` : ''}`);
}