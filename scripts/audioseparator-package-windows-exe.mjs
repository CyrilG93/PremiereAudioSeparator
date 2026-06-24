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
const stagingRoot = path.join(projectRoot, ".audioseparator-windows-staging");
const downloadsDir = path.join(stagingRoot, "downloads");
const payloadRoot = path.join(stagingRoot, "payload");
const runtimeRoot = path.join(payloadRoot, "runtime");
const installerRoot = path.join(stagingRoot, "installer");
const releasesDir = path.join(projectRoot, "Releases");
const runtimeManifestPath = path.join(projectRoot, "installers", "windows-runtime.json");
const pythonVersion = process.env.AUDIOSEP_WINDOWS_PYTHON_VERSION || "3.11.8";
const pythonShortVersion = pythonVersion.split(".").slice(0, 2).join("");
const pythonEmbedUrl =
  process.env.AUDIOSEP_WINDOWS_PYTHON_EMBED_URL ||
  `https://www.python.org/ftp/python/${pythonVersion}/python-${pythonVersion}-embed-amd64.zip`;
const getPipUrl = process.env.AUDIOSEP_WINDOWS_GET_PIP_URL || "https://bootstrap.pypa.io/get-pip.py";
const ffmpegZipUrl =
  process.env.AUDIOSEP_WINDOWS_FFMPEG_ZIP_URL ||
  "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-lgpl.zip";
const innoSetupUrl =
  process.env.AUDIOSEP_WINDOWS_INNO_SETUP_URL ||
  "https://github.com/jrsoftware/issrc/releases/download/is-6_7_3/innosetup-6.7.3.exe";
const reuseStaging = process.env.AUDIOSEP_WINDOWS_REUSE_STAGING === "1";
const rebuildRuntime = process.env.AUDIOSEP_WINDOWS_REBUILD_RUNTIME === "1";
const skipRuntimeAssetDownload = process.env.AUDIOSEP_WINDOWS_SKIP_RUNTIME_ASSET_DOWNLOAD === "1";
const fullOnly = process.env.AUDIOSEP_WINDOWS_FULL_ONLY === "1";
const lightOnly = process.env.AUDIOSEP_WINDOWS_LIGHT_ONLY === "1";
const privatePythonEnv = {
  PYTHONUTF8: "1",
  PYTHONNOUSERSITE: "1",
  PYTHONPATH: "",
  PIP_DISABLE_PIP_VERSION_CHECK: "1"
};

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

async function downloadFile(url, targetPath) {
  // // Download third-party archives only once into the Windows staging cache.
  if (await pathExists(targetPath)) {
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
  // // Remove development artifacts while preserving runtime DLLs, modules, and executables.
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
}

async function preparePythonRuntime() {
  // // Build an isolated Python runtime containing Demucs and CPU PyTorch.
  const pythonZip = path.join(downloadsDir, `python-${pythonVersion}-embed-amd64.zip`);
  const getPipPath = path.join(downloadsDir, "get-pip.py");
  const runtimePythonDir = path.join(runtimeRoot, "python");
  const pythonExe = path.join(runtimePythonDir, "python.exe");

  await downloadFile(pythonEmbedUrl, pythonZip);
  await expandArchive(pythonZip, runtimePythonDir);
  await configureEmbeddedPython(runtimePythonDir);

  await downloadFile(getPipUrl, getPipPath);
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
    "demucs"
  ], {
    env: privatePythonEnv
  });

  await prunePythonRuntime(runtimePythonDir);
  await lockEmbeddedPythonRuntime(runtimePythonDir);
  await validatePythonRuntime();
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
      "& $python -c \"import demucs, torch; print('demucs runtime ok', torch.__version__)\";",
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
    await downloadFile(ffmpegZipUrl, ffmpegZip);
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

