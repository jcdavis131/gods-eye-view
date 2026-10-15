#!/usr/bin/env python3
"""Walk-forward trainer for the PyTorch multi-tower model (multitower_v1).

M3 challenger (c): faithful PyTorch port of the v0 NumPy protocol.

Protocol (identical to v0, see ml/multitower/train.py):
- Expanding windows: for each test year Y in [FIRST_TEST_YEAR, last full
  year], train on all rows with date < Y-01-01 minus a 14-day purge,
  validate on the last 365 train days (early stopping), test on
  [Y-01-01, Y+1-01-01).
- No lookahead: features are strictly positive lags (enforced at frame
  build); the purge keeps train labels from touching the test year's
  feature window.
- Baselines per task: persistence (value at t) and seasonal naive (t-364);
  classification vs 0.5 and vs majority class. Baselines are read from the
  frame's ref_* columns when present, else derived exactly from the task
  column (value at t = fwd target shifted back 7 rows on a daily frame —
  mathematically identical to v0's ref-column approach).
- Metrics are reported in ORIGINAL units.

Deviations from v0 (documented, not hidden):
- Init draws come from torch's RNG (same distributions as v0's numpy RNG).
- v0's Adam adds wd*p to the gradient (L2-style); torch Adam's
  weight_decay does exactly the same thing.
- New M3 task columns (gas_dir_7d, natgas_fwd7, natgas_dir_7d) are picked
  up automatically when present in the frame, with kinds from
  KIND_OVERRIDES below; tasks.json itself is untouched.

Requires CUDA. Exits 3 (honest, no training) when CUDA is unavailable.

Saves ml/multitower/models/multitower_v1/: config.json, metrics.json,
windows.csv, REPORT.md, weights_final.pt, scalers_final.json.
"""
import json
import os
import sys
from datetime import date  # noqa: F401  (parity with v0 imports)

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", ".."))
from dataops import common as C  # noqa: E402
from ml.multitower.model_torch import MultiTowerTorch  # noqa: E402

import torch
import torch.nn as nn

MODEL_ID = "multitower_v1"
FIRST_TEST_YEAR = 2012
PURGE_DAYS = 14
VAL_DAYS = 365
EPOCHS, PATIENCE, BATCH = 400, 30, 1024
LR, WD = 3e-3, 1e-4
HORIZON = 7

# M3 columns not present in the v0 tasks.json registry. tasks.json itself
# is left untouched; these merge in when the frame carries the column.
KIND_OVERRIDES = {
    "gas_dir_7d": {"kind": "clf", "unit": "P(up)", "weight": 0.5},
    "natgas_fwd7": {"kind": "reg", "unit": "$/MMBtu", "weight": 1.0},
    "natgas_dir_7d": {"kind": "clf", "unit": "P(up)", "weight": 0.5},
}
# Direction tasks forecast the move of this task's underlying price series.
DIR_PRICE_SRC = {"gas_dir_7d": "gas_fwd7", "natgas_dir_7d": "natgas_fwd7"}

REF_FOR = {"gas_fwd7": "ref_gas", "wti_fwd7": "ref_wti",
           "quake_fwd7": "ref_q25", "natgas_fwd7": "ref_natgas"}


def fail(msg):
    print(f"HONEST_503 {msg}", file=sys.stderr)
    sys.exit(3)


def load_tasks():
    with open(os.path.join(HERE, "tasks.json")) as f:
        cfg = json.load(f)
    tasks = dict(cfg["tasks"])
    tasks.update(KIND_OVERRIDES)
    cfg["tasks"] = tasks
    return cfg


def prepare(df: pd.DataFrame, task_cfg: dict, tower_prefix: dict):
    tasks = {t: c for t, c in task_cfg["tasks"].items()
             if t in df.columns and df[t].notna().sum() > 100}
    towers = {name: [c for c in df.columns if c.startswith(pre)]
              for name, pre in tower_prefix.items()}
    towers = {n: cols for n, cols in towers.items() if cols}
    return tasks, towers


