; A Markee felvétele a Windows "Társítás" listájába minden markdown kiterjesztésnél.
; A Tauri saját fájltársítása csak a progid-t hozza létre, az OpenWithProgids bejegyzést nem.

!macro MARKEE_EXT ext
  WriteRegStr SHCTX "Software\Classes\.${ext}\OpenWithProgids" "Markee.Markdown" ""
  WriteRegStr SHCTX "Software\Classes\Applications\markee.exe\SupportedTypes" ".${ext}" ""
!macroend

!macro MARKEE_EXT_REMOVE ext
  DeleteRegValue SHCTX "Software\Classes\.${ext}\OpenWithProgids" "Markee.Markdown"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro MARKEE_EXT "md"
  !insertmacro MARKEE_EXT "markdown"
  !insertmacro MARKEE_EXT "mdown"
  !insertmacro MARKEE_EXT "mkd"
  !insertmacro MARKEE_EXT "mdx"
  WriteRegStr SHCTX "Software\Classes\Applications\markee.exe" "FriendlyAppName" "Markee"
  WriteRegStr SHCTX "Software\Classes\Applications\markee.exe\shell\open\command" "" '"$INSTDIR\markee.exe" "%1"'
  ; Explorer értesítése, hogy frissítse a társításokat és ikonokat
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro MARKEE_EXT_REMOVE "md"
  !insertmacro MARKEE_EXT_REMOVE "markdown"
  !insertmacro MARKEE_EXT_REMOVE "mdown"
  !insertmacro MARKEE_EXT_REMOVE "mkd"
  !insertmacro MARKEE_EXT_REMOVE "mdx"
  DeleteRegKey SHCTX "Software\Classes\Applications\markee.exe"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
