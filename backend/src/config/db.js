
const mongoose = require("mongoose");

const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;
const MAX_CONNECTION_ATTEMPTS = 20;

let listenersRegistered = false;
let reconnectScheduled = false;

const registerConnectionListeners = () => {
  if (listenersRegistered) return;

  const connection = mongoose.connection;

  connection.on("connected", () => {
    reconnectScheduled = false;
    console.log("[Database Recovery] MongoDB connected successfully.");
  });

  connection.on("disconnected", () => {
    console.warn(
      "[Database Recovery] MongoDB disconnected. Mongoose will attempt to reconnect."
    );

    if (!reconnectScheduled) {
      reconnectScheduled = true;
      setTimeout(() => {
        const reconnect = async () => {
          try {
            await connectDB();
            console.log("[Database Recovery] MongoDB connection restored.");
          } catch (error) {
            console.error(
              "[Database Recovery] Automatic reconnect failed:",
              error.message
            );
            reconnectScheduled = false;
          }
        };

        reconnect();
      }, INITIAL_RETRY_DELAY_MS);
    }
  });

  connection.on("reconnected", () => {
    console.log("[Database Recovery] MongoDB connection restored.");
    reconnectScheduled = false;
  });

  connection.on("error", (error) => {
    console.error("[Database Recovery] MongoDB connection error:", {
      name: error.name,
      code: error.code,
      message: error.message,
    });
  });

  listenersRegistered = true;
};

const delay = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const connectDB = async (options = {}) => {
  const mongoURI = process.env.MONGODB_URI;

  if (!mongoURI) {
    throw new Error("MONGODB_URI is not configured.");
  }

  registerConnectionListeners();

  const maxAttempts = options.maxAttempts ?? MAX_CONNECTION_ATTEMPTS;
  let retryDelay = INITIAL_RETRY_DELAY_MS;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (mongoose.connection.readyState === 1) {
        return mongoose.connection;
      }

      if (mongoose.connection.readyState === 2) {
        await new Promise((resolve, reject) => {
          const connection = mongoose.connection;

          const onConnected = () => {
            cleanup();
            resolve();
          };

          const onError = (error) => {
            cleanup();
            reject(error);
          };

          const cleanup = () => {
            connection.removeListener("connected", onConnected);
            connection.removeListener("error", onError);
          };

          connection.once("connected", onConnected);
          connection.once("error", onError);
        });

        return mongoose.connection;
      }

      console.log("[Database Recovery] Connecting to MongoDB Atlas...");

      await mongoose.connect(mongoURI, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
        retryWrites: true,
        retryReads: true,
      });

      console.log("[Database Recovery] Initial connection established.");
      return mongoose.connection;
    } catch (error) {
      console.error(
        `[Database Recovery] Connection attempt ${attempt}/${maxAttempts} failed: ${error.message}`
      );

      if (attempt >= maxAttempts) {
        throw error;
      }

      const nextDelay = Math.min(retryDelay, MAX_RETRY_DELAY_MS);
      console.log(
        `[Database Recovery] Retrying in ${nextDelay / 1000} seconds...`
      );

      await delay(nextDelay);
      retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY_MS);
    }
  }
};

module.exports = connectDB;
