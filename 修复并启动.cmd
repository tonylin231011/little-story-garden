@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Manage-ReaderService.ps1" -Action Repair
if errorlevel 1 (pause) else (start "" "http://127.0.0.1:4173/")
