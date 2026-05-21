import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const outputPath = join(repoRoot, "my-app", "public", "build-info.json");
const envVersion = (process.env.BUILD_VERSION || process.env.NEXT_PUBLIC_BUILD_VERSION || "").trim();
const version = envVersion || Date.now().toString();

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify({ version })}\n`, "utf8");

console.log(version);
