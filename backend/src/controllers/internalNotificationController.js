const {
  notifyChaosOutcome,
  notifyServiceRecovered,
} = require("../services/notificationService");

const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;
const SCENARIO_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
const CHAOS_STATUSES = new Set(["passed", "failed", "stopped"]);
const SERVICES = new Set(["backend", "database", "payment-service"]);

const record = async (req, res) => {
  const event = req.body || {};
  if (
    typeof event.eventId !== "string" ||
    !EVENT_ID_PATTERN.test(event.eventId) ||
    typeof event.message !== "string" ||
    !event.message.trim() ||
    event.message.length > 500
  ) {
    return res.status(400).json({ success: false, message: "Invalid event payload." });
  }

  try {
    let result;
    if (event.type === "service_recovered") {
      if (!SERVICES.has(event.service) || event.status !== "recovered") {
        return res.status(400).json({ success: false, message: "Invalid service recovery event." });
      }
      result = await notifyServiceRecovered(event.service, event.message, {
        eventId: event.eventId,
      });
    } else if (event.type === "chaos_outcome") {
      if (
        typeof event.scenario !== "string" ||
        !SCENARIO_PATTERN.test(event.scenario) ||
        !CHAOS_STATUSES.has(event.status)
      ) {
        return res.status(400).json({ success: false, message: "Invalid experiment outcome." });
      }
      result = await notifyChaosOutcome(
        event.scenario,
        event.status,
        event.message,
        { eventId: event.eventId }
      );
    } else {
      return res.status(400).json({ success: false, message: "Unsupported event type." });
    }

    return res.status(201).json({
      success: true,
      duplicate: Boolean(result?.duplicate),
    });
  } catch (error) {
    console.error("Failed to persist internal admin notification:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to persist notification.",
    });
  }
};

module.exports = { record };
