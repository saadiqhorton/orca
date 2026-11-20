#!/usr/bin/env python3
"""Cook harness: run ONE natural-language scenario with a fresh agent on the source host and collect evidence.

Runs ON the source host (needs the orca CLI and python3, stdlib only). Writes <out>.json and <out>.md.

  live agent : orca agent launch --agent <claude|codex> --surface terminal --prompt "<scenario text only>"
  scripted   : no LLM; runs a fixed known-good command path (rig baseline / product-feasibility check)

Never answers a trust/hooks dialog. Never sends keystrokes to an agent pane.
"""
import argparse, glob, json, os, re, shlex, subprocess, sys, time

def _orca_bin():
    env = os.environ.get("ORCA_BIN")
    if env:
        return env
    for p in (os.path.expanduser("~/.orca/cli/bin/orca"), os.path.expanduser("~/.local/bin/orca"), "/root/.orca/cli/bin/orca"):
        try:
            if os.path.exists(p):
                return p
        except OSError:
            continue
    return "orca"


ORCA = _orca_bin()
ERROR_CODES = ["selector_not_found", "terminal_handle_stale", "host_unknown", "Unknown host", "unknown_host", "terminal_not_found",
               "dispatch_not_found", "dispatch_inactive", "agent_unconfigured", "agent_readiness", "agent_prompt_blocked",
               "worker_never_started", "no_active_sender_terminal", "invalid_argument", "timeout", "incompatible_runtime",
               "not connected to the desktop app", "unreachable", "start_failed"]
# unknown_host / "Unknown host" is the S08 refusal, not a routing accident.
WRONG_HOST = ["selector_not_found", "terminal_handle_stale", "terminal_not_found", "dispatch_not_found"]
REFUSAL_CODES = ("unknown_host", "host_unknown", "Unknown host")
DIALOG_REASONS = ["agent-hooks-review-prompt", "agent-trust-workspace", "agent-prompt", "trust", "hooks"]
SECRET_RE = re.compile(r"(?:sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|xox[bp]-[A-Za-z0-9-]{20,}|\b[A-Za-z0-9_\-]{32,}\b|(?:token|password|secret)\s*[:=]?\s*\S{12,})", re.I)
ORCA_INVOKE_RE = re.compile(r"(?:^|[\s;&|(`$])(?:[\w./~-]*/)?orca\s+(?=[a-z])")


def now():
    return time.time()


def orca(args, env=None, timeout=120):
    t = now()
    try:
        p = subprocess.run([ORCA] + args, capture_output=True, text=True, timeout=timeout, env=env)
        out, rc = (p.stdout or "") + (p.stderr or ""), p.returncode
    except subprocess.TimeoutExpired as e:
        out, rc = (e.stdout or b"").decode(errors="ignore") if isinstance(e.stdout, bytes) else (e.stdout or ""), 124
    return {"cmd": "orca " + " ".join(shlex.quote(a) for a in args), "exit": rc, "secs": round(now() - t, 1), "out": out}


def jparse(s):
    try:
        i = s.index("{")
        return json.loads(s[i:])
    except Exception:
        return None


def terminals_on(host):
    """{handle: {title, tabId, group, worktree}} on host via the hub (text layout gives the group)."""
    if not host:
        return {}, None
    r = orca(["terminal", "list", "--host", host, "--json"], timeout=40)
    j = jparse(r["out"]) or {}
    terms = {}
    for t in (j.get("result") or {}).get("terminals") or []:
        terms[t["handle"]] = {"title": t.get("title"), "tabId": t.get("tabId"), "worktree": t.get("worktreePath") or t.get("worktreeId"), "group": None}
    txt = orca(["terminal", "list", "--host", host], timeout=40)["out"]
    group = None
    for line in txt.splitlines():
        m = re.match(r"\s*group (\S+)", line)
        if m:
            group = m.group(1)
        m = re.search(r"\*\s+(term_[0-9a-f-]+)", line)
        if m and m.group(1) in terms:
            terms[m.group(1)]["group"] = group
    scope = re.findall(r"^scope: .*$", txt, re.M)
    warn = "not connected to the desktop app" in txt
    return terms, {"scope": scope[-1] if scope else None, "hub_disconnected": warn}


