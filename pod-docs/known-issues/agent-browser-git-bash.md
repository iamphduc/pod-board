# agent-browser hangs from Git Bash on Windows

_Found: 2026-10-18 · sprint bootstrap-model, slice B1_

**Symptom:** on this Windows host, `agent-browser` calls run from Git Bash (the Bash tool) hang past the 2-minute limit, even after closing the session and retrying.

**Workaround:** run `agent-browser` from PowerShell (the PowerShell tool). The same commands finish at once there. Servers and `curl` work fine from Git Bash.

**Also (2026-10-19):** `agent-browser batch < file` can hang from PowerShell too, inside `Start-Job` or through `cmd /c`. One command per call works; give each call a time limit (for example `Start-Process cmd /c agent-browser --session <s> <command>` with a wait limit).
