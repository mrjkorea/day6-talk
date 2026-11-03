#!/usr/bin/env python3
"""Fail if any MISMATCH unit in mismatches audit lacks PDF student lines in day6-qa.json."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MISMATCHES = ROOT / "docs" / "mismatches.json"
QA = ROOT / "data" / "day6-qa.json"


def norm(text: str) -> str:
    t = (text or "").lower().strip()
    t = re.sub(r"\s+", " ", t)
    return t.rstrip(".,!?;:")


def main() -> int:
    if not MISMATCHES.exists():
        print("skip: docs/mismatches.json not found")
        return 0
    with MISMATCHES.open() as f:
        mismatches = json.load(f)
    with QA.open() as f:
        qa = json.load(f)

    fails = []
    for mu in mismatches:
        if mu.get("status") != "MISMATCH":
            continue
        lv = next((l for l in qa["levels"] if l["level"] == mu["program_level"]), None)
        if not lv:
            fails.append(f"{mu['deeplink']}: missing level")
            continue
        unit = next(
            (u for u in lv["units"] if int(u["unit"]) == int(mu["unit"])), None
        )
        if not unit:
            fails.append(f"{mu['deeplink']}: missing unit")
            continue
        prog = {norm(p.get("student") or "") for p in unit.get("pairs") or []}
        for pdf_line in mu.get("pdf_items") or []:
            if norm(pdf_line) not in prog:
                fails.append(f"{mu['deeplink']}: missing PDF line {pdf_line!r}")

    if fails:
        for line in fails:
            print("FAIL:", line)
        return 1
    print(f"ok: {sum(1 for m in mismatches if m.get('status')=='MISMATCH')} units")
    return 0


if __name__ == "__main__":
    sys.exit(main())
