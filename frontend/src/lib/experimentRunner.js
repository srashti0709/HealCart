export async function runSequentialExperiments(
  scenarios,
  runScenario,
  { shouldStop = () => false, onProgress = () => {}, onResult = () => {}, afterScenario = async () => {} } = {}
) {
  const results = [];
  let stopped = false;

  for (const scenario of scenarios) {
    if (shouldStop()) {
      stopped = true;
      break;
    }

    onProgress(scenario);
    let result;
    try {
      const outcome = await runScenario(scenario);
      result = { scenario, status: "passed", message: outcome?.message || "Completed." };
    } catch (error) {
      result = {
        scenario,
        status: "failed",
        message: error.response?.data?.message || error.message || "Scenario failed.",
      };
    }

    results.push(result);
    onResult(result);
    await afterScenario(scenario, result);
  }

  return { results, stopped };
}
