@echo off
 title Hospital Sem Lotacao
 cd /d "%~dp0"
 echo Iniciando Hospital Sem Lotacao...
 echo Mantenha esta janela aberta enquanto usar o site.
 start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"
 node server.js
 pause