def standardize_fit(X):
    mu, sd = X.mean(axis=0), X.std(axis=0)
    sd = np.where(sd < 1e-12, 1.0, sd)
    return mu, sd


def baseline_series(frame: pd.DataFrame, task: str, kind: str):
    """Value-at-t series for persistence / seasonal baselines.

    Uses the frame's ref_* column when present; otherwise derives it exactly
    from the task column (value at t = fwd target shifted back HORIZON rows
    on a daily frame). For direction tasks, uses the paired price series.
    """
    src = DIR_PRICE_SRC.get(task, task)
    ref = REF_FOR.get(src)
    if ref and ref in frame.columns:
        return frame[ref].to_numpy(dtype=np.float64)
    tgt = frame[src].to_numpy(dtype=np.float64)
    out = np.full_like(tgt, np.nan)
    out[HORIZON:] = tgt[:-HORIZON]
    return out


def main(frames_dir=None):
    if not torch.cuda.is_available():
        fail("CUDA unavailable — multitower_v1 trains on the Alienware GPU")
    device = torch.device("cuda")
    print(f"device: {torch.cuda.get_device_name(0)}")

    frames_dir = frames_dir or C.root_path("frames")
    fpath = os.path.join(frames_dir, "multitower_daily.csv")
    if not os.path.exists(fpath):
        fail(f"frames dir missing multitower_daily.csv: {frames_dir}")
    task_cfg = load_tasks()
    frame = pd.read_csv(fpath, parse_dates=["date"])
    tasks, towers = prepare(frame, task_cfg, task_cfg["tower_prefix"])
    print(f"tasks: {list(tasks)} | towers: "
          f"{ {k: len(v) for k, v in towers.items()} } | rows: {len(frame)}")
    if not tasks:
        fail("no usable task targets in multitower_daily.csv")

    last_year = frame["date"].dt.year.max()
    first_possible = max(FIRST_TEST_YEAR, frame["date"].dt.year.min() + 4)
    test_years = list(range(first_possible, last_year))  # last full year
    if not test_years:
        fail("frame too short for walk-forward eval")
    print(f"walk-forward test years: {test_years[0]}..{test_years[-1]}")

    X_all = {n: torch.tensor(frame[cols].to_numpy(dtype=np.float32),
                             device=device)
             for n, cols in towers.items()}
    y_all = {t: frame[t].to_numpy(dtype=np.float64) for t in tasks}
    dates = frame["date"]
    base_all = {t: baseline_series(frame, t, tasks[t]["kind"]) for t in tasks}

    window_rows = []
    final_artifacts = None

    for Y in test_years:
        t0 = pd.Timestamp(f"{Y}-01-01")
        tr_mask = dates < (t0 - pd.Timedelta(days=PURGE_DAYS))
        te_mask = (dates >= t0) & (dates < t0 + pd.DateOffset(years=1))
        tr_idx = np.where(tr_mask)[0]
        te_idx = np.where(te_mask)[0]
        if len(te_idx) < 30 or len(tr_idx) < 1000:
            print(f"  {Y}: skip (train {len(tr_idx)}, test {len(te_idx)})")
            continue
        va_idx = tr_idx[-VAL_DAYS:]
        tr_idx = tr_idx[:-VAL_DAYS]
        tr_t = torch.tensor(tr_idx, device=device)
        va_t = torch.tensor(va_idx, device=device)

        # scalers fit on train(+val) only — all strictly before the test year
        fit_idx = np.concatenate([tr_idx, va_idx])
        tmu = {n: standardize_fit(X_all[n][fit_idx].cpu().numpy())
               for n in towers}
        Xs = {n: (X_all[n] - torch.tensor(tmu[n][0], device=device))
              / torch.tensor(tmu[n][1], device=device) for n in towers}

        ycfg, ymu = {}, {}
        for t, c in tasks.items():
            kind = c["kind"]
            y = y_all[t]
            if kind == "count":
                y = np.log1p(np.clip(y, 0, None))
            if kind in ("reg", "count"):
                mu, sd = y[fit_idx].mean(), y[fit_idx].std()
                sd = sd if sd > 1e-12 else 1.0
                ymu[t] = (mu, sd, kind)
                ycfg[t] = torch.tensor((y - mu) / sd, dtype=torch.float32,
                                       device=device)
            else:
                ymu[t] = (0.0, 1.0, kind)
                ycfg[t] = torch.tensor(y, dtype=torch.float32, device=device)

        model = MultiTowerTorch(
            {n: len(cols) for n, cols in towers.items()},
            tasks=list(tasks), seed=1000 + Y).to(device)
        opt = torch.optim.Adam(model.parameters(), lr=LR, weight_decay=WD)
        w = torch.tensor([tasks[t]["weight"] for t in tasks],
                         dtype=torch.float32, device=device)
        bce = nn.BCEWithLogitsLoss(reduction="mean")
        mse = nn.MSELoss(reduction="mean")

        def batch_loss(idxs):
            xb = {n: Xs[n][idxs] for n in towers}
            preds = model(xb)
            loss, parts = 0.0, {}
            for j, t in enumerate(tasks):
                kind = tasks[t]["kind"]
                p, y = preds[t], ycfg[t][idxs]
                if kind == "clf":
                    l = bce(p, y)
                else:
                    l = mse(p, y)
                loss = loss + w[j] * l
                parts[t] = float(l.detach().cpu())
            return loss, parts

        best, best_state, bad = float("inf"), None, 0
        rng = np.random.default_rng(Y)
        for ep in range(EPOCHS):
            model.train()
            perm = rng.permutation(tr_idx)
            for s in range(0, len(perm), BATCH):
                idxs = torch.tensor(perm[s:s + BATCH], device=device)
                opt.zero_grad()
                loss, _ = batch_loss(idxs)
                loss.backward()
                opt.step()
            model.eval()
            with torch.no_grad():
                vloss, _ = batch_loss(va_t)
            vloss = float(vloss.cpu())
            if vloss < best - 1e-6:
                best, bad = vloss, 0
                best_state = {k: v.detach().cpu().clone()
                              for k, v in model.state_dict().items()}
            else:
                bad += 1
                if bad >= PATIENCE:
                    break
        model.load_state_dict({k: v.to(device)
                               for k, v in best_state.items()})

        # ---- score the test year in original units ----
        model.eval()
        te_t = torch.tensor(te_idx, device=device)
        with torch.no_grad():
            preds = {t: p.detach().cpu().numpy()
                     for t, p in model(
                         {n: Xs[n][te_t] for n in towers}).items()}
        row = {"year": Y, "n_test": len(te_idx), "epochs": ep + 1,
               "val_loss": round(float(best), 4)}
        for t, c in tasks.items():
            kind = c["kind"]
            mu, sd, _ = ymu[t]
            y_true = y_all[t][te_idx]
            if kind == "clf":
                phat = (1 / (1 + np.exp(-np.clip(preds[t], -30, 30))) > 0.5
                        ).astype(float)
                acc = float((phat == y_true).mean())
                row[f"{t}_acc"] = round(acc, 4)
                row[f"{t}_acc_base05"] = 0.5
                maj = float(max(y_true.mean(), 1 - y_true.mean()))
                row[f"{t}_acc_basetmaj"] = round(maj, 4)
            else:
                phat = preds[t] * sd + mu
                if kind == "count":
                    phat = np.expm1(np.clip(phat, 0, 10))
                mae = float(np.abs(phat - y_true).mean())
                row[f"{t}_mae"] = round(mae, 4)
                base = base_all[t]
                row[f"{t}_mae_persist"] = round(
                    float(np.abs(base[te_idx] - y_true).mean()), 4)
                s_idx = te_idx - 364
                ok = (s_idx >= 0) & np.isfinite(base[s_idx])
                if ok.sum() > 30:
                    row[f"{t}_mae_seas364"] = round(
                        float(np.abs(base[s_idx[ok]] - y_true[ok]).mean()), 4)
        window_rows.append(row)
        print(f"  {Y}: " + " ".join(
            f"{t}={row.get(f'{t}_mae', row.get(f'{t}_acc'))}" for t in tasks))
        final_artifacts = (model, tmu, ymu, towers, tasks)

    outdir = os.path.join(HERE, "models", MODEL_ID)
    os.makedirs(outdir, exist_ok=True)
    model, tmu, ymu, towers, tasks = final_artifacts
    torch.save(model.state_dict(), os.path.join(outdir, "weights_final.pt"))
    with open(os.path.join(outdir, "scalers_final.json"), "w") as f:
        json.dump({"towers": {n: {"mean": mu.tolist(), "std": sd.tolist()}
                              for n, (mu, sd) in tmu.items()},
                   "targets": {t: {"mean": float(mu), "std": float(sd),
                                   "kind": kind}
                               for t, (mu, sd, kind) in ymu.items()},
                   "tower_cols": towers,
                   "tasks": list(tasks),
                   "trained_on": f"{first_possible}..{test_years[-1]}"}, f)
    with open(os.path.join(outdir, "config.json"), "w") as f:
        json.dump({"model": MODEL_ID, "tower_h": 32, "trunk_h": 64,
                   "epochs": EPOCHS, "patience": PATIENCE, "batch": BATCH,
                   "lr": LR, "wd": WD, "purge_days": PURGE_DAYS,
                   "val_days": VAL_DAYS, "first_test_year": FIRST_TEST_YEAR,
                   "horizon_days": HORIZON, "framework": "pytorch",
                   "trained_at": C.utcnow(),
                   "frame": "multitower_daily.csv"}, f, indent=2)
    wdf = pd.DataFrame(window_rows)
    wdf.to_csv(os.path.join(outdir, "windows.csv"), index=False)
    metrics = {"model": MODEL_ID, "windows": window_rows,
               "mean": {c: round(float(wdf[c].mean()), 4)
                        for c in wdf.columns if c != "year"}}
    with open(os.path.join(outdir, "metrics.json"), "w") as f:
        json.dump(metrics, f, indent=2)
    write_report(outdir, metrics)
    print(f"\nsaved {outdir}/ "
          f"(weights_final.pt, metrics.json, windows.csv, REPORT.md)")


