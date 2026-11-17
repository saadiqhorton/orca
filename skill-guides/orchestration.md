---
name: orchestration
description: >-
  Run work in separate Orca worker agents and get their results back. Use when
  the user asks for Orca workers or supervision (monitor, task DAGs, ask/reply,
  decision gates), or when the work needs something your own subagents cannot
  give: a different agent (such as Codex from Claude) or its own Orca workspace.
  "Have Codex (or Claude) review this and report back" means an Orca worker of
  that agent, even when you have your own model subagents.
  Also use when you are a dispatched worker (a prompt with Task and Dispatch
  IDs: ask, worker_done). Otherwise prefer your own subagents,
  including for long or parallel work. Use `orca-cli` to hand work off with
  nothing expected back ("hand off", "handover", "give this to another agent",
  "another worktree"), and for terminal control, shell commands, worktree
  management, and reading or waiting on terminals.
---

# Orca orchestration

If your prompt has a preamble with Task and Dispatch IDs, you are a worker:
follow the preamble. To ask your coordinator, run `ask`, then end your turn;
Orca wakes you with the answer. To hand work off with nothing back, use `orca-cli`.
When you report your effort, take it from the dispatch's `--effort` or your process
argv, not from a numeric `reasoning_effort`: that number is not on a 0–100 scale
(claude-opus-5-5: low=5, medium=10, high=15, xhigh=40).

## Recipe

`ORCA` stands for the executable you used to run `skills get`; type it in its
place and use it for every command.

The simplest cross-host path (no `--worktree`):

```text
ORCA host inventory --json
ORCA agent launch --host <name> --agent <agent> --prompt "<task>" --json
```

or a hidden worker:

```text
ORCA orchestration worker-start --spec "<task>" --host <name> --agent <agent>
```

`<agent>` is an Orca agent id: one the user named, else the agent you are
running as when the worker shares your execution host. `--host <name>` is a
row from `host inventory` whose status is `connected`. Always carry `--host`
on follow-ups that touch a visible tab (`terminal send` / `read` / `show` /
`close`, `agent launch`). Unique `folder:<id>` and `term_…` handles resolve
across connected hosts without `--host`; if they are ambiguous, the error
names the owning hosts and the exact corrected command.

Do **not** put secrets or tokens in `--prompt` / `--spec`. Pass them via a
file or environment variable on the target host.

Never answer trust, hooks, or security prompts (Codex "Hooks need review",
Claude trust/fullscreen) with keystrokes. If a launch returns
`agent_blocked_on_prompt` or `desktop_hub_call_timeout`, stop and ask the
user to open the tab in the desktop Orca window and choose an option. Then
re-send the prompt with `terminal send --host <name> --terminal <handle>`.
`--answer-dialog` is only for when the user explicitly asked you to type
into that dialog.

Those commands open or drive tabs that appear in the user's desktop Orca
window under that host's project/group:

```text
ORCA host inventory --json
ORCA agent launch --host <name> --agent <agent> --prompt "<task>" --json
ORCA terminal create --host <name> --json
ORCA terminal list --host <name> --json
ORCA terminal send --host <name> --terminal <handle> --text "<message>" --enter
ORCA terminal read --host <name> --terminal <handle> --screen
ORCA worktree create --host <name> --name <short-name> --json
ORCA worktree create --host <name> --agent <agent> --prompt "<task>" --json
ORCA orchestration send --host <name> --to <handle> --subject "<topic>" --body "<message>"
ORCA orchestration send --to dispatch:<id> --subject "<topic>" --body "<message>"
ORCA terminal close --host <name> --terminal <handle>
```

