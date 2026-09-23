#!/usr/bin/env python3
"""
Runs every configured AI provider on the same inputs so you can compare quality side by side.

  uv run python scripts/compare_ai_providers.py PHOTO.jpg GUIDE.jpg [--values '{"noseBridge": 0.6}'] [--angle front]

PHOTO is a front photo of the person; GUIDE is the edited 3D preview (the app's compare screen can
export one with the download button). Keys come from services/api/.env (BM_GEMINI_API_KEY,
BM_OPENAI_API_KEY). Results are written next to GUIDE as GUIDE-gemini.jpg, GUIDE-openai.jpg.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ai_render import (  # noqa: E402
    AiRenderError,
    GeminiProvider,
    OpenAIProvider,
    RenderRequest,
    build_prompt,
    normalise_jpeg,
)
from app.config import get_settings  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("photo", type=Path)
    parser.add_argument("guide", type=Path)
    parser.add_argument("--values", default="{}", help="look values as JSON, e.g. '{\"jawline\": 0.5}'")
    parser.add_argument("--angle", default="front", choices=["front", "left", "right", "custom"])
    args = parser.parse_args()

    s = get_settings()
    providers = []
    if s.gemini_api_key:
        providers.append(GeminiProvider(s.gemini_api_key, s.gemini_image_model, s.ai_timeout_seconds))
    if s.openai_api_key:
        providers.append(OpenAIProvider(s.openai_api_key, s.openai_image_model, s.ai_timeout_seconds))
    if not providers:
        raise SystemExit("Set BM_GEMINI_API_KEY and/or BM_OPENAI_API_KEY in services/api/.env first.")

    request = RenderRequest(
        photo_jpg=args.photo.read_bytes(),
        guide_jpg=args.guide.read_bytes(),
        prompt=build_prompt(json.loads(args.values), args.angle),
    )
    for provider in providers:
        started = time.perf_counter()
        try:
            image = normalise_jpeg(provider.render(request))
        except AiRenderError as exc:
            print(f"{provider.name} ({provider.model}): failed - {exc}")
            continue
        out = args.guide.with_name(f"{args.guide.stem}-{provider.name}.jpg")
        out.write_bytes(image)
        print(f"{provider.name} ({provider.model}): {time.perf_counter() - started:.1f}s -> {out}")


if __name__ == "__main__":
    main()
