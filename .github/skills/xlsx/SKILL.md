---
name: xlsx
description: "Read, create, edit, or analyze spreadsheet files (.xlsx, .xlsm, .csv, .tsv). Triggers: any mention of \"Excel\", \"spreadsheet\", \".xlsx\", \".csv\", or requests to open/read/edit/fix/create spreadsheets, add columns, compute formulas, format cells, create charts, clean messy tabular data, or convert between tabular formats. Also triggers for financial models, pricing spreadsheets, and data cleanup into proper spreadsheets. The deliverable must be a spreadsheet file. Do NOT use for Word documents (use docx skill), PDFs (use pdf skill), or PowerPoint files."
argument-hint: 'Provide the path to the spreadsheet file and describe what operation to perform'
---

# XLSX Creation, Editing, and Analysis

## Setup

```bash
npm install exceljs
# For CSV-only work:
npm install csv-parse csv-stringify
```

**`exceljs` is the default library** — handles read, write, edit, and formatting for both .xlsx and .csv. No Python or virtual environment required.

---

## Output Requirements

**Output directory**: Save generated `.xlsx`/`.csv` files to the vault `MCAPS-IQ-Artifacts/` folder when OIL is available, otherwise fall back to `.copilot/docs/` (see `shared-patterns` skill § Artifact Output Directory). Create the target directory before writing.

**Formulas**: Write Excel formula strings — let Excel calculate on open. ExcelJS stores the formula string and an optional cached result; always include a sensible `result` fallback so the file is readable if not opened in Excel.

```javascript
sheet.getCell('B10').value = { formula: 'SUM(B2:B9)', result: 0 };
```

