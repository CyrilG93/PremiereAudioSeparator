// // Validate release-critical configuration without requiring platform packaging tools.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

async function readProjectFile(relativePath) {
  // // Read all verification inputs from the repository root.
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

function assertCondition(condition, message) {
  // // Stop verification immediately with an actionable failure message.
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  // // Keep every user-visible version fallback aligned with package.json.
  const packageJson = JSON.parse(await readProjectFile("package.json"));
  const version = String(packageJson.version || "").trim();
  assertCondition(/^\d+\.\d+\.\d+$/.test(version), "package.json must contain a semantic version.");

  const manifest = await readProjectFile("CSXS/manifest.xml");
  const app = await readProjectFile("client/app.js");
  const html = await readProjectFile("client/index.html");
  const translations = await readProjectFile("client/translations.js");
  const readme = await readProjectFile("README.md");
  assertCondition(manifest.includes(`ExtensionBundleVersion="${version}"`), "Manifest bundle version is stale.");
  assertCondition(manifest.includes(`Version="${version}"/>`), "Manifest extension version is stale.");
  assertCondition(app.includes(`CURRENT_VERSION = '${version}'`), "client/app.js version fallback is stale.");
  assertCondition(html.includes(`>v${version}</button>`), "client/index.html version badge is stale.");
  assertCondition(html.includes('<script src="progress.js"></script>'), "Global progress tracker is not loaded by the panel.");
  assertCondition(translations.includes(`version: "v${version} - Robust"`), "Translation version is stale.");
  assertCondition(readme.startsWith(`# Audio Separator v${version}`), "README title version is stale.");

  // // Reject the unsupported Demucs option that previously broke Fast mode.
  assertCondition(!app.includes("--quantized"), "Fast mode must not use the unsupported --quantized option.");
  assertCondition(app.includes("args.push('--shifts', '0')"), "Fast mode must use supported reduced-shift settings.");
  assertCondition(
    app.includes("createGlobalProgressTracker") && app.includes("progressTracker.consumeStderr(output)"),
    "Demucs output must use the global progress tracker."
  );

  const windowsPackage = await readProjectFile("scripts/audioseparator-package-windows-exe.mjs");
  const macPackage = await readProjectFile("scripts/audioseparator-package-macos-pkg.mjs");
  const workflow = await readProjectFile(".github/workflows/build-windows-installer.yml");
  const buildDoc = await readProjectFile("docs/windows-installer-build.md");
  for (const [name, contents] of [
    ["Windows package script", windowsPackage],
    ["Windows workflow", workflow],
    ["Windows build documentation", buildDoc]
  ]) {
    assertCondition(!/\blight\b/i.test(contents), `${name} must remain Full-only.`);
  }
  assertCondition(windowsPackage.includes("Windows-Full-Installer"), "Windows package must create a Full installer.");
  assertCondition(
    windowsPackage.includes('for (const fileName of [".debug", "README.md"])'),
    "Windows installer payload must exclude the legacy updater."
  );
  assertCondition(
    macPackage.includes('for (const fileName of [".debug", "README.md"])'),
    "macOS installer payload must exclude the legacy updater."
  );

  // // Pin the runtime versions on both platforms so rebuilds cannot silently drift.
  for (const [name, contents] of [
    ["Windows package script", windowsPackage],
    ["macOS package script", macPackage]
  ]) {
    assertCondition(contents.includes('"4.1.0"'), `${name} must pin Demucs 4.1.0.`);
    assertCondition(contents.includes('"2.13.0"'), `${name} must pin Torch 2.13.0.`);
    assertCondition(contents.includes('"2.4.6"'), `${name} must pin NumPy 2.4.6.`);
    assertCondition(contents.includes("save_audio(torch.zeros"), `${name} must validate real WAV output.`);
  }

  // // Protect the postinstall script from Windows line-ending conversion.
  const macInstaller = await readFile(
    path.join(projectRoot, "installers", "audioseparator_install_macos_private_runtime.sh")
  );
  assertCondition(!macInstaller.includes(13), "The packaged macOS postinstall script must use LF line endings.");

  process.stdout.write(`Release verification passed for Audio Separator ${version}.\n`);
}

main().catch((error) => {
  // // Return a failing exit code so local builds and GitHub Actions stop before packaging.
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
