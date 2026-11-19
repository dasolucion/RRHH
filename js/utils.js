/* ============================================================
   js/utils.js
   Helpers puros. NO dependen de appState.
   Deben cargarse después de config.js y antes de state.js.
   ============================================================ */

// --- Alias de DOM ---
const gId = (id) => document.getElementById(id);

// --- Formato numérico venezolano ---
const fNum = (n) => Number(n).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

// --- Toast de notificación flotante ---
function showToast(msg, type = 'success') {
    const t = gId('toast');
    if (!t) return;
    t.innerText = msg;
    t.className = `fixed bottom-5 right-5 z-50 px-4 py-3 rounded-lg text-xs font-semibold shadow-xl border ${
        type === 'error'
            ? 'bg-red-950 text-red-200 border-red-800'
            : 'bg-emerald-950 text-emerald-200 border-emerald-800'
    }`;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 3500);
}

// --- Modales genéricos ---
function openModal(id) {
    const el = gId(id);
    if (el) { el.classList.remove('hidden'); el.classList.add('flex'); }
}
function closeModal(id) {
    const el = gId(id);
    if (el) { el.classList.add('hidden'); el.classList.remove('flex'); }
}

// --- Toggle menú móvil (sidebar) ---
function toggleMobileMenu() {
    const sb = gId('sidebar');
    const ov = gId('mobile-overlay');
    if (!sb || !ov) return;
    if (sb.classList.contains('-translate-x-full')) {
        sb.classList.remove('-translate-x-full');
        ov.classList.remove('hidden');
    } else {
        sb.classList.add('-translate-x-full');
        ov.classList.add('hidden');
    }
}

// --- Query Supabase safe (captura errores y devuelve data o null) ---
async function safeQuery(queryPromise, context = '') {
    try {
        const res = await queryPromise;
        if (res && res.error) {
            console.warn(`[Supabase ${context}]:`, res.error.message || res.error);
            return null;
        }
        return res ? res.data : null;
    } catch (e) {
        console.warn(`[Supabase Exception ${context}]:`, e);
        return null;
    }
}

// --- Normalizar detalle_calculo (string JSON → objeto) ---
function normalizarRegistroJson(reg) {
    if (!reg) return reg;
    if (typeof reg.detalle_calculo === 'string') {
        try { reg.detalle_calculo = JSON.parse(reg.detalle_calculo); } catch (e) {}
    }
    return reg;
}

// --- Antigüedad en años (para vacaciones / liquidaciones) ---
function calcularAntiguedadAnios(fechaIngresoStr, fechaReferenciaStr) {
    if (!fechaIngresoStr) return 1;
    const fi = new Date(fechaIngresoStr + 'T00:00:00');
    const ref = fechaReferenciaStr ? new Date(fechaReferenciaStr + 'T00:00:00') : new Date();
    let y = ref.getFullYear() - fi.getFullYear();
    if (ref.getMonth() < fi.getMonth() ||
        (ref.getMonth() === fi.getMonth() && ref.getDate() < fi.getDate())) {
        y--;
    }
    return Math.max(1, y);
}

// --- Feriados nacionales (Venezuela) + Semana Santa ---
function esFeriadoNacional(fecha) {
    const y = fecha.getFullYear(), m = fecha.getMonth(), d = fecha.getDate();
    const fj = [
        { m: 0, d: 1 },  { m: 3, d: 19 }, { m: 4, d: 1 },  { m: 5, d: 24 },
        { m: 6, d: 5 },  { m: 6, d: 24 }, { m: 9, d: 12 }, { m: 11, d: 24 },
        { m: 11, d: 25 }, { m: 11, d: 31 }
    ];
    if (fj.some(f => f.m === m && f.d === d)) return true;
    // Cálculo de la Pascua (algoritmo de Gauss)
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d1 = Math.floor(b / 4), e1 = b % 4,
          f1 = Math.floor((b + 8) / 25), g1 = Math.floor((b - f1 + 1) / 3),
          h = (19 * a + b - d1 - g1 + 15) % 30, i = Math.floor(c / 4), k = c % 4,
          l = (32 + 2 * e1 + 2 * i - h - k) % 7, m1 = Math.floor((a + 11 * h + 22 * l) / 451),
          month = Math.floor((h + l - 7 * m1 + 114) / 31) - 1,
          day = ((h + l - 7 * m1 + 114) % 31) + 1;
    const pas = new Date(y, month, day);
    const cL = new Date(pas); cL.setDate(cL.getDate() - 48);
    const cM = new Date(pas); cM.setDate(cM.getDate() - 47);
    const jS = new Date(pas); jS.setDate(jS.getDate() - 3);
    const vS = new Date(pas); vS.setDate(vS.getDate() - 2);
    return [cL, cM, jS, vS].some(mov =>
        mov.getFullYear() === y && mov.getMonth() === m && mov.getDate() === d
    );
}

// --- Fecha ISO en zona LOCAL (evita bugs de UTC) ---
function fechaLocalISO(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// --- Días hábiles (Lun-Vie, no feriados) entre 2 fechas inclusives ---
function diasHabilesEnRango(desde, hasta) {
    const dias = [];
    const cursor = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
    const fin = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
    while (cursor <= fin) {
        const dw = cursor.getDay();
        if (dw !== 0 && dw !== 6 && !esFeriadoNacional(cursor)) {
            dias.push(new Date(cursor));
        }
        cursor.setDate(cursor.getDate() + 1);
    }
    return dias;
}