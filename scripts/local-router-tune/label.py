"""Label notes with Jev 1.14 and Claude Haiku 5.5 on the app's rubric.

  python -I label.py IN.json OUT.json [--workers 8]

Each note gains `jev` ({choice, probabilities} or {error}) and `haiku` ({choice} or
{error}). Notes already labelled in OUT.json are kept, so an interrupted run resumes
without paying twice. Credentials come from the environment (OPENROUTER_API_KEY,
ANTHROPIC_API_KEY) and are never written anywhere.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import anthropic
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import haiku_label, jev_label  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("inp")
    parser.add_argument("out")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--max-cost", type=float, default=2.0, help="stop above this Jev spend (USD)")
    args = parser.parse_args()

    notes = json.loads(Path(args.inp).read_text())
    done: dict[str, dict] = {}
    if Path(args.out).exists():
        done = {n["text"]: n for n in json.loads(Path(args.out).read_text()) if "jev" in n and "haiku" in n}
    key = os.environ["OPENROUTER_API_KEY"]
    client = anthropic.Anthropic(max_retries=4)
    local = threading.local()
    spent = [0.0]
    lock = threading.Lock()

    def work(note: dict) -> dict:
        if note["text"] in done:
            return done[note["text"]]
        if spent[0] > args.max_cost:
            return note
        if not hasattr(local, "session"):
            local.session = requests.Session()
        jev = jev_label(local.session, key, note["text"])
        haiku = haiku_label(client, note["text"])
        with lock:
            spent[0] += jev.get("cost") or 0.0
        return {**note, "jev": jev, "haiku": haiku}

    with ThreadPoolExecutor(args.workers) as pool:
        labelled = list(pool.map(work, notes))
    Path(args.out).write_text(json.dumps(labelled, ensure_ascii=False, indent=1))
    errors = sum(1 for n in labelled if "error" in n.get("jev", {"error": 1}) or "error" in n.get("haiku", {"error": 1}))
    print(f"{len(labelled)} notes, {errors} with a teacher error or unlabelled, Jev spend ${spent[0]:.4f}")


if __name__ == "__main__":
    main()
