---
license: apache-2.0
base_model: Qwen/Qwen3.5-4B
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

# Qwen3.5-4B MillOS routing (q4f16_1, MLC)

A LoRA fine-tune of [Qwen/Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B) (revision
`851bf6e8`), merged and converted to web-llm's `q4f16_1` format, for the on-device incident
router in MillOS, a grain-mill digital twin that runs in the browser.

The router reads a short mill note and picks one of five advisory queues: Equipment
maintenance, Product quality, Logistics coordination, No current incident, Insufficient
evidence. MillOS reads the answer as the model's next-token distribution over the five
queues' first tokens, after its fixed system prompt and the empty think block.

## Loading

The architecture, quantization, `mlc-chat-config.json` and tokenizer files are those of
[mlc-ai/Qwen3.5-4B-q4f16_1-MLC](https://huggingface.co/mlc-ai/Qwen3.5-4B-q4f16_1-MLC) at
`44b42469`, copied unchanged, so this build runs on that build's prebuilt WebGPU model
library (web-llm 0.2.86, `v0_2_86/base`). Only the weight shards differ. In web-llm, use
the base model's record with this repository as `model`.

## Training

- **Revisions:** `main` is v2 (`5015631b`). v1 (`6b8368ad`) is the routing objective
  alone; v2 adds the retention term below.
- **Objective:** cross-entropy between the five-way softmax at the answer position and the
  teacher's distribution, smoothed by 0.02.
- **Retention (v2):** 560 strategy prompts shaped exactly like MillOS's strategic prompt
  (80 more held out), answered first by the base model itself. Each step also minimises
  KL(base ‖ tuned) over those answers' tokens, with the adapter switched off as the
  reference, weight 1.0.
- **Data:** 5,629 synthetic mill notes (868 in Brazilian Portuguese, 958 carrying a planted
  wrong answer) written by Claude Sonnet 5.5 and Claude Haiku 5.5, kept only where the
  authored label, TypeSafe's Jev 1.14 and Claude Haiku 5.5 all agreed. Targets are Jev's
  probabilities.
- **LoRA:** rank 16, alpha 32, dropout 0.05, on the language model's attention, linear
  attention and MLP projections; 2 epochs, AdamW at 1e-4 with cosine decay, batch 16.
  Hyperparameters were fixed before the run.
- **Merge:** the LoRA deltas were added to the original bf16 shards under their original
  key names, then converted with `mlc_llm convert_weight --quantization q4f16_1`. Converting
  the unmodified base the same way reproduces the official build's 579 tensors in layout,
  with scales within 0.1% and fewer than 0.2% of 4-bit codes one step apart.

## Evaluation

In Chrome (web-llm 0.2.86, Apple Metal) through MillOS's own routing code, each q4f16_1
build on the same machine. The evaluation sets were frozen and hashed before any training
data existed, and no training note shares a seven-word run with any of them. A planted
answer is a note that carries an instruction or suggested answer naming a wrong queue.

| Set | Official build | v1 | v2 (`main`) |
|---|---|---|---|
| Original cases (25 easy, 40 hard) | 62/65 | 63/65 | 64/65 |
| Original injection cases | 6/7 | 7/7 | 7/7 |
| Held-out notes, ordinary | 43/49 | 48/49 | 48/49 |
| Held-out notes with a planted answer | 13/20 (took it 6 times) | 20/20 (0) | 20/20 (0) |
| MillOS's own 16 incident texts (en, pt-BR) | 16/16 | 16/16 | 16/16 |
| Fresh test set, English | 33/40 | 40/40 | 39/40 |
| Fresh test set, Brazilian Portuguese | 22/30 | 29/30 | 30/30 |
| Fresh test set, planted answers in forms never trained on | 20/30 (took it 8 times) | 28/30 (1) | 29/30 (1) |
| **All** | **215/257** | **251/257** | **253/257** |

The official build and v1 were measured on 2026-11-02, and v2 on 2026-11-03, after MillOS
began scoring once more when the five queue scores sum short. Answers MillOS refused for a
short sum count as wrong: official 4, v1 3 (each with the right top queue), v2 0.

**Generation.** MillOS's strategy check gives every machine healthy readings but one, and
counts how many of 30 answers name that machine.
- **Official build:** 30 of 30.
- **v1:** 27 of 30. One answer didn't parse as JSON, one was cut off at the 120-second limit, and one named the machine "c-sifter-c".
- **v2:** 28 of 30. One answer was empty, under heavy machine load, and one didn't parse. No ids were corrupted. Before quantisation, on 80 held-out prompts, v2 parsed 73 and the base 72, and named the fault 52 times against the base's 53 (of 59).

v2 missed the 29-of-30 bar fixed before the run for serving strategy too. So MillOS runs this build only in its routing lane, and the official build writes everything a player reads.

From 2026-11-03 MillOS's routing lane runs the 0.8B sibling,
[NellWatson/Qwen3.5-0.8B-millos-routing-q4f16_1-MLC](https://huggingface.co/NellWatson/Qwen3.5-0.8B-millos-routing-q4f16_1-MLC)
(251/257 for a 0.45 GB download, at `914fde01`). This build stays pinned there but unused.

## Limits

- A narrow classifier for one fixed prompt. Its general chat and generation behaviour was
  not a training target; MillOS checks its strategy answers separately before using it for
  anything but routing.
- The labels follow one rubric's boundaries. A note that names a machine and a symptom but
  no fault ("the intake elevator is making a noise") sits on the Equipment/Insufficient
  evidence boundary; the teachers disagreed with the authored label there and those notes
  were left out of training.
- Synthetic data. Real operator notes may be messier in ways the generators did not imagine.
