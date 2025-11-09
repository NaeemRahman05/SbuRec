import Papa from "papaparse";
import { deduplicateRows, normalizeRow } from "./compute";
import type { CourseRow } from "./types";

export async function parseCsvFiles(files: File[]): Promise<CourseRow[]> {
  const rows: CourseRow[] = [];
  for (const file of files) {
    const parsed = await parseFile(file);
    rows.push(...parsed);
  }
  return deduplicateRows(rows);
}

async function parseFile(file: File): Promise<CourseRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        if (results.errors.length > 0) {
          reject(results.errors[0]);
          return;
        }
        try {
          const mapped = (results.data ?? []).map((row) => normalizeRow(row));
          resolve(mapped);
        } catch (error) {
          reject(error);
        }
      },
      error: (error) => {
        reject(error);
      },
    });
  });
}

