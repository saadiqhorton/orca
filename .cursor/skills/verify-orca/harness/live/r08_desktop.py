#!/usr/bin/env python3
"""Round 08 live R10–R15 against a desktop + two connected hosts (no source greps).

Uses the real orca CLI. Box-rig CDP steps (ambiguous group move, reconnect, folder delete)
are omitted here; r08_live.py covers those on the cook box.
"""
from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import sys
import time
from pathlib import Path

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
ONLY = set(sys.argv[2:])
OUT.mkdir(parents=True, exist_ok=True)
LOG: list[dict] = []
RES: dict[str, dict] = {}
SECTION: list[str | None] = [None]


def want(cid: str) -> bool:
    prefix = cid.split()[0]
    sid = prefix[:3] if prefix[:1] == "R" else prefix
    ok = not ONLY or cid in ONLY or sid in ONLY or any(cid.startswith(x) for x in ONLY)
    if ok:
        SECTION[0] = sid
    return ok


def orca_bin() -> str:
    env = os.environ.get("ORCA_BIN")
    if env:
        return env
    for path in (
        os.path.expanduser("~/.orca/cli/bin/orca"),
        os.path.expanduser("~/.local/bin/orca"),
        "/root/.orca/cli/bin/orca",
    ):
        if os.path.exists(path):
            return path
    return "orca"


BIN = orca_bin()


def orca(args: list[str], timeout: int = 150) -> dict:
    t0 = time.time()
    p = subprocess.run([BIN, *args], capture_output=True, text=True, timeout=timeout)
    r = {
        "cmd": "orca " + " ".join(shlex.quote(a) for a in args),
        "exit": p.returncode,
        "secs": round(time.time() - t0, 1),
        "out": ((p.stdout or "") + (p.stderr or ""))[-8000:],
        "section": SECTION[0],
    }
    LOG.append(r)
    return r


def j(r: dict) -> dict:
    try:
        return json.JSONDecoder().raw_decode(r["out"][r["out"].index("{") :])[0]
    except Exception:
        return {}


def rec(cid: str, ok: bool, detail: str) -> None:
    RES[cid] = {"pass": bool(ok), "detail": detail}
    print(("PASS " if ok else "FAIL ") + cid + " | " + detail, flush=True)


def inventory_hosts() -> list[dict]:
    payload = j(orca(["host", "inventory", "--json"]))
    hosts = payload.get("result", {}).get("hosts") or payload.get("hosts") or []
    return [row for row in hosts if isinstance(row, dict)]


def host_inv(name: str) -> dict:
    for row in inventory_hosts():
        if row.get("name") == name:
            inv = row.get("inventory")
            return inv if isinstance(inv, dict) else {}
    return {}


def group_member_path(inv: dict, group_name: str) -> str:
    wanted = group_name.strip().lower()
    for project in inv.get("projects") or []:
        if not isinstance(project, dict):
            continue
        if str(project.get("name") or "").strip().lower() != wanted:
            continue
        members = project.get("members") or []
        if len(members) == 1 and isinstance(members[0], dict):
            return str(members[0].get("path") or members[0].get("selector") or "")
    return ""


def close_handle(host: str, handle: str | None) -> None:
    if handle:
        orca(["terminal", "close", "--host", host, "--terminal", handle])


def coordinator(host: str | None = None) -> str | None:
    args = ["terminal", "create", "--title", "r08-desktop-coord", "--json"]
    if host:
        args[2:2] = ["--host", host]
    r = orca(args)
    found = re.findall(r"term_[0-9a-f-]+", r["out"])
    return found[0] if found else None


HOST_A = os.environ.get("ORCA_VERIFY_HOST_B", "dockhand")
HOST_B = os.environ.get("ORCA_VERIFY_HOST_A", "ubuntu-server-local")
GROUP = "dockhand group"
coord = coordinator()
print("coordinator", coord, "hosts", HOST_A, HOST_B, flush=True)

