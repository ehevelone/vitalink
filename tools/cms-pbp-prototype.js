const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  buildMatchPreview,
  extractMedicalCostShareSnapshot,
  extractMedicarePlanIds,
  normalizeKey,
  objectMatchesPlan,
  parseMedicarePlanId,
} = require("./cms-pbp-utils");

const CMS_PBP_2026_JSON_URL =
  "https://www.cms.gov/files/zip/pbp-benefits-2026-json.zip";

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;

    const key = arg.slice(2);
    const next = argv[i + 1];

    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }

  return args;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function downloadFile(url, targetPath) {
  ensureDir(path.dirname(targetPath));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(targetPath, bytes);

  return {
    targetPath,
    bytes: bytes.length,
  };
}

function extractZip(zipPath, outputDir) {
  ensureDir(outputDir);
  const quotedZipPath = zipPath.replace(/'/g, "''");
  const quotedOutputDir = outputDir.replace(/'/g, "''");

  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Expand-Archive -LiteralPath '${quotedZipPath}' -DestinationPath '${quotedOutputDir}' -Force`,
    ],
    { stdio: "inherit" }
  );
}

function listJsonFiles(dir) {
  const files = [];

  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

function walkForMatches(node, plan, file, matches, currentPath = "$") {
  if (!node || matches.length >= 50) return;

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      walkForMatches(node[i], plan, file, matches, `${currentPath}[${i}]`);
    }
    return;
  }

  if (typeof node !== "object") return;

  if (objectMatchesPlan(node, plan)) {
    const preview = buildMatchPreview(node);
    const medicalSnapshot = node.benefitDetails
      ? extractMedicalCostShareSnapshot(node)
      : null;

    matches.push({
      file,
      path: currentPath,
      ...preview,
      medicalSnapshot,
    });
  }

  for (const [key, value] of Object.entries(node)) {
    walkForMatches(value, plan, file, matches, `${currentPath}.${key}`);
  }
}

function inspectJsonFiles(files, plan, limit) {
  const report = {
    plan,
    filesScanned: 0,
    filesContainingContract: [],
    matches: [],
    parseErrors: [],
  };

  for (const file of files) {
    if (report.filesScanned >= limit) break;
    report.filesScanned += 1;

    const raw = fs.readFileSync(file, "utf8");

    if (raw.includes(plan.contract)) {
      report.filesContainingContract.push(path.basename(file));
    }

    if (!raw.includes(plan.contract)) {
      continue;
    }

    try {
      const json = JSON.parse(raw);
      walkForMatches(json, plan, path.basename(file), report.matches);
    } catch (error) {
      report.parseErrors.push({
        file: path.basename(file),
        error: error.message,
      });
    }
  }

  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.text) {
    const text = fs.existsSync(args.text)
      ? fs.readFileSync(args.text, "utf8")
      : args.text;

    console.log(
      JSON.stringify(
        {
          source: fs.existsSync(args.text) ? path.resolve(args.text) : "inline",
          extractedPlanIds: extractMedicarePlanIds(text),
        },
        null,
        2
      )
    );
    return;
  }

  const plan = parseMedicarePlanId(args.plan || "H2802-001-0");
  const cacheDir = path.resolve(args.cache || ".cms-cache");
  const year = args.year || "2026";
  const zipPath = path.resolve(
    args.zip || path.join(cacheDir, `pbp-benefits-${year}-json.zip`)
  );
  const extractDir = path.resolve(
    args.dir || path.join(cacheDir, `pbp-benefits-${year}-json`)
  );
  const limit = Number(args.limit || 5000);

  if (!args.dir && !fs.existsSync(extractDir)) {
    if (!fs.existsSync(zipPath)) {
      console.log(`Downloading CMS PBP ${year} JSON data...`);
      const result = await downloadFile(CMS_PBP_2026_JSON_URL, zipPath);
      console.log(`Downloaded ${result.bytes.toLocaleString()} bytes.`);
    }

    console.log("Extracting CMS ZIP...");
    extractZip(zipPath, extractDir);
  }

  const files = listJsonFiles(extractDir);
  const report = inspectJsonFiles(files, plan, limit);

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
