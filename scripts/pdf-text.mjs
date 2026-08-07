/**
 * Extracts text from a PDF, page by page, so we can read published forms
 * without a native renderer installed.
 *
 * Usage: node scripts/pdf-text.mjs <file.pdf> [firstPage] [lastPage]
 */

import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const [, , file, from = "1", to = "0"] = process.argv;
if (!file) {
  console.error("usage: node scripts/pdf-text.mjs <file.pdf> [firstPage] [lastPage]");
  process.exit(1);
}

const data = new Uint8Array(readFileSync(file));
const doc = await getDocument({ data, useSystemFonts: true }).promise;

const first = Math.max(1, Number(from));
const last = Number(to) > 0 ? Math.min(doc.numPages, Number(to)) : doc.numPages;

console.log(`### ${file}  (${doc.numPages} pages, showing ${first} to ${last})`);

for (let n = first; n <= last; n += 1) {
  const page = await doc.getPage(n);
  const content = await page.getTextContent();

  // Rebuild lines by grouping items that share a vertical position, which
  // keeps form labels next to their fields instead of collapsing everything.
  const lines = new Map();
  for (const item of content.items) {
    if (!item.str || !item.str.trim()) continue;
    const y = Math.round(item.transform[5]);
    const bucket = lines.get(y) ?? [];
    bucket.push({ x: item.transform[4], text: item.str });
    lines.set(y, bucket);
  }

  const ordered = [...lines.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, items]) =>
      items
        .sort((a, b) => a.x - b.x)
        .map((i) => i.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((l) => l.length > 0);

  console.log(`\n----- PAGE ${n} -----`);
  console.log(ordered.join("\n"));
}
