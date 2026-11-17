# Placement and remote execution

## Desktop-connected execution hosts

The desktop app is the hub for the machines it is connected to. From any Orca
session — on the desktop, or on one of those machines — list them and operate
on Orca itself there. Do not use SSH.

```text
orca host inventory --json
orca host list
```

`orca host inventory` is the one command to run first: every host, connection
status, Orca projects and folder workspaces, installed agent CLIs, and live
tabs/sessions.

`--host <name>` on `agent launch`, `terminal create`, `terminal list`,
`terminal send`, `terminal read`, `terminal close`, `worktree create`, and
`orchestration send` / `worker-start` talks to that machine through the
desktop hub. The resulting tabs show up in the user's desktop Orca window
under that host's project, exactly as if they had created them by hand.

```text
orca agent launch --host <name> --agent <agent> --prompt "<task>" --json
orca terminal create --host <name> --json
orca terminal list --host <name> --json
orca terminal send --host <name> --terminal <handle> --text "<message>" --enter
orca worktree create --host <name> --name <short-name> --json
orca orchestration worker-start --spec "<task>" --host <name> --agent <agent>
orca orchestration send --host <name> --to <handle-or-dispatch> --subject "<topic>" --body "<message>"
orca terminal close --host <name> --terminal <handle>
```

Without `--worktree`, Orca creates or reuses `~/orca-orchestration` on that
host (a folder project in an "Orca orchestration" sidebar group, never the
user's home). Pass `--worktree path:<path>` to use an existing project folder
instead. `current` names this machine's workspace, not the remote one.

`--host` is a name `orca host list` / `orca host inventory` prints with status
`connected`. That list includes every machine the desktop app is connected to,
not only this machine. `needs_sign_in` means the user must sign in or re-pair
in the desktop app. `unreachable` means the desktop cannot reach that host.
Say which one, and stop. Orca will not try SSH.

After start, `worker-show`, `worker-read`, and `worker-stop` take the Dispatch
id from the receipt and do not need `--host` again. Replies come back to this
session's `check`. For a visible tab, keep using `--host` with `terminal send`
/ `terminal read` / `agent launch` as above.

`--on` is different: a paired Orca server saved on the machine running the
command. Use `--host` for a desktop-connected execution host.

Folder workspaces are valid. `new-child` and `new-top-level` make Git worktrees,
never in a folder project; never `git init` a user's folder. From a multi-repo
folder workspace, `new-child` nests under the folder and needs `--repo` naming
the Git repo to create the worktree in.

Local `current`, `new-child` and `new-top-level` stay in the caller's project;
`new-child` also uses the caller's workspace as its parent. Omit `--repo` for
same-project work. Pass it only to deliberately target another project, or for
the connected-server creation described below. The project visible in the app
is not the caller's project. For direct `worktree create`, likewise omit
`--repo`/`--project` for same-project work and use `--parent-worktree active`
when requesting a child of the current workspace. On a desktop-connected host,
`worktree create --host <name> --name <short-name>` without `--repo` creates a
folder workspace in that host's Orca orchestration group.

```text
# Child of the current worktree.
ORCA orchestration worker-start --task <task_id> --worktree new-child --agent <agent> --setup run

# On a connected server, nested under your workspace; the Run stays on yours.
ORCA orchestration worker-start --task <task_id> --on <server> --worktree new-child --repo <exact_remote_repo_selector> --name <name> --agent <agent> --setup run

# On a connected server, with no parent.
ORCA orchestration worker-start --task <task_id> --on <server> --worktree new-top-level --repo <exact_remote_repo_selector> --name <name> --agent <agent> --setup run
```

With `--on`, both `new-child` and `new-top-level` need `--repo` naming a
project on that server. `new-child` nests the server's worktree under your
workspace on this machine. A server whose Orca is too old to nest across
machines still starts the worker, top-level, and the receipt's `warning` says
so; the worker is fine to use. `current` without a project now creates or
reuses `~/orca-orchestration` on that server.

`--name` is optional: without it Orca picks a name as it does for an unnamed
workspace, and the start output names the workspace it created.

After start, address a remote worker only by Dispatch ID, never by a terminal
handle.

## Agents on another server

To message an agent on a desktop-connected machine, use `--host` and the name
from `orca host inventory`. To message an agent that already runs on a paired
server saved on this machine, send with `--on`, using the same server names as
`worker-start --on`:

```bash
ORCA orchestration send --on <server> --to orca_session_id:<id> --subject "<topic>" --body "<message>"
```
