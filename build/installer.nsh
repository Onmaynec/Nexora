!macro customInstall
  CreateShortCut "$SMPROGRAMS\Nexora Client (Test Mode).lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--test-mode" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 SW_SHOWNORMAL "" "Nexora Client с консолью журнала"
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\Nexora Client (Test Mode).lnk"
!macroend
