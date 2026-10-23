const fs = require("fs");
const path = require("path");

function getServiceToken() {
  if (process.env.CHAOS_TEST_TOKEN) return process.env.CHAOS_TEST_TOKEN;

  try {
    const envPath = path.join(__dirname, "..", "backend", ".env");
    const tokenLine = fs
      .readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .find((line) => line.startsWith("CHAOS_TEST_TOKEN="));
    return tokenLine?.slice("CHAOS_TEST_TOKEN=".length).trim() || null;
  } catch {
    return null;
  }
}

async function publishAdminNotification(event, options = {}) {
  const token = options.token || getServiceToken();
  if (!token) {
    console.warn("[Admin Notifications] Service token is not configured.");
    return false;
  }

  const backendUrl = (
    options.backendUrl || process.env.SHCOM_BACKEND_URL || "http://127.0.0.1:5000"
  ).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl || fetch;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetchImpl(`${backendUrl}/api/internal/notifications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-chaos-token": token,
        },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) return true;

      if (response.status < 500 || attempt === 2) {
        console.error(
          "[Admin Notifications] Backend rejected an operational event:",
          response.status
        );
        return false;
      }
    } catch (error) {
      if (attempt === 2) {
        console.error(
          "[Admin Notifications] Could not publish an operational event:",
          error.message
        );
        return false;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
  }

  return false;
}

module.exports = { publishAdminNotification };
