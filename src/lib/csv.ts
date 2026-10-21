/**
 * CSV serialisation with protection against spreadsheet formula injection:
 * cells beginning with = + - @ (or tab/CR) are prefixed with a quote so
 * spreadsheet apps treat them as text.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: Array<{ key: keyof T; header: string }>): string {
  const head = columns.map((c) => csvCell(c.header)).join(",");
  const body = rows.map((row) => columns.map((c) => csvCell(row[c.key])).join(","));
  return [head, ...body].join("\r\n") + "\r\n";
}
