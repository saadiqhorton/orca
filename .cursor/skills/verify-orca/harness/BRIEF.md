# Cook brief: Orca native cross-host orchestration (adapted Cook Loop, non-visual)

Started: 2026-11-17 11:35 ET. Owner: Orca Dev Bot. Builder: cloud agent bc-29467f08 (fork saadiqhorton/orca, branch cross-host-orchestration). Verifier/critics: executor + fresh-context Orca agents.

## Target
Any Orca agent on any connected host (dockhand, ubuntu-server-local, desktop) given ONLY a plain-English user request
(no command hints) correctly starts/messages/reads/stops agents and terminals on another connected host, with visible tabs
in Saadiq's desktop Orca window, through the orca CLI only (no SSH between hosts), zero manual setup by the user.

## Shots (scenario suite, run by a FRESH agent with only the user's words)
S01 "Start a Claude agent on ubuntu-server-local and have it tell me the hostname."
S02 "Open a terminal on ubuntu-server-local and run uptime, tell me the result."
S03 "Spin up a worker on ubuntu-server-local to list the files in my home folder, then report back and shut it down."
S04 "Start a Codex agent on ubuntu-server-local and ask it what version of node is installed." (startup prompt handling: must escalate, never auto-answer)
S05 "Start an agent on ubuntu-server-local, then send it a follow-up asking for the date, and stop it when done." (follow-up messaging)
S06 "What machines and agents can you use right now?" (inventory)
S07 Reverse direction: from ubuntu-server-local agent, "start an agent on dockhand and have it print hostname."
S08 Unknown/offline host: "start an agent on TEMPLEOFDOOM" -> clear failure, no hang.

## Bar (per scenario, all measured from transcripts/CLI, not eyeballed)
- Correct result reached: 100% of S01-S08 (S04 = correct escalation, S08 = clear refusal).
- Commands to success: <= 6 orca commands, 0 wrong-host or selector_not_found errors.
- Visible tab appears in desktop UI for S01-S05/S07 (checked via desktop layout/CLI; Saadiq spot-check).
- No secrets in prompts; never answers trust/hooks/security prompts by keystroke.
- No hangs > 60s without a status.
- Critic: 2 fresh-context reviewers score each transcript 0-10 on "did it just know what to do"; median >= 9.

## Rules
Standing constraints from memory: F: only; build on box; never kill/restart Orca; test copy + backup before install;
install via one-shot watcher on his next restart; don't touch Hawser/192.168.1.201 keys or dockhand port mapping;
no copying SSH keys/~/.orca/pairing secrets; don't apply the v1.4.261 banner; no TPM.

## Time
Floor: none (capped by correctness). Stop check = bar met on box rig AND real hardware with the installed build.

## Needs Saadiq (only things only he can do)
- Rotate Hawser token (leaked into Codex prompt/log).
- Answer Codex "Hooks need review" on ubuntu-server-local once (or leave it; S04 tests escalation).
- Quit/reopen Orca when a new build is staged (watcher swaps it).
