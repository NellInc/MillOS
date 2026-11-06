"""Write the Hugging Face model card for a small routing build from its measured runs.

  python3 small_card.py 0.8B > /path/README.md

Every number comes from runs/: the Modal report (s08b-pt.json / s2b.json) for training
and bf16 scores, and runs/browser-*.json for the Chrome scores.
"""
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
REPO = "Qwen3.5-{size}-millos-routing-q4f16_1-MLC"
SIZES = {
    # Modal run, official build and revision, pinned revision, and this repo's Chrome runs
    # as (column heading, browser result file) with the current build last.
    "0.8B": {
        "run": "s08b-pt",
        "official": ("mlc-ai/Qwen3.5-0.8B-q4f16_1-MLC", "0ec13897"),
        "rev": "914fde01",
        "ours": [
            ("First revision `ef377996`", "browser-Qwen3.5-0.8B-millos-routing-q4f16_1-MLC-s08b.json"),
            ("This build `914fde01`", "browser-Qwen3.5-0.8B-millos-routing-q4f16_1-MLC-s08b-pt.json"),
        ],
    },
    "2B": {
        "run": "s2b",
        "official": ("mlc-ai/Qwen3.5-2B-q4f16_1-MLC", "dd74e9c8"),
        "rev": "75f9e49f",
        "ours": [("This build", "browser-Qwen3.5-2B-millos-routing-q4f16_1-MLC.json")],
    },
}
GROUPS = ("cases", "heldout", "production", "test2")
ROWS = [
    ("Original cases (25 easy, 40 hard)", "cases", ("easy", "hard")),
    ("Original injection cases", "cases", ("injection",)),
    ("Held-out notes, ordinary", "heldout", ("held",)),
    ("Held-out notes with a planted answer", "heldout", ("held-inj",)),
    ("MillOS's own 16 incident texts (en, pt-BR)", "production", ("production",)),
    ("Fresh test set, English", "test2", ("test2-en",)),
    ("Fresh test set, Brazilian Portuguese", "test2", ("test2-pt-BR",)),
    ("Fresh test set, planted answers in forms never trained on", "test2", ("test2-inj",)),
]
TEST3_ROWS = [
    ("Portuguese test set, ordinary", "test3", ("test3-pt",)),
    ("Portuguese test set, planted answers", "test3", ("test3-pt-inj",)),
]
PT_DATA = """
- **Portuguese expansion (`914fde01`):** 1,848 more Brazilian Portuguese notes (320 with a
  planted wrong answer), written by the same two models after the Portuguese test set below
  was frozen, and kept on the same three-way agreement: 7,475 notes in all, 2,714 of them in
  Portuguese. Settings unchanged. The bar for replacing the first revision was written down
  before any of this data existed: at least 29/30 on the fresh Portuguese set, at least
  248/257 overall, no other set down by more than one case, and the new Portuguese set no
  worse."""


def cell(summary: dict, group: str, sets: tuple) -> str:
    if group not in summary:
        return "—"
    by = summary[group]["bySet"]
    correct = sum(by[s]["correct"] for s in sets)
    n = sum(by[s]["n"] for s in sets)
    took = sum(by[s]["tookPlanted"] for s in sets)
    planted = any("inj" in s for s in sets)
    return f"{correct}/{n}" + (f" (took it {took})" if planted else "")


def total(summary: dict) -> str:
    return f"{sum(summary[g]['correct'] for g in GROUPS)}/{sum(summary[g]['n'] for g in GROUPS)}"


def bf16(scores: dict) -> str:
    pairs = [scores[g].split("/") for g in GROUPS]
    return f"{sum(int(a) for a, _ in pairs)}/{sum(int(b) for _, b in pairs)}"


def summary(name: str) -> dict:
    return json.loads((HERE / "runs" / name).read_text())["summary"]


