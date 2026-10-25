#!/usr/bin/env python3
"""
Claude Code Pre-Tool-Use Security Hook (Bounty #3 Reference Solution)
Author: Con Chim Xanh AI (https://github.com/ConChimXanh-AI)

Intercepts destructive shell/SQL commands before execution, logs blocked
attempts to ~/.claude/hooks/blocked.log, and returns a structured rejection reason.
"""

import json
import os
import re
import sys
from datetime import datetime, timezone

BLOCKED_PATTERNS = [
    (re.compile(r"\brm\s+-[a-zA-Z]*r[a-zA-Z]*f\b|\brm\s+-[a-zA-Z]*f[a-zA-Z]*r\b", re.IGNORECASE),
     "Blocked destructive recursive forced deletion (rm -rf)."),
    (re.compile(r"\bDROP\s+TABLE\b", re.IGNORECASE),
     "Blocked destructive SQL statement (DROP TABLE)."),
    (re.compile(r"\bgit\s+push\b.*?(?:--force|-f)\b", re.IGNORECASE),
     "Blocked destructive force push (git push --force). Use --force-with-lease or safe branch PR."),
    (re.compile(r"\bTRUNCATE\b\s+(?:TABLE\s+)?\w+", re.IGNORECASE),
     "Blocked destructive table truncation (TRUNCATE)."),
    (re.compile(r"\bDELETE\s+FROM\s+[\w.\"\x60\[\]]+\s*(?:;|$)", re.IGNORECASE),
     "Blocked unqualified DELETE FROM without a WHERE clause.")
]

def log_blocked_command(command: str, cwd: str, reason: str) -> None:
    log_dir = os.path.expanduser("~/.claude/hooks")
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, "blocked.log")
    ts = datetime.now(timezone.utc).isoformat()
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(f"[{ts}] CWD={cwd} | CMD={command!r} | REASON={reason}\n")

def inspect_command(command: str, cwd: str = ".") -> dict:
    for regex, reason in BLOCKED_PATTERNS:
        if regex.search(command):
            log_blocked_command(command, cwd, reason)
            return {"decision": "block", "reason": f"[CCX Security Hook] {reason}"}
    return {"decision": "allow"}

def main() -> int:
    raw = sys.stdin.read().strip()
    if not raw:
        return 0
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        payload = {"tool_input": {"command": raw}}

    tool_input = payload.get("tool_input") or {}
    cmd = tool_input.get("command") or payload.get("command") or ""
    cwd = payload.get("cwd") or os.getcwd()

    result = inspect_command(cmd, cwd)
    if result["decision"] == "block":
        print(json.dumps(result))
        sys.stderr.write(result["reason"] + "\n")
        return 2
    return 0

if __name__ == "__main__":
    sys.exit(main())
