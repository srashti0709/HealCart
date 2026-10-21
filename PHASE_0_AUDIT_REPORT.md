# SHCom Phase 0 Audit Report

Date: 2026-10-21
Project root: D:\SHCom

## 1. Architecture Summary

The project is a multi-service storefront and resilience lab built around a React frontend and multiple Node/Express services:

- Frontend: [frontend/src/App.jsx](D:/SHCom/frontend/src/App.jsx), [frontend/src/pages/Cart.jsx](D:/SHCom/frontend/src/pages/Cart.jsx), [frontend/src/pages/Checkout.jsx](D:/SHCom/frontend/src/pages/Checkout.jsx), [frontend/src/pages/OrderHistory.jsx](D:/SHCom/frontend/src/pages/OrderHistory.jsx), [frontend/src/pages/Dashboard.jsx](D:/SHCom/frontend/src/pages/Dashboard.jsx)
- Backend API: [backend/src/server.js](D:/SHCom/backend/src/server.js)
- Product/order/cart/restock APIs: [backend/src/routes/productRoutes.js](D:/SHCom/backend/src/routes/productRoutes.js), [backend/src/routes/orderRoutes.js](D:/SHCom/backend/src/routes/orderRoutes.js), [backend/src/routes/cartRoutes.js](D:/SHCom/backend/src/routes/cartRoutes.js), [backend/src/routes/restockRoutes.js](D:/SHCom/backend/src/routes/restockRoutes.js)
- Payment service: [payment-service/src/server.js](D:/SHCom/payment-service/src/server.js)
- Recovery monitor: [recovery-monitor.js](D:/SHCom/recovery-monitor.js)
- Chaos controller: [chaos/chaos-controller.js](D:/SHCom/chaos/chaos-controller.js)
- Database bootstrap: [backend/src/config/db.js](D:/SHCom/backend/src/config/db.js)
- Docker config: [docker-compose.yml](D:/SHCom/docker-compose.yml)

Observed runtime shape:
- Frontend is a Vite app on port 5173 in normal browser use.
- Backend container is running on port 5000 and reports healthy via `/api/health`.
- Payment service is running on port 5001 and reports healthy via `/health`.
- Recovery monitor is running on port 5002 and exposes `/api/recovery`.
- Chaos controller is present on port 5003, but its endpoints are origin-gated to `http://localhost:5173` and reject non-browser calls with HTTP 403.
- MongoDB is configured through `MONGODB_URI` in the backend environment, but no local MongoDB service is defined in [docker-compose.yml](D:/SHCom/docker-compose.yml). The backend runtime is currently reporting the database as connected, which strongly suggests external MongoDB connectivity rather than a local Docker container.

## 2. Feature Status by Area

### 2.1 E-commerce features

| Feature | Status | Evidence |
| --- | --- | --- |
| Product catalog API | VERIFIED | [backend/src/routes/productRoutes.js](D:/SHCom/backend/src/routes/productRoutes.js) exposes `GET /api/products`; [backend/src/controllers/productController.js](D:/SHCom/backend/src/controllers/productController.js) implements fetching and CRUD. Frontend storefront loads products via `fetchProducts()` in [frontend/src/App.jsx](D:/SHCom/frontend/src/App.jsx). |
| Product detail page | VERIFIED | Product detail route exists in [frontend/src/App.jsx](D:/SHCom/frontend/src/App.jsx), and the product detail component is present in [frontend/src/pages/ProductDetails.jsx](D:/SHCom/frontend/src/pages/ProductDetails.jsx). |
| Cart behavior | VERIFIED | [frontend/src/pages/Cart.jsx](D:/SHCom/frontend/src/pages/Cart.jsx) validates items, updates quantities, and enforces stock caps. [backend/src/controllers/cartController.js](D:/SHCom/backend/src/controllers/cartController.js) validates cart payloads server-side with object id and quantity checks. |
| Checkout flow | IMPLEMENTED — NOT FULLY VERIFIED | [frontend/src/pages/Checkout.jsx](D:/SHCom/frontend/src/pages/Checkout.jsx) posts checkout data to `/api/orders` and clears local cart on success. Server-side payment orchestration is implemented in [backend/src/controllers/orderController.js](D:/SHCom/backend/src/controllers/orderController.js), but this audit did not perform an end-to-end live checkout and therefore cannot confirm the full transaction chain under real conditions. |
| Order history | VERIFIED | [backend/src/routes/orderRoutes.js](D:/SHCom/backend/src/routes/orderRoutes.js) exposes orders; [frontend/src/pages/OrderHistory.jsx](D:/SHCom/frontend/src/pages/OrderHistory.jsx) fetches and renders them from the API. |
| Inventory validation and stock checks | VERIFIED | Stock checks are enforced both in frontend add-to-cart logic and server-side order creation in [backend/src/controllers/orderController.js](D:/SHCom/backend/src/controllers/orderController.js). Low-stock restock detection is implemented in the same file. |
| Automatic restock requests | IMPLEMENTED — NOT FULLY VERIFIED | `requestLowStockRestocks()` and the restock endpoints exist in [backend/src/controllers/orderController.js](D:/SHCom/backend/src/controllers/orderController.js) and [backend/src/routes/restockRoutes.js](D:/SHCom/backend/src/routes/restockRoutes.js), but the live restock lifecycle was not triggered during this audit. |

