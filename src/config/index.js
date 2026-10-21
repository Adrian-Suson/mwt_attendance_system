const dotenv = require("dotenv");

dotenv.config();

const PORT = process.env.PORT || 5000;
const AUTO_CREATE_DB = process.env.DB_AUTO_CREATE === "true";

const dbConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    }
  : {
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD
        ? String(process.env.DB_PASSWORD)
        : "admin",
      database: process.env.DB_NAME || "attendance_db",
    };

const dbLogConfig = {
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  database: dbConfig.database,
};

module.exports = {
  PORT,
  AUTO_CREATE_DB,
  dbConfig,
  dbLogConfig,
};
