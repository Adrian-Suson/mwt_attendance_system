const jwt = require("jsonwebtoken");
const { getJwtSecret } = require("../config/security");

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    req.user = jwt.verify(token, getJwtSecret());
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

const ROLES = {
  GCM: "gcm_super_admin",
  CM: "cm_admin",
  FCR: "fcr",
};

module.exports = { ROLES, requireAuth, allowRoles };
