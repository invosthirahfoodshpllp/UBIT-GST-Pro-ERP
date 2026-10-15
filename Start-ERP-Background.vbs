Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strPath = fso.GetParentFolderName(WScript.ScriptFullName)

' Check if ubit-server.exe exists; if so, launch it hidden
If fso.FileExists(strPath & "\ubit-server.exe") Then
    WshShell.Run """" & strPath & "\ubit-server.exe""", 0, False
Else
    WshShell.Run "powershell -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File """ & strPath & "\local-server.ps1""", 0, False
End If

' Wait 1.5 seconds for socket binding
WScript.Sleep 1500

' Open in default browser
WshShell.Run "http://localhost:5173/"
