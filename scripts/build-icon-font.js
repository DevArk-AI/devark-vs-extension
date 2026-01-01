#!/usr/bin/env node

/**
 * Converts Vibe-Log SVG icon to .woff2 font for VS Code status bar
 *
 * VS Code requires custom icons to be in font format (.woff/.woff2)
 * This script converts our SVG icon to the required format.
 */

const fs = require('fs');
const path = require('path');
const { SVGIcons2SVGFontStream } = require('svgicons2svgfont');
const svg2ttf = require('svg2ttf');
const ttf2woff = require('ttf2woff');

// Use simple monochrome SVG - font icons must be single-path, single-color
const INPUT_SVG = path.join(__dirname, '../resources/vibe-log-icon-mono.svg');
const OUTPUT_DIR = path.join(__dirname, '../resources/fonts');
const TEMP_SVG_FONT = path.join(OUTPUT_DIR, 'vibe-log-icons.svg');
const OUTPUT_WOFF = path.join(OUTPUT_DIR, 'vibe-log-icons.woff');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('[build-icon-font] Converting SVG to font format...');

// Step 1: Create SVG font stream
const fontStream = new SVGIcons2SVGFontStream({
  fontName: 'vibe-log-icons',
  fontHeight: 1000,
  normalize: true,
  log: () => {} // Suppress logs
});

// Collect SVG font output
let svgFontData = '';
fontStream.on('data', (chunk) => {
  svgFontData += chunk.toString();
});

fontStream.on('finish', () => {
  console.log('[build-icon-font] SVG font created');

  // Step 2: Convert SVG font to TTF
  const ttf = svg2ttf(svgFontData, {});
  const ttfBuffer = Buffer.from(ttf.buffer);
  console.log('[build-icon-font] TTF font created');

  // Step 3: Convert TTF to WOFF (better VS Code compatibility than WOFF2)
  const woffBuffer = ttf2woff(ttfBuffer);
  fs.writeFileSync(OUTPUT_WOFF, Buffer.from(woffBuffer.buffer));
  console.log('[build-icon-font] ✓ WOFF font saved to:', OUTPUT_WOFF);

  // Clean up temp file if it exists
  if (fs.existsSync(TEMP_SVG_FONT)) {
    fs.unlinkSync(TEMP_SVG_FONT);
  }

  console.log('[build-icon-font] ✓ Icon font build complete (WOFF format for VS Code compatibility)');
  console.log('[build-icon-font] Unicode: E001 (\\uE001)');
});

fontStream.on('error', (err) => {
  console.error('[build-icon-font] Error:', err);
  process.exit(1);
});

// Step 4: Add the icon to the stream
const glyph = fs.createReadStream(INPUT_SVG);

// Set the unicode value (E001 is in the Private Use Area)
// IMPORTANT: Must use direct unicode escape '\uE001', not String.fromCharCode()
// The svgicons2svgfont library expects this exact format
glyph.metadata = {
  unicode: ['\uE001'],
  name: 'vibe-log-icon'
};

// Write the icon
fontStream.write(glyph);
fontStream.end();
