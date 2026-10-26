/* ============================================================
   js/config.js
   Configuración global, cliente Supabase y constantes inmutables.
   NO contiene lógica de negocio ni funciones de UI.
   ============================================================ */

// --- Credenciales Supabase (hardcoded como en el original) ---
const SUPABASE_URL = 'https://nrfplwpmwplpbskidtqs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yZnBsd3Btd3BscGJza2lkdHFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1OTA4MjIsImV4cCI6MjEwMzE2NjgyMn0.PZXrE9KtAVF2e4RbyM3-m1ClS8R8QaTCctLzZKAAYdQ';

// Cliente Supabase (se crea al cargar; el SDK ya fue cargado vía CDN en <head>)
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Usuarios de respaldo local (si Supabase no responde o está vacío) ---
const USUARIOS_DEFAULT = [
    { id: 1, nombre: 'Super Administrador', usuario: 'master',       clave: 'master123',   rol: 'master',    activo: true },
    { id: 2, nombre: 'Auditor de Consulta', usuario: 'consulta',     clave: 'consulta123', rol: 'consulta',  activo: true }
];

// --- Tasas BCV por defecto (columna E del archivo 1_3_18.xlsx) ---
const TASAS_BCV_COLUMNA_E_DEFAULT = [
    { mes: '2026-06', tasa_promedio: 47.56, tasa_anual: 47.56, tasa_mensual: 47.56/12, tasa_dolar: 623.02 },
    { mes: '2026-05', tasa_promedio: 47.52, tasa_anual: 47.52, tasa_mensual: 47.52/12, tasa_dolar: 549.37 },
    { mes: '2026-04', tasa_promedio: 47.46, tasa_anual: 47.46, tasa_mensual: 47.46/12, tasa_dolar: 487.12 },
    { mes: '2026-03', tasa_promedio: 47.30, tasa_anual: 47.30, tasa_mensual: 47.30/12, tasa_dolar: 473.87 },
    { mes: '2026-02', tasa_promedio: 47.20, tasa_anual: 47.20, tasa_mensual: 47.20/12, tasa_dolar: 417.36 },
    { mes: '2026-01', tasa_promedio: 47.15, tasa_anual: 47.15, tasa_mensual: 47.15/12, tasa_dolar: 367.31 },
    { mes: '2025-12', tasa_promedio: 47.65, tasa_anual: 47.65, tasa_mensual: 47.65/12, tasa_dolar: 298.14 },
    { mes: '2025-11', tasa_promedio: 47.62, tasa_anual: 47.62, tasa_mensual: 47.62/12, tasa_dolar: 245.67 },
    { mes: '2025-10', tasa_promedio: 47.63, tasa_anual: 47.63, tasa_mensual: 47.63/12, tasa_dolar: 223.65 },
    { mes: '2025-09', tasa_promedio: 47.60, tasa_anual: 47.60, tasa_mensual: 47.60/12, tasa_dolar: 177.61 },
    { mes: '2025-08', tasa_promedio: 47.63, tasa_anual: 47.63, tasa_mensual: 47.63/12, tasa_dolar: 147.08 },
    { mes: '2025-07', tasa_promedio: 47.60, tasa_anual: 47.60, tasa_mensual: 47.60/12, tasa_dolar: 124.51 },
    { mes: '2025-06', tasa_promedio: 47.49, tasa_anual: 47.49, tasa_mensual: 47.49/12, tasa_dolar: 107.62 },
    { mes: '2025-05', tasa_promedio: 47.49, tasa_anual: 47.49, tasa_mensual: 47.49/12, tasa_dolar: 96.86 },
    { mes: '2025-04', tasa_promedio: 47.30, tasa_anual: 47.30, tasa_mensual: 47.30/12, tasa_dolar: 86.85 },
    { mes: '2025-03', tasa_promedio: 46.92, tasa_anual: 46.92, tasa_mensual: 46.92/12, tasa_dolar: 69.57 },
    { mes: '2025-02', tasa_promedio: 46.50, tasa_anual: 46.50, tasa_mensual: 46.50/12, tasa_dolar: 64.25 },
    { mes: '2025-01', tasa_promedio: 46.35, tasa_anual: 46.35, tasa_mensual: 46.35/12, tasa_dolar: 57.97 },
    { mes: '2024-12', tasa_promedio: 46.30, tasa_anual: 46.30, tasa_mensual: 46.30/12, tasa_dolar: 51.93 },
    { mes: '2024-11', tasa_promedio: 46.20, tasa_anual: 46.20, tasa_mensual: 46.20/12, tasa_dolar: 47.31 },
    { mes: '2024-10', tasa_promedio: 46.10, tasa_anual: 46.10, tasa_mensual: 46.10/12, tasa_dolar: 42.56 },
    { mes: '2024-09', tasa_promedio: 45.87, tasa_anual: 45.87, tasa_mensual: 45.87/12, tasa_dolar: 36.91 },
    { mes: '2024-08', tasa_promedio: 45.89, tasa_anual: 45.89, tasa_mensual: 45.89/12, tasa_dolar: 36.63 },
    { mes: '2024-07', tasa_promedio: 45.89, tasa_anual: 45.89, tasa_mensual: 45.89/12, tasa_dolar: 29.51 },
    { mes: '2024-06', tasa_promedio: 45.62, tasa_anual: 45.62, tasa_mensual: 45.62/12, tasa_dolar: 27.85 },
    { mes: '2024-05', tasa_promedio: 44.81, tasa_anual: 44.81, tasa_mensual: 44.81/12, tasa_dolar: 26.16 },
    { mes: '2024-04', tasa_promedio: 44.50, tasa_anual: 44.50, tasa_mensual: 44.50/12, tasa_dolar: 24.52 },
    { mes: '2024-03', tasa_promedio: 44.20, tasa_anual: 44.20, tasa_mensual: 44.20/12, tasa_dolar: 23.71 },
    { mes: '2024-02', tasa_promedio: 44.10, tasa_anual: 44.10, tasa_mensual: 44.10/12, tasa_dolar: 22.94 },
    { mes: '2024-01', tasa_promedio: 46.92, tasa_anual: 46.92, tasa_mensual: 46.92/12, tasa_dolar: 36.20 },
    { mes: '2023-12', tasa_promedio: 46.35, tasa_anual: 46.35, tasa_mensual: 46.35/12, tasa_dolar: 35.93 },
    { mes: '2023-11', tasa_promedio: 46.14, tasa_anual: 46.14, tasa_mensual: 46.14/12, tasa_dolar: 35.49 },
    { mes: '2023-10', tasa_promedio: 46.07, tasa_anual: 46.07, tasa_mensual: 46.07/12, tasa_dolar: 35.13 },
    { mes: '2023-09', tasa_promedio: 45.64, tasa_anual: 45.64, tasa_mensual: 45.64/12, tasa_dolar: 34.30 },
    { mes: '2023-08', tasa_promedio: 45.87, tasa_anual: 45.87, tasa_mensual: 45.87/12, tasa_dolar: 32.51 },
    { mes: '2023-07', tasa_promedio: 45.89, tasa_anual: 45.89, tasa_mensual: 45.89/12, tasa_dolar: 29.51 },
    { mes: '2023-06', tasa_promedio: 45.62, tasa_anual: 45.62, tasa_mensual: 45.62/12, tasa_dolar: 27.85 },
    { mes: '2023-05', tasa_promedio: 44.81, tasa_anual: 44.81, tasa_mensual: 44.81/12, tasa_dolar: 26.16 },
    { mes: '2023-04', tasa_promedio: 44.50, tasa_anual: 44.50, tasa_mensual: 44.50/12, tasa_dolar: 24.52 },
    { mes: '2023-03', tasa_promedio: 44.20, tasa_anual: 44.20, tasa_mensual: 44.20/12, tasa_dolar: 23.71 },
    { mes: '2023-02', tasa_promedio: 44.10, tasa_anual: 44.10, tasa_mensual: 44.10/12, tasa_dolar: 22.94 },
    { mes: '2023-01', tasa_promedio: 43.70, tasa_anual: 43.70, tasa_mensual: 43.70/12, tasa_dolar: 21.73 }
];

