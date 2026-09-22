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

// ============================================================
// PATHS
// ============================================================

const frontendDistPath = path.join(__dirname, "../public");
const uploadsPath = path.join(__dirname, "../uploads");

// ============================================================
// CORS
// ============================================================

const configuredCorsOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const allowAllCorsOrigins = configuredCorsOrigins.includes("*");

const corsOrigin = configuredCorsOrigins.length
  ? (origin, callback) => {
      // Allow requests without an Origin header
      // such as server-to-server requests.
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = origin.replace(/\/+$/, "");

      if (
        allowAllCorsOrigins ||
        configuredCorsOrigins.includes(normalizedOrigin)
      ) {
        return callback(null, true);
      }

      return callback(new Error("Origin is not allowed by CORS"));
    }
  : true;

// ============================================================
// BASIC MIDDLEWARE
// ============================================================

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,

    // GET/HEAD/OPTIONS are read-only or browser preflight requests.
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

    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
  }),
);

// ============================================================
// STATIC FILES
// ============================================================

// Uploaded files
if (fs.existsSync(uploadsPath)) {
  app.use(
    "/uploads",
    express.static(uploadsPath),
  );
}

// React/Vite frontend
if (fs.existsSync(frontendDistPath)) {
  const assetsPath = path.join(
    frontendDistPath,
    "assets",
  );

  if (fs.existsSync(assetsPath)) {
    app.use(
      "/assets",
      express.static(assetsPath),
    );
  }

  app.use(
    express.static(frontendDistPath),
  );
}

// ============================================================
// DATABASE
// ============================================================

let client = null;
let initializationPromise = null;

const {
  initializeDatabase,
} = require("./config/database");

const {
  setClient,
} = require("./db");

// ============================================================
// ROUTES
// ============================================================

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
const faceRoutes = require("./routes/faceRoutes");
const reportRoutes = require("./routes/reportRoutes");

// ============================================================
// SERVICES
// ============================================================

const {
  getJwtSecret,
} = require("./config/security");

const {
  initializeFaceRecognition,
} = require("./services/faceRecognitionService");

// ============================================================
// APPLICATION INITIALIZATION
// ============================================================

async function initializeApp() {
  // Prevent multiple requests from initializing
  // the database at the same time.
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    console.log("[APP] Initializing application...");

    // --------------------------------------------------------
    // Production configuration
    // --------------------------------------------------------

    if (process.env.NODE_ENV === "production") {
      getJwtSecret();

      if (!configuredCorsOrigins.length) {
        throw new Error(
          "CORS_ORIGIN must be set in production.",
        );
      }
    }

    // --------------------------------------------------------
    // Database configuration validation
    // --------------------------------------------------------

    if (
      !process.env.DATABASE_URL &&
      typeof dbConfig.password !== "string"
    ) {
      throw new Error(
        "DB password must be a string. Check your DB_PASSWORD environment variable.",
      );
    }

    // --------------------------------------------------------
    // PostgreSQL
    // --------------------------------------------------------

    client = await initializeDatabase(
      dbConfig,
      dbLogConfig,
      AUTO_CREATE_DB,
    );

    // Make database client available
    // to the rest of the application.
    setClient(client);

    console.log(
      "[APP] PostgreSQL initialized successfully.",
    );

    // --------------------------------------------------------
    // Face recognition
    // --------------------------------------------------------

    try {
      await initializeFaceRecognition();

      console.log(
        "[FACE] Face recognition initialized.",
      );
    } catch (faceError) {
      console.error(
        "[FACE] Face recognition is unavailable:",
        faceError.message,
      );

      console.error(
        "[FACE] Attendance system will continue running.",
      );
    }

    console.log(
      "[APP] Application initialization completed.",
    );

    return client;
  })().catch((error) => {
    // Allow a later request to retry initialization
    // if the first initialization failed.
    initializationPromise = null;

    console.error(
      "[APP] Initialization failed:",
      error,
    );

    throw error;
  });

  return initializationPromise;
}

// ============================================================
// INITIALIZATION MIDDLEWARE
// ============================================================
//
// Every /api request waits for:
// 1. PostgreSQL connection
// 2. db client registration
// 3. face recognition initialization attempt
//
// This is important for Vercel serverless execution.
//

