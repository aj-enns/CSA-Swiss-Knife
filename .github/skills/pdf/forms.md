# PDF Form Filling

## Decision Tree

```
Does the PDF have fillable AcroForm fields?
  YES → Use Approach A (pdf-lib AcroForm API)
  NO  → Use Approach B (annotation-based overlay)
```

Check for fillable fields:

```javascript
import { PDFDocument } from 'pdf-lib';
import { readFileSync } from 'fs';

const doc  = await PDFDocument.load(readFileSync('form.pdf'));
const form = doc.getForm();
const fields = form.getFields();
console.log(fields.map(f => `${f.constructor.name}: ${f.getName()}`));
// Empty array → no AcroForm fields → use Approach B
```

---

## Approach A: Fillable AcroForm Fields

```javascript
import { PDFDocument } from 'pdf-lib';
import { readFileSync, writeFileSync } from 'fs';

const doc  = await PDFDocument.load(readFileSync('form.pdf'));
const form = doc.getForm();

// Text fields
form.getTextField('last_name').setText('Simpson');
form.getTextField('first_name').setText('Homer');

// Checkboxes
form.getCheckBox('over_18').check();
form.getCheckBox('newsletter').uncheck();

// Radio groups
form.getRadioGroup('gender').select('male'); // use exact export value

// Dropdowns
form.getDropdown('state').select('NY');

// Flatten (make non-editable) — often required before delivery
form.flatten();

writeFileSync('filled.pdf', await doc.save());
```

### Listing All Fields and Types

```javascript
const form = doc.getForm();
for (const field of form.getFields()) {
  const name = field.getName();
  const type = field.constructor.name; // PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown
  console.log(`${type} — "${name}"`);
}
```

### Radio Group Export Values

Radio buttons have export values that may differ from display labels. Inspect them:

```javascript
const radio = form.getRadioGroup('marital_status');
console.log('Options:', radio.getOptions());  // ['Single', 'Married', 'Divorced']
radio.select('Married');
```

---

## Approach B: Non-Fillable PDFs (Text Overlay)

For scanned or image-based PDFs with no AcroForm fields, draw text directly on the page at the correct coordinates.

### Coordinate System

PDF coordinates: `(0, 0)` is the **bottom-left** of the page; y increases upward.

- US Letter: 612 × 792 points (72 points = 1 inch)
- To place text in the top-left area: `x ≈ 50`, `y ≈ 720`

### Fill by Coordinate

```javascript
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFileSync, writeFileSync } from 'fs';

const doc  = await PDFDocument.load(readFileSync('form.pdf'));
const font = await doc.embedFont(StandardFonts.Helvetica);

// Define fields as { page (0-based), x, y, text, size }
const fills = [
  { page: 0, x: 180, y: 680, text: 'Simpson',        size: 11 },
  { page: 0, x: 180, y: 655, text: 'Homer J.',        size: 11 },
  { page: 0, x: 350, y: 655, text: '01/01/1970',      size: 11 },
];

for (const f of fills) {
  doc.getPage(f.page).drawText(f.text, {
    x: f.x, y: f.y,
    size: f.size ?? 11,
    font,
    color: rgb(0, 0, 0),
  });
}

writeFileSync('filled.pdf', await doc.save());
```

### Finding Coordinates

1. Use `pdftotext -bbox-layout form.pdf bbox.xml` to extract text element coordinates (shows where labels are)
2. Add small offsets to place entry text just after each label
3. For checkboxes: draw an "X" centered in the checkbox bounding box

```bash
# Extract bounding boxes to identify label positions
pdftotext -bbox-layout form.pdf bbox.xml
```

Then cross-reference label positions in `bbox.xml` to determine fill coordinates.

---

## Verify Output

```bash
# Convert to images for visual verification
pdftoppm -png -r 150 filled.pdf verify/page
```

Review output PNGs to confirm text placement. If text is off:
- Adjust `x`/`y` in the fills array
- Check page dimensions: `doc.getPage(0).getSize()` returns `{ width, height }`
