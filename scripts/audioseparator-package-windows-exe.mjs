// // Build Windows Inno Setup installers with a private Python/Demucs/FFmpeg runtime.
import { createReadStream } from "node:fs";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
// // Keep staging paths short because recent Torch license trees exceed legacy Windows path limits.
const stagingRoot = path.resolve(
  process.env.AUDIOSEP_WINDOWS_STAGING_DIR || path.join(process.env.TEMP || projectRoot, "AudioSeparatorWindowsBuild")
);
const downloadsDir = path.join(stagingRoot, "downloads");
const payloadRoot = path.join(stagingRoot, "payload");
const runtimeRoot = path.join(payloadRoot, "runtime");
const installerRoot = path.join(stagingRoot, "installer");
const releasesDir = path.join(projectRoot, "Releases");
const pythonVersion = process.env.AUDIOSEP_WINDOWS_PYTHON_VERSION || "3.11.8";
const demucsVersion = process.env.AUDIOSEP_DEMUCS_VERSION || "4.1.0";
const torchVersion = process.env.AUDIOSEP_TORCH_VERSION || "2.13.0";
const numpyVersion = process.env.AUDIOSEP_NUMPY_VERSION || "2.4.6";
const pythonShortVersion = pythonVersion.split(".").slice(0, 2).join("");
const pythonEmbedUrl =
  process.env.AUDIOSEP_WINDOWS_PYTHON_EMBED_URL ||
  `https://www.python.org/ftp/python/${pythonVersion}/python-${pythonVersion}-embed-amd64.zip`;
const pythonEmbedSha256 =
  process.env.AUDIOSEP_WINDOWS_PYTHON_EMBED_SHA256 ||
  "6347068ca56bf4dd6319f7ef5695f5a03f1ade3e9aa2d6a095ab27faa77a1290";
const getPipUrl = process.env.AUDIOSEP_WINDOWS_GET_PIP_URL || "https://bootstrap.pypa.io/get-pip.py";
const getPipSha256 =
  process.env.AUDIOSEP_WINDOWS_GET_PIP_SHA256 ||
  "a341e1a43e38001c551a1508a73ff23636a11970b61d901d9a1cad2a18f57055";
const ffmpegZipUrl =
  process.env.AUDIOSEP_WINDOWS_FFMPEG_ZIP_URL ||
  "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-07-18-13-13/ffmpeg-N-125658-g0869e710e6-win64-lgpl.zip";
const ffmpegZipSha256 =
  process.env.AUDIOSEP_WINDOWS_FFMPEG_ZIP_SHA256 ||
  "0f585b6f171104b6cb033a6c4b14edaee13ba43121c954b46e211437c44a23fe";
const innoSetupUrl =
  process.env.AUDIOSEP_WINDOWS_INNO_SETUP_URL ||
  "https://github.com/jrsoftware/issrc/releases/download/is-6_7_3/innosetup-6.7.3.exe";
const innoSetupSha256 =
  process.env.AUDIOSEP_WINDOWS_INNO_SETUP_SHA256 ||
  "9c73c3bae7ed48d44112a0f48e66742c00090bdb5bef71d9d3c056c66e97b732";
const reuseStaging = process.env.AUDIOSEP_WINDOWS_REUSE_STAGING === "1";
const privatePythonEnv = {
  PYTHONUTF8: "1",
  PYTHONNOUSERSITE: "1",
  PYTHONPATH: "",
  PIP_DISABLE_PIP_VERSION_CHECK: "1"
};
const runtimeSmokeCode = [
  "from importlib.metadata import version",
  "from pathlib import Path",
  "import os, tempfile, numpy, torch",
  "from demucs.audio import save_audio",
  `assert version('demucs') == '${demucsVersion}'`,
  `assert torch.__version__.split('+')[0] == '${torchVersion}'`,
  `assert numpy.__version__ == '${numpyVersion}'`,
  "fd, name = tempfile.mkstemp(suffix='.wav')",
  "os.close(fd)",
  "os.unlink(name)",
  "output = Path(name)",
  "save_audio(torch.zeros(2, 4410), output, 44100)",
  "assert output.stat().st_size > 44",
  "output.unlink()",
  "print('demucs runtime and WAV output ok', version('demucs'), torch.__version__)"
].join("; ");

