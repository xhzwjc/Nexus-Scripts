/**
 * Logo Format Conversion Script
 * Converts all ICO, PNG, SVG files to WebP format for better compression
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const LOGOS_DIR = 'e:\\\\Python_project\\\\project-root\\\\my-app\\\\public\\\\ai-logos';
const WEBP_QUALITY = 85; // Good balance between quality and size

async function convertToWebP() {
    const files = fs.readdirSync(LOGOS_DIR);
    const toConvert = files.filter(f =>
        ['.ico', '.png', '.jpg', '.jpeg'].includes(path.extname(f).toLowerCase())
    );

    console.log(`Found ${toConvert.length} files to convert to WebP`);
    console.log('---');

    let successCount = 0;
    let failCount = 0;
    let totalOriginalSize = 0;
    let totalNewSize = 0;

    for (const file of toConvert) {
        const inputPath = path.join(LOGOS_DIR, file);
        const baseName = path.basename(file, path.extname(file));
        const outputPath = path.join(LOGOS_DIR, `${baseName}.webp`);

        try {
            const originalStats = fs.statSync(inputPath);
            totalOriginalSize += originalStats.size;

            // Convert to WebP
            await sharp(inputPath)
                .webp({ quality: WEBP_QUALITY })
                .toFile(outputPath);

            const newStats = fs.statSync(outputPath);
            totalNewSize += newStats.size;

            const reduction = ((1 - newStats.size / originalStats.size) * 100).toFixed(1);
            console.log(`✅ ${file} -> ${baseName}.webp (${reduction}% smaller)`);

            // Delete original file after successful conversion
            fs.unlinkSync(inputPath);
            successCount++;
        } catch (error) {
            console.error(`❌ Failed to convert ${file}: ${error.message}`);
            failCount++;
        }
    }

    // Handle SVG files separately (Sharp can convert them too)
    const svgFiles = files.filter(f => path.extname(f).toLowerCase() === '.svg');
    console.log(`\nFound ${svgFiles.length} SVG files to convert`);

    for (const file of svgFiles) {
        const inputPath = path.join(LOGOS_DIR, file);
        const baseName = path.basename(file, '.svg');
        const outputPath = path.join(LOGOS_DIR, `${baseName}.webp`);

        try {
            const originalStats = fs.statSync(inputPath);
            totalOriginalSize += originalStats.size;

            // Convert SVG to WebP at 128x128 (good size for logos)
            await sharp(inputPath, { density: 300 })
                .resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .webp({ quality: WEBP_QUALITY })
                .toFile(outputPath);

            const newStats = fs.statSync(outputPath);
            totalNewSize += newStats.size;

            console.log(`✅ ${file} -> ${baseName}.webp`);

            // Delete original SVG
            fs.unlinkSync(inputPath);
            successCount++;
        } catch (error) {
            console.error(`❌ Failed to convert ${file}: ${error.message}`);
            failCount++;
        }
    }

    console.log('\n--- Summary ---');
    console.log(`Total converted: ${successCount}`);
    console.log(`Failed: ${failCount}`);
    console.log(`Original size: ${(totalOriginalSize / 1024).toFixed(1)} KB`);
    console.log(`New size: ${(totalNewSize / 1024).toFixed(1)} KB`);
    console.log(`Total reduction: ${((1 - totalNewSize / totalOriginalSize) * 100).toFixed(1)}%`);
}

convertToWebP().catch(console.error);
