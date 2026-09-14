@echo off
cd /d "%~dp0"
echo ============================================================
echo  Sincronizando asistencia desde Dahua a Supabase...
echo ============================================================
echo.

REM Verificamos si existe el entorno virtual
if not exist ".venv" (
    echo Creando entorno virtual por primera vez...
    python -m venv .venv
    call .venv\Scripts\activate.bat
    python -m pip install --upgrade pip
    python -m pip install -r requirements.txt
) else (
    call .venv\Scripts\activate.bat
)

python sincronizar_asistencia.py

pause