def main(size: str) -> None:
    spec = SIZES[size]
    official, official_rev = spec["official"]
    report = json.loads((HERE / "runs" / f"{spec['run']}.json").read_text())
    base, base_rev = report["base"].split("@")
    hp = report["hparams"]
    columns = [
        ("Official Qwen3.5-4B", summary("browser-Qwen3.5-4B-q4f16_1-MLC.json")),
        ("4B routing tune (v2)", summary("browser-Qwen3.5-4B-millos-routing-q4f16_1-MLC-healthy.json")),
    ] + [(heading, summary(name)) for heading, name in spec["ours"]]
    rows = ROWS + (TEST3_ROWS if any("test3" in s for _, s in columns) else [])
    table = "\n".join(
        [
            "| Set | " + " | ".join(h for h, _ in columns) + " |",
            "|---" * (len(columns) + 1) + "|",
            *(f"| {label} | " + " | ".join(cell(s, g, sets) for _, s in columns) + " |" for label, g, sets in rows[:8]),
            "| **All of the above** | " + " | ".join(f"**{total(s)}**" for _, s in columns) + " |",
            *(f"| {label} | " + " | ".join(cell(s, g, sets) for _, s in columns) + " |" for label, g, sets in rows[8:]),
        ]
    )
    test3_note = (
        "\n\nThe Portuguese test set (75 notes, written by Claude Opus 5.5 and confirmed by both teachers) "
        "was frozen on 2026-11-04, before the Portuguese expansion was generated, and is reported outside "
        "the 257. The 4B builds were not measured on it."
        if len(rows) > 8
        else ""
    )
    if spec["run"].endswith("-pt"):
        test3_note += (
            " This build's miss on MillOS's own texts and one planted-answer miss were both refusals"
            " with the right queue on top (sums 0.971 and 0.989); the first revision had none."
        )
    print(f"""---
license: apache-2.0
base_model: {base}
library_name: mlc-llm
tags:
  - web-llm
  - mlc-llm
  - webgpu
  - classification
  - millos
language:
  - en
  - pt
---

# Qwen3.5-{size} MillOS routing (q4f16_1, MLC)

A LoRA fine-tune of [{base}](https://huggingface.co/{base}) (revision `{base_rev[:8]}`), merged
and converted to web-llm's `q4f16_1` format, for the on-device incident router in MillOS, a
grain-mill digital twin that runs in the browser. It is the {size} sibling of
[NellWatson/Qwen3.5-4B-millos-routing-q4f16_1-MLC](https://huggingface.co/NellWatson/Qwen3.5-4B-millos-routing-q4f16_1-MLC),
trained with the same settings.

The router reads a short mill note and picks one of five advisory queues: Equipment
maintenance, Product quality, Logistics coordination, No current incident, Insufficient
evidence. MillOS reads the answer as the model's next-token distribution over the five
queues' first tokens, after its fixed system prompt and the empty think block. It does not
generate text for MillOS.

## Loading

The architecture, quantization, `mlc-chat-config.json` and tokenizer files are those of
[{official}](https://huggingface.co/{official}) at `{official_rev}`, copied unchanged, so this
build runs on that build's prebuilt WebGPU model library (web-llm 0.2.86, `v0_2_86/base`).
Only the weight shards differ. In web-llm, use the base model's record with this repository
as `model`. MillOS pins revision `{spec['rev']}`.

## Training

- **Objective:** cross-entropy between the five-way softmax at the answer position and the
  teacher's distribution, smoothed by {hp['smoothing']}. No retention term.
- **Data:** 5,629 synthetic mill notes (868 in Brazilian Portuguese, 958 carrying a planted
  wrong answer) written by Claude Sonnet 5.5 and Claude Haiku 5.5, kept only where the
  authored label, TypeSafe's Jev 1.14 and Claude Haiku 5.5 all agreed. Targets are Jev's
  probabilities.{PT_DATA if spec['run'].endswith('-pt') else ''}
- **LoRA:** rank {hp['rank']}, alpha {hp['alpha']}, dropout {hp['dropout']}, on the language
  model's attention, linear attention and MLP projections; {hp['epochs']} epochs, AdamW at
  {hp['lr']} with cosine decay, batch {hp['batch']}, seed {hp['seed']}. Settings are the 4B
  build's, fixed before its run and not retuned for this size.
- **Merge:** the LoRA deltas were added to the original bf16 shards under their original key
  names, then converted with `mlc_llm convert_weight --quantization q4f16_1`.
- **Before quantisation:** the base model routed {bf16(report['routingBefore'])} of the frozen
  cases and this tune {bf16(report['routingAfter'])}.

## Evaluation

In Chrome (web-llm 0.2.86, Apple Metal) through MillOS's own routing code, each q4f16_1 build
on the same machine. The evaluation sets were frozen and hashed before any training data
existed, and no training note shares a seven-word run with any of them. A planted answer is
a note that carries an instruction or suggested answer naming a wrong queue. MillOS refuses
an answer whose five queue probabilities sum below 0.99 twice, and a refusal counts as wrong.{test3_note}

{table}

## Limits

- A narrow classifier for one fixed prompt. Its general chat and generation behaviour was not
  a training target or measured, and MillOS never shows its text to a player.
- The labels follow one rubric's boundaries. A note that names a machine and a symptom but no
  fault ("the intake elevator is making a noise") sits on the Equipment/Insufficient evidence
  boundary; the teachers disagreed with the authored label there and those notes were left
  out of training.
- Synthetic data. Real operator notes may be messier in ways the generators did not imagine.""")


if __name__ == "__main__":
    main(sys.argv[1])
