---
name: processing-presentations
description: 'Read, create, and modify PowerPoint (.pptx) presentations using Node.js. Generates slide decks with text, images, charts, tables, and speaker notes. Reads existing presentations to extract content. Triggers: PowerPoint, pptx, create presentation, slide deck, generate slides, presentation template, extract slides, read PowerPoint, build deck, speaker notes.'
argument-hint: 'Provide file path and operation: read, create, or modify'
---

# Processing Presentations

Read, create, and modify `.pptx` files via Node.js scripts executed in the terminal.

**Output directory**: Save generated `.pptx` files to the vault `MCAPS-IQ-Artifacts/` folder when OIL is available, otherwise fall back to `.copilot/docs/` (see `shared-patterns` skill § Artifact Output Directory). Create the target directory before writing.

**Reference implementation**: See `docs/generate-presentation.mjs` for a full 10-slide production deck using all patterns below.

## Packages

| Package | Purpose | Install |
|---|---|---|
| `pptxgenjs` | Create and modify .pptx files | `npm install pptxgenjs` |
| `node-pptx` | Read existing .pptx content | `npm install node-pptx` |
| `unzipper` + `xml2js` | Low-level .pptx XML extraction (fallback) | `npm install unzipper xml2js` |

**Default**: Use `pptxgenjs` for creation — it is the most mature and feature-rich.

## Flow

### 1. Creating a Presentation

#### Scaffolding & Design System

Define a color palette object, reusable helpers, and use block-scoped slides for variable isolation. This keeps the entire deck consistent and the code maintainable.

```javascript
import PptxGenJS from 'pptxgenjs';

const pptx = new PptxGenJS();
pptx.author = 'Author Name';
pptx.title = 'Presentation Title';
pptx.layout = 'LAYOUT_WIDE';  // 13.33 x 7.5 inches

// ── Color palette ────────────────────────────────────────────
// Define all colors in one place. Hex strings WITHOUT '#'.
const C = {
  white: 'FFFFFF', bgLight: 'FAFBFC',
  blue: '0078D4', blueDark: '003D6B', blueDeep: '001B3D',
  teal: '00B7C3', green: '107C10', amber: 'FFB900', red: 'D13438',
  textPri: '1A1A1A', textSec: '484848', textLight: '767676',
  border: 'E1E5E8', card: 'FFFFFF', shadow: 'D0D4D8',
  accent5: 'F0F7FF', accent10: 'E1EFFF',
};
```

#### Slide Background

```javascript
const s = pptx.addSlide();
s.background = { fill: C.bgLight };  // solid fill
// s.background = { path: '/path/to/image.jpg' };  // image background
```

#### Block-Scoped Slides

Wrap each slide in a block to isolate variables and keep the file flat:

```javascript
// SLIDE 1 — TITLE
{
  const s = pptx.addSlide();
  s.background = { fill: C.white };
  s.addText('Title', { x: 1, y: 1.5, w: 8, h: 2, fontSize: 52, bold: true, color: C.blueDeep });
}

// SLIDE 2 — CONTENT
{
  const s = pptx.addSlide();
  s.background = { fill: C.bgLight };
  // ...
}
```

#### Text — Full Options

```javascript
slide.addText('Heading', {
  x: 0.5, y: 0.3, w: '90%', h: 0.7,
  fontSize: 30, bold: true, italic: false,
  color: C.textPri,
  fontFace: 'Segoe UI',    // font family
  align: 'center',          // left | center | right
  valign: 'middle',         // top | middle | bottom
  lineSpacingMultiple: 1.3, // line height multiplier
});
```

#### Bullet Lists

```javascript
slide.addText([
  { text: 'First point', options: { bullet: true, fontSize: 16 } },
  { text: 'Second point', options: { bullet: true, fontSize: 16 } },
  { text: 'Sub-point', options: { bullet: { indent: 20 }, fontSize: 14 } },
], { x: 0.5, y: 1.2, w: '85%', h: 4.5 });
```

#### Tables — Per-Cell Styling