function runCommand(command, args, options = {}) {
  // // Execute build tools with inherited output so long downloads and Inno compiles stay visible.
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || projectRoot,
      env: {
        ...process.env,
        ...(options.env || {})
      },
      shell: Boolean(options.shell),
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
  // // Probe optional local downloads and generated assets without throwing.
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function hashFile(targetPath) {
  // // Stream large runtime and installer assets through SHA-256.
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(targetPath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function downloadFile(url, targetPath, expectedSha256) {
  // // Download third-party archives once and reject any unexpected or corrupted content.
  if (await pathExists(targetPath)) {
    const cachedHash = await hashFile(targetPath);
    if (cachedHash !== expectedSha256) {
      throw new Error(`Cached download hash mismatch for ${targetPath}.`);
    }
    return;
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await runCommand("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri ${JSON.stringify(url)} -OutFile ${JSON.stringify(targetPath)}`
  ]);
  const downloadedHash = await hashFile(targetPath);
  if (downloadedHash !== expectedSha256) {
    await rm(targetPath, { force: true });
    throw new Error(`Downloaded file hash mismatch for ${url}.`);
  }
}

async function expandArchive(zipPath, targetDir) {
  // // Use PowerShell ZIP extraction to avoid an extra archive dependency.
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  await runCommand("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `Expand-Archive -LiteralPath ${JSON.stringify(zipPath)} -DestinationPath ${JSON.stringify(targetDir)} -Force`
  ]);
}

async function configureEmbeddedPython(runtimePythonDir) {
  // // Temporarily enable site imports so get-pip can install packages into the embedded runtime.
  const pthPath = path.join(runtimePythonDir, `python${pythonShortVersion}._pth`);
  const pthLines = [`python${pythonShortVersion}.zip`, ".", "Lib\\site-packages", "import site", ""];
  await mkdir(path.join(runtimePythonDir, "Lib", "site-packages"), { recursive: true });
  await mkdir(path.join(runtimePythonDir, "Scripts"), { recursive: true });
  await writeFile(pthPath, pthLines.join("\r\n"), "utf8");
}

async function lockEmbeddedPythonRuntime(runtimePythonDir) {
  // // Remove import site so the shipped runtime cannot read user Python profiles.
  const pthPath = path.join(runtimePythonDir, `python${pythonShortVersion}._pth`);
  const pthLines = [`python${pythonShortVersion}.zip`, ".", "Lib\\site-packages", ""];
  await writeFile(pthPath, pthLines.join("\r\n"), "utf8");
}

async function prunePythonRuntime(runtimePythonDir) {
  // // Remove development and diagnostic-only artifacts while preserving Demucs runtime DLLs and modules.
  await runCommand("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    [
      `$root = ${JSON.stringify(runtimePythonDir)};`,
      "Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -in '.lib', '.pdb' } | Remove-Item -Force;",
      "Get-ChildItem -LiteralPath $root -Recurse -Directory -Filter __pycache__ -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue;",
      "Remove-Item -LiteralPath (Join-Path $root 'Lib\\site-packages\\torch\\include') -Recurse -Force -ErrorAction SilentlyContinue"
    ].join(" ")
  ]);

  // // Preserve PyTorch third-party license notices in one short-path ZIP instead of shipping their deeply nested source tree.
  const pythonExe = path.join(runtimePythonDir, "python.exe");
  const licenseArchiveCode = [
    "import shutil",
    "from pathlib import Path",
    `root = Path(${JSON.stringify(runtimePythonDir)}) / 'Lib' / 'site-packages'`,
    "for dist_info in root.glob('torch-*.dist-info'):",
    "    licenses = dist_info / 'licenses'",
    "    if licenses.is_dir():",
    "        shutil.make_archive(str(dist_info / 'third-party-licenses'), 'zip', root_dir=licenses)",
    "        shutil.rmtree(licenses)"
  ].join("\n");
  await runCommand(pythonExe, ["-c", licenseArchiveCode], { env: privatePythonEnv });
}

