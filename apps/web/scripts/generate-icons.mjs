/**
 * One-off: renders public/icon.svg to the PNG sizes the manifest and iOS need.
 * Run `npm run icons` after editing icon.svg, commit the output.
 */
import sharp from "sharp";

const targets = [
  { size: 192, out: "public/icon-192.png" },
  { size: 512, out: "public/icon-512.png" },
  { size: 180, out: "public/apple-touch-icon.png" },
];

for (const { size, out } of targets) {
  await sharp("public/icon.svg", { density: 300 }).resize(size, size).png().toFile(out);
  console.log(`wrote ${out} (${size}x${size})`);
}
