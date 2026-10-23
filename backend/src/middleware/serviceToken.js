const crypto = require("crypto");

/** Authenticate trusted SHCom service-to-service event publishers. */
const requireServiceToken = (req, res, next) => {
  const configured = process.env.CHAOS_TEST_TOKEN;
  if (!configured) {
    return res.status(503).json({
      success: false,
      message: "Internal event publishing is not configured.",
    });
  }

  const provided = req.get("x-chaos-token");
  if (typeof provided !== "string") {
    return res.status(401).json({ success: false, message: "Invalid service token." });
  }

  const expectedBytes = Buffer.from(configured);
  const providedBytes = Buffer.from(provided);
  if (
    expectedBytes.length !== providedBytes.length ||
    !crypto.timingSafeEqual(expectedBytes, providedBytes)
  ) {
    return res.status(401).json({ success: false, message: "Invalid service token." });
  }

  return next();
};

module.exports = { requireServiceToken };
