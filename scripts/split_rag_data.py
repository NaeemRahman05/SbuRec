#!/usr/bin/env python3
"""
Split a large CSV into parts each smaller than a target size (default 50 MB).
Writes parts to `frontend/public/rag_parts/` as `rag_data_part01.csv`, `rag_data_part02.csv`, ...

Usage:
  python scripts/split_rag_data.py --src frontend/public/rag_data.csv --out-dir frontend/public/rag_parts --max-bytes 52428800

If src is missing, the script will exit with a helpful message.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import csv
import os
import io

DEFAULT_MAX = 50 * 1024 * 1024  # 50 MB


def split_csv(src: Path, out_dir: Path, max_bytes: int = DEFAULT_MAX) -> list[Path]:
    src = src.resolve()
    if not src.exists():
        raise FileNotFoundError(f"Source CSV not found: {src}")
    out_dir = out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    parts = []
    with src.open("r", encoding="utf-8", newline="") as fin:
        reader = csv.reader(fin)
        try:
            header = next(reader)
        except StopIteration:
            raise ValueError("Source CSV is empty")

        part_idx = 1
        current_path = out_dir / f"rag_data_part{part_idx:02d}.csv"
        fout = current_path.open("w", encoding="utf-8", newline="")
        writer = csv.writer(fout)
        writer.writerow(header)
        parts.append(current_path)

        # Pre-serialize header to bytes so we can track strict byte sizes
        sio = io.StringIO()
        hwriter = csv.writer(sio)
        hwriter.writerow(header)
        header_str = sio.getvalue()
        header_bytes = header_str.encode("utf-8")
        # reset current file with header already written in text mode
        fout.seek(0)
        fout.truncate()
        fout.write(header_str)
        fout.flush()
        current_bytes = len(header_bytes)

        for row in reader:
            # serialize row to determine its byte length when written
            sio = io.StringIO()
            rwriter = csv.writer(sio)
            rwriter.writerow(row)
            row_str = sio.getvalue()
            row_bytes = row_str.encode("utf-8")

            # if single row is too large to ever fit (after header), abort to avoid infinite loop
            if len(row_bytes) > max_bytes - len(header_bytes):
                fout.close()
                raise ValueError(f"Single CSV row exceeds max part size ({len(row_bytes)} bytes) - cannot split strictly under {max_bytes} bytes")

            # rotate before writing if it would exceed the max_bytes
            if current_bytes + len(row_bytes) > max_bytes:
                fout.close()
                part_idx += 1
                current_path = out_dir / f"rag_data_part{part_idx:02d}.csv"
                fout = current_path.open("w", encoding="utf-8", newline="")
                # write header to new part
                fout.write(header_str)
                fout.flush()
                writer = csv.writer(fout)
                current_bytes = len(header_bytes)
                parts.append(current_path)

            # write the row (text) and update current_bytes by actual encoded size
            fout.write(row_str)
            fout.flush()
            current_bytes += len(row_bytes)

        fout.close()

    return parts


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--src", default="frontend/public/rag_data.csv", help="Source CSV to split")
    p.add_argument("--out-dir", default="frontend/public/rag_parts", help="Directory to write parts")
    p.add_argument("--max-bytes", type=int, default=DEFAULT_MAX, help="Max bytes per part")
    args = p.parse_args()

    src = Path(args.src)
    out_dir = Path(args.out_dir)
    try:
        parts = split_csv(src, out_dir, args.max_bytes)
        print(f"Wrote {len(parts)} parts to {out_dir}")
        for p in parts:
            print(f"- {p} ({p.stat().st_size} bytes)")
    except Exception as e:
        print(f"Error: {e}")


if __name__ == '__main__':
    main()
