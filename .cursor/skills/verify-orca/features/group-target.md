# Group target

`--worktree group:"<name>"` and `--group "<name>"` name a project group on the target host. Orca places the tab in that group's single workspace, or lists the candidates and exits if more than one matches.

## Sub-features

- `R10` named group selector on agent launch, terminal create, and worker-start.
- Unique member resolves to `id:<repo>::<path>` or `folder:<id>`.
- Ambiguous groups error with every candidate selector.

## How to get to it (user POV)

- `orca host inventory --json --group "dockhand group"`
- `orca agent launch --host clawd --group "dockhand group" --agent claude --prompt "…"`
- `orca terminal create --host clawd --worktree group:"dockhand group"`

## Driving it with verify-orca

Preconditions:

- Doctor ready. Inventory lists a uniquely named group on the target.

- **Unit.** `orchestration-group-selector.test.ts` parses `group:"dockhand group"` and resolves one member. Placement test places that group onto `id:1a093718::/home/clawd`.
- **Proof.** `scenarios/R10.json`. Live clawd `--group` is recorded as unverified when the two-host desktop is absent.

## Gotchas

- Group ids differ per host (`12b96451` / `d51c5999` / `8c735346`); match by **name**.
- `--group` and a non-group `--worktree` together are invalid.