```javascript
// Cells can be plain strings or { text, options } objects
const rows = [
  [
    { text: 'Header', options: { bold: true, fill: { color: C.accent10 }, color: C.blueDark, fontSize: 12, fontFace: 'Segoe UI' } },
    { text: 'Value', options: { bold: true, fill: { color: C.accent10 }, color: C.blueDark, fontSize: 12, fontFace: 'Segoe UI' } },
  ],
  [
    { text: 'Row 1', options: { fill: { color: C.white }, fontSize: 12, fontFace: 'Segoe UI' } },
    { text: 'Data', options: { fill: { color: C.white }, fontSize: 12, fontFace: 'Segoe UI' } },
  ],
  // Alternating row fills for readability
  [
    { text: 'Row 2', options: { fill: { color: C.bgLight }, fontSize: 12, fontFace: 'Segoe UI' } },
    { text: 'Data', options: { fill: { color: C.bgLight }, fontSize: 12, fontFace: 'Segoe UI' } },
  ],
];

slide.addTable(rows, {
  x: 1, y: 1.5, w: 6.3, h: 2.5,
  colW: [2.0, 4.3],
  rowH: [0.42, 0.42, 0.42],
  border: { color: C.border, pt: 0.5 },
});
```

#### Charts — Full Configuration

```javascript
// Chart types: pptx.charts.BAR, LINE, PIE, DOUGHNUT, AREA, SCATTER
slide.addChart(pptx.charts.AREA, [
  {
    name: 'Context Richness',
    labels: ['Week 1', 'Week 4', 'Week 8', 'Week 12+'],
    values: [5, 15, 60, 95],
  },
], {
  x: 0.5, y: 1.5, w: 7.5, h: 4.5,
  showLegend: false,
  showValue: false,
  chartColors: ['00B7C3'],                          // series colors
  catAxisLabelColor: C.textSec,                     // category axis labels
  catAxisLabelFontSize: 10,
  catAxisLabelFontFace: 'Segoe UI',
  valAxisHidden: true,                              // hide value axis
  catGridLine: { style: 'none' },                   // remove category grid lines
  valGridLine: { color: C.border, style: 'dash', size: 0.5 },
  lineDataSymbol: 'circle',                         // data point markers
  lineDataSymbolSize: 7,
  plotArea: { fill: { color: C.bgLight } },         // plot background
});
```

#### Speaker Notes

```javascript
slide.addNotes('Talking points for this slide go here.');
```

#### Images

```javascript
slide.addImage({ path: '/path/to/image.png', x: 1, y: 1, w: 4, h: 3 });
slide.addImage({ data: 'base64string...', x: 1, y: 1, w: 4, h: 3 });
```

### 2. Shapes — The Core Visual Building Block

Polished presentations are **mostly shapes**, not text. Master `addShape` before anything else.

#### Shape Types

| Constant | Use |
|---|---|
| `pptx.shapes.RECTANGLE` | Bars, lines, dividers, fills |
| `pptx.shapes.ROUNDED_RECTANGLE` | Cards, buttons, pills, badges |
| `pptx.shapes.OVAL` | Circles, dots, icon bases, decorative blobs |

#### Shape Properties Reference

```javascript
slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
  x: 1, y: 2, w: 4, h: 2,
  rectRadius: 0.12,                          // corner radius (inches)
  fill: { color: C.card },                   // solid fill
  // fill: { color: C.blue, transparency: 50 }, // semi-transparent fill (0–100)
  line: { color: C.border, width: 0.5 },     // border (width in points)
  rotate: 0,                                  // rotation in degrees
  shadow: {                                   // drop shadow
    type: 'outer', blur: 6, offset: 2,
    color: C.shadow, opacity: 0.3,
  },
});
```

Key properties:
- **`transparency`**: 0 (opaque) to 100 (invisible) — applies inside `fill`
- **`rectRadius`**: corner rounding for ROUNDED_RECTANGLE (inches)
- **`rotate`**: degrees, clockwise
- **`shadow`**: `{ type: 'outer'|'inner', blur, offset, color, opacity }`
- **`line`**: `{ color, width }` — border stroke

#### Elevated Card Pattern (Drop Shadow)

Simulate depth with an offset shadow shape behind a white card:

```javascript
function card(slide, { x, y, w, h, radius = 0.12, accentTop, accentLeft }) {
  // Shadow layer (offset slightly down-right)
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: x + 0.03, y: y + 0.04, w, h, rectRadius: radius,
    fill: { color: C.shadow, transparency: 50 },
  });
  // White card on top
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: radius,
    fill: { color: C.card },
    line: { color: C.border, width: 0.5 },
  });
  // Optional colored accent bar (top or left edge)
  if (accentTop) {
    slide.addShape(pptx.shapes.RECTANGLE, {
      x: x + 0.15, y, w: w - 0.3, h: 0.045,
      fill: { color: accentTop },
    });
  }
  if (accentLeft) {
    slide.addShape(pptx.shapes.RECTANGLE, {
      x, y: y + 0.15, w: 0.05, h: h - 0.3,
      fill: { color: accentLeft },
    });
  }
}
```

#### Shape-Based Icons (No Image Files Needed)

Build recognizable icons from geometric primitives when images aren't available:

```javascript
// Terminal icon — rounded rect + prompt text
function iconTerminal(slide, x, y, color) {
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x, y, w: 0.55, h: 0.45, rectRadius: 0.06,
    fill: { color, transparency: 10 },
    line: { color, width: 1.2 },
  });
  slide.addText('>_', {
    x, y: y + 0.02, w: 0.55, h: 0.4,
    fontSize: 14, bold: true, color, align: 'center',
    fontFace: 'Cascadia Code', valign: 'middle',
  });
}

// Shield / checkmark icon
function iconShield(slide, x, y, color) {
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: x + 0.05, y, w: 0.44, h: 0.35, rectRadius: 0.08,
    fill: { color, transparency: 10 },
    line: { color, width: 1.2 },
  });
  slide.addText('\u2713', {
    x: x + 0.05, y: y + 0.02, w: 0.44, h: 0.38,
    fontSize: 18, bold: true, color, align: 'center', valign: 'middle',
  });
}
```

Icons fit in a ~0.55×0.55" bounding box. Compose from OVAL, RECTANGLE, ROUNDED_RECTANGLE and overlay text for symbols (✓, !, >_, { }).

#### Decorative Patterns

```javascript
// Dot grid for background texture
function dotGrid(slide, startX, startY, cols, rows, color, spacing = 0.4, size = 0.04) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      slide.addShape(pptx.shapes.OVAL, {
        x: startX + c * spacing, y: startY + r * spacing,
        w: size, h: size,
        fill: { color, transparency: 40 },
      });
    }
  }
}

// Accent strip along slide edge
function accentStrip(slide, side, color) {
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: side === 'left' ? 0 : 13.27, y: 0, w: 0.06, h: 7.5,
    fill: { color },
  });
}

// Progress bar at top of slide
function progressBar(slide, current, total = 10) {
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: 13.33, h: 0.04, fill: { color: C.border },
  });
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: 13.33 * (current / total), h: 0.04, fill: { color: C.blue },
  });
}
```

#### Thin Dividers & Connectors

```javascript
// Horizontal divider line
slide.addShape(pptx.shapes.RECTANGLE, {
  x: 2.0, y: 3.35, w: 9.3, h: 0.01, fill: { color: C.border },
});

// Vertical divider
slide.addShape(pptx.shapes.RECTANGLE, {
  x: 7.6, y: 1.2, w: 0.01, h: 2.0, fill: { color: C.border },
});
```

### 3. Reading a Presentation

**Option A — node-pptx** (structured parsing):

```javascript
import PPTX from 'node-pptx';

const pptx = new PPTX.Composer();
await pptx.load(inputPath);
// Access slides via pptx internal structure
```

**Option B — Manual XML extraction** (more reliable for text-only):

