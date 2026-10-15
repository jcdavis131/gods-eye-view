#!/usr/bin/env python3
"""TimesFM-2.5-200m zero-shot challenger (M3 challenger b).

Univariate per series (PROGRAM.md 2.2): for each task, the context is the
task's own history; the median quantile (0.5) is the point forecast.
Checkpoint: google/timesfm-2.5-200m-pytorch (Apache-2.0) — the only TimesFM
allowed near anything shipped. TimesFM-3.0 weights are NEVER touched.

Walk-forward mirrors multitower_v0: yearly test windows starting 2012,
7-day horizon, metrics in original units, baselines recomputed on the same
frames (persistence = value at t, seasonal naive = t-364, direction vs 0.5
and vs majority class). TimesFM is zero-shot, so the 14-day purge is
vacuous (no training) — the context for day t uses only data on/before t,
strictly causal.

Honest exits (3), never fake weights or synthesize data:
- huggingface.co unreachable within 120s ->
    {"status": 503, "error": "CHECKPOINT_STAGING_REQUIRED"}
- missing frames dir or missing task column -> same 503-style exit 3.
- CUDA unavailable -> exit 3 (runs on the Alienware RTX 4080).

Outputs (in --out-dir):
- timesfm_zeroshot_metrics.json  (per-task, per-year windows + means)
- timesfm_zeroshot_report.md    (verdict table vs baselines, wins AND losses)
"""
import argparse
import json
import os
import sys
import urllib.request

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", ".."))
from dataops import common as C  # noqa: E402

MODEL_ID = "timesfm_zeroshot"
REPO_ID = "google/timesfm-2.5-200m-pytorch"
FIRST_TEST_YEAR = 2012
HORIZON = 7
CONTEXT = 512
BATCH = 64
HF_TIMEOUT_S = 120

DEFAULT_TASKS = ("gas_fwd7,gas_dir_7d,wti_fwd7,quake_fwd7,"
                 "natgas_fwd7,natgas_dir_7d")

# Kinds for the M3 task set (tasks.json registry is v0's; these merge in).
KIND_OVERRIDES = {
    "gas_fwd7": {"kind": "reg", "unit": "$/gal"},
    "gas_dir_7d": {"kind": "clf", "unit": "P(up)"},
    "wti_fwd7": {"kind": "reg", "unit": "$/bbl"},
    "quake_fwd7": {"kind": "count", "unit": "events/day"},
    "natgas_fwd7": {"kind": "reg", "unit": "$/MMBtu"},
    "natgas_dir_7d": {"kind": "clf", "unit": "P(up)"},
}
# Direction tasks forecast the move of this task's underlying price series.
DIR_PRICE_SRC = {"gas_dir_7d": "gas_fwd7", "natgas_dir_7d": "natgas_fwd7"}


def fail_json(status, error):
    print(json.dumps({"status": status, "error": error}))
    sys.exit(3)


def check_hf_reachable():
    url = f"https://huggingface.co/api/models/{REPO_ID}"
    req = urllib.request.Request(url, headers={"User-Agent": C.UA})
    try:
        with urllib.request.urlopen(req, timeout=HF_TIMEOUT_S) as r:
            if r.status != 200:
                raise RuntimeError(f"HTTP {r.status}")
    except Exception:
        fail_json(503, "CHECKPOINT_STAGING_REQUIRED")


def load_model(device):
    try:
        import torch
        from transformers import TimesFmModelForPrediction
    except Exception:
        fail_json(503, "TRANSFORMERS_TIMESFM_REQUIRED")
    if not torch.cuda.is_available():
        fail_json(503, "CUDA_REQUIRED")
    try:
        model = TimesFmModelForPrediction.from_pretrained(REPO_ID)
    except Exception:
        fail_json(503, "CHECKPOINT_STAGING_REQUIRED")
    model.to(device).eval()
    q = list(model.config.quantiles)
    q50_idx = 1 + q.index(0.5)  # full_predictions: [:, :, 0]=mean, 1:=quantiles
    return model, torch, q50_idx


def task_kind(task):
    if task in KIND_OVERRIDES:
        return KIND_OVERRIDES[task]["kind"]
    if task.endswith("_dir_7d"):
        return "clf"
    if task.startswith("quake"):
        return "count"
    return "reg"


