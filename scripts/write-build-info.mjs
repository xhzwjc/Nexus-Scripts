import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const appRoot = join(repoRoot, "my-app");
const outputPath = join(appRoot, "public", "build-info.json");
const packageJson = JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8"));

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSemver(value, fallback) {
  const normalized = clean(value).replace(/^v/i, "");
  return SEMVER_PATTERN.test(normalized) ? normalized : fallback;
}

function compactUtcTimestamp(date) {
  return date.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}

function sanitizeBuildId(value) {
  const sanitized = clean(value)
    .replace(/[^0-9A-Za-z._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128);
  return sanitized || "build-unknown";
}

function readGitCommit() {
  const fromEnvironment = clean(
    process.env.GIT_COMMIT
      || process.env.GITHUB_SHA
      || process.env.CI_COMMIT_SHA,
  );
  if (fromEnvironment) {
    return fromEnvironment;
  }

  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const builtAt = new Date();
const packageVersion = normalizeSemver(packageJson.version, "0.1.0");
const legacyBuildVersion = clean(process.env.BUILD_VERSION);
const legacySemver = normalizeSemver(legacyBuildVersion, "");
const releaseVersion = normalizeSemver(
  process.env.APP_VERSION || process.env.RELEASE_VERSION || legacySemver,
  packageVersion,
);
const githubBuildNumber = clean(process.env.GITHUB_RUN_NUMBER)
  ? `${clean(process.env.GITHUB_RUN_NUMBER)}.${clean(process.env.GITHUB_RUN_ATTEMPT) || "1"}`
  : "";
const buildNumber = sanitizeBuildId(
  process.env.BUILD_NUMBER
    || githubBuildNumber
    || process.env.CI_PIPELINE_IID
    || compactUtcTimestamp(builtAt),
);
const commitSha = readGitCommit();
const commitShort = commitSha.slice(0, 12);
const legacyDeploymentId = legacyBuildVersion && legacyBuildVersion !== "dev" && !legacySemver
  ? legacyBuildVersion
  : "";
const explicitDeploymentId = clean(
  process.env.DEPLOYMENT_ID
    || process.env.NEXT_DEPLOYMENT_ID
    || legacyDeploymentId,
);
const buildId = sanitizeBuildId(
  explicitDeploymentId || `${commitShort || "build"}-${buildNumber}`,
);

const buildInfo = {
  schemaVersion: 1,
  version: releaseVersion,
  buildId,
  buildNumber,
  commitSha,
  builtAt: builtAt.toISOString(),
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(buildInfo)}\n`, "utf8");

console.log(`Generated app build ${releaseVersion} (${buildId})`);
