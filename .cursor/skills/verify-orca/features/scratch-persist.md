# Scratch persist

On a desktop-managed or migrated SSH orcad host (`legacy-repo` setup), host-created folder workspaces and the `Orca orchestration` group must survive desktop catalog sync. Two launches without `--worktree` reuse one `~/orca-orchestration` folder id, it appears in `folderWorkspaces`, and `folder:<id>` resolves.

## Sub-features

- `R12` two `ensureScratch` calls reuse `fld_persist` even when the visible listing is empty.
- Empty desktop catalog fetch does not wipe host-created rows.
- Scratch groups/folders stay visible even when tagged as retained orcad source.

## How to get to it (user POV)

- `orca terminal create --host clawd` twice.
- `orca host inventory --json` lists one scratch folder; the second create returns the same `folder:<id>`.

## Driving it with verify-orca

Preconditions:

- Doctor ready. Target is a managed-SSH orcad host.

- **Unit.** `ensure-orchestration-scratch.test.ts` hidden-listing reuse; `host-catalog-empty-fetch.test.ts` empty fetch preserves previous.
- **Rig.** Cross-host e2e calls `ensureScratch` twice on the managed-SSH host; both return `folder:fld_e2e` and inventory lists it.
- **Proof.** `scenarios/R12.json`. Live two-launch folder id on clawd is recorded as unverified without the managed-SSH rig.

## Gotchas

- `listVisibleFolderWorkspaces()` being empty is not proof the folder is gone; reuse from the full store by path.
- Never mint a second folder for `~/orca-orchestration`.
