"""Read a temperature run's stored answers: the formulaic-priorities share and a side-by-side sample.

  python3 temperature_read.py runs/browser-...-temperature-2.json

For each arm, a priority (lowercased, whitespace collapsed) counts as formulaic when the
same text appears in an answer to a different case (a different kind or faulted machine).
The share is formulaic priorities over all priorities in that arm. The sample prints the
first 12 answers per arm in case order, so the two arms read side by side on the same cases.
"""
import json
import re
import sys
from collections import defaultdict


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def main(path: str) -> None:
    rows = json.load(open(path))["strategic"]
    key = "arm" if "arm" in rows[0] else "temperature"
    temps = sorted({r[key] for r in rows}, key=str, reverse=True)
    for t in temps:
        arm = [r for r in rows if r[key] == t and r.get("answer")]
        cases_by_priority = defaultdict(set)
        for r in arm:
            for p in r["answer"].get("priorities") or []:
                cases_by_priority[norm(p)].add((r["kind"], r["want"]))
        total = sum(len(r["answer"].get("priorities") or []) for r in arm)
        formulaic = sum(
            1 for r in arm for p in r["answer"].get("priorities") or [] if len(cases_by_priority[norm(p)]) > 1
        )
        distinct = len(cases_by_priority)
        print(f"T={t}: answers {len(arm)}, priorities {total}, distinct {distinct}, "
              f"formulaic share {formulaic / max(total, 1):.3f}")
        for p, cases in sorted(cases_by_priority.items(), key=lambda kv: -len(kv[1]))[:5]:
            if len(cases) > 1:
                print(f"   shared by {len(cases)} cases: {p[:110]}")
    print()
    by_case = defaultdict(dict)
    for r in rows:
        if r.get("answer"):
            by_case[(r["kind"], r["want"])].setdefault(r[key], r["answer"])
    for (kind, want), answers in list(by_case.items())[:12]:
        print(f"== {kind} / {want}")
        for t in temps:
            a = answers.get(t)
            if a:
                print(f"  T={t} focus={a.get('focusMachine')}")
                for p in a.get("priorities") or []:
                    print(f"     - {p[:150]}")
                print(f"     reasoning: {(a.get('reasoning') or '')[:220]}")


if __name__ == "__main__":
    main(sys.argv[1])
