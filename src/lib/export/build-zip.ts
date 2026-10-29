import { strToU8, zipSync } from "fflate";
import { buildCsvFiles } from "./csv";
import type { ExportData } from "./tables";

/** The one zip: four CSVs plus data.json with every table in full (including raw bank payloads). */
export function buildZip(data: ExportData, exportedAt: Date): Uint8Array {
  const files: Record<string, string> = {
    ...buildCsvFiles(data),
    "data.json": JSON.stringify({ exported_at: exportedAt.toISOString(), tables: data }, null, 1),
  };
  // ponytail: whole zip is built in memory; a streaming Zip if a real export ever hits the tab limit.
  return zipSync(Object.fromEntries(Object.entries(files).map(([n, t]) => [n, strToU8(t)])));
}

export const exportFileName = (day: string) => `myfinances-export-${day}.zip`;
