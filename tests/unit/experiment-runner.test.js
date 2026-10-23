const test = require("node:test");
const assert = require("node:assert/strict");
const { runSequentialExperiments } = require("../../frontend/src/lib/experimentRunner.js");

test("sequential experiment runner preserves order and continues after a failed scenario", async () => {
  const order = [];
  const outcomes = await runSequentialExperiments(["first", "second"], async (scenario) => {
    order.push(scenario);
    if (scenario === "first") throw new Error("probe did not verify recovery");
    return { message: "Read-only audit passed." };
  });

  assert.deepEqual(order, ["first", "second"]);
  assert.deepEqual(outcomes.results.map(({ status }) => status), ["failed", "passed"]);
  assert.equal(outcomes.results[0].message, "probe did not verify recovery");
});

test("sequential experiment runner stops before the next scenario after a stop request", async () => {
  const order = [];
  let stop = false;
  const outcomes = await runSequentialExperiments(["first", "second"], async (scenario) => {
    order.push(scenario);
  }, {
    shouldStop: () => stop,
    onResult: () => { stop = true; },
  });

  assert.deepEqual(order, ["first"]);
  assert.equal(outcomes.stopped, true);
});
