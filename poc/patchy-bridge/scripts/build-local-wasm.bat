@echo off
rem Local Windows build helper for the pinned Patchy WASM checkout.
rem Usage: build-local-wasm.bat <configure|build> <preset> [extra cmake args...]
setlocal
set "REPO_ROOT=%~dp0..\..\.."
set "PATCHY_ROOT=%REPO_ROOT%\vendor\Patchy"
set "EMSDK_ROOT=%PATCHY_ROOT%\.deps\emsdk"
set "EM_CONFIG=%EMSDK_ROOT%\.emscripten"
set "EMSDK=%EMSDK_ROOT%"
set "EMSDK_NODE=%EMSDK_ROOT%\node\24.19.0_64bit\node.exe"
set "EMSDK_PYTHON=%EMSDK_ROOT%\python\3.13.3_64bit\python.exe"
set "TOOLS_ROOT=%PATCHY_ROOT%\.deps\aqt-venv312"
if not exist "%TOOLS_ROOT%\Scripts\cmake.exe" set "TOOLS_ROOT=%PATCHY_ROOT%\.deps\aqt-venv"
set "PATH=%EMSDK_ROOT%;%EMSDK_ROOT%\upstream\emscripten;%EMSDK_ROOT%\node\24.19.0_64bit;%EMSDK_ROOT%\python\3.13.3_64bit;%TOOLS_ROOT%\Scripts;%PATH%"
cd /d "%PATCHY_ROOT%" || exit /b 1
set "CMAKE_EXE=%TOOLS_ROOT%\Scripts\cmake.exe"
if /i "%~1"=="configure" goto configure
if /i "%~1"=="build" goto build
echo usage: %~nx0 ^<configure^|build^> ^<preset^> [extra args...] 1>&2
exit /b 2
:configure
"%CMAKE_EXE%" --preset "%~2" "-DCMAKE_CROSSCOMPILING_EMULATOR=%EMSDK_NODE%" %3 %4 %5 %6 %7 %8 %9
exit /b %ERRORLEVEL%
:build
"%CMAKE_EXE%" --build --preset "%~2" %3 %4 %5 %6 %7 %8 %9
exit /b %ERRORLEVEL%
