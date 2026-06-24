// // Build a macOS Installer package that embeds the CEP extension and a private Python/Demucs/FFmpeg runtime.
import { createReadStream } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const stagingRoot = path.join(projectRoot, ".audioseparator-macos-staging");
const downloadsDir = path.join(stagingRoot, "downloads");
const runtimeRoot = path.join(stagingRoot, "runtime");
const packagesDir = path.join(stagingRoot, "packages");
const coreScriptsDir = path.join(stagingRoot, "core-scripts");
const releasesDir = path.join(projectRoot, "Releases");
const pythonVersion = process.env.AUDIOSEP_PRIVATE_PYTHON_VERSION || "3.11.8";
const requestedArch = process.env.AUDIOSEP_MAC_ARCH || process.arch;
const macArch = requestedArch === "x64" ? "x86_64" : requestedArch;
const rebuildRuntime = process.env.AUDIOSEP_REBUILD_RUNTIME === "1";
const reuseStaging = process.env.AUDIOSEP_REUSE_STAGING === "1";
const ffmpegVersion = process.env.AUDIOSEP_FFMPEG_VERSION || "8.0.2";
const ffmpegSourceUrl =
  process.env.AUDIOSEP_FFMPEG_SOURCE_URL || `https://ffmpeg.org/releases/ffmpeg-${ffmpegVersion}.tar.xz`;

