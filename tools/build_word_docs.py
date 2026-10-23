"""Convert docs/0*.md into Word files with the Mermaid diagrams rendered as images.

Needs: pandoc, and npx (Node) for @mermaid-js/mermaid-cli. Optional env MERMAID_PUPPETEER_CONFIG
pointing to a puppeteer JSON config (e.g. a local Chromium path).
Run: python tools/build_word_docs.py   ->  docs/downloads/*.docx
"""
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUT = DOCS / "downloads"


def render(block, png, puppeteer):
    src = png.with_suffix(".mmd")
    src.write_text(block)
    cmd = ["npx", "-y", "@mermaid-js/mermaid-cli@11.4.2", "-i", str(src), "-o", str(png), "-w", "1600", "-b", "white"]
    if puppeteer:
        cmd += ["-p", puppeteer]
    subprocess.run(cmd, check=True, capture_output=True, timeout=180)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    puppeteer = os.environ.get("MERMAID_PUPPETEER_CONFIG")
    sources = sorted(DOCS.glob("0*.md"))
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        for md in sources:
            count = [0]

            def swap(match):
                count[0] += 1
                png = tmp / f"{md.stem}-{count[0]}.png"
                render(match.group(1), png, puppeteer)
                return f"![]({png})\n"

            text = re.sub(r"```mermaid\n(.*?)```", swap, md.read_text(), flags=re.S)
            staged = tmp / md.name
            staged.write_text(text)
            target = OUT / f"{md.stem}.docx"
            subprocess.run(["pandoc", str(staged), "-o", str(target), "--resource-path", str(DOCS)], check=True)
            print(f"{target.relative_to(ROOT)}  ({count[0]} diagrams)")


if __name__ == "__main__":
    sys.exit(main())