### All Excel Files
- Use a consistent, professional font (e.g., Arial) unless the user specifies otherwise
- **Zero formula errors** — every file MUST be delivered with ZERO errors (#REF!, #DIV/0!, #VALUE!, #N/A, #NAME?)
- When updating existing templates: **preserve existing format/style/conventions exactly**. Existing template conventions ALWAYS override these guidelines

### Financial Models

**Color coding (industry standard):**
| Color | Use |
|-------|-----|
| Blue text (0,0,255) | Hardcoded inputs, scenario-variable numbers |
| Black text (0,0,0) | ALL formulas and calculations |
| Green text (0,128,0) | Links from other worksheets |
| Red text (255,0,0) | External links to other files |
| Yellow background (255,255,0) | Key assumptions needing attention |

**Number formatting:**
- Years: text strings ("2024" not "2,024")
- Currency: `$#,##0`; always specify units in headers ("Revenue ($mm)")
- Zeros: format as "-" including percentages
- Percentages: `0.0%` default
- Multiples: `0.0x` for valuation multiples
- Negative numbers: parentheses `(123)` not minus `-123`

**Formula rules:**
- Place ALL assumptions in separate cells — use references, not hardcodes
- Document hardcode sources: `"Source: [System], [Date], [Reference], [URL]"`

---

## CRITICAL: Use Formulas, Not Hardcoded Values

**Always write Excel formula strings — never calculate values in code.**

```javascript
// ❌ WRONG - hardcoding calculated values
const total = rows.reduce((s, r) => s + r.sales, 0);
sheet.getCell('B10').value = total;  // Hardcodes 5000

// ✅ CORRECT - let Excel calculate
sheet.getCell('B10').value = { formula: 'SUM(B2:B9)', result: 0 };
sheet.getCell('C5').value  = { formula: '(C4-C2)/C2', result: 0 };
sheet.getCell('D20').value = { formula: 'AVERAGE(D2:D19)', result: 0 };
```

This applies to ALL calculations — totals, percentages, ratios, differences.

---

## Quick Reference

| Task | Approach |
|------|----------|
| Read/analyze data | `exceljs` — workbook.xlsx.readFile() |
| Create new files | `exceljs` — Workbook + addWorksheet |
| Edit existing files | `exceljs` — load, modify cells, save |
| CSV import/export | `exceljs` csv methods or `csv-parse`/`csv-stringify` |

---

## Reading Data

```javascript
import ExcelJS from 'exceljs';

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile('file.xlsx');

const sheet = workbook.getWorksheet('Sheet1'); // by name or index (1-based)

// Headers from row 1
const headers = sheet.getRow(1).values.slice(1); // slice(1): values[0] is undefined (1-indexed)

// Iterate data rows
sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
  if (rowNum === 1) return; // skip header
  console.log(row.values); // row.values[1] = col A, row.values[2] = col B, ...
});

// Read specific cell
const val = sheet.getCell('B3').value; // or sheet.getRow(3).getCell(2).value
```

Cell value types: `string`, `number`, `Date`, `{ formula, result }`, `{ richText }`, `{ hyperlink, text }`.

---

## Creating New Files

```javascript
import ExcelJS from 'exceljs';

const workbook = new ExcelJS.Workbook();
workbook.creator = 'Author';
workbook.created = new Date();

const sheet = workbook.addWorksheet('Report', {
  properties: { defaultColWidth: 15 },
});

// Define columns (sets header + key + width in one step)
sheet.columns = [
  { header: 'Name',  key: 'name',  width: 25 },
  { header: 'Value', key: 'value', width: 15 },
  { header: 'Date',  key: 'date',  width: 18 },
];

// Add rows by key
sheet.addRow({ name: 'Item A', value: 100, date: new Date() });
sheet.addRows([
  { name: 'Item B', value: 250, date: new Date() },
  { name: 'Item C', value: 75,  date: new Date() },
]);

// Formulas
sheet.getCell('B6').value = { formula: 'SUM(B2:B5)', result: 425 };

// Header styling
sheet.getRow(1).eachCell(cell => {
  cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
  cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003366' } };
  cell.alignment = { horizontal: 'center' };
});

// Auto-filter
sheet.autoFilter = 'A1:C1';

await workbook.xlsx.writeFile('output.xlsx');
```

---

## Editing Existing Files

```javascript
import ExcelJS from 'exceljs';

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile('existing.xlsx');

const sheet = workbook.getWorksheet(1); // first sheet

// Modify cells
sheet.getCell('A1').value = 'New Value';

// Insert / delete rows
sheet.insertRow(2, ['inserted', 'row']);
sheet.spliceRows(5, 1); // delete row 5

// Add a new sheet
const newSheet = workbook.addWorksheet('NewData');
newSheet.getCell('A1').value = 'Hello';

await workbook.xlsx.writeFile('modified.xlsx');
```

---

## Common Workflow

1. **Install**: `npm install exceljs`
2. **Create/Load**: `new ExcelJS.Workbook()` then `readFile` or `addWorksheet`
3. **Modify**: Cells, rows, columns, formulas
4. **Save**: `workbook.xlsx.writeFile(outputPath)`
5. **Verify**: Open in Excel — formulas calculate automatically

---

## Formula Verification Checklist

- [ ] Cell references use correct sheet prefix for cross-sheet formulas: `'Sheet Name'!A1`
- [ ] Row indices are 1-based in ExcelJS: row 1 = header, row 2 = first data row
- [ ] Division by zero: wrap denominators with `IFERROR(calc, "")`
- [ ] `result` cache is a plausible placeholder (0 or 0.0) — not the actual computed value

---

## Best Practices

- **ExcelJS uses 1-based indices** everywhere: `getRow(1)`, `getCell('A1')`, `sheet.getWorksheet(1)`
- `row.values[0]` is always `undefined` — data starts at `[1]`
- Format numbers with `cell.numFmt`: `'$#,##0'`, `'0.0%'`, `'0.0x'`
- For large files use streaming: `workbook.xlsx.createInputStream()` / `WorkbookWriter` for output
- Always set `workbook.creator` and `workbook.created` for metadata
- Write minimal, tidy scripts — no unnecessary comments or verbose variable names
- For Excel files: add cell comments for complex formulas to document sources
