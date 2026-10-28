"""Email templates (Jinja2). Every email has <name>.html (autoescaped) and <name>.txt (plain-text alternative).

Autoescaping is on for .html, so text from an AI model or a client can never inject markup. Templates fail
on an undefined variable instead of rendering a blank.
"""
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

TEMPLATE_DIR = Path(__file__).resolve().parent / "templates"


@dataclass(frozen=True)
class RenderedEmail:
    html: str
    text: str


def pct(x) -> str:
    return "n/a" if x is None else f"{x * 100:.1f}%"


def points(x) -> str:
    return "n/a" if x is None else f"{x:+.1f} points"


def usd(x) -> str:
    return f"${x:,.0f}"


def num(x) -> str:
    return f"{x:,}"


@lru_cache
def environment() -> Environment:
    env = Environment(loader=FileSystemLoader(TEMPLATE_DIR), undefined=StrictUndefined,
                      autoescape=select_autoescape(enabled_extensions=("html",), default_for_string=True,
                                                   default=False),
                      trim_blocks=True, lstrip_blocks=True)
    env.filters.update(pct=pct, points=points, usd=usd, num=num)
    return env


def render(template: str, context: dict) -> str:
    return environment().get_template(template).render(**context).strip() + "\n"


def render_email(name: str, context: dict) -> RenderedEmail:
    return RenderedEmail(html=render(f"{name}.html", context), text=render(f"{name}.txt", context))
