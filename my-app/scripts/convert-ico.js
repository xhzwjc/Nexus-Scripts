/**
 * ICO to WebP Conversion Script
 * Uses decode-ico to handle ICO files that Sharp can't process directly
 */

const decodeIco = require('decode-ico');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const LOGOS_DIR = 'e:\\Python_project\\project-root\\my-app\\public\\ai-logos';
const WEBP_QUALITY = 85;

async function convertRemainingIcos() {
    const files = fs.readdirSync(LOGOS_DIR);
    const icoFiles = files.filter(f => path.extname(f).toLowerCase() === '.ico');

    console.log(`Found ${icoFiles.length} remaining ICO files to convert`);
    console.log('---');

    let successCount = 0;
    let failCount = 0;
    let totalOriginalSize = 0;
    let totalNewSize = 0;

    for (const file of icoFiles) {
        const inputPath = path.join(LOGOS_DIR, file);
        const baseName = path.basename(file, '.ico');
        const outputPath = path.join(LOGOS_DIR, `${baseName}.webp`);

        try {
            const originalStats = fs.statSync(inputPath);
            totalOriginalSize += originalStats.size;

            // Read ICO file
            const icoData = fs.readFileSync(inputPath);

            // Decode ICO - returns array of images
            const images = decodeIco(icoData);

            if (images.length === 0) {
                throw new Error('No images found in ICO');
            }

            // Get the largest image (best quality)
            const largestImage = images.reduce((max, img) =>
                (img.width * img.height > max.width * max.height) ? img : max
            );

            // Convert to WebP using Sharp
            // ICO images from decode-ico are in raw RGBA format
            await sharp(Buffer.from(largestImage.data), {
                raw: {
                    width: largestImage.width,
                    height: largestImage.height,
                    channels: 4
                }
            })
                .webp({ quality: WEBP_QUALITY })
                .toFile(outputPath);

            const newStats = fs.statSync(outputPath);
            totalNewSize += newStats.size;

            const reduction = ((1 - newStats.size / originalStats.size) * 100).toFixed(1);
            console.log(`✅ ${file} -> ${baseName}.webp (${largestImage.width}x${largestImage.height}, ${reduction}% smaller)`);

            // Delete original ICO file
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
    if (totalOriginalSize > 0) {
        console.log(`Original size: ${(totalOriginalSize / 1024).toFixed(1)} KB`);
        console.log(`New size: ${(totalNewSize / 1024).toFixed(1)} KB`);
        console.log(`Total reduction: ${((1 - totalNewSize / totalOriginalSize) * 100).toFixed(1)}%`);
    }
}

convertRemainingIcos().catch(console.error);
