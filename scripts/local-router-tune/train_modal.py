"""LoRA-tune Qwen3.5-4B for the on-device router on Modal, then merge into the original shards.

The objective is exactly what the app reads. requestLocalAdvice sends LOCAL_SYSTEM and the
note, the chat template ends with the empty think block, and scoreNextToken biases the
five queues' first tokens so the answer is the softmax over those five logits at that
one position. Training minimises the cross-entropy between that five-way softmax and the
teacher target (Jev's probabilities, kept only where Jev, Haiku and the authored label
agree, smoothed by 0.02).

Hyperparameters are fixed before the run; the frozen eval sets are scored once, before
and after training, and never used to choose anything. A 5% split of the training notes
is the only validation signal.

  modal run scripts/local-router-tune/train_modal.py --train-file data/train_final.json --run r1
"""

from __future__ import annotations

import json
from pathlib import Path

import modal

BASE = "Qwen/Qwen3.5-4B"
BASE_REVISION = "851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a"
QUEUE_TOKEN_IDS = [56315, 4662, 2132, 2665, 15020]
QUEUES = [
    "Equipment maintenance",
    "Product quality",
    "Logistics coordination",
    "No current incident",
    "Insufficient evidence",
]
TARGET_MODULES = (
    r".*language_model\.layers\.\d+\."
    r"(self_attn\.(q_proj|k_proj|v_proj|o_proj)|linear_attn\.(in_proj_qkv|in_proj_z|out_proj)"
    r"|mlp\.(gate_proj|up_proj|down_proj))"
)
HPARAMS = {
    "rank": 16,
    "alpha": 32,
    "dropout": 0.05,
    "lr": 1e-4,
    "epochs": 2,
    "batch": 16,
    "warmup": 0.05,
    "smoothing": 0.02,
    "weight_decay": 0.0,
    "seed": 20261102,
}

app = modal.App("millos-router-train")
volume = modal.Volume.from_name("millos-router-tune", create_if_missing=True)
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.8.0",
        "transformers>=4.57.1",
        "peft>=0.17",
        "accelerate",
        "safetensors",
        "huggingface_hub>=0.26",
        "numpy<2.3",
        "pillow",
        "torchvision",
    )
    .pip_install("flash-linear-attention")
)


def _render(system: str, note: str) -> str:
    return (
        f"<|im_start|>system\n{system}<|im_end|>\n<|im_start|>user\n{note.strip()}<|im_end|>\n"
        "<|im_start|>assistant\n<think>\n\n</think>\n\n"
    )


