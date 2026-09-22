const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");
const cors = require("cors");

const {
  PORT,
  AUTO_CREATE_DB,
  dbConfig,
  dbLogConfig,
} = require("./config");

const app = express();

app.disable("x-powered-by");

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

const frontendDistPath = path.join(__dirname, "../public");

// ============================================================
// CORS
// ============================================================

const configuredCorsOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/*+$/, ""))
  .filter(Boolean);

const allowAllCorsOrigins = configuredCorsOrigins.includes("*");

const corsOrigin = configuredCorsOrigins.length
  ? (origin, callback) => {
      if (
        allowAllCorsOrigins ||
        !origin ||
        configuredCorsOrigins.includes(origin.replace(/\/*+$/, ""))
      ) {
        return callback(null, true);
      }

      return callback(new Error("Origin is not allowed by CORS"));
    }
  : true;

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(express.json());

app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,

    // Read-only screens can make several authenticated requests
    // while loading.
    skip: (req) =>
      req.method === "GET" ||
      req.method === "HEAD" ||
      req.method === "OPTIONS",

    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
    methods: [
      "GET",
      "HEAD",
      "PUT",
      "PATCH",
      "POST",
      "DELETE",
      "OPTIONS",
    ],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// ============================================================
// STATIC FILES
// ============================================================

// Uploaded files
app.use(
  "/uploads",
  express.static(path.join(__dirname, "../uploads")),
);

// React/Vite frontend
if (fs.existsSync(frontendDistPath)) {
  app.use(
    "/assets",
    express.static(path.join(frontendDistPath, "assets"), {
      fallthrough: false,
    }),
  );

  app.use(express.static(frontendDistPath));
}

// ============================================================
// DATABASE / ROUTES
// ============================================================

let client;

const { initializeDatabase } = require("./config/database");
const { setClient } = require("./db");

// Routes
const chapelRoutes = require("./routes/chapelRoutes");
const employeeRoutes = require("./routes/employeeRoutes");
const userRoutes = require("./routes/userRoutes");
const attendanceRecordRoutes = require("./routes/attendanceRecordRoutes");
const employeeLeaveRoutes = require("./routes/employeeLeaveRoutes");
const employeeScheduleRoutes = require("./routes/employeeScheduleRoutes");
const employeeDayOffRoutes = require("./routes/employeeDayOffRoutes");
const publicUploadRoutes = require("./routes/publicUploadRoutes");
const authRoutes = require("./routes/authRoutes");
const employeeChapelRoutes = require("./routes/employeeChapelRoutes");
const reportRoutes = require("./routes/reportRoutes");
const faceRoutes = require("./routes/faceRoutes");

const { getJwtSecret } = require("./config/security");

const {
  initializeFaceRecognition,
} = require("./services/faceRecognitionService");

// ============================================================
// INITIALIZATION
// ============================================================

let initializationPromise = null;

async function initializeApp() {
  // Prevent multiple simultaneous database initialization calls
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    if (process.env.NODE_ENV === "production") {
      getJwtSecret();

      if (!configuredCorsOrigins.length) {
        throw new Error("CORS_ORIGIN must be set in production.");
      }
    }

    if (
      !process.env.DATABASE_URL &&
      typeof dbConfig.password !== "string"
    ) {
      throw new Error(
        "DB password must be a string. Check your DB_PASSWORD environment variable.",
      );
    }

    try {
      client = await initializeDatabase(
        dbConfig,
        dbLogConfig,
        AUTO_CREATE_DB,
      );

      // Share the connected client with models/controllers
      setClient(client);

      // Reports require the database client
      app.use("/api/reports", reportRoutes(client));

      // Face recognition is optional
      try {
        await initializeFaceRecognition();
      } catch (faceError) {
        console.error(
          "[FACE] Recognition is unavailable:",
          faceError.message,
        );

        console.error(
          "[FACE] Attendance remains available, but face-api.js models must be present before enabling face endpoints.",
        );
      }

      console.log("Application initialization completed.");

      return client;
    } catch (err) {
      console.error(
        "Failed to initialize database:",
        err.message,
      );

      throw err;
    }
  })();

  return initializationPromise;
}

// ============================================================
// API ROUTES
// ============================================================

app.get("/api", async (req, res) => {
  try {
    await initializeApp();

    res.json({
      message: "Attendance System API is running",
      database: dbConfig.database,
    });
  } catch (error) {
    console.error("[API] Initialization error:", error);

    res.status(500).json({
      ok: false,
      message: "Application initialization failed",
      error: error.message,
    });
  }
});

app.get("/api/health", async (req, res) => {
  try {
    await initializeApp();

    const result = await client.query(
      "SELECT NOW() as current_time",
    );

    res.json({
      ok: true,
      message: "PostgreSQL connection is healthy",
      currentTime: result.rows[0].current_time,
    });
  } catch (error) {
    console.error("[HEALTH] Database connection failed:", error);

    res.status(500).json({
      ok: false,
      message: "Database connection failed",
      error: error.message,
    });
  }
});

// ============================================================
// APPLICATION ROUTES
// ============================================================

app.use("/api/chapels", chapelRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/users", userRoutes);
app.use("/api/attendance-records", attendanceRecordRoutes);

app.use("/api/employee-leave", employeeLeaveRoutes);
app.use("/api/employee-Leave", employeeLeaveRoutes);

app.use("/api/employee-schedules", employeeScheduleRoutes);
app.use("/api/employee-day-offs", employeeDayOffRoutes);

app.use("/api/public-uploads", publicUploadRoutes);
app.use("/api/employee-chapels", employeeChapelRoutes);

app.use("/api/auth", authRoutes);
app.use("/api/face", faceRoutes);

// ============================================================
// FAVICON
// ============================================================

app.get("/favicon.ico", (req, res) => {
  const faviconPath = path.join(
    frontendDistPath,
    "favicon.ico",
  );

  if (fs.existsSync(faviconPath)) {
    return res.sendFile(faviconPath);
  }

  return res.status(204).end();
});

// ============================================================
// REACT / VITE SPA FALLBACK
// ============================================================

if (fs.existsSync(frontendDistPath)) {
  app.get(
    /^\/(?!api(?:\/|$)|uploads(?:\/|$)).*/,
    (req, res) => {
      res.sendFile(
        path.join(frontendDistPath, "index.html"),
      );
    },
  );
}

// ============================================================
// VERCEL EXPORT
// ============================================================

// Vercel needs the Express application exported.
module.exports = app;

// ============================================================
// LOCAL DEVELOPMENT SERVER
// ============================================================

// Only start app.listen() when running this file directly.
// Vercel will NOT execute app.listen().
if (require.main === module) {
  initializeApp()
    .then(() => {
      app.listen(PORT, "0.0.0.0", () => {
        console.log(
          `Server is running on port ${PORT}`,
        );
      });
    })
    .catch((error) => {
      console.error(
        "Failed to start server:",
        error,
      );

      process.exit(1);
    });
}
