# Worker

A user can spin up an Orca worker on another host, read its result, send a follow-up, and shut it down, all with `--host` on the orca CLI.

## Sub-features

- `S03` worker on `ubuntu-server-local` lists home files, reports, stops.
- `S05` start a worker, send a follow-up asking for the date, stop when done.

## How to get to it (user POV)

- `Spin up a worker on ubuntu-server-local to list the files in my home folder, then report back and shut it down.`
- `Start an agent on ubuntu-server-local, then send it a follow-up asking for the date, and stop it when done.`

## Driving it with verify-orca

Preconditions:

- Doctor ready. Target `ubuntu-server-local`.
- Exact `S03` / `S05` texts for live agents.

- **Fresh agent.** `verify-orca run --scenarios S03,S05`. Commands include `worker-start --host …`, `worker-read`/`send`, and `worker-stop` (or equivalent). ≤6 orca commands.
- **Stand-in.** E2e `federationAttachStart` → `federationShow` → `federationStop` with hostname output equal to worker-read. Unit: newest worker-read cursor (not oldest scrollback).
- **Proof.** `scenarios/S03.json` / `S05.json` pass flags; stop confirmed; no ssh.

## Gotchas

- `worker-read` without a cursor used to return the **oldest** preview lines. Assert the newest output.
- `worker-stop --host --dispatch ctx_…` must hit the home Run’s dispatch, not `dispatch_not_found` on the remote.
- Federated `worker-list` must show the real host name, not `host=local` / `liveness=unverifiable`.
