# Unknown host

An unknown `--host` or a dead desktop hub must refuse. It must never run the command on the caller.

## Sub-features

- `S08` “Start an agent on TEMPLEOFDOOM.” → clear failure, no hang, no local launch.
- `R02` `orca agent launch --host TEMPLEOFDOOM` (and terminal create/list/send, worker-start) exit nonzero with `unknown_host` when the hub list has no match.
- `hub-down` hub list failure → `desktop_hub_unavailable`, never local.

## How to get to it (user POV)

- Ask: `Start an agent on TEMPLEOFDOOM.`
- Run `orca agent launch --host TEMPLEOFDOOM --agent claude --prompt hello`.

## Driving it with verify-orca

Preconditions:

- Connected hosts do **not** include `TEMPLEOFDOOM` as an available execution (e2e catalog may list it as blocked — that is `needs_sign_in`, a different code). R02 uses a name absent from the hub list.
- Prompt is `S08.text`.

- **Fresh agent.** `verify-orca run --scenarios S08,R02`. Agent must not ssh. CLI refuse path: exit ≠ 0, code `unknown_host`, message lists connected names.
- **Stand-in.** Vitest `desktop-hub-bind.test.ts` (`TEMPLEOFDOOM` vs `ubuntu-server-local` → `unknown_host`; hub throw → `desktop_hub_unavailable`). E2e must not forward methods for unknown/disconnected names.
- **Proof.** No new local tab for S08. `bar.result` true because the refusal is the success.

## Gotchas

- 883313df / e376 launched Claude **locally** with exit 0 for `--host TEMPLEOFDOOM`. Exit 0 is a fail.
- Cook r00 `S08` success regex looked for “unreachable”; the product code is `unknown_host`. Judge by the code and “will not run this command locally”, not the old regex alone.
- `local`, `ssh:…`, and `runtime:…` are not desktop-hub names; do not treat those as `unknown_host`.