### 2.2 Service and infrastructure status

| Service | Status | Evidence |
| --- | --- | --- |
| Backend (5000) | VERIFIED | HTTP check: `GET http://localhost:5000/api/health` returned HTTP 200 with `{"success":true,"service":"backend","status":"healthy","database":"connected"}`. |
| Payment service (5001) | VERIFIED | HTTP check: `GET http://localhost:5001/health` returned HTTP 200 with `{"success":true,"service":"payment-service","status":"healthy"}`. |
| Recovery monitor (5002) | VERIFIED | HTTP check: `GET http://localhost:5002/api/recovery` returned HTTP 200 with `{"success":true,"available":true,"container":"shcom-backend","status":"running","restartCount":2,"health":"healthy","database":"connected"}`. |
| Chaos controller (5003) | IMPLEMENTED — NOT FULLY VERIFIED | The server exists in [chaos/chaos-controller.js](D:/SHCom/chaos/chaos-controller.js), but direct HTTP checks from curl receive HTTP 403 because the controller enforces `Origin === http://localhost:5173`. This is a browser-only safety gate, not a general external API. |
| MongoDB | VERIFIED (configured); MISSING as local container | `backend/.env` contains a configured `MONGODB_URI` key, and backend health reports `database":"connected"`. However, `docker ps` shows only `shcom-backend` and `shcom-payment-service`; no MongoDB container appears in [docker-compose.yml](D:/SHCom/docker-compose.yml). |

### 2.3 Recovery and resilience features

| Capability | Status | Evidence |
| --- | --- | --- |
| Backend crash detection and restart | VERIFIED | [recovery-monitor.js](D:/SHCom/recovery-monitor.js) listens to Docker events and logs `crash`/`recovered` events. Recovery monitor response includes `events` with `type: "crash"` and `"recovered"`. |
| Database disconnect/reconnect detection | VERIFIED | [backend/src/config/db.js](D:/SHCom/backend/src/config/db.js) registers connection listeners and retry logic. [recovery-monitor.js](D:/SHCom/recovery-monitor.js) reconciles backend log lines for `MongoDB disconnected` / `connected successfully`. |
| Payment recovery simulation | IMPLEMENTED — NOT FULLY VERIFIED | [chaos/chaos-controller.js](D:/SHCom/chaos/chaos-controller.js) contains a payment crash/recovery scenario and a health-check loop. The actual crash/recovery sequence was not executed as part of this audit. |
| Inventory audit | VERIFIED | [backend/src/server.js](D:/SHCom/backend/src/server.js) exposes `GET /api/chaos/inventory-audit`; the endpoint validates non-negative integer stock and non-negative price values. The controller also records experiment outcomes in [chaos/chaos-controller.js](D:/SHCom/chaos/chaos-controller.js). |
| Payment timeout / uncertain response recovery | VERIFIED | [backend/src/controllers/orderController.js](D:/SHCom/backend/src/controllers/orderController.js) explicitly verifies payments via `/status/:orderId` when the first response is uncertain and records a recovery incident. |

### 2.4 Dashboard behaviour

| Dashboard feature | Status | Evidence |
| --- | --- | --- |
| Button-to-API flows | VERIFIED | [frontend/src/pages/Dashboard.jsx](D:/SHCom/frontend/src/pages/Dashboard.jsx) calls `/api/chaos/backend-crash`, `/api/chaos/database-recovery`, `/api/chaos/payment-service-recovery`, and `/api/chaos/inventory-integrity` from buttons and waits for JSON results. |
| Run All | IMPLEMENTED — NOT FULLY VERIFIED | `runAllScenarios()` loops across all four endpoints and records statuses in `runAllResults`. However, the check is only `response.ok && data.success === true && data.recovered !== false`; it is not a deep verification of real post-scenario business state. |
| Status accuracy | BROKEN OR MISLEADING | The dashboard status text is derived from HTTP availability and health values. It does not guarantee that the business workflow (e.g., product API after backend restart, existing cart/order lifecycle) still works after the simulated outage. |
| Event logging | VERIFIED | [recovery-monitor.js](D:/SHCom/recovery-monitor.js) writes events to `recovery-events.json` and normalizes them. [chaos/chaos-controller.js](D:/SHCom/chaos/chaos-controller.js) also records experiment history in `chaos/experiment-history.json`. |
| Error handling | IMPLEMENTED — NOT FULLY VERIFIED | Input validation and UI fallbacks exist, but the audit did not trigger all error paths; the code is present but not necessarily resilient under all real recovery cases. |

### 2.5 Storefront behaviour

| Storefront feature | Status | Evidence |
| --- | --- | --- |
| Health polling | VERIFIED | [frontend/src/App.jsx](D:/SHCom/frontend/src/App.jsx) polls `http://localhost:5000/api/health` every 3 seconds and updates UI status. |
| Recovery status display | VERIFIED | The storefront includes `fetchRecoveryInfo()` and displays recovery monitor container information from `http://localhost:5002/api/recovery`. |
| Real post-recovery product API verification | MISSING | The app checks backend health and fetches products on first render, but there is no explicit post-recovery product verification after a crash, disconnect, or payment outage. It does not re-validate `GET /api/products` immediately after recovery before showing a healthy storefront state. |

## 3. Verification Evidence Collected

Read-only checks performed during this audit:

- `GET http://localhost:5000/api/health` -> HTTP 200, backend healthy, database connected.
- `GET http://localhost:5001/health` -> HTTP 200, payment healthy.
- `GET http://localhost:5002/api/recovery` -> HTTP 200, recovery monitor available, container running, restart count 2, database connected.
- `GET http://localhost:5003/api/chaos/health` -> HTTP 403, because the controller enforces a local origin check.
- `docker ps --format '{{.Names}}|{{.Status}}|{{.Ports}}'` -> only `shcom-backend` and `shcom-payment-service` are running. No MongoDB container is present.
- Environment key inspection showed `MONGODB_URI` and `CHAOS_TEST_TOKEN` are configured in the backend environment, with secret values masked in the audit output.

## 4. Misleading or Risky Behaviours

1. The dashboard can display a service as healthy based on `/api/health` alone, without proving that the storefront’s real product API is still usable after recovery.
2. The chaos controller is intentionally browser-only (`Origin === http://localhost:5173`), so any non-browser check gets HTTP 403. This is safe but can make the service appear unavailable when called from a script or external probe.
3. `Run All` treats a response as “passed” when HTTP is okay and `data.success===true`; in practice, some scenarios may pass the transport layer while still not re-establishing real business functionality.
4. Recovery monitoring uses Docker restart count and backend health, but it does not independently verify that product inventory queries and checkout flows continue to work after a simulated outage.
5. The project still relies on a configured external MongoDB URI rather than a local compose-managed database, which can create drift between local startup assumptions and real deployment behavior.

## 5. Missing Capabilities

- No explicit, automated verification that the storefront can fetch product inventory immediately after backend or DB recovery.
- No local MongoDB container in the compose setup, despite the backend expecting a database connection.
- No documented and enforced end-to-end smoke test for checkout, order creation, and payment confirmation together.
- No robust rollback or idempotency protection when a payment or order result is uncertain.
- No production-grade health gate that confirms both system health and business-task health for the storefront.

## 6. Top Five Fixes in Priority Order

1. Add a deterministic end-to-end product API recovery check after every simulated outage. Do not treat `backend health = healthy` as sufficient; verify `GET /api/products` and a product read immediately after recovery.
2. Remove or clarify the misleading Run All semantics. The dashboard should show per-scenario pass/fail based on real business verification, not only HTTP success.
3. Add a local MongoDB service and startup dependency to the compose workflow, or clearly separate dev/test and hosted-DB runtime assumptions in documentation. Avoid hidden dependence on external credentials.
4. Add explicit payment/order reconciliation and idempotency rules for uncertain payment outcomes. That is the highest-risk area in order creation logic.
5. Harden the chaos controller with a clear separation between browser-only control and legitimate operational probes, and document which endpoints are intended for local dev only versus real monitoring.

## 7. Audit Conclusion

The system contains real implementation of storefront, backend, payment, and recovery flows, and the live HTTP checks confirm that the backend, payment service, and recovery monitor are currently running and healthy. However, several resilience and dashboard features are implemented as control-plane checks rather than end-to-end business verification. The strongest risk is not the absence of code; it is the gap between simulated success and real user-facing workflow continuity.

Status summary:
- Verified live and responsive: backend, payment service, recovery monitor.
- Verified code-level flows: products, cart, order history, stock validation, database recovery logic.
- Not fully proven live: checkout, payment recovery, restock lifecycle, Run All dashboard validation, storefront post-recovery product verification.
- Missing or misleading: local MongoDB service definition, robust business verification after recovery, and explicit post-recovery product API checks.

## 8. Existing Code/Data Integrity Statement

This audit did not modify source code, configuration, environment variables, database contents, or runtime state. The only file created by this audit is this report: [PHASE_0_AUDIT_REPORT.md](D:/SHCom/PHASE_0_AUDIT_REPORT.md). The repo state was checked before and after the audit and no code files were edited beyond this report.

Anything that could not be verified during this audit:
- End-to-end live checkout and payment under simulated failure conditions.
- Full lifecycle verification of low-stock restock orders and delivery confirmation under real traffic.
- A fully independent check of the chaos controller from a non-browser environment because of the enforced origin restriction.
