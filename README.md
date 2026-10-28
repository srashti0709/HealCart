# HealCart — Self-Healing E-Commerce Platform

HealCart is a full-stack e-commerce application designed to demonstrate **self-healing software systems**. It combines a shopping experience with automated failure detection, recovery mechanisms, and a dedicated Chaos Center for monitoring system health and testing resilience.

The project explores how an e-commerce platform can respond to unexpected failures, recover services, preserve important transaction data, and provide users with clear feedback instead of leaving the application in an inconsistent state.

## Key Features

- **Self-Healing Architecture:** Detects service failures and supports automated recovery workflows.
- **Chaos Center Dashboard:** Monitors services, incidents, experiments, and recovery activity.
- **Backend Crash Recovery:** Demonstrates backend failure detection and recovery through Docker-based service management.
- **Offline Recovery:** Supports recovery of checkout drafts when the backend is unavailable, allowing users to retain their pending checkout information for later recovery.
- **Payment Service Recovery:** Demonstrates handling payment-service failures while maintaining appropriate order and inventory consistency.
- **Last-Item Race Condition Recovery:** Protects inventory when multiple customers attempt to purchase the final available unit simultaneously.
- **Synthetic Traffic:** Generates controlled requests to exercise and observe system behavior during failure experiments.
- **E-Commerce Functionality:** Includes product browsing, product details, cart management, checkout, orders, and simulated payments.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, Vite, Tailwind CSS |
| Backend | Node.js, Express.js |
| Database | MongoDB Atlas, Mongoose |
| Payment Service | Node.js, Express.js |
| Containerization | Docker, Docker Compose |
| Dashboard | React, React Flow |
| Development Tools | Git, GitHub, VS Code |

## System Architecture

```text
                         ┌─────────────────────┐
                         │   HealCart Storefront│
                         │  React + Vite        │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   Backend API        │
                         │   Express.js         │
                         └──────┬────────┬─────┘
                                │        │
                                ▼        ▼
                     ┌──────────────┐  ┌────────────────┐
                     │ MongoDB Atlas│  │ Payment Service│
                     │              │  │ Express.js     │
                     └──────────────┘  └────────────────┘

                         ┌─────────────────────┐
                         │     Chaos Center     │
                         │ Health, Experiments, │
                         │ Incidents, Recovery  │
                         └─────────────────────┘
```

## Self-Healing Scenarios

### 1. Backend Crash Recovery

**Objective:** Demonstrate recovery when the main backend service becomes unavailable.

- Trigger a controlled backend crash through the chaos experiment.
- Observe service health and incoming synthetic traffic.
- Show the storefront's service-unavailable feedback while the backend is down.
- Allow Docker's restart policy to restart the backend.
- Verify recovery using the backend health endpoint and application functionality.

**Expected result:** The backend returns to a healthy state, and the storefront can communicate with it again.

### 2. Offline Recovery

**Objective:** Preserve pending checkout information when the backend is unavailable and support recovery when connectivity returns.

- Simulate backend unavailability during the checkout workflow.
- Retain the supported checkout draft locally.
- Restore backend availability.
- Recover the saved draft and allow the user to continue the supported checkout workflow.

**Expected result:** The user can recover saved checkout information instead of losing the draft when the service becomes unavailable.


### 3. Payment Service Recovery

**Objective:** Demonstrate how the application handles payment-service failures.

- Trigger the supported payment failure experiment.
- Observe the application's payment error handling.
- Verify the resulting order and inventory state.
- Restore payment-service availability and verify that the service responds again.

**Expected result:** Payment failures are handled without treating an unsuccessful payment as a successful purchase, and applicable inventory restoration is verified.

### 4. Last-Item Race Condition Recovery

**Objective:** Prevent two customers from purchasing the same final unit of inventory.

- Prepare the supported last-item race experiment.
- Have two checkout requests attempt to purchase the final available unit concurrently.
- Use conditional atomic stock reservation to protect inventory.
- Verify the winning checkout and the losing checkout response.
- Check the final stock and order consistency.

**Expected result:** Only one checkout can reserve the final unit. The competing checkout is rejected when the item is no longer available, preventing overselling.

## Chaos Center

The Chaos Center provides a centralized interface for observing and testing HealCart's resilience mechanisms.

Depending on the enabled and verified features, it includes:

- Service health monitoring
- Controlled chaos experiments
- Synthetic traffic generation
- Incident and recovery history
- Service dependency visualization
- Recovery status and experiment metrics
- Backend crash coordination
- Last-item race-condition testing

The dashboard is intended to make failure behavior, recovery actions, and the resulting system state easier to demonstrate and inspect.

## E-Commerce Features

- Product catalog and product details
- Shopping cart with quantity management
- Checkout and order creation
- Simulated payment processing
- Order history
- Inventory deduction for successful paid orders
- Inventory restoration for applicable failed payments
- Quantity and stock validation
- Low-stock restock request support

## Project Structure

The following is a simplified overview. Actual files may differ depending on the current repository version.

```text
HealCart/
├── frontend/                 # React storefront and dashboard
├── backend/                  # Main Express API
├── payment-service/          # Payment service
├── chaos/                    # Chaos experiment tooling
├── recovery-monitor.js       # Recovery monitoring process
├── docker-compose.yml        # Container orchestration
└── README.md
```

## Prerequisites

Install or configure the following before starting the project:

- Node.js and npm
- Docker Desktop with Docker Compose
- A MongoDB Atlas database
- Git

Use the MongoDB connection string and other required environment variables specified by the project's existing configuration. **Never commit database credentials, API keys, or secrets to GitHub.**

## Getting Started

### 1. Clone the repository

Replace the placeholder with your actual GitHub repository URL.

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd <YOUR_REPOSITORY_FOLDER>
```

### 2. Configure environment variables

Review the backend, payment-service, and frontend configuration files. Add the required environment variables to the appropriate local environment files.

Configure the MongoDB Atlas connection string and any other required settings according to the project's existing code.

### 3. Start the backend and payment service

From the repository root, run:

```bash
docker compose up -d --build
```

This command assumes the repository's Docker Compose configuration defines the relevant services.

### 4. Start the frontend

Open a terminal in VS Code and run:

```bash
cd frontend
npm install
npm run dev
```

Vite commonly serves the frontend at:

```text
http://localhost:5173
```

Use the URL printed by the terminal if a different port is selected.

### 5. Start the recovery monitor

If the recovery monitor is configured to run separately, open another terminal at the repository root and run:

```bash
node recovery-monitor.js
```

### 6. Verify backend health

Open the health endpoint:

```text
http://localhost:5000/api/health
```

Confirm that the backend and database report the expected status before running the chaos experiments.

**Important:** Confirm the repository's current scripts, environment variables, Docker Compose service definitions, and ports before running these commands. The instructions above reflect the project's intended development setup and may require adjustment if its configuration has changed.

## Recovery Metrics

HealCart uses experiment results to demonstrate service behavior before and after recovery.

Useful measurements include:

| Metric | Purpose |
|---|---|
| Failure scenario | Identifies the experiment being tested |
| Initial service status | Records the system state before recovery |
| Detection time | Measures how long failure detection takes |
| Recovery duration | Measures time until the defined recovery condition is satisfied |
| Before state | Records relevant service, checkout, or inventory conditions |
| After state | Records the verified state after recovery |
| Requests passed or failed | Shows observed traffic outcomes during the experiment |

Record actual results from experiment runs. Recovery times and request counts should be marked **Not measured** when supporting measurements are unavailable. A service should only be reported as recovered after the relevant health and functional checks pass.

## Project Objectives

- Demonstrate self-healing concepts in a practical e-commerce application.
- Explore automated service recovery and failure handling.
- Preserve supported checkout information during temporary backend outages.
- Protect inventory against concurrent checkout requests.
- Monitor system behavior through a centralized operations dashboard.
- Make resilience experiments observable and repeatable.

## Future Improvements

Potential extensions include:

- More comprehensive automated recovery tests
- Persistent experiment reports and historical comparisons
- Additional fault-injection scenarios
- Improved recovery notifications
- Expanded monitoring and alerting
- More robust offline synchronization and conflict handling

## Security Notes

- Keep secrets and database credentials out of source control.
- Restrict chaos controls and administrative experiment endpoints to authorized users.
- Validate prices, quantities, inventory, and order status on the backend.
- Treat a payment as successful only after the application's payment workflow confirms it.
- Revalidate saved checkout drafts before creating an order.

## License

Add the license that applies to this project. Until a license is selected, no reuse permissions should be assumed.

---

**HealCart — Building resilient commerce through failure detection, recovery, and verification.**
