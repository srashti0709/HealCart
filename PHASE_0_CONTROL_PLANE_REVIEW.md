# SHCom Phase 0 Control Plane Independence Review

Date: 2026-10-21
Project root: D:\SHCom

This review reads the existing architecture and audit artifacts first:
- [PHASE_0_AUDIT_REPORT.md](D:/SHCom/PHASE_0_AUDIT_REPORT.md)
- [PHASE_0_ARCHITECTURE.md](D:/SHCom/PHASE_0_ARCHITECTURE.md)
- [frontend/src/App.jsx](D:/SHCom/frontend/src/App.jsx)
- [frontend/src/pages/Dashboard.jsx](D:/SHCom/frontend/src/pages/Dashboard.jsx)
- [recovery-monitor.js](D:/SHCom/recovery-monitor.js)
- [chaos/chaos-controller.js](D:/SHCom/chaos/chaos-controller.js)
- [backend/src/server.js](D:/SHCom/backend/src/server.js)
- [docker-compose.yml](D:/SHCom/docker-compose.yml)

This document stays within safe, read-only checks and does not trigger crash, payment, or destructive experiments.

## 1. Executive summary

The control plane is partially independent from the commerce runtime, but it is not fully independent in operational practice.

Verified facts:
- The recovery monitor runs as a separate Node HTTP server on port 5002 and exposes `/api/recovery`.
- The recovery monitor collects Docker state and backend container logs, not backend API data, for its core runtime signals.
- The chaos controller runs as a separate Node HTTP server on port 5003 and records experiment history on a separate file.
- The chaos controller is not a public control API; it is origin-gated to `http://localhost:5173` and returns HTTP 403 to non-browser requests.
- The dashboard can read recovery-monitor output even when the backend is degraded, but it cannot meaningfully confirm storefront continuity without validating the actual product API or customer journey.

Important limitation:
- A separate port does not prove real independence. The chaos controller depends on backend endpoints to trigger failure and to validate recovery, and the dashboard depends on backend health data for business-status interpretation.

## 2. Monitoring endpoints that work when the backend is unavailable

### 2.1 Recovery monitor: designed to continue working independently

Verified by code and runtime behavior:
- [recovery-monitor.js](D:/SHCom/recovery-monitor.js) creates its own HTTP server on port 5002.
- The server answers `GET /api/recovery` with status, container info, restart count, health, database state, and recorded events.
- The response is built from `getContainerInfo()` and `events`, not from calls into the backend service.
- The monitor calls Docker commands such as `docker inspect`, `docker logs --timestamps --follow`, and `docker events`.

Relevant code evidence:
- `const PORT = 5002;`
- `server.listen(PORT, "127.0.0.1", ...)`
- `getContainerInfo()` calls `docker inspect ... shcom-backend`
- `startDatabaseEventListener()` calls `docker logs --timestamps --follow --since 15m shcom-backend`
- `startDockerEventListener()` uses `docker events --filter container=shcom-backend`

Current safe read-only evidence:
- `GET http://localhost:5002/api/recovery` returned HTTP 200 during the audit.
- The payload included `available: true`, `container: "shcom-backend"`, `status: "running"`, `restartCount: 2`, `health: "healthy"`, and `database: "connected"`.

Conclusion:
- The recovery monitor is the control-plane component that is most likely to remain operational when the backend is unavailable, because it is rooted in Docker state rather than backend API state.
- This is a verified code fact and current runtime fact, not a claim that it was tested under a real backend outage during the audit.

### 2.2 Chaos controller: not generally available outside browser origin

Verified by code and runtime evidence:
- [chaos/chaos-controller.js](D:/SHCom/chaos/chaos-controller.js) restricts requests by origin:
  - `if (req.headers.origin !== FRONTEND_ORIGIN) { ... 403 ... }`
  - `const FRONTEND_ORIGIN = "http://localhost:5173";`
- Safe read-only checks to `http://localhost:5003/api/chaos/health` and `http://localhost:5003/api/chaos/diagnostics` returned HTTP 403 because the request was not a localhost:5173 browser request.

Conclusion:
- The chaos controller does not provide a general-purpose monitoring API for independent probes.
- It is designed for the browser-based frontend and is deliberately restricted.
- It does not validate as an independently accessible control endpoint from raw scripts or external monitoring tools.

### 2.3 Dashboard endpoints during backend outage

Verified by code:
- [frontend/src/pages/Dashboard.jsx](D:/SHCom/frontend/src/pages/Dashboard.jsx) calls:
  - `GET ${API_BASE_URL}/api/health`
  - `GET http://localhost:5002/api/recovery`
  - `GET ${API_BASE_URL}/api/incidents`
