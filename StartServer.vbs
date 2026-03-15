' StartServer.vbs
Set objShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' 动态获取当前脚本所在目录，避免路径写死
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
psScript = currentDir & "\Server.ps1"

' 0 代表完全隐藏窗口，False 代表不阻塞后续进程
objShell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & psScript & """", 0, False