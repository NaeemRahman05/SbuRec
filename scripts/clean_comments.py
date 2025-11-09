#!/usr/bin/env python3
"""
Clean comment fields in CSV files by removing any trailing footer text that
starts with the copyright marker used in the exported Classie pages.

Usage:
  # produce cleaned copies under frontend/public/cleaned/
  python scripts/clean_comments.py

  # overwrite originals (use with caution)
  python scripts/clean_comments.py --inplace

The script looks for header columns named 'Valuable Comments' and
'Improvement Comments' (case-sensitive by default in these CSVs) and
truncates any content in those fields beginning with any of the markers in
UNWANTED_MARKERS.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import csv
import re
from typing import List


UNWANTED_MARKERS: List[str] = [
    "Copyright © 2024 Stony Brook University Division",
    "Report an Accessibility Barrier",
    "Classie Evaluation Explorer - Version",
    "|Submit Service Ticket"
]


def clean_field(s: str) -> str:
    if not s:
        return s
    # find earliest occurrence of any marker and truncate there
    idxs = [s.find(m) for m in UNWANTED_MARKERS if s.find(m) != -1]
    if not idxs:
        return s
    cut = min(idxs)
    cleaned = s[:cut].rstrip()
    # also remove awkward leftover separators like multiple pipes or repeated spaces/newlines
    cleaned = re.sub(r"[\r\n]+", " ", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    return cleaned


def process_file(path: Path, inplace: bool = False) -> Path:
    path = path.resolve()
    if not path.exists():
        raise FileNotFoundError(path)
    out_dir = path.parent / "cleaned"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = path if inplace else (out_dir / path.name)

    with path.open("r", encoding="utf-8", newline="") as fin:
        reader = csv.reader(fin)
        rows = list(reader)

    if not rows:
        print(f"Skipping empty file: {path}")
        return out_path

    header = rows[0]
    # find comment columns
    def find_col(name: str) -> int | None:
        try:
            return header.index(name)
        except ValueError:
            return None

    val_idx = find_col("Valuable Comments")
    imp_idx = find_col("Improvement Comments")

    if val_idx is None and imp_idx is None:
        print(f"No comment columns found in {path.name}; copying unchanged.")
        # just copy
        with out_path.open("w", encoding="utf-8", newline="") as fout:
            writer = csv.writer(fout)
            writer.writerows(rows)
        return out_path

    new_rows = [header]
    for r in rows[1:]:
        # ensure row has same length as header
        if len(r) < len(header):
            r = r + [""] * (len(header) - len(r))
        new_r = list(r)
        if val_idx is not None:
            new_r[val_idx] = clean_field(new_r[val_idx])
        if imp_idx is not None:
            new_r[imp_idx] = clean_field(new_r[imp_idx])
        new_rows.append(new_r)

    with out_path.open("w", encoding="utf-8", newline="") as fout:
        writer = csv.writer(fout)
        writer.writerows(new_rows)

    print(f"Wrote cleaned file: {out_path}")
    return out_path


def main() -> None:
    p = argparse.ArgumentParser(description="Clean Copyright/footer text from CSV comment fields")
    p.add_argument("--inplace", action="store_true", help="Overwrite the original CSV files")
    # default to any classie CSVs (includes classie_missing_with_sbc.csv and split parts)
    p.add_argument("--pattern", default="classie_*.csv", help="Glob pattern under frontend/public to process")
    args = p.parse_args()

    base = Path(__file__).resolve().parent.parent / "frontend" / "public"
    files = sorted(base.glob(args.pattern))
    if not files:
        print(f"No files matched under {base} with pattern {args.pattern}")
        return

    for f in files:
        try:
            process_file(f, inplace=args.inplace)
        except Exception as e:
            print(f"Error processing {f}: {e}")

    # After processing, write a manifest of cleaned files so the frontend can enumerate them
    cleaned_dir = base / "cleaned"
    if cleaned_dir.exists():
        cleaned_files = [p.name for p in sorted(cleaned_dir.glob("*.csv"))]
        manifest_path = cleaned_dir / "index.json"
        try:
            import json

            with manifest_path.open("w", encoding="utf-8") as mf:
                json.dump(cleaned_files, mf, indent=2)
            print(f"Wrote manifest: {manifest_path} ({len(cleaned_files)} files)")
        except Exception as e:
            print(f"Failed to write manifest {manifest_path}: {e}")


if __name__ == "__main__":
    main()
