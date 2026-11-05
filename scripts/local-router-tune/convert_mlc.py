"""Convert a Qwen3.5-4B checkpoint to web-llm's q4f16_1 format on Modal and optionally publish it.

The config and tokenizer files are copied from the official mlc-ai build MillOS pins
(mlc-ai/Qwen3.5-4B-q4f16_1-MLC @ 44b42469), so a converted checkpoint loads with the
same pinned WebGPU model library. Every converted tensor is compared with the official
build: for the unmodified base model they should all match in layout (and ideally in
bytes), which is the smoke test for this path. Adapted from CABAL's
scripts/qwen-routing-tune/convert_mlc.py (Qwen3-4B).

Run from the MillOS root, Modal credentials in the environment:
  modal run scripts/local-router-tune/convert_mlc.py --source Qwen/Qwen3.5-4B --no-publish
  modal run scripts/local-router-tune/convert_mlc.py --source /vol/merged/<run> \
      --repo NellWatson/Qwen3.5-4B-millos-routing-q4f16_1-MLC
"""

from __future__ import annotations

import json

import modal

OFFICIAL_REPO = "mlc-ai/Qwen3.5-4B-q4f16_1-MLC"
OFFICIAL_REVISION = "44b42469f9e192814bfd90440e3b377d89ba7a13"
COPIED_FILES = [
    "mlc-chat-config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "vocab.json",
    "merges.txt",
]

app = modal.App("millos-router-convert")
volume = modal.Volume.from_name("millos-router-tune", create_if_missing=True)
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")
    .pip_install(
        "huggingface_hub>=0.26",
        "safetensors",
        "numpy<2.3",
        "torch==2.5.1",
        # mlc_llm's own runtime imports, which its nightly wheel does not pull in
        "psutil",
        "fastapi",
        "uvicorn",
        "shortuuid",
        "tqdm",
        "requests",
        "prompt_toolkit",
        "pydantic",
        "ml_dtypes",
        "sentencepiece",
        "tiktoken",
        "transformers",
    )
    .pip_install(
        "mlc-llm-nightly-cpu",
        "mlc-ai-nightly-cpu",
        extra_options="--pre -f https://mlc.ai/wheels",
    )
    # The newest tvm-ffi (0.1.15.post2) segfaults in ReprPrint under this nightly pair;
    # pin the floor the TVM nightly declares.
    .pip_install("apache-tvm-ffi==0.1.13")
    # mlc-llm 0.26.dev6 predates the TVM nightly's stricter TIR well-formedness check,
    # which rejects RNNState's helper prim_funcs while convert_weight traces the model
    # for parameter names. Weight conversion never runs those functions; the tensor
    # comparison against the official build is what proves the output.
    .run_commands(
        "sed -i 's/@T.prim_func(s_tir=True)$/@T.prim_func(s_tir=True, check_well_formed=False)/' "
        "/usr/local/lib/python3.11/site-packages/mlc_llm/nn/rnn_state.py",
        "grep -c 'check_well_formed=False' /usr/local/lib/python3.11/site-packages/mlc_llm/nn/rnn_state.py",
    )
)


def _tensor_records(path: str) -> dict[str, dict]:
    with open(f"{path}/tensor-cache.json") as handle:
        cache = json.load(handle)
    records = {}
    for shard in cache["records"]:
        for record in shard["records"]:
            records[record["name"]] = {**record, "dataPath": shard["dataPath"]}
    return records


def _tensor_bytes(path: str, record: dict) -> bytes:
    with open(f"{path}/{record['dataPath']}", "rb") as handle:
        handle.seek(record["byteOffset"])
        return handle.read(record["nbytes"])


