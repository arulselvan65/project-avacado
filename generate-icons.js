const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// Function to generate raw PNG with Node.js built-in zlib
function createPng(width, height, drawPixelFn) {
  // RGBA buffer (width * height * 4)
  const rawData = Buffer.alloc((width * 4 + 1) * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (width * 4 + 1);
    rawData[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = drawPixelFn(x, y, width, height);
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // 8 bits per channel
  ihdr.writeUInt8(6, 9); // RGBA color type
  ihdr.writeUInt8(0, 10); // compression method
  ihdr.writeUInt8(0, 11); // filter method
  ihdr.writeUInt8(0, 12); // interlace method

  const ihdrChunk = makeChunk("IHDR", ihdr);
  const idatChunk = makeChunk("IDAT", compressedData);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// CRC32 implementation for PNG chunks
function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(len + 12);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);

  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    crcTable[n] = c;
  }

  let crc = 0xffffffff;
  for (let i = 4; i < len + 8; i++) {
    crc = crcTable[(crc ^ chunk[i]) & 0xff] ^ (crc >>> 8);
  }
  crc = crc ^ 0xffffffff;
  chunk.writeInt32BE(crc, len + 8);
  return chunk;
}

// Beautiful Avocado / Leaf Icon Drawer
function drawAvocado(x, y, w, h) {
  const nx = (x / w) * 2 - 1; // -1 to 1
  const ny = (y / h) * 2 - 1; // -1 to 1

  // Rounded squircle background (#0a0d14 with gradient to #16201a)
  const cornerRadius = 0.28;
  const distBg = Math.max(Math.abs(nx), Math.abs(ny));
  const bgGrad = (ny + 1) / 2;
  const bgR = Math.round(10 + bgGrad * 8);
  const bgG = Math.round(16 + bgGrad * 26);
  const bgB = Math.round(20 + bgGrad * 14);

  // Outer glow / border
  const borderDist = Math.hypot(nx, ny);

  // Avocado shape formula: egg shape (wider at bottom, narrower at top)
  const avoY = ny + 0.05; // slightly centered
  const avoWidthFactor = 1.0 - avoY * 0.35;
  const avoX = nx / Math.max(0.2, avoWidthFactor);
  const avoDist = Math.hypot(avoX * 1.5, avoY * 1.3);

  // Seed (pit)
  const pitY = avoY - 0.22;
  const pitDist = Math.hypot(nx * 2.2, pitY * 2.2);

  // Stem / leaf at top
  const leafX = nx - 0.12;
  const leafY = ny + 0.62;
  const leafDist = Math.hypot(leafX * 3.0, leafY * 1.8);

  // Render priority
  if (leafDist < 0.25 && leafY > -0.05) {
    // Green leaf
    return [34, 197, 94, 255];
  }

  if (pitDist < 0.32) {
    // Brown seed with shine
    const shine = Math.hypot(nx * 2.2 + 0.08, pitY * 2.2 + 0.08);
    if (shine < 0.12) {
      return [180, 110, 60, 255];
    }
    return [130, 70, 30, 255];
  }

  if (avoDist < 0.82 && avoDist >= 0.70) {
    // Dark green avocado skin
    return [20, 83, 45, 255];
  }

  if (avoDist < 0.70) {
    // Light creamy avocado flesh
    const fleshGrad = (avoY + 0.5) / 1.0;
    const r = Math.round(163 + fleshGrad * 40);
    const g = Math.round(230 - fleshGrad * 20);
    const b = Math.round(53);
    return [r, g, b, 255];
  }

  // Background
  return [bgR, bgG, bgB, 255];
}

const iconsDir = path.join(__dirname, "public", "icons");
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Generate icon-192.png
const png192 = createPng(192, 192, drawAvocado);
fs.writeFileSync(path.join(iconsDir, "icon-192.png"), png192);
console.log("Generated icon-192.png");

// Generate icon-512.png
const png512 = createPng(512, 512, drawAvocado);
fs.writeFileSync(path.join(iconsDir, "icon-512.png"), png512);
console.log("Generated icon-512.png");

// Generate apple-touch-icon.png (180x180)
const pngApple = createPng(180, 180, drawAvocado);
fs.writeFileSync(path.join(iconsDir, "apple-touch-icon.png"), pngApple);
console.log("Generated apple-touch-icon.png");

// Also copy or write to public root for maximum compatibility
fs.writeFileSync(path.join(__dirname, "public", "apple-touch-icon.png"), pngApple);
fs.writeFileSync(path.join(__dirname, "public", "icon-192.png"), png192);
fs.writeFileSync(path.join(__dirname, "public", "icon-512.png"), png512);
console.log("All PWA icons successfully generated.");