SEEN = {}


def observe(host, before):
    """Record terminals that appear on the target during the run (workers close their tab on stop)."""
    if not host:
        return
    terms, _ = terminals_on(host)
    for h, v in terms.items():
        if h not in before:
            SEEN[h] = v


# ---------- session log readers ----------

def find_codex_rollout(t0, needle):
    best = None
    for f in glob.glob(os.path.expanduser("~/.codex/sessions/**/*.jsonl"), recursive=True):
        try:
            if os.path.getmtime(f) < t0 - 5:
                continue
            with open(f, errors="ignore") as fh:
                if needle[:60] in fh.read():
                    if not best or os.path.getmtime(f) > os.path.getmtime(best):
                        best = f
        except OSError:
            pass
    return best


def parse_codex(path):
    cmds, final, done, msgs = [], "", False, []
    for line in open(path, errors="ignore"):
        try:
            o = json.loads(line)
        except Exception:
            continue
        p = o.get("payload") or {}
        if o.get("type") == "event_msg" and p.get("type") == "item_completed":
            it = p.get("item") or {}
            if it.get("type") == "CommandExecution":
                c = it.get("command") or []
                d = it.get("duration") or {}
                cmds.append({"cmd": c[-1] if c else "", "exit": it.get("exit_code"), "secs": round(d.get("secs", 0) + d.get("nanos", 0) / 1e9, 1),
                             "out": (it.get("aggregated_output") or "")[:4000], "ts": o.get("timestamp", "")})
        if o.get("type") == "event_msg" and p.get("type") == "task_complete":
            done = True
        if o.get("type") == "response_item" and p.get("type") == "message" and p.get("role") == "assistant":
            txt = " ".join(x.get("text", "") for x in p.get("content", []) if isinstance(x, dict))
            if txt.strip():
                msgs.append(txt)
                final = txt
    return {"commands": cmds, "final": final, "done": done, "messages": msgs}


def find_claude_log(t0, needle):
    best = None
    for f in glob.glob(os.path.expanduser("~/.claude/projects/**/*.jsonl"), recursive=True):
        try:
            if os.path.getmtime(f) < t0 - 5:
                continue
            with open(f, errors="ignore") as fh:
                if needle[:60] in fh.read():
                    if not best or os.path.getmtime(f) > os.path.getmtime(best):
                        best = f
        except OSError:
            pass
    return best


def parse_claude(path):
    uses, results, msgs, final, done = {}, {}, [], "", False
    order = []
    for line in open(path, errors="ignore"):
        try:
            o = json.loads(line)
        except Exception:
            continue
        m = o.get("message") or {}
        content = m.get("content")
        if o.get("type") == "assistant" and isinstance(content, list):
            texts = []
            for c in content:
                if c.get("type") == "tool_use" and c.get("name") in ("Bash", "bash"):
                    uses[c["id"]] = {"cmd": (c.get("input") or {}).get("command", ""), "ts": o.get("timestamp", "")}
                    order.append(c["id"])
                elif c.get("type") == "text":
                    texts.append(c.get("text", ""))
            if texts and "".join(texts).strip():
                final = "\n".join(texts)
                msgs.append(final)
            done = m.get("stop_reason") == "end_turn"
        elif o.get("type") == "user" and isinstance(content, list):
            for c in content:
                if c.get("type") == "tool_result":
                    body = c.get("content")
                    if isinstance(body, list):
                        body = "\n".join(x.get("text", "") for x in body if isinstance(x, dict))
                    results[c.get("tool_use_id")] = {"out": str(body)[:4000], "is_error": bool(c.get("is_error"))}
            done = False
    cmds = []
    for i in order:
        r = results.get(i, {})
        out = r.get("out", "")
        m = re.search(r"Exit code (\d+)", out)
        cmds.append({"cmd": uses[i]["cmd"], "exit": int(m.group(1)) if m else (1 if r.get("is_error") else (0 if r else None)),
                     "secs": None, "out": out, "ts": uses[i]["ts"]})
    return {"commands": cmds, "final": final, "done": done, "messages": msgs}


# ---------- analysis ----------

