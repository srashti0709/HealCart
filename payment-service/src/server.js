require("dotenv").config();
const express = require("express");

const app = express();
const PORT = process.env.PORT || 5001;

app.use(express.json());

const paymentTransactions = new Map();
app.get("/health", (req, res) => {
  res.json({
    success: true,
    service: "payment-service",
    status: "healthy",
  });
});



app.post("/pay", (req, res) => {
  const { orderId, amount } = req.body;

  if (!orderId || typeof amount !== "number" || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Valid order ID and amount are required",
    });
  }

  const existing = paymentTransactions.get(orderId);

  if (existing) {
    if (existing.amount !== amount) {
      return res.status(409).json({
        success: false,
        message: "Order payment amount mismatch",
      });
    }

    return res.json(existing);
  }

  if (process.env.SIMULATE_PAYMENT_FAILURE === "true") {
    return res.status(503).json({
      success: false,
      paymentStatus: "failed",
      orderId,
      amount,
      message: "Simulated payment failure",
    });
  }

  const payment = {
    success: true,
    paymentStatus: "paid",
    transactionId: `SIM-${Date.now()}-${orderId}`,
    orderId,
    amount,
    message: "Simulated payment successful",
  };

  paymentTransactions.set(orderId, payment);

  if (process.env.SIMULATE_PAYMENT_TIMEOUT === "true") {
    return res.status(504).json({
      success: false,
      paymentStatus: "unknown",
      orderId,
      amount,
      message: "Simulated timeout after payment processing",
    });
  }

  return res.json(payment);
});

app.get("/status/:orderId", (req, res) => {
  const payment = paymentTransactions.get(req.params.orderId);

  if (!payment) {
    return res.status(404).json({
      success: false,
      paymentStatus: "unknown",
      message: "Payment transaction not found",
    });
  }

  return res.json(payment);
});



app.listen(PORT, () => {
  console.log(`SHCom payment service running on port ${PORT}`);
});