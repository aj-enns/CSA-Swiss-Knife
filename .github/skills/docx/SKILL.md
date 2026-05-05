---
name: docx
description: "Read, create, edit, or manipulate Word documents (.docx files). Triggers: any mention of \"Word doc\", \"word document\", \".docx\", or requests to produce professional documents with formatting like tables of contents, headings, page numbers, or letterheads. Also use when extracting or reorganizing content from .docx files, inserting or replacing images, performing find-and-replace, working with tracked changes or comments, or converting content into a polished Word document. If the user asks for a \"report\", \"memo\", \"letter\", \"template\", or similar deliverable as a Word or .docx file, use this skill. Do NOT use for PDFs (use pdf skill), spreadsheets (use xlsx skill), or general coding tasks."
argument-hint: 'Provide file path and operation: read, create, or modify'
---

# DOCX Creation, Editing, and Analysis

## Setup

```bash
npm install docx          # create new documents
npm install mammoth       # read / extract text and HTML
npm install docxtemplater pizzip  # fill {placeholder} templates
npm install adm-zip       # unpack/repack for raw XML edits
```

Install only the packages needed for the requested operation. No Python or virtual environment required.

### ESM Module Resolution (Critical)

This repo uses `"type": "module"`. When generating a `.mjs` script that imports `docx`:

- **Always write the script into the project root** (where `node_modules/` lives), not `/tmp/` or any external directory. Node's ESM resolver searches relative to the script's location, NOT the CWD.
- **Use ESM `import` syntax**, not `require()`.
- **Clean up the script after generation** — `rm ./gen-doc.mjs` after running.

```bash
# ✅ CORRECT — write script to project root, run from there, clean up
cat > ./gen-doc.mjs << 'EOF'
import { Document, Packer, Paragraph, TextRun } from "docx";
import { writeFileSync } from "fs";
// ... generation code ...
EOF
node ./gen-doc.mjs "/path/to/output.docx"
rm ./gen-doc.mjs

# ❌ WRONG — script in /tmp can't find node_modules
cat > /tmp/gen-doc.mjs << 'EOF'
import { Document } from "docx";  // ERR_MODULE_NOT_FOUND
EOF
node /tmp/gen-doc.mjs
```

---

## Overview

A .docx file is a ZIP archive containing XML files.

### Output Directory

Save generated `.docx` files to the vault `MCAPS-IQ-Artifacts/` folder when OIL is available, otherwise fall back to `.copilot/docs/` (see `shared-patterns` skill § Artifact Output Directory). Create the target directory before writing.

### Vault Filesystem Path Discovery

The vault is a local folder. To find its filesystem path for writing binary files:

```bash
# Find the vault root by locating the .obsidian config directory
find /Users/$USER -maxdepth 4 -name ".obsidian" -type d 2>/dev/null | head -5
# Vault root is the parent of .obsidian/

# Or locate a known vault file (e.g., MCAPS-IQ-Artifacts folder)
find /Users/$USER/Documents -maxdepth 5 -name "MCAPS-IQ-Artifacts" -type d -path "*/Obsidian/*" 2>/dev/null
```

Cache the path in a variable for the rest of the script. Use `mkdir -p` on the target directory before writing.

## Quick Reference

| Task | Approach |
|------|----------|
| Read/analyze content | `mammoth` — extractRawText or convertToHtml |
| Create new document | `docx` npm package — see Creating New Documents |
| Fill template placeholders | `docxtemplater` + `pizzip` |
| Edit existing document XML | `adm-zip` unpack → edit XML → repack |

### Converting .doc to .docx

Legacy `.doc` files must be converted before editing:

```bash
soffice --headless --convert-to docx document.doc
```

### Reading Content

```javascript
import mammoth from 'mammoth';

// Plain text extraction (strips all formatting)
const { value: text } = await mammoth.extractRawText({ path: 'document.docx' });

// HTML extraction (preserves headings, lists, tables, bold/italic)
const { value: html } = await mammoth.convertToHtml({ path: 'document.docx' });
// Check result.messages for conversion warnings
```

