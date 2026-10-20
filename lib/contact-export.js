export function escapeCsvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function formatContactCsvRow(values) {
  return values.map(escapeCsvCell).join(",") + "\r\n";
}
