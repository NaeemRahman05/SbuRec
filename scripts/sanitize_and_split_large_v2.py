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

# First pass using csv.reader to count rows reliably
print('Counting rows (this may take a moment)...')
with open(SRC, 'r', encoding='utf-8', newline='') as f:
    reader = csv.reader(f)
    header = next(reader)
    row_count = 0
    for _ in reader:
        row_count += 1

if row_count <= 0:
    print('NO_ROWS')
    raise SystemExit(1)
chunk = math.ceil(row_count / NUM_PARTS)
print('Total data rows:', row_count, 'chunk size:', chunk)

# Prepare outputs (remove existing part files first)
for i in range(1, NUM_PARTS+1):
    p = f"{OUT_PREFIX}{i}.csv"
    if os.path.exists(p):
        os.remove(p)
        print('Removed old', p)

# Second pass: write rows into chunked part files with sanitization
with open(SRC, 'r', encoding='utf-8', newline='') as f:
    reader = csv.reader(f)
    header = next(reader)
    sbc_idx = None
    for i,h in enumerate(header):
        if h.strip().lower() == 'sbc':
            sbc_idx = i
            break
    print('SBC index:', sbc_idx)

    part_num = 1
    out_path = f"{OUT_PREFIX}{part_num}.csv"
    out_f = open(out_path, 'w', encoding='utf-8', newline='')
    writer = csv.writer(out_f)
    writer.writerow(header)
    written_in_part = 0
    total_written = 0

    for row in reader:
        if len(row) < len(header):
            row += [''] * (len(header) - len(row))
        elif len(row) > len(header):
            row = row[:len(header)]
        if sbc_idx is not None:
            raw = row[sbc_idx].strip()
            if raw:
                parts = re.split(r'[;,|]+', raw)
                kept = [p.strip() for p in parts if p.strip() and not re.fullmatch(r'\d+', p.strip()) and len(p.strip()) <= 6]
                row[sbc_idx] = ','.join(kept)
            else:
                row[sbc_idx] = ''
        writer.writerow(row)
        written_in_part += 1
        total_written += 1
        if written_in_part >= chunk and part_num < NUM_PARTS:
            out_f.close()
            print(f'Finished part {part_num} with {written_in_part} rows')
            part_num += 1
            out_path = f"{OUT_PREFIX}{part_num}.csv"
            out_f = open(out_path, 'w', encoding='utf-8', newline='')
            writer = csv.writer(out_f)
            writer.writerow(header)
            written_in_part = 0

    out_f.close()
    print('Finished final part', part_num, 'rows in final part', written_in_part)
    print('Total rows written:', total_written)

print('All done.')
