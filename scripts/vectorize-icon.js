#!/usr/bin/env node

/**
 * Extracts PNG from embedded SVG and converts it to a vector SVG using Potrace
 */

const fs = require('fs');
const path = require('path');
const potrace = require('potrace');
const sharp = require('sharp');

const INPUT_SVG = path.join(__dirname, '../resources/vibe-log-statusbar.svg');
const OUTPUT_SVG = path.join(__dirname, '../resources/vibe-log-vector.svg');
const TEMP_PNG = path.join(__dirname, '../resources/temp-icon.png');

console.log('[vectorize] Reading SVG with embedded PNG...');

// Read the SVG file
const svgContent = fs.readFileSync(INPUT_SVG, 'utf8');

// Extract base64 PNG data
const match = svgContent.match(/data:image\/png;base64,([^"]+)/);
if (!match) {
  console.error('[vectorize] Error: Could not find embedded PNG data');
  process.exit(1);
}

const base64Data = match[1];
const pngBuffer = Buffer.from(base64Data, 'base64');

console.log('[vectorize] Extracted PNG data, size:', pngBuffer.length, 'bytes');

// Save temporary PNG file
fs.writeFileSync(TEMP_PNG, pngBuffer);

// Process image for better tracing - keep larger size and enhance contrast
sharp(TEMP_PNG)
  .resize(256, 256, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
  .normalise() // Enhance contrast
  .toBuffer()
  .then((resizedBuffer) => {
    console.log('[vectorize] Resized to 256x256 with enhanced contrast');

    // Trace the PNG to create vector SVG with better quality settings
    potrace.trace(resizedBuffer, {
      color: '#000000',
      optTolerance: 0.1,  // Lower = more detail
      turdSize: 1,        // Lower = capture smaller details
      threshold: 180,     // Higher = more aggressive
      turnPolicy: potrace.Potrace.TURNPOLICY_MINORITY,
      alphaMax: 1.0
    }, (err, svg) => {
      if (err) {
        console.error('[vectorize] Error tracing:', err);
        process.exit(1);
      }

      // Save the vectorized SVG
      fs.writeFileSync(OUTPUT_SVG, svg);
      console.log('[vectorize] ✓ Vectorized SVG saved to:', OUTPUT_SVG);

      // Clean up temp file
      if (fs.existsSync(TEMP_PNG)) {
        fs.unlinkSync(TEMP_PNG);
        console.log('[vectorize] ✓ Cleaned up temporary PNG');
      }

      console.log('[vectorize] ✓ Vectorization complete!');
    });
  })
  .catch((err) => {
    console.error('[vectorize] Error resizing PNG:', err);
    process.exit(1);
  });
