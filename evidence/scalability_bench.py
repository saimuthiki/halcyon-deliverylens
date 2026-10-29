"""Time the loader and the main API endpoints on the real data (x1) and on a copy made N times bigger.

Run from the repo root with the backend's Python (no server, no AWS, mock AI):
    backend/.venv/Scripts/python.exe evidence/scalability_bench.py 1
    backend/.venv/Scripts/python.exe evidence/scalability_bench.py 10

For a factor above 1 the script writes a bigger copy of data/halcyon-dataset into a temp folder: every
delivery is repeated N times with a new delivery_id (D000001 -> R01D000001 ...), and the SLA penalties
are repeated with it. The real data in the repo is never changed. Each run uses a fresh SQLite file.
Numbers are wall-clock times on the machine that runs it (one process, one request at a time).
"""
import os
import shutil
import sys
import tempfile
import time
import tracemalloc
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
FACTOR = int(sys.argv[1]) if len(sys.argv) > 1 else 1
TMP = Path(tempfile.mkdtemp(prefix=f"deliverylens-bench-x{FACTOR}-"))
sys.path.insert(0, str(REPO / "backend"))
os.environ["DATABASE_URL"] = f"sqlite:///{TMP / 'bench.db'}"
os.environ["LLM_PROVIDER"] = "mock"
os.environ["AGENT_RATE_LIMIT_PER_MIN"] = "0"
os.environ["DEMO_TOKEN"] = ""
os.environ.pop("S3_BUCKET", None)
os.environ.pop("APP_SECRET_ID", None)

import pandas as pd  # noqa: E402

SRC = REPO / "data" / "halcyon-dataset"


def make_data_dir() -> Path:
    if FACTOR == 1:
        return SRC
    out = TMP / "data"
    shutil.copytree(SRC, out)
    d = pd.read_csv(SRC / "deliveries.csv", dtype=str, keep_default_na=False)
    p = pd.read_csv(SRC / "sla_penalties.csv", dtype=str, keep_default_na=False)
    ds, ps = [d], [p]
    for i in range(1, FACTOR):
        tag = f"R{i:02d}"
        d2 = d.copy()
        d2["delivery_id"] = tag + d2["delivery_id"]
        d2["order_id"] = tag + d2["order_id"]
        p2 = p.copy()
        p2["delivery_id"] = tag + p2["delivery_id"]
        p2["penalty_id"] = tag + p2["penalty_id"]
        ds.append(d2)
        ps.append(p2)
    pd.concat(ds).to_csv(out / "deliveries.csv", index=False)
    pd.concat(ps).to_csv(out / "sla_penalties.csv", index=False)
    return out


def timed(label, fn, rows):
    t0 = time.perf_counter()
    r = fn()
    ms = (time.perf_counter() - t0) * 1000
    rows.append((label, ms))
    return r


def main() -> None:
    import app.config as _config

    _config._load_dotenv = lambda: None
    data_dir = make_data_dir()
    size_mb = (data_dir / "deliveries.csv").stat().st_size / 1e6
    from fastapi.testclient import TestClient

    from app.analytics.store import get_dataset, reset_cache
    from app.db import get_engine
    from app.loader import load_all
    from app.main import app

    rows: list[tuple[str, float]] = []
    counts = timed("Loader: CSV -> SQLite (python -m app.loader)", lambda: load_all(get_engine(), data_dir), rows)
    reset_cache()
    tracemalloc.start()
    timed("First request: read DB, tag 5 causes, fit models (cold cache)", get_dataset, rows)
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    calls = [
        ("GET /api/kpis", "GET", "/api/kpis", None),
        ("GET /api/causes", "GET", "/api/causes", None),
        ("POST /api/simulate (all 5 fixes at 80%)", "POST", "/api/simulate",
         {"fixes": {c: 0.8 for c in ["incomplete_address", "same_day_after_cutoff", "stock_not_at_nearest",
                                     "weak_carrier_lane", "route_deviation"]}}),
        ("POST /api/simulate/late-orders (replay)", "POST", "/api/simulate/late-orders", {}),
        ("GET /api/vendor-assessment", "GET", "/api/vendor-assessment", None),
        ("GET /api/roi", "GET", "/api/roi", None),
        ("GET /api/carriers/scorecard", "GET", "/api/carriers/scorecard", None),
        ("GET /api/carriers/claims (penalty recovery)", "GET", "/api/carriers/claims", None),
        ("GET /api/risk-board (one morning)", "GET", "/api/risk-board", None),
        ("GET /api/risk-board/backtest (Aug-Sep)", "GET", "/api/risk-board/backtest", None),
        ("POST /api/desk/process-all (11 emails, mock AI)", "POST", "/api/desk/process-all", None),
    ]
    statuses = []
    with TestClient(app, raise_server_exceptions=False) as c:
        for label, method, path, body in calls:
            r = timed(label, (lambda m=method, p=path, b=body: c.request(m, p, json=b)), rows)
            statuses.append(r.status_code)
    print(f"## Factor x{FACTOR}: {counts['deliveries']:,} deliveries, {counts['sla_penalties']:,} SLA penalties, "
          f"deliveries.csv {size_mb:.1f} MB")
    print(f"Peak Python memory while building the in-memory dataset: {peak / 1e6:.0f} MB (tracemalloc)\n")
    print("| Step | Time (ms) |")
    print("|---|---|")
    for label, ms in rows:
        print(f"| {label} | {ms:,.0f} |")
    print(f"\nHTTP status codes: {statuses} (all 200 = no errors)")
    shutil.rmtree(TMP, ignore_errors=True)


if __name__ == "__main__":
    main()
