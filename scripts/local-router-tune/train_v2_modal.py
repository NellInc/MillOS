"""Routing tune v2: the v1 routing objective plus retention of the base model's strategy answers.

v1 (train_modal.py) improved routing but disturbed free generation: in Chrome the
tuned build named the faulted machine 27/30 against the official 30/30, with an
unparsed answer and a corrupted id. So MillOS ran it only in a second, routing-only
engine (D-017), at the cost of a second 2.4 GB download. v2 adds a retention term:
on strategy prompts shaped exactly like aiEngine.strategicPrompt (gen_retention.py),
the base model first answers each prompt itself, then training holds the tuned
model's token distributions on those answers to the base model's (KL, adapter off as
the reference). If the bf16 check below shows strategy unharmed, one build can serve
routing and strategy.

Hyperparameters are v1's plus RETENTION, fixed before the run. The frozen eval sets
are scored once before and once after; 80 retention prompts are held out of training
for the strategy check, and nothing is chosen on either.

  modal run scripts/local-router-tune/train_v2_modal.py --train-file data/train_final.json \
      --retention-file data/retention_prompts.json --run r2
"""

from __future__ import annotations

import json
from pathlib import Path

import modal

BASE = "Qwen/Qwen3.5-4B"
BASE_REVISION = "851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a"
QUEUE_TOKEN_IDS = [56315, 4662, 2132, 2665, 15020]
QUEUES = ["Equipment maintenance", "Product quality", "Logistics coordination", "No current incident", "Insufficient evidence"]
TARGET_MODULES = (
    r".*language_model\.layers\.\d+\."
    r"(self_attn\.(q_proj|k_proj|v_proj|o_proj)|linear_attn\.(in_proj_qkv|in_proj_z|out_proj)"
    r"|mlp\.(gate_proj|up_proj|down_proj))"
)
HPARAMS = {
    "rank": 16, "alpha": 32, "dropout": 0.05, "lr": 1e-4, "epochs": 2, "batch": 16,
    "warmup": 0.05, "smoothing": 0.02, "seed": 20261102,
    # v2
    "retention_weight": 1.0, "retention_batch": 4, "retention_holdout": 80,
    "gen_temperature": 0.7, "gen_top_p": 0.9, "gen_max_new_tokens": 640,
}
# webgpuClient's rawTemplate for generateContent (system prompt is web-llm's default).
STRATEGY_TEMPLATE = (
    "<|im_start|>system\nYou are a helpful assistant.<|im_end|>\n<|im_start|>user\n{prompt}<|im_end|>\n"
    "<|im_start|>assistant\n<think>\n\n</think>\n\n"
)

app = modal.App("millos-router-train-v2")
volume = modal.Volume.from_name("millos-router-tune", create_if_missing=True)
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.8.0", "transformers>=4.57.1", "peft>=0.17", "accelerate", "safetensors",
        "huggingface_hub>=0.26", "numpy<2.3", "pillow", "torchvision",
    )
    .pip_install("flash-linear-attention")
)


def _route_prompt(system: str, note: str) -> str:
    return (
        f"<|im_start|>system\n{system}<|im_end|>\n<|im_start|>user\n{note.strip()}<|im_end|>\n"
        "<|im_start|>assistant\n<think>\n\n</think>\n\n"
    )


def _parse_strategy(text: str):
    """aiEngine.parseStrategicResponse's gate: a JSON object with non-empty priorities."""
    import re

    match = re.search(r"\{[\s\S]*\}", text or "")
    if not match:
        return None
    try:
        parsed = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    priorities = parsed.get("priorities") if isinstance(parsed, dict) else None
    if not isinstance(priorities, list) or not any(isinstance(p, str) and p.strip() for p in priorities):
        return None
    return parsed


