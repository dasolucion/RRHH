/* ============================================================
   js/db_schema.js
   Definición de esquema esperado (RRHH) y utilidades de verificación/generación SQL.
   Usado para validar y preparar la base de datos Supabase del cliente.
   ============================================================ */

// Esquema mínimo esperado por el sistema (tablas y columnas clave)
// Tipos sugeridos para PostgreSQL/Supabase; la verificación se basa en existencia de tabla/columna.
const DB_SCHEMA_EXPECTED = {
    parametros_config: {
        columns: {
            id: 'bigint primary key',
            nombre_empresa: 'text',
            rif_empresa: 'text',
            dias_utilidades: 'integer default 30',
            valor_ut: 'numeric default 43',
            riesgo_ivss: 'numeric default 9',
            aplica_lpp: 'boolean default true',
            features_config: 'jsonb',
            updated_at: 'timestamptz default now()',
            supabase_url: 'text',
            supabase_anon_key: 'text',
            licencia_estado: 'text',
            licencia_bloqueada: 'boolean default false',
            licencia_vencimiento: 'date',
            licencia_mensaje: 'text'
        }
    },
    departamentos: {
        columns: { id: 'bigint generated always as identity primary key', nombre: 'text', created_at: 'timestamptz default now()' }
    },
    cargos: {
        columns: { id: 'bigint generated always as identity primary key', nombre: 'text', created_at: 'timestamptz default now()' }
    },
    empleados: {
        columns: {
            id: 'bigint generated always as identity primary key',
            cedula: 'text', nombre: 'text', telefono: 'text',
            fecha_ingreso: 'date', departamento_id: 'bigint', cargo_id: 'bigint',
            sueldo: 'numeric default 0', bono_alimentacion: 'numeric default 0', otros_ingresos: 'numeric default 0',
            saldo_prestamo: 'numeric default 0', anticipos_prestaciones: 'numeric default 0',
            islr_porcentaje: 'numeric default 0', device_user_id: 'text',
            activo: 'boolean default true', created_at: 'timestamptz default now()'
        }
    },
    usuarios: {
        columns: {
            id: 'bigint generated always as identity primary key',
            nombre: 'text', usuario: 'text', clave: 'text', rol: 'text',
            activo: 'boolean default true', created_at: 'timestamptz default now()'
        }
    },
    roles_permisos: {
        columns: {
            id: 'bigint generated always as identity primary key',
            rol: 'text', modulo: 'text',
            puede_ver: 'boolean default false', puede_crear: 'boolean default false', puede_editar: 'boolean default false',
            puede_borrar: 'boolean default false', puede_imprimir: 'boolean default false', puede_firmar: 'boolean default false'
        },
        unique: ['rol', 'modulo']
    },
    nominas: {
        columns: {
            id: 'bigint generated always as identity primary key',
            empleado_id: 'bigint', empleado: 'text', cargo: 'text', cedula: 'text',
            fecha_pago: 'date', sueldo: 'numeric', sueldo_quincenal: 'numeric',
            neto: 'numeric', neto_usd: 'numeric', neto_bs: 'numeric',
            tasa_bcv: 'numeric', tasa: 'numeric', tasa_cambio: 'numeric',
            detalle_calculo: 'jsonb', estado: 'text', created_at: 'timestamptz default now()',
            bonos: 'numeric', bono_alimentacion: 'numeric', deducciones: 'numeric', descuentos_ley_usd: 'numeric',
            dias_faltantes: 'numeric', hed: 'numeric', hnoct: 'numeric', horas_descuento: 'numeric',
            islr_bs: 'numeric', islr_porcentaje: 'numeric', islr_usd: 'numeric',
            ivss_usd: 'numeric', faov_usd: 'numeric', rpe_usd: 'numeric',
            otras_asignaciones: 'numeric', otros_descuentos: 'numeric', otros_ingresos: 'numeric',
            prestamos: 'numeric', adelantos: 'numeric', recargos_lottt_usd: 'numeric',
            salario_base: 'numeric', salario_integral: 'numeric', salario_minimo_bs: 'numeric',
            total_deducciones: 'numeric', monto_dias_faltantes: 'numeric', monto_horas_descuento: 'numeric',
            fer: 'numeric'
        }
    },
    historico_salarios: {
        columns: {
            id: 'bigint generated always as identity primary key',
            empleado_id: 'bigint', mes: 'text',
            sueldo_base: 'numeric', bono_alimentacion: 'numeric', subsidio: 'numeric',
            created_at: 'timestamptz default now()'
        },
        unique: ['empleado_id', 'mes']
    },
    vacaciones: {
        columns: {
            id: 'bigint generated always as identity primary key',
            empleado_id: 'bigint', empleado: 'text', periodo: 'text', fecha_inicio: 'date',
            detalle_calculo: 'jsonb',
            total_usd: 'numeric', total_bs: 'numeric', gran_total_usd: 'numeric', gran_total_bs: 'numeric',
            created_at: 'timestamptz default now()'
        }
    },
    utilidades: {
        columns: {
            id: 'bigint generated always as identity primary key',
            empleado_id: 'bigint', empleado: 'text', cargo: 'text', periodo: 'text', fecha_pago: 'date',
            dias_pagados: 'numeric', dias_trabajados: 'numeric', meses_trabajados: 'numeric',
            porcentaje_acumulado: 'numeric', porcentaje_pagado: 'numeric',
            salario_base: 'numeric', tasa_bcv: 'numeric',
            total_usd: 'numeric', total_bs: 'numeric', total_usd_anual: 'numeric', total_bs_anual: 'numeric',
            gran_total_usd: 'numeric', gran_total_bs: 'numeric', gran_total_usd_anual: 'numeric', gran_total_bs_anual: 'numeric',
            subsidio_usd: 'numeric', subsidio_bs: 'numeric',
            detalle_calculo: 'jsonb', created_at: 'timestamptz default now()'
        }
    },
    prestaciones: {
        columns: {
            id: 'bigint generated always as identity primary key',
            empleado_id: 'bigint', empleado: 'text', cargo: 'text',
            fecha_calculo: 'date', fecha_ingreso: 'date',
            detalle_calculo: 'jsonb',
            monto_total_usd: 'numeric', monto_total_bs: 'numeric',
            created_at: 'timestamptz default now()'
        }
    },
    antiguedad: {
        columns: {
            id: 'bigint generated always as identity primary key',
            empleado_id: 'bigint', empleado: 'text', cargo: 'text',
            fecha_ingreso: 'date', fecha_corte: 'date', tiempo_servicio: 'text',
            tasa_bcv: 'numeric',
            total_metodo1_bs: 'numeric', total_metodo2_bs: 'numeric',
            monto_definitivo_bs: 'numeric', monto_definitivo_usd: 'numeric',
            detalle_calculo: 'jsonb', created_at: 'timestamptz default now()'
        }
    },
    anticipos_prestaciones: {
        columns: {
            id: 'bigint generated always as identity primary key',
            empleado_id: 'bigint', fecha: 'date', monto_bs: 'numeric', concepto: 'text',
            created_at: 'timestamptz default now()'
        }
    },
    prestamos_anticipos: {
        columns: {
            id: 'bigint generated always as identity primary key',
            empleado_id: 'bigint', tipo: 'text', estado: 'text',
            fecha_otorgamiento: 'date',
            monto_total: 'numeric', monto_abonado: 'numeric', saldo_pendiente: 'numeric',
            tasa_bcv: 'numeric', observaciones: 'text',
            created_at: 'timestamptz default now()'
        }
    },
    prestamos_abonos: {
        columns: {
            id: 'bigint generated always as identity primary key',
            prestamo_id: 'bigint', nomina_id: 'bigint',
            fecha_pago: 'date', monto: 'numeric', origen: 'text', tasa_bcv: 'numeric',
            created_at: 'timestamptz default now()'
        }
    },
    tasas_mensuales: {
        columns: {
            mes: 'text primary key',
            tasa_promedio: 'numeric', tasa_anual: 'numeric', tasa_mensual: 'numeric', tasa_dolar: 'numeric',
            updated_at: 'timestamptz default now()'
        }
    },
    asistencia_registros: {
        columns: {
            id: 'bigint generated always as identity primary key',
            cedula: 'text', device_user_id: 'text', device_user_id_num: 'text', device_name: 'text',
            fecha_hora: 'timestamptz', tipo: 'text', created_at: 'timestamptz default now()'
        }
    },
    justificativos_faltas: {
        columns: {
            id: 'bigint generated always as identity primary key',
            empleado_id: 'bigint', nomina_id: 'bigint', fecha_falta: 'date',
            motivo: 'text', url_justificativo: 'text', hash_sha256: 'text',
            created_at: 'timestamptz default now()'
        }
    },
    expediente_documentos: {
        columns: {
            id: 'bigint generated always as identity primary key',
            empleado_id: 'bigint', tipo_documento: 'text', nombre_descriptivo: 'text',
            url_archivo: 'text', hash_sha256: 'text', subido_por: 'text',
            visible_empleado: 'boolean default false', created_at: 'timestamptz default now()'
        }
    },
    prenomina_borrador: {
        columns: {
            id: 'bigint primary key',
            fecha_pago: 'date', tasa_bcv: 'numeric', salario_minimo: 'numeric',
            lunes_habiles: 'integer', data: 'jsonb', created_at: 'timestamptz default now()', updated_at: 'timestamptz default now()'
        }
    },
    firmas_recibos: {
        columns: {
            id: 'bigint generated always as identity primary key',
            empleado_id: 'bigint', nomina_id: 'bigint', fecha_pago: 'date',
            tipo: 'text', hash_sha256: 'text', firmado_por: 'text', created_at: 'timestamptz default now()'
        }
    },
    tokens_portal_empleado: {
        columns: {
            id: 'bigint generated always as identity primary key',
            empleado_id: 'bigint', token: 'uuid default gen_random_uuid()', activo: 'boolean default true',
            created_at: 'timestamptz default now()'
        }
    },
    solicitudes_ari: {
        columns: {
            id: 'bigint generated always as identity primary key',
            empleado_id: 'bigint', periodo: 'text', estado: 'text', datos: 'jsonb',
            created_at: 'timestamptz default now()'
        }
    }
};

function _sqlIdent(name) { return `"${String(name).replace(/"/g, '""')}"`; }

function generarSqlEsquemaCompleto() {
    const lines = [];
    lines.push('-- Esquema base del sistema (generado). Ejecutar en Supabase SQL Editor.');
    lines.push('-- Nota: revisa tipos/constraints según tu política; este script es idempotente en lo posible.');
    lines.push('');
    for (const [table, def] of Object.entries(DB_SCHEMA_EXPECTED)) {
        const cols = Object.entries(def.columns || {}).map(([c, t]) => `  ${_sqlIdent(c)} ${t}`).join(',\n');
        lines.push(`CREATE TABLE IF NOT EXISTS public.${_sqlIdent(table)} (\n${cols}\n);`);
        if (Array.isArray(def.unique) && def.unique.length) {
            const uname = `${table}_${def.unique.join('_')}_key`;
            lines.push(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${uname}') THEN
    ALTER TABLE public.${_sqlIdent(table)} ADD CONSTRAINT ${_sqlIdent(uname)} UNIQUE (${def.unique.map(_sqlIdent).join(', ')});
  END IF;
END $$;`);
        }
        // Columnas faltantes (ALTER TABLE ADD COLUMN IF NOT EXISTS)
        for (const [c, t] of Object.entries(def.columns || {})) {
            const typeOnly = t.replace(/\s+primary key.*/i, '').replace(/\s+generated always as identity.*/i, '').trim() || 'text';
            lines.push(`ALTER TABLE public.${_sqlIdent(table)} ADD COLUMN IF NOT EXISTS ${_sqlIdent(c)} ${typeOnly};`);
        }
        lines.push('');
    }
    // Datos iniciales mínimos
    lines.push('-- Parámetros iniciales (si no existen)');
    lines.push(`INSERT INTO public."parametros_config" (id, nombre_empresa, rif_empresa, dias_utilidades, valor_ut, riesgo_ivss, aplica_lpp)
VALUES (1, 'DEMOSTRATIVA', 'J-00000000-0', 30, 43, 9, true)
ON CONFLICT (id) DO NOTHING;`);
    lines.push('');
    lines.push('-- Usuario master por defecto (si no existe)');
    lines.push(`INSERT INTO public."usuarios" (nombre, usuario, clave, rol, activo)
SELECT 'Super Administrador', 'master', 'master123', 'master', true
WHERE NOT EXISTS (SELECT 1 FROM public."usuarios" WHERE usuario = 'master');`);
    lines.push('');
    return lines.join('\n');
}

function generarSqlMultiEmpresa() {
    const L = [];
    L.push('-- ============================================================');
    L.push('-- SCRIPT SQL — MULTIEMPRESA (mismo proyecto Supabase / misma base)');
    L.push('-- Generado para: sistema RRHH / Nómina (esquema base compartido).');
    L.push('-- Objetivo: habilitar varias empresas operando con empresa_id');
    L.push('-- dentro de la MISMA base de datos del proyecto Supabase.');
    L.push('--');
    L.push('-- NOTA: ejecutar en Supabase → SQL Editor → proyecto correspondiente,');
    L.push('--       luego volver a "Verificar esquema" y conectar.');
    L.push('-- ============================================================');
    L.push('');
    L.push('create extension if not exists pgcrypto;');
    L.push('');
    L.push('-- 1) Tabla de empresas');
    L.push('create table if not exists public.empresas (');
    L.push('  id bigint generated always as identity primary key,');
    L.push('  nombre text not null,');
    L.push('  rif text not null unique,');
    L.push('  activo boolean default true,');
    L.push('  created_at timestamptz default now(),');
    L.push('  updated_at timestamptz default now()');
    L.push(');');
    L.push('');
    L.push('-- 2) Parametros de la empresa en la config');
    L.push('alter table public.parametros_config add column if not exists empresa_id bigint references public.empresas(id);');
    L.push('');
    L.push('-- 3) Columnas empresa_id en las tablas de negocio (misma base, varias empresas)');
    const tablasNegocio = [
        'departamentos', 'cargos', 'empleados', 'nominas', 'historico_salarios', 'vacaciones',
        'utilidades', 'prestaciones', 'antiguedad', 'anticipos_prestaciones', 'prestamos_anticipos',
        'prestamos_abonos', 'asistencia_registros', 'justificativos_faltas', 'expediente_documentos',
        'prenomina_borrador', 'firmas_recibos', 'tokens_portal_empleado', 'solicitudes_ari'
    ];
    for (const t of tablasNegocio) {
        L.push(`alter table public.${t} add column if not exists empresa_id bigint references public.empresas(id);`);
    }
    L.push('');
    L.push('-- 4) Crear la empresa inicial (datos actuales) y vincular la config');
    L.push("insert into public.empresas (nombre, rif, activo) values ('Recordplast', 'J-50685235-7', true) on conflict (rif) do update set nombre = excluded.nombre, activo = excluded.activo;");
    L.push("update public.parametros_config set empresa_id = (select id from public.empresas where rif = 'J-50685235-7' limit 1) where id = 1;");
    L.push('');
    L.push('-- 5) Backfill de los datos existentes hacia la empresa creada');
    L.push("update public.empleados set empresa_id = (select id from public.empresas where rif = 'J-50685235-7' limit 1) where empresa_id is null;");
    L.push("update public.nominas set empresa_id = (select id from public.empresas where rif = 'J-50685235-7' limit 1) where empresa_id is null;");
    L.push("update public.departamentos set empresa_id = (select id from public.empresas where rif = 'J-50685235-7' limit 1) where empresa_id is null;");
    L.push("update public.cargos set empresa_id = (select id from public.empresas where rif = 'J-50685235-7' limit 1) where empresa_id is null;");
    for (const t of tablasNegocio) {
        if (['departamentos', 'cargos', 'empleados', 'nominas'].includes(t)) continue;
        L.push(`update public.${t} set empresa_id = (select id from public.empresas where rif = 'J-50685235-7' limit 1) where empresa_id is null;`);
    }
    L.push('');
    L.push('-- 6) Regla de aislamiento por empresa (RLS opcional, recomendado para producción)');
    L.push('alter table public.empleados enable row level security;');
    L.push('-- create policy "empleados_empresa" on public.empleados for all using (empresa_id = (select id from public.empresas limit 1)) with check (empresa_id = (select id from public.empresas limit 1));');
    L.push('');
    return L.join('\n');
}

async function verificarEsquemaDb() {
    const faltantes = [];
    const errores = [];
    if (!supabaseClient || esModoDemoActivo && esModoDemoActivo()) {
        return { ok: false, faltantes: ['Modo demo: no hay conexión a base de datos'], errores: [] };
    }
    const cred = (typeof _obtenerCredencialesDb === 'function')
        ? _obtenerCredencialesDb()
        : { url: (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : ''), key: (typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : '') };
    const headers = { apikey: cred.key, Authorization: `Bearer ${cred.key}` };
    const baseUrl = String(cred.url || '').replace(/\/+$/, '');
    if (!baseUrl) return { ok: false, faltantes: ['Sin URL de Supabase configurada'], errores: [] };

    for (const [table, def] of Object.entries(DB_SCHEMA_EXPECTED)) {
        const cols = Object.keys((def && def.columns) || {});
        // PostgREST valida TODAS las columnas del select en una sola petición.
        // Antes se hacía una petición por columna (270+) y la verificación tardaba casi un minuto.
        const select = cols.length ? cols.map(c => encodeURIComponent(c)).join(',') : '*';
        try {
            const resp = await fetch(`${baseUrl}/rest/v1/${encodeURIComponent(table)}?select=${select}&limit=1`, { headers });
            if (resp.status === 404) {
                faltantes.push(`Tabla faltante: ${table}`);
                continue;
            }
            if (resp.ok) continue; // tabla y columnas presentes
            if (resp.status !== 400 && resp.status !== 406) {
                errores.push(`No se pudo verificar ${table}: HTTP ${resp.status}`);
                continue;
            }
            // La consulta combinada falló: identificar las columnas ausentes una por una
            // (sólo en este caso, para no penalizar el arranque normal).
            for (const col of cols) {
                try {
                    const r2 = await fetch(`${baseUrl}/rest/v1/${encodeURIComponent(table)}?select=${encodeURIComponent(col)}&limit=1`, { headers });
                    if (r2.status === 400 || r2.status === 404) {
                        const txt = await r2.text().catch(()=> '');
                        if (/column|does not exist|Could not find/i.test(txt) || r2.status === 400) {
                            faltantes.push(`Columna faltante: ${table}.${col}`);
                        }
                    }
                } catch (e) {}
            }
        } catch (e) {
            errores.push(`Error verificando ${table}: ${e.message || e}`);
        }
    }
    return { ok: faltantes.length === 0 && errores.length === 0, faltantes, errores };
}