if want("R10"):
    r = orca(
        ["terminal", "create", "--host", HOST_B, "--worktree", f'group:"{GROUP}"', "--json"]
    )
    term = (j(r).get("result") or {}).get("terminal") or {}
    wt = str(term.get("worktreeId") or r["out"])
    target_path = group_member_path(host_inv(HOST_B), GROUP)
    rec(
        "R10a terminal create group:",
        r["exit"] == 0 and (not target_path or target_path in wt or wt in target_path),
        f"exit={r['exit']} worktree={wt[-80:]} listed={target_path[-80:]}",
    )
    close_handle(HOST_B, term.get("handle"))
    r = orca(
        [
            "agent",
            "launch",
            "--host",
            HOST_B,
            "--worktree",
            f'group:"{GROUP}"',
            "--agent",
            "claude",
            "--prompt",
            "RUN: hostname",
            "--json",
        ]
    )
    d = j(r).get("result") or {}
    rec(
        "R10b agent launch group:",
        r["exit"] == 0 and (d.get("sessionPlacement") or {}).get("source") == "named",
        f"exit={r['exit']} wt={d.get('worktreeId')} placement={d.get('sessionPlacement')}",
    )
    close_handle(HOST_B, (d.get("outcome") or {}).get("handle"))
    r = orca(
        [
            "agent",
            "launch",
            "--host",
            HOST_B,
            "--group",
            GROUP,
            "--agent",
            "claude",
            "--prompt",
            "RUN: hostname",
            "--json",
        ]
    )
    d = j(r).get("result") or {}
    rec(
        "R10c agent launch --group",
        r["exit"] == 0,
        f"exit={r['exit']} wt={d.get('worktreeId')} out={r['out'][-200:] if r['exit'] else ''}",
    )
    close_handle(HOST_B, (d.get("outcome") or {}).get("handle"))
    r = orca(
        [
            "orchestration",
            "worker-start",
            "--host",
            HOST_B,
            "--worktree",
            f'group:"{GROUP}"',
            "--agent",
            "claude",
            "--spec",
            "echo R10D_OK",
            "--json",
        ]
    )
    d = j(r).get("result") or {}
    rec(
        "R10d worker-start group:",
        r["exit"] == 0 and d.get("state") == "ready",
        f"exit={r['exit']} state={d.get('state')} lastError={d.get('lastError')}",
    )
    if d.get("dispatchId"):
        orca(["orchestration", "worker-stop", "--host", HOST_B, "--dispatch", d["dispatchId"]])

if want("R11"):
    r = orca(
        [
            "agent",
            "launch",
            "--host",
            HOST_B,
            "--agent",
            "claude",
            "--prompt",
            "RUN: echo R11A_OK",
            "--json",
        ]
    )
    d = j(r).get("result") or {}
    sp = d.get("sessionPlacement") or {}
    rec(
        "R11a agent launch placement",
        r["exit"] == 0 and sp.get("source") in ("named", "same-group", "scratch"),
        f"exit={r['exit']} placement={sp} wt={d.get('worktreeId')}",
    )
    close_handle(HOST_B, (d.get("outcome") or {}).get("handle"))
    r = orca(
        [
            "orchestration",
            "worker-start",
            "--host",
            HOST_B,
            "--agent",
            "claude",
            "--spec",
            "echo R11B_OK",
            "--json",
        ]
    )
    d = j(r).get("result") or {}
    rec(
        "R11b worker-start remote",
        r["exit"] == 0 and d.get("state") == "ready",
        f"exit={r['exit']} state={d.get('state')} lastError={d.get('lastError')}",
    )
    if d.get("dispatchId"):
        orca(["orchestration", "worker-stop", "--host", HOST_B, "--dispatch", d["dispatchId"]])
    r = orca(
        [
            "agent",
            "launch",
            "--host",
            HOST_A,
            "--agent",
            "claude",
            "--prompt",
            "RUN: echo R11C_OK",
            "--json",
        ]
    )
    d = j(r).get("result") or {}
    rec(
        "R11c reverse agent launch",
        r["exit"] == 0,
        f"exit={r['exit']} placement={d.get('sessionPlacement')} wt={d.get('worktreeId')}",
    )
    close_handle(HOST_A, (d.get("outcome") or {}).get("handle"))

if want("R12"):
    ids = []
    for _ in range(2):
        r = orca(["terminal", "create", "--host", HOST_A, "--json"])
        t = (j(r).get("result") or {}).get("terminal") or {}
        ids.append(t.get("worktreeId"))
        close_handle(HOST_A, t.get("handle"))
    rec(
        "R12a two scratch launches same folder id",
        bool(ids[0]) and ids[0] == ids[1] and str(ids[0]).startswith("folder:"),
        f"ids={ids}",
    )
    folders = host_inv(HOST_A).get("folderWorkspaces") or []
    rec(
        "R12b scratch listed in folderWorkspaces",
        any(f.get("selector") == ids[0] for f in folders if isinstance(f, dict)),
        f"folderWorkspaces={folders}",
    )
    r = orca(["terminal", "create", "--host", HOST_A, "--worktree", str(ids[0]), "--json"])
    t = (j(r).get("result") or {}).get("terminal") or {}
    rec(
        "R12c folder:<id> resolves",
        r["exit"] == 0 and t.get("worktreeId") == ids[0],
        f"exit={r['exit']} wt={t.get('worktreeId')}",
    )
    close_handle(HOST_A, t.get("handle"))