async function prepareRuntimePayload(runtimeManifest) {
  // // Build or reuse the private runtime folder that gets embedded in Full installers.
  if (!reuseStaging) {
    await rm(runtimeRoot, { recursive: true, force: true });
  }
  await mkdir(runtimeRoot, { recursive: true });

  const pythonExe = path.join(runtimeRoot, "python", "python.exe");
  if (reuseStaging && (await pathExists(pythonExe))) {
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

  await writeFile(path.join(runtimeRoot, ".audioseparator-runtime-version"), `${runtimeManifest.version}\r\n`, "ascii");
}

async function copyExtensionPayload() {
  // // Stage the CEP extension and helper files into the installer payload.
  const distDir = path.join(payloadRoot, "dist", "PremierePro-AudioSeparator");
  await rm(path.join(payloadRoot, "dist"), { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  for (const dirName of ["client", "host", "CSXS"]) {
    await cp(path.join(projectRoot, dirName), path.join(distDir, dirName), { recursive: true });
  }
  for (const fileName of [".debug", "README.md", "UPDATE_DEPENDENCIES.bat"]) {
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
  await downloadFile(innoSetupUrl, installerPath);
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

async function readRuntimeManifest() {
  // // Runtime metadata lets future light installers download an immutable runtime asset.
  const raw = await readFile(runtimeManifestPath, "utf8");
  const parsed = JSON.parse(raw);
  return {
    version: String(parsed.version || "").trim(),
    releaseTag: String(parsed.releaseTag || "").trim(),
    assetName: String(parsed.assetName || "").trim(),
    sha256: String(parsed.sha256 || "").trim().toLowerCase()
  };
}

async function writeRuntimeManifest(manifest) {
  // // Persist the compiled runtime hash so connected installers can verify downloads.
  await writeFile(runtimeManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function createRuntimeInstaller(compilerPath, runtimeManifest) {
  // // Package the reusable private runtime as a standalone EXE for future lightweight installs.
  const outputPath = path.join(releasesDir, runtimeManifest.assetName);
  if (!rebuildRuntime && runtimeManifest.sha256 && (await pathExists(outputPath))) {
    const localHash = await hashFile(outputPath);
    if (localHash === runtimeManifest.sha256) {
      return runtimeManifest;
    }
    throw new Error(`Local runtime asset hash does not match ${runtimeManifestPath}.`);
  }

  if (!rebuildRuntime && runtimeManifest.sha256 && skipRuntimeAssetDownload) {
    process.stdout.write(`Reusing published Windows runtime metadata for ${runtimeManifest.assetName}.\n`);
    return runtimeManifest;
  }

  if (!rebuildRuntime && runtimeManifest.sha256 && !(await pathExists(outputPath))) {
    const publishedUrl =
      process.env.AUDIOSEP_WINDOWS_RUNTIME_DOWNLOAD_URL ||
      `https://github.com/CyrilG93/PremierePro-AudioSeparator/releases/download/${runtimeManifest.releaseTag}/${runtimeManifest.assetName}`;
    await downloadFile(publishedUrl, outputPath);
    const publishedHash = await hashFile(outputPath);
    if (publishedHash !== runtimeManifest.sha256) {
      throw new Error(`Published runtime asset hash does not match ${runtimeManifestPath}.`);
    }
    return runtimeManifest;
  }

  const scriptPath = path.join(installerRoot, "AudioSeparatorRuntime.iss");
  const runtimeOutputBaseName = path.parse(runtimeManifest.assetName).name;
  const iss = [
    "; // Generated by audioseparator-package-windows-exe.mjs.",
    "[Setup]",
    "AppId={{F9B7641B-970D-4E2D-AD8C-B96C607B1512}",
    "AppName=Audio Separator Private Runtime",
    `AppVersion=${runtimeManifest.version}`,
    "AppPublisher=Cyril Plugin",
    "DefaultDirName={localappdata}\\PremierePro-AudioSeparator\\runtime",
    "DisableDirPage=yes",
    "DisableProgramGroupPage=yes",
    "Uninstallable=no",
    "PrivilegesRequired=lowest",
    "RestartIfNeededByRun=no",
    "ArchitecturesAllowed=x64compatible",
    "ArchitecturesInstallIn64BitMode=x64compatible",
    "Compression=lzma2/ultra64",
    "SolidCompression=yes",
    "WizardStyle=modern",
    `OutputDir=${escapeInnoString(releasesDir)}`,
    `OutputBaseFilename=${runtimeOutputBaseName}`,
    "",
    "[InstallDelete]",
    'Type: filesandordirs; Name: "{localappdata}\\PremierePro-AudioSeparator\\runtime"',
    "",
    "[Files]",
    `Source: "${escapeInnoString(path.join(runtimeRoot, "*"))}"; DestDir: "{localappdata}\\PremierePro-AudioSeparator\\runtime"; Flags: recursesubdirs createallsubdirs ignoreversion`,
    ""
  ].join("\r\n");

  await mkdir(installerRoot, { recursive: true });
  await mkdir(releasesDir, { recursive: true });
  await rm(outputPath, { force: true });
  await writeFile(scriptPath, iss, "utf8");
  await runCommand(compilerPath, ["/Qp", scriptPath]);

  const sha256 = await hashFile(outputPath);
  const finalizedManifest = { ...runtimeManifest, sha256 };
  await writeRuntimeManifest(finalizedManifest);
  process.stdout.write(`Windows runtime asset created at ${outputPath}\n`);
  return finalizedManifest;
}

async function createUserInstaller(compilerPath, version, runtimeManifest, mode) {
  // // Build either a full installer with embedded runtime or a light installer that downloads it.
  const includeRuntime = mode === "full";
  const outputBaseName = `AudioSeparator-v${version}-Windows-${includeRuntime ? "Full" : "Light"}-Installer`;
  const scriptPath = path.join(installerRoot, `AudioSeparator${includeRuntime ? "Full" : "Light"}.iss`);
  const runtimeUrl =
    process.env.AUDIOSEP_WINDOWS_RUNTIME_DOWNLOAD_URL ||
    `https://github.com/CyrilG93/PremierePro-AudioSeparator/releases/download/${runtimeManifest.releaseTag}/${runtimeManifest.assetName}`;
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
    "Compression=lzma2/ultra64",
    "SolidCompression=yes",
    "WizardStyle=modern dynamic",
    `OutputDir=${escapeInnoString(releasesDir)}`,
    `OutputBaseFilename=${outputBaseName}`,
    "",
    "[Files]",
    `Source: "${escapeInnoString(path.join(payloadRoot, "README.md"))}"; DestDir: "{tmp}\\AudioSeparatorPayload"; Flags: ignoreversion`,
    `Source: "${escapeInnoString(path.join(payloadRoot, "dist", "PremierePro-AudioSeparator", "*"))}"; DestDir: "{tmp}\\AudioSeparatorPayload\\dist\\PremierePro-AudioSeparator"; Flags: recursesubdirs createallsubdirs ignoreversion`,
    `Source: "${escapeInnoString(path.join(payloadRoot, "installers", "audioseparator_install_windows_private_runtime.ps1"))}"; DestDir: "{tmp}\\AudioSeparatorPayload\\installers"; Flags: ignoreversion`,
    ...(includeRuntime
      ? [`Source: "${escapeInnoString(path.join(runtimeRoot, "*"))}"; DestDir: "{tmp}\\AudioSeparatorPayload\\runtime"; Flags: recursesubdirs createallsubdirs ignoreversion`]
      : []),
    `Source: "${escapeInnoString(path.join(payloadRoot, "README.md"))}"; DestDir: "{tmp}\\AudioSeparatorPayload"; DestName: "install-ready.txt"; Flags: ignoreversion; AfterInstall: InstallAudioSeparator`,
    "",
    "[Code]",
    "var",
    "  DownloadPage: TDownloadWizardPage;",
    "  ReadyWarningLabel: TNewStaticText;",
    "  DownloadRuntime: Boolean;",
    "",
    "function RuntimeIsCurrent: Boolean;",
    "var",
    "  InstalledVersion: AnsiString;",
    "  RuntimeRoot: String;",
    "  VersionFile: String;",
    "begin",
    "  RuntimeRoot := ExpandConstant('{localappdata}\\PremierePro-AudioSeparator\\runtime');",
    "  VersionFile := RuntimeRoot + '\\.audioseparator-runtime-version';",
    "  if FileExists(VersionFile) then",
    "  begin",
    "    Result := LoadStringFromFile(VersionFile, InstalledVersion) and",
    `      (Trim(String(InstalledVersion)) = '${escapePascalString(runtimeManifest.version)}') and`,
    "      FileExists(RuntimeRoot + '\\python\\python.exe') and",
    "      FileExists(RuntimeRoot + '\\ffmpeg\\bin\\ffmpeg.exe') and",
    "      FileExists(RuntimeRoot + '\\ffmpeg\\bin\\ffprobe.exe');",
    "  end",
    "  else",
    "  begin",
    "    Result :=",
    "      FileExists(RuntimeRoot + '\\python\\python.exe') and",
    "      FileExists(RuntimeRoot + '\\ffmpeg\\bin\\ffmpeg.exe') and",
    "      FileExists(RuntimeRoot + '\\ffmpeg\\bin\\ffprobe.exe');",
    "  end;",
    "end;",
    "",
    "function ShouldInstallRuntime: Boolean;",
    "begin",
    "  Result := DownloadRuntime;",
    "end;",
    "",
    "procedure InitializeWizard;",
    "begin",
    "  DownloadPage := CreateDownloadPage('Downloading Audio Separator files',",
    "    'The first installation can take several minutes. Plugin-only updates stay lightweight.', nil);",
    "  DownloadPage.ShowBaseNameInsteadOfUrl := True;",
    "",
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
    "end;",
    "",
    "function NextButtonClick(CurPageID: Integer): Boolean;",
    "var",
    "  Error: String;",
    "begin",
    "  if CurPageID = wpReady then",
    "  begin",
    "    DownloadPage.Clear;",
    `    DownloadRuntime := ${includeRuntime ? "False" : "not RuntimeIsCurrent"};`,
    ...(includeRuntime
      ? []
      : [
          "    if DownloadRuntime then",
          `      DownloadPage.Add('${escapePascalString(runtimeUrl)}', '${runtimeManifest.assetName}', '${runtimeManifest.sha256}');`
        ]),
    "    if DownloadRuntime then",
    "    begin",
    "      DownloadPage.Show;",
    "      try",
    "        try",
    "          DownloadPage.Download;",
    "          Result := True;",
    "        except",
    "          if DownloadPage.AbortedByUser then",
    "            Log('Download aborted by user.')",
    "          else",
    "          begin",
    "            Error := Format('%s: %s', [DownloadPage.LastBaseNameOrUrl, GetExceptionMessage]);",
    "            SuppressibleMsgBox(AddPeriod(Error), mbCriticalError, MB_OK, IDOK);",
    "          end;",
    "          Result := False;",
    "        end;",
    "      finally",
    "        DownloadPage.Hide;",
    "      end;",
    "    end",
    "    else",
    "      Result := True;",
    "  end",
    "  else",
    "    Result := True;",
    "end;",
    "",
    "function PrepareToInstall(var NeedsRestart: Boolean): String;",
    "begin",
    "  Result := '';",
    "end;",
    "",
    "procedure InstallAudioSeparator;",
    "var",
    "  ResultCode: Integer;",
    "  Params: String;",
    "  RuntimeInstaller: String;",
    "begin",
    "  if DownloadRuntime then",
    "  begin",
    `    RuntimeInstaller := ExpandConstant('{tmp}\\${runtimeManifest.assetName}');`,
    "    if not Exec(RuntimeInstaller, '/SILENT /SUPPRESSMSGBOXES /NORESTART /CURRENTUSER', '', SW_SHOW, ewWaitUntilTerminated, ResultCode) then",
    "      RaiseException('Unable to start the Audio Separator private runtime installer.');",
    "    if ResultCode <> 0 then",
    "      RaiseException('The Audio Separator private runtime installer failed with code ' + IntToStr(ResultCode) + '.');",
    "  end;",
    "",
    `  Params := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}\\AudioSeparatorPayload\\installers\\audioseparator_install_windows_private_runtime.ps1') + '" -PayloadRoot "' + ExpandConstant('{tmp}\\AudioSeparatorPayload') + '"${includeRuntime ? "" : " -SkipRuntimeInstall"} -RuntimeVersion "${escapePascalString(runtimeManifest.version)}"';`,
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
  process.stdout.write(`${includeRuntime ? "Full" : "Light"} Windows installer created at ${outputPath}\nSHA-256: ${sha256}\n`);
}

async function main() {
  // // Build private runtime assets and wrap them with the CEP extension in Inno Setup installers.
  if (process.platform !== "win32") {
    throw new Error("Windows EXE packaging must run on Windows or a Windows GitHub Actions runner.");
  }
  if (fullOnly && lightOnly) {
    throw new Error("Use only one of AUDIOSEP_WINDOWS_FULL_ONLY=1 or AUDIOSEP_WINDOWS_LIGHT_ONLY=1.");
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
  await copyExtensionPayload();

  const runtimeManifest = await readRuntimeManifest();
  if (!runtimeManifest.version || !runtimeManifest.releaseTag || !runtimeManifest.assetName) {
    throw new Error(`${runtimeManifestPath} must define version, releaseTag, and assetName.`);
  }

  await prepareRuntimePayload(runtimeManifest);
  const compilerPath = await prepareInnoCompiler();
  const finalizedManifest = await createRuntimeInstaller(compilerPath, runtimeManifest);

  if (!lightOnly) {
    await createUserInstaller(compilerPath, version, finalizedManifest, "full");
  }
  if (!fullOnly) {
    if (!finalizedManifest.sha256) {
      throw new Error("Light installer requires a runtime SHA-256 in installers/windows-runtime.json.");
    }
    await createUserInstaller(compilerPath, version, finalizedManifest, "light");
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
