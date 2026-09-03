import ExcelJS from "exceljs";
import Papa from "papaparse";

export async function parseSpreadsheetFile(
  file: File,
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const name = file.name.toLowerCase();
  const arrayBuffer = await file.arrayBuffer();

  if (name.endsWith(".csv")) {
    const text = Buffer.from(arrayBuffer).toString("utf-8");
    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });
    const headers = result.meta.fields ?? [];
    const rows = result.data.filter((r) =>
      Object.values(r).some((v) => v && v.toString().trim() !== ""),
    );
    return { headers, rows };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return { headers: [], rows: [] };

  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? "").trim();
  });

  const rows: Record<string, string>[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, string> = {};
    let hasValue = false;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = headers[colNumber];
      if (!header) return;
      let value: unknown = cell.value;
      if (value && typeof value === "object" && "text" in value) {
        value = (value as { text: unknown }).text;
      }
      if (value && typeof value === "object" && "result" in value) {
        value = (value as { result: unknown }).result;
      }
      const strValue = value === null || value === undefined ? "" : String(value).trim();
      obj[header] = strValue;
      if (strValue !== "") hasValue = true;
    });
    if (hasValue) rows.push(obj);
  });

  return { headers: headers.filter(Boolean), rows };
}