async function preparePythonRuntime() {
  // // Build an isolated Python runtime containing Demucs and CPU PyTorch.
  const pythonZip = path.join(downloadsDir, `python-${pythonVersion}-embed-amd64.zip`);
  const getPipPath = path.join(downloadsDir, "get-pip.py");
  const runtimePythonDir = path.join(runtimeRoot, "python");
  const pythonExe = path.join(runtimePythonDir, "python.exe");

  await downloadFile(pythonEmbedUrl, pythonZip, pythonEmbedSha256);
  await expandArchive(pythonZip, runtimePythonDir);
  await configureEmbeddedPython(runtimePythonDir);

  await downloadFile(getPipUrl, getPipPath, getPipSha256);
  await runCommand(pythonExe, [getPipPath, "--no-warn-script-location"], {
    env: privatePythonEnv
  });
  await runCommand(pythonExe, [
    "-m",
    "pip",
    "install",
    "--upgrade",
    "--no-cache-dir",
    "--no-warn-script-location",
    `demucs==${demucsVersion}`,
    `torch==${torchVersion}`,
    `numpy==${numpyVersion}`
  ], {
    env: privatePythonEnv
  });

  await prunePythonRuntime(runtimePythonDir);
  await lockEmbeddedPythonRuntime(runtimePythonDir);
  await validatePythonRuntime();
  const validationValue = `${pythonVersion}:${demucsVersion}:${torchVersion}:${numpyVersion}\r\n`;
  await writeFile(path.join(runtimeRoot, ".audioseparator-python-validated"), validationValue, "ascii");
}

async function validatePythonRuntime() {
  // // Confirm Demucs and Torch import from the private Python runtime.
  const pythonExe = path.join(runtimeRoot, "python", "python.exe");
  if (!(await pathExists(pythonExe))) {
    throw new Error(`Private Python executable is missing: ${pythonExe}`);
  }

  await runCommand("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    [
      `$python = ${JSON.stringify(pythonExe)};`,
      "Unblock-File -LiteralPath $python -ErrorAction SilentlyContinue;",
      `& $python -c ${JSON.stringify(runtimeSmokeCode)};`,
      "exit $LASTEXITCODE"
    ].join(" ")
  ], {
    env: privatePythonEnv
  });
}

async function prepareFfmpegRuntime() {
  // // Bundle a private LGPL FFmpeg build so separation does not depend on system PATH.
  const localFfmpegZip = process.env.AUDIOSEP_WINDOWS_FFMPEG_ZIP || "";
  const ffmpegZip = localFfmpegZip || path.join(downloadsDir, path.basename(new URL(ffmpegZipUrl).pathname));
  const extractedDir = path.join(stagingRoot, "ffmpeg-extracted");
  const runtimeFfmpegDir = path.join(runtimeRoot, "ffmpeg");

  if (!localFfmpegZip) {
    await downloadFile(ffmpegZipUrl, ffmpegZip, ffmpegZipSha256);
  }

  await expandArchive(ffmpegZip, extractedDir);
  await runCommand("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    [
      `$source = Get-ChildItem -LiteralPath ${JSON.stringify(extractedDir)} -Recurse -File -Filter ffmpeg.exe | Select-Object -First 1;`,
      "if (-not $source) { throw 'ffmpeg.exe not found in archive' }",
      "$root = Split-Path -Parent (Split-Path -Parent $source.FullName);",
      `$target = ${JSON.stringify(runtimeFfmpegDir)};`,
      "New-Item -ItemType Directory -Path (Join-Path $target 'bin') -Force | Out-Null;",
      "Copy-Item -Path (Join-Path $root 'bin\\*') -Destination (Join-Path $target 'bin') -Recurse -Force;",
      "Get-ChildItem -LiteralPath $root -File | Where-Object { $_.Name -match '^(LICENSE|COPYING|README|VERSION)' } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $target -Force }"
    ].join(" ")
  ]);

  await validateFfmpegRuntime();
}

async function validateFfmpegRuntime() {
  // // Validate FFmpeg from a temp copy because Windows policies can dislike hidden staging paths.
  const runtimeFfmpegExe = path.join(runtimeRoot, "ffmpeg", "bin", "ffmpeg.exe");
  const runtimeFfprobeExe = path.join(runtimeRoot, "ffmpeg", "bin", "ffprobe.exe");

  if (!(await pathExists(runtimeFfmpegExe))) {
    throw new Error(`FFmpeg executable missing from runtime payload: ${runtimeFfmpegExe}`);
  }
  if (!(await pathExists(runtimeFfprobeExe))) {
    throw new Error(`FFprobe executable missing from runtime payload: ${runtimeFfprobeExe}`);
  }

  await runCommand(runtimeFfmpegExe, ["-version"]);
  await runCommand(runtimeFfprobeExe, ["-version"]);
}

