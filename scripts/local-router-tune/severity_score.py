"""Pool the five severity-line blocks and apply runs/prereg-severity-line.json.

  python3 severity_score.py

Reads runs/browser-Qwen3.5-4B-q4f16_1-MLC-lane-healthy-severity-r{1..5}.json, checks every
block carried both arms with the line where assigned, and prints each condition of the rule
with its numbers, then the verdict. The formulaic share uses temperature_read.py's measure
over the pooled answers.
"""
import json
import pathlib
import re
import statistics
from collections import defaultdict

HERE = pathlib.Path(__file__).parent
BLOCKS = [HERE / "runs" / f"browser-Qwen3.5-4B-q4f16_1-MLC-lane-healthy-severity-r{i}.json" for i in range(1, 6)]


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def formulaic(rows: list) -> float:
    cases = defaultdict(set)
    for r in rows:
        for p in (r.get("answer") or {}).get("priorities") or []:
            cases[norm(p)].add((r["kind"], r["want"]))
    total = sum(len((r.get("answer") or {}).get("priorities") or []) for r in rows)
    shared = sum(
        1 for r in rows for p in (r.get("answer") or {}).get("priorities") or [] if len(cases[norm(p)]) > 1
    )
    return shared / max(total, 1)


def main() -> None:
    rows = []
    for path in BLOCKS:
        block = json.loads(path.read_text())["strategic"]
        arms = {r["arm"] for r in block}
        assert arms == {"base", "severity"}, (path.name, arms)
        assert all(r["lineIn"] == (r["arm"] == "severity") for r in block), path.name
        rows += block
    arm = {a: [r for r in rows if r["arm"] == a] for a in ("base", "severity")}
    two = {a: [r for r in arm[a] if r["kind"] == "two-anomalies"] for a in arm}
    other = {a: [r for r in arm[a] if r["kind"] != "two-anomalies"] for a in arm}
    hits = lambda rs: sum(r["hit"] for r in rs)
    parsed = lambda rs: sum(r["parsed"] for r in rs)
    median = {a: statistics.median(r["seconds"] for r in arm[a]) for a in arm}
    share = {a: formulaic(arm[a]) for a in arm}
    for a in arm:
        print(f"{a}: two-anomalies {hits(two[a])}/{len(two[a])}, other {hits(other[a])}/{len(other[a])}, "
              f"parsed {parsed(arm[a])}/{len(arm[a])}, median {median[a]:.1f} s, formulaic {share[a]:.3f}")
    conditions = [
        ("two-anomaly gain >= 5", hits(two["severity"]) - hits(two["base"]) >= 5),
        ("other cases lose <= 1", hits(other["severity"]) >= hits(other["base"]) - 1),
        ("parsed lose <= 1", parsed(arm["severity"]) >= parsed(arm["base"]) - 1),
        ("median <= 1.2x", median["severity"] <= 1.2 * median["base"]),
        ("formulaic <= +0.05", share["severity"] <= share["base"] + 0.05),
    ]
    for name, ok in conditions:
        print(f"  {'PASS' if ok else 'FAIL'}  {name}")
    print("VERDICT:", "adopt the line for the local backend" if all(ok for _, ok in conditions) else "no change")
    print("\nseverity-arm misses:")
    for r in arm["severity"]:
        if not r["hit"]:
            print(f"  {r['kind']} want {r['want']} -> {r['focus']} parsed={r['parsed']}")


if __name__ == "__main__":
    main()
