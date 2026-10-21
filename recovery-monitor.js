const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFileSync, spawn } = require("child_process");

const PORT = 5002;

const CONTAINER = "shcom-backend";
let cachedContainerInfo = {
  available: false,
  container: CONTAINER,
  status: "checking",
  restartCount: null,
  health: "unknown",
  database: "unknown",
};

let crashPending = false;
let dbRecoveryPending = false;

const EVENTS_FILE = path.join(__dirname, "recovery-events.json");

function normalizeEvents(items) {
  const uniqueEvents = new Map();

  for (const event of items) {
    if (
      !event ||
      typeof event.type !== "string" ||
      typeof event.timestamp !== "string"
    ) {
      continue;
    }

    const key = `${event.type}|${event.timestamp}`;

    if (!uniqueEvents.has(key)) {
      uniqueEvents.set(key, event);
    }
  }

  return Array.from(uniqueEvents.values())
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() -
        new Date(a.timestamp).getTime()
    )
    .slice(0, 30);
}

function loadEvents() {
  try {
    const savedEvents = JSON.parse(
      fs.readFileSync(EVENTS_FILE, "utf8")
    );

    return Array.isArray(savedEvents)
      ? normalizeEvents(savedEvents)
      : [];
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(
        "[Recovery History] Could not load saved events:",
        error.message
      );
    }

    return [];
  }
}

let events = loadEvents();
if (!fs.existsSync(EVENTS_FILE)) {
  try {
    fs.writeFileSync(EVENTS_FILE, "[]", "utf8");
    console.log("[Recovery History] Initialized event history.");
  } catch (error) {
    console.error(
      "[Recovery History] Could not initialize event history:",
      error.message
    );
  }
}

function addEvent(type, message, timestamp = new Date().toISOString()) {
  events = normalizeEvents([
    { type, message, timestamp },
    ...events,
  ]);

  try {
    fs.writeFileSync(
      EVENTS_FILE,
      JSON.stringify(events, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error(
      "[Recovery History] Could not save event:",
      error.message
    );
  }
}

function reconcileHistoricalDatabaseEvents() {
  try {
    const output = execFileSync(
      "docker",
      [
        "logs",
        "--timestamps",
        "--since",
        "15m",
        CONTAINER,
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    const historicalEvents = [];
    let disconnectTimestamp = null;

    for (const line of output.split(/\r?\n/)) {
      const match = line.match(/^(\S+)\s+(.*)$/);
      if (!match) continue;

      const timestamp = new Date(match[1]);
      if (Number.isNaN(timestamp.getTime())) continue;

      const message = match[2];

      if (message.includes("[Database Recovery] MongoDB disconnected.")) {
        disconnectTimestamp = timestamp.toISOString();

        historicalEvents.push({
          type: "database-disconnected",
          message:
            "MongoDB connection dropped. Automatic reconnection is being attempted.",
          timestamp: disconnectTimestamp,
        });

        continue;
      }

      if (
        disconnectTimestamp &&
        (
          message.includes("[Database Recovery] MongoDB connected successfully.") ||
          message.includes("[Database Recovery] MongoDB connection restored.")
        )
      ) {
        historicalEvents.push({
          type: "database-recovered",
          message: "MongoDB connection restored successfully.",
          timestamp: timestamp.toISOString(),
        });

        disconnectTimestamp = null;
      }
    }

    events = normalizeEvents([...historicalEvents, ...events]);

    fs.writeFileSync(
      EVENTS_FILE,
      JSON.stringify(events, null, 2),
      "utf8"
    );

    console.log(
      `[Recovery History] Reconciled ${historicalEvents.length} historical database events.`
    );
  } catch (error) {
    console.error(
      "[Recovery History] Could not reconcile Docker logs:",
      error.message
    );
  }
}

async function getContainerInfo() {
  const fallback = {
    available: false,
    container: CONTAINER,
    status: "unknown",
    restartCount: null,
    health: "unknown",
    database: "unknown",
  };

  const runDocker = (args, timeout = 5000) =>
    new Promise((resolve, reject) => {
      const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let settled = false;

      const timer = setTimeout(() => {
        child.kill();
        if (!settled) {
          settled = true;
          reject(new Error("Docker command timed out."));
        }
      }, timeout);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });

      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(stderr.trim() || `Docker exited with code ${code}`));
        }
      });
    });

  try {
    const output = await runDocker([
      "inspect",
      "--format",
      "{{.State.Status}}|{{.RestartCount}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}not-configured{{end}}",
      CONTAINER,
    ]);

    const [status, restartCount, health] = output.split("|");
    let database = "unknown";

    if (status === "running") {
      try {
        const healthOutput = await runDocker([
          "exec",
          CONTAINER,
          "node",
          "-e",
          "fetch('http://127.0.0.1:5000/api/health').then(async r => { const d = await r.json(); console.log(d.database || 'unknown'); process.exit(r.ok ? 0 : 1); }).catch(() => process.exit(1))",
        ]);

        database = healthOutput.split(/\r?\n/).pop() || "unknown";
      } catch {
        database = "unknown";
      }
    }

    return {
      available: true,
      container: CONTAINER,
      status,
      restartCount: Number(restartCount),
      health,
      database,
    };
  } catch (error) {
    return {
      ...fallback,
      available: false,
      status: "unavailable",
      health: "unavailable",
      database: "unknown",
      message: error.message,
    };
  }
}

