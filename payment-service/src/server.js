require("dotenv").config();
const express = require("express");
const { PaymentTransactionStore } = require("./transactionStore");
const {
  processPaymentRequest,
  getPaymentStatusRequest,
} = require("./paymentProcessing");

const app = express();
const PORT = process.env.PORT || 5001;

app.use(express.json());
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];

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

app.post("/pay", async (req, res) => {
  const result = await processPaymentRequest({
    store: transactionStore,
    body: req.body,
    simulateFailure: process.env.SIMULATE_PAYMENT_FAILURE === "true",
    simulateTimeout: process.env.SIMULATE_PAYMENT_TIMEOUT === "true",
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