### Converting to Images

```bash
soffice --headless --convert-to pdf document.docx
pdftoppm -jpeg -r 150 document.pdf page
```

### Accepting Tracked Changes

To produce a clean document with all tracked changes accepted (requires LibreOffice):

```bash
soffice --headless --accept-all-tracked-changes document.docx
```

### OOXML Reference Lookup

If you need to look up OOXML schema details during complex XML editing, use `web_search` or `web_fetch`:

```
web_search("Office Open XML word processing document structure site:learn.microsoft.com")
```

---

## Creating New Documents

Generate .docx files with JavaScript using the `docx` npm package, then validate.

### Imports
```javascript
// ESM imports (required — this repo uses "type": "module")
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
         Header, Footer, AlignmentType, PageOrientation, LevelFormat, ExternalHyperlink,
         TableOfContents, HeadingLevel, BorderStyle, WidthType, ShadingType,
         VerticalAlign, PageNumber, PageBreak } from "docx";
import { writeFileSync, mkdirSync } from "fs";

const doc = new Document({ sections: [{ children: [/* content */] }] });
const buffer = await Packer.toBuffer(doc);
writeFileSync("output.docx", buffer);
```

### Validation
After creating the file, verify it's a valid docx:

```bash
# Quick validation — confirms valid ZIP with expected OOXML structure
python3 -c "
import zipfile
z = zipfile.ZipFile('output.docx')
assert 'word/document.xml' in z.namelist(), 'Missing document.xml'
print(f'Valid docx, {len(z.namelist())} entries')
"
```

If the file fails to open in Word, unpack with `adm-zip`, inspect `word/document.xml` for malformed XML, then repack.

### Page Size

```javascript
// CRITICAL: docx-js defaults to A4, not US Letter
// Always set page size explicitly for consistent results
sections: [{
  properties: {
    page: {
      size: {
        width: 12240,   // 8.5 inches in DXA
        height: 15840   // 11 inches in DXA
      },
      margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } // 1 inch margins
    }
  },
  children: [/* content */]
}]
```

**Common page sizes (DXA units, 1440 DXA = 1 inch):**

