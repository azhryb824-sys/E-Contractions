@echo off
cd /d "%~dp0"
title المقاول الإلكتروني
color 0B
echo =============================================
echo        المقاول الإلكتروني
echo    نظام إدارة جداول الكميات والتكاليف
echo =============================================
echo.

:: بناء الواجهة الأمامية
echo [1/2] بناء الواجهة الأمامية...
cd frontend
call npx vite build
if %errorlevel% neq 0 (
    echo فشل بناء الواجهة الأمامية!
    pause
    exit /b 1
)
cd ..
echo تم البناء بنجاح
echo.

:: تشغيل الخادم
echo [2/2] تشغيل الخادم...
echo.
echo الخادم: http://localhost:3001
echo.
node backend\server.js

pause
