(function (root, factory) {
    // // Expose the tracker to the CEP panel and to Node.js release tests.
    const api = factory();
    if (root) root.AudioSeparatorProgress = api;
    if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const MODEL_PASS_COUNTS = {
        htdemucs: 1,
        htdemucs_ft: 4,
        mdx_extra: 4
    };

    function clamp(value, minimum, maximum) {
        // // Keep parsed progress values inside the valid percentage range.
        return Math.min(maximum, Math.max(minimum, value));
    }

    function getExpectedModelPasses(modelName) {
        // // Provide an immediate count while Demucs loads, then let its metadata confirm it.
        return MODEL_PASS_COUNTS[modelName] || 1;
    }

    function createGlobalProgressTracker(options) {
        // // Combine every Demucs model pass into one monotonic user-facing percentage.
        const settings = options || {};
        const startPercent = Number.isFinite(settings.startPercent) ? settings.startPercent : 10;
        const endPercent = Number.isFinite(settings.endPercent) ? settings.endPercent : 95;
        const passMultiplier = Math.max(1, parseInt(settings.passMultiplier, 10) || 1);
        let totalPasses = Math.max(1, parseInt(settings.expectedModelPasses, 10) || 1) * passMultiplier;
        let currentPassIndex = 0;
        let lastLocalPercent = null;
        let maximumOverallPercent = startPercent;
        let stdoutTail = '';
        let stderrTail = '';

        function setModelCount(modelCount) {
            // // Use Demucs' own bag size so unknown or future model names remain accurate.
            const parsedCount = parseInt(modelCount, 10);
            if (Number.isFinite(parsedCount) && parsedCount > 0) {
                totalPasses = Math.max(currentPassIndex + 1, parsedCount * passMultiplier);
            }
        }

        function consumeStdout(text) {
            // // Detect metadata even when Node splits the message across stdout chunks.
            const combined = stdoutTail + String(text || '');
            const matches = Array.from(combined.matchAll(/bag of\s+(\d+)\s+models?/gi));
            if (matches.length > 0) {
                setModelCount(matches[matches.length - 1][1]);
            }
            stdoutTail = combined.slice(-160);
            return totalPasses;
        }

        function consumeStderr(text) {
            // // Parse every tqdm update in a chunk and treat a reset near zero as a new model pass.
            const combined = stderrTail + String(text || '');
            const progressPattern = /(\d{1,3})%\|/g;
            const events = [];
            let match;
            let lastMatchEnd = 0;

            while ((match = progressPattern.exec(combined)) !== null) {
                const localPercent = clamp(parseInt(match[1], 10), 0, 100);
                if (lastLocalPercent !== null && localPercent <= 5 && lastLocalPercent >= 50) {
                    currentPassIndex += 1;
                    if (currentPassIndex >= totalPasses) totalPasses = currentPassIndex + 1;
                }

                const passFraction = (currentPassIndex + (localPercent / 100)) / totalPasses;
                const calculatedPercent = startPercent + (passFraction * (endPercent - startPercent));
                maximumOverallPercent = Math.max(maximumOverallPercent, clamp(calculatedPercent, startPercent, endPercent));
                lastLocalPercent = localPercent;
                lastMatchEnd = progressPattern.lastIndex;
                events.push({
                    localPercent: localPercent,
                    overallPercent: maximumOverallPercent,
                    currentPass: currentPassIndex + 1,
                    totalPasses: totalPasses
                });
            }

            stderrTail = lastMatchEnd > 0 ? combined.slice(lastMatchEnd, lastMatchEnd + 160) : combined.slice(-160);
            return events;
        }

        function getState() {
            // // Return a snapshot for status display and deterministic tests.
            return {
                overallPercent: maximumOverallPercent,
                currentPass: currentPassIndex + 1,
                totalPasses: totalPasses
            };
        }

        return {
            consumeStdout: consumeStdout,
            consumeStderr: consumeStderr,
            getState: getState
        };
    }

    return {
        createGlobalProgressTracker: createGlobalProgressTracker,
        getExpectedModelPasses: getExpectedModelPasses
    };
}));