| Paper | Width | Height | Content Width (1" margins) |
|-------|-------|--------|---------------------------|
| US Letter | 12,240 | 15,840 | 9,360 |
| A4 (default) | 11,906 | 16,838 | 9,026 |

**Landscape orientation:** docx-js swaps width/height internally, so pass portrait dimensions and let it handle the swap:
```javascript
size: {
  width: 12240,   // Pass SHORT edge as width
  height: 15840,  // Pass LONG edge as height
  orientation: PageOrientation.LANDSCAPE  // docx-js swaps them in the XML
},
// Content width = 15840 - left margin - right margin (uses the long edge)
```

### Styles (Override Built-in Headings)

Use **Aptos** (modern Microsoft default, Word 2024+) or **Arial** (universally supported fallback). Keep titles black or use a single accent color for readability.

```javascript
const FONT = "Aptos";  // or "Arial" for maximum compatibility
const ACCENT = "1F4E79"; // dark blue — professional, readable

const doc = new Document({
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } }, // 11pt default
    paragraphStyles: [
      // IMPORTANT: Use exact IDs to override built-in styles
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: FONT, color: ACCENT },
        paragraph: { spacing: { before: 300, after: 160 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: FONT, color: ACCENT },
        paragraph: { spacing: { before: 240, after: 140 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 23, bold: true, font: FONT, color: ACCENT },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
    ]
  },
  sections: [{
    children: [
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Title")] }),
    ]
  }]
});
```

### Lists (NEVER use unicode bullets)

```javascript
// ❌ WRONG - never manually insert bullet characters
new Paragraph({ children: [new TextRun("• Item")] })  // BAD

// ✅ CORRECT - use numbering config with LevelFormat.BULLET
const doc = new Document({
  numbering: {
    config: [
      { reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers",
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  sections: [{
    children: [
      new Paragraph({ numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Bullet item")] }),
      new Paragraph({ numbering: { reference: "numbers", level: 0 },
        children: [new TextRun("Numbered item")] }),
    ]
  }]
});
// ⚠️ Same reference = continues numbering. Different reference = restarts.
```

### Tables

**CRITICAL: Tables need dual widths** — set both `columnWidths` on the table AND `width` on each cell.

```javascript
// CRITICAL: Always use DXA (percentages break in Google Docs)
// CRITICAL: Use ShadingType.CLEAR (not SOLID) to prevent black backgrounds
const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };

new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [4680, 4680], // Must sum to table width
  rows: [
    new TableRow({
      children: [
        new TableCell({
          borders,
          width: { size: 4680, type: WidthType.DXA },
          shading: { fill: "D5E8F0", type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun("Cell")] })]
        })
      ]
    })
  ]
})
```

**Width rules:**
- **Always use `WidthType.DXA`** — never `WidthType.PERCENTAGE`
- Table width must equal the sum of `columnWidths`
- Cell `width` must match corresponding `columnWidth`

### Images

```javascript
// CRITICAL: type parameter is REQUIRED
new Paragraph({
  children: [new ImageRun({
    type: "png", // Required: png, jpg, jpeg, gif, bmp, svg
    data: fs.readFileSync("image.png"),
    transformation: { width: 200, height: 150 },
    altText: { title: "Title", description: "Desc", name: "Name" } // All three required
  })]
})
```

### Page Breaks

```javascript
new Paragraph({ children: [new PageBreak()] })
// Or: new Paragraph({ pageBreakBefore: true, children: [new TextRun("New page")] })
```

### Table of Contents

```javascript
// CRITICAL: Headings must use HeadingLevel ONLY - no custom styles
new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" })
```

### Headers/Footers

```javascript
sections: [{
  properties: {
    page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
  },
  headers: {
    default: new Header({ children: [new Paragraph({ children: [new TextRun("Header")] })] })
  },
  footers: {
    default: new Footer({ children: [new Paragraph({
      children: [new TextRun("Page "), new TextRun({ children: [PageNumber.CURRENT] })]
    })] })
  },
  children: [/* content */]
}]
```

### Hyperlinks

```javascript
import { ExternalHyperlink } from "docx";

new Paragraph({
  children: [
    new TextRun("Visit "),
    new ExternalHyperlink({
      link: "https://example.com",
      children: [new TextRun({ text: "Example Site", style: "Hyperlink", font: FONT, size: 22 })]
    }),
    new TextRun(" for details.")
  ]
})
```

### Helper Functions (Recommended)

For any document longer than a few paragraphs, define reusable helpers to reduce boilerplate:

```javascript
const FONT = "Aptos";
const ACCENT = "1F4E79";
const BORDER = { style: BorderStyle.SINGLE, size: 1, color: "B0B0B0" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

// Paragraph with inline TextRuns
function p(children, opts = {}) {
  const runs = typeof children === "string"
    ? [new TextRun({ text: children, font: FONT, size: opts.size || 22 })]
    : children;
  return new Paragraph({
    spacing: { after: opts.after ?? 120, before: opts.before ?? 0, line: 276 },
    alignment: opts.alignment, heading: opts.heading, numbering: opts.numbering,
    children: runs,
  });
}

function bold(text, size) { return new TextRun({ text, bold: true, font: FONT, size: size || 22 }); }
function run(text, size) { return new TextRun({ text, font: FONT, size: size || 22 }); }
function italic(text, size) { return new TextRun({ text, italics: true, font: FONT, size: size || 22 }); }

function heading(text, level = HeadingLevel.HEADING_1) {
  const sizes = { [HeadingLevel.HEADING_1]: 32, [HeadingLevel.HEADING_2]: 26, [HeadingLevel.HEADING_3]: 23 };
  return new Paragraph({ heading: level, spacing: { before: 300, after: 160 },
    children: [new TextRun({ text, font: FONT, bold: true, size: sizes[level] || 26, color: ACCENT })]
  });
}

function bullet(children, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { after: 80, line: 276 },
    children: typeof children === "string" ? [run(children)] : children,
  });
}

function headerCell(text, width) {
  return new TableCell({
    borders: BORDERS, margins: { top: 60, bottom: 60, left: 100, right: 100 },
    width: { size: width, type: WidthType.DXA },
    shading: { fill: ACCENT, type: ShadingType.CLEAR },
    children: [new Paragraph({ children: [new TextRun({ text, font: FONT, size: 20, bold: true, color: "FFFFFF" })] })]
  });
}

function cell(text, width) {
  return new TableCell({
    borders: BORDERS, margins: { top: 60, bottom: 60, left: 100, right: 100 },
    width: { size: width, type: WidthType.DXA },
    children: [new Paragraph({ children: [new TextRun({ text, font: FONT, size: 20 })] })]
  });
}

// Usage:
// p([bold("Important: "), run("this is a mixed-format paragraph")])
// bullet([bold("Item title"), run(" — item description")])
// heading("Section Title", HeadingLevel.HEADING_2)
```

These helpers cut the script size by ~60% and prevent common mistakes (missing font, wrong size, forgetting spacing).

### Critical Rules for docx-js

- **Set page size explicitly** — defaults to A4; use US Letter (12240 x 15840 DXA) for US documents
- **Landscape: pass portrait dimensions** — docx-js swaps internally
- **Never use `\n`** — use separate Paragraph elements
- **Never use unicode bullets** — use `LevelFormat.BULLET` numbering
- **PageBreak must be in Paragraph** — standalone creates invalid XML
- **ImageRun requires `type`** — always specify png/jpg/etc
- **Always set table `width` with DXA** — never `WidthType.PERCENTAGE`
- **Tables need dual widths** — `columnWidths` array AND cell `width`, both must match
- **Use `ShadingType.CLEAR`** — never SOLID for table shading
- **TOC requires HeadingLevel only** — no custom styles on heading paragraphs
- **Override built-in styles** — use exact IDs: "Heading1", "Heading2", etc.
- **Include `outlineLevel`** — required for TOC (0 for H1, 1 for H2, etc.)

---

## Editing Existing Documents

**Follow all 3 steps in order.**

### Step 1: Unpack

```javascript
import AdmZip from 'adm-zip';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const zip = new AdmZip('document.docx');
const outDir = 'unpacked';
zip.extractAllTo(outDir, true);
// Edit files in unpacked/word/ (see XML Reference below)
```

### Step 2: Edit XML

Edit files in `unpacked/word/`. See XML Reference below for patterns.

**Use "Copilot" as the author** for tracked changes and comments, unless the user explicitly requests a different name.

**Use the Edit tool directly for string replacement.** The Edit tool shows exactly what is being replaced.

**CRITICAL: Use smart quotes for new content:**
```xml
<w:t>Here&#x2019;s a quote: &#x201C;Hello&#x201D;</w:t>
```
| Entity | Character |
|--------|-----------|
| `&#x2018;` | ' (left single) |
| `&#x2019;` | ' (right single / apostrophe) |
| `&#x201C;` | " (left double) |
| `&#x201D;` | " (right double) |

**Adding comments:** Manually append the comment entry to `unpacked/word/comments.xml` (create the file if absent), then add markers to `document.xml` (see Comments in XML Reference). A minimal `comments.xml`:

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:comment w:id="0" w:author="Copilot" w:date="2025-01-01T00:00:00Z">
    <w:p><w:r><w:t>Comment text here</w:t></w:r></w:p>
  </w:comment>
</w:comments>
```

Register the part in `[Content_Types].xml` and `word/_rels/document.xml.rels` if not already present.

### Step 3: Repack

```javascript
import AdmZip from 'adm-zip';

const zip = new AdmZip();
zip.addLocalFolder('unpacked');
zip.writeZip('output.docx');
```

**Manual repairs to check:**
- `xml:space="preserve"` on `<w:t>` elements with leading/trailing whitespace
- `w:rsid` attributes must be 8-digit hex (e.g., `00AB1234`)

### Common Pitfalls

- **Replace entire `<w:r>` elements**: When adding tracked changes, replace the whole `<w:r>...</w:r>` block with `<w:del>...<w:ins>...` as siblings.
- **Preserve `<w:rPr>` formatting**: Copy the original run's `<w:rPr>` block into your tracked change runs.

---

## XML Reference

### Schema Compliance

- **Element order in `<w:pPr>`**: `<w:pStyle>`, `<w:numPr>`, `<w:spacing>`, `<w:ind>`, `<w:jc>`, `<w:rPr>` last
- **Whitespace**: Add `xml:space="preserve"` to `<w:t>` with leading/trailing spaces
- **RSIDs**: Must be 8-digit hex (e.g., `00AB1234`)

### Tracked Changes

**Insertion:**
```xml
<w:ins w:id="1" w:author="Copilot" w:date="2025-01-01T00:00:00Z">
  <w:r><w:t>inserted text</w:t></w:r>
</w:ins>
```

**Deletion:**
```xml
<w:del w:id="2" w:author="Copilot" w:date="2025-01-01T00:00:00Z">
  <w:r><w:delText>deleted text</w:delText></w:r>
</w:del>
```

Inside `<w:del>`: Use `<w:delText>` instead of `<w:t>`, and `<w:delInstrText>` instead of `<w:instrText>`.

**Minimal edits** — only mark what changes:
```xml
<w:r><w:t>The term is </w:t></w:r>
<w:del w:id="1" w:author="Copilot" w:date="...">
  <w:r><w:delText>30</w:delText></w:r>
</w:del>
<w:ins w:id="2" w:author="Copilot" w:date="...">
  <w:r><w:t>60</w:t></w:r>
</w:ins>
<w:r><w:t> days.</w:t></w:r>
```

**Deleting entire paragraphs** — also mark the paragraph mark as deleted:
```xml
<w:p>
  <w:pPr>
    <w:rPr>
      <w:del w:id="1" w:author="Copilot" w:date="2025-01-01T00:00:00Z"/>
    </w:rPr>
  </w:pPr>
  <w:del w:id="2" w:author="Copilot" w:date="2025-01-01T00:00:00Z">
    <w:r><w:delText>Entire paragraph content...</w:delText></w:r>
  </w:del>
</w:p>
```

**Rejecting another author's insertion:**
```xml
<w:ins w:author="Jane" w:id="5">
  <w:del w:author="Copilot" w:id="10">
    <w:r><w:delText>their inserted text</w:delText></w:r>
  </w:del>
</w:ins>
```

**Restoring another author's deletion:**
```xml
<w:del w:author="Jane" w:id="5">
  <w:r><w:delText>deleted text</w:delText></w:r>
</w:del>
<w:ins w:author="Copilot" w:id="10">
  <w:r><w:t>deleted text</w:t></w:r>
</w:ins>
```

### Comments

After inserting the comment entry in `comments.xml` (see Step 2 above), add markers to `document.xml`.

**CRITICAL: `<w:commentRangeStart>` and `<w:commentRangeEnd>` are siblings of `<w:r>`, never inside `<w:r>`.**

```xml
<w:commentRangeStart w:id="0"/>
<w:r><w:t>commented text</w:t></w:r>
<w:commentRangeEnd w:id="0"/>
<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r>
```

### Images

1. Add image file to `word/media/`
2. Add relationship to `word/_rels/document.xml.rels`
3. Add content type to `[Content_Types].xml`
4. Reference in document.xml via `<w:drawing>` with `<a:blip r:embed="rIdX"/>`

EMU units: 914400 = 1 inch.

---

## Dependencies

- **docx**: `npm install docx` — new documents
- **mammoth**: `npm install mammoth` — read/extract existing documents
- **docxtemplater** + **pizzip**: `npm install docxtemplater pizzip` — template filling
- **adm-zip**: `npm install adm-zip` — unpack/repack for raw XML edits
- **LibreOffice** (optional, system install): `soffice` CLI for .doc→.docx conversion and tracked-changes acceptance
- **Poppler** (optional, system install): `pdftoppm` for image conversion from PDF
