"""Drop duplicate training notes and any that resemble a frozen eval note.

  python -I dedupe.py data/train_raw.jsonl data/train_dedup.json

A training note is dropped when its normalised text repeats another, when it shares any
run of 7 words with an eval note, or when its word-trigram Jaccard similarity with an
eval note exceeds 0.45. The report lists every eval-overlap drop so the threshold can
be audited.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EVAL_FILES = ["cases.json", "heldout.json", "production.json", "test2.json", "test3.json"]


def words(text: str) -> list[str]:
    return re.findall(r"[\wÀ-ÿ%.,]+", text.lower())


def grams(tokens: list[str], n: int) -> set[tuple[str, ...]]:
    return {tuple(tokens[i : i + n]) for i in range(len(tokens) - n + 1)}


def main(inp: str, out: str) -> None:
    raw = [json.loads(line) for line in Path(inp).read_text().splitlines() if line.strip()]
    evals = [n["text"] for f in EVAL_FILES for n in json.loads((HERE / "eval" / f).read_text())]
    eval_tokens = [words(t) for t in evals]
    eval7 = set().union(*(grams(t, 7) for t in eval_tokens))
    eval3 = [grams(t, 3) for t in eval_tokens]

    seen: set[str] = set()
    kept, dropped = [], {"duplicate": 0, "eval7": [], "evalJaccard": []}
    for note in raw:
        key = " ".join(words(note["text"]))
        if not key or key in seen:
            dropped["duplicate"] += 1
            continue
        seen.add(key)
        tokens = words(note["text"])
        if grams(tokens, 7) & eval7:
            dropped["eval7"].append(note["text"])
            continue
        g3 = grams(tokens, 3)
        best = max((len(g3 & e) / len(g3 | e) for e in eval3 if e and g3), default=0.0)
        if best > 0.45:
            dropped["evalJaccard"].append(note["text"])
            continue
        kept.append(note)
    Path(out).write_text(json.dumps(kept, ensure_ascii=False, indent=1))
    print(json.dumps({"in": len(raw), "kept": len(kept), "duplicate": dropped["duplicate"],
                      "eval7": len(dropped["eval7"]), "evalJaccard": len(dropped["evalJaccard"])}))
    for text in dropped["eval7"][:8] + dropped["evalJaccard"][:8]:
        print("  dropped:", text[:160].replace("\n", " / "))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
