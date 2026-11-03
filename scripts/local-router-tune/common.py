"""Shared pieces for the on-device router tune: the app's own rubric and the teacher calls.

The rubric strings are read out of src/utils/jevClient.ts at import time rather than
copied, so a change to the app's prompt changes the training prompt with it (and the
frozen eval sets record which prompt they were labelled under).
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
JEV_CLIENT = ROOT / "src/utils/jevClient.ts"
HERE = Path(__file__).resolve().parent

QUEUES = [
    "Equipment maintenance",
    "Product quality",
    "Logistics coordination",
    "No current incident",
    "Insufficient evidence",
]


def _ts_string(source: str, name: str) -> str:
    """The value of `const NAME = '...'` (possibly split over concatenated literals)."""
    match = re.search(rf"const {name} =\s*((?:\s*'(?:[^'\\]|\\.)*'\s*\+?)+);", source)
    if not match:
        raise RuntimeError(f"{name} not found in {JEV_CLIENT}")
    parts = re.findall(r"'((?:[^'\\]|\\.)*)'", match.group(1))
    return "".join(p.replace("\\'", "'") for p in parts)


def _descriptions(source: str) -> dict[str, str]:
    start = source.index("export const JEV_QUEUE_DESCRIPTIONS")
    block = source[start : source.index("};", start)]
    found = dict(re.findall(r"'([^']+)':\s*\n?\s*'((?:[^'\\]|\\.)*)'", block))
    if list(found) != QUEUES:
        raise RuntimeError(f"queue descriptions changed shape: {list(found)}")
    return found


_SOURCE = JEV_CLIENT.read_text()
BASE_QUESTION = _ts_string(_SOURCE, "BASE_QUESTION")
INJECTION_GUARD = _ts_string(_SOURCE, "INJECTION_GUARD")
QUESTION = BASE_QUESTION + INJECTION_GUARD
DESCRIPTIONS = _descriptions(_SOURCE)
DESCRIBED_QUEUES = "\n\nQueues:\n" + "\n".join(f"- {q}: {DESCRIPTIONS[q]}" for q in QUEUES)
# requestLocalAdvice's system prompt, byte for byte.
LOCAL_SYSTEM = f"{QUESTION}{DESCRIBED_QUEUES}\n\nAnswer with the queue name only."
# What the Qwen3.5 build renders for one system + user turn with enable_thinking:false
# (QWEN_RAW_TEMPLATE in webgpuClient.ts, with the system turn the chat API sends).
QWEN_PROMPT = (
    "<|im_start|>system\n{system}<|im_end|>\n<|im_start|>user\n{user}<|im_end|>\n"
    "<|im_start|>assistant\n<think>\n\n</think>\n\n"
)
# LOCAL_QUEUE_TOKENS for Qwen3.5-4B 44b42469 (same tokenizer.json as Qwen/Qwen3.5-4B).
QUEUE_TOKEN_IDS = [56315, 4662, 2132, 2665, 15020]
PROMPT_SHA = hashlib.sha256(LOCAL_SYSTEM.encode()).hexdigest()[:16]


def render(note: str) -> str:
    return QWEN_PROMPT.format(system=LOCAL_SYSTEM, user=note.strip())


def file_sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# --------------------------------------------------------------------------- teachers


def jev_label(session, api_key: str, note: str, retries: int = 3) -> dict:
    """Jev 1.14 through OpenRouter's Decisions API, the request body the app sends."""
    body = {
        "model": "typesafe/jev-1.14",
        "state": note.strip(),
        "questions": {
            "decision": {"type": "choice", "instructions": QUESTION, "criteria": DESCRIPTIONS}
        },
        "provider": {"only": ["typesafe"], "allow_fallbacks": False},
    }
    last = None
    for attempt in range(retries):
        try:
            response = session.post(
                "https://openrouter.ai/api/alpha/decisions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                data=json.dumps(body),
                timeout=60,
            )
            if response.status_code in (429, 500, 502, 503, 504):
                last = f"http {response.status_code}"
                time.sleep(2 * (attempt + 1))
                continue
            response.raise_for_status()
            payload = response.json()
            answer = _find_decision(payload)
            probabilities = {q: float(answer["probabilities"][q]) for q in QUEUES}
            total = sum(probabilities.values())
            if not math.isclose(total, 1.0, abs_tol=0.03) or answer["choice"] not in QUEUES:
                raise ValueError(f"unusable Jev answer {answer}")
            return {
                "choice": answer["choice"],
                "probabilities": {q: p / total for q, p in probabilities.items()},
                "cost": (payload.get("usage") or {}).get("cost"),
            }
        except (ValueError, KeyError) as error:
            last = repr(error)
            break
        except Exception as error:  # network
            last = repr(error)
            time.sleep(2 * (attempt + 1))
    return {"error": last}


def _find_decision(payload: dict) -> dict:
    """The decision object, wherever the alpha API nests it (mirrors jevClient's parser)."""
    stack = [payload]
    while stack:
        node = stack.pop()
        if isinstance(node, dict):
            if "choice" in node and "probabilities" in node:
                return node
            stack.extend(node.values())
        elif isinstance(node, list):
            stack.extend(node)
    raise KeyError("no decision in Jev response")


HAIKU_SCHEMA = {
    "type": "object",
    "properties": {"queue": {"type": "string", "enum": QUEUES}},
    "required": ["queue"],
    "additionalProperties": False,
}


def haiku_label(client, note: str) -> dict:
    """Claude Haiku 5.5 on the same rubric, with the app's structured output."""
    import anthropic

    try:
        message = client.messages.create(
            model="claude-haiku-5-5",
            max_tokens=256,
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": HAIKU_SCHEMA}},
            system=QUESTION + DESCRIBED_QUEUES,
            messages=[{"role": "user", "content": note.strip()}],
        )
    except anthropic.APIStatusError as error:
        return {"error": f"{error.status_code} {error.message}"}
    except anthropic.APIConnectionError as error:
        return {"error": repr(error)}
    if message.stop_reason != "end_turn":
        return {"error": f"stop_reason {message.stop_reason}"}
    text = next((b.text for b in message.content if b.type == "text"), "")
    queue = json.loads(text).get("queue")
    return {"choice": queue} if queue in QUEUES else {"error": f"bad queue {text!r}"}