def analyse(cmds, final, prompt_text):
    orca_cmds = [c for c in cmds if ORCA_INVOKE_RE.search(" " + c["cmd"])]
    n_orca = sum(len(ORCA_INVOKE_RE.findall(" " + c["cmd"])) for c in orca_cmds)
    errors, wrong_host, secrets, keystrokes, hangs, ssh = [], [], [], [], [], []
    for c in cmds:
        out = c.get("out") or ""
        for code in ERROR_CODES:
            if code in out and (c.get("exit") not in (0, None) or re.search(r'"ok":\s*false|^error:', out, re.M)):
                errors.append({"cmd": c["cmd"][:300], "code": code, "exit": c.get("exit")})
                if code in WRONG_HOST:
                    wrong_host.append({"cmd": c["cmd"][:300], "code": code})
                break
        s = c["cmd"]
        for flag in ("--prompt", "--spec", "--body", "--text", "--question"):
            for m in re.finditer(re.escape(flag) + r"\s+(\"[^\"]*\"|'[^']*'|\S+)", s):
                val = m.group(1)
                if SECRET_RE.search(val) and not re.fullmatch(r"[\"']?(term_|ctx_|dispatch:)[\w:-]+[\"']?", val):
                    secrets.append({"cmd": s[:200], "flag": flag})
        if re.search(r"terminal\s+send", s) and (re.search(r"\\x1b|\\e\[|\$'\\x", s) or re.search(r"--text\s+(''|\"\")", s)):
            keystrokes.append({"cmd": s[:300]})
        if (c.get("secs") or 0) > 60:
            hangs.append({"cmd": s[:200], "secs": c["secs"]})
        if re.search(r"(^|[\s;&|])ssh\s", s):
            ssh.append(s[:200])
    return {"orca_invocations": n_orca, "orca_command_execs": len(orca_cmds), "all_execs": len(cmds), "errors": errors,
            "wrong_host_errors": wrong_host, "secrets_in_prompts": secrets, "keystroke_sends": keystrokes,
            "hangs_over_60s": hangs, "ssh_used": ssh}


def desktop_listed_workspaces(inv):
    listed = set()
    hosts = (inv or {}).get("hosts") or (inv or {}).get("result", {}).get("hosts") or []
    for host in hosts if isinstance(hosts, list) else []:
        if not isinstance(host, dict):
            continue
        body = host.get("inventory") if isinstance(host.get("inventory"), dict) else host
        for repo in body.get("repos") or []:
            if not isinstance(repo, dict):
                continue
            for key in ("path", "selector", "id", "name"):
                if repo.get(key):
                    listed.add(str(repo[key]))
            if repo.get("id"):
                listed.add("id:" + str(repo["id"]))
        for folder in body.get("folderWorkspaces") or []:
            if not isinstance(folder, dict):
                continue
            for key in ("path", "selector", "id", "name"):
                if folder.get(key):
                    listed.add(str(folder[key]))
            if folder.get("id"):
                listed.add("folder:" + str(folder["id"]))
    return listed


def worktree_is_listed(worktree, listed):
    wt = str(worktree or "")
    if not wt or not listed:
        return False
    if wt in listed:
        return True
    return any(token and (token in wt or wt in token) for token in listed)


def tab_is_visible(tab, listed=None):
    group = str(tab.get("group") or "")
    if group.startswith("headless"):
        return False
    if tab.get("tabId"):
        return True
    return worktree_is_listed(tab.get("worktree"), listed)


def host_inventory():
    r = orca(["host", "inventory", "--json"], timeout=40)
    return jparse(r["out"]) or {}


