const { Client, Pool } = require("pg");
const bcrypt = require("bcrypt");

const SALT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);

/*
 * ============================================================
 * ENSURE DATABASE EXISTS
 * ============================================================
 */

async function ensureDatabaseExists(dbConfig) {
  const adminConfig = {
    ...dbConfig,
    database: "postgres",
  };

  const adminClient = new Client(adminConfig);

  try {
    await adminClient.connect();

    const result = await adminClient.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbConfig.database],
    );

    if (result.rowCount === 0) {
      const safeDbName = dbConfig.database.replace(/"/g, '""');

      await adminClient.query(`CREATE DATABASE "${safeDbName}"`);

      console.log(`Database "${dbConfig.database}" created successfully.`);
    } else {
      console.log(`Database "${dbConfig.database}" already exists.`);
    }
  } finally {
    await adminClient.end().catch(() => {});
  }
}

/*
 * ============================================================
 * INITIALIZE DATABASE
 * ============================================================
 */

async function initializeDatabase(dbConfig, dbLogConfig, autoCreateDb) {
  try {
    /*
     * ========================================================
     * CREATE DATABASE
     * ========================================================
     */

    if (autoCreateDb && dbConfig.database) {
      await ensureDatabaseExists(dbConfig);
    }

    /*
     * ========================================================
     * CONNECT
     * ========================================================
     */

    const client = new Pool({
      ...dbConfig,
      options: [dbConfig.options, "-c timezone=Asia/Manila"]
        .filter(Boolean)
        .join(" "),
      max: Number(process.env.DB_POOL_MAX || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    client.on("error", (error) => {
      console.error("PostgreSQL client error:", error.message);
    });

    await client.query("SELECT 1");

    if (dbConfig.database) {
      const databaseName = String(dbConfig.database).replace(/"/g, '""');
      try {
        await client.query(
          `ALTER DATABASE "${databaseName}" SET timezone TO 'Asia/Manila'`,
        );
      } catch (error) {
        console.warn(
          "Could not set the database default timezone. The application session will still use Asia/Manila.",
          error.message,
        );
      }
    }

    await client.query("SET TIME ZONE 'Asia/Manila'");

    console.log("Connected to PostgreSQL successfully.");

    /*
     * ========================================================
     * CHAPELS
     * ========================================================
     */

    await client.query(`
      CREATE TABLE IF NOT EXISTS chapels (
        id SERIAL PRIMARY KEY,

        name VARCHAR(255) NOT NULL UNIQUE,

        location VARCHAR(255),

        status VARCHAR(30) NOT NULL
          DEFAULT 'active'
          CHECK (
            status IN (
              'active',
              'inactive'
            )
          ),

        created_at TIMESTAMPTZ DEFAULT NOW(),

        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    /*
     * ========================================================
     * EMPLOYEES
     * ========================================================
     */

    await client.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,

        first_name VARCHAR(100) NOT NULL,

        last_name VARCHAR(150) NOT NULL,

        email VARCHAR(255) UNIQUE,

        phone VARCHAR(50),

        role VARCHAR(100) NOT NULL
          CHECK (
            role IN (
              'GCM',
              'GCM Staff',
              'CM',
              'FCR',
              'Driver',
              'Embalmer',
              'Attendant',
              'Attendant/Asst Embalmer',
              'Driver/Asst Embalmer',
              'Driver/Attendant',
              'Driver/Embalmer'
            )
          ),

        /*
         * Primary chapel
         */
        chapel_id INTEGER
          REFERENCES chapels(id)
          ON DELETE SET NULL,

        middle_name VARCHAR(100),

        employment_type VARCHAR(50) NOT NULL DEFAULT 'Regular',

        /*
         * Simplified schedule stored as per-employee defaults.
         * - day_off: weekday name
         * - time_in / time_out: default daily times
         */
        day_off VARCHAR(10) NOT NULL
          DEFAULT 'Sunday'
          CHECK (
            day_off IN (
              'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'
            )
          ),

        time_in TIME NOT NULL
          DEFAULT '08:00:00',

        time_out TIME NOT NULL
          DEFAULT '17:00:00',

        status VARCHAR(30) NOT NULL
          DEFAULT 'active'
          CHECK (
            status IN (
              'active',
              'on_leave',
              'inactive'
            )
          ),

        hire_date DATE,

        created_at TIMESTAMPTZ
          DEFAULT NOW(),

        updated_at TIMESTAMPTZ
          DEFAULT NOW()
      );
    `);

    // Ensure legacy databases get missing columns added without destroying data.
    // This makes startup idempotent and avoids "column does not exist" errors.
    await client.query(
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS email VARCHAR(255);`,
    );
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_email ON employees(email);`,
    );
    await client.query(
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone VARCHAR(50);`,
    );
    await client.query(
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS role VARCHAR(100);`,
    );

    await client.query(
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS chapel_id INTEGER;`,
    );
    await client.query(
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS middle_name VARCHAR(100);`,
    );
    await client.query(
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_type VARCHAR(50);`,
    );
    await client.query(
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS day_off VARCHAR(10);`,
    );
    await client.query(
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS time_in TIME;`,
    );
    await client.query(
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS time_out TIME;`,
    );
    await client.query(
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS status VARCHAR(30);`,
    );
    await client.query(
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS hire_date DATE;`,
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS employee_face_embeddings (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        embedding JSONB NOT NULL,
        model VARCHAR(100) NOT NULL DEFAULT 'face-api.js',
        drive_file_id VARCHAR(255),
        drive_file_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(
      `ALTER TABLE employee_face_embeddings ADD COLUMN IF NOT EXISTS drive_file_id VARCHAR(255);`,
    );
    await client.query(
      `ALTER TABLE employee_face_embeddings ADD COLUMN IF NOT EXISTS drive_file_url TEXT;`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_employee_face_embeddings_employee_id
       ON employee_face_embeddings(employee_id);`,
    );
    await client.query(
      `ALTER TABLE employee_face_embeddings
       ALTER COLUMN model SET DEFAULT 'face-api.js';`,
    );

    // Add CHECK constraints if they don't exist (safe, conditional).
    await client.query(`DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'employees_role_check'
      ) THEN
        ALTER TABLE employees ADD CONSTRAINT employees_role_check CHECK (role IN (
          'GCM','GCM Staff','CM','FCR','Driver','Embalmer','Attendant','Attendant/Asst Embalmer','Driver/Asst Embalmer','Driver/Attendant','Driver/Embalmer'
        ));
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'employees_day_off_check'
      ) THEN
        ALTER TABLE employees ADD CONSTRAINT employees_day_off_check CHECK (day_off IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'));
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'employees_status_check'
      ) THEN
        ALTER TABLE employees ADD CONSTRAINT employees_status_check CHECK (status IN ('active','on_leave','inactive'));
      END IF;
    END$$;`);

    /*
     * ========================================================
     * EMPLOYEE CHAPELS
     * ========================================================
     *
     * Allows one employee to be assigned to multiple chapels.
     *
     * Example:
     *
     * Divine Grace Carbonell
     *   - Pagadian
     *   - Buug
     *
     */

    await client.query(`
      CREATE TABLE IF NOT EXISTS employee_chapels (
        employee_id INTEGER NOT NULL
          REFERENCES employees(id)
          ON DELETE CASCADE,

        chapel_id INTEGER NOT NULL
          REFERENCES chapels(id)
          ON DELETE CASCADE,

        assigned_at TIMESTAMPTZ
          DEFAULT NOW(),

        PRIMARY KEY (
          employee_id,
          chapel_id
        )
      );
    `);

    /*
     * ========================================================
     * USERS
     * ========================================================
     */

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,

        email VARCHAR(255) NOT NULL UNIQUE,

        password_hash TEXT NOT NULL,

        full_name VARCHAR(255) NOT NULL,

        /*
         * Primary chapel of the user
         */
        chapel_id INTEGER
          REFERENCES chapels(id)
          ON DELETE SET NULL,

        role VARCHAR(50) NOT NULL
          DEFAULT 'gcm_super_admin'
          CHECK (
            role IN (
                'gcm_super_admin',
                'cm_admin',
                'fcr'
            )
          ),

        created_at TIMESTAMPTZ
          DEFAULT NOW(),

        updated_at TIMESTAMPTZ
          DEFAULT NOW()
      );
    `);

    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
        UPDATE users SET role = 'gcm_super_admin' WHERE role = 'admin';
        UPDATE users SET role = 'fcr' WHERE role = 'staff';
        ALTER TABLE users
          ADD CONSTRAINT users_role_check
          CHECK (role IN ('gcm_super_admin', 'cm_admin', 'fcr'));
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    /*
     * ========================================================
     * ATTENDANCE RECORDS
     * ========================================================
     */

    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance_records (
        id SERIAL PRIMARY KEY,

        employee_id INTEGER NOT NULL
          REFERENCES employees(id)
          ON DELETE CASCADE,

        attendance_date DATE NOT NULL,

        status VARCHAR(20) NOT NULL
          CHECK (
            status IN (
              'present',
              'late',
              'absent',
              'on_leave',
              'day_off'
            )
          ),

        check_in TIMESTAMPTZ,

        check_out TIMESTAMPTZ,

        working_hours NUMERIC(5,2)
          DEFAULT 0,

        source VARCHAR(50)
          DEFAULT 'manual',

        notes TEXT,

        created_at TIMESTAMPTZ
          DEFAULT NOW(),

        updated_at TIMESTAMPTZ
          DEFAULT NOW(),

        UNIQUE (
          employee_id,
          attendance_date
        )
      );
    `);

    /* ========================================================
     * EMPLOYEE LEAVES
     * ========================================================
     *
     * Stores individual leave dates for attendance.
     *
     * Leave requests/approval are handled by another system.
     *
     * Example:
     *   Employee 1 - 2026-09-16 - VL
     *   Employee 1 - 2026-09-17 - VL
     *   Employee 1 - 2026-09-19 - SL
     *
     * Each date is independent.
     * ======================================================== */

    await client.query(`
  CREATE TABLE IF NOT EXISTS employee_leaves (
    id SERIAL PRIMARY KEY,

    employee_id INTEGER NOT NULL
      REFERENCES employees(id)
      ON DELETE CASCADE,

    leave_date DATE NOT NULL,

    leave_type VARCHAR(20) NOT NULL
      CHECK (
        leave_type IN (
          'VL',
          'SL',
          'ML',
          'PL',
          'DO'
        )
      ),

    notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (
      employee_id,
      leave_date
    )
  );
`);

    /*
     * ========================================================
     * PUBLIC UPLOADS
     * ========================================================
     */

    await client.query(`
      CREATE TABLE IF NOT EXISTS public_uploads (
        id SERIAL PRIMARY KEY,

        employee_id INTEGER
          REFERENCES employees(id)
          ON DELETE SET NULL,

        employee_name VARCHAR(255) NOT NULL,

        attendance_type VARCHAR(50) NOT NULL
          CHECK (
            attendance_type IN (
              'Time In',
              'Time Out',
              'Break In',
              'Break Out'
            )
          ),

        file_name VARCHAR(255) NOT NULL,

        file_path TEXT NOT NULL,

        capture_datetime TIMESTAMPTZ,

        uploaded_by VARCHAR(255),

        attendance_record_id INTEGER
          REFERENCES attendance_records(id)
          ON DELETE SET NULL,

        created_at TIMESTAMPTZ
          DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS employee_schedules (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        schedule_date DATE NOT NULL,
        time_in TIME NOT NULL,
        time_out TIME NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (employee_id, schedule_date),
        CHECK (time_out > time_in)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS employee_day_offs (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        day_off_date DATE NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (employee_id, day_off_date)
      );
    `);

    await client.query(`
      ALTER TABLE public_uploads
      ADD COLUMN IF NOT EXISTS attendance_record_id INTEGER
        REFERENCES attendance_records(id)
        ON DELETE SET NULL;
    `);

    /*
     * ========================================================
     * DEFAULT CHAPELS
     * ========================================================
     */

    await client.query(`
      INSERT INTO chapels (
        name,
        location
      )
      VALUES
        ('Zamboanga', 'Zamboanga'),
        ('Pagadian', 'Pagadian'),
        ('Ipil', 'Ipil'),
        ('Buug', 'Buug'),
        ('Tangub', 'Tangub'),
        ('Oroquieta', 'Oroquieta')
      ON CONFLICT (name)
      DO NOTHING;
    `);

    /*
     * ========================================================
     * DEFAULT ADMIN
     * ========================================================
     */

    const adminCheck = await client.query(`
      SELECT 1
      FROM users
      WHERE role = 'gcm_super_admin'
      LIMIT 1
    `);

    if (adminCheck.rowCount === 0) {
      const chapelResult = await client.query(
        `
          SELECT id
          FROM chapels
          WHERE name = 'Zamboanga'
          LIMIT 1
          `,
      );

      const chapelId =
        chapelResult.rowCount > 0 ? chapelResult.rows[0].id : null;

      const adminEmail = process.env.ADMIN_EMAIL || "dennisqp@stpeter.com.ph";

      const adminPassword = process.env.ADMIN_PASSWORD;

      if (!adminPassword || adminPassword.length < 12) {
        throw new Error(
          "ADMIN_PASSWORD must be set to at least 12 characters before the first production startup.",
        );
      }

      const passwordHash = bcrypt.hashSync(adminPassword, SALT_ROUNDS);

      await client.query(
        `
        INSERT INTO users (
          email,
          password_hash,
          full_name,
          chapel_id,
          role
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          'gcm_super_admin'
        )
        ON CONFLICT (email)
        DO NOTHING
        `,
        [adminEmail, passwordHash, "System Admin", chapelId],
      );

      console.log(`Default admin ensured: ${adminEmail}`);
    } else {
      console.log("Admin user already exists.");
    }

    /*
     * ========================================================
     * INDEXES
     * ========================================================
     */

    await client.query(`
      CREATE INDEX IF NOT EXISTS
      idx_employees_chapel
      ON employees(chapel_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS
      idx_employees_role
      ON employees(role);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS
      idx_employee_chapels_employee
      ON employee_chapels(employee_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS
      idx_employee_chapels_chapel
      ON employee_chapels(chapel_id);
    `);

    /*
     * Attempt to migrate any existing rows from the old employee_schedules
     * table (if present) into the new per-employee `day_off`, `time_in`,
     * and `time_out` columns. Best-effort: if table missing or rows
     * malformed, continue without failing startup.
     */
    try {
      const old = await client.query(
        `SELECT employee_id, day_of_week, time_in, time_out, is_day_off FROM employee_schedules`,
      );
      if (old && old.rowCount > 0) {
        const byEmp = {};
        for (const r of old.rows) {
          const id = String(r.employee_id);
          byEmp[id] = byEmp[id] || [];
          byEmp[id].push(r);
        }
        for (const [empId, rows] of Object.entries(byEmp)) {
          // find a day marked as day off
          const offRow = rows.find((x) => x.is_day_off === true);
          const day_off = offRow ? offRow.day_of_week : "Sunday";

          // find first non-day-off row for default times
          const workRow =
            rows.find((x) => !x.is_day_off && x.time_in && x.time_out) ||
            rows[0];
          const time_in = workRow ? workRow.time_in : "08:00:00";
          const time_out = workRow ? workRow.time_out : "17:00:00";

          await client.query(
            `UPDATE employees SET day_off = $1, time_in = $2, time_out = $3 WHERE id = $4`,
            [day_off, time_in, time_out, empId],
          );
        }
        console.log(
          `Migrated schedule rows into employees.day_off/time_in/time_out`,
        );
      }
    } catch (e) {
      // old table not present or migration failed — continue
    }

    await client.query(`
      CREATE INDEX IF NOT EXISTS
      idx_attendance_employee_date
      ON attendance_records(
        employee_id,
        attendance_date
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS
      idx_attendance_date
      ON attendance_records(attendance_date);
    `);

    await client.query(`
  CREATE INDEX IF NOT EXISTS
  idx_employee_leaves_employee
  ON employee_leaves(employee_id);
`);

    await client.query(`
  CREATE INDEX IF NOT EXISTS
  idx_employee_leaves_date
  ON employee_leaves(leave_date);
`);

    await client.query(`
  CREATE INDEX IF NOT EXISTS
  idx_employee_leaves_employee_date
  ON employee_leaves(employee_id, leave_date);
`);

    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE employee_leaves
          DROP CONSTRAINT IF EXISTS employee_leaves_leave_type_check;
        ALTER TABLE employee_leaves
          ADD CONSTRAINT employee_leaves_leave_type_check
          CHECK (leave_type IN ('VL', 'SL', 'ML', 'PL', 'DO'));
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    console.log("Database initialized successfully.");

    return client;
  } catch (error) {
    console.error("Database connection failed.");

    console.error("PostgreSQL connection details:", dbLogConfig);

    console.error("Error:", error && (error.stack || error.message || error));

    throw error;
  }
}

module.exports = {
  initializeDatabase,
};
