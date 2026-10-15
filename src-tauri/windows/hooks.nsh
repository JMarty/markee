; Az MD View felvétele a Windows "Társítás" listájába minden markdown kiterjesztésnél.
; A Tauri saját fájltársítása csak a progid-t hozza létre, az OpenWithProgids bejegyzést nem.

!macro MDVIEW_EXT ext
  WriteRegStr SHCTX "Software\Classes\.${ext}\OpenWithProgids" "MDView.Markdown" ""
  WriteRegStr SHCTX "Software\Classes\Applications\mdview.exe\SupportedTypes" ".${ext}" ""
!macroend

!macro MDVIEW_EXT_REMOVE ext
  DeleteRegValue SHCTX "Software\Classes\.${ext}\OpenWithProgids" "MDView.Markdown"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro MDVIEW_EXT "md"
  !insertmacro MDVIEW_EXT "markdown"
  !insertmacro MDVIEW_EXT "mdown"
  !insertmacro MDVIEW_EXT "mkd"
  !insertmacro MDVIEW_EXT "mdx"
  WriteRegStr SHCTX "Software\Classes\Applications\mdview.exe" "FriendlyAppName" "MD View"
  WriteRegStr SHCTX "Software\Classes\Applications\mdview.exe\shell\open\command" "" '"$INSTDIR\mdview.exe" "%1"'
  ; Explorer értesítése, hogy frissítse a társításokat és ikonokat
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro MDVIEW_EXT_REMOVE "md"
  !insertmacro MDVIEW_EXT_REMOVE "markdown"
  !insertmacro MDVIEW_EXT_REMOVE "mdown"
  !insertmacro MDVIEW_EXT_REMOVE "mkd"
  !insertmacro MDVIEW_EXT_REMOVE "mdx"
  DeleteRegKey SHCTX "Software\Classes\Applications\mdview.exe"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
