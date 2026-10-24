export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }
  return rows;
}

const URL_PATTERN = /^(https?:\/\/[^\s]+)$/i;

export function extractUrlsFromCsv(text: string): string[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const urlColumn = header.findIndex((cell) =>
    ["url", "link", "destination", "short_url", "shorturl", "target"].includes(cell),
  );

  const candidates = urlColumn >= 0 ? rows.slice(1).map((row) => row[urlColumn] ?? "") : rows.flat();
  const urls: string[] = [];
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    const direct = trimmed.match(URL_PATTERN);
    if (direct) {
      urls.push(direct[1]);
      continue;
    }
    const embedded = trimmed.match(/https?:\/\/[^\s,;"']+/gi);
    if (embedded) urls.push(...embedded);
  }
  return urls;
}

export function extractUrlLines(text: string): string[] {
  return text
    .split(/[\n,;\t ]+/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

export function toCsv(rows: Array<Record<string, unknown>>, columns?: string[]): string {
  if (rows.length === 0) return (columns ?? []).join(",") + "\n";
  const keys = columns ?? Object.keys(rows[0]);
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [keys.join(","), ...rows.map((row) => keys.map((key) => escape(row[key])).join(","))].join("\n") + "\n";
}
