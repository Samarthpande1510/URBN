"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/** True for file names we can render with the spreadsheet parser. */
export function isSpreadsheet(fileName: string | null | undefined): boolean {
  if (!fileName) return false;
  return /\.(xlsx|xlsm|csv)$/i.test(fileName);
}

type Sheet = { name: string; rows: string[][] };

/** Format a single ExcelJS cell value into display text. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" });
  }
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.text === "string") return v.text;                       // hyperlink / rich text
    if (Array.isArray(v.richText)) return v.richText.map((r) => (r as { text?: string }).text ?? "").join("");
    if ("result" in v) return cellText(v.result);                        // formula → cached result
    if ("error" in v) return String(v.error);
    return "";
  }
  return String(value);
}

export function SpreadsheetPreview({ url, fileName, height = 420 }: {
  url: string;
  fileName: string;
  height?: number | string;
}) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSheets(null); setError(null); setActive(0);

    (async () => {
      try {
        const buf = await api.files.content(url);
        // Loaded on demand — the parser is large and most reports are PDFs.
        const ExcelJS = (await import("exceljs")).default;
        const wb = new ExcelJS.Workbook();
        if (/\.csv$/i.test(fileName)) {
          const text = new TextDecoder().decode(buf);
          const rows = text.split(/\r?\n/).map((line) => line.split(","));
          if (!cancelled) setSheets([{ name: "Sheet1", rows }]);
          return;
        }
        await wb.xlsx.load(buf);
        const parsed: Sheet[] = [];
        wb.eachSheet((ws) => {
          const rows: string[][] = [];
          ws.eachRow({ includeEmpty: true }, (row) => {
            const cells: string[] = [];
            // row.values is 1-indexed with a leading hole
            const values = (row.values as unknown[]) ?? [];
            for (let i = 1; i < Math.max(values.length, 1); i++) cells.push(cellText(values[i]));
            rows.push(cells);
          });
          parsed.push({ name: ws.name, rows });
        });
        if (!cancelled) setSheets(parsed);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not preview this file.");
      }
    })();

    return () => { cancelled = true; };
  }, [url, fileName]);

  if (error) {
    return (
      <div className="rounded-md border border-[#bfdbfe]/40 bg-[#f8faff] px-4 py-3">
        <p className="text-xs text-[#94a3b8]">{error}</p>
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#1d4ed8] hover:underline">
          Download {fileName} instead →
        </a>
      </div>
    );
  }

  if (!sheets) {
    return (
      <div className="flex items-center justify-center rounded-md border border-[#bfdbfe]/40 bg-[#f8faff]" style={{ height }}>
        <p className="text-xs text-[#94a3b8]">Loading preview…</p>
      </div>
    );
  }

  const sheet = sheets[active];
  const isEmpty = !sheet || sheet.rows.every((r) => r.every((c) => !c.trim()));

  return (
    <div className="rounded-md border border-[#bfdbfe]/40 overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-[#bfdbfe]/30 bg-[#f8faff] px-3 py-2">
        <div className="flex gap-1 flex-wrap min-w-0">
          {sheets.map((s, i) => (
            <button key={s.name + i} onClick={() => setActive(i)}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${i === active
                ? "bg-[#2563eb] text-white"
                : "bg-white border border-[#bfdbfe]/50 text-[#64748b] hover:bg-[#eff6ff]"}`}>
              {s.name}
            </button>
          ))}
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="shrink-0 text-[11px] text-[#1d4ed8] hover:underline">Download</a>
      </div>
      <div className="overflow-auto bg-white" style={{ maxHeight: height }}>
        {isEmpty ? (
          <p className="px-4 py-6 text-center text-xs text-[#94a3b8]">This sheet is empty.</p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <tbody>
              {sheet.rows.map((row, ri) => (
                <tr key={ri} className={ri === 0 ? "bg-[#eff6ff] font-semibold sticky top-0" : "even:bg-[#f8faff]"}>
                  <td className="border border-[#bfdbfe]/30 px-1.5 py-1 text-[10px] text-[#94a3b8] text-right select-none w-10 bg-[#f8faff]">
                    {ri + 1}
                  </td>
                  {row.map((cell, ci) => (
                    <td key={ci} className="border border-[#bfdbfe]/30 px-2 py-1 text-[#0f172a] whitespace-nowrap max-w-xs truncate" title={cell}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
