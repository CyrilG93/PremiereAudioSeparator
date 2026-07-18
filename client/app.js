/**
 * Main application logic for Audio Separator
 */

(function () {
    'use strict';

    const csInterface = new CSInterface();
    let selectedClip = null;
    let separatedFiles = [];
    let originalProjectItem = null;

    const GITHUB_REPO = 'CyrilG93/PremierePro-AudioSeparator';
    const PRODUCT_PAGE_URL = 'https://www.cyrilplugin.com/audio-separator';
    // Keep the UI fallback in sync when the manifest cannot be read from CEP.
    let CURRENT_VERSION = '2.4.9'; // Will be updated from manifest
    const CEP_THEME_COLOR_CHANGED_EVENT = 'com.adobe.csxs.events.ThemeColorChanged';

    // Language management - Default to English on first launch
    window.currentLanguage = localStorage.getItem('preferredLanguage') || 'en';

    // DOM Elements
    const elements = {
        languageSelect: document.getElementById('languageSelect'),
        languageButton: document.getElementById('languageButton'),
        languageMenu: document.getElementById('languageMenu'),
        languageFlag: document.getElementById('languageFlag'),
        languageName: document.getElementById('languageName'),
        appTitle: document.getElementById('appTitle'),
        appSubtitle: document.getElementById('appSubtitle'),
        selectBtn: document.getElementById('selectBtn'),
        separateBtn: document.getElementById('separateBtn'),
        cancelBtn: document.getElementById('cancelBtn'),
        importBtn: document.getElementById('importBtn'),
        selectedFile: document.getElementById('selectedFile'),
        separationMode: document.getElementById('separationMode'),
        stems2Options: document.getElementById('stems2Options'),
        stems4Options: document.getElementById('stems4Options'),
        exportVocals: document.getElementById('exportVocals'),
        exportInstrumental: document.getElementById('exportInstrumental'),
        exportVocals4: document.getElementById('exportVocals4'),
        exportDrums: document.getElementById('exportDrums'),
        exportBass: document.getElementById('exportBass'),
        exportOther: document.getElementById('exportOther'),
        saveNextToOriginal: document.getElementById('saveNextToOriginal'),
        autoImport: document.getElementById('autoImport'),
        processingMode: document.getElementById('processingMode'),
        modelQuality: document.getElementById('modelQuality'),
        outputFormat: document.getElementById('outputFormat'),
        progressSection: document.getElementById('progressSection'),
        progressStatus: document.getElementById('progressStatus'),
        progressPercent: document.getElementById('progressPercent'),
        progressFill: document.getElementById('progressFill'),
        timeElapsedLabel: document.getElementById('timeElapsedLabel'),
        timeElapsedValue: document.getElementById('timeElapsedValue'),
        progressLog: document.getElementById('progressLog'),
        resultsSection: document.getElementById('resultsSection'),
        resultsTitle: document.getElementById('resultsTitle'),
        resultsList: document.getElementById('resultsList')
    };

    // Timer variables
    let startTime = null;
    let timerInterval = null;

    // Process variable for cancellation
    let currentProcess = null;

    function clampThemeChannel(value) {
        // Keep CEP RGB channels inside the valid CSS color range.
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) {
            return null;
        }

        return Math.max(0, Math.min(255, Math.round(numericValue)));
    }

    function readThemeRgbTriplet(value) {
        // Read direct CEP RGB payloads shaped as { red, green, blue }.
        if (!value || typeof value !== 'object') {
            return null;
        }

        const red = clampThemeChannel(value.red);
        const green = clampThemeChannel(value.green);
        const blue = clampThemeChannel(value.blue);
        if (red === null || green === null || blue === null) {
            return null;
        }

        return { red, green, blue };
    }

    function readThemeColor(value) {
        // Support both CEP RGBColor and UIColor.color shapes from appSkinInfo.
        return readThemeRgbTriplet(value) || (value && readThemeRgbTriplet(value.color));
    }

    function mixThemeColor(left, right, rightWeight) {
        // Blend two RGB colors so derived surfaces stay near Premiere's host color.
        const clampedWeight = Math.max(0, Math.min(1, rightWeight));
        const leftWeight = 1 - clampedWeight;
        return {
            red: Math.round(left.red * leftWeight + right.red * clampedWeight),
            green: Math.round(left.green * leftWeight + right.green * clampedWeight),
            blue: Math.round(left.blue * leftWeight + right.blue * clampedWeight)
        };
    }

    function offsetThemeColor(color, delta) {
        // Nudge a neutral color brighter or darker without leaving RGB bounds.
        return {
            red: Math.max(0, Math.min(255, Math.round(color.red + delta))),
            green: Math.max(0, Math.min(255, Math.round(color.green + delta))),
            blue: Math.max(0, Math.min(255, Math.round(color.blue + delta)))
        };
    }

    function themeLuminance(color) {
        // Estimate perceived brightness to separate Light, Dark, and Darkest Premiere skins.
        return (0.2126 * color.red + 0.7152 * color.green + 0.0722 * color.blue) / 255;
    }

    function normalizePanelBackground(color) {
        // Keep the main panel close to Premiere's host background, including Darkest mode.
        const luminance = themeLuminance(color);
        if (luminance <= 0.16) {
            return mixThemeColor(color, { red: 24, green: 24, blue: 24 }, luminance <= 0.04 ? 0.65 : 0.12);
        }
        if (luminance <= 0.32) {
            return mixThemeColor(color, { red: 58, green: 58, blue: 58 }, 0.42);
        }
        if (luminance >= 0.7) {
            return mixThemeColor(color, { red: 246, green: 246, blue: 246 }, 0.72);
        }
        if (luminance >= 0.55) {
            return mixThemeColor(color, { red: 242, green: 242, blue: 242 }, 0.5);
        }

        return color;
    }

    function setThemeColorVariable(name, color) {
        // Publish each token as a normal CSS color and as an RGB triplet for rgba().
        document.documentElement.style.setProperty(name, `rgb(${color.red}, ${color.green}, ${color.blue})`);
        document.documentElement.style.setProperty(`${name}-rgb`, `${color.red}, ${color.green}, ${color.blue}`);
    }

    function readHostSkinInfo() {
        // Read the current CEP host theme; return null during local browser testing.
        try {
            if (!window.__adobe_cep__ || typeof window.__adobe_cep__.getHostEnvironment !== 'function') {
                return null;
            }

            const hostEnvironment = JSON.parse(window.__adobe_cep__.getHostEnvironment());
            return hostEnvironment && hostEnvironment.appSkinInfo ? hostEnvironment.appSkinInfo : null;
        } catch (error) {
            console.warn('[Theme] Unable to read Premiere theme:', error);
            return null;
        }
    }

    function applyPremierePanelTheme() {
        // Convert Premiere appSkinInfo into stable panel tokens used by the CSS.
        const skinInfo = readHostSkinInfo();
        if (!skinInfo) {
            return;
        }

        const panelBackground = readThemeColor(skinInfo.panelBackgroundColorSRGB) ||
            readThemeColor(skinInfo.panelBackgroundColor) ||
            { red: 48, green: 48, blue: 48 };
        const highlightColor = readThemeColor(skinInfo.systemHighlightColor) || { red: 70, green: 137, blue: 255 };
        const hostLuminance = themeLuminance(panelBackground);
        const base = normalizePanelBackground(panelBackground);
        const isLightTheme = hostLuminance >= 0.55;
        const isDarkestTheme = hostLuminance <= 0.18;
        const textPrimary = isLightTheme ? { red: 36, green: 36, blue: 36 } : { red: 236, green: 236, blue: 236 };
        const textSecondary = mixThemeColor(textPrimary, base, isLightTheme ? 0.52 : 0.42);
        const accentSeed = mixThemeColor(highlightColor, { red: 0, green: 100, blue: 203 }, 0.72);
        const accent = isLightTheme ? offsetThemeColor(accentSeed, -8) : offsetThemeColor(accentSeed, 10);

        document.documentElement.dataset.themeVariant = isLightTheme ? 'light' : isDarkestTheme ? 'darkest' : 'dark';
        setThemeColorVariable('--bg-primary', base);
        setThemeColorVariable('--bg-secondary', offsetThemeColor(base, isLightTheme ? -7 : isDarkestTheme ? 8 : 6));
        setThemeColorVariable('--bg-tertiary', offsetThemeColor(base, isLightTheme ? -13 : isDarkestTheme ? 14 : 12));
        setThemeColorVariable('--text-primary', textPrimary);
        setThemeColorVariable('--text-secondary', textSecondary);
        setThemeColorVariable('--accent-primary', accent);
        setThemeColorVariable('--accent-hover', offsetThemeColor(accent, isLightTheme ? -10 : 18));
        setThemeColorVariable('--border', offsetThemeColor(base, isLightTheme ? -28 : 16));
        document.documentElement.style.setProperty('--shadow', isLightTheme ? 'rgba(0, 0, 0, 0.12)' : 'rgba(0, 0, 0, 0.3)');

        const baseFontFamily = String(skinInfo.baseFontFamily || '').trim();
        if (baseFontFamily) {
            document.documentElement.style.setProperty('--ui-font-family', `"${baseFontFamily}", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif`);
        }
    }

    function bindPremiereThemeListener() {
        // Subscribe once so the panel follows Premiere light/dark changes without a reload.
        if (!window.__adobe_cep__ || typeof window.__adobe_cep__.addEventListener !== 'function') {
            return;
        }

        window.__adobe_cep__.addEventListener(CEP_THEME_COLOR_CHANGED_EVENT, applyPremierePanelTheme);
    }

    /**
     * Load language translations
     */
    function loadLanguage(lang) {
        const activeLang = translations[lang] ? lang : 'en';
        window.currentLanguage = activeLang;
        // Fallback to English if an unsupported language code is stored in preferences.
        const tr = translations[activeLang] || translations.en;
        elements.languageSelect.value = activeLang;
        updateLanguageDropdown(activeLang);

        // Update header
        elements.appTitle.textContent = tr.title;
        elements.appSubtitle.textContent = tr.subtitle;

        // Update buttons
        elements.selectBtn.innerHTML = tr.selectClip;
        elements.separateBtn.innerHTML = tr.separate;
        elements.cancelBtn.innerHTML = tr.cancel;
        elements.importBtn.innerHTML = tr.import;

        // Update file info label
        const fileInfoLabel = document.querySelector('.info-card label');
        if (fileInfoLabel) fileInfoLabel.textContent = tr.selectedFileLabel;

        if (selectedClip === null) {
            elements.selectedFile.textContent = tr.noFileSelected;
        }

        // Update options title
        const optionsTitle = document.querySelector('.section-title');
        if (optionsTitle) optionsTitle.textContent = tr.optionsTitle;

        // Update labels
        const labels = document.querySelectorAll('.quality-selector label, .output-format label');
        labels.forEach(label => {
            const forAttr = label.getAttribute('for');
            if (forAttr === 'separationMode') label.textContent = tr.separationMode;
            if (forAttr === 'processingMode') label.textContent = tr.processingMode;
            if (forAttr === 'modelQuality') label.textContent = tr.model;
            if (forAttr === 'outputFormat') label.textContent = tr.outputFormat;
        });

        // Update select options
        const mode2Option = elements.separationMode.querySelector('option[value="2stems"]');
        const mode4Option = elements.separationMode.querySelector('option[value="4stems"]');
        if (mode2Option) mode2Option.textContent = tr.mode2Stems;
        if (mode4Option) mode4Option.textContent = tr.mode4Stems;

        // Update processing mode options
        const modeBalanced = elements.processingMode.querySelector('option[value="balanced"]');
        const modeFast = elements.processingMode.querySelector('option[value="fast"]');
        const modeQuality = elements.processingMode.querySelector('option[value="quality"]');
        if (modeBalanced) modeBalanced.textContent = tr.modeBalanced;
        if (modeFast) modeFast.textContent = tr.modeFast;
        if (modeQuality) modeQuality.textContent = tr.modeQuality;

        // Update model options
        const modelHtdemucs = elements.modelQuality.querySelector('option[value="htdemucs"]');
        const modelHtdemucsFt = elements.modelQuality.querySelector('option[value="htdemucs_ft"]');
        const modelMdx = elements.modelQuality.querySelector('option[value="mdx_extra"]');
        if (modelHtdemucs) modelHtdemucs.textContent = tr.modelHtdemucs;
        if (modelHtdemucsFt) modelHtdemucsFt.textContent = tr.modelHtdemucsFt;
        if (modelMdx) modelMdx.textContent = tr.modelMdx;

        // Update format options
        const formatMp3 = elements.outputFormat.querySelector('option[value="mp3"]');
        const formatWav = elements.outputFormat.querySelector('option[value="wav"]');
        const formatFlac = elements.outputFormat.querySelector('option[value="flac"]');
        if (formatMp3) formatMp3.textContent = tr.formatMp3;
        if (formatWav) formatWav.textContent = tr.formatWav;
        if (formatFlac) formatFlac.textContent = tr.formatFlac;

        // Update checkbox labels
        const checkboxLabels = document.querySelectorAll('.checkbox-label span');
        checkboxLabels.forEach(span => {
            const checkbox = span.previousElementSibling;
            if (checkbox) {
                const id = checkbox.id;
                if (id === 'exportVocals' || id === 'exportVocals4') span.textContent = tr.exportVocals;
                if (id === 'exportInstrumental') span.textContent = tr.exportInstrumental;
                if (id === 'exportDrums') span.textContent = tr.exportDrums;
                if (id === 'exportBass') span.textContent = tr.exportBass;
                if (id === 'exportOther') span.textContent = tr.exportOther;
                if (id === 'saveNextToOriginal') span.textContent = tr.saveNextToOriginal;
                if (id === 'autoImport') span.textContent = tr.autoImport;
            }
        });

        // Update progress section
        if (elements.progressStatus.textContent === 'Traitement en cours...' ||
            elements.progressStatus.textContent === 'Processing in progress...') {
            elements.progressStatus.textContent = tr.processingInProgress;
        }

        // Update time elapsed label (keep the value)
        const currentTime = elements.timeElapsedValue ? elements.timeElapsedValue.textContent : '0s';
        if (elements.timeElapsedLabel) {
            elements.timeElapsedLabel.innerHTML = tr.timeElapsed + ' <span id="timeElapsedValue">' + currentTime + '</span>';
            // Re-reference the value element
            elements.timeElapsedValue = document.getElementById('timeElapsedValue');
        }

        // Update results title
        if (elements.resultsTitle) {
            elements.resultsTitle.textContent = tr.separationCompleted;
        }

        // Update footer
        const versionElement = document.querySelector('.version');
        if (versionElement) versionElement.textContent = tr.version + ' | ' + tr.poweredBy;

        // Save preference
        localStorage.setItem('preferredLanguage', activeLang);
    }

    /**
     * Initialize the extension
     */
    function init() {
        Utils.log('Audio Separator extension initialized');
        applyPremierePanelTheme();
        bindPremiereThemeListener();

        // Load saved language
        setupLanguageDropdown();
        elements.languageSelect.value = window.currentLanguage;
        loadLanguage(window.currentLanguage);

        setupEventListeners();
        initVersionLink();
        checkPythonEnvironment();

        // Check for updates
        getAppVersion();
        setTimeout(checkForUpdates, 1500);
    }

    /**
     * Setup event listeners
     */
    function setupEventListeners() {
        // Language selector
        elements.languageSelect.addEventListener('change', function () {
            loadLanguage(this.value);
        });

        elements.selectBtn.addEventListener('click', selectAudioClip);
        elements.separateBtn.addEventListener('click', separateAudio);
        elements.cancelBtn.addEventListener('click', cancelSeparation);
        elements.importBtn.addEventListener('click', importToProject);

        // Mode selection
        elements.separationMode.addEventListener('change', function () {
            const is4Stems = elements.separationMode.value === '4stems';
            elements.stems2Options.style.display = is4Stems ? 'none' : 'flex';
            elements.stems4Options.style.display = is4Stems ? 'flex' : 'none';
            updateSeparateButton();
        });

        // Enable/disable separate button based on checkboxes
        elements.exportVocals.addEventListener('change', updateSeparateButton);
        elements.exportInstrumental.addEventListener('change', updateSeparateButton);
        elements.exportVocals4.addEventListener('change', updateSeparateButton);
        elements.exportDrums.addEventListener('change', updateSeparateButton);
        elements.exportBass.addEventListener('change', updateSeparateButton);
        elements.exportOther.addEventListener('change', updateSeparateButton);
    }

    /**
     * Setup custom language dropdown
     */
    function setupLanguageDropdown() {
        if (!elements.languageButton || !elements.languageMenu) return;

        // Toggle the custom menu because native Windows selects do not render flag emojis reliably.
        elements.languageButton.addEventListener('click', function (event) {
            event.stopPropagation();
            const isOpen = elements.languageButton.getAttribute('aria-expanded') === 'true';
            setLanguageMenuOpen(!isOpen);
        });

        // Apply the selected language from custom menu items.
        const menuItems = elements.languageMenu.querySelectorAll('button[data-lang]');
        menuItems.forEach(function (item) {
            item.addEventListener('click', function () {
                const lang = item.getAttribute('data-lang');
                elements.languageSelect.value = lang;
                loadLanguage(lang);
                setLanguageMenuOpen(false);
            });
        });

        // Close the menu when the user clicks outside the selector.
        document.addEventListener('click', function () {
            setLanguageMenuOpen(false);
        });

        // Close the menu with Escape for keyboard users.
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                setLanguageMenuOpen(false);
            }
        });
    }

    /**
     * Show or hide the custom language menu
     */
    function setLanguageMenuOpen(isOpen) {
        const selector = document.querySelector('.language-selector');
        if (!selector || !elements.languageButton) return;

        // Keep the visual state and accessibility state in sync.
        selector.classList.toggle('is-open', isOpen);
        elements.languageButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }

    /**
     * Update custom language dropdown display
     */
    function updateLanguageDropdown(lang) {
        if (!elements.languageSelect || !elements.languageFlag || !elements.languageName) return;

        // Read language metadata from the hidden native select to keep one source of truth.
        const selectedOption = elements.languageSelect.querySelector('option[value="' + lang + '"]') ||
            elements.languageSelect.querySelector('option[value="en"]');
        const flagCode = selectedOption ? selectedOption.getAttribute('data-flag') : 'gb';
        const languageName = selectedOption ? selectedOption.textContent : 'English';

        elements.languageFlag.className = 'language-flag flag-' + flagCode;
        elements.languageName.textContent = languageName;

        // Mark the active option in the custom menu.
        if (elements.languageMenu) {
            const menuItems = elements.languageMenu.querySelectorAll('button[data-lang]');
            menuItems.forEach(function (item) {
                item.classList.toggle('is-selected', item.getAttribute('data-lang') === lang);
                item.setAttribute('aria-selected', item.getAttribute('data-lang') === lang ? 'true' : 'false');
            });
        }
    }

    /**
     * Cancel current separation
     */
    function cancelSeparation() {
        if (currentProcess) {
            addLogMessage(t('cancelling'));
            currentProcess.kill('SIGTERM');
            currentProcess = null;

            stopTimer();
            elements.progressSection.style.display = 'none';

            // Restore buttons
            elements.cancelBtn.style.display = 'none';
            elements.separateBtn.style.display = 'block';
            elements.separateBtn.disabled = false;
            elements.selectBtn.disabled = false;

            addLogMessage(t('cancelled'));
        }
    }

    /**
     * Update separate button state
     */
    function updateSeparateButton() {
        const hasSelection = selectedClip !== null;
        let hasExportOption = false;

        if (elements.separationMode.value === '2stems') {
            hasExportOption = elements.exportVocals.checked || elements.exportInstrumental.checked;
        } else {
            hasExportOption = elements.exportVocals4.checked || elements.exportDrums.checked ||
                elements.exportBass.checked || elements.exportOther.checked;
        }

        elements.separateBtn.disabled = !(hasSelection && hasExportOption);
    }

    /**
     * Get unique filename by adding _1, _2, etc. if file exists
     */
    function getUniqueFilename(basePath, baseName, extension) {
        const fs = require('fs');
        const path = require('path');

        let finalPath = path.join(basePath, baseName + extension);
        let counter = 1;

        while (fs.existsSync(finalPath)) {
            finalPath = path.join(basePath, baseName + '_' + counter + extension);
            counter++;
        }

        return finalPath;
    }

    /**
     * Check if Python and Demucs are installed
     */
    function checkPythonEnvironment() {
        csInterface.evalScript('AudioSeparator_checkPythonEnvironment()', function (result) {
            const status = JSON.parse(result);
            if (!status.success) {
                Utils.showNotification(
                    t('pythonMissing'),
                    'warning'
                );
            }
        });
    }

    /**
     * Select audio clip from timeline
     */
    function selectAudioClip() {
        Utils.log('Selecting audio clip...');

        csInterface.evalScript('AudioSeparator_getSelectedAudioClip()', function (result) {
            console.log("Raw result from host:", result); // DEBUG
            try {
                const clipData = JSON.parse(result);
                if (clipData.success) {
                    selectedClip = clipData;
                    originalProjectItem = clipData; // Store for import
                    elements.selectedFile.textContent = clipData.name;

                    updateSeparateButton();
                    Utils.log('Clip selected: ' + clipData.name + ' (Dossier: ' + clipData.parentBinName + ')');
                } else {
                    Utils.showNotification(
                        t('selectTimelineAudioClip'),
                        'error'
                    );
                }
            } catch (e) {
                Utils.log('Error parsing clip data: ' + e.message, 'error');
                Utils.showNotification(t('clipSelectionError'), 'error');
            }
        });
    }

    /**
     * Separate audio into vocals and instrumental
     */
    function separateAudio() {
        if (!selectedClip) {
            Utils.showNotification(t('noClipSelected'), 'error');
            return;
        }

        // Show progress section
        elements.progressSection.style.display = 'block';
        elements.resultsSection.style.display = 'none';
        elements.separateBtn.disabled = true;
        elements.selectBtn.disabled = true;

        updateProgress(0, t('preparation'));
        addLogMessage(t('startingSeparation'));

        // Determine output directory
        let outputPath;
        if (elements.saveNextToOriginal.checked) {
            // Save next to original file
            const path = require('path');
            outputPath = path.dirname(selectedClip.path);
            addLogMessage(t('outputFolder') + ' ' + outputPath + ' ' + t('nextToOriginal'));
            startSeparation(outputPath);
        } else {
            // Ask user for output directory
            const outputDialogScript = 'var folder = Folder.selectDialog(' + JSON.stringify(t('outputFolderDialogTitle')) + '); folder ? folder.fsName : null;';
            csInterface.evalScript(outputDialogScript, function (result) {
                if (!result || result === 'null') {
                    handleSeparationError(t('noOutputFolderSelected'));
                    return;
                }
                outputPath = result;
                addLogMessage(t('outputFolder') + ' ' + outputPath);
                startSeparation(outputPath);
            });
        }
    }

    /**
     * Detect GPU device
     */
    function detectGPU(config) {
        const os = require('os');
        const platform = os.platform();
        const pythonPath = config && config.pythonPath;

        if (platform === 'darwin') {
            // macOS - Use MPS only when the configured PyTorch runtime really exposes it.
            const arch = os.arch();
            if (arch === 'arm64' && pythonTorchFeatureAvailable(pythonPath, 'mps')) {
                return 'mps';  // Apple Metal Performance Shaders
            }
        } else if (platform === 'win32' || platform === 'linux') {
            // Windows/Linux - Require both an NVIDIA driver and a CUDA-enabled PyTorch build.
            try {
                const { execSync } = require('child_process');
                execSync('nvidia-smi', { stdio: 'ignore' });
                if (pythonTorchFeatureAvailable(pythonPath, 'cuda')) {
                    return 'cuda';
                }
            } catch (e) {
                // No NVIDIA GPU
            }
        }

        return 'cpu';
    }

    /**
     * Check the configured Python runtime for CUDA or Apple MPS support.
     */
    function pythonTorchFeatureAvailable(pythonPath, feature) {
        if (!pythonPath) {
            return false;
        }

        try {
            const { execFileSync } = require('child_process');
            const script = [
                'import sys',
                'try:',
                '    import torch',
                feature === 'cuda'
                    ? '    ok = bool(torch.cuda.is_available())'
                    : '    ok = bool(getattr(torch.backends, "mps", None) and torch.backends.mps.is_available())',
                'except Exception:',
                '    ok = False',
                'print("1" if ok else "0")'
            ].join('\n');
            const output = execFileSync(pythonPath, ['-c', script], {
                encoding: 'utf8',
                timeout: 10000,
                windowsHide: true
            }).trim();
            return output === '1';
        } catch (e) {
            return false;
        }
    }

    /**
     * Check system resources
     */
    function checkSystemResources() {
        const os = require('os');
        const freeMem = os.freemem();
        const totalMem = os.totalmem();
        const memUsage = ((totalMem - freeMem) / totalMem * 100).toFixed(1);
        const cpuCount = os.cpus().length;

        addLogMessage(`${t('systemInfo')} ${cpuCount} ${t('cores')} ${memUsage}% ${t('used')}`);

        if (memUsage > 80) {
            addLogMessage(t('highMemory'));
        }
    }

    /**
     * Start the separation process
     */
    function startSeparation(outputPath) {
        // Load configuration
        const path = require('path');
        const fs = require('fs');
        let config = {};

        try {
            // Config is now at extension root
            // If __dirname is .../client, we need ../config.json
            // But log showed __dirname was root.
            // Let's try both to be robust.
            let configPath = path.join(__dirname, 'config.json');

            if (!fs.existsSync(configPath)) {
                // Try parent folder (if __dirname is client)
                configPath = path.join(__dirname, '..', 'config.json');
            }

            if (!fs.existsSync(configPath)) {
                // Try client folder (if __dirname is root and config is in client - unlikely but possible in some setups)
                configPath = path.join(__dirname, 'client', 'config.json');
            }

            if (fs.existsSync(configPath)) {
                config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                addLogMessage('✅ Config loaded successfully');
            } else {
                addLogMessage('❌ Config file does not exist at path');
                throw new Error('Config file not found');
            }
        } catch (e) {
            Utils.showNotification(t('configMissing'), 'error');
            addLogMessage('❌ ' + t('configMissingLog'));
            return;
        }

        if (!config.pythonPath) {
            Utils.showNotification(t('pythonPathMissing'), 'error');
            return;
        }

        updateProgress(5, t('executingDemucs'));

        // Start timer
        startTimer();

        // Hide separate button and show cancel button
        elements.separateBtn.style.display = 'none';
        elements.cancelBtn.style.display = 'block';
        elements.selectBtn.disabled = true;

        // Check system resources
        checkSystemResources();

        // Use Node.js to execute the command
        const { spawn, execSync } = require('child_process');
        const os = require('os');

        const model = elements.modelQuality.value;
        let inputPath = selectedClip.path;
        const is4Stems = elements.separationMode.value === '4stems';
        const processingMode = elements.processingMode.value;
        const outputFormat = elements.outputFormat.value;

        // Use configured paths
        const pythonPath = config.pythonPath;
        const ffmpegPath = config.ffmpegPath;

        addLogMessage(`🐍 Python: ${pythonPath}`);

        // Detect GPU
        const device = detectGPU(config);
        if (device !== 'cpu') {
            addLogMessage(`${t('gpuDetected')} ${device.toUpperCase()}`);
        } else {
            addLogMessage(t('usingCpu'));
        }

        addLogMessage(t('launching'));
        addLogMessage(`${t('modeLabel')} ` + (is4Stems ? '4 Stems' : '2 Stems'));
        addLogMessage(`${t('modelLabel')} ` + model);
        addLogMessage(`${t('processingLabel')} ` + processingMode);
        addLogMessage(`${t('formatLabel')} ` + outputFormat.toUpperCase());
        addLogMessage(`${t('fileLabel')} ` + inputPath);
        updateProgress(10, t('separationInProgress'));

        // Build command arguments
        const args = ['-m', 'demucs'];

        // Add processing mode options
        switch (processingMode) {
            case 'fast':
                // // Use only Demucs-supported inference settings to reduce processing time.
                args.push('--shifts', '0');
                args.push('--overlap', '0.1');
                args.push('--segment', '7');
                addLogMessage(t('modeFastLog'));
                break;
            case 'quality':
                // Default mode, no extra options
                addLogMessage(t('modeQualityLog'));
                break;
            case 'balanced':
            default:
                args.push('--segment', '7');  // Save RAM, compatible with all models
                addLogMessage(t('modeBalancedLog'));
                break;
        }

        // Force GPU if available
        if (device !== 'cpu') {
            args.push('--device', device);
        }

        // Add output format
        if (outputFormat === 'mp3') {
            args.push('--mp3');
            args.push('--mp3-bitrate', '320');
        } else if (outputFormat === 'flac') {
            args.push('--flac');
        }
        // WAV is default, no option needed

        if (!is4Stems) {
            args.push('--two-stems=vocals');
        }

        args.push('-n', model, '--out', outputPath, inputPath);

        addLogMessage('Commande: ' + pythonPath + ' ' + args.join(' '));

        // Use spawn instead of exec for better real-time output
        const spawnEnv = {
            ...process.env,
            // Force UTF-8 encoding for Python to handle Unicode filenames on Windows
            PYTHONIOENCODING: 'utf-8',
            PYTHONUTF8: '1',
            // // Hugging Face falls back safely when Windows symlinks are unavailable; hide its noisy warning.
            HF_HUB_DISABLE_SYMLINKS_WARNING: '1'
        };

        // Add FFmpeg to PATH if configured
        if (ffmpegPath) {
            const separator = os.platform() === 'win32' ? ';' : ':';
            const ffmpegDir = path.dirname(ffmpegPath);
            spawnEnv.PATH = ffmpegDir + separator + (spawnEnv.PATH || '');
        }

        currentProcess = spawn(pythonPath, args, { env: spawnEnv });

        let outputData = '';
        let errorData = '';
        // // Track all Demucs model passes as one monotonic percentage for every stem mode.
        const progressTracker = window.AudioSeparatorProgress.createGlobalProgressTracker({
            expectedModelPasses: window.AudioSeparatorProgress.getExpectedModelPasses(model),
            passMultiplier: 1,
            startPercent: 10,
            endPercent: 95
        });

        currentProcess.stdout.on('data', function (data) {
            const output = data.toString();
            outputData += output;
            addLogMessage('📝 ' + output.trim());
            progressTracker.consumeStdout(output);
        });

        currentProcess.stderr.on('data', function (data) {
            const output = data.toString();
            errorData += output;
            addLogMessage('ℹ️ ' + output.trim());

            // // Use the last update when a stderr chunk contains several tqdm lines.
            const progressEvents = progressTracker.consumeStderr(output);
            if (progressEvents.length > 0) {
                const latestProgress = progressEvents[progressEvents.length - 1];
                const displayedPercent = Math.round(latestProgress.overallPercent);
                updateProgress(
                    latestProgress.overallPercent,
                    t('separationInProgress') + ' ' + displayedPercent + '%'
                );
            }
        });

        currentProcess.on('close', function (code) {
            // Restore buttons
            elements.cancelBtn.style.display = 'none';
            elements.separateBtn.style.display = 'block';
            elements.selectBtn.disabled = false;
            currentProcess = null;

            if (code !== 0 && code !== null) {
                addLogMessage('❌ ' + t('processError') + ' ' + code);
                if (errorData) addLogMessage(t('details') + ' ' + errorData);
                handleSeparationError(t('separationFailed') + ' ' + code + ')');
                return;
            }

            addLogMessage(t('separationCompleted'));
            if (outputData) addLogMessage(t('output') + ' ' + outputData);

            updateProgress(95, t('searchingFiles'));

            // Find generated files
            const fs = require('fs');
            const path = require('path');

            const modelFolder = path.join(outputPath, model);

            try {
                const songFolders = fs.readdirSync(modelFolder).filter(function (item) {
                    // Filter out hidden files and non-directories
                    if (item.startsWith('.')) return false;
                    const fullPath = path.join(modelFolder, item);
                    return fs.statSync(fullPath).isDirectory();
                });

                if (songFolders.length === 0) {
                    handleSeparationError(t('generatedFilesMissing'));
                    return;
                }

                const songFolder = path.join(modelFolder, songFolders[0]);
                const files = fs.readdirSync(songFolder).filter(function (item) {
                    return !item.startsWith('.');
                });

                // Get original filename without extension
                const originalName = path.basename(selectedClip.path, path.extname(selectedClip.path));
                const is4Stems = elements.separationMode.value === '4stems';

                addLogMessage('📁 Song folder: ' + songFolder);
                addLogMessage('📁 Output path: ' + outputPath);
                addLogMessage('📁 Files found: ' + files.length);

                const resultFiles = [];
                files.forEach(function (file) {
                    const filePath = path.join(songFolder, file);
                    const fileName = file.toLowerCase();
                    const fileExt = path.extname(file);

                    addLogMessage(t('fileFound') + ' ' + file);
                    addLogMessage('   Source: ' + filePath);

                    let newName = null;
                    let fileType = null;

                    if (is4Stems) {
                        // 4 stems mode
                        if (fileName.includes('vocals') && elements.exportVocals4.checked) {
                            const translatedName = t('vocals').charAt(0).toUpperCase() + t('vocals').slice(1);
                            newName = originalName + '_' + translatedName + fileExt;
                            fileType = 'vocals';
                            addLogMessage('   ' + t('type') + ' ' + translatedName);
                        } else if (fileName.includes('drums') && elements.exportDrums.checked) {
                            const translatedName = t('drums').charAt(0).toUpperCase() + t('drums').slice(1);
                            newName = originalName + '_' + translatedName + fileExt;
                            fileType = 'drums';
                            addLogMessage('   ' + t('type') + ' ' + translatedName);
                        } else if (fileName.includes('bass') && elements.exportBass.checked) {
                            const translatedName = t('bass').charAt(0).toUpperCase() + t('bass').slice(1);
                            newName = originalName + '_' + translatedName + fileExt;
                            fileType = 'bass';
                            addLogMessage('   ' + t('type') + ' ' + translatedName);
                        } else if (fileName.includes('other') && elements.exportOther.checked) {
                            const translatedName = t('other').charAt(0).toUpperCase() + t('other').slice(1);
                            newName = originalName + '_' + translatedName + fileExt;
                            fileType = 'other';
                            addLogMessage('   ' + t('type') + ' ' + translatedName);
                        }
                    } else {
                        // 2 stems mode
                        // Check for vocals (but not no_vocals)
                        if (fileName.includes('vocals') && !fileName.includes('no_vocals') && elements.exportVocals.checked) {
                            const translatedName = t('vocals').charAt(0).toUpperCase() + t('vocals').slice(1);
                            newName = originalName + '_' + translatedName + fileExt;
                            fileType = 'vocals';
                            addLogMessage('   ' + t('type') + ' ' + translatedName);
                        }
                        // Check for instrumental/no_vocals
                        else if ((fileName.includes('no_vocals') || fileName.includes('instrumental')) &&
                            elements.exportInstrumental.checked) {
                            const translatedName = t('instrumental').charAt(0).toUpperCase() + t('instrumental').slice(1);
                            newName = originalName + '_' + translatedName + fileExt;
                            fileType = 'instrumental';
                            addLogMessage('   ' + t('type') + ' ' + translatedName);
                        }
                    }

                    if (newName && fileType) {
                        // Get base name and extension
                        const baseName = path.basename(newName, path.extname(newName));
                        const extension = path.extname(newName);

                        // Get unique filename (adds _1, _2, etc. if exists)
                        const uniquePath = getUniqueFilename(outputPath, baseName, extension);
                        const uniqueName = path.basename(uniquePath);

                        addLogMessage('   Target: ' + uniquePath);

                        try {
                            // Check if source file exists
                            if (!fs.existsSync(filePath)) {
                                throw new Error('Source file not found: ' + filePath);
                            }

                            // Check if target directory exists
                            if (!fs.existsSync(outputPath)) {
                                throw new Error('Output directory not found: ' + outputPath);
                            }

                            fs.renameSync(filePath, uniquePath);
                            addLogMessage('   ' + t('fileRenamed') + ' ' + uniqueName);
                            resultFiles.push({
                                path: uniquePath,
                                name: uniqueName,
                                type: fileType
                            });
                        } catch (err) {
                            addLogMessage('   ⚠️ ' + t('renameError') + ' ' + err.message);
                            addLogMessage('   Code: ' + err.code);
                            // Keep original file
                            resultFiles.push({
                                path: filePath,
                                name: file,
                                type: fileType
                            });
                        }
                    } else {
                        addLogMessage('   ' + t('ignored'));
                    }
                });

                addLogMessage('📊 Result files: ' + resultFiles.length);

                // Clean up: remove the model folder if empty
                try {
                    if (fs.readdirSync(songFolder).length === 0) {
                        fs.rmdirSync(songFolder);
                        addLogMessage('🗑️ Cleaned up song folder');
                    }
                    if (fs.readdirSync(modelFolder).length === 0) {
                        fs.rmdirSync(modelFolder);
                        addLogMessage('🗑️ Cleaned up model folder');
                    }
                } catch (err) {
                    addLogMessage('⚠️ Cleanup warning: ' + err.message);
                }

                addLogMessage('✅ Updating progress to 100%');
                updateProgress(100, t('completed'));

                addLogMessage('✅ Calling handleSeparationSuccess');
                handleSeparationSuccess({
                    success: true,
                    files: resultFiles,
                    outputPath: outputPath
                });
            } catch (e) {
                handleSeparationError(t('fileSearchError') + ' ' + e.message);
            }
        });
    }

    /**
     * Simulate progress updates
     */
    function simulateProgress() {
        let progress = 0;
        const interval = setInterval(function () {
            progress += Math.random() * 15;
            if (progress >= 95) {
                progress = 95;
                clearInterval(interval);
            }
            updateProgress(progress, t('processingInProgress'));
        }, 1000);
    }

    /**
     * Start timer
     */
    function startTimer() {
        startTime = Date.now();
        if (elements.timeElapsedValue) {
            elements.timeElapsedValue.textContent = '0s';
        }

        if (timerInterval) clearInterval(timerInterval);

        timerInterval = setInterval(function () {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            if (elements.timeElapsedValue) {
                elements.timeElapsedValue.textContent = formatTime(elapsed);
            }
        }, 1000);
    }

    /**
     * Stop timer
     */
    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }


    /**
     * Format seconds to readable time
     */
    function formatTime(seconds) {
        if (seconds < 60) {
            return seconds + 's';
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            return minutes + 'm ' + remainingSeconds + 's';
        } else {
            const hours = Math.floor(seconds / 3600);
            const mins = Math.floor((seconds % 3600) / 60);
            return hours + 'h ' + mins + 'm';
        }
    }

    // ============================================================================
    // UPDATE SYSTEM
    // ============================================================================


    function getAppVersion() {
        try {
            const fs = require('fs');
            const path = require('path');

            var extensionPath = csInterface.getSystemPath(SystemPath.EXTENSION);
            var manifestPath = path.join(extensionPath, 'CSXS', 'manifest.xml');

            if (fs.existsSync(manifestPath)) {
                var content = fs.readFileSync(manifestPath, 'utf8');
                var match = content.match(/ExtensionBundleVersion="([^"]+)"/);
                if (match && match[1]) {
                    CURRENT_VERSION = match[1];
                    console.log('Detected version:', CURRENT_VERSION);
                }
            }
        } catch (e) {
            console.error('Error reading manifest:', e);
        }

        // Update header UI
        var versionEl = document.getElementById('versionInfo');
        if (versionEl) {
            versionEl.textContent = 'v' + CURRENT_VERSION;
            versionEl.setAttribute('aria-label', 'Open Audio Separator page for version ' + CURRENT_VERSION);
        }
    }

    function openExternalUrl(url) {
        // Open external URLs through CEP when the panel runs inside Premiere.
        try {
            const hasCepBrowser = typeof cep !== 'undefined' || (typeof window !== 'undefined' && window.cep);
            if (hasCepBrowser && csInterface && typeof csInterface.openURLInDefaultBrowser === 'function') {
                csInterface.openURLInDefaultBrowser(url);
                return;
            }
        } catch (e) {
            console.error('[Link] Error opening URL through CEP:', e);
        }

        // Fall back to regular browser navigation when testing outside Premiere.
        try {
            const popup = window.open(url, '_blank');
            if (!popup) {
                window.location.href = url;
            }
        } catch (e) {
            console.error('[Link] Browser fallback failed:', e);
        }
    }

    function initVersionLink() {
        // Make the header version badge open the public product page.
        const versionBadge = document.getElementById('versionInfo');
        if (!versionBadge) return;
        versionBadge.addEventListener('click', function () {
            openExternalUrl(PRODUCT_PAGE_URL);
        });
    }

    function checkForUpdates() {
        // Use https module via Node.js
        const https = require('https');

        var url = 'https://api.github.com/repos/' + GITHUB_REPO + '/releases/latest';

        var options = {
            headers: {
                'User-Agent': 'Premiere-AudioSeparator-Extension'
            }
        };

        https.get(url, options, function (res) {
            var body = '';

            res.on('data', function (chunk) {
                body += chunk;
            });

            res.on('end', function () {
                try {
                    if (res.statusCode === 200) {
                        var data = JSON.parse(body);
                        var latestVersion = data.tag_name;

                        // Remove 'v' prefix if present
                        if (latestVersion && latestVersion.charAt(0) === 'v') {
                            latestVersion = latestVersion.substring(1);
                        }

                        console.log('Latest Github version:', latestVersion);

                        if (compareVersions(latestVersion, CURRENT_VERSION) > 0) {
                            var downloadUrl = data.html_url; // Default to release page

                            // Try to find a zip asset
                            if (data.assets && data.assets.length > 0) {
                                for (var i = 0; i < data.assets.length; i++) {
                                    if (data.assets[i].name.endsWith('.zip')) {
                                        downloadUrl = data.assets[i].browser_download_url;
                                        break;
                                    }
                                }
                            }

                            showUpdateBanner(downloadUrl);
                            console.log('Update available:', latestVersion, 'Download:', downloadUrl);
                        } else {
                            console.log('App is up to date');
                        }
                    } else {
                        console.log('Github API returned:', res.statusCode);
                    }
                } catch (e) {
                    console.error('Error parsing Github response:', e);
                }
            });
        }).on('error', function (e) {
            console.error('Error checking updates:', e);
        });
    }

    function compareVersions(v1, v2) {
        if (!v1 || !v2) return 0;

        var parts1 = v1.split('.').map(Number);
        var parts2 = v2.split('.').map(Number);

        for (var i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            var p1 = parts1[i] || 0;
            var p2 = parts2[i] || 0;

            if (p1 > p2) return 1;
            if (p1 < p2) return -1;
        }

        return 0;
    }

    function showUpdateBanner(downloadUrl) {
        var banner = document.getElementById('updateBanner');
        if (banner) {
            banner.style.display = 'block';
            banner.onclick = function () {
                if (downloadUrl) {
                    openExternalUrl(downloadUrl);
                }
            };
        }
    }

    /**
     * Update progress bar
     */
    function updateProgress(percent, status) {
        elements.progressFill.style.width = percent + '%';
        elements.progressPercent.textContent = Math.round(percent) + '%';
        elements.progressStatus.textContent = status;
    }

    /**
     * Add message to progress log
     */
    function addLogMessage(message) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.textContent = `[${timestamp}] ${message}`;
        elements.progressLog.appendChild(logEntry);
        elements.progressLog.scrollTop = elements.progressLog.scrollHeight;
    }

    /**
     * Handle successful separation
     */
    function handleSeparationSuccess(response) {
        stopTimer();
        updateProgress(100, t('separationCompleted'));
        addLogMessage(t('separationCompleted'));

        separatedFiles = response.files || [];

        // Show results
        elements.resultsSection.style.display = 'block';
        elements.resultsList.innerHTML = '';

        separatedFiles.forEach(function (file) {
            const resultItem = document.createElement('div');
            resultItem.className = 'result-item';

            // Icon based on file type
            let icon = '🎵';
            if (file.type === 'vocals') icon = '🎤';
            else if (file.type === 'instrumental') icon = '🎸';
            else if (file.type === 'drums') icon = '🥁';
            else if (file.type === 'bass') icon = '🎸';
            else if (file.type === 'other') icon = '🎹';

            resultItem.textContent = `${icon} ${file.name}`;
            elements.resultsList.appendChild(resultItem);
        });

        // Re-enable buttons
        elements.selectBtn.disabled = false;
        elements.separateBtn.disabled = false;

        // Auto-import if enabled
        if (elements.autoImport.checked) {
            addLogMessage(t('autoImportEnabled'));
            importToProject();
        } else {
            // Show import button if auto-import is disabled
            elements.importBtn.style.display = 'block';
        }

        Utils.log('Separation completed successfully');
    }

    /**
     * Handle separation error
     */
    function handleSeparationError(error) {
        stopTimer();
        updateProgress(0, t('separationErrorStatus'));
        addLogMessage('❌ ' + t('errorPrefix') + ' ' + error);

        Utils.showNotification(t('errorPrefix') + ' ' + error, 'error');

        // Re-enable buttons
        elements.selectBtn.disabled = false;
        elements.separateBtn.disabled = false;

        Utils.log('Separation error: ' + error, 'error');
    }

    /**
     * Import separated files back to Premiere Pro project
     */
    function importToProject() {
        if (separatedFiles.length === 0) {
            Utils.showNotification(t('noFilesToImport'), 'error');
            return;
        }

        elements.importBtn.disabled = true;
        addLogMessage(t('importingFiles'));

        // Escape the JSON string properly for ExtendScript
        const filesJsonStr = JSON.stringify(separatedFiles).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const originalMediaPath = originalProjectItem ? originalProjectItem.path.replace(/\\/g, '\\\\').replace(/"/g, '\\"') : null;

        csInterface.evalScript(`AudioSeparator_importFiles("${filesJsonStr}", "${originalMediaPath}")`, function (result) {
            try {
                if (!result || result === 'undefined' || result === 'null') {
                    addLogMessage('⚠️ ' + t('extendScriptNoResponse'));
                    Utils.showNotification(t('importError'), 'error');
                    elements.importBtn.disabled = false;
                    return;
                }

                const response = JSON.parse(result);
                if (response.success) {
                    const binInfo = response.binName ? ' ' + t('filesImported') + ' "' + response.binName + '"' : '';
                    addLogMessage('✅ ' + response.imported + ' ' + t('filesImported') + binInfo);

                    // Hide import button after successful import
                    elements.importBtn.style.display = 'none';
                } else {
                    addLogMessage('❌ ' + t('importErrorPrefix') + ' ' + response.error);
                    Utils.showNotification(t('importError'), 'error');
                }
            } catch (e) {
                addLogMessage('❌ ' + t('errorPrefix') + ' ' + e.message);
            }
            elements.importBtn.disabled = false;
        });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