Without `--worktree`, `agent launch`, `terminal create`, and
`orchestration worker-start --host <name>` create or reuse `~/orca-orchestration`
on that host (never the user's home). `worktree create --host --agent`
launches that agent in the scratch folder; without `--agent` it only creates
the folder and prints the `agent launch --host` command to use next.
Message a visible tab with `send --host <name> --to <handle>`. Message a
worker with `send --to dispatch:<id>` or a bare `ctx_…` id (you may still
pass `--host`; Orca routes the Dispatch to the Run that owns it).
`worker-show`, `worker-read`, `worker-stop`, and the other `--dispatch`
verbs stay on that Run too — `--host` is ignored. Never use SSH, never open
a port, and never copy keys. If the status is `needs_sign_in` or
`unreachable`, say so and stop. `--on` is only a paired Orca server saved on
this machine; load `references/placement-and-remote.md` before using it. If an
agent CLI is missing, the error lists the agents installed on that host.

- Start every independent worker, then **end your turn**. "Report back" and
  "tell me when it's done" still mean end your turn; Orca wakes you and you
  report then.
- If a receipt has `next`, follow it. When Orca has nothing for you, end your
  turn.
- `--worktree current` uses your workspace. Use a new one only when the user
  asks or sharing would conflict: `--worktree new-child --name <short-name>`
  nests it under yours. For one with no parent, use
  `--worktree new-top-level --repo id:<repoId> --name <short-name>`
  (`ORCA repo list --json` gives the id). If nothing needs to come back to you
  (the user will work in those chats), don't start workers; per workspace run
  `ORCA worktree create --name <name> --no-parent --agent <agent> --prompt "<brief>" --json`
  and end your turn.
- Add `--model` only if the user named one.
- If `worker-start` fails, do not rerun it; read `failedStage` and load
  `references/recovery-and-cleanup.md`.
- To talk to a worker, use
  `ORCA orchestration send --to dispatch:<dispatch_id> --subject "<topic>" --body "<message>"`
  in any state: a working worker gets it when its current turn ends; a finished
  or closed one gets it as a follow-up Task and reports with `worker_done`. The
  receipt says which.
  Except on a paired server: a finished worker there refuses `send`, so start
  new work there with `worker-start --on <server>` (load
  `references/placement-and-remote.md` first).

Never:

- Poll or run watch scripts: a script's plain `check` takes your mail, so it is
  hidden from you and Orca has nothing to wake you with. Orca wakes you.
- Steer through a worker's terminal; use `send`.
- Make checkouts yourself; let `worker-start` create a worker's workspace.

## When Orca wakes you

- In a chat, each message arrives whole as its own message: act on it. A wake
  that names a `check` command (a terminal, or one message too large for a chat
  message) means run that command. Answer a `question` with
  `ORCA orchestration reply --id <message_id> --body "<answer>"` when the answer
  follows from the task or the user's instructions; otherwise ask the user first.
- An `escalation` with `stopReason` means the worker stopped without
  `worker_done`: steer it with `send`, stop and retry it, or tell the user.
  `exited` or `lost` means it is gone: retry it or tell the user.
- A `worker_done` settles its Task; never mark a reported failure completed.
- When every worker has settled, report to the user per Task: outcome,
  evidence, open blockers.
- Lost track? `ORCA orchestration inbox --terminal run:<run_id> --limit 50`
  shows mail `check` already handled. A worker mailbox is
  `ORCA orchestration inbox --dispatch <dispatch_id>` (or `check --dispatch`).

Finished workers close on their own unless `worker-list` gives one a `next`; follow
it. Kept-open workers, including new-workspace ones, stay open for the user.
`send` reopens a closed worker when you need it again.
Start a worker in your workspace with `--keep-open` when the user will keep using
its chat after it reports: they want to watch it or talk to it. To keep one already
started, run
`ORCA orchestration worker-keep-open --dispatch <dispatch_id>`.

## Task spec

Make each spec self-contained: the target, the change, constraints, what the
worker may edit, and the evidence that proves it is done. Say whether a
non-zero exit means the Task failed or capturing it is the deliverable. Send
fixes to a worker unless the user gave them to you.

Fetch this guide once. Summarize the worker's evidence; rerun checks only for a
gap or contradiction.

## Safety

Silence, a timeout, or `unverifiable` liveness alone never proves exit or authorizes
autonomous recovery. For explicit user cancellation or assignment abandonment,
load `references/recovery-and-cleanup.md`: requesting a guarded stop or fencing an
assignment does not prove its agent stopped.

## References

`ORCA skills get orchestration --reference references/<file>.md`

| Situation                                                  | Reference                            |
| ---------------------------------------------------------- | ------------------------------------ |
| Task DAGs, several Runs                                    | `references/coordinator-loop.md`     |
| Child worktrees, a desktop-connected host, a paired server | `references/placement-and-remote.md` |
| Group messages                                             | `references/messaging-and-gates.md`  |
| A failed or unknown worker; retry, stop, reset             | `references/recovery-and-cleanup.md` |
| Custom argv or terminal layout                             | `references/low-level-topology.md`   |
