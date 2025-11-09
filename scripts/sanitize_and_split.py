#!/usr/bin/env python3
import csv
import glob
import os
import re
import math

DATA_DIR = os.path.join('frontend','public','data')
PATTERN = os.path.join(DATA_DIR, 'classie_evaluations_with_sbc*.csv')
OUT_PREFIX = os.path.join(DATA_DIR, 'classie_evaluations_with_sbc_part')

# Find files
files = sorted(glob.glob(PATTERN))
if not files:
    print('NO_INPUT_FILES')
    raise SystemExit(1)

print('Found files:', files)

# Read header from first file
with open(files[0], newline='', encoding='utf-8') as f:
    reader = csv.reader(f)
    header = next(reader)

# locate SBC column index case-insensitive
sbc_idx = None
for i, h in enumerate(header):
    if h.strip().lower() == 'sbc':
        sbc_idx = i
        break

all_rows = []

# Read and combine rows from all files
for path in files:
    print('Reading', path)
    with open(path, newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        hdr = next(reader, None)
        for row in reader:
            # normalize row length to header
            if len(row) < len(header):
                row += [''] * (len(header) - len(row))
            elif len(row) > len(header):
                row = row[:len(header)]
            # sanitize SBC if present
            if sbc_idx is not None:
                raw = row[sbc_idx].strip()
                if raw:
                    # split on common separators
                    parts = re.split(r'[;,|]+', raw)
                    kept = []
                    for p in parts:
                        tag = p.strip()
                        if not tag:
                            continue
                        # skip if all digits
                        if re.fullmatch(r'\d+', tag):
                            continue
                        # skip if longer than 6 chars
                        if len(tag) > 6:
                            continue
                        kept.append(tag)
                    row[sbc_idx] = ','.join(kept)
                else:
                    row[sbc_idx] = ''
            all_rows.append(row)

print('Total rows combined:', len(all_rows))

# Remove existing matched files (we'll create new 4 parts)
for path in files:
    try:
        os.remove(path)
        print('Removed old part', path)
    except Exception as e:
        print('Could not remove', path, e)

# Split into 4 roughly equal parts
n = len(all_rows)
if n == 0:
    print('NO_ROWS')
    raise SystemExit(1)
chunk = math.ceil(n / 4)

for i in range(4):
    start = i * chunk
    end = start + chunk
    part_rows = all_rows[start:end]
    out_path = f"{OUT_PREFIX}{i+1}.csv"
    print('Writing', out_path, 'rows:', len(part_rows))
    with open(out_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(part_rows)

print('Done.')