// --- Matriz de Feature Flags (módulos activables/desactivables por licencia) ---
const DEFAULT_FEATURES = {
    // 1. Personal y Empleados
    'empleados.subsidio':           { label: 'Subsidio Especial en Ficha', cat: '1. Empleados', default: true },
    'empleados.dahua':              { label: 'Integración ID Reloj Dahua', cat: '1. Empleados', default: true },
    'empleados.ari':                { label: 'Gestión y Enlaces Formulario AR-I (SENIAT)', cat: '1. Empleados', default: true },
    'documentos.constancias':       { label: 'Constancias de Trabajo y Amonestaciones', cat: '1. Empleados', default: true },

    // 2. Procesar Nómina
    'nomina.dahua_asistencia':      { label: 'Botón Aplicar Asistencia Biométrica', cat: '2. Nómina', default: true },
    'nomina.prenomina':             { label: 'Pre-Nómina y Borradores en Nube', cat: '2. Nómina', default: true },
    'nomina.recargos_lottt':        { label: 'Recargos LOTTT (Extras, Nocturnidad, Feriados)', cat: '2. Nómina', default: true },
    'nomina.islr':                  { label: 'Retención I.S.L.R. (%) [AR-I]', cat: '2. Nómina', default: true },
    'nomina.subsidio':              { label: 'Columna Subsidio Especial', cat: '2. Nómina', default: true },
    'nomina.prestamos':             { label: 'Descuento de Préstamos y Saldos', cat: '2. Nómina', default: true },
    'nomina.adelantos':             { label: 'Descuento de Adelantos', cat: '2. Nómina', default: true },
    'nomina.txt_banco':             { label: 'Generación TXT Bancario (Alim/Sub)', cat: '2. Nómina', default: true },

    // 3. Vacaciones
    'vacaciones.subsidio':          { label: 'Subsidio Especial de Vacaciones', cat: '3. Vacaciones', default: true },
    'vacaciones.whatsapp':          { label: 'Botón Envío Recibo por WhatsApp', cat: '3. Vacaciones', default: true },

    // 4. Utilidades
    'utilidades.pagos_parciales':   { label: 'Modalidad Pagos Parciales (%)', cat: '4. Utilidades', default: true },
    'utilidades.subsidio':          { label: 'Subsidio Especial en Utilidades', cat: '4. Utilidades', default: true },
    'utilidades.inces':             { label: 'Retención Legal 0.5% INCES (Art. 14)', cat: '4. Utilidades', default: true },
    'utilidades.imprimir_resumen':  { label: 'Botón Imprimir Resumen General', cat: '4. Utilidades', default: true },

    // 5. Antigüedad y Prestaciones
    'antiguedad.tope_75_anticipos': { label: 'Bloquear Anticipos > 75% Capital (Art. 144)', cat: '5. Prestaciones', default: true },
    'antiguedad.conciliacion':      { label: 'Módulo Conciliación Mes a Mes', cat: '5. Prestaciones', default: true },
    'antiguedad.intereses_bcv':     { label: 'Devengo de Intereses Mensuales BCV', cat: '5. Prestaciones', default: true },

    // 6. Deberes Formales e Impuestos Patronales
    'impuestos.modulo':             { label: 'Módulo Deberes Formales / Cargas Patronales', cat: '6. Deberes Formales', default: true },
    'impuestos.lpp':                { label: 'Contribución Especial 9% Pensiones (LPP)', cat: '6. Deberes Formales', default: true },

    // 7. Liquidaciones
    'liquidaciones.modulo':         { label: 'Módulo de Liquidaciones Definitivas (Finiquitos)', cat: '7. Liquidaciones', default: true }
};