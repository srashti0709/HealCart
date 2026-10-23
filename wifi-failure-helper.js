const http = require("node:http");
const { execFile, execFileSync } = require("node:child_process");

const HOST = "127.0.0.1";
const PORT = 5004;
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
]);

let injectionRunning = false;

function isAdministrator() {
  try {
    execFileSync("fltmc.exe", [], { stdio: "ignore", windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function sendJson(response, statusCode, payload, origin) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...(origin && ALLOWED_ORIGINS.has(origin)
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          Vary: "Origin",
        }
      : {}),
  });
  response.end(statusCode === 204 ? undefined : JSON.stringify(payload));
}

const server = http.createServer((request, response) => {
  const origin = request.headers.origin;

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    sendJson(response, 403, { success: false, message: "Origin is not allowed." });
    return;
  }

  if (request.method === "OPTIONS" && request.url === "/inject") {
    sendJson(response, 204, {}, origin);
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { success: true, service: "SHCom Wi-Fi Failure Helper", administrator: isAdministrator() }, origin);
    return;
  }

  if (request.method !== "POST" || request.url !== "/inject") {
    sendJson(response, 404, { success: false, message: "Endpoint not found." }, origin);
    return;
  }

  if (!isAdministrator()) {
    sendJson(response, 403, {
      success: false,
      message: "The Wi-Fi helper must be started from an Administrator terminal. Restart VS Code as Administrator and run it again.",
    }, origin);
    return;
  }

  if (injectionRunning) {
    sendJson(response, 409, { success: false, message: "A Wi-Fi failure is already running." }, origin);
    return;
  }

  injectionRunning = true;

  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$adapter = Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' -and (($_.Name -match '(?i)wi-?fi|wireless|wlan') -or ($_.InterfaceDescription -match '(?i)wireless|wi-?fi|802\\.11|wlan')) } | Select-Object -First 1",
    "if (-not $adapter) { throw 'No active Wi-Fi adapter was found. Check the adapter name in Windows Network Connections.' }",
    "$adapterName = $adapter.Name",
    "$disabled = $false",
    "try {",
    "  Disable-NetAdapter -Name $adapterName -Confirm:$false -ErrorAction Stop",
    "  $disabled = $true",
    "  Start-Sleep -Seconds 5",
    "} finally {",
    "  if ($disabled) { Enable-NetAdapter -Name $adapterName -Confirm:$false -ErrorAction Stop }",
    "}",
    "Write-Output ('Wi-Fi adapter restored: ' + $adapterName)",
  ].join("\n");

  execFile(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    { timeout: 30000, windowsHide: true, maxBuffer: 1024 * 1024 },
    (error, stdout, stderr) => {
      injectionRunning = false;

      if (error) {
        sendJson(response, 500, {
          success: false,
          message: (stderr || error.message || "Wi-Fi failure injection failed.").trim(),
        }, origin);
        return;
      }

      sendJson(response, 200, {
        success: true,
        message: "Wi-Fi was disabled for at least 5 seconds and the adapter was re-enabled.",
        details: stdout.trim(),
      }, origin);
    }
  );
});

server.listen(PORT, HOST, () => {
  console.log(`SHCom Wi-Fi Failure Helper listening at http://${HOST}:${PORT}`);
  console.log("Keep this terminal open while testing. The helper requires Administrator permission.");
});

server.on("error", (error) => {
  console.error("Could not start SHCom Wi-Fi Failure Helper:", error.message);
  process.exitCode = 1;
});