@app.function(
    image=image,
    gpu="H100",
    volumes={"/vol": volume},
    secrets=[modal.Secret.from_name("huggingface-secret")],
    timeout=4 * 3600,
    memory=65536,
)
def train(run: str, system: str, train_rows: list[dict], evals: dict[str, list[dict]]) -> dict:
    import math
    import os
    import random
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
        BASE,
        revision=BASE_REVISION,
        local_dir=f"/vol/hf/{BASE.replace('/', '--')}",
        token=os.environ["HF_TOKEN"],
        allow_patterns=["*.json", "*.safetensors", "*.txt", "*.jinja"],
    )
    volume.commit()
    tokenizer = AutoTokenizer.from_pretrained(source)
    for queue, token_id in zip(QUEUES, QUEUE_TOKEN_IDS):
        first = tokenizer(queue, add_special_tokens=False)["input_ids"][0]
        assert first == token_id, (queue, first, token_id)

    model = AutoModelForImageTextToText.from_pretrained(source, dtype=torch.bfloat16, device_map={"": 0})
    model.config.use_cache = False
    ids = torch.tensor(QUEUE_TOKEN_IDS, device="cuda")

    def encode(notes: list[str]) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        batch = [tokenizer(_render(system, n), add_special_tokens=False)["input_ids"] for n in notes]
        width = max(len(b) for b in batch)
        input_ids = torch.full((len(batch), width), tokenizer.pad_token_id, dtype=torch.long)
        mask = torch.zeros((len(batch), width), dtype=torch.long)
        for i, b in enumerate(batch):  # right-pad: the scored position sees no padding
            input_ids[i, : len(b)] = torch.tensor(b)
            mask[i, : len(b)] = 1
        last = torch.tensor([len(b) - 1 for b in batch])
        return input_ids.cuda(), mask.cuda(), last.cuda()

    def five_way_logits(m, notes: list[str]) -> torch.Tensor:
        # The final hidden state at the scored position times the five queue rows of the
        # output head: the same five logits as the full vocabulary projection, without
        # materialising 248k-wide logits for every position.
        input_ids, mask, last = encode(notes)
        out = m(input_ids=input_ids, attention_mask=mask, output_hidden_states=True, logits_to_keep=1)
        hidden = out.hidden_states[-1][torch.arange(len(notes), device="cuda"), last]
        head = m.get_output_embeddings().weight[ids]
        return (hidden @ head.T).float()

    @torch.no_grad()
    def check_projection() -> float:
        notes = [c["text"] for c in evals["test2"][:4]]
        input_ids, mask, last = encode(notes)
        full = model(input_ids=input_ids, attention_mask=mask, logits_to_keep=0).logits
        reference = full[torch.arange(len(notes), device="cuda"), last][:, ids].float()
        return float((five_way_logits(model, notes) - reference).abs().max())

    @torch.no_grad()
    def score(m, cases: list[dict]) -> dict:
        m.eval()
        results = []
        for i in range(0, len(cases), 32):
            chunk = cases[i : i + 32]
            probs = torch.softmax(five_way_logits(m, [c["text"] for c in chunk]), -1).cpu()
            for case, p in zip(chunk, probs):
                pick = QUEUES[int(p.argmax())]
                results.append({"text": case["text"][:80], "label": case["label"], "pick": pick,
                                "p": round(float(p.max()), 4), "set": case.get("set")})
        correct = sum(r["pick"] == r["label"] for r in results)
        by_set: dict[str, list[int]] = {}
        for r in results:
            s = by_set.setdefault(r["set"] or "all", [0, 0])
            s[0] += r["pick"] == r["label"]
            s[1] += 1
        return {"correct": correct, "n": len(results), "bySet": by_set,
                "misses": [r for r in results if r["pick"] != r["label"]][:40]}

    def score_all(m) -> dict:
        return {name: score(m, cases) for name, cases in evals.items()}

    report: dict = {"run": run, "hparams": HPARAMS, "base": f"{BASE}@{BASE_REVISION}"}
    report["projectionMaxAbsDiff"] = check_projection()
    assert report["projectionMaxAbsDiff"] < 0.25, report["projectionMaxAbsDiff"]
    report["before"] = score_all(model)

    rows = list(train_rows)
    random.shuffle(rows)
    n_val = max(50, len(rows) // 20)
    val, fit = rows[:n_val], rows[n_val:]
    report["split"] = {"fit": len(fit), "val": len(val)}

    config = LoraConfig(
        r=HPARAMS["rank"],
        lora_alpha=HPARAMS["alpha"],
        lora_dropout=HPARAMS["dropout"],
        target_modules=TARGET_MODULES,
        bias="none",
    )
    model = get_peft_model(model, config)
    model.print_trainable_parameters()
    model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
    model.enable_input_require_grads()
    optimiser = torch.optim.AdamW(
        [p for p in model.parameters() if p.requires_grad], lr=HPARAMS["lr"], weight_decay=HPARAMS["weight_decay"]
    )
    steps = HPARAMS["epochs"] * math.ceil(len(fit) / HPARAMS["batch"])
    warmup = max(1, int(steps * HPARAMS["warmup"]))
    scheduler = torch.optim.lr_scheduler.LambdaLR(
        optimiser,
        lambda s: min(1.0, (s + 1) / warmup) * 0.5 * (1 + math.cos(math.pi * min(1.0, s / steps))),
    )

    def targets(batch: list[dict]) -> torch.Tensor:
        t = torch.tensor([[r["target"][q] for q in QUEUES] for r in batch], device="cuda")
        eps = HPARAMS["smoothing"]
        return (1 - eps) * t + eps / len(QUEUES)

    @torch.no_grad()
    def val_loss() -> float:
        model.eval()
        total = 0.0
        for i in range(0, len(val), 32):
            chunk = val[i : i + 32]
            logp = F.log_softmax(five_way_logits(model, [r["text"] for r in chunk]), -1)
            total += float(-(targets(chunk) * logp).sum())
        return total / len(val)

    history = [{"step": 0, "val": val_loss()}]
    step = 0
    for epoch in range(HPARAMS["epochs"]):
        random.shuffle(fit)
        for i in range(0, len(fit), HPARAMS["batch"]):
            model.train()
            chunk = fit[i : i + HPARAMS["batch"]]
            logp = F.log_softmax(five_way_logits(model, [r["text"] for r in chunk]), -1)
            loss = -(targets(chunk) * logp).sum(-1).mean()
            loss.backward()
            torch.nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad], 1.0)
            optimiser.step()
            scheduler.step()
            optimiser.zero_grad(set_to_none=True)
            step += 1
            if step % 50 == 0:
                print(f"step {step}/{steps} loss {loss.item():.4f}", flush=True)
        history.append({"step": step, "epoch": epoch + 1, "val": val_loss()})
        print(history[-1], flush=True)
    report["history"] = history
    report["after"] = score_all(model)

    # Merge into copies of the original shards, keeping every key name and dtype, so the
    # checkpoint convert_weight reads differs from the one it was gated on only in values.
    out_dir = f"/vol/merged/{run}"
    shutil.rmtree(out_dir, ignore_errors=True)
    os.makedirs(out_dir)
    deltas: dict[str, torch.Tensor] = {}
    scale = HPARAMS["alpha"] / HPARAMS["rank"]
    for name, module in model.named_modules():
        if hasattr(module, "lora_A") and "default" in getattr(module, "lora_A", {}):
            a = module.lora_A["default"].weight.float()
            b = module.lora_B["default"].weight.float()
            key = name.replace("base_model.model.", "", 1) + ".weight"
            deltas[key] = (b @ a * scale).cpu()
    index = json.loads(Path(source, "model.safetensors.index.json").read_text())["weight_map"]
    missing = [k for k in deltas if k not in index]
    assert not missing, f"LoRA keys not in the checkpoint: {missing[:5]}"
    applied = 0
    for shard in sorted(set(index.values())):
        tensors = load_file(f"{source}/{shard}")
        for key in [k for k, s in index.items() if s == shard and k in deltas]:
            original = tensors[key]
            tensors[key] = (original.float() + deltas[key]).to(original.dtype).contiguous()
            applied += 1
        save_file(tensors, f"{out_dir}/{shard}", metadata={"format": "pt"})
    for name in os.listdir(source):
        if not name.endswith(".safetensors") and os.path.isfile(f"{source}/{name}"):
            shutil.copy(f"{source}/{name}", f"{out_dir}/{name}")
    report["merge"] = {"loraModules": len(deltas), "applied": applied}

    # Prove the merge: a fresh load of the merged shards must score as the adapter did.
    del model, optimiser
    torch.cuda.empty_cache()
    merged = AutoModelForImageTextToText.from_pretrained(out_dir, dtype=torch.bfloat16, device_map={"": 0})
    report["mergedCheck"] = score_all(merged)
    report["minutes"] = round((time.time() - started) / 60, 1)
    Path(out_dir, "train_report.json").write_text(json.dumps(report, indent=1))
    volume.commit()
    return report


@app.local_entrypoint()
def main(train_file: str, run: str, smoke: bool = False):
    import sys

    here = Path(__file__).resolve().parent
    sys.path.insert(0, str(here))
    from common import LOCAL_SYSTEM

    rows = json.loads(Path(train_file).read_text())
    evals = {}
    for name in ["cases", "heldout", "production", "test2"]:
        evals[name] = json.loads((here / "eval" / f"{name}.json").read_text())
    if smoke:  # the whole path (load, train, merge, reload) on a sliver
        rows = rows[:96]
        evals = {name: cases[:8] for name, cases in evals.items()}
        run = f"smoke-{run}"
    report = train.remote(run, LOCAL_SYSTEM, rows, evals)
    out = here / "runs" / f"{run}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(report, indent=1))
    summary = {
        phase: {name: f"{r['correct']}/{r['n']}" for name, r in report[phase].items()}
        for phase in ("before", "after", "mergedCheck")
    }
    print(json.dumps({"summary": summary, "history": report["history"], "merge": report["merge"],
                      "minutes": report["minutes"]}, indent=1))
