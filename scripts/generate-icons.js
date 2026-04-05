/**
 * PhoneBridge Icon Generator
 * Generates app icons for Android (mipmap PNGs) and Windows (ICO with embedded PNG).
 * Design: Purple circular background with white phone + camera lens.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ─── PNG Encoder ────────────────────────────────────────────────

function crc32(buf) {
  let crc = 0xffffffff;
  const table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeB = Buffer.from(type);
  const crcB = Buffer.alloc(4);
  crcB.writeUInt32BE(crc32(Buffer.concat([typeB, data])));
  return Buffer.concat([len, typeB, data, crcB]);
}

function createPNG(width, height, pixels) {
  // pixels is Uint8Array of RGBA (width * height * 4)
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Build raw scanlines with filter byte
  const rawSize = height * (1 + width * 4);
  const raw = Buffer.alloc(rawSize);
  for (let y = 0; y < height; y++) {
    const rowOff = y * (1 + width * 4);
    raw[rowOff] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const srcOff = (y * width + x) * 4;
      const dstOff = rowOff + 1 + x * 4;
      raw[dstOff] = pixels[srcOff];     // R
      raw[dstOff + 1] = pixels[srcOff + 1]; // G
      raw[dstOff + 2] = pixels[srcOff + 2]; // B
      raw[dstOff + 3] = pixels[srcOff + 3]; // A
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── Drawing Helpers ────────────────────────────────────────────

function setPixel(pixels, w, x, y, r, g, b, a) {
  if (x < 0 || x >= w || y < 0 || y >= w) return;
  const i = (y * w + x) * 4;
  // Alpha blending
  const srcA = a / 255;
  const dstA = pixels[i + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA > 0) {
    pixels[i]     = Math.round((r * srcA + pixels[i] * dstA * (1 - srcA)) / outA);
    pixels[i + 1] = Math.round((g * srcA + pixels[i + 1] * dstA * (1 - srcA)) / outA);
    pixels[i + 2] = Math.round((b * srcA + pixels[i + 2] * dstA * (1 - srcA)) / outA);
    pixels[i + 3] = Math.round(outA * 255);
  }
}

function fillCircle(pixels, w, cx, cy, radius, r, g, b, a = 255) {
  const r2 = radius * radius;
  for (let dy = -Math.ceil(radius) - 1; dy <= Math.ceil(radius) + 1; dy++) {
    for (let dx = -Math.ceil(radius) - 1; dx <= Math.ceil(radius) + 1; dx++) {
      const dist2 = dx * dx + dy * dy;
      if (dist2 <= r2) {
        // Anti-alias edge
        const dist = Math.sqrt(dist2);
        const edgeAlpha = Math.min(1, Math.max(0, radius - dist + 0.5));
        setPixel(pixels, w, Math.round(cx + dx), Math.round(cy + dy), r, g, b, Math.round(a * edgeAlpha));
      }
    }
  }
}

function fillRoundedRect(pixels, w, x1, y1, x2, y2, radius, r, g, b, a = 255) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      let inside = true;
      let edgeAlpha = 1;

      // Check corners
      const corners = [
        { cx: x1 + radius, cy: y1 + radius }, // top-left
        { cx: x2 - radius, cy: y1 + radius }, // top-right
        { cx: x1 + radius, cy: y2 - radius }, // bottom-left
        { cx: x2 - radius, cy: y2 - radius }, // bottom-right
      ];

      for (const c of corners) {
        const inCornerRegion =
          (x < x1 + radius && y < y1 + radius && x <= c.cx && y <= c.cy) ||
          (x > x2 - radius && y < y1 + radius && x >= c.cx && y <= c.cy) ||
          (x < x1 + radius && y > y2 - radius && x <= c.cx && y >= c.cy) ||
          (x > x2 - radius && y > y2 - radius && x >= c.cx && y >= c.cy);

        if (inCornerRegion) {
          const dist = Math.sqrt((x - c.cx) ** 2 + (y - c.cy) ** 2);
          if (dist > radius + 0.5) {
            inside = false;
          } else if (dist > radius - 0.5) {
            edgeAlpha = Math.max(0, radius + 0.5 - dist);
          }
          break;
        }
      }

      if (inside) {
        setPixel(pixels, w, x, y, r, g, b, Math.round(a * edgeAlpha));
      }
    }
  }
}

function fillRect(pixels, w, x1, y1, x2, y2, r, g, b, a = 255) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      setPixel(pixels, w, x, y, r, g, b, a);
    }
  }
}

// ─── Icon Rendering ─────────────────────────────────────────────

function renderIcon(size) {
  const pixels = new Uint8Array(size * size * 4);
  const S = size; // shorthand
  const s = (v) => Math.round(v * S / 512); // scale factor based on 512px base

  // Background: rounded square with purple gradient
  const bgRadius = s(100);

  // Fill background with gradient (top: #8b5cf6, bottom: #6d28d9)
  for (let y = 0; y < S; y++) {
    const t = y / S;
    const r = Math.round(139 * (1 - t) + 109 * t);
    const g = Math.round(92 * (1 - t) + 40 * t);
    const b = Math.round(246 * (1 - t) + 217 * t);
    for (let x = 0; x < S; x++) {
      // Check if in rounded rect
      let inside = true;
      let alpha = 1;
      const margin = s(8);
      const x1 = margin, y1 = margin, x2 = S - margin - 1, y2 = S - margin - 1;
      const rad = bgRadius;

      const corners = [
        { cx: x1 + rad, cy: y1 + rad },
        { cx: x2 - rad, cy: y1 + rad },
        { cx: x1 + rad, cy: y2 - rad },
        { cx: x2 - rad, cy: y2 - rad },
      ];

      for (const c of corners) {
        const inCorner =
          (x < x1 + rad && y < y1 + rad && x <= c.cx && y <= c.cy) ||
          (x > x2 - rad && y < y1 + rad && x >= c.cx && y <= c.cy) ||
          (x < x1 + rad && y > y2 - rad && x <= c.cx && y >= c.cy) ||
          (x > x2 - rad && y > y2 - rad && x >= c.cx && y >= c.cy);

        if (inCorner) {
          const dist = Math.sqrt((x - c.cx) ** 2 + (y - c.cy) ** 2);
          if (dist > rad + 0.5) inside = false;
          else if (dist > rad - 0.5) alpha = Math.max(0, rad + 0.5 - dist);
          break;
        }
      }

      if (x < x1 || x > x2 || y < y1 || y > y2) inside = false;

      if (inside) {
        setPixel(pixels, S, x, y, r, g, b, Math.round(255 * alpha));
      }
    }
  }

  // Phone body: white rounded rectangle
  const phoneW = s(160);
  const phoneH = s(280);
  const phoneX = Math.round(S / 2 - phoneW / 2);
  const phoneY = Math.round(S / 2 - phoneH / 2) + s(10);
  const phoneR = s(28);

  fillRoundedRect(pixels, S, phoneX, phoneY, phoneX + phoneW, phoneY + phoneH, phoneR,
    255, 255, 255, 240);

  // Phone screen: dark purple inner rect
  const screenMargin = s(12);
  const screenTop = phoneY + s(36);
  const screenBottom = phoneY + phoneH - s(40);
  fillRoundedRect(pixels, S,
    phoneX + screenMargin, screenTop,
    phoneX + phoneW - screenMargin, screenBottom,
    s(12),
    30, 15, 60, 255);

  // Camera lens on screen (the "bridge" concept)
  const lensCX = Math.round(S / 2);
  const lensCY = Math.round((screenTop + screenBottom) / 2) - s(10);
  const lensR = s(38);

  // Outer ring
  fillCircle(pixels, S, lensCX, lensCY, lensR, 200, 180, 255, 200);
  // Inner dark
  fillCircle(pixels, S, lensCX, lensCY, lensR - s(6), 20, 10, 40, 255);
  // Iris ring
  fillCircle(pixels, S, lensCX, lensCY, lensR - s(12), 100, 60, 200, 180);
  // Pupil
  fillCircle(pixels, S, lensCX, lensCY, lensR - s(20), 15, 8, 35, 255);
  // Reflection highlight
  fillCircle(pixels, S, lensCX - s(10), lensCY - s(10), s(8), 255, 255, 255, 180);

  // WiFi arcs (top-right of phone)
  const wifiCX = phoneX + phoneW + s(30);
  const wifiCY = phoneY - s(20);
  for (let arc = 0; arc < 3; arc++) {
    const arcR = s(20 + arc * 18);
    const thickness = s(6);
    for (let angle = -Math.PI * 0.75; angle < -Math.PI * 0.25; angle += 0.01) {
      for (let t = -thickness / 2; t <= thickness / 2; t += 0.5) {
        const r = arcR + t;
        const px = Math.round(wifiCX + Math.cos(angle) * r);
        const py = Math.round(wifiCY + Math.sin(angle) * r);
        setPixel(pixels, S, px, py, 255, 255, 255, 200);
      }
    }
  }
  // WiFi dot
  fillCircle(pixels, S, wifiCX, wifiCY, s(5), 255, 255, 255, 220);

  // Home indicator / notch at bottom of phone
  const notchW = s(50);
  const notchH = s(5);
  fillRoundedRect(pixels, S,
    Math.round(S / 2 - notchW / 2),
    phoneY + phoneH - s(20),
    Math.round(S / 2 + notchW / 2),
    phoneY + phoneH - s(20) + notchH,
    s(3),
    180, 160, 220, 180);

  // Speaker slit at top of phone
  const slitW = s(40);
  const slitH = s(4);
  fillRoundedRect(pixels, S,
    Math.round(S / 2 - slitW / 2),
    phoneY + s(14),
    Math.round(S / 2 + slitW / 2),
    phoneY + s(14) + slitH,
    s(2),
    180, 160, 220, 180);

  return pixels;
}

// ─── File Writers ───────────────────────────────────────────────

function createICO(pngs) {
  // pngs: array of { size, buffer }
  const count = pngs.length;
  const headerSize = 6 + count * 16;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);       // reserved
  header.writeUInt16LE(1, 2);       // ICO type
  header.writeUInt16LE(count, 4);   // image count

  let offset = headerSize;
  const dirs = [];
  for (const p of pngs) {
    const dir = Buffer.alloc(16);
    dir[0] = p.size >= 256 ? 0 : p.size;   // width (0=256)
    dir[1] = p.size >= 256 ? 0 : p.size;   // height
    dir[2] = 0;   // color count
    dir[3] = 0;   // reserved
    dir.writeUInt16LE(1, 4);                // planes
    dir.writeUInt16LE(32, 6);               // bit count
    dir.writeUInt32LE(p.buffer.length, 8);  // data size
    dir.writeUInt32LE(offset, 12);          // offset
    dirs.push(dir);
    offset += p.buffer.length;
  }

  return Buffer.concat([header, ...dirs, ...pngs.map(p => p.buffer)]);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── Main ───────────────────────────────────────────────────────

console.log('Generating PhoneBridge icons...\n');

// Android mipmap sizes
const androidSizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

const androidResDir = path.join(__dirname, '..', 'packages', 'mobile', 'android', 'app', 'src', 'main', 'res');

for (const [folder, size] of Object.entries(androidSizes)) {
  const dir = path.join(androidResDir, folder);
  ensureDir(dir);

  const pixels = renderIcon(size);
  const png = createPNG(size, size, pixels);

  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), png);
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), png);
  console.log(`  Android ${folder}: ${size}x${size} (${png.length} bytes)`);
}

// Windows ICO (16, 32, 48, 64, 128, 256)
const icoSizes = [16, 32, 48, 64, 128, 256];
const icoPngs = [];

for (const size of icoSizes) {
  const pixels = renderIcon(size);
  const png = createPNG(size, size, pixels);
  icoPngs.push({ size, buffer: png });
  console.log(`  ICO layer: ${size}x${size} (${png.length} bytes)`);
}

const desktopResDir = path.join(__dirname, '..', 'packages', 'desktop', 'resources');
ensureDir(desktopResDir);

const ico = createICO(icoPngs);
fs.writeFileSync(path.join(desktopResDir, 'icon.ico'), ico);
console.log(`\n  Windows icon.ico: ${ico.length} bytes (${icoSizes.length} layers)`);

// Also save a 512x512 PNG for general use
const pixels512 = renderIcon(512);
const png512 = createPNG(512, 512, pixels512);
fs.writeFileSync(path.join(desktopResDir, 'icon.png'), png512);
console.log(`  Desktop icon.png: 512x512 (${png512.length} bytes)`);

// Save a 1024x1024 for Play Store
const pixels1024 = renderIcon(1024);
const png1024 = createPNG(1024, 1024, pixels1024);
fs.writeFileSync(path.join(androidResDir, '..', '..', '..', 'playstore-icon.png'), png1024);
console.log(`  Play Store icon: 1024x1024 (${png1024.length} bytes)`);

console.log('\nAll icons generated successfully!');