- The dashboard’s backend health and incident checks are therefore coupled to the backend API.

What the dashboard can show if the backend is down:
- It can still show recovery-monitor data because that endpoint is separate and port 5002 is independent.
- It cannot reliably show real backend incident records or live commerce health because `checkIncidents()` and `checkBackendHealth()` depend on the backend.
- The code catches errors and sets messages such as `Unable to load incidents from the backend.` and `Backend API is unavailable.`

Conclusion:
- The dashboard can display some control-plane state during a backend outage, but it cannot present a full or accurate operational status of the customer-facing commerce layer without backend access.

## 3. Whether the recovery monitor depends on the backend or Docker

### Recovery monitor dependency summary

It depends primarily on Docker and local container state:
- Docker event listener: `spawn("docker", ["events", "--format", "{{json .}}", "--filter", `container=${CONTAINER}`])`
- Docker log watcher: `spawn("docker", ["logs", "--timestamps", "--follow", "--since", "15m", CONTAINER])`
- Docker inspect for container state: `docker inspect --format "{{.State.Status}}|{{.RestartCount}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}not-configured{{end}}" shcom-backend`

It does not call `/api/health` as its main source of truth.
- The server’s public `/api/recovery` response is built from container inspection and captured events.
- The recovery logic in `recoverBackend()` does probe the backend health endpoint, but that is optional recovery validation logic, not the core monitor dependency path.

Conclusion:
- The recovery monitor depends on Docker and the container runtime. It does not require the backend HTTP API to keep itself alive or to supply core operational signals.
- It does require the container name `shcom-backend` to exist and be visible to Docker.

## 4. Whether the chaos controller can detect recovery and return accurate results

### 4.1 What it tries to detect

The chaos controller implements recovery verification for multiple scenarios:
- `waitForRestart(previousRestartCount, previousStartedAt)` for backend crash recovery
- `verifyDatabaseRecovery()` for DB reconnect validation
- payment recovery loop for `payment-service-recovery`
- inventory integrity audit for read-only validation

Relevant logic:
- `waitForRestart()` checks container status and backend health until the restart is visible and `/api/health` becomes `healthy` with `database === "connected"`.
- `verifyDatabaseRecovery()` polls `/api/health` and then `/api/chaos/db-check` for the database to come back and return a successful read.
- `payment-service-recovery` checks `docker inspect` and `GET http://127.0.0.1:5001/health` until the payment service restarts and passes health.

### 4.2 What it can and cannot guarantee

What it can detect with code:
- process/container restart
- backend health status return to healthy
- database connection health
- payment service health
- inventory audit success/failure based on read-only checks

What it does not guarantee:
- end-to-end storefront health after recovery
- checkout flow viability after a simulated outage
- product API continuity after a backend restart without explicit checks
- actual customer-facing business success when the control plane emits a success response

This is supported by the earlier audit findings and by the implementation itself:
- the dashboard status logic is not a full business verification layer
- the `Run All` logic treats HTTP success as pass criteria while not confirming product operations
- there is no verified post-recovery storefront product API check in the frontend app

Conclusion:
- The chaos controller can detect many technical recovery signals, but it is not an accurate indicator of real customer-facing service continuity.
- It is a useful control-plane interpreter, not a business-success validator.

## 5. Origin restrictions and authentication protections

### 5.1 Origin restriction on chaos controller

Verified in code:
- `FRONTEND_ORIGIN = "http://localhost:5173"`
- The server rejects requests when `req.headers.origin !== FRONTEND_ORIGIN`
- This is a hard browser-only gate, not a token-based security system.

Observed safe read-only runtime evidence:
- HTTP checks against the chaos controller from a non-browser client returned HTTP 403.

Result:
- This is protection against arbitrary external automation, but it is not strong auth.
- It is a trust-by-origin control and is therefore brittle and environment-specific.

### 5.2 Token-based protection on specific experiment endpoints

Verified in code:
- [backend/src/server.js](D:/SHCom/backend/src/server.js) requires `CHAOS_TEST_TOKEN` and compares an `x-chaos-token` header against `process.env.CHAOS_TEST_TOKEN` before allowing `POST /api/chaos/crash` and `POST /api/chaos/db-failure`.
- [chaos/chaos-controller.js](D:/SHCom/chaos/chaos-controller.js) also checks for `CHAOS_TEST_TOKEN` before it triggers backend experiments, and throws if the token is absent.

Important nuance:
- The token is an environment secret and is not a general user-auth mechanism.
- It protects the backend from unauthorized crash requests, but does not protect the chaos controller from browser-only callers when the origin is valid.

Conclusion:
- The experiment endpoints are protected by a combination of origin restriction and a shared token, but the protection is local, narrow, and not equivalent to production authentication or authorization.