function runCommand(command, args, options = {}) {
  // // Execute build and packaging commands with visible progress and strict exit handling.
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || projectRoot,
      env: {
        ...process.env,
        ...(options.env || {})
      },
      stdio: options.stdio || "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function pathExists(targetPath) {
  // // Probe optional staging paths without treating normal cache misses as failures.
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function prunePackagingMetadata(targetDir) {
  // // Remove Finder and AppleDouble metadata so installer payloads contain only intentional files.
  const entries = await readdir(targetDir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(targetDir, entry.name);
    if (entry.name === ".DS_Store" || entry.name.startsWith("._")) {
      await rm(entryPath, { recursive: entry.isDirectory(), force: true });
      continue;
    }
    if (entry.isDirectory()) {
      await prunePackagingMetadata(entryPath);
    }
  }
}

async function hashFile(targetPath) {
  // // Stream large runtime archives through SHA-256 without loading them into memory.
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(targetPath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function downloadFile(url, targetPath) {
  // // Download runtime build assets once and reuse them across packaging runs.
  if (await pathExists(targetPath)) {
    return;
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await runCommand("curl", [
    "--fail",
    "--location",
    "--retry",
    "3",
    "--connect-timeout",
    "30",
    url,
    "--output",
    targetPath
  ]);
}

async function readPackageVersion() {
  // // Use package.json as the single installer version source.
  const raw = await readFile(path.join(projectRoot, "package.json"), "utf8");
  return String(JSON.parse(raw).version || "").trim();
}

async function findCommand(command) {
  // // Resolve required external build tools through the developer shell PATH.
  return new Promise((resolve) => {
    const child = spawn("/usr/bin/which", [command], { stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("exit", (code) => resolve(code === 0 ? output.trim() : ""));
  });
}

async function preparePrivatePython() {
  // // Install a self-contained Python distribution and add Demucs directly into it.
  const uvPath = process.env.AUDIOSEP_UV_PATH || (await findCommand("uv"));
  if (!uvPath) {
    throw new Error("uv is required to build the private macOS runtime. Install it from https://docs.astral.sh/uv/.");
  }

  const pythonInstallDir = path.join(stagingRoot, "python-install");
  await rm(pythonInstallDir, { recursive: true, force: true });
  await mkdir(pythonInstallDir, { recursive: true });
  await runCommand(
    uvPath,
    [
      "--native-tls",
      "python",
      "install",
      pythonVersion,
      "--install-dir",
      pythonInstallDir,
      "--no-bin",
      "--no-progress"
    ],
    {
      env: {
        UV_PYTHON_PREFERENCE: "only-managed"
      }
    }
  );

  const entries = await readdir(pythonInstallDir, { withFileTypes: true });
  const pythonEntry = entries.find(
    (entry) => entry.isDirectory() && entry.name.startsWith(`cpython-${pythonVersion}-macos-`)
  );
  if (!pythonEntry) {
    throw new Error(`uv did not create the expected Python ${pythonVersion} installation.`);
  }

  const sourcePythonDir = path.join(pythonInstallDir, pythonEntry.name);
  const targetPythonDir = path.join(runtimeRoot, "python");
  await rm(targetPythonDir, { recursive: true, force: true });
  await runCommand("ditto", [sourcePythonDir, targetPythonDir]);

  const pythonPath = path.join(targetPythonDir, "bin", "python3");
  await runCommand(
    uvPath,
    [
      "--native-tls",
      "pip",
      "install",
      "--python",
      pythonPath,
      "--break-system-packages",
      "--upgrade",
      "--no-cache",
      "demucs"
    ],
    {
      env: {
        PYTHONNOUSERSITE: "1",
        PYTHONPATH: ""
      }
    }
  );

  await prunePrivatePython(targetPythonDir);
  await runCommand(pythonPath, ["-c", "import demucs, torch; print('demucs runtime ok', torch.__version__)"], {
    env: {
      PYTHONNOUSERSITE: "1",
      PYTHONPATH: ""
    }
  });
  await writeFile(path.join(runtimeRoot, ".audioseparator-python-validated"), `${macArch}:${pythonVersion}\n`, "ascii");
}

async function prunePrivatePython(pythonDir) {
  // // Remove development-only Python artifacts that are not needed at runtime.
  const pruneScript = [
    `root=${shellQuote(pythonDir)}`,
    'find "$root" -type d -name "__pycache__" -prune -exec rm -rf {} +',
    'find "$root" -type f \\( -name "*.a" -o -name "*.pyc" -o -name "*.pyo" \\) -delete',
    'rm -rf "$root/lib/python3.11/test" "$root/lib/python3.11/idlelib" "$root/lib/python3.11/tkinter"'
  ].join("\n");
  await runCommand("/bin/bash", ["-c", pruneScript]);
}

async function preparePrivateFfmpeg() {
  // // Compile FFmpeg from official source with GPL/nonfree disabled for a redistributable private runtime.
  const sourceArchive = path.join(downloadsDir, `ffmpeg-${ffmpegVersion}.tar.xz`);
  const sourceParent = path.join(stagingRoot, "ffmpeg-source");
  const sourceDir = path.join(sourceParent, `ffmpeg-${ffmpegVersion}`);
  const installDir = path.join(runtimeRoot, "ffmpeg");
  await downloadFile(ffmpegSourceUrl, sourceArchive);
  await rm(sourceParent, { recursive: true, force: true });
  await mkdir(sourceParent, { recursive: true });
  await runCommand("tar", ["-xJf", sourceArchive, "-C", sourceParent]);
  await rm(installDir, { recursive: true, force: true });

  const cpuCount = Math.max(1, Number.parseInt(process.env.AUDIOSEP_BUILD_JOBS || "", 10) || 4);
  const configureArgs = [
    `--prefix=${installDir}`,
    "--disable-debug",
    "--disable-doc",
    "--disable-ffplay",
    "--disable-shared",
    "--enable-static",
    "--enable-ffmpeg",
    "--enable-ffprobe",
    "--disable-gpl",
    "--disable-nonfree"
  ];
  if (macArch === "x86_64") {
    // // Keep Intel builds independent from an additional NASM installation.
    configureArgs.push("--disable-x86asm");
  }

  await runCommand(path.join(sourceDir, "configure"), configureArgs, { cwd: sourceDir });
  await runCommand("make", [`-j${cpuCount}`], { cwd: sourceDir });
  await runCommand("make", ["install"], { cwd: sourceDir });

  const licenseFiles = ["COPYING.LGPLv2.1", "COPYING.LGPLv3", "LICENSE.md"];
  for (const fileName of licenseFiles) {
    const sourcePath = path.join(sourceDir, fileName);
    if (await pathExists(sourcePath)) {
      await cp(sourcePath, path.join(installDir, fileName));
    }
  }

  await rm(path.join(installDir, "include"), { recursive: true, force: true });
  await rm(path.join(installDir, "lib"), { recursive: true, force: true });
  await rm(path.join(installDir, "share"), { recursive: true, force: true });
  await runCommand(path.join(installDir, "bin", "ffmpeg"), ["-version"]);
  await runCommand(path.join(installDir, "bin", "ffprobe"), ["-version"]);
}

async function prepareRuntimePayload(runtimeVersion) {
  // // Build and validate the complete private runtime before creating its immutable archive.
  if (!reuseStaging) {
    await rm(runtimeRoot, { recursive: true, force: true });
  }
  await mkdir(runtimeRoot, { recursive: true });

  const pythonPath = path.join(runtimeRoot, "python", "bin", "python3");
  const pythonValidationPath = path.join(runtimeRoot, ".audioseparator-python-validated");
  const expectedPythonValidation = `${macArch}:${pythonVersion}`;
  let canReusePython = false;
  if (reuseStaging && (await pathExists(pythonPath)) && (await pathExists(pythonValidationPath))) {
    const validationValue = String(await readFile(pythonValidationPath, "utf8")).trim();
    canReusePython = validationValue === expectedPythonValidation;
  }
  if (canReusePython) {
    await runCommand(pythonPath, ["-c", "import demucs, torch; print('demucs runtime ok', torch.__version__)"]);
  } else {
    await preparePrivatePython();
  }

  const ffmpegPath = path.join(runtimeRoot, "ffmpeg", "bin", "ffmpeg");
  const ffprobePath = path.join(runtimeRoot, "ffmpeg", "bin", "ffprobe");
  if (reuseStaging && (await pathExists(ffmpegPath)) && (await pathExists(ffprobePath))) {
    await runCommand(ffmpegPath, ["-version"]);
    await runCommand(ffprobePath, ["-version"]);
  } else {
    await preparePrivateFfmpeg();
  }

  await writeFile(path.join(runtimeRoot, ".audioseparator-runtime-version"), `${runtimeVersion}\n`, "ascii");
}

async function createRuntimeArchive(version) {
  // // Build or reuse a private runtime archive for the target architecture and return its immutable metadata.
  const assetName = `AudioSeparator-v${version}-macOS-Runtime-${macArch}.tar.gz`;
  const outputPath = path.join(releasesDir, assetName);

  if (!rebuildRuntime && (await pathExists(outputPath))) {
    const sha256 = await hashFile(outputPath);
    return { assetName, sha256 };
  }

  if (macArch !== process.arch && !(macArch === "x86_64" && process.arch === "x64")) {
    throw new Error(`Build the ${macArch} runtime on a matching Mac architecture.`);
  }

  await prepareRuntimePayload(version);
  await mkdir(releasesDir, { recursive: true });
  await rm(outputPath, { force: true });
  await runCommand("tar", ["-czf", outputPath, "runtime"], { cwd: stagingRoot });
  const sha256 = await hashFile(outputPath);
  process.stdout.write(`macOS runtime asset created at ${outputPath}\n`);
  return { assetName, sha256 };
}

function shellQuote(value) {
  // // Quote generated shell values so paths and URLs cannot alter package-script syntax.
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function xmlEscape(value) {
  // // Escape generated distribution strings for productbuild XML.
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function copyExtensionPayload(targetDir) {
  // // Stage the CEP extension files that Premiere loads from the user's Adobe extensions folder.
  await mkdir(targetDir, { recursive: true });
  for (const dirName of ["client", "host", "CSXS"]) {
    await cp(path.join(projectRoot, dirName), path.join(targetDir, dirName), { recursive: true });
  }
  for (const fileName of [".debug", "README.md", "UPDATE_DEPENDENCIES.sh"]) {
    const sourcePath = path.join(projectRoot, fileName);
    if (await pathExists(sourcePath)) {
      await cp(sourcePath, path.join(targetDir, fileName));
    }
  }
}

async function copyCorePayload(runtimeAsset, version) {
  // // Stage the extension, postinstall script, bundled runtime archive, and generated runtime metadata.
  await rm(coreScriptsDir, { recursive: true, force: true });
  await mkdir(path.join(coreScriptsDir, "payload", "dist"), { recursive: true });
  await copyExtensionPayload(path.join(coreScriptsDir, "payload", "dist", "PremierePro-AudioSeparator"));

  const installScriptSource = path.join(
    projectRoot,
    "installers",
    "audioseparator_install_macos_private_runtime.sh"
  );
  const installScriptTarget = path.join(coreScriptsDir, "postinstall");
  await cp(installScriptSource, installScriptTarget);
  await runCommand("chmod", ["755", installScriptTarget]);

  const bundledRuntimeDir = path.join(coreScriptsDir, "runtime");
  await mkdir(bundledRuntimeDir, { recursive: true });
  await cp(path.join(releasesDir, runtimeAsset.assetName), path.join(bundledRuntimeDir, runtimeAsset.assetName));

  const runtimeEnv = [
    "# // Generated by audioseparator-package-macos-pkg.mjs.",
    `AUDIOSEP_EXTENSION_VERSION=${shellQuote(version)}`,
    `AUDIOSEP_RUNTIME_VERSION=${shellQuote(version)}`,
    `AUDIOSEP_RUNTIME_ARCH=${shellQuote(macArch)}`,
    `AUDIOSEP_RUNTIME_ASSET_NAME=${shellQuote(runtimeAsset.assetName)}`,
    `AUDIOSEP_RUNTIME_SHA256=${shellQuote(String(runtimeAsset.sha256 || "").toLowerCase())}`,
    ""
  ].join("\n");
  await writeFile(path.join(coreScriptsDir, "runtime.env"), runtimeEnv, "utf8");
  await prunePackagingMetadata(coreScriptsDir);
  await runCommand("xattr", ["-cr", coreScriptsDir]);
}

async function createComponentPackage(version) {
  // // Build the mandatory script-only core package that performs the per-user installation.
  await rm(packagesDir, { recursive: true, force: true });
  await mkdir(packagesDir, { recursive: true });
  await runCommand("pkgbuild", [
    "--nopayload",
    "--scripts",
    coreScriptsDir,
    "--identifier",
    "com.audioseparator.premiere.installer.core",
    "--version",
    version,
    path.join(packagesDir, "AudioSeparatorCore.pkg")
  ], {
    env: {
      COPYFILE_DISABLE: "1"
    }
  });
}

async function createDistribution(version) {
  // // Generate a simple Installer distribution that targets the current runtime architecture.
  const distributionPath = path.join(stagingRoot, "Distribution.xml");
  const distribution = `<?xml version="1.0" encoding="utf-8"?>
<!-- // Generated by audioseparator-package-macos-pkg.mjs. -->
<installer-gui-script minSpecVersion="2">
  <title>Audio Separator</title>
  <organization>com.audioseparator.premiere</organization>
  <domains enable_localSystem="true"/>
  <options customize="never" require-scripts="false" hostArchitectures="${xmlEscape(macArch)}"/>
  <choices-outline>
    <line choice="core"/>
  </choices-outline>
  <choice id="core" visible="false" start_selected="true">
    <pkg-ref id="com.audioseparator.premiere.installer.core"/>
  </choice>
  <pkg-ref id="com.audioseparator.premiere.installer.core" version="${xmlEscape(version)}" onConclusion="none">AudioSeparatorCore.pkg</pkg-ref>
</installer-gui-script>
`;
  await writeFile(distributionPath, distribution, "utf8");
  return distributionPath;
}

async function createInstallerPackage(version, runtimeAsset) {
  // // Build the user-facing product package and optionally sign/notarize it for public distribution.
  await copyCorePayload(runtimeAsset, version);
  await createComponentPackage(version);
  const distributionPath = await createDistribution(version);
  const outputPath = path.join(releasesDir, `AudioSeparator-v${version}-macOS-Installer-${macArch}.pkg`);
  const signingIdentity = process.env.AUDIOSEP_MAC_INSTALLER_IDENTITY || "";
  const productArgs = [
    "--distribution",
    distributionPath,
    "--package-path",
    packagesDir
  ];

  await mkdir(releasesDir, { recursive: true });
  await rm(outputPath, { force: true });
  if (signingIdentity) {
    productArgs.push("--sign", signingIdentity, outputPath);
  } else {
    productArgs.push(outputPath);
  }
  await runCommand("productbuild", productArgs, {
    env: {
      COPYFILE_DISABLE: "1"
    }
  });

  const notaryProfile = process.env.AUDIOSEP_NOTARY_PROFILE || "";
  if (notaryProfile) {
    await runCommand("xcrun", [
      "notarytool",
      "submit",
      outputPath,
      "--keychain-profile",
      notaryProfile,
      "--wait"
    ]);
    await runCommand("xcrun", ["stapler", "staple", outputPath]);
  }

  if (signingIdentity) {
    await runCommand("pkgutil", ["--check-signature", outputPath]);
  } else {
    const validationDir = path.join(stagingRoot, "package-validation");
    await rm(validationDir, { recursive: true, force: true });
    await runCommand("pkgutil", ["--expand", outputPath, validationDir]);
    await rm(validationDir, { recursive: true, force: true });
  }
  process.stdout.write(`macOS installer created at ${outputPath}\n`);
}

async function main() {
  // // Build the private runtime archive and wrap it with the CEP extension in a macOS PKG.
  if (process.platform !== "darwin") {
    throw new Error("macOS PKG packaging must run on macOS.");
  }
  if (!["arm64", "x86_64"].includes(macArch)) {
    throw new Error(`Unsupported macOS architecture: ${macArch}`);
  }

  const version = await readPackageVersion();
  if (!version) {
    throw new Error("package.json does not contain a version.");
  }

  if (!reuseStaging) {
    await rm(stagingRoot, { recursive: true, force: true });
  }
  await mkdir(downloadsDir, { recursive: true });
  await mkdir(releasesDir, { recursive: true });

  const runtimeAsset = await createRuntimeArchive(version);
  await createInstallerPackage(version, runtimeAsset);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
