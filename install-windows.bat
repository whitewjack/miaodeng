@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

if /I "%~1"=="/?" goto :usage
if /I "%~1"=="-h" goto :usage
if /I "%~1"=="--help" goto :usage

echo ================================
echo ⚡ 秒登插件一键安装脚本
echo ================================
echo.
echo 💡 用法: install-windows.bat [服务器地址] ^(默认: http://localhost:6680^)
echo.

REM 获取服务器地址
set SERVER_URL=%~1
if "%SERVER_URL%"=="" set SERVER_URL=%MIAODENG_SERVER_URL%
if "%SERVER_URL%"=="" set SERVER_URL=http://localhost:6680

echo 📍 服务器地址: %SERVER_URL%
echo.

REM 创建临时目录
set TEMP_DIR=%TEMP%\miaodeng-install
if exist "%TEMP_DIR%" rd /s /q "%TEMP_DIR%"
mkdir "%TEMP_DIR%"

set ZIP_FILE=%TEMP_DIR%\miaodeng.zip
set EXTRACT_DIR=%TEMP_DIR%\extension

echo 📥 正在下载插件...
powershell -Command "& {Invoke-WebRequest -Uri '%SERVER_URL%/auto-login-extension.zip' -OutFile '%ZIP_FILE%'}"
if errorlevel 1 (
    echo ❌ 下载失败！请检查服务器地址是否正确
    echo    确保服务器正在运行: python server.py
    pause
    exit /b 1
)

echo 📦 正在解压...
powershell -Command "& {Expand-Archive -Path '%ZIP_FILE%' -DestinationPath '%EXTRACT_DIR%' -Force}"

REM 查找 chrome-extension 文件夹
set EXTENSION_DIR=%EXTRACT_DIR%\chrome-extension
if not exist "%EXTENSION_DIR%" (
    REM 尝试在解压目录中查找
    for /d %%i in ("%EXTRACT_DIR%\*chrome-extension*") do set EXTENSION_DIR=%%i
)

if not exist "%EXTENSION_DIR%" (
    echo ❌ 找不到 chrome-extension 文件夹
    pause
    exit /b 1
)

echo ✅ 准备完成！
echo.

echo 📋 最后一步：
echo.
echo 1. Chrome 将自动打开扩展页面
echo 2. 开启右上角的「开发者模式」开关
echo 3. 点击「加载已解压的扩展程序」
echo 4. 选择这个文件夹：
echo    %EXTENSION_DIR%
echo.

pause

REM 打开 Chrome 扩展页面
start chrome://extensions/

echo.
echo ✅ Chrome 扩展页面已打开！
echo.
echo 💡 提示：
echo    - 在文件选择器中可以直接粘贴路径
echo    - 安装完成后可以删除临时文件夹：
echo      %TEMP_DIR%
echo.

REM 复制路径到剪贴板
echo %EXTENSION_DIR%| clip

echo 🎉 安装准备完成！文件夹路径已复制到剪贴板
echo.

pause
exit /b 0

:usage
echo 用法: install-windows.bat [服务器地址]
echo 示例: install-windows.bat http://192.168.1.100:6680
echo 默认: http://localhost:6680
exit /b 0