async function prepareRuntimePayload(runtimeVersion) {
  // // Build or reuse the private runtime folder that gets embedded in Full installers.
  if (!reuseStaging) {
    await rm(runtimeRoot, { recursive: true, force: true });
  }
  await mkdir(runtimeRoot, { recursive: true });

  const pythonExe = path.join(runtimeRoot, "python", "python.exe");
  const pythonValidationPath = path.join(runtimeRoot, ".audioseparator-python-validated");
  const expectedPythonValidation = `${pythonVersion}:${demucsVersion}:${torchVersion}:${numpyVersion}`;
  let canReusePython = false;
  if (reuseStaging && (await pathExists(pythonExe)) && (await pathExists(pythonValidationPath))) {
    const validationValue = String(await readFile(pythonValidationPath, "utf8")).trim();
    canReusePython = validationValue === expectedPythonValidation;
  }
  if (canReusePython) {
    await validatePythonRuntime();
  } else {
    await preparePythonRuntime();
  }

  const ffmpegExe = path.join(runtimeRoot, "ffmpeg", "bin", "ffmpeg.exe");
  const ffprobeExe = path.join(runtimeRoot, "ffmpeg", "bin", "ffprobe.exe");
  if (reuseStaging && (await pathExists(ffmpegExe)) && (await pathExists(ffprobeExe))) {
    await validateFfmpegRuntime();
  } else {
    await prepareFfmpegRuntime();
  }

  await writeFile(path.join(runtimeRoot, ".audioseparator-runtime-version"), `${runtimeVersion}\r\n`, "ascii");
}