def judge(spec, facts, final, cmds, metrics, wall, new_target_terms, listed=None):
    s = spec.get("success", {})
    fin = final or ""
    reasons = []
    ok = True
    def sub(x):
        for k, v in facts.items():
            x = x.replace("{" + k + "}", v)
        return x
    if "final_contains_any" in s:
        vals = [sub(v) for v in s["final_contains_any"]]
        if not any(v.lower() in fin.lower() for v in vals):
            ok = False; reasons.append("final answer lacks any of %s" % vals)
    if "final_contains_all" in s:
        for v in s["final_contains_all"]:
            if sub(v).lower() not in fin.lower():
                ok = False; reasons.append("final answer lacks %s" % sub(v))
    if "final_regex" in s and not re.search(s["final_regex"], fin, re.I):
        ok = False; reasons.append("final answer does not match /%s/" % s["final_regex"])
    allcmd = "\n".join(c["cmd"] + "\n" + (c.get("out") or "") for c in cmds)
    for rx in s.get("commands_regex_all", []):
        if not re.search(rx, allcmd):
            ok = False; reasons.append("no command/output matching /%s/" % rx)
    if s.get("max_wall_s") and wall > s["max_wall_s"]:
        ok = False; reasons.append("wall %.0fs > %ss" % (wall, s["max_wall_s"]))
    if metrics["keystroke_sends"]:
        ok = False; reasons.append("sent raw keystrokes to a terminal")
    if metrics["secrets_in_prompts"]:
        ok = False; reasons.append("secret-looking value in a prompt")
    all_out = fin + "\n" + allcmd
    if s.get("refuse_local"):
        refused = any(code in all_out for code in REFUSAL_CODES) or bool(re.search(s.get("final_regex") or "unknown_host", all_out, re.I))
        no_tab = not new_target_terms
        if refused and no_tab:
            ok = True
            reasons = [r for r in reasons if "final answer" not in r]
            metrics["wrong_host_errors"] = [w for w in metrics["wrong_host_errors"] if w.get("code") not in REFUSAL_CODES]
        elif not no_tab:
            ok = False
            reasons.append("unknown host created a tab")
    visible_tab = None
    if spec.get("expect_tab"):
        visible_tab = any(tab_is_visible(t, listed) for t in new_target_terms.values())
        if not visible_tab:
            ok = False
            reasons.append("target tab is missing or headless")
    bar = {"result": ok,
           "le_6_orca_cmds": metrics["orca_invocations"] <= 6,
           "zero_wrong_host": not metrics["wrong_host_errors"],
           "no_hang": not metrics["hangs_over_60s"],
           "no_ssh": not metrics["ssh_used"],
           "visible_tab": visible_tab}
    return ok, reasons, bar


# ---------- scripted reference paths (no LLM) ----------

