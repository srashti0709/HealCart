
require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const { PaymentTransactionStore } = require("./transactionStore");
const {
  processPaymentRequest,
  getPaymentStatusRequest,
} = require("./paymentProcessing");

const app = express();
const PORT = process.env.PORT || 5001;
let simulatePaymentTimeout = process.env.SIMULATE_PAYMENT_TIMEOUT === "true";

app.use(express.json());

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const transactionStore = new PaymentTransactionStore();

app.get("/health", (req, res) => {
  res.json({
    success: true,
    service: "payment-service",
    status: "healthy",
  });
});

app.post("/internal/chaos/payment-timeout", (req, res) => {
  const configuredToken = process.env.CHAOS_TEST_TOKEN;
  const providedToken = req.get("x-chaos-token") || "";

  if (!configuredToken) {
    return res.status(503).json({
      success: false,
      message: "Payment chaos control is not configured.",
    });
  }

  const expected = Buffer.from(configuredToken);
  const received = Buffer.from(providedToken);

  if (
    expected.length !== received.length ||
    !crypto.timingSafeEqual(expected, received)
  ) {
    return res.status(401).json({
      success: false,
      message: "Invalid chaos control token.",
    });
  }

  if (typeof req.body?.enabled !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "Provide enabled: true or enabled: false.",
    });
  }

  simulatePaymentTimeout = req.body.enabled;

  return res.json({
    success: true,
    scenario: "payment-response-timeout",
    enabled: simulatePaymentTimeout,
    message: simulatePaymentTimeout
      ? "Payment response timeout chaos is enabled."
      : "Payment response timeout chaos is disabled.",
  });
});

app.post("/pay", async (req, res) => {
  const result = await processPaymentRequest({
    store: transactionStore,
    body: req.body,
    simulateFailure: process.env.SIMULATE_PAYMENT_FAILURE === "true",
    simulateTimeout: simulatePaymentTimeout,
  });

  res.status(result.statusCode).json(result.body);
});

app.get("/status/:orderId", async (req, res) => {
  const result = await getPaymentStatusRequest({
    store: transactionStore,
    orderId: req.params.orderId,
  });

  res.status(result.statusCode).json(result.body);
});

app.listen(PORT, () => {
  console.log(`SHCom payment service running on port ${PORT}`);
});
