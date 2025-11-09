#!/usr/bin/env python3
import csv
import os
import re
import math

SRC = os.path.join('frontend','public','classie_evaluations_with_sbc.csv')
OUT_PREFIX = os.path.join('frontend','public','classie_evaluations_with_sbc_part')
NUM_PARTS = 4

if not os.path.exists(SRC):
    print('SRC_NOT_FOUND', SRC)
    raise SystemExit(1)

# First pass: count data rows (exclude header)
with open(SRC, 'r', encoding='utf-8', newline='') as f:
    total = sum(1 for _ in f) - 1
if total <= 0:
    print('NO_ROWS')
    raise SystemExit(1)
chunk = math.ceil(total / NUM_PARTS)
print('Total rows (excl. header):', total, 'chunk size:', chunk)

# Second pass: stream, sanitize, write to part files
with open(SRC, 'r', encoding='utf-8', newline='') as f:
    reader = csv.reader(f)
    header = next(reader)
    # find SBC index
    sbc_idx = None
    for i,h in enumerate(header):
        if h.strip().lower() == 'sbc':
            sbc_idx = i
            break
    print('SBC column index:', sbc_idx)

    part_idx = 1
    out_path = f"{OUT_PREFIX}{part_idx}.csv"
    out_f = open(out_path, 'w', encoding='utf-8', newline='')
    writer = csv.writer(out_f)
    writer.writerow(header)
    written = 0
    total_written = 0

    for row in reader:
        # normalize row length
        if len(row) < len(header):
            row += [''] * (len(header) - len(row))
        elif len(row) > len(header):
            row = row[:len(header)]
        # sanitize SBC
        if sbc_idx is not None:
            raw = row[sbc_idx].strip()
            if raw:
                parts = re.split(r'[;,|]+', raw)
                kept = []
                for p in parts:
                    tag = p.strip()
                    if not tag:
                        continue
                    if re.fullmatch(r'\d+', tag):
                        continue
                    if len(tag) > 6:
                        continue
                    kept.append(tag)
                row[sbc_idx] = ','.join(kept)
            else:
                row[sbc_idx] = ''
        writer.writerow(row)
        written += 1
        total_written += 1
        if written >= chunk and part_idx < NUM_PARTS:
            out_f.close()
            print(f'Wrote {written} rows to {out_path}')
            part_idx += 1
            out_path = f"{OUT_PREFIX}{part_idx}.csv"
            out_f = open(out_path, 'w', encoding='utf-8', newline='')
            writer = csv.writer(out_f)
            writer.writerow(header)
            written = 0

    out_f.close()
    print('Total written rows:', total_written)

print('Done.')
