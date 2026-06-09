Dim WshShell
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\???\Documents\Codex\2026-05-31\files-mentioned-by-the-user-skill\ai-learning-assistant"
WshShell.Run "python run_server.py", 0, False
Set WshShell = Nothing