## 6. Whether the dashboard can display real incident status during backend outage

### Verified code behavior

The dashboard has two coupled categories of status:
1. commerce status derived from backend APIs
2. control-plane status derived from recovery monitor endpoints

In [frontend/src/pages/Dashboard.jsx](D:/SHCom/frontend/src/pages/Dashboard.jsx):
- `checkBackendHealth()` requests `${API_BASE_URL}/api/health`
- `checkRecoveryMonitor()` requests `http://localhost:5002/api/recovery`
- `checkIncidents()` requests `${API_BASE_URL}/api/incidents`
- `refreshAllStatuses()` calls all three in parallel

If the backend is unavailable:
- `checkBackendHealth()` sets `healthError = "Backend API is unavailable."`
- `checkIncidents()` catches the error and sets `incidentsError = "Unable to load incidents from the backend."`
- `checkRecoveryMonitor()` can still succeed and supply control-plane data from port 5002

Therefore:
- The dashboard can display a recovery-monitor status and a backend-down signal.
- It can also display an incident-loading failure message.
- It cannot show real commerce incident status or business continuity status if the backend is unavailable.

This is a real limitation, not a code bug alone. The dashboard does not verify the storefront’s actual product API continuity after recovery.

## 7. Dependency summary

### Business critical path
- Frontend -> Backend -> MongoDB
- Frontend -> Backend -> Payment service
- Backend -> Product reads and writes
- Backend -> Order validation and payment verification

### Control-plane path
- Recovery monitor -> Docker daemon -> backend container and logs
- Chaos controller -> backend and payment service endpoints -> recovery checks
- Dashboard -> recovery monitor + backend + incidents

### Shared dependency
- Both layers rely on the same host environment and the same Docker runtime.
- The control plane is not a completely separate island; it monitors and interacts with the same runtime it is trying to manage.

## 8. Verified findings

1. The recovery monitor is the most independent control-plane component because it is Docker-driven and does not primarily depend on the backend API. Verified by code and by the live 5002 response.
2. The chaos controller is intentionally restricted to local browser origin access and returns 403 to non-browser requests. Verified by code and by the safe read-only probe.
3. The dashboard can show recovery-monitor information even while backend health is down, but it cannot accurately report full business-availability status without a backend and product-API check. Verified by code path analysis.
4. The control plane’s protection model is not production-grade authentication. It is origin gating plus a shared token for some endpoints. Verified by code.
5. The command and infrastructure surface are separated by port, but the control plane is still coupled to the same Docker host and backend lifecycle it is trying to observe. Verified by code and architecture review.

## 9. Failure risks

1. Control-plane blindness to real storefront impact.
   - Recovery status can look healthy while storefront product APIs are not functioning because the dashboard does not explicitly verify the product API after recovery.

2. False confidence from “technical success”.
   - A service can show healthy container state and recover without proving the user-facing workflow works.

3. Port-based independence is misleading.
   - Separate ports do not equal separate failure domains.

4. Origin restriction reduces automation and observability.
   - It makes non-browser monitoring and remote health checks harder, which can make operational control less robust.

5. Shared host and Docker runtime create common-mode dependency.
   - If the Docker host or shared environment is unhealthy, both business services and control-plane services can degrade together.

## 10. Highest-priority improvements

1. Add explicit storefront product API verification after recovery.
   - Do not treat backend health as equivalent to storefront health.
   - Confirm real product reads and business operations after a recovery event.

2. Decouple “technical recovery” from “business recovery” in the dashboard.
   - Show a distinct business-status indicator for product/API continuity and order validity, not just container health.

3. Replace origin-only gatekeeping with a documented and explicit operational mechanism for control-plane access.
   - Keep the local browser use case, but add a separate, justified operational path with traceable authorization and clear scope.

## 11. Unverified areas

The following were not executed as part of this review because the rules prohibit destructive or crash-triggering actions:
- live backend outage simulation
- live chaos-controller experiment execution
- live payment service failure/recovery sequence
- live database disconnect simulation
- full end-to-end storefront validation during a real outage

Those remain unverified by safe read-only testing, and they should be treated as code-based conclusions rather than live system proof.

## 12. Conclusion

The control plane is partially independent but not fully independent.

The strongest verified fact is this: the recovery monitor is capable of monitoring Docker and container recovery independently of the backend HTTP API, while the chaos controller is a constrained, browser-gated experiment runner that depends on the backend for meaningful recovery checks and validation.

The practical risk is not whether ports are separate; the risk is whether the dashboard and control plane can show actual user-facing recovery. The current code does not fully prove that.

This review was performed without modifying code, configuration, environment files, database state, or inventory. The review created this document only.