async function waitForBackendHealth({
  timeoutMs = 45000,
  healthProbe = async () => {
    try {
      const response = await fetch("http://127.0.0.1:5000/api/health", {
        signal: AbortSignal.timeout(3000),
      });

      if (!response.ok) {
        return { ok: false, status: response.status };
      }

      const payload = await response.json();

      return {
        ok:
          payload.success === true &&
          payload.status === "healthy" &&
          payload.database === "connected",
        payload,
      };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  },
} = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await healthProbe();

    if (result.ok) {
      return { recovered: true, health: result.payload };
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return { recovered: false, reason: "Health check timed out." };
}

async function recoverBackend(options = {}) {
  const {
    execFn = (command, args, extra = {}) => execFileSync(command, args, extra),
    healthProbe,
    waitTimeoutMs = 45000,
    logger = console,
  } = options;

  const probe =
    healthProbe ||
    (async () => {
      try {
        const response = await fetch("http://127.0.0.1:5000/api/health", {
          signal: AbortSignal.timeout(3000),
        });

        if (!response.ok) {
          return { ok: false, status: response.status };
        }

        const payload = await response.json();

        return {
          ok:
            payload.success === true &&
            payload.status === "healthy" &&
            payload.database === "connected",
          payload,
        };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    });

  try {
    const currentStatus = execFn("docker", [
      "inspect",
      "--format",
      "{{.State.Status}}",
      CONTAINER,
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

    if (currentStatus === "running") {
      const health = await probe();
      if (health.ok) {
        return { recovered: true, started: false, health: health.payload };
      }
    }

    try {
      execFn("docker", ["start", CONTAINER], { stdio: "pipe" });
      logger.log("[Recovery Monitor] Backend container was restarted.");
    } catch (startError) {
      logger.warn(
        `[Recovery Monitor] docker start failed: ${startError.message}. Falling back to docker compose.`
      );
      execFn("docker", ["compose", "up", "-d", "backend"], {
        cwd: __dirname,
        stdio: "pipe",
      });
    }

    const recoveryResult = await waitForBackendHealth({
      timeoutMs: waitTimeoutMs,
      healthProbe: probe,
    });

    if (recoveryResult.recovered) {
      addEvent(
        "recovered",
        "Backend container restarted automatically.",
        new Date().toISOString()
      );
    }

    return recoveryResult;
  } catch (error) {
    logger.error("[Recovery Monitor] Recovery failed:", error.message);
    return { recovered: false, error: error.message };
  }
}

function startDockerEventListener() {
  const listener = spawn("docker", [
    "events",
    "--format",
    "{{json .}}",
    "--filter",
    `container=${CONTAINER}`,
  ]);

  let buffer = "";

  listener.stdout.on("data", (chunk) => {
    buffer += chunk.toString();

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const event = JSON.parse(line);
        const action = event.Action || event.status;
        const timestamp = event.time
          ? new Date(event.time * 1000).toISOString()
          : new Date().toISOString();

        if (action === "die") {
          crashPending = true;
          addEvent(
            "crash",
            "Backend container stopped unexpectedly.",
            timestamp
          );

          recoverBackend().catch((error) => {
            console.error(
              "[Recovery Monitor] Auto-recovery failed after crash:",
              error.message
            );
          });
        }

        if (action === "start" && crashPending) {
          crashPending = false;
          addEvent(
            "recovered",
            "Backend container restarted automatically.",
            timestamp
          );
        }
      } catch {
        // Ignore malformed Docker event lines.
      }
    }
  });

  listener.stderr.on("data", (chunk) => {
    console.log("[DB Listener stderr]", chunk.toString());
    console.error("[Docker Event Listener]", chunk.toString().trim());
  });

  listener.on("error", (error) => {
    console.error("Docker event listener error:", error.message);
  });

  listener.on("close", () => {
    console.log("Docker event listener stopped. Restart the monitor if needed.");
  });
}

function startDatabaseEventListener() {
  const listener = spawn("docker", [
    "logs",
    "--timestamps",
    "--follow",
    "--since",
    "15m",
    CONTAINER,
  ]);

  console.log("[Database Event Listener] Watching backend logs.");

  const processLine = (line) => {
    if (!line.trim()) return;

    const match = line.match(/^(\S+)\s+(.*)$/);
    let message = line;
    let timestamp = new Date().toISOString();

    if (match) {
      message = match[2];
      const parsedTimestamp = new Date(match[1]);

      if (!Number.isNaN(parsedTimestamp.getTime())) {
        timestamp = parsedTimestamp.toISOString();
      }
    }

    if (message.includes("[Database Recovery] MongoDB disconnected.")) {
      if (!dbRecoveryPending) {
        addEvent(
          "database-disconnected",
          "MongoDB connection dropped. Automatic reconnection is being attempted.",
          timestamp
        );
      }

      dbRecoveryPending = true;
      return;
    }

    if (
      message.includes("[Database Recovery] MongoDB connected successfully.") ||
      message.includes("[Database Recovery] MongoDB connection restored.")
    ) {
      if (dbRecoveryPending) {
        addEvent(
          "database-recovered",
          "MongoDB connection restored successfully.",
          timestamp
        );

        dbRecoveryPending = false;
      }
    }
  };

  const createLineHandler = () => {
    let buffer = "";

    const handleChunk = (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      lines.forEach(processLine);
    };

    handleChunk.flush = () => {
      if (buffer.trim()) processLine(buffer);
      buffer = "";
    };

    return handleChunk;
  };

  const stdoutHandler = createLineHandler();
  const stderrHandler = createLineHandler();

  listener.stdout.on("data", stdoutHandler);
  listener.stderr.on("data", stderrHandler);

  listener.on("error", (error) => {
    console.error("[Database Event Listener] Error:", error.message);
  });

  listener.on("close", (code) => {
    stdoutHandler.flush();
    stderrHandler.flush();
    console.log(
      `[Database Event Listener] Stopped with exit code ${code}.`
    );
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (req.method !== "GET" || req.url !== "/api/recovery") {
    res.writeHead(404);
    return res.end(JSON.stringify({ success: false, message: "Not found" }));
  }

  res.writeHead(200);
  res.end(
    JSON.stringify({
      success: true,
      ...await getContainerInfo(),
      events,
    })
  );
});

function startRecoveryMonitor() {
  reconcileHistoricalDatabaseEvents();
  startDockerEventListener();
  startDatabaseEventListener();

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `[Recovery Monitor] Port ${PORT} is already in use on 127.0.0.1. Stop the stale Node process before restarting the recovery monitor.`
      );
      process.exit(1);
    }

    console.error("[Recovery Monitor] Server failed to start:", error.message);
    process.exit(1);
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`SHCom recovery monitor: http://localhost:${PORT}`);
    console.log(`Monitoring Docker container: ${CONTAINER}`);
  });
}

module.exports = {
  addEvent,
  getContainerInfo,
  recoverBackend,
  waitForBackendHealth,
  normalizeEvents,
};

if (require.main === module) {
  startRecoveryMonitor();
}
