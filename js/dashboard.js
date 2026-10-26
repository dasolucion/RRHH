/* ============================================================
   js/dashboard.js
   KPIs del panel de control.
   
   NOTA: renderDashboard también existe en state.js (Fase 1).
   Este archivo la redefine idénticamente; al cargarse después,
   esta versión prevalece. Mismo comportamiento, cero regresiones.
   ============================================================ */

function renderDashboard() {
    const act = appState.empleados.filter(e => e.activo);
    const tm = act.reduce((a, e) =>
        a + Number(e.sueldo) + Number(e.bono_alimentacion) + Number(e.otros_ingresos), 0);

    if (gId('kpi-total-nomina')) gId('kpi-total-nomina').innerText = `$${tm.toFixed(2)}`;
    if (gId('kpi-total-empleados')) gId('kpi-total-empleados').innerText = act.length;
    if (gId('kpi-total-deptos')) gId('kpi-total-deptos').innerText = appState.departamentos.length;
    if (gId('kpi-total-cargos')) gId('kpi-total-cargos').innerText = appState.cargos.length;
}