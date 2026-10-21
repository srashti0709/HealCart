# SHCom Phase 0 Architecture Lock

Date: 2026-10-21
Project root: D:\SHCom

## 1. Purpose and scope

This document locks the current architecture as it exists in code and runtime checks, without modifying project behavior. It separates the system into three logical layers and records how they depend on each other, what remains independent, and what the end user sees during backend outage conditions.

This architecture is based on:
- [PHASE_0_AUDIT_REPORT.md](D:/SHCom/PHASE_0_AUDIT_REPORT.md)
- [frontend/src/App.jsx](D:/SHCom/frontend/src/App.jsx)
- [frontend/src/pages/Cart.jsx](D:/SHCom/frontend/src/pages/Cart.jsx)
- [frontend/src/pages/Checkout.jsx](D:/SHCom/frontend/src/pages/Checkout.jsx)
- [frontend/src/pages/OrderHistory.jsx](D:/SHCom/frontend/src/pages/OrderHistory.jsx)
- [frontend/src/pages/Dashboard.jsx](D:/SHCom/frontend/src/pages/Dashboard.jsx)
- [backend/src/server.js](D:/SHCom/backend/src/server.js)
- [backend/src/config/db.js](D:/SHCom/backend/src/config/db.js)
- [backend/src/controllers/orderController.js](D:/SHCom/backend/src/controllers/orderController.js)
- [payment-service/src/server.js](D:/SHCom/payment-service/src/server.js)
- [recovery-monitor.js](D:/SHCom/recovery-monitor.js)
- [chaos/chaos-controller.js](D:/SHCom/chaos/chaos-controller.js)
- [docker-compose.yml](D:/SHCom/docker-compose.yml)

## 2. Three-layer architecture

### Layer 1 — Customer Experience

This layer is the user-facing storefront and commerce journey.

Components:
- Frontend app on port 5173 (browser UI, Vite dev app)
- Product catalog and product detail rendering
- Cart and quantity management
- Checkout form and place-order flow
- Order history retrieval
- Dashboard status surface used by operators

Represented by:
- [frontend/src/App.jsx](D:/SHCom/frontend/src/App.jsx)
- [frontend/src/pages/Cart.jsx](D:/SHCom/frontend/src/pages/Cart.jsx)
- [frontend/src/pages/Checkout.jsx](D:/SHCom/frontend/src/pages/Checkout.jsx)
- [frontend/src/pages/OrderHistory.jsx](D:/SHCom/frontend/src/pages/OrderHistory.jsx)
- [frontend/src/pages/Dashboard.jsx](D:/SHCom/frontend/src/pages/Dashboard.jsx)

Primary business responsibilities:
- Display products and inventory state
- Gather cart selections
- Submit checkout and place orders
- Render payment and order status
- Poll service health and recovery state

Dependencies:
- Depends on backend service availability for products, orders, cart validation, and incidents
- Depends on the browser-local cart stored in `localStorage`
- Depends on the backend for order placement and payment verification

User view during backend outage:
- A backend outage will stop product catalog and cart/order API calls from operating.
- The storefront may still render local UI if the page was already loaded, but product lists, checkout, and order history will fail or degrade.
- The frontend does poll backend health and recovery monitor, but it does not independently verify product API health after recovery before displaying healthy state.

### Layer 2 — Commerce + Recovery Services

This layer contains the operational business services that execute e-commerce logic and implement recovery logic.

Components:
- Backend API on port 5000
- Payment service on port 5001
- MongoDB connectivity via `MONGODB_URI`
- Business recovery actions: DB reconnect flow, payment verification, low-stock restock trigger, backend health responses

Represented by:
- [backend/src/server.js](D:/SHCom/backend/src/server.js)
- [backend/src/config/db.js](D:/SHCom/backend/src/config/db.js)
- [backend/src/controllers/orderController.js](D:/SHCom/backend/src/controllers/orderController.js)
- [backend/src/controllers/productController.js](D:/SHCom/backend/src/controllers/productController.js)
- [backend/src/controllers/cartController.js](D:/SHCom/backend/src/controllers/cartController.js)
- [payment-service/src/server.js](D:/SHCom/payment-service/src/server.js)

Critical responsibilities:
- Serve `/api/products`, `/api/cart`, `/api/orders`, `/api/restocks`, and `/api/incidents`
- Enforce stock and validation checks
- Verify payment status and uncertain payment outcomes
- Reconnect MongoDB after disconnect events
- Report health as `healthy` or `degraded`
- Expose chaos and inventory audit endpoints for resilience testing

Dependencies:
- Backend depends on MongoDB connectivity to keep `/api/health` healthy and database-backed read operations available
- Order placement depends on product stock checks and payment verification
- Payment service is an upstream dependency for order payment confirmations, checked by `fetch(`${PAYMENT_SERVICE_URL}/status/:orderId`)`
- Recovery behavior is partially coupled to Docker container state and external database reachability

Single points of failure:
- `MONGODB_URI` is required for the backend to connect; no local MongoDB container is present in [docker-compose.yml](D:/SHCom/docker-compose.yml)
- If the backend process is unavailable, product APIs and order submission fail even though the payment service might remain healthy
- If the payment service is unhealthy, order payment verification can degrade or become uncertain even if the backend is otherwise running

User view during backend outage:
- Product catalog and checkout fail; requests to the backend return connection or health errors
- The frontend may still display cached UI but cannot transact
- The dashboard may surface backend status as `Unavailable` or `Degraded`, but that is not the same as confirming business workflow is restored

### Layer 3 — Independent Control Plane

This layer is logically separate from the commerce runtime, but is not fully independent in practice.

Components:
- Recovery monitor on port 5002
- Chaos controller on port 5003
- Docker event observation and log reconciliation
- Experiment orchestration, active experiment tracking, incident evidence capture
- Health monitoring endpoints and dashboard status sources

Represented by:
- [recovery-monitor.js](D:/SHCom/recovery-monitor.js)
- [chaos/chaos-controller.js](D:/SHCom/chaos/chaos-controller.js)
- [chaos/experiment-history.json](D:/SHCom/chaos/experiment-history.json)
- [recovery-events.json](D:/SHCom/recovery-events.json)
- [frontend/src/pages/Dashboard.jsx](D:/SHCom/frontend/src/pages/Dashboard.jsx)

Primary responsibilities:
- Monitor Docker container status and backend events
- Capture crash/recovery history and database disconnect/reconnect evidence
- Trigger chaos scenarios and validate recovery outcomes
- Record experiments and incidents for dashboard use
- Expose control-plane data to the frontend dashboard

Dependencies:
- Recovery monitor depends on Docker engine access and the backend container name `shcom-backend`
- Chaos controller depends on backend endpoints to trigger crash and database failure scenarios
- Chaos controller also depends on the browser origin check for `http://localhost:5173`, which restricts it from receiving non-browser requests
- Dashboard depends on the recovery monitor and chaos controller endpoints for visualization, not necessarily for the business runtime itself

Important distinction:
- The control plane runs on separate ports (5002, 5003), but that does not mean it is independent from the business runtime.
- The recovery monitor uses Docker and log stream state, so it can still gather container information even when the backend service is down.
- The chaos controller is not truly independent from the backend because it calls `http://127.0.0.1:5000/...` during its experiments and uses the backend’s own processes as the target of failure injection.

Verified independence evidence:
- [recovery-monitor.js](D:/SHCom/recovery-monitor.js) starts a separate Node server on port 5002 and responds even when backend health is degraded.
- [recovery-monitor.js](D:/SHCom/recovery-monitor.js) reads Docker events (`docker events`, `docker logs --follow`) instead of relying on backend API requests.
- [chaos/chaos-controller.js](D:/SHCom/chaos/chaos-controller.js) uses a separate Node server on port 5003 and tracks experiment history without needing the storefront.
- However, the chaos controller’s public endpoints are host/origin gated to `http://localhost:5173` and reject direct non-browser requests with HTTP 403; this makes it less independent than its port suggests.
- The backend is still required for many chaos scenarios because the controller explicitly calls backend URLs such as `http://127.0.0.1:5000/api/chaos/crash`, `http://127.0.0.1:5000/api/chaos/db-failure`, and `http://127.0.0.1:5000/api/chaos/inventory-audit`.

## 3. Component and port mapping

| Component | Type | Port / Access | Dependency notes |
| --- | --- | --- | --- |
| Frontend | Customer UI | Browser, usually 5173 | Calls backend, recovery monitor, and dashboard control-plane endpoints |
| Backend API | Commerce service | 5000 | Requires MongoDB; serves business APIs |
| Payment service | Commerce service | 5001 | Independent process but verifies payment state for orders |
| MongoDB | Data dependency | external `MONGODB_URI` | Not defined as a local Docker service in compose |
| Recovery monitor | Control plane | 5002 | Watches Docker and backend logs; separate from API runtime |
| Chaos controller | Control plane | 5003 | Talks to backend to simulate failures; browser-origin gated |
| Docker runtime | Host dependency | local daemon | Shared infrastructure for recovery monitor and container restart checks |

## 4. Dependency flow

The actual dependency flow is as follows:

1. Customer opens storefront in the browser.
2. Storefront fetches product data from backend `/api/products` and polls `/api/health`.
3. Cart and checkout routes call backend `/api/cart` and `/api/orders`.
4. Order creation in [backend/src/controllers/orderController.js](D:/SHCom/backend/src/controllers/orderController.js) calls the payment service `/pay` and later verifies `/status/:orderId`.
5. The backend depends on MongoDB for data-backed operations and health responses.
6. The recovery monitor watches the backend container and backend logs via Docker, then exposes aggregate status to the frontend.
7. The chaos controller orchestrates experiments, often by hitting backend endpoints that deliberately trigger crash and disconnect behavior.
8. The dashboard reads from both commerce runtime and control-plane endpoints to show the current status.

This means the control plane is not a neutral “sidecar”; it relies on the same runtime under test and on the same host/container environment. It provides evidence, not absolute isolation.

## 5. Verified independence and failure limitations

### Verified independence

The recovery monitor is the strongest example of a partially independent control-plane component because it:
- runs as a separate Node process on port 5002
- reads Docker events directly instead of depending on a backend API for its core signal source
- continues to serve `/api/recovery` even while the backend may be unhealthy or restarted

The chaos controller is also a separate process on port 5003, but there is a hard limitation:
- its control endpoints are not generally callable from outside the browser due to the origin check
- its workflows rely on the backend being present so they can trigger failure and validation logic

### Failure limitations

1. Backend outage remains the main business outage.
   - Customer Experience depends on backend API availability.
   - Even if recovery monitor and chaos controller continue to run, the storefront cannot complete critical actions while the backend is down.

2. Control-plane “independence” is partial, not total.
   - Recovery monitor does not replace the backend; it only observes and coordinates recovery evidence.
   - Chaos controller does not run independent of the backend in the most important scenarios because it triggers backend failure behavior and checks backend endpoints.

3. MongoDB is not independently isolated.
   - The backend expects a configured external MongoDB source, but there is no local MongoDB container in compose.
   - This means the system depends on external database connectivity rather than a fully local self-healing stack.

4. The dashboard can show a healthy status without proving end-user business continuity.
   - It monitors background health indicators, not necessarily the storefront’s actual ability to fetch products or process orders after recovery.

## 6. What the user sees during backend outage

When the backend goes down, the user typically sees:
- product catalog failing to load or refresh
- cart validation failing
- checkout form unable to submit
- order history not loading
- dashboard showing backend as `Unavailable`, `Degraded`, or `Checking`
- recovery monitor possibly continuing to show Docker and restart information even while commerce is offline

The important nuance is that the control plane may remain reachable while the commerce layer is unavailable. In other words:
- control plane health is not equal to storefront service health
- a separate port does not guarantee operational independence from the backend outage itself

## 7. Unresolved questions

1. What is the actual runtime source of MongoDB in this environment: a hosted Atlas cluster, a local service not in compose, or a developer-specific external database?
2. Can the recovery monitor still monitor and record backend state if the backend container is fully absent, not merely unhealthy?
3. Does the chaos controller remain usable when launched outside the browser origin environment, or is it intentionally restricted to a single local frontend workflow?
4. What evidence is needed before the dashboard should call a scenario "successful" beyond HTTP response success?
5. Does the storefront re-verify product API availability immediately after recovery before presenting itself as healthy?

## 8. Existing code/data integrity statement

This architecture document was created without modifying project code, configuration, environment variables, database records, inventory, or Git state. The only new file created for this documentation step is [PHASE_0_ARCHITECTURE.md](D:/SHCom/PHASE_0_ARCHITECTURE.md).

This document should be treated as a structural and operational lock, not as a feature implementation.

## 9. Checks performed and anything not verified

Checks performed during this audit:
- Read-only inspection of [PHASE_0_AUDIT_REPORT.md](D:/SHCom/PHASE_0_AUDIT_REPORT.md)
- Review of frontend layer files for storefront and dashboard behavior
- Review of backend, payment, recovery monitor, and chaos controller implementation
- HTTP checks for:
  - `http://localhost:5000/api/health`
  - `http://localhost:5001/health`
  - `http://localhost:5002/api/recovery`
  - `http://localhost:5003/api/chaos/health`
- Docker inspection via `docker ps` for runtime container state

Not verified during this audit:
- live end-to-end checkout under backend failure conditions
- live payment crash/recovery sequence
- live database disconnect simulation or full recovery under load
- real storefront product API verification immediately after recovery
- control-plane behavior from a non-browser client because the chaos controller restricts access by origin
