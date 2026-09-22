/* One-off generator: renders public/icon.svg to 192px and 512px PNGs via sharp. */
const path = require("node:path");
const sharp = require(path.join(__dirname, "..", "frontend", "node_modules", "sharp"));

const svg = path.join(__dirname, "..", "frontend", "public", "icon.svg");
const outDir = path.join(__dirname, "..", "frontend", "public");

(async () => {
  for (const size of [192, 512]) {
    await sharp(svg, { density: 512 }).resize(size, size).png().toFile(path.join(outDir, `icon-${size}.png`));
    console.log(`wrote icon-${size}.png`);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
