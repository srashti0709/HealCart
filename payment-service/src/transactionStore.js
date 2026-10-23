const fs = require("fs");
const path = require("path");

/**
 * Durable ledger of simulated payment transactions.
 *
 * The payment service used to keep transactions in an in-memory Map, so every
 * record was lost when the process restarted and an interrupted payment could
 * never be confirmed afterwards. The ledger is written to disk with the same
 * atomic write convention the chaos controller and the recovery monitor use,
 * and it is keyed by the order id, which is the idempotency key the backend
 * already sends.
 *
 * The payment service has no MongoDB configuration and no database client, so
 * a file ledger is the smallest safe durable store for it. It lives on a
 * volume in Docker so it survives a container replacement as well.
 */

const DEFAULT_LEDGER_PATH = path.join(
    __dirname,
    "..",
    "data",
    "payment-transactions.json"
);

const resolveLedgerPath = (ledgerPath) =>
    ledgerPath || process.env.PAYMENT_LEDGER_PATH || DEFAULT_LEDGER_PATH;

class PaymentTransactionStore {
    constructor({ ledgerPath, fileSystem = fs } = {}) {
        this.ledgerPath = resolveLedgerPath(ledgerPath);
        this.fileSystem = fileSystem;
        this.transactions = new Map();
        this.loaded = false;
    }

    ensureLoaded() {
        if (this.loaded) {
            return;
        }

        this.transactions = this.readLedger();
        this.loaded = true;
    }

    readLedger() {
        try {
            if (!this.fileSystem.existsSync(this.ledgerPath)) {
                return new Map();
            }

            const parsed = JSON.parse(
                this.fileSystem.readFileSync(this.ledgerPath, "utf8")
            );

            const transactions = new Map();

            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                for (const [orderId, transaction] of Object.entries(parsed)) {
                    if (transaction && typeof transaction === "object") {
                        transactions.set(orderId, transaction);
                    }
                }
            }

            return transactions;
        } catch (error) {
            // A ledger that cannot be read is never reported as an empty
            // ledger: the caller has to know the outcome is unknown.
            throw new Error(
                `Payment ledger could not be read: ${error.message}`
            );
        }
    }

    writeLedger() {
        const directory = path.dirname(this.ledgerPath);

        if (!this.fileSystem.existsSync(directory)) {
            this.fileSystem.mkdirSync(directory, { recursive: true });
        }

        const temporaryPath = `${this.ledgerPath}.tmp`;
        const payload = {};

        for (const [orderId, transaction] of this.transactions.entries()) {
            payload[orderId] = transaction;
        }

        this.fileSystem.writeFileSync(
            temporaryPath,
            JSON.stringify(payload, null, 2),
            "utf8"
        );

        this.fileSystem.renameSync(temporaryPath, this.ledgerPath);
    }

    /**
     * Returns the stored transaction for an order, or null when there is none.
     */
    get(orderId) {
        this.ensureLoaded();

        return this.transactions.get(orderId) || null;
    }

    /**
     * Stores a transaction for an order. The order id is the key, so the same
     * payment can never produce a second record.
     */
    record(transaction) {
        this.ensureLoaded();

        const stored = {
            ...transaction,
            orderId: transaction.orderId,
            updatedAt: new Date().toISOString(),
            createdAt:
                this.transactions.get(transaction.orderId)?.createdAt ||
                new Date().toISOString(),
        };

        this.transactions.set(transaction.orderId, stored);

        // The transaction is persisted before the caller is told it succeeded.
        this.writeLedger();

        return stored;
    }

    /**
     * Number of stored transactions.
     */
    count() {
        this.ensureLoaded();

        return this.transactions.size;
    }
}

module.exports = {
    PaymentTransactionStore,
    DEFAULT_LEDGER_PATH,
    resolveLedgerPath,
};