@app.function(
    image=image,
    volumes={"/vol": volume},
    secrets=[modal.Secret.from_name("huggingface-secret")],
    cpu=8,
    memory=32768,
    timeout=3600,
)
def convert(source: str, repo: str, compare: bool, publish: bool, card: str,
            official_repo: str = OFFICIAL_REPO, official_revision: str = OFFICIAL_REVISION,
            branch: str = "") -> dict:
    import os
    import subprocess

    from huggingface_hub import HfApi, snapshot_download

    token = os.environ["HF_TOKEN"]
    work = "/tmp/work"
    os.makedirs(work, exist_ok=True)
    if source.startswith("/vol/"):
        volume.reload()
        source_dir = source
    else:
        # Cached on the volume so a retry does not fetch 8 GB again.
        source_dir = snapshot_download(
            source,
            local_dir=f"/vol/hf/{source.replace('/', '--')}",
            token=token,
            allow_patterns=["*.json", "*.safetensors", "*.txt", "*.jinja"],
        )
        volume.commit()
    out = f"{work}/mlc"
    result = subprocess.run(
        [
            "python",
            "-m",
            "mlc_llm",
            "convert_weight",
            source_dir,
            "--quantization",
            "q4f16_1",
            "--model-type",
            "qwen3_5",
            "--device",
            "cpu",
            "-o",
            out,
        ],
        capture_output=True,
        text=True,
        env={**os.environ, "TVM_BACKTRACE": "1"},
    )
    if result.returncode != 0:
        noise = "Cannot parse target features"
        lines = [l for l in (result.stdout + result.stderr).splitlines() if noise not in l]
        return {"source": source, "convertFailed": result.returncode, "log": lines[-80:]}
    official = snapshot_download(
        official_repo,
        revision=official_revision,
        local_dir=f"{work}/official",
        allow_patterns=COPIED_FILES + (["*.json", "params_shard_*"] if compare else []),
    )
    for name in COPIED_FILES:
        subprocess.run(["cp", f"{official}/{name}", f"{out}/{name}"], check=True)

    ours = _tensor_records(out)
    report: dict = {"source": source, "tensors": len(ours)}
    if compare:
        theirs = _tensor_records(official)
        report["officialTensors"] = len(theirs)
        report["missing"] = sorted(set(theirs) - set(ours))
        report["extra"] = sorted(set(ours) - set(theirs))
        identical, layout, differing = 0, [], []
        for name in sorted(set(ours) & set(theirs)):
            a, b = ours[name], theirs[name]
            if (a["shape"], a["dtype"], a["format"]) != (b["shape"], b["dtype"], b["format"]):
                layout.append({"name": name, "ours": a, "official": b})
                continue
            x, y = _tensor_bytes(out, a), _tensor_bytes(official, b)
            if x == y:
                identical += 1
                continue
            import numpy as np

            entry: dict = {"name": name, "dtype": a["dtype"]}
            if a["dtype"] in ("float16", "bfloat16", "float32"):
                kind = {"float16": np.float16, "float32": np.float32}.get(a["dtype"])
                if kind is None:  # bfloat16 -> view as uint16, widen to float32
                    xa = (np.frombuffer(x, np.uint16).astype(np.uint32) << 16).view(np.float32)
                    ya = (np.frombuffer(y, np.uint16).astype(np.uint32) << 16).view(np.float32)
                else:
                    xa = np.frombuffer(x, kind).astype(np.float32)
                    ya = np.frombuffer(y, kind).astype(np.float32)
                diff = np.abs(xa - ya)
                scale = np.maximum(np.abs(ya), 1e-8)
                entry["valuesChanged"] = round(float(np.mean(diff > 0)), 6)
                entry["maxRelDiff"] = float(np.max(diff / scale))
                entry["meanRelDiff"] = float(np.mean(diff / scale))
            elif a["dtype"] == "uint32":  # eight int4 codes per word
                xa = np.frombuffer(x, np.uint32)
                ya = np.frombuffer(y, np.uint32)
                codes_x = np.stack([(xa >> (4 * k)) & 0xF for k in range(8)]).astype(np.int8)
                codes_y = np.stack([(ya >> (4 * k)) & 0xF for k in range(8)]).astype(np.int8)
                delta = np.abs(codes_x - codes_y)
                entry["codesChanged"] = round(float(np.mean(delta > 0)), 6)
                entry["maxCodeDelta"] = int(delta.max())
            else:
                entry["changedByteFraction"] = round(sum(1 for i, j in zip(x, y) if i != j) / len(x), 6)
            differing.append(entry)
        report["identical"] = identical
        report["layoutMismatches"] = layout[:20]
        report["layoutMismatchCount"] = len(layout)
        report["differingCount"] = len(differing)
        floats = [d for d in differing if "maxRelDiff" in d]
        codes = [d for d in differing if "codesChanged" in d]
        report["summary"] = {
            "floatTensorsDiffering": len(floats),
            "floatMaxRelDiff": max((d["maxRelDiff"] for d in floats), default=0.0),
            "floatMeanValuesChanged": sum(d["valuesChanged"] for d in floats) / max(len(floats), 1),
            "packedTensorsDiffering": len(codes),
            "packedMaxCodesChanged": max((d["codesChanged"] for d in codes), default=0.0),
            "packedMaxCodeDelta": max((d["maxCodeDelta"] for d in codes), default=0),
            "other": [d for d in differing if "changedByteFraction" in d][:10],
        }
        report["differing"] = sorted(
            differing, key=lambda d: -(d.get("maxRelDiff") or d.get("codesChanged") or 0)
        )[:12]

    if publish:
        api = HfApi(token=token)
        api.create_repo(repo, repo_type="model", exist_ok=True, private=False)
        if card:
            with open(f"{out}/README.md", "w") as handle:
                handle.write(card)
        # A candidate goes to its own branch, so main (and its card) moves only once it passes.
        if branch:
            api.create_branch(repo, branch=branch, exist_ok=True)
        commit = api.upload_folder(
            folder_path=out,
            repo_id=repo,
            revision=branch or None,
            commit_message=f"q4f16_1 conversion of {source} with {official_repo} config {official_revision[:12]}",
        )
        report["revision"] = commit.oid
        report["branch"] = branch or "main"
        report["repo"] = repo
    return report