def build_series(frame, task):
    """Return (series, target, kind).

    series[i] = the task's own history value at row i's date (for fwd7
    tasks: value at t = target shifted back HORIZON rows on a daily frame).
    For direction tasks the series is the paired price series and the
    target is the binary direction label.
    """
    kind = task_kind(task)
    if kind == "clf":
        src = DIR_PRICE_SRC.get(task)
        if src is None or src not in frame.columns:
            return None
        price = frame[src].to_numpy(dtype=np.float64)
        series = np.full_like(price, np.nan)
        series[HORIZON:] = price[:-HORIZON]
        try:
        target = frame[task].to_numpy(dtype=np.float64)
    except KeyError:
        return None
        return series, target, kind
    if task not in frame.columns:
        return None
    tgt = frame[task].to_numpy(dtype=np.float64)
    series = np.full_like(tgt, np.nan)
    series[HORIZON:] = tgt[:-HORIZON]
    return series, tgt, kind


def score_task(model, torch, q50_idx, device, frame, task, series, target,
               kind, test_years):
    rows = []
    dates = frame["date"]
    for Y in test_years:
        t0 = pd.Timestamp(f"{Y}-01-01")
        te_mask = (dates >= t0) & (dates < t0 + pd.DateOffset(years=1))
        te_idx = np.where(te_mask)[0]
        # days with a finite label and a full finite 512-day causal context
        days = [i for i in te_idx
                if np.isfinite(target[i]) and i - CONTEXT + 1 >= 0
                and np.isfinite(series[i - CONTEXT + 1:i + 1]).all()]
        skipped = len(te_idx) - len(days)
        if len(days) < 30:
            rows.append({"year": Y, "n_test": len(days),
                         "n_skipped": skipped, "note": "too few days"})
            continue
        preds = np.full(len(days), np.nan)
        with torch.no_grad():
            for s in range(0, len(days), BATCH):
                chunk = days[s:s + BATCH]
                ctx = torch.tensor(
                    np.stack([series[i - CONTEXT + 1:i + 1] for i in chunk]),
                    dtype=torch.float32, device=device)
                out = model(past_values=[ctx[b] for b in range(len(chunk))],
                            freq=[0] * len(chunk),
                            forecast_context_len=CONTEXT,
                            truncate_negative=(kind == "count"))
                q50 = out.full_predictions[:, HORIZON - 1, q50_idx]
                preds[s:s + BATCH] = q50.detach().cpu().numpy()
        y_true = target[days]
        row = {"year": Y, "n_test": len(days), "n_skipped": skipped}
        if kind == "clf":
            phat = (preds > np.array([series[i] for i in days])).astype(float)
            acc = float((phat == y_true).mean())
            row[f"{task}_acc"] = round(acc, 4)
            row[f"{task}_acc_base05"] = 0.5
            row[f"{task}_acc_basetmaj"] = round(
                float(max(y_true.mean(), 1 - y_true.mean())), 4)
        else:
            mae = float(np.mean(np.abs(preds - y_true)))
            row[f"{task}_mae"] = round(mae, 4)
            s = np.array([series[i] for i in days])
            row[f"{task}_mae_persist"] = round(
                float(np.mean(np.abs(s - y_true))), 4)
            seas_ok = [(i, series[i - 364]) for i in days
                       if i - 364 >= 0 and np.isfinite(series[i - 364])]
            if len(seas_ok) > 30:
                idx = [i for i, _ in seas_ok]
                sv = np.array([v for _, v in seas_ok])
                row[f"{task}_mae_seas364"] = round(
                    float(np.mean(np.abs(sv - target[idx]))), 4)
        rows.append(row)
        key = f"{task}_mae" if kind != "clf" else f"{task}_acc"
        print(f"  {task} {Y}: {key.split('_', 1)[1]}={row.get(key)} "
              f"(n={len(days)}, skipped={skipped})")
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tasks", default=DEFAULT_TASKS)
    ap.add_argument("--frames-dir", default=None)
    ap.add_argument("--out-dir", default=None)
    args = ap.parse_args()
    tasks = [t.strip() for t in args.tasks.split(",") if t.strip()]

    frames_dir = args.frames_dir or C.root_path("frames")
    fpath = os.path.join(frames_dir, "multitower_daily.csv")
    if not os.path.exists(fpath):
        fail_json(503, f"FRAMES_MISSING: {fpath}")
    frame = pd.read_csv(fpath, parse_dates=["date"])

    built = {}
    for t in tasks:
        got = build_series(frame, t)
        if got is None:
            fail_json(503, f"TASK_COLUMN_MISSING: {t}")
        built[t] = got

    last_year = frame["date"].dt.year.max()
    first_possible = max(FIRST_TEST_YEAR, frame["date"].dt.year.min() + 4)
    test_years = list(range(first_possible, last_year))  # last full year
    if not test_years:
        fail_json(503, "FRAME_TOO_SHORT")
    print(f"walk-forward test years: {test_years[0]}..{test_years[-1]}")

    check_hf_reachable()
    import torch  # noqa: F401  (checked inside load_model too)
    device = torch.device("cuda")
    model, torch, q50_idx = load_model(device)
    print(f"checkpoint: {REPO_ID} on {torch.cuda.get_device_name(0)}")

    all_rows, per_task = [], {}
    for t in tasks:
        series, target, kind = built[t]
        rows = score_task(model, torch, q50_idx, device, frame, t,
                          series, target, kind, test_years)
        per_task[t] = rows
        for r in rows:
            rr = dict(r)
            rr["task"] = t
            all_rows.append(rr)

    out_dir = args.out_dir or os.path.join(HERE, "models", MODEL_ID)
    os.makedirs(out_dir, exist_ok=True)
    wdf = pd.DataFrame(all_rows)
    metrics = {"model": MODEL_ID, "checkpoint": REPO_ID,
               "context": CONTEXT, "horizon_days": HORIZON,
               "point": "median quantile (0.5)",
               "purge_note": "zero-shot: no training, 14-day purge vacuous; "
                             "context strictly causal (data on/before t)",
               "windows": all_rows,
               "mean": {c: round(float(wdf[c].mean()), 4)
                        for c in wdf.columns
                        if c not in ("year", "task", "note")}}
    with open(os.path.join(out_dir, "timesfm_zeroshot_metrics.json"),
              "w") as f:
        json.dump(metrics, f, indent=2)
    wdf.to_csv(os.path.join(out_dir, "timesfm_zeroshot_windows.csv"),
               index=False)
    write_report(out_dir, metrics, tasks)
    print(f"\nsaved {out_dir}/ "
          f"(timesfm_zeroshot_metrics.json, timesfm_zeroshot_report.md)")