async function copyExtensionPayload() {
  // // Stage the CEP extension and helper files into the installer payload.
  const distDir = path.join(payloadRoot, "dist", "PremierePro-AudioSeparator");
  await rm(path.join(payloadRoot, "dist"), { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  for (const dirName of ["client", "host", "CSXS"]) {
    await cp(path.join(projectRoot, dirName), path.join(distDir, dirName), { recursive: true });
  }
  for (const fileName of [".debug", "README.md"]) {
    const sourcePath = path.join(projectRoot, fileName);
    if (await pathExists(sourcePath)) {
      await cp(sourcePath, path.join(distDir, fileName));
    }
  }

  await mkdir(path.join(payloadRoot, "installers"), { recursive: true });
  await cp(
    path.join(projectRoot, "installers", "audioseparator_install_windows_private_runtime.ps1"),
    path.join(payloadRoot, "installers", "audioseparator_install_windows_private_runtime.ps1")
  );
  await cp(path.join(projectRoot, "README.md"), path.join(payloadRoot, "README.md"));
}

async function validateInstallerPayloadPaths() {
  // // Inno extracts into a legacy MAX_PATH-limited temporary directory on many Windows PCs.
  const runtimeFiles = await new Promise((resolve, reject) => {
    const child = spawn("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Get-ChildItem -LiteralPath ${JSON.stringify(runtimeRoot)} -Recurse -File | ForEach-Object { $_.FullName.Substring(${JSON.stringify(runtimeRoot)}.Length + 1) }`
    ], { cwd: projectRoot, stdio: ["ignore", "pipe", "inherit"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve(output.split(/\r?\n/).filter(Boolean)) : reject(new Error(`Unable to inspect runtime paths (code ${code}).`)));
  });
  const longestRelativePath = runtimeFiles.reduce((longest, filePath) => Math.max(longest, filePath.length), 0);
  // // Keep room for a long user profile and Inno's is-XXXXXXXX.tmp extraction directory.
  if (longestRelativePath > 170) {
    throw new Error(`Installer runtime path is too deep (${longestRelativePath} characters relative); it may exceed Windows MAX_PATH during extraction.`);
  }
}

async function findExistingInnoCompiler() {
  // // Prefer an explicit compiler path, then common local Inno Setup locations.
  const candidates = [
    process.env.AUDIOSEP_WINDOWS_ISCC_PATH || "",
    path.join(stagingRoot, "tools", "Inno Setup 6", "ISCC.exe"),
    path.join(stagingRoot, "tools", "Inno", "ISCC.exe"),
    "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe",
    "C:\\Program Files\\Inno Setup 6\\ISCC.exe"
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return "";
}

async function prepareInnoCompiler() {
  // // Install Inno Setup into staging when the build PC does not already have it.
  const existingCompiler = await findExistingInnoCompiler();
  if (existingCompiler) {
    return existingCompiler;
  }

  const installerPath = path.join(downloadsDir, "innosetup.exe");
  const installDir = path.join(stagingRoot, "tools", "Inno");
  await downloadFile(innoSetupUrl, installerPath, innoSetupSha256);
  await mkdir(installDir, { recursive: true });
  await runCommand("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    [
      `$installer = ${JSON.stringify(installerPath)};`,
      `$installDir = ${JSON.stringify(installDir)};`,
      "$args = @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CURRENTUSER', ('/DIR=' + $installDir));",
      "$process = Start-Process -FilePath $installer -ArgumentList $args -Wait -PassThru -WindowStyle Hidden;",
      "exit $process.ExitCode"
    ].join(" ")
  ]);

  const compilerPath = (await findExistingInnoCompiler()) || path.join(installDir, "ISCC.exe");
  if (!(await pathExists(compilerPath))) {
    throw new Error(`Inno Setup compiler missing after install: ${compilerPath}`);
  }
  return compilerPath;
}

function escapeInnoString(value) {
  // // Escape double quotes for generated Inno Setup string literals.
  return String(value || "").replace(/"/g, '""');
}

function escapePascalString(value) {
  // // Escape apostrophes for generated Inno Setup Pascal string literals.
  return String(value || "").replace(/'/g, "''");
}

async function readPackageVersion() {
  // // Use package.json as the single installer version source.
  const raw = await readFile(path.join(projectRoot, "package.json"), "utf8");
  return String(JSON.parse(raw).version || "").trim();
}

async function createUserInstaller(compilerPath, version) {
  // // Build the single supported Windows Full installer with its private runtime embedded.
  const outputBaseName = `AudioSeparator-v${version}-Windows-Full-Installer`;
  const scriptPath = path.join(installerRoot, "AudioSeparatorFull.iss");
  const iss = [
    "; // Generated by audioseparator-package-windows-exe.mjs.",
    "[Setup]",
    "AppId={{3F3F8E34-F1FA-4310-9EF3-EF7295C3EEAB}",
    "AppName=Audio Separator",
    `AppVersion=${version}`,
    "AppPublisher=Cyril Plugin",
    "DefaultDirName={localappdata}\\PremierePro-AudioSeparator\\InstallerPayload",
    "CreateAppDir=no",
    "DisableDirPage=yes",
    "DisableProgramGroupPage=yes",
    "Uninstallable=no",
    "PrivilegesRequired=lowest",
    "RestartIfNeededByRun=no",
    "ArchitecturesAllowed=x64compatible",
    "ArchitecturesInstallIn64BitMode=x64compatible",
    // // Keep Full installer compression practical for local and CI release builds.
    "Compression=lzma2/max",
    "SolidCompression=yes",
    "WizardStyle=modern dynamic",
    `OutputDir=${escapeInnoString(releasesDir)}`,
    `OutputBaseFilename=${outputBaseName}`,
    "",
    "[Files]",
    // // Use single-letter temporary directories: Setup's own temp root can be long on Windows profiles.
    `Source: "${escapeInnoString(path.join(payloadRoot, "README.md"))}"; DestDir: "{tmp}\\a"; Flags: ignoreversion`,
    `Source: "${escapeInnoString(path.join(payloadRoot, "dist", "PremierePro-AudioSeparator", "*"))}"; DestDir: "{tmp}\\a\\e"; Flags: recursesubdirs createallsubdirs ignoreversion`,
    `Source: "${escapeInnoString(path.join(payloadRoot, "installers", "audioseparator_install_windows_private_runtime.ps1"))}"; DestDir: "{tmp}\\a"; DestName: "i.ps1"; Flags: ignoreversion`,
    `Source: "${escapeInnoString(path.join(runtimeRoot, "*"))}"; DestDir: "{tmp}\\a\\r"; Flags: recursesubdirs createallsubdirs ignoreversion`,
    `Source: "${escapeInnoString(path.join(payloadRoot, "README.md"))}"; DestDir: "{tmp}\\a"; DestName: "ok.txt"; Flags: ignoreversion; AfterInstall: InstallAudioSeparator`,
    "",
    "[Code]",
    "var",
    "  ReadyWarningLabel: TNewStaticText;",
    "  InstallWarningLabel: TNewStaticText;",
    "",
    "procedure InitializeWizard;",
    "begin",
    "  WizardForm.ReadyMemo.Visible := False;",
    "  ReadyWarningLabel := TNewStaticText.Create(WizardForm);",
    "  ReadyWarningLabel.Parent := WizardForm.ReadyPage;",
    "  ReadyWarningLabel.Left := WizardForm.ReadyMemo.Left;",
    "  ReadyWarningLabel.Top := WizardForm.ReadyMemo.Top;",
    "  ReadyWarningLabel.Width := WizardForm.ReadyMemo.Width;",
    "  ReadyWarningLabel.AutoSize := False;",
    "  ReadyWarningLabel.WordWrap := True;",
    "  ReadyWarningLabel.Height := ScaleY(72);",
    "  ReadyWarningLabel.Font.Style := [fsBold];",
    "  ReadyWarningLabel.Caption := 'Important: the first install includes Python, Demucs, PyTorch and FFmpeg. Windows may appear busy while checking the files; please wait.';",
    "",
    "  { // Explain that any helper command windows must stay open while Setup completes. }",
    "  InstallWarningLabel := TNewStaticText.Create(WizardForm);",
    "  InstallWarningLabel.Parent := WizardForm.InstallingPage;",
    "  InstallWarningLabel.Left := WizardForm.ProgressGauge.Left;",
    "  InstallWarningLabel.Top := WizardForm.ProgressGauge.Top + WizardForm.ProgressGauge.Height + ScaleY(18);",
    "  InstallWarningLabel.Width := WizardForm.ProgressGauge.Width;",
    "  InstallWarningLabel.AutoSize := False;",
    "  InstallWarningLabel.WordWrap := True;",
    "  InstallWarningLabel.Height := ScaleY(42);",
    "  InstallWarningLabel.Font.Style := [fsBold];",
    "  InstallWarningLabel.Caption := 'Important: do not close any Command Prompt or PowerShell windows that open. They are required to complete the installation.';",
    "end;",
    "",
    "procedure InstallAudioSeparator;",
    "var",
    "  ResultCode: Integer;",
    "  Params: String;",
    "begin",
    `  Params := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}\\a\\i.ps1') + '" -PayloadRoot "' + ExpandConstant('{tmp}\\a') + '" -RuntimeVersion "${escapePascalString(version)}" -DemucsVersion "${escapePascalString(demucsVersion)}" -TorchVersion "${escapePascalString(torchVersion)}" -NumpyVersion "${escapePascalString(numpyVersion)}"';`,
    "  if not Exec(ExpandConstant('{sys}\\WindowsPowerShell\\v1.0\\powershell.exe'), Params, '', SW_SHOW, ewWaitUntilTerminated, ResultCode) then",
    "    RaiseException('Unable to start the Audio Separator installation script.');",
    "  if ResultCode <> 0 then",
    "    RaiseException('The Audio Separator installation script failed with code ' + IntToStr(ResultCode) + '.');",
    "end;",
    "",
    ""
  ].join("\r\n");

  await mkdir(installerRoot, { recursive: true });
  await mkdir(releasesDir, { recursive: true });
  await writeFile(scriptPath, iss, "utf8");
  await runCommand(compilerPath, ["/Qp", scriptPath]);

  const outputPath = path.join(releasesDir, `${outputBaseName}.exe`);
  const sha256 = await hashFile(outputPath);
  process.stdout.write(`Full Windows installer created at ${outputPath}\nSHA-256: ${sha256}\n`);
}

async function main() {
  // // Build private runtime assets and wrap them with the CEP extension in Inno Setup installers.
  if (process.platform !== "win32") {
    throw new Error("Windows EXE packaging must run on Windows or a Windows GitHub Actions runner.");
  }
  const version = await readPackageVersion();
  if (!version) {
    throw new Error("package.json does not contain a version.");
  }

  if (!reuseStaging) {
    // // Preserve downloaded archives while rebuilding every generated payload from scratch.
    await rm(payloadRoot, { recursive: true, force: true });
    await rm(installerRoot, { recursive: true, force: true });
  }
  await mkdir(downloadsDir, { recursive: true });
  await mkdir(releasesDir, { recursive: true });
  await copyExtensionPayload();

  await prepareRuntimePayload(version);
  await validateInstallerPayloadPaths();
  const compilerPath = await prepareInnoCompiler();
  await createUserInstaller(compilerPath, version);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