def scripted(sid, spec, facts, env, title, before=None):
    T = spec.get("target")
    before = before or {}
    log = []
    caller = env.get("ORCA_TERMINAL_HANDLE")
    from_args = ["--from", caller] if caller else []
    def run(a, **kw):
        r = orca(a, env=env, **kw); log.append(r); return r
    def wait_worker(d, secs=150):
        end = now() + secs
        while now() < end:
            r = orca(["orchestration", "worker-show", "--host", T, "--dispatch", d], env=env)
            if re.search(r"state=(succeeded|failed|stopped|abandoned)", r["out"]):
                log.append(r); return r
            time.sleep(5)
        log.append(r); return r
    final = ""
    agent = facts.get("target_agent", "claude")
    stub = facts.get("stub") == "1"   # rig stub agent runs shell lines, never sends worker_done
    SP = {"host": "echo HOSTNAME_IS: $(hostname)" if stub else "Run hostname and report its exact output in worker_done. Do nothing else.",
          "ls": "ls -A ~" if stub else "List the files in my home folder (ls -A ~) and report the list in worker_done.",
          "wait": "echo waiting-for-coordinator" if stub else "Do not run anything yet. End your turn now and wait for one message from the coordinator, then follow it.",
          "node": "RUN: node --version" if stub else "What version of node is installed? Run node --version and tell me."}
    if stub:
        _ww = wait_worker
        def wait_worker(d, secs=20):
            time.sleep(secs); r = orca(["orchestration", "worker-show", "--host", T, "--dispatch", d], env=env); log.append(r); return r
    if sid == "S06":
        r = run(["host", "inventory"]); final = r["out"]
    elif sid in ("S01", "S07"):
        r = run(["orchestration", "worker-start", "--host", T, "--agent", agent, "--spec", SP["host"]] + from_args)
        d = (re.findall(r"ctx_[0-9a-f]+", r["out"]) or [""])[0]
        if d:
            observe(T, before)
            wait_worker(d); rr = run(["orchestration", "worker-read", "--host", T, "--dispatch", d]); final = rr["out"][-3000:]
            run(["orchestration", "worker-stop", "--host", T, "--dispatch", d])
        else:
            final = r["out"]
    elif sid == "S02":
        r = run(["terminal", "create", "--host", T, "--title", title + "-uptime", "--json"])
        h = ((jparse(r["out"]) or {}).get("result") or {}).get("terminal", {}).get("handle") or (re.findall(r"term_[0-9a-f-]+", r["out"]) or [""])[0]
        if h:
            run(["terminal", "send", "--host", T, "--terminal", h, "--text", "uptime", "--enter"]); time.sleep(3)
            final = run(["terminal", "read", "--host", T, "--terminal", h])["out"][-1500:]
    elif sid == "S03":
        r = run(["orchestration", "worker-start", "--host", T, "--agent", agent, "--spec", SP["ls"]] + from_args)
        d = (re.findall(r"ctx_[0-9a-f]+", r["out"]) or [""])[0]
        if d:
            observe(T, before)
            wait_worker(d); final = run(["orchestration", "worker-read", "--host", T, "--dispatch", d])["out"][-3000:]
            run(["orchestration", "worker-stop", "--host", T, "--dispatch", d])
    elif sid == "S04":
        r = run(["agent", "launch", "--host", T, "--agent", "codex", "--prompt", SP["node"], "--json"])
        h = (re.findall(r"term_[0-9a-f-]+", r["out"]) or [""])[0]
        time.sleep(15)
        if h:
            s = run(["terminal", "show", "--host", T, "--terminal", h, "--json"])
            final = s["out"][-2000:] + "\n" + run(["terminal", "read", "--host", T, "--terminal", h])["out"][-1500:]
    elif sid == "S05":
        r = run(["orchestration", "worker-start", "--host", T, "--agent", agent, "--spec", SP["wait"]] + from_args)
        d = (re.findall(r"ctx_[0-9a-f]+", r["out"]) or [""])[0]
        if d:
            observe(T, before)
            time.sleep(15)
            run(["orchestration", "send", "--host", T, "--to", d, "--subject", "date", "--body", ("RUN: date" if stub else "What is the date today? Run date and reply with its output.")] + from_args)
            time.sleep(15)
            rr = run(["orchestration", "worker-read", "--host", T, "--dispatch", d])
            wt = (re.findall(r"terminal=(term_[0-9a-f-]+)", r["out"]) or [""])[0]
            tail = run(["terminal", "read", "--host", T, "--terminal", wt])["out"] if wt else ""
            final = rr["out"][-1500:] + "\n--- worker pane tail ---\n" + tail[-1500:]
            run(["orchestration", "worker-stop", "--host", T, "--dispatch", d])
    elif sid == "S08":
        r = run(["agent", "launch", "--host", T, "--agent", "claude", "--prompt", "hello", "--json"], timeout=150); final = r["out"]
    elif sid == "R10":
        r = run(["terminal", "create", "--host", T, "--worktree", 'group:"dockhand group"', "--json"])
        final = r["out"]
    elif sid == "R11":
        r = run(["agent", "launch", "--host", T, "--agent", "claude", "--prompt", "print hostname", "--json"])
        final = r["out"]
    elif sid == "R12":
        r1 = run(["terminal", "create", "--host", T, "--json"])
        r2 = run(["terminal", "create", "--host", T, "--json"])
        inv = run(["host", "inventory", "--json"])
        final = r1["out"] + "\n" + r2["out"] + "\n" + inv["out"]
    elif sid == "R13":
        r = run(["orchestration", "worker-start", "--help"]); final = r["out"]
    elif sid == "R14":
        r = run(["agent", "launch", "--help"]); final = r["out"]
    elif sid == "R15":
        r = run(["terminal", "create", "--host", T or "dockhand", "--json"]); final = r["out"]
    cmds = [{"cmd": x["cmd"], "exit": x["exit"], "secs": x["secs"], "out": x["out"][:4000], "ts": ""} for x in log]
    return {"commands": cmds, "final": final, "done": True, "messages": [final]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenario", required=True)
    ap.add_argument("--scenarios-file", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "scenarios.json"))
    ap.add_argument("--agent", default="claude", help="claude | codex | scripted")
    ap.add_argument("--worktree", default=None, help="source workspace selector, e.g. path:/root")
    ap.add_argument("--round", default="r00")
    ap.add_argument("--env-name", default="rig")
    ap.add_argument("--timeout", type=int, default=420)
    ap.add_argument("--fact", action="append", default=[], help="key=value used in success checks, e.g. target_hostname=hostB-ubuntu")
    ap.add_argument("--target-override", default=None)
    ap.add_argument("--keep-target-tabs", action="store_true")
    ap.add_argument("--keep-source-tab", action="store_true")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    spec = json.load(open(a.scenarios_file))[a.scenario]
    if a.target_override:
        spec["target"] = a.target_override
    facts = dict(kv.split("=", 1) for kv in a.fact)
    T = spec.get("target")
    title = "cook-%s-%s" % (a.round, a.scenario)
    res = {"scenario": a.scenario, "text": spec["text"], "env": a.env_name, "round": a.round, "agent": a.agent,
           "source_host": os.uname().nodename, "target": T, "orca_bin": ORCA, "started": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
    before, hub_before = terminals_on(T) if T and spec.get("expect_tab") else ({}, None)
    res["hub_before"] = hub_before
    t0 = now()
    source_handle = None
    blocked = None
    if a.agent == "scripted":
        source_handle = os.environ.get("ORCA_TERMINAL_HANDLE") or None
        create_tries = []
        if a.worktree:
            create_tries.append(["terminal", "create", "--worktree", a.worktree, "--title", title, "--json"])
        create_tries.append(["terminal", "create", "--title", title, "--json"])
        create_tries.append(["terminal", "create", "--worktree", "path:%s" % os.getcwd(), "--title", title, "--json"])
        for args in create_tries:
            cr = orca(args)
            found = (re.findall(r"term_[0-9a-f-]+", cr["out"]) or [None])[0]
            if found:
                source_handle = found
                break
        env = dict(os.environ)
        if source_handle:
            env["ORCA_TERMINAL_HANDLE"] = source_handle
        if a.worktree and a.worktree.startswith("path:") and os.path.isdir(a.worktree[5:]):
            os.chdir(a.worktree[5:])
        sess = scripted(a.scenario, spec, facts, env, title, before)
        res["session_log"] = None
    else:
        args = ["agent", "launch", "--agent", a.agent, "--surface", "terminal", "--prompt", spec["text"], "--json"]
        if a.worktree:
            args[2:2] = ["--worktree", a.worktree]
        lr = orca(args, timeout=90)
        res["launch"] = {"exit": lr["exit"], "out": lr["out"][:2000], "secs": lr["secs"]}
        j = jparse(lr["out"]) or {}
        source_handle = (((j.get("result") or {}).get("outcome") or {}).get("handle")) or (re.findall(r"term_[0-9a-f-]+", lr["out"]) or [None])[0]
        if source_handle:
            orca(["terminal", "rename", "--terminal", source_handle, "--title", title])
        finder, parser = (find_codex_rollout, parse_codex) if a.agent == "codex" else (find_claude_log, parse_claude)
        log, sess, stable_since, last_size = None, None, None, -1
        deadline = t0 + a.timeout
        while now() < deadline:
            time.sleep(8)
            log = log or finder(t0, spec["text"])
            if source_handle:
                sh = jparse(orca(["terminal", "show", "--terminal", source_handle, "--json"], timeout=30)["out"]) or {}
                aw = (((sh.get("result") or {}).get("terminal") or {}).get("agentWait") or {})
                reason = aw.get("reason") or ""
                if reason and any(k in reason for k in DIALOG_REASONS) and (not log or not parser(log)["commands"]):
                    blocked = blocked or {"reason": reason, "since": round(now() - t0)}
                    if now() - t0 > 60:
                        break
            observe(T, before) if T and spec.get("expect_tab") else None
            if log:
                sess = parser(log)
                size = os.path.getsize(log)
                if sess["done"] and size == last_size:
                    stable_since = stable_since or now()
                    if now() - stable_since >= (0 if a.agent == "codex" else 12):
                        break
                else:
                    stable_since = None
                last_size = size
        res["session_log"] = log
        sess = sess or {"commands": [], "final": "", "done": False, "messages": []}
        if source_handle and not sess.get("final"):
            res["source_screen"] = orca(["terminal", "read", "--terminal", source_handle], timeout=30)["out"][-3000:]
    wall = round(now() - t0, 1)
    after, hub_after = terminals_on(T) if T and spec.get("expect_tab") else ({}, None)
    new_terms = {h: v for h, v in after.items() if h not in before}
    for h, v in SEEN.items():
        if h not in new_terms:
            new_terms[h] = dict(v, gone_by_end=True)
    metrics = analyse(sess["commands"], sess["final"], spec["text"])
    listed = desktop_listed_workspaces(host_inventory()) if spec.get("expect_tab") else None
    ok, reasons, bar = judge(spec, facts, sess["final"], sess["commands"], metrics, wall, new_terms, listed)
    if blocked:
        reasons.append("source agent blocked on startup dialog: %s" % blocked["reason"])
    res.update({"wall_s": wall, "completed": bool(sess.get("done")), "timed_out": wall >= a.timeout - 5 and not sess.get("done"),
                "source_blocked": blocked, "source_handle": source_handle, "final_answer": sess["final"], "commands": sess["commands"],
                "metrics": metrics, "new_target_terminals": new_terms, "hub_after": hub_after, "pass": ok and not blocked,
                "fail_reasons": reasons, "bar": bar, "facts": facts})
    # cleanup: never touch terminals that existed before; keep a clearly named demo if asked
    closed = []
    if not a.keep_target_tabs and T:
        for h in [h for h, v in new_terms.items() if not v.get("gone_by_end")]:
            r = orca(["terminal", "close", "--host", T, "--terminal", h], timeout=30); closed.append({"handle": h, "exit": r["exit"]})
    if source_handle and not a.keep_source_tab:
        r = orca(["terminal", "close", "--terminal", source_handle], timeout=30); closed.append({"handle": source_handle, "exit": r["exit"]})
    res["cleanup_closed"] = closed
    json.dump(res, open(a.out + ".json", "w"), indent=1, default=str)
    with open(a.out + ".md", "w") as md:
        md.write("# %s %s (%s, agent=%s)\n\n" % (a.round, a.scenario, a.env_name, a.agent))
        md.write("Prompt given (verbatim, nothing else): %s\n\n" % spec["text"])
        md.write("Result: %s | wall %.0fs | orca invocations %d | errors %d | wrong-host %d\n\n" % (
            "PASS" if res["pass"] else "FAIL", wall, metrics["orca_invocations"], len(metrics["errors"]), len(metrics["wrong_host_errors"])))
        if reasons:
            md.write("Fail reasons: %s\n\n" % "; ".join(reasons))
        md.write("## Commands the agent ran (in order)\n\n")
        for i, c in enumerate(sess["commands"], 1):
            out = (c.get("out") or "").strip()
            md.write("%d. `%s` -> exit %s%s\n" % (i, c["cmd"][:400].replace("`", "'"), c.get("exit"), (" (%ss)" % c["secs"]) if c.get("secs") else ""))
            if out:
                md.write("   ```\n   " + "\n   ".join(out[:1200].splitlines()[:25]) + "\n   ```\n")
        md.write("\n## Agent's final answer to the user\n\n%s\n" % (sess["final"] or "(none)"))
        if res.get("source_screen"):
            md.write("\n## Source agent screen (no final answer captured)\n\n```\n%s\n```\n" % res["source_screen"][-1500:])
        md.write("\n## Tabs created on target\n\n")
        for h, v in new_terms.items():
            md.write("- %s title=%r group=%s tab=%s\n" % (h, v.get("title"), v.get("group"), v.get("tabId")))
    print(json.dumps({"scenario": a.scenario, "pass": res["pass"], "wall_s": wall, "orca": metrics["orca_invocations"],
                      "errors": [e["code"] for e in metrics["errors"]], "reasons": reasons, "bar": bar}))


if __name__ == "__main__":
    main()
