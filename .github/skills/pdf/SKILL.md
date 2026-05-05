---
name: pdf
description: "Read, extract, create, merge, split, rotate, watermark, encrypt, OCR, or fill forms in PDF files. Triggers: any mention of \".pdf\", \"PDF\", or requests to extract text/tables from PDFs, combine/merge PDFs, split pages, create new PDFs, fill PDF forms, add watermarks, encrypt/decrypt, extract images, or OCR scanned documents. Do NOT use for Word documents (use docx skill), spreadsheets (use xlsx skill), or PowerPoint files."
argument-hint: 'Provide the path to the PDF file and describe what operation to perform'
---

# PDF Processing Guide

## Setup

```bash
npm install pdf-lib        # create, merge, split, rotate, watermark, encrypt, fill forms
npm install pdf-parse      # extract text from PDFs
```

No Python or virtual environment required.

---

## Overview

**Output directory**: Save generated/merged/split `.pdf` files to the vault `MCAPS-IQ-Artifacts/` folder when OIL is available, otherwise fall back to `.copilot/docs/` (see `shared-patterns` skill § Artifact Output Directory). Create the target directory before writing.

## Quick Reference

| Task | Tool | Key API |
|------|------|---------|
| Extract text | `pdf-parse` | `pdf(buffer).then(d => d.text)` |
| Merge PDFs | `pdf-lib` | `PDFDocument.copyPages()` |
| Split PDFs | `pdf-lib` | One page per doc |
| Create PDFs | `pdf-lib` | `PDFDocument.create()` |
| Rotate pages | `pdf-lib` | `page.setRotation()` |
| Add watermark | `pdf-lib` | `page.drawText()` overlay |
| Encrypt | `pdf-lib` | `doc.encrypt()` |
| Fill forms | `pdf-lib` | `form.getTextField().setText()` |
| Command-line merge | `qpdf` | `qpdf --empty --pages ...` |
| Command-line text | `pdftotext` | `pdftotext input.pdf -` |

---

## Reading & Extracting

### Extract Text

```javascript
import pdfParse from 'pdf-parse';
import { readFileSync } from 'fs';

const buffer = readFileSync('document.pdf');
const data = await pdfParse(buffer);

console.log(`Pages: ${data.numpages}`);
console.log(data.text);  // full extracted text
// data.info  — metadata (Title, Author, etc.)
```

> For layout-sensitive extraction (tables, columns), use `qpdf` + `pdftotext -layout` (see Command-Line Tools).

---

## Merging & Splitting

### Merge PDFs

```javascript
import { PDFDocument } from 'pdf-lib';
import { readFileSync, writeFileSync } from 'fs';

const merged = await PDFDocument.create();

for (const path of ['doc1.pdf', 'doc2.pdf', 'doc3.pdf']) {
  const src = await PDFDocument.load(readFileSync(path));
  const pages = await merged.copyPages(src, src.getPageIndices());
  pages.forEach(p => merged.addPage(p));
}

writeFileSync('merged.pdf', await merged.save());
```

### Split PDF (one file per page)

```javascript
import { PDFDocument } from 'pdf-lib';
import { readFileSync, writeFileSync } from 'fs';

const src = await PDFDocument.load(readFileSync('input.pdf'));

for (let i = 0; i < src.getPageCount(); i++) {
  const single = await PDFDocument.create();
  const [page] = await single.copyPages(src, [i]);
  single.addPage(page);
  writeFileSync(`page_${i + 1}.pdf`, await single.save());
}
```

---

## Page Manipulation

### Rotate Pages

```javascript
import { PDFDocument, degrees } from 'pdf-lib';
import { readFileSync, writeFileSync } from 'fs';

const doc = await PDFDocument.load(readFileSync('input.pdf'));
doc.getPage(0).setRotation(degrees(90)); // rotate first page 90° CW
writeFileSync('rotated.pdf', await doc.save());
```

### Add Watermark

```javascript
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { readFileSync, writeFileSync } from 'fs';

const doc  = await PDFDocument.load(readFileSync('document.pdf'));
const font = await doc.embedFont(StandardFonts.HelveticaBold);

for (const page of doc.getPages()) {
  const { width, height } = page.getSize();
  page.drawText('CONFIDENTIAL', {
    x: width / 4, y: height / 2,
    size: 48, font,
    color: rgb(0.75, 0, 0),
    opacity: 0.3,
    rotate: { type: 'degrees', angle: 45 },
  });
}

writeFileSync('watermarked.pdf', await doc.save());
```

---

## Creating PDFs

```javascript
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFileSync } from 'fs';

const doc  = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const page = doc.addPage([612, 792]); // US Letter in points (72pt = 1 inch)
const { width, height } = page.getSize();

page.drawText('Hello World!', {
  x: 100, y: height - 100,
  size: 24, font,
  color: rgb(0, 0, 0),
});

// Horizontal rule
page.drawLine({ start: { x: 100, y: height - 140 }, end: { x: 400, y: height - 140 }, thickness: 1 });

writeFileSync('hello.pdf', await doc.save());
```

---

## Security

### Encrypt PDF

```javascript
import { PDFDocument } from 'pdf-lib';
import { readFileSync, writeFileSync } from 'fs';

const doc = await PDFDocument.load(readFileSync('input.pdf'));
await doc.encrypt({
  userPassword:  'userpassword',
  ownerPassword: 'ownerpassword',
  permissions: { printing: 'lowResolution', copying: false },
});
writeFileSync('encrypted.pdf', await doc.save());
```

---

## OCR (Scanned PDFs)

pdf-lib and pdf-parse do not include OCR. For scanned PDFs:
- **Cloud option**: Azure Document Intelligence (`@azure-rest/ai-document-intelligence`)
- **CLI option**: `tesseract` + `pdftoppm` (requires system installs)

---

## PDF Form Filling

See [forms.md](forms.md) — covers both fillable (AcroForm) and non-fillable (annotation-based) approaches using `pdf-lib`.

---

## Command-Line Tools

### qpdf
```bash
qpdf --empty --pages file1.pdf file2.pdf -- merged.pdf     # Merge
qpdf input.pdf --pages . 1-5 -- pages1-5.pdf               # Extract pages
qpdf input.pdf output.pdf --rotate=+90:1                    # Rotate page 1
qpdf --password=mypassword --decrypt encrypted.pdf out.pdf  # Decrypt
```

### pdftotext (poppler-utils)
```bash
pdftotext input.pdf output.txt            # Extract text
pdftotext -layout input.pdf output.txt    # Preserve layout
pdftotext -f 1 -l 5 input.pdf output.txt # Pages 1-5 only
```

---

## Next Steps

- [reference.md](reference.md) — Additional libraries: pdfjs-dist, canvas rendering
- [forms.md](forms.md) — Complete form filling workflow with validation

