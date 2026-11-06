"""Build strategy prompts shaped exactly like aiEngine.strategicPrompt, for the v2 retention set.

  python -I gen_retention.py data/strategy_source.json data/retention_prompts.json [--n 640]

The source is the app's own dump (dump_strategy_prompts.mjs): live machines and the
prompt's fixed lines in English and pt-BR. Each prompt varies the telemetry with the
cases the browser strategy check uses (one fault, a fault without a status, two
anomalies, opaque ids) plus healthy plants, so the retention answers cover the
behaviour the strategy check scores. The ten browser check cases themselves are not
generated here: they are built from the live plant at check time.
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path


def js(value) -> str:
    """JSON.stringify: no spaces, integral floats printed as integers."""

    def norm(v):
        if isinstance(v, float) and v.is_integer():
            return int(v)
        if isinstance(v, dict):
            return {k: norm(x) for k, x in v.items()}
        if isinstance(v, list):
            return [norm(x) for x in v]
        return v

    return json.dumps(norm(value), separators=(",", ":"), ensure_ascii=False)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("out")
    parser.add_argument("--n", type=int, default=640)
    parser.add_argument("--seed", type=int, default=20261103)
    args = parser.parse_args()
    source = json.loads(Path(args.source).read_text())
    rng = random.Random(args.seed)

    fixed = {}
    for lang, data in source.items():
        lines = data["prompt"].split("\n")
        # Everything before "Plant period:" is fixed text (pt-BR adds its language line).
        cut = next(i for i, line in enumerate(lines) if line.startswith("Plant period:"))
        fixed[lang] = lines[:cut]
    machines = source["en"]["machines"]
    base_metrics = source["en"]["metrics"]
    people_rule = (
        "People come first: never plan on extra minutes or cover nobody has agreed to, "
        "and protect recovery time that is owed before chasing throughput."
    )

    def healthy(m):
        live = m["metrics"]
        return {
            "id": m["id"],
            "status": "running",
            "load": round(rng.uniform(55, 90), rng.choice([1, 2, 13])),
            "temperature": live["temperature"] + rng.uniform(-3, 3),
            "vibration": max(0.2, live["vibration"] * rng.uniform(0.7, 1.3)),
            "wear": round(rng.uniform(0, 60), 2),
        }

    def fault(row, severe=True, status=None):
        peak = 3 if severe else 1.6
        return {
            **row,
            "status": status or rng.choice(["warning", "critical"] if severe else ["warning"]),
            "wear": round(rng.uniform(88, 98) if severe else rng.uniform(72, 82), 2),
            "vibration": row["vibration"] * peak * rng.uniform(1.4, 2.2),
            "temperature": row["temperature"] + (rng.uniform(14, 24) if severe else rng.uniform(6, 10)),
        }

    prompts = []
    for i in range(args.n):
        lang = "pt-BR" if rng.random() < 0.25 else "en"
        rows = [healthy(m) for m in machines]
        kind = rng.choices(
            ["planted", "no-status", "two-anomalies", "opaque-ids", "healthy"], [0.35, 0.15, 0.15, 0.1, 0.25]
        )[0]
        idx = rng.randrange(len(rows))
        if kind in ("planted", "opaque-ids"):
            rows[idx] = fault(rows[idx])
        elif kind == "no-status":
            rows[idx] = fault(rows[idx], status="running")
        elif kind == "two-anomalies":
            other = rng.choice([j for j in range(len(rows)) if j != idx])
            rows[other] = fault(rows[other], severe=False)
            rows[idx] = fault(rows[idx])
        if kind == "opaque-ids":
            names = {r["id"]: f"unit-{n + 1:02d}" for n, r in enumerate(reversed(rows))}
            rows = [{**r, "id": names[r["id"]]} for r in rows]
        metrics = {
            "efficiency": rng.choice([100, round(rng.uniform(70, 100), 1)]),
            "uptime": rng.choice([100, round(rng.uniform(80, 100), 1)]),
            "quality": round(rng.uniform(92, 100), 1),
            "throughput": rng.randint(0, 340),
        }
        keys = list(base_metrics)
        rng.shuffle(keys) if rng.random() < 0.2 else None
        metrics = {k: metrics.get(k, base_metrics[k]) for k in keys}
        lines = list(fixed[lang])
        if rng.random() < 0.2:
            people = {
                "peopleOnShift": rng.randint(3, 9),
                "extraMinutesWorked": rng.choice([0, 0, rng.randint(5, 60)]),
                "restMinutesTaken": rng.randint(0, 45),
                "recoveryMinutesOwed": rng.choice([0, rng.randint(5, 30)]),
                "coverInProgress": rng.random() < 0.3,
                "openObjections": rng.choice([0, 0, 1, 2]),
                "refusalsRespected": rng.randint(0, 3),
            }
            # People lines come before the language line, as strategicPrompt orders them.
            at = 3
            lines[at:at] = [people_rule, f"People on shift (team totals only): {js(people)}."]
        lines += [
            f"Plant period: {rng.choice(['morning', 'afternoon', 'night'])}. "
            f"Weather: {rng.choice(['clear', 'cloudy', 'rain', 'storm'])}.",
            f"Production: {js(metrics)}.",
            f"Equipment telemetry: {js(rows)}.",
        ]
        want = rows[idx]["id"] if kind != "healthy" else None
        prompts.append({"id": f"ret-{i:04d}", "kind": kind, "lang": lang, "want": want, "prompt": "\n".join(lines)})
    Path(args.out).write_text(json.dumps(prompts, ensure_ascii=False, indent=1))
    print(len(prompts), "prompts")


if __name__ == "__main__":
    main()
