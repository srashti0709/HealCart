const notifyChaosOutcome = async (scenario, status, message, options = {}) => {
  return { duplicate: false };
};

const notifyServiceRecovered = async (service, message, options = {}) => {
  return { duplicate: false };
};

module.exports = {
  notifyChaosOutcome,
  notifyServiceRecovered,
};