```javascript
import { createReadStream } from 'fs';
import unzipper from 'unzipper';
import { parseStringPromise } from 'xml2js';

const directory = await unzipper.Open.file(inputPath);
const slideFiles = directory.files.filter(f => f.path.match(/ppt\/slides\/slide\d+\.xml/));

for (const file of slideFiles.sort((a, b) => a.path.localeCompare(b.path))) {
  const content = await file.buffer();
  const xml = await parseStringPromise(content.toString());
  const texts = JSON.stringify(xml).match(/"a:t":\["([^"]+)"\]/g);
  console.log(`--- ${file.path} ---`);
  console.log(texts?.map(t => t.match(/\["(.+)"\]/)?.[1]).join(' '));
}
```

### 4. Modifying an Existing Presentation

`pptxgenjs` does not support opening existing files for in-place editing. Strategies:

1. **Recreate**: Read content from existing .pptx (Option B above), then rebuild with `pptxgenjs`
2. **XML surgery**: Unzip .pptx, modify specific slide XML, rezip — fragile, use only for simple text replacements
3. **Python fallback**: `python-pptx` has full read/modify/write support — use if modification is critical

## Positioning Reference

All coordinates in inches from top-left. Default slide size: 10×7.5 (standard) or 13.33×7.5 (wide).

| Element | Typical Position |
|---|---|
| Title | `x: 0.8, y: 0.3, w: 12, h: 0.7` |
| Subtitle | `x: 0.8, y: 0.9, w: 8, h: 0.35` |
| Body text | `x: 0.8, y: 1.2, w: '85%', h: 5.0` |
| Full-slide image | `x: 0, y: 0, w: '100%', h: '100%'` |
| Card row (3-up) | `x: 0.8 + i*4.1, y: 1.6, w: 3.75, h: 3.5` |
| Card row (3-up tight) | `x: 1.5 + i*3.6, y: 5.1, w: 3.2, h: 1.15` |
| Tagline | `x: 1.0, y: 6.55, w: 11.33, h: 0.55` |
| Slide number | `x: 12.5, y: 7.05, w: 0.5, h: 0.25` |
| Footer | `x: 0.5, y: 6.8, fontSize: 10` |

## Design Patterns

- **Color palette constant**: Define all colors once at the top. Refer by name everywhere.
- **Reusable helper functions**: Extract repeated visual patterns (`card`, `tagline`, `slideNum`, `progressBar`, icons) into functions.
- **Block-scoped slides**: Wrap each slide in `{ }` to avoid variable collisions.
- **Shape-based icons**: Build icons from OVAL + RECTANGLE + text overlays (~0.55" bounding box). Avoids external image dependencies.
- **Shadow simulation**: Offset a semi-transparent shape behind a white shape for depth.
- **Accent bars**: Thin colored rectangles on slide edges, card tops, or card left sides for visual hierarchy.
- **Decorative backgrounds**: Low-opacity OVALs, dot grids, and diagonal lines add texture without competing with content.
- **Connector arrows**: Use thin RECTANGLEs + small OVALs or chevron text between cards for flow.

## Validation

1. Output file exists and size > 0 bytes
2. Open with `unzipper` and verify slide count matches expected
3. Report output path and slide count to user

## Gotchas

- `pptxgenjs` is create-only — cannot open/edit existing .pptx files
- Colors are hex strings WITHOUT `#` prefix: `'003366'` not `'#003366'`
- Coordinates are in **inches**, not pixels or points
- Charts require arrays of `{ name, labels, values }` objects
- `transparency` goes inside the `fill` object: `{ color: 'AABBCC', transparency: 50 }`
- `rectRadius` only works on `ROUNDED_RECTANGLE`, not `RECTANGLE`
- `lineSpacingMultiple` controls line height (e.g. `1.3` = 130%)
- `valign` (`top`/`middle`/`bottom`) is separate from `align` (`left`/`center`/`right`)
- Shape render order matters — later shapes draw on top of earlier ones (shadows must come first)
- For complex existing-file modifications, recommend Python `python-pptx`