if want("R13"):
    folders = [
        f
        for f in (host_inv(HOST_B).get("folderWorkspaces") or [])
        if isinstance(f, dict) and str(f.get("path") or "").endswith("orca-orchestration")
    ]
    sel = folders[0]["selector"] if folders else "current"
    r = orca(
        [
            "orchestration",
            "worker-start",
            "--host",
            HOST_B,
            "--worktree",
            sel,
            "--agent",
            "claude",
            "--spec",
            "echo R13_RUNNING",
            "--json",
        ]
    )
    d = j(r).get("result") or {}
    disp = d.get("dispatchId")
    rec(
        "R13a worker-start in scratch",
        r["exit"] == 0 and d.get("state") == "ready",
        f"exit={r['exit']} state={d.get('state')} err={d.get('lastError')}",
    )
    r = orca(["orchestration", "worker-stop", "--host", HOST_B, "--dispatch", str(disp or "")])
    rs = orca(["orchestration", "worker-show", "--host", HOST_B, "--dispatch", str(disp or "")])
    st = (re.findall(r"state=(\w+)", rs["out"]) or ["?"])[0]
    rec(
        "R13b worker-stop settles",
        r["exit"] == 0 and st in ("stopped", "succeeded", "failed", "abandoned") and "stop_unknown" not in rs["out"],
        f"stop_exit={r['exit']} state={st}",
    )

if want("R14"):
    r = orca(
        [
            "agent",
            "launch",
            "--host",
            HOST_B,
            "--agent",
            "codex",
            "--model",
            "gpt-6.2-luna",
            "--prompt",
            "RUN: echo hi",
            "--json",
        ]
    )
    rec(
        "R14a agent launch bad model gpt-6.2-luna exits non-zero",
        r["exit"] != 0 and "working" not in r["out"].lower(),
        f"exit={r['exit']} out={r['out'][-250:]}",
    )
    r = orca(
        [
            "orchestration",
            "worker-start",
            "--host",
            HOST_B,
            "--agent",
            "codex",
            "--model",
            "gpt-6.2-luna",
            "--spec",
            "echo hi",
            "--json",
        ]
    )
    d = j(r).get("result") or {}
    rec(
        "R14b worker-start bad model gpt-6.2-luna exits non-zero, never working",
        r["exit"] != 0 and d.get("state") != "ready",
        f"exit={r['exit']} state={d.get('state')} err={d.get('lastError') or r['out'][-200:]}",
    )
    if d.get("dispatchId"):
        orca(["orchestration", "worker-stop", "--host", HOST_B, "--dispatch", d["dispatchId"]])

if want("R15"):
    listed = orca(["host", "list"])
    rec("R15 host list", listed["exit"] == 0, listed["out"][-400:])
    names = [HOST_A, HOST_B]
    for row in inventory_hosts():
        for alias in [row.get("name"), *(row.get("aliases") or []), row.get("label")]:
            if isinstance(alias, str) and re.fullmatch(r"\d+\.\d+\.\d+\.\d+", alias):
                names.append(alias)
    for name in names:
        r = orca(["terminal", "create", "--host", name, "--json"])
        t = (j(r).get("result") or {}).get("terminal") or {}
        rec(
            f"R15 desktop --host {name} resolves (no Ambiguous)",
            r["exit"] == 0 and "mbiguous" not in r["out"],
            f"exit={r['exit']} wt={t.get('worktreeId')} out={r['out'][-200:] if r['exit'] else ''}",
        )
        if t.get("handle"):
            orca(["terminal", "close", "--host", name, "--terminal", t["handle"]])

if coord:
    orca(["terminal", "close", "--terminal", coord])

payload = {"results": RES, "log": LOG}
(OUT / "r08-live.json").write_text(json.dumps(payload, indent=1))
print(json.dumps({k: v["pass"] for k, v in RES.items()}))
