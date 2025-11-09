#!/usr/bin/env python3
"""
Recombine existing rag parts under frontend/public/rag_parts/ into a single temp CSV
and re-split them strictly under the given max-bytes, writing to an output parts dir.

Usage:
  python scripts/recombine_and_resplit_rag.py --parts-dir frontend/public/rag_parts --out-dir frontend/public/rag_parts_strict --max-bytes 52428800

This is useful when only the oversize parts exist in the repo and the original rag_data.csv is missing.
"""
from __future__ import annotations
from pathlib import Path
import argparse
import csv
import shutil
import tempfile

from split_rag_data import split_csv


def recombine(parts_dir: Path, combined_path: Path) -> int:
    parts = sorted(parts_dir.glob("rag_data_part*.csv"))
    if not parts:
        raise FileNotFoundError(f"No parts found in {parts_dir}")
    with combined_path.open("w", encoding="utf-8", newline="") as fout:
        writer = None
        total = 0
        for i, p in enumerate(parts):
            with p.open("r", encoding="utf-8", newline="") as fin:
                reader = csv.reader(fin)
                try:
                    header = next(reader)
                except StopIteration:
                    continue
                if i == 0:
                    writer = csv.writer(fout)
                    writer.writerow(header)
                # write remaining rows
                for r in reader:
                    writer.writerow(r)
                    total += 1
    return total


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--parts-dir", default="frontend/public/rag_parts")
    p.add_argument("--out-dir", default="frontend/public/rag_parts_strict")
    p.add_argument("--max-bytes", type=int, default=50 * 1024 * 1024)
    args = p.parse_args()

    parts_dir = Path(args.parts_dir)
    out_dir = Path(args.out_dir)
    # Ensure combined path is absolute relative to repository root (two levels up from scripts/)
    combined = Path(__file__).resolve().parent.parent / "frontend" / "public" / "rag_data_combined.csv"

    print(f"Recombining parts from {parts_dir} -> {combined}")
    n = recombine(parts_dir, combined)
    print(f"Wrote combined CSV with {n} rows (excluding header)")

    print(f"Splitting combined CSV into {out_dir} with max {args.max_bytes} bytes per part")
    out_dir.mkdir(parents=True, exist_ok=True)
    # remove any existing strict parts to avoid confusion
    for f in out_dir.glob("rag_data_part*.csv"):
        f.unlink()
    parts = split_csv(combined, out_dir, args.max_bytes)
    print(f"Wrote {len(parts)} strict parts to {out_dir}")
    for p in parts:
        print(f"- {p} ({p.stat().st_size} bytes)")

    # optional: remove combined temp
    try:
        combined.unlink()
    except Exception:
        pass

if __name__ == '__main__':
    main()
