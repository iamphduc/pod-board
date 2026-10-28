# agent-browser hangs from Git Bash on Windows

_Found: 2026-10-18 · sprint bootstrap-model, slice B1_

**Symptom:** on this Windows host, `agent-browser` calls run from Git Bash (the Bash tool) hang past the 2-minute limit, even after closing the session and retrying.

**Workaround:** run `agent-browser` from PowerShell (the PowerShell tool). The same commands finish at once there. Servers and `curl` work fine from Git Bash.

**Also (2026-10-19):** `agent-browser batch < file` can hang from PowerShell too, inside `Start-Job` or through `cmd /c`. One command per call works; give each call a time limit (for example `Start-Process cmd /c agent-browser --session <s> <command>` with a wait limit).

**Also (2026-10-21, sprint queue-and-replies, slice R1):** it is flaky, not constant. The orchestrator's `agent-browser --session pod-orch open …` from Git Bash worked every time this sprint, while two engineers' `open` calls hung in parallel. `timeout 60 agent-browser open …` from Git Bash does not end the hang: the call still runs to the tool's 90 s limit. One hang → close the session and stop retrying; report the browser criteria as not checked, and the orchestrator drives them in the wave check.

**Also (2026-10-28, sprint calm-screen):** still true. In wave 2, two engineers' first `open` from Git Bash hung (T1 once, P1 twice), while L1 and F1 ran it from PowerShell with no hang and the orchestrator's Git Bash calls worked. Engineers on this host: run `agent-browser` from PowerShell, one command per call, each with a time limit.

**Also (2026-10-28, slice S1):** from PowerShell, wrapping the call in `Start-Job` or `Start-Process` hung or failed; a direct `agent-browser … open` opened the page but didn't return (90 s), and every later direct one-command call returned at once.