@app.function(image=image, timeout=600)
def probe() -> dict:
    import importlib.metadata as md
    import subprocess

    from mlc_llm.model import MODELS

    help_text = subprocess.run(
        ["python", "-m", "mlc_llm", "convert_weight", "--help"], capture_output=True, text=True
    )
    def requires(dist: str) -> list[str]:
        try:
            return [r for r in (md.requires(dist) or []) if "tvm" in r.lower() or "ffi" in r.lower()]
        except md.PackageNotFoundError:
            return []

    installed = {
        d.metadata["Name"]: d.version
        for d in md.distributions()
        if any(k in d.metadata["Name"].lower() for k in ("tvm", "ffi", "mlc"))
    }
    return {
        "installed": installed,
        "tvmRequires": requires("mlc-ai-nightly-cpu"),
        "mlcRequires": requires("mlc-llm-nightly-cpu"),
        "mlc_llm": md.version("mlc-llm-nightly-cpu"),
        "tvm": md.version("mlc-ai-nightly-cpu"),
        "hasQwen35": "qwen3_5" in MODELS,
        "qwenTypes": sorted(m for m in MODELS if m.startswith("qwen")),
        "convertHelpOk": help_text.returncode == 0,
    }


@app.local_entrypoint()
def main(
    source: str = "",
    repo: str = "",
    compare: bool = True,
    publish: bool = True,
    card_file: str = "",
    probe_only: bool = False,
    official_repo: str = OFFICIAL_REPO,
    official_revision: str = OFFICIAL_REVISION,
    branch: str = "",
):
    if probe_only:
        print(json.dumps(probe.remote(), indent=2))
        return
    if publish and not repo:
        raise SystemExit("--repo is required when publishing")
    card = open(card_file).read() if card_file else ""
    report = convert.remote(source, repo, compare, publish, card, official_repo, official_revision, branch)
    print(json.dumps(report, indent=2))