@app.function(
    image=image, gpu="H100", volumes={"/vol": volume},
    secrets=[modal.Secret.from_name("huggingface-secret")], timeout=6 * 3600, memory=65536,
)
def train(run: str, system: str, train_rows: list[dict], retention: list[dict], evals: dict, holdout: int) -> dict:
    import math
    import os
    import random
    import re
    import shutil
    import time

    import torch
    import torch.nn.functional as F
    from huggingface_hub import snapshot_download
    from peft import LoraConfig, get_peft_model
    from safetensors.torch import load_file, save_file
    from transformers import AutoModelForImageTextToText, AutoTokenizer

    torch.manual_seed(HPARAMS["seed"])
    random.seed(HPARAMS["seed"])
    started = time.time()
    source = snapshot_download(
        BASE, revision=BASE_REVISION, local_dir=f"/vol/hf/{BASE.replace('/', '--')}",
        token=os.environ["HF_TOKEN"], allow_patterns=["*.json", "*.safetensors", "*.txt", "*.jinja"],
    )
    tokenizer = AutoTokenizer.from_pretrained(source)
    model = AutoModelForImageTextToText.from_pretrained(source, dtype=torch.bfloat16, device_map={"": 0})
    model.config.use_cache = False
    ids = torch.tensor(QUEUE_TOKEN_IDS, device="cuda")
    report: dict = {"run": run, "hparams": HPARAMS, "base": f"{BASE}@{BASE_REVISION}"}

    # ---------------------------------------------------------------- generation
    @torch.no_grad()
    def generate(m, prompts: list[str], seed: int) -> list[str]:
        m.eval()
        torch.manual_seed(seed)
        tokenizer.padding_side = "left"
        outs = []
        for i in range(0, len(prompts), 32):
            chunk = [STRATEGY_TEMPLATE.format(prompt=p) for p in prompts[i : i + 32]]
            enc = tokenizer(chunk, return_tensors="pt", padding=True, add_special_tokens=False).to("cuda")
            gen = m.generate(
                **enc, do_sample=True, temperature=HPARAMS["gen_temperature"], top_p=HPARAMS["gen_top_p"],
                max_new_tokens=HPARAMS["gen_max_new_tokens"], pad_token_id=tokenizer.pad_token_id,
                use_cache=True,
            )
            for row in gen[:, enc["input_ids"].shape[1] :]:
                outs.append(tokenizer.decode(row, skip_special_tokens=True))
        tokenizer.padding_side = "right"
        return outs

    # Left padding must not change an answer: greedy, batched vs alone, on four prompts.
    @torch.no_grad()
    def padding_check() -> dict:
        model.eval()
        tokenizer.padding_side = "left"
        prompts = [STRATEGY_TEMPLATE.format(prompt=r["prompt"]) for r in retention[:4]]
        enc = tokenizer(prompts, return_tensors="pt", padding=True, add_special_tokens=False).to("cuda")
        batched = model.generate(**enc, do_sample=False, max_new_tokens=48, pad_token_id=tokenizer.pad_token_id)
        same = 0
        for k, p in enumerate(prompts):
            alone = model.generate(
                **tokenizer([p], return_tensors="pt", add_special_tokens=False).to("cuda"),
                do_sample=False, max_new_tokens=48, pad_token_id=tokenizer.pad_token_id,
            )
            a = tokenizer.decode(alone[0, -48:], skip_special_tokens=True)
            b = tokenizer.decode(batched[k, -48:], skip_special_tokens=True)
            same += a == b
        tokenizer.padding_side = "right"
        return {"identical": same, "of": len(prompts)}

    report["paddingCheck"] = padding_check()
    print("padding check", report["paddingCheck"], flush=True)
    model.config.use_cache = True

    def strategy_score(texts: list[str], rows: list[dict]) -> dict:
        parsed = hits = faulted = invalid = 0
        for text, row in zip(texts, rows):
            ids_in = set(re.findall(r'"id":"([^"]+)"', row["prompt"].split("Equipment telemetry:")[-1]))
            answer = _parse_strategy(text)
            parsed += answer is not None
            focus = answer.get("focusMachine") if answer else None
            if focus is not None and focus not in ids_in:
                invalid += 1
            if row["want"]:
                faulted += 1
                hits += focus == row["want"]
        return {"parsed": parsed, "n": len(rows), "hits": hits, "faulted": faulted, "invalidIds": invalid}

    rng = random.Random(HPARAMS["seed"])
    retention = list(retention)
    rng.shuffle(retention)
    held, kept = retention[:holdout], retention[holdout:]

    base_answers = generate(model, [r["prompt"] for r in kept], seed=1)
    usable = [(r, a) for r, a in zip(kept, base_answers) if _parse_strategy(a) is not None]
    report["retentionAnswers"] = {"generated": len(kept), "parsedKept": len(usable)}
    print("retention answers", report["retentionAnswers"], flush=True)
    base_held = generate(model, [r["prompt"] for r in held], seed=2)
    report["strategyBefore"] = strategy_score(base_held, held)
    print("strategy before", report["strategyBefore"], flush=True)
    model.config.use_cache = False

    # ---------------------------------------------------------------- routing scores
    def encode(texts: list[str]):
        batch = [tokenizer(t, add_special_tokens=False)["input_ids"] for t in texts]
        width = max(len(b) for b in batch)
        input_ids = torch.full((len(batch), width), tokenizer.pad_token_id, dtype=torch.long)
        mask = torch.zeros((len(batch), width), dtype=torch.long)
        for i, b in enumerate(batch):
            input_ids[i, : len(b)] = torch.tensor(b)
            mask[i, : len(b)] = 1
        return input_ids.cuda(), mask.cuda(), torch.tensor([len(b) - 1 for b in batch]).cuda(), batch

    def five_way(m, notes: list[str]) -> torch.Tensor:
        input_ids, mask, last, _ = encode([_route_prompt(system, n) for n in notes])
        out = m(input_ids=input_ids, attention_mask=mask, output_hidden_states=True, logits_to_keep=1)
        hidden = out.hidden_states[-1][torch.arange(len(notes), device="cuda"), last]
        return (hidden @ m.get_output_embeddings().weight[ids].T).float()

    @torch.no_grad()
    def route_all(m) -> dict:
        m.eval()
        result = {}
        for name, cases in evals.items():
            correct = 0
            for i in range(0, len(cases), 32):
                chunk = cases[i : i + 32]
                picks = five_way(m, [c["text"] for c in chunk]).argmax(-1).tolist()
                correct += sum(QUEUES[p] == c["label"] for p, c in zip(picks, chunk))
            result[name] = f"{correct}/{len(cases)}"
        return result

    report["routingBefore"] = route_all(model)
    print("routing before", report["routingBefore"], flush=True)

    # ---------------------------------------------------------------- training
    rows = list(train_rows)
    rng.shuffle(rows)
    model = get_peft_model(
        model,
        LoraConfig(r=HPARAMS["rank"], lora_alpha=HPARAMS["alpha"], lora_dropout=HPARAMS["dropout"],
                   target_modules=TARGET_MODULES, bias="none"),
    )
    model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
    model.enable_input_require_grads()
    params = [p for p in model.parameters() if p.requires_grad]
    optimiser = torch.optim.AdamW(params, lr=HPARAMS["lr"], weight_decay=0.0)
    steps = HPARAMS["epochs"] * math.ceil(len(rows) / HPARAMS["batch"])
    warmup = max(1, int(steps * HPARAMS["warmup"]))
    scheduler = torch.optim.lr_scheduler.LambdaLR(
        optimiser, lambda s: min(1.0, (s + 1) / warmup) * 0.5 * (1 + math.cos(math.pi * min(1.0, s / steps)))
    )

    def targets(batch):
        t = torch.tensor([[r["target"][q] for q in QUEUES] for r in batch], device="cuda")
        eps = HPARAMS["smoothing"]
        return (1 - eps) * t + eps / len(QUEUES)

    def retention_loss(pairs) -> torch.Tensor:
        """KL(base || tuned) over the base answer's tokens, teacher-forced."""
        texts = [STRATEGY_TEMPLATE.format(prompt=r["prompt"]) + a for r, a in pairs]
        prompt_lens = [len(tokenizer(STRATEGY_TEMPLATE.format(prompt=r["prompt"]), add_special_tokens=False)["input_ids"]) for r, _ in pairs]
        input_ids, mask, _, batch = encode(texts)
        positions = torch.zeros_like(mask, dtype=torch.bool)
        for i, (start, b) in enumerate(zip(prompt_lens, batch)):
            positions[i, start - 1 : len(b) - 1] = True  # logits that predict answer tokens
        with torch.no_grad(), model.disable_adapter():
            base_logits = model(input_ids=input_ids, attention_mask=mask).logits[positions].float()
        tuned_logits = model(input_ids=input_ids, attention_mask=mask).logits[positions].float()
        return F.kl_div(
            F.log_softmax(tuned_logits, -1), F.log_softmax(base_logits, -1), log_target=True, reduction="batchmean"
        )

    history = []
    step = 0
    for epoch in range(HPARAMS["epochs"]):
        rng.shuffle(rows)
        for i in range(0, len(rows), HPARAMS["batch"]):
            model.train()
            chunk = rows[i : i + HPARAMS["batch"]]
            logp = F.log_softmax(five_way(model, [r["text"] for r in chunk]), -1)
            route = -(targets(chunk) * logp).sum(-1).mean()
            keep = retention_loss(rng.sample(usable, HPARAMS["retention_batch"]))
            loss = route + HPARAMS["retention_weight"] * keep
            loss.backward()
            torch.nn.utils.clip_grad_norm_(params, 1.0)
            optimiser.step()
            scheduler.step()
            optimiser.zero_grad(set_to_none=True)
            step += 1
            if step % 50 == 0:
                history.append({"step": step, "route": round(route.item(), 4), "retention": round(keep.item(), 5)})
                print(history[-1], flush=True)
    report["history"] = history
    report["routingAfter"] = route_all(model)
    print("routing after", report["routingAfter"], flush=True)
    model.config.use_cache = True
    tuned_held = generate(model, [r["prompt"] for r in held], seed=2)
    report["strategyAfter"] = strategy_score(tuned_held, held)
    report["strategySamples"] = [{"want": r["want"], "base": b[:400], "tuned": t[:400]} for r, b, t in zip(held[:6], base_held, tuned_held)]
    print("strategy after", report["strategyAfter"], flush=True)

    # ---------------------------------------------------------------- merge (as v1)
    out_dir = f"/vol/merged/{run}"
    shutil.rmtree(out_dir, ignore_errors=True)
    os.makedirs(out_dir)
    deltas = {}
    scale = HPARAMS["alpha"] / HPARAMS["rank"]
    for name, module in model.named_modules():
        if hasattr(module, "lora_A") and "default" in getattr(module, "lora_A", {}):
            a = module.lora_A["default"].weight.float()
            b = module.lora_B["default"].weight.float()
            deltas[name.replace("base_model.model.", "", 1) + ".weight"] = (b @ a * scale).cpu()
    index = json.loads(Path(source, "model.safetensors.index.json").read_text())["weight_map"]
    assert not [k for k in deltas if k not in index]
    for shard in sorted(set(index.values())):
        tensors = load_file(f"{source}/{shard}")
        for key in [k for k, s in index.items() if s == shard and k in deltas]:
            tensors[key] = (tensors[key].float() + deltas[key]).to(tensors[key].dtype).contiguous()
        save_file(tensors, f"{out_dir}/{shard}", metadata={"format": "pt"})
    for name in os.listdir(source):
        if not name.endswith(".safetensors") and os.path.isfile(f"{source}/{name}"):
            shutil.copy(f"{source}/{name}", f"{out_dir}/{name}")
    report["merge"] = {"loraModules": len(deltas)}
    report["minutes"] = round((time.time() - started) / 60, 1)
    Path(out_dir, "train_report.json").write_text(json.dumps(report, indent=1))
    volume.commit()
    return report


@app.local_entrypoint()
def main(train_file: str, retention_file: str, run: str, smoke: bool = False):
    import sys

    here = Path(__file__).resolve().parent
    sys.path.insert(0, str(here))
    from common import LOCAL_SYSTEM

    rows = json.loads(Path(train_file).read_text())
    retention = json.loads(Path(retention_file).read_text())
    evals = {n: json.loads((here / "eval" / f"{n}.json").read_text()) for n in ["cases", "heldout", "production", "test2"]}
    if smoke:
        rows, retention = rows[:64], retention[:96]
        evals = {n: c[:8] for n, c in evals.items()}
        run = f"smoke-{run}"
    holdout = 16 if smoke else HPARAMS["retention_holdout"]
    report = train.remote(run, LOCAL_SYSTEM, rows, retention, evals, holdout)
    out = here / "runs" / f"{run}.json"
    out.write_text(json.dumps(report, indent=1))
    print(json.dumps({k: report[k] for k in ("paddingCheck", "retentionAnswers", "strategyBefore", "strategyAfter",
                                             "routingBefore", "routingAfter", "minutes")}, indent=1))
