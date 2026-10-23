
const crypto = require("crypto");

const TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET;
const TOKEN_LIFETIME_SECONDS = 8 * 60 * 60;

const sign = (value) =>
  crypto.createHmac("sha256", TOKEN_SECRET).update(value).digest("base64url");

const safeEqual = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));

  return left.length === right.length &&
    crypto.timingSafeEqual(left, right);
};

const authenticate = (req, res, next) => {
  const authorization = req.get("authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Admin authentication required.",
    });
  }

  const parts = token.split(".");

  if (parts.length === 2) {
    if (!TOKEN_SECRET) {
      return res.status(503).json({
        success: false,
        message: "Admin authentication is not configured.",
      });
    }

    const [payload, signature] = parts;

    try {
      if (!safeEqual(sign(payload), signature)) {
        throw new Error("Invalid token signature");
      }

      const user = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8")
      );

      if (
        user.role !== "admin" ||
        typeof user.exp !== "number" ||
        user.exp <= Math.floor(Date.now() / 1000)
      ) {
        throw new Error("Invalid or expired token");
      }

      req.user = user;
      next();
    } catch {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired admin session.",
      });
    }

    return;
  }

  if (parts.length === 3) {
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      return res.status(401).json({
        success: false,
        message: "Admin authentication required.",
      });
    }

    const [header, payload, signature] = parts;

    try {
      let headerJson;
      try {
        headerJson = JSON.parse(
          Buffer.from(header, "base64url").toString("utf8")
        );
      } catch {
        throw new Error("Invalid token header");
      }

      if (headerJson.alg !== "HS256") {
        throw new Error("Unsupported token algorithm");
      }

      const expectedSignature = crypto
        .createHmac("sha256", jwtSecret)
        .update(`${header}.${payload}`)
        .digest();

      const providedSignature = Buffer.from(signature, "base64url");

      if (
        providedSignature.length !== expectedSignature.length ||
        !crypto.timingSafeEqual(providedSignature, expectedSignature)
      ) {
        throw new Error("Invalid token signature");
      }

      const user = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8")
      );

      if (
        typeof user.exp === "number" &&
        user.exp <= Math.floor(Date.now() / 1000)
      ) {
        throw new Error("Expired token");
      }

      req.user = user;
      next();
    } catch {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired admin session.",
      });
    }

    return;
  }

  return res.status(401).json({
    success: false,
    message: "Admin authentication required.",
  });
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Admin access required.",
    });
  }

  next();
};

const createAdminToken = () => {
  const payload = Buffer.from(
    JSON.stringify({
      role: "admin",
      exp: Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS,
    })
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
};

const verifyAdminCredentials = (username, password) => {
  const expectedUsername = process.env.ADMIN_USERNAME;
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedUsername || !expectedPassword || !TOKEN_SECRET) {
    return false;
  }

  return safeEqual(username, expectedUsername) &&
    safeEqual(password, expectedPassword);
};

module.exports = {
  authenticate,
  requireAdmin,
  createAdminToken,
  verifyAdminCredentials,
};
