/**
 * Migration Script: Extract Base64 Logos from Encrypted JSON
 * 
 * This script:
 * 1. Reads the encrypted team-resources.enc.json
 * 2. Decrypts it
 * 3. Extracts Base64 logos and saves them as WebP files
 * 4. Replaces Base64 with URL paths
 * 5. Re-encrypts and saves the data
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const CryptoJS = require('crypto-js');

const DATA_FILE = path.join(__dirname, '..', 'data', 'team-resources.enc.json');
const LOGOS_DIR = path.join(__dirname, '..', 'public', 'team-logos');
const ENCRYPTION_KEY = "ScriptHub@TeamResources#2024!Secure";

// 确保目录存在
if (!fs.existsSync(LOGOS_DIR)) {
    fs.mkdirSync(LOGOS_DIR, { recursive: true });
}

async function migrate() {
    console.log('=== Team Resources Logo Migration ===\n');

    // 1. 读取加密文件
    if (!fs.existsSync(DATA_FILE)) {
        console.log('❌ Data file not found:', DATA_FILE);
        return;
    }

    const encryptedData = fs.readFileSync(DATA_FILE, 'utf-8');
    console.log('✅ Read encrypted data file');

    // 2. 解密
    const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);

    if (!decrypted) {
        console.log('❌ Failed to decrypt data');
        return;
    }

    const groups = JSON.parse(decrypted);
    console.log(`✅ Decrypted ${groups.length} groups\n`);

    // 3. 处理每个集团的 Logo
    let extractedCount = 0;
    let skippedCount = 0;
    let totalOriginalSize = 0;
    let totalNewSize = 0;

    for (const group of groups) {
        if (!group.logo) {
            console.log(`⏭️  ${group.name}: No logo`);
            continue;
        }

        // 检查是否已经是 URL 路径
        if (group.logo.startsWith('/team-logos/') || group.logo.startsWith('http')) {
            console.log(`⏭️  ${group.name}: Already using URL path`);
            skippedCount++;
            continue;
        }

        // 检查是否是 Base64
        const matches = group.logo.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!matches) {
            console.log(`⚠️  ${group.name}: Unknown logo format`);
            continue;
        }

        try {
            const originalBase64Size = group.logo.length;
            totalOriginalSize += originalBase64Size;

            const imageBuffer = Buffer.from(matches[2], 'base64');
            const outputPath = path.join(LOGOS_DIR, `${group.id}.webp`);

            // 转换为 WebP
            await sharp(imageBuffer)
                .webp({ quality: 85 })
                .toFile(outputPath);

            const newStats = fs.statSync(outputPath);
            totalNewSize += newStats.size;

            // 替换为 URL 路径
            group.logo = `/team-logos/${group.id}.webp`;

            const reduction = ((1 - newStats.size / (originalBase64Size * 0.75)) * 100).toFixed(1);
            console.log(`✅ ${group.name}: Extracted ${group.id}.webp (${reduction}% smaller)`);
            extractedCount++;
        } catch (error) {
            console.error(`❌ ${group.name}: Failed - ${error.message}`);
        }
    }

    // 4. 重新加密并保存
    const newJsonStr = JSON.stringify(groups);
    const newEncrypted = CryptoJS.AES.encrypt(newJsonStr, ENCRYPTION_KEY).toString();
    fs.writeFileSync(DATA_FILE, newEncrypted, 'utf-8');

    console.log('\n=== Migration Summary ===');
    console.log(`Extracted: ${extractedCount}`);
    console.log(`Skipped (already URL): ${skippedCount}`);
    console.log(`Original Base64 size: ${(totalOriginalSize / 1024).toFixed(1)} KB`);
    console.log(`New WebP files size: ${(totalNewSize / 1024).toFixed(1)} KB`);
    console.log(`Reduction: ${totalOriginalSize > 0 ? ((1 - totalNewSize / (totalOriginalSize * 0.75)) * 100).toFixed(1) : 0}%`);
    console.log('\n✅ Data file re-encrypted and saved');
}

migrate().catch(console.error);
