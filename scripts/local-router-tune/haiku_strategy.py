"""Run the severity-line A/B on Claude Haiku 5.5 with the app's own request (runs/prereg-severity-line-haiku.json).

  python -I haiku_strategy.py data/severity_prompts.json runs/haiku-severity.json [--repeats 5]

The request mirrors cloudAIClient.ts for the 'haiku' backend: claude-haiku-5-5,
max_tokens 4096, adaptive thinking, effort high, the prompt as one user message. Arms are
interleaved call by call. Output rows match browser_eval.mjs's strategic rows (arm, kind,
want, parsed, hit, focus, seconds, answer), so severity_score.py's measures apply.
"""

from __future__ import annotations

import argparse
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import anthropic


def parse(text: str) -> dict | None:
    match = re.search(r"\{[\s\S]*\}", text or "")
    if not match:
        return None
    try:
        parsed = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    priorities = [p for p in parsed.get("priorities") or [] if isinstance(p, str) and p.strip()]
    return parsed if priorities else None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("prompts")
    ap.add_argument("out")
    ap.add_argument("--repeats", type=int, default=5)
    ap.add_argument("--workers", type=int, default=6)
    args = ap.parse_args()

    prompts = json.loads(Path(args.prompts).read_text())
    by_case: dict[tuple, dict] = {}
    for p in prompts:
        by_case.setdefault((p["kind"], p["want"]), {})[p["arm"]] = p["prompt"]
    jobs = []
    for r in range(args.repeats):
        for (kind, want), arms in by_case.items():
            order = ["base", "severity"] if r % 2 == 0 else ["severity", "base"]
            jobs += [(r, arm, kind, want, arms[arm]) for arm in order]

    client = anthropic.Anthropic(max_retries=4)
    usage = {"in": 0, "out": 0}

    def call(job):
        r, arm, kind, want, prompt = job
        t0 = time.time()
        try:
            message = client.messages.create(
                model="claude-haiku-5-5",
                max_tokens=4096,
                thinking={"type": "adaptive"},
                output_config={"effort": "high"},
                messages=[{"role": "user", "content": prompt}],
            )
        except anthropic.APIError as error:
            return {"repeat": r, "arm": arm, "kind": kind, "want": want, "parsed": False, "hit": False,
                    "focus": None, "seconds": round(time.time() - t0, 1), "error": repr(error)[:300]}
        text = "".join(b.text for b in message.content if b.type == "text")
        parsed = parse(text)
        usage["in"] += message.usage.input_tokens
        usage["out"] += message.usage.output_tokens
        return {
            "repeat": r, "arm": arm, "kind": kind, "want": want,
            "parsed": bool(parsed), "hit": (parsed or {}).get("focusMachine") == want,
            "focus": (parsed or {}).get("focusMachine"), "seconds": round(time.time() - t0, 1),
            "stop": message.stop_reason, "model": message.model,
            "answer": parsed, "raw": None if parsed else text[:300],
        }

    with ThreadPoolExecutor(args.workers) as pool:
        rows = list(pool.map(call, jobs))
    Path(args.out).write_text(json.dumps({"strategic": rows, "usage": usage}, ensure_ascii=False, indent=1))
    cost = usage["in"] / 1e6 * 0.10 + usage["out"] / 1e6 * 0.50
    print(json.dumps({"calls": len(rows), "errors": sum("error" in r for r in rows), **usage, "usd": round(cost, 4)}))


if __name__ == "__main__":
    main()
