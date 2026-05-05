# PDF Processing Advanced Reference

Advanced PDF features, additional libraries, and extended command-line patterns.

---

## pdf-lib — Advanced Patterns

### Embed and Draw Images

```javascript
import { PDFDocument } from 'pdf-lib';
import { readFileSync, writeFileSync } from 'fs';

const doc  = await PDFDocument.load(readFileSync('document.pdf'));
const page = doc.getPage(0);

// Embed image (png or jpg)
const imgBytes = readFileSync('logo.png');
const image    = await doc.embedPng(imgBytes); // or embedJpg
const { width: imgW, height: imgH } = image.scale(0.5); // scale to 50%

page.drawImage(image, { x: 50, y: 700, width: imgW, height: imgH });
writeFileSync('output.pdf', await doc.save());
```

### Copy Specific Pages from Multiple Sources

```javascript
import { PDFDocument } from 'pdf-lib';
import { readFileSync, writeFileSync } from 'fs';

const out  = await PDFDocument.create();
const src1 = await PDFDocument.load(readFileSync('doc1.pdf'));
const src2 = await PDFDocument.load(readFileSync('doc2.pdf'));

// Copy pages 0, 2, 4 from doc1 — and pages 1, 3 from doc2
const pages1 = await out.copyPages(src1, [0, 2, 4]);
const pages2 = await out.copyPages(src2, [1, 3]);

[...pages1, ...pages2].forEach(p => out.addPage(p));
writeFileSync('combined.pdf', await out.save());
```

### Set Document Metadata

```javascript
doc.setTitle('Quarterly Report');
doc.setAuthor('Finance Team');
doc.setSubject('Q1 2026');
doc.setKeywords(['finance', 'quarterly', 'report']);
doc.setCreator('mcaps-iq');
doc.setProducer('pdf-lib');
```

---

## pdfjs-dist — Text Extraction with Coordinates

pdfjs-dist provides per-item text positions, useful for detecting table structure.

```bash
npm install pdfjs-dist
```

```javascript
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const loadingTask = pdfjsLib.getDocument({ url: 'document.pdf', useWorkerFetch: false });
const pdf = await loadingTask.promise;

for (let i = 1; i <= pdf.numPages; i++) {
  const page    = await pdf.getPage(i);
  const content = await page.getTextContent();

  for (const item of content.items) {
    console.log({
      text:   item.str,
      x:      item.transform[4],
      y:      item.transform[5],
      width:  item.width,
      height: item.height,
    });
  }
}
```

---

## Command-Line Tools — Extended Patterns

### qpdf Advanced

```bash
# Split into groups of N pages
qpdf --split-pages=3 input.pdf output_group_%02d.pdf

# Extract complex page ranges from multiple sources
qpdf --empty --pages doc1.pdf 1-3 doc2.pdf 5-7 doc3.pdf 2,4 -- combined.pdf

# Linearize for web streaming
qpdf --linearize input.pdf web_optimized.pdf

# Check / repair structure
qpdf --check input.pdf
qpdf --fix-qdf damaged.pdf repaired.pdf

# Show full structure (debug)
qpdf --show-all-pages input.pdf

# Encrypt with granular permissions (256-bit AES)
qpdf --encrypt user_pass owner_pass 256 --print=none --modify=none -- input.pdf encrypted.pdf
```

### poppler-utils Advanced

```bash
# Extract text with bounding-box coordinates (XML output)
pdftotext -bbox-layout document.pdf output.xml

# High-resolution PNG (for visual analysis or OCR)
pdftoppm -png -r 300 document.pdf page_prefix

# Extract page range at high DPI
pdftoppm -png -r 600 -f 1 -l 3 document.pdf high_res

# List embedded images (without extracting)
pdfimages -list document.pdf

# Extract embedded images (original format)
pdfimages -all document.pdf images/img

# Extract with page prefix
pdfimages -j -p document.pdf page_images
```

---

## OCR — Scanned PDFs

pdf-lib and pdf-parse do not perform OCR. Options:

| Approach | How |
|----------|-----|
| Cloud | `@azure-rest/ai-document-intelligence` — no system dependencies |
| CLI (system) | `pdftoppm` → PNG → `tesseract` per page |
| Online | Azure Document Intelligence portal, Adobe Acrobat |

**Azure Document Intelligence (Node.js):**

```javascript
import DocumentIntelligence from '@azure-rest/ai-document-intelligence';
import { readFileSync } from 'fs';

const client = DocumentIntelligence(process.env.DI_ENDPOINT, { key: process.env.DI_KEY });
const base64 = readFileSync('scanned.pdf').toString('base64');

const { operationLocation } = await client
  .path('/documentModels/{modelId}:analyze', 'prebuilt-read')
  .post({ body: { base64Source: base64 } });

// Poll for result, then extract paragraphs / tables from the response
```