def write_report(out_dir, metrics, tasks):
    mean = metrics["mean"]
    lines = [f"# {MODEL_ID} — walk-forward evaluation", "",
             f"TimesFM-2.5-200m zero-shot ({metrics['checkpoint']}), "
             "univariate per series, median quantile (0.5) point forecast, "
             f"context {CONTEXT}d, horizon {HORIZON}d.",
             "Expanding yearly test windows from 2012, strictly causal "
             "context, metrics in original units. Baselines recomputed on "
             "the same frames: persistence (value at t), seasonal naive "
             "(t-364), majority class. Zero-shot: no training, so the "
             "14-day purge is vacuous.", "",
             "| task | model | persistence | seasonal-364 | verdict |",
             "|---|---|---|---|---|"]
    verdicts = []
    for t in tasks:
        kind = task_kind(t)
        if kind == "clf":
            acc, maj = mean.get(f"{t}_acc"), mean.get(f"{t}_acc_basetmaj")
            if acc is None:
                continue
            v = "beats majority" if maj is not None and acc > maj \
                else "below majority"
            verdicts.append((t, v))
            lines += ["", f"Direction ({t}): model acc {acc} vs 0.5 coin / "
                          f"{maj} majority — {v}."]
            continue
        mae, per, seas = (mean.get(f"{t}_mae"),
                          mean.get(f"{t}_mae_persist"),
                          mean.get(f"{t}_mae_seas364"))
        if mae is None:
            continue
        won = [name for name, b in (("persistence", per), ("seasonal", seas))
               if b is not None and np.isfinite(b) and mae < b]
        v = "beats " + "+".join(won) if won else "BELOW baselines"
        verdicts.append((t, v))
        lines.append(f"| {t} | {mae} | {per} | {seas} | {v} |")
    lines += ["", "## Per-year detail", "",
              "See `timesfm_zeroshot_windows.csv` for the year-by-year "
              "breakdown (includes n_skipped for days without a full "
              "causal context)."]
    report = "\n".join(lines) + "\n"
    with open(os.path.join(out_dir, "timesfm_zeroshot_report.md"), "w") as f:
        f.write(report)
    print(report)
    print("verdicts:", verdicts)


if __name__ == "__main__":
    main()