app.use("/api", async (req, res, next) => {
  try {
    await initializeApp();
    next();
  } catch (error) {
    console.error(
      "[API] Initialization error:",
      error,
    );

    res.status(500).json({
      ok: false,
      message: "Application initialization failed",
      error:
        process.env.NODE_ENV === "production"
          ? "Internal server error"
          : error.message,
    });
  }
});

// ============================================================
// API STATUS
// ============================================================

app.get("/api", (req, res) => {
  res.json({
    ok: true,
    message: "Attendance System API is running",
    database: dbConfig.database,
  });
});

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/api/health", async (req, res) => {
  try {
    const result = await client.query(
      "SELECT NOW() AS current_time",
    );

    res.json({
      ok: true,
      message: "PostgreSQL connection is healthy",
      currentTime: result.rows[0].current_time,
    });
  } catch (error) {
    console.error(
      "[HEALTH] Database error:",
      error,
    );

    res.status(500).json({
      ok: false,
      message: "Database connection failed",
      error:
        process.env.NODE_ENV === "production"
          ? "Internal server error"
          : error.message,
    });
  }
});

// ============================================================
// APPLICATION ROUTES
// ============================================================

app.use(
  "/api/chapels",
  chapelRoutes,
);

app.use(
  "/api/employees",
  employeeRoutes,
);

app.use(
  "/api/users",
  userRoutes,
);

app.use(
  "/api/attendance-records",
  attendanceRecordRoutes,
);

app.use(
  "/api/employee-leave",
  employeeLeaveRoutes,
);

app.use(
  "/api/employee-Leave",
  employeeLeaveRoutes,
);

app.use(
  "/api/employee-schedules",
  employeeScheduleRoutes,
);

app.use(
  "/api/employee-day-offs",
  employeeDayOffRoutes,
);

app.use(
  "/api/public-uploads",
  publicUploadRoutes,
);

app.use(
  "/api/employee-chapels",
  employeeChapelRoutes,
);

app.use(
  "/api/auth",
  authRoutes,
);

app.use(
  "/api/face",
  faceRoutes,
);

// Reports require the initialized database client.
//
// Instead of mounting this during initialization,
// mount a wrapper that uses the current client.

app.use(
  "/api/reports",
  (req, res, next) => {
    if (!client) {
      return res.status(503).json({
        ok: false,
        message: "Database is not initialized.",
      });
    }

    return reportRoutes(client)(
      req,
      res,
      next,
    );
  },
);

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

  // No favicon is not an application error.
  return res.status(204).end();
});

// ============================================================
// REACT / VITE SPA FALLBACK
// ============================================================

if (fs.existsSync(frontendDistPath)) {
  app.get(
    /^\/(?!api(?:\/|$)|uploads(?:\/|$)).*/,
    (req, res) => {
      const indexPath = path.join(
        frontendDistPath,
        "index.html",
      );

      if (!fs.existsSync(indexPath)) {
        return res.status(404).send(
          "Frontend build not found.",
        );
      }

      return res.sendFile(indexPath);
    },
  );
}

// ============================================================
// ERROR HANDLER
// ============================================================

app.use(
  (error, req, res, next) => {
    console.error(
      "[SERVER ERROR]",
      error,
    );

    if (res.headersSent) {
      return next(error);
    }

    res.status(500).json({
      ok: false,
      message: "Internal server error",
      error:
        process.env.NODE_ENV === "production"
          ? "Internal server error"
          : error.message,
    });
  },
);

// ============================================================
// VERCEL EXPORT
// ============================================================
//
// IMPORTANT:
// Vercel needs the Express application exported.
// Do NOT remove this.
//

module.exports = app;

// ============================================================
// LOCAL DEVELOPMENT
// ============================================================
//
// When you run:
//     node src/server.js
//
// the server starts normally.
//
// Vercel imports this file and uses the exported `app`
// instead, so app.listen() is NOT executed there.
//

if (require.main === module) {
  initializeApp()
    .then(() => {
      app.listen(
        PORT,
        "0.0.0.0",
        () => {
          console.log(
            `Server is running on port ${PORT}`,
          );
        },
      );
    })
    .catch((error) => {
      console.error(
        "Failed to start server:",
        error,
      );

      process.exit(1);
    });
}