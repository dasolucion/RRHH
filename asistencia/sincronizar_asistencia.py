# -*- coding: utf-8 -*-
"""
Script de sincronización de asistencia desde Dahua ASI6214S-D a Supabase.
Se ejecuta manualmente cuando se necesita actualizar (doble clic al .bat).
"""
import sys
import os
import re
from datetime import datetime, timedelta, timezone
import requests
from requests.auth import HTTPDigestAuth
from supabase import create_client, Client

# ================== CONFIGURACIÓN ==================
DAHUA_IP      = "192.168.1.100"      # <-- IP del Dahua
DAHUA_USER    = "admin"               # <-- Usuario del Dahua
DAHUA_PASS    = "tu_password"         # <-- Password del Dahua

SUPABASE_URL  = "https://nrfplwpmwplpbskidtqs.supabase.co"
SUPABASE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yZnBsd3Btd3BscGJza2lkdHFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1OTA4MjIsImV4cCI6MjEwMzE2NjgyMn0.PZXrE9KtAVF2e4RbyM3-m1ClS8R8QaTCctLzZKAAYdQ"

# Rango por defecto: últimos 45 días (cubre 1.5 meses por si se atrasa la sync)
DIAS_HACIA_ATRAS = 45
# ===================================================

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def obtener_registros_dahua(fecha_inicio, fecha_fin):
    """
    Consulta los registros del control de acceso al Dahua vía CGI.
    Devuelve una lista de diccionarios con: cedula, fecha_hora, tipo, device_user_id.
    """
    ts_inicio = int(fecha_inicio.replace(tzinfo=timezone.utc).timestamp())
    ts_fin    = int(fecha_fin.replace(tzinfo=timezone.utc).timestamp())

    url = (
        f"http://{DAHUA_IP}/cgi-bin/recordFinder.cgi"
        f"?action=find&name=AccessControlCardRec"
        f"&StartTime={ts_inicio}&EndTime={ts_fin}"
    )

    log(f"Consultando Dahua: {fecha_inicio} → {fecha_fin}")
    r = requests.get(url, auth=HTTPDigestAuth(DAHUA_USER, DAHUA_PASS), timeout=30)
    r.raise_for_status()
    texto = r.text

    # El equipo responde con líneas tipo:
    #   records[0].CardNo=12345678
    #   records[0].UserID=12345678
    #   records[0].CreateTime=2026-09-14 08:30:00
    #   records[0].Type=Entry
    registros = {}
    patron = re.compile(r"records\[(\d+)\]\.(\w+)=(.*)")

    for linea in texto.splitlines():
        m = patron.match(linea.strip())
        if not m:
            continue
        idx, campo, valor = m.group(1), m.group(2), m.group(3).strip()
        if idx not in registros:
            registros[idx] = {}
        registros[idx][campo] = valor

    resultado = []
    for idx, campos in registros.items():
        cedula = campos.get("CardNo") or campos.get("UserID") or ""
        cedula = cedula.strip()
        # Normalizamos la cédula: solo dígitos (y opcionalmente 'V' al inicio)
        cedula = re.sub(r"[^\d]", "", cedula)
        if not cedula:
            continue

        fecha_str = campos.get("CreateTime", "")
        if not fecha_str:
            continue

        try:
            # Formato típico: "2026-09-14 08:30:00"
            fecha_hora = datetime.strptime(fecha_str, "%Y-%m-%d %H:%M:%S")
            fecha_hora = fecha_hora.replace(tzinfo=timezone.utc)
        except ValueError:
            log(f"  ⚠ Fecha inválida para cédula {cedula}: {fecha_str}")
            continue

        tipo_raw = (campos.get("Type") or "").strip().lower()
        if "entry" in tipo_raw or tipo_raw in ("1", "in"):
            tipo = "entrada"
        elif "exit" in tipo_raw or tipo_raw in ("2", "out"):
            tipo = "salida"
        else:
            tipo = tipo_raw or "desconocido"

        resultado.append({
            "cedula": cedula,
            "fecha_hora": fecha_hora.isoformat(),
            "tipo": tipo,
            "device_user_id": campos.get("UserID") or cedula,
        })

    log(f"Se obtuvieron {len(resultado)} registros del dispositivo.")
    return resultado

def subir_a_supabase(registros):
    """Inserta los registros en Supabase evitando duplicados exactos."""
    if not registros:
        log("Sin registros para subir.")
        return 0

    sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Obtenemos los ya existentes para no duplicar (mismo cédula + fecha_hora exactos)
    log("Verificando duplicados existentes...")
    cedulas = list(set(r["cedula"] for r in registros))
    fechas = [datetime.fromisoformat(r["fecha_hora"]) for r in registros]
    f_min = min(fechas).isoformat()
    f_max = max(fechas).isoformat()

    existentes = (
        sb.table("asistencia_registros")
        .select("cedula,fecha_hora")
        .in_("cedula", cedulas)
        .gte("fecha_hora", f_min)
        .lte("fecha_hora", f_max)
        .execute()
    )
    set_existentes = {
        (row["cedula"], row["fecha_hora"].replace("Z", "+00:00"))
        for row in (existentes.data or [])
    }

    nuevos = [
        r for r in registros
        if (r["cedula"], r["fecha_hora"]) not in set_existentes
    ]

    if not nuevos:
        log("No hay registros nuevos para insertar.")
        return 0

    # Insertamos en lotes de 200
    insertados = 0
    for i in range(0, len(nuevos), 200):
        lote = nuevos[i:i+200]
        sb.table("asistencia_registros").insert(lote).execute()
        insertados += len(lote)
        log(f"  → Insertados {insertados}/{len(nuevos)}")

    return insertados

def main():
    print("=" * 60)
    print("  SINCRONIZACIÓN DE ASISTENCIA — Dahua → Supabase")
    print("=" * 60)

    # Por defecto: últimos N días
    hoy = datetime.now(timezone.utc)
    fecha_fin = hoy.replace(hour=23, minute=59, second=59, microsecond=0)
    fecha_inicio = (hoy - timedelta(days=DIAS_HACIA_ATRAS)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    try:
        registros = obtener_registros_dahua(fecha_inicio, fecha_fin)
        insertados = subir_a_supabase(registros)
        print()
        print(f"✅ Sincronización completada.")
        print(f"   Registros leídos del Dahua: {len(registros)}")
        print(f"   Registros nuevos en Supabase: {insertados}")
    except requests.exceptions.RequestException as e:
        print()
        print(f"❌ ERROR al conectar con el Dahua: {e}")
        print("   Verifica la IP, usuario, contraseña y que estés en la red correcta.")
    except Exception as e:
        print()
        print(f"❌ ERROR inesperado: {e}")

    print()
    input("Presiona ENTER para cerrar...")

if __name__ == "__main__":
    main()
