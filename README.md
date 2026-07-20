# Audio Separator v2.4.14 - Premiere Pro Plugin

Audio Separator separates the audio from a Premiere Pro timeline clip into vocals and instrumental stems, or into vocals, drums, bass and other stems. Processing runs locally on your computer with Demucs.

## Main features

- Two-stem separation: vocals and instrumental.
- Four-stem separation: vocals, drums, bass and other.
- Three Demucs models for different speed and quality needs.
- Fast, Balanced and Maximum Quality processing modes.
- MP3, WAV and FLAC output.
- Automatic import into the same Premiere Pro project bin as the source media.
- Interface available in English, French, German, Spanish, Italian, Portuguese, Russian, Japanese and Simplified Chinese.
- Automatic support for Premiere Pro light and dark themes.

## Requirements

- Adobe Premiere Pro 2025 or later.
- Windows 64-bit, or an Apple Silicon Mac (`arm64`). Intel Macs are not supported by the current macOS installer.
- An internet connection the first time each Demucs model is used.
- Enough free disk space for the private runtime, downloaded models and generated stems.
- A timeline clip whose source media is available on a local or mounted drive.

Python, Demucs, PyTorch and FFmpeg are included in the Full installer. You do not need to install them separately.

## Installation

Download Audio Separator from the [product page](https://www.cyrilplugin.com/audio-separator) or the [GitHub releases page](https://github.com/CyrilG93/PremierePro-AudioSeparator/releases).

The current installer names are:

- macOS Apple Silicon: `AudioSeparator-v2.4.14-macOS-Installer-arm64.pkg`
- Windows 64-bit: `AudioSeparator-v2.4.14-Windows-Full-Installer.exe`

### Windows

1. Close Premiere Pro.
2. Open the Windows Full installer.
3. If Microsoft Defender SmartScreen appears, select **More info**, then **Run anyway**.
4. Complete the installation and restart Premiere Pro.
5. Open **Window > Extensions > Audio Separator**.

### macOS

1. Close Premiere Pro.
2. Control-click the PKG and choose **Open**.
3. If macOS blocks the installer, open **System Settings > Privacy & Security** and allow it.
4. Complete the installation and restart Premiere Pro.
5. Open **Window > Extensions > Audio Separator**.

The installers are currently unsigned, which is why Windows or macOS may display a security warning.

## Quick start

1. Open a project and an active sequence in Premiere Pro.
2. Select a clip with audio in the timeline.
3. In Audio Separator, click **Select audio clip**. The clip name should appear at the top of the panel.
4. Choose **2 Stems** or **4 Stems**, then enable the stems you want to keep.
5. Choose a model, a processing mode and an output format using the guides below.
6. Keep **Save next to original file** enabled, or disable it to choose another destination folder. Enable **Automatically import into project** if desired.
7. Click **Separate audio** and wait for the operation to finish.

The first use of a model downloads its files. This first separation therefore takes longer and requires an internet connection. The model is then cached for later offline use.

> **Important:** Audio Separator processes the complete source media file referenced by the selected timeline clip. Timeline trims, speed changes and audio effects are not applied to the separation. If you only need a short edited section, export or render that section as a new audio file first.

## Choosing 2 Stems or 4 Stems

| Mode | Output | Recommended use |
| --- | --- | --- |
| **2 Stems** | Vocals + instrumental | Karaoke, dialogue or vocal isolation, instrumental versions and quick music edits. |
| **4 Stems** | Vocals + drums + bass + other | Remixes, detailed mixing, replacing rhythm sections and finer control over a song. |

Two-stem mode still performs a complete separation before combining drums, bass and other into the instrumental stem. It is therefore not significantly faster or lighter than four-stem mode.

## Choosing a model

| Model | Choose it when | Trade-off |
| --- | --- | --- |
| **HTDemucs Fine-tuned (`htdemucs_ft`)** | You want the best general-purpose starting point and final-quality results. This is the recommended default. | It combines four fine-tuned models and takes about four times longer than standard HTDemucs. |
| **HTDemucs (`htdemucs`)** | You need faster previews, are processing long files or are working mainly on CPU. | Fastest model, but fine details and separation can be less accurate. |
| **MDX Extra (`mdx_extra`)** | A difficult song produces too much vocal or instrument leakage with HTDemucs, and you want an alternative result to compare. | Slowest option. It has a different sound and may work better on some tracks, but it is not always better. |

Recommended starting point: **HTDemucs Fine-tuned + Balanced + WAV**.

Separation quality varies with the song, mix and recording. If the recommended model leaves audible leakage or artifacts, compare the same section with **MDX Extra**. The model descriptions are based on the [official Demucs model documentation](https://github.com/facebookresearch/demucs#separating-tracks).

## Choosing a processing mode

| Mode | Recommended use | What changes |
| --- | --- | --- |
| **Fast** | Drafts, long recordings and slower computers. | Uses reduced overlap and no shift averaging. It is faster but can produce more artifacts. |
| **Balanced** | Most projects. | Uses memory-conscious segments while keeping the normal Demucs overlap and shift behavior. |
| **Maximum Quality** | Final exports when processing time and memory are less important. | Uses the selected model's standard Demucs settings without the reduced segment or overlap settings. |

The processing mode does not select a different AI model. For the largest speed improvement, combine **Fast** mode with **HTDemucs**.

## Choosing an output format

| Format | Recommended use | Trade-off |
| --- | --- | --- |
| **WAV** | Further editing, mixing and archiving. | Lossless and the safest choice for production, but creates the largest files. |
| **FLAC** | Lossless storage with smaller files. | Smaller than WAV, but not as universally convenient in every external workflow. |
| **MP3 320 kbps** | Previews, sharing and projects where file size matters most. | Much smaller, but lossy. Avoid repeated MP3 encoding for final production work. |

## Output files and Premiere Pro import

- With **Save next to original file** enabled, stems are written beside the source media.
- If it is disabled, Audio Separator asks you to select an output folder.
- Existing files are not overwritten. A suffix such as `_1`, `_2` or `_3` is added automatically.
- With automatic import enabled, finished stems are imported into the same project bin as the original media when possible.
- Automatic import adds files to the Project panel; it does not place or synchronize them on timeline tracks.
- If automatic import is disabled, use the **Import into project** button after separation.

## Performance tips

- Start with **HTDemucs Fine-tuned + Balanced** for normal work.
- Use **HTDemucs + Fast** for previews or long source files.
- Close memory-heavy applications before processing long songs.
- Keep the source and output folders on a fast local drive when possible.
- WAV and FLAC need more disk space than MP3.
- The first run of each model includes a one-time download and will be slower.
- Audio Separator uses Apple Metal on compatible Apple Silicon Macs and uses a compatible NVIDIA CUDA setup on Windows when available; otherwise it runs on CPU.

## Troubleshooting

### The panel does not appear

- Restart Premiere Pro after installation.
- Check **Window > Extensions > Audio Separator**.
- Confirm that the installer completed successfully.
- On macOS or Windows, make sure the security warning was explicitly allowed.

### The Separate audio button is disabled

- Select a clip with audio in the active timeline.
- Click **Select audio clip** in the panel after selecting the clip.
- Keep at least one output stem enabled.

### The clip cannot be selected or processed

- Confirm that the sequence is active and the audio track item is selected.
- Confirm that the source file is online and accessible on disk.
- Synthetic media, offline media or some nested/generated items may not provide a usable source path. Render them to a regular audio file first.

### The first separation seems stuck or takes a long time

The selected model may still be downloading. Keep Premiere Pro open and confirm that the computer has internet access. Later runs with the same model use the local cache.

### Processing is too slow

- Select **HTDemucs** instead of HTDemucs Fine-tuned or MDX Extra.
- Select **Fast** processing mode.
- Export only the required timeline section as a new audio file before separation.
- Remember that two-stem mode is not faster than four-stem mode.

### Processing runs out of memory

- Close other memory-heavy applications.
- Use **Balanced** or **Fast** mode.
- Use standard **HTDemucs**.
- Process a shorter rendered audio file.

### Files cannot be written beside the original

Disable **Save next to original file**, then choose a folder where your user account has write permission.

### The result contains leakage or artifacts

This can vary from one mix to another. Try HTDemucs Fine-tuned first, then compare MDX Extra. WAV or FLAC avoids adding MP3 compression artifacts to the separated result.

## Changelog

This history was reconstructed from the repository tags, published GitHub releases and the changes included between public versions.

### 2.4.12 - 2026-07-20

- Fixed the macOS installer so its bundled FFmpeg no longer depends on Homebrew libraries.
- The installer now validates a new runtime before replacing an existing working runtime.

### 2.4.11 Beta - 2026-07-14

- Introduced unified Full installers with a private Python, Demucs, PyTorch and FFmpeg runtime.
- Added one continuous progress percentage across all passes of the selected model.
- Added automatic Premiere Pro light and dark theme support.
- Added a link from the version badge to the Audio Separator product page.
- Strengthened installer and runtime validation on Windows and macOS.

### 2.4.2 - 2026-05-01

- The macOS extension installer no longer required administrator rights.
- Error messages followed the selected interface language.
- Language flags displayed correctly on Windows.

### 2.4.0 - 2026-02-23

- Added Spanish, German, Brazilian Portuguese, Japanese, Italian, Simplified Chinese and Russian.
- Displayed language names in their native form and reordered the language selector.
- Replaced the old dependency check workflow with dependency update tools.
- Cleaned obsolete diagnostic files from the installation package.

### 2.3.2 - 2026-02-07

- Fixed a critical panel syntax error that could leave buttons unresponsive.
- Improved configuration detection and restored missing configuration creation.

### 2.3.1 - 2026-02-06

- Added update notifications with a direct download link.

### 2.3.0 - 2026-01-30

- Added automatic detection of Python and FFmpeg installation paths.
- Added a persistent configuration file for more reliable launches.
- Improved handling of custom Python and FFmpeg locations on Windows and macOS.
- Improved Unicode filename handling on Windows.

### 2.2.4 - 2026-01-20

- Fixed a Windows installer crash during Demucs installation.
- Added clearer installation progress, error handling and an installation log.
- Included the Python 3.11.8 installers in the release package.

### 2.2.3 - 2026-01-20

- Added an Audio Separator namespace to host functions to prevent conflicts with other Premiere Pro extensions.

### 2.2.2 - 2026-01-15

- Required Python 3.11 to avoid incompatibilities with newer Python versions.
- Improved macOS permissions during installation.
- Reduced installation packages to the files needed by users.
- Aligned Windows and macOS installer behavior.

### 2.2.1 - 2026-01-14

- Reworked the beginner installation guide and platform prerequisite checks.
- Added step-by-step Windows and macOS setup instructions.

### 2.2.0 - 2026-01-12

- Published an updated Audio Separator package for Premiere Pro. No detailed release notes were recorded for this version.

### 2.1.0 - 2025-12-19

- Initial macOS release.
- Added Demucs-powered two-stem and four-stem separation.
- Added MP3, WAV and FLAC output.
- Added automatic import into Premiere Pro.
- Added English and French interfaces.
