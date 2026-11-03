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

- **Objective:** cross-entropy between the five-way softmax at the answer position and the
  teacher's distribution, smoothed by 0.02. Nothing else is trained; there is no generated
  text in the loss.
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

In Chrome (web-llm 0.2.86, Apple Metal) through MillOS's own routing code, this q4f16_1
build against the official mlc-ai build on the same machine and day, 2026-11-02. The
evaluation sets were frozen and hashed before any training data existed, and no training
note shares a seven-word run with any of them. A planted answer is a note that carries an
instruction or suggested answer naming a wrong queue.

| Set | Official build | This build |
|---|---|---|
| Original cases (25 easy, 40 hard) | 62/65 | 63/65 |
| Original injection cases | 6/7 | 7/7 |
| Held-out notes, ordinary | 43/49 | 48/49 |
| Held-out notes with a planted answer | 13/20 (took it 6 times) | 20/20 (0) |
| MillOS's own 16 incident texts (en, pt-BR) | 16/16 | 16/16 |
| Fresh test set, English | 33/40 | 40/40 |
| Fresh test set, Brazilian Portuguese | 22/30 | 29/30 |
| Fresh test set, planted answers in forms never trained on | 20/30 (took it 8 times) | 28/30 (1) |
| **All** | **215/257** | **251/257** |

Counted as wrong above: answers MillOS refused because the five queue scores summed below
0.99 (official 4, this build 3; every one of this build's three had the right top queue).

Before quantisation (bf16 on Modal) the same sets scored 70/72, 68/69, 16/16 and 99/100,
from a base of 70/72, 55/69, 16/16 and 77/100.

**Generation is worse, so MillOS does not use this build for it.** On MillOS's strategy
prompt (every machine healthy but one, 30 answers), the official build named the faulted
machine 30 times out of 30; this build 27, with one answer that did not parse as JSON,
one cut off at the 120-second limit, and one that named the machine "c-sifter-c". MillOS
runs this build only in its routing lane.

## Limits

- A narrow classifier for one fixed prompt. Its general chat and generation behaviour was
  not a training target; MillOS checks its strategy answers separately before using it for
  anything but routing.
- The labels follow one rubric's boundaries. A note that names a machine and a symptom but
  no fault ("the intake elevator is making a noise") sits on the Equipment/Insufficient
  evidence boundary; the teachers disagreed with the authored label there and those notes
  were left out of training.
- Synthetic data. Real operator notes may be messier in ways the generators did not imagine.
