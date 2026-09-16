const express = require("express");
const path = require("path");
const fs = require("fs");
const { PORT, AUTO_CREATE_DB, dbConfig, dbLogConfig } = require("./config");
const cors = require("cors");

const app = express();
const frontendDistPath = path.join(__dirname, "../public");
const configuredCorsOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);
const allowAllCorsOrigins = configuredCorsOrigins.includes("*");

const corsOrigin = configuredCorsOrigins.length
  ? (origin, callback) => {
      if (
        allowAllCorsOrigins ||
        !origin ||
        configuredCorsOrigins.includes(origin.replace(/\/+$/, ""))
      ) {
        return callback(null, true);
      }

      return callback(new Error("Origin is not allowed by CORS"));
    }
  : true;

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
// Enable CORS for frontend (configurable via CORS_ORIGIN env var)
app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

if (fs.existsSync(frontendDistPath)) {
  app.use(
    "/assets",
    express.static(path.join(frontendDistPath, "assets"), {
      fallthrough: false,
    }),
  );
  app.use(express.static(frontendDistPath));
}

let client;
const { initializeDatabase } = require("./config/database");
const { setClient } = require("./db");
const chapelRoutes = require("./routes/chapelRoutes");
const employeeRoutes = require("./routes/employeeRoutes");
const userRoutes = require("./routes/userRoutes");
const attendanceRecordRoutes = require("./routes/attendanceRecordRoutes");
const employeeLeaveRoutes = require("./routes/employeeLeaveRoutes");
const employeeScheduleRoutes = require("./routes/employeeScheduleRoutes");
const publicUploadRoutes = require("./routes/publicUploadRoutes");
const authRoutes = require("./routes/authRoutes");
const employeeChapelRoutes = require("./routes/employeeChapelRoutes");
const reportRoutes = require("./routes/reportRoutes");

async function startServer() {
  if (!process.env.DATABASE_URL && typeof dbConfig.password !== "string") {
    console.error(
      "DB password must be a string. Check your DB_PASSWORD environment variable.",
    );
    process.exit(1);
  }

  try {
    client = await initializeDatabase(dbConfig, dbLogConfig, AUTO_CREATE_DB);
    // share the connected client with models/controllers
    setClient(client);
    app.use("/api/reports", reportRoutes(client));
  } catch (err) {
    console.error("Failed to initialize database. Exiting:", err.message);
    process.exit(1);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

app.get("/api", (req, res) => {
  res.json({
    message: "Attendance System API is running",
    database: dbConfig.database,
  });
});

app.get("/api/health", async (req, res) => {
  try {
    const result = await client.query("SELECT NOW() as current_time");
    res.json({
      ok: true,
      message: "PostgreSQL connection is healthy",
      currentTime: result.rows[0].current_time,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Database connection failed",
      error: error.message,
    });
  }
});

app.use("/api/chapels", chapelRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/users", userRoutes);
app.use("/api/attendance-records", attendanceRecordRoutes);
app.use("/api/employee-Leave", employeeLeaveRoutes);
app.use("/api/employee-schedules", employeeScheduleRoutes);
app.use("/api/public-uploads", publicUploadRoutes);
app.use("/api/employee-chapels", employeeChapelRoutes);
app.use("/api/auth", authRoutes);

if (fs.existsSync(frontendDistPath)) {
  app.get(/^(?!\/api|\/uploads).*/, (req, res) => {
    res.sendFile(path.join(frontendDistPath, "index.html"));
  });
}

startServer();
