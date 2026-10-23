
require("dotenv").config();

const express = require("express");
const { PaymentTransactionStore } = require("./transactionStore");
const {
  processPaymentRequest,
  getPaymentStatusRequest,
} = require("./paymentProcessing");

const app = express();
const PORT = process.env.PORT || 5001;
const CHAOS_TEST_TOKEN = process.env.CHAOS_TEST_TOKEN;

let simulateTimeoutEnabled =
  process.env.SIMULATE_PAYMENT_TIMEOUT === "true";

app.use(express.json());

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ];

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

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
  if (
    !CHAOS_TEST_TOKEN ||
    req.headers["x-chaos-token"] !== CHAOS_TEST_TOKEN
  ) {
    return res.status(403).json({
      success: false,
      message: "Unauthorized chaos control request.",
    });
  }

  if (typeof req.body?.enabled !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "Provide enabled: true or enabled: false.",
    });
  }

  simulateTimeoutEnabled = req.body.enabled;

  return res.json({
    success: true,
    enabled: simulateTimeoutEnabled,
    message: simulateTimeoutEnabled
      ? "Payment timeout armed for the next new payment."
      : "Payment timeout disabled.",
  });
});

app.post("/pay", async (req, res) => {
  const shouldSimulateTimeout = simulateTimeoutEnabled;

  if (shouldSimulateTimeout) {
    simulateTimeoutEnabled = false;
  }

  try {
    const result = await processPaymentRequest({
      store: transactionStore,
      body: req.body,
      simulateFailure: process.env.SIMULATE_PAYMENT_FAILURE === "true",
      simulateTimeout: shouldSimulateTimeout,
    });

    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    console.error("Payment processing error:", error);

    return res.status(500).json({
      success: false,
      paymentStatus: "unknown",
      message: "An unexpected payment processing error occurred.",
    });
  }
});

app.get("/status/:orderId", async (req, res) => {
  const result = await getPaymentStatusRequest({
    store: transactionStore,
    orderId: req.params.orderId,
  });

  return res.status(result.statusCode).json(result.body);
});

app.listen(PORT, () => {
  console.log(`SHCom payment service running on port ${PORT}`);
});