def write_report(outdir, metrics):
    mean = metrics["mean"]
    lines = [f"# {MODEL_ID} — walk-forward evaluation", "",
             "Expanding-window refits, 14-day purge, strictly out-of-sample. "
             "Baselines: persistence (value at t), seasonal naive (t-364), "
             "majority class. PyTorch port of multitower_v0 — same protocol, "
             "same metric definitions.", "",
             "| task | model | persistence | seasonal-364 | verdict |",
             "|---|---|---|---|---|"]
    verdicts = []
    for t in sorted(mean):
        if not t.endswith("_mae") or t in ("_mae",):
            continue
        base = t[:-4]
        mae, per, seas = (mean.get(t), mean.get(f"{base}_mae_persist"),
                          mean.get(f"{base}_mae_seas364"))
        if mae is None:
            continue
        won = [name for name, b in (("persistence", per), ("seasonal", seas))
               if b is not None and mae < b]
        v = "beats " + "+".join(won) if won else "BELOW baselines"
        verdicts.append((base, v))
        lines.append(f"| {base} | {mae} | {per} | {seas} | {v} |")
    for t in sorted(mean):
        if not t.endswith("_acc") or "_acc_" in t:
            continue
        base = t[:-4]
        acc, maj = mean.get(t), mean.get(f"{base}_acc_basetmaj")
        if acc is None:
            continue
        v = "beats majority" if maj is not None and acc > maj \
            else "below majority"
        verdicts.append((base, v))
        lines += ["", f"Direction ({base}): model acc {acc} vs 0.5 coin / "
                      f"{maj} majority — {v}."]
    lines += ["", "## Per-year detail", "",
              "See `windows.csv` for the year-by-year breakdown."]
    report = "\n".join(lines) + "\n"
    with open(os.path.join(outdir, "REPORT.md"), "w") as f:
        f.write(report)
    print(report)
    print("verdicts:", verdicts)


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames-dir", default=None)
    args = ap.parse_args()
    main(frames_dir=args.frames_dir)
