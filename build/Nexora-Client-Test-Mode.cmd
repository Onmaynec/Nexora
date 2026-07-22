@echo off
set "NEXORA_CLIENT_TEST_MODE=1"
start "Nexora Client Test Mode" "%~dp0..\Nexora Client.exe" --test-mode
