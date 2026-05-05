/**
 * Output Format Judge — validates that agent output matches the expected structure.
 * Checks required sections, table columns, and format compliance per copilot-instructions.md.
 */

export interface OutputFormatResult {
  pass: boolean;
  missingSections: string[];
  missingColumns: string[];
  forbiddenMatches: string[];
  score: number;
}

export interface OutputSchema {
  requiredSections?: string[];
  requiredColumns?: string[];
  forbiddenPatterns?: string[];
  format?: "table" | "prose" | "mixed";
}

/**
 * Validate agent output against an expected output schema.
 */
export function judgeOutputFormat(
  output: string,
  schema: OutputSchema,
): OutputFormatResult {
  const missingSections: string[] = [];
  const missingColumns: string[] = [];
  const forbiddenMatches: string[] = [];

  // Check required sections
  if (schema.requiredSections) {
    for (const section of schema.requiredSections) {
      // Look for the section as a heading or bold text
      const patterns = [
        new RegExp(`^#+\\s*${escapeRegex(section)}`, "mi"),
        new RegExp(`\\*\\*${escapeRegex(section)}\\*\\*`, "i"),
        new RegExp(`${escapeRegex(section)}`, "i"),
      ];
      const found = patterns.some((p) => p.test(output));
      if (!found) missingSections.push(section);
    }
  }

  // Check required columns in table output
  if (schema.requiredColumns) {
    const headerRows = getTableHeaderRows(output);

    for (const col of schema.requiredColumns) {
      const found = headerRows.some((row) =>
        row.some((cell) => cell.toLowerCase().includes(col.toLowerCase())),
      );

      if (!found) {
        missingColumns.push(col);
      }
    }
  }

  // Check forbidden patterns
  if (schema.forbiddenPatterns) {
    for (const pattern of schema.forbiddenPatterns) {
      if (new RegExp(pattern, "i").test(output)) {
        forbiddenMatches.push(pattern);
      }
    }
  }

  // Check format type
  if (schema.format === "table") {
    const hasTable = /\|.*\|.*\|/.test(output) && /\|[-:]+\|/.test(output);
    if (!hasTable) {
      missingSections.push("markdown table (required format: table)");
    }
  }

  // Score
  const totalChecks =
    (schema.requiredSections?.length ?? 0) +
    (schema.requiredColumns?.length ?? 0) +
    (schema.forbiddenPatterns?.length ?? 0);
  const failures = missingSections.length + missingColumns.length + forbiddenMatches.length;
  const score = totalChecks > 0 ? Math.max(0, 1 - failures / totalChecks) : 1;

  return {
    pass: failures === 0,
    missingSections,
    missingColumns,
    forbiddenMatches,
    score,
  };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getTableHeaderRows(output: string): string[][] {
  const lines = output.split("\n");
  const headers: string[][] = [];

  for (let i = 0; i < lines.length - 1; i++) {
    const header = lines[i]?.trim();
    const separator = lines[i + 1]?.trim();
    if (!header || !separator) continue;

    if (!header.includes("|") || !isTableSeparatorRow(separator)) continue;

    const cells = header
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (cells.length > 0) headers.push(cells);
  }

  return headers;
}

function isTableSeparatorRow(line: string): boolean {
  if (!line.includes("|")) return false;

  const cells = line
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  if (cells.length === 0) return false;

  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}
