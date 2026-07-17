@echo off
cd /d "%~dp0"

echo ========================================
echo   3D Mall Project - Quick Start
echo ========================================
echo.

if not exist "node_modules" (
  echo node_modules not found, running npm install...
  call npm install
  if errorlevel 1 (
    echo npm install failed. Check network or Node env.
    pause
    exit /b 1
  )
)

rem Kill any stale Vite server on port 5173 to always load latest code
powershell -Command "Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1
timeout /t 1 >nul

rem 后台等待 Vite 就绪后提示并自动打开浏览器（/b 同窗口后台运行，echo 可见）
start "" /b powershell -Command "$ok=$false; for($i=0;$i -lt 40;$i++){ try { if((Invoke-WebRequest -Uri http://localhost:5173 -UseBasicParsing -TimeoutSec 1).StatusCode -eq 200){$ok=$true;break} } catch {} ; Start-Sleep -Seconds 1 }; if($ok){ Write-Host '加载完成，正在打开浏览器...'; Start-Process 'http://localhost:5173' }"

rem Run Vite in this window - the only CMD window, close it to stop the server
npm run dev
if errorlevel 1 pause
