"""The "combo" method from the analysis, made fast with bitmasks.

Every delivery has a combination of causes (a 5-bit key). Fixing a set of causes moves a
delivery to the combination with those bits cleared and gives it that combination's
observed on-time rate (or keeps its own rate if that combination never occurs).
This is exactly analysis/root_cause_analysis.py::on_time_if_fixed.
"""
import itertools
import math
from typing import Callable, Iterable, Mapping

import numpy as np
import pandas as pd

from app.analytics.causes import CAUSES

CAUSE_LIST = list(CAUSES)
BIT = {c: 1 << i for i, c in enumerate(CAUSE_LIST)}


def mask_of(causes: Iterable[str]) -> int:
    m = 0
    for c in causes:
        m |= BIT[c]
    return m


class ComboModel:
    def __init__(self, df: pd.DataFrame):
        key = np.zeros(len(df), dtype=np.int64)
        for c in CAUSE_LIST:
            key |= df[c].to_numpy().astype(np.int64) * BIT[c]
        self.keys = key
        groups = pd.DataFrame({"k": key, "late": df["late"].to_numpy()}).groupby("k")["late"]
        self.rate: dict[int, float] = {int(k): 1 - v for k, v in groups.mean().items()}
        self.counts: dict[int, int] = {int(k): int(v) for k, v in groups.size().items()}

    def counts_for(self, selector: np.ndarray) -> dict[int, int]:
        """Combo counts for a subset of deliveries (boolean array aligned with the frame)."""
        vals, cnt = np.unique(self.keys[selector], return_counts=True)
        return {int(k): int(n) for k, n in zip(vals, cnt)}

    def rate_after(self, key: int, mask: int) -> float:
        return self.rate.get(key & ~mask, self.rate[key])

    def on_time_for_mask(self, mask: int, counts: Mapping[int, int] | None = None) -> float:
        counts = self.counts if counts is None else counts
        total = sum(n * self.rate_after(k, mask) for k, n in counts.items())
        return total / sum(counts.values())

    def on_time_if_fixed(self, fixed: Iterable[str], counts: Mapping[int, int] | None = None) -> float:
        return self.on_time_for_mask(mask_of(fixed), counts)

    def expected(self, effectiveness: Mapping[str, float], counts: Mapping[int, int] | None = None) -> float:
        """Partial fixes: each cause is removed from a delivery with probability = effectiveness.

        For one cause this is a straight line between today and fully fixed; for several it
        averages the combo method over every possible set of fixed causes.
        """
        return sum(w * self.on_time_for_mask(m, counts) for m, w in subset_weights(effectiveness))


def subset_weights(effectiveness: Mapping[str, float]) -> list[tuple[int, float]]:
    causes = [c for c, e in effectiveness.items() if e > 0]
    out = []
    for r in range(len(causes) + 1):
        for subset in itertools.combinations(causes, r):
            w = 1.0
            for c in causes:
                e = effectiveness[c]
                w *= e if c in subset else (1 - e)
            if w > 0:
                out.append((mask_of(subset), w))
    return out


def shapley(players: list[str], value: Callable[[frozenset], float]) -> dict[str, float]:
    """Average marginal gain of each player over every order of adding players."""
    cache: dict[frozenset, float] = {}

    def v(s):
        key = frozenset(s)
        if key not in cache:
            cache[key] = value(key)
        return cache[key]

    n = len(players)
    shares = {}
    for p in players:
        others = [o for o in players if o != p]
        gain = 0.0
        for r in range(n):
            for subset in itertools.combinations(others, r):
                weight = math.factorial(r) * math.factorial(n - r - 1) / math.factorial(n)
                gain += weight * (v(set(subset) | {p}) - v(set(subset)))
        shares[p] = gain
    return shares


def fair_share(model: ComboModel) -> dict[str, float]:
    """Shapley split of the on-time gain from fixing all five causes."""
    return shapley(CAUSE_LIST, lambda s: model.on_time_if_fixed(s))
