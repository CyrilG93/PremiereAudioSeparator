// // Test global progress independently from the CEP and Demucs runtimes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGlobalProgressTracker, getExpectedModelPasses } = require("../client/progress.js");

function assertClose(actual, expected, message) {
  // // Compare fractional progress values while allowing harmless floating-point rounding.
  assert.ok(Math.abs(actual - expected) < 0.001, `${message}: expected ${expected}, received ${actual}`);
}

function runPasses(tracker, passCount) {
  // // Feed duplicated final updates and split chunks exactly like tqdm can emit them.
  const events = [];
  for (let pass = 0; pass < passCount; pass += 1) {
    events.push(...tracker.consumeStderr("0%|"));
    events.push(...tracker.consumeStderr("5"));
    events.push(...tracker.consumeStderr("0%|"));
    events.push(...tracker.consumeStderr("100%|100%|"));
  }
  return events;
}

// // Keep known UI model counts aligned with the Demucs bags used by the extension.
assert.equal(getExpectedModelPasses("htdemucs"), 1);
assert.equal(getExpectedModelPasses("htdemucs_ft"), 4);
assert.equal(getExpectedModelPasses("mdx_extra"), 4);
assert.equal(getExpectedModelPasses("future_model"), 1);

const fourPassTracker = createGlobalProgressTracker({ expectedModelPasses: 1, startPercent: 10, endPercent: 95 });
fourPassTracker.consumeStdout("Selected model is a bag of ");
assert.equal(fourPassTracker.consumeStdout("4 models."), 4);
const fourPassEvents = runPasses(fourPassTracker, 4);
for (let index = 1; index < fourPassEvents.length; index += 1) {
  assert.ok(
    fourPassEvents[index].overallPercent >= fourPassEvents[index - 1].overallPercent,
    "Global progress must never move backwards."
  );
}
assertClose(fourPassEvents[3].overallPercent, 31.25, "First model boundary");
assertClose(fourPassEvents[7].overallPercent, 52.5, "Second model boundary");
assertClose(fourPassEvents[11].overallPercent, 73.75, "Third model boundary");
assertClose(fourPassEvents[15].overallPercent, 95, "Fourth model boundary");

// // Two-stem and four-stem jobs use the same model passes; output finalization remains reserved above 95%.
for (const stemMode of ["2stems", "4stems"]) {
  for (const processingMode of ["fast", "balanced", "quality"]) {
    const tracker = createGlobalProgressTracker({
      expectedModelPasses: getExpectedModelPasses("htdemucs"),
      passMultiplier: 1,
      startPercent: 10,
      endPercent: 95
    });
    const events = runPasses(tracker, 1);
    assertClose(events[events.length - 1].overallPercent, 95, `${stemMode}/${processingMode} inference boundary`);
  }
}

process.stdout.write("Global progress tests passed.\n");
