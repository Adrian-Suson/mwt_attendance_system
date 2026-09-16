const { Client } = require("pg");
const path = require("path");

const { dbConfig } = require(path.join(__dirname, "..", "src", "config"));

/*
 * ============================================================
 * EMPLOYEE ROLES
 * ============================================================
 */

const EMPLOYEE_ROLES = [
  "GCM",
  "GCM Staff",
  "CM",
  "FCR",
  "Driver",
  "Embalmer",
  "Attendant",
  "Attendant/Asst Embalmer",
  "Driver/Asst Embalmer",
  "Driver/Attendant",
  "Driver/Embalmer",
];

/*
 * ============================================================
 * DEFAULT EMPLOYEE SCHEDULE
 * ============================================================
 *
 * Monday    08:00 AM - 05:00 PM
 * Tuesday   08:00 AM - 05:00 PM
 * Wednesday 08:00 AM - 05:00 PM
 * Thursday  08:00 AM - 05:00 PM
 * Friday    08:00 AM - 05:00 PM
 * Saturday  08:00 AM - 05:00 PM
 * Sunday    DAY OFF
 *
 */

const DEFAULT_SCHEDULE = [
  {
    day: "Monday",
    timeIn: "08:00",
    timeOut: "17:00",
    dayOff: false,
  },
  {
    day: "Tuesday",
    timeIn: "08:00",
    timeOut: "17:00",
    dayOff: false,
  },
  {
    day: "Wednesday",
    timeIn: "08:00",
    timeOut: "17:00",
    dayOff: false,
  },
  {
    day: "Thursday",
    timeIn: "08:00",
    timeOut: "17:00",
    dayOff: false,
  },
  {
    day: "Friday",
    timeIn: "08:00",
    timeOut: "17:00",
    dayOff: false,
  },
  {
    day: "Saturday",
    timeIn: "08:00",
    timeOut: "17:00",
    dayOff: false,
  },
  {
    day: "Sunday",
    timeIn: null,
    timeOut: null,
    dayOff: true,
  },
];

/*
 * ============================================================
 * EMPLOYEE LIST
 * ============================================================
 *
 * Source: Existing DTR employee list
 *
 */

const dtrEmployees = [
  {
    firstName: "DENNIS",
    lastName: "Q. PAMARAN",
    role: "GCM",
    chapels: [],
  },

  {
    firstName: "DIVINE GRACE",
    lastName: "CARBONELL",
    role: "CM",
    chapels: ["Pagadian", "Buug"],
  },

  {
    firstName: "GILBERT",
    lastName: "DELA CRUZ",
    role: "CM",
    chapels: ["Oroquieta"],
  },

  {
    firstName: "EDUARDO",
    lastName: "BARICCA",
    role: "CM",
    chapels: ["Tangub"],
  },

  {
    firstName: "MARJORIE",
    lastName: "BAUTISTA",
    role: "CM",
    chapels: ["Ipil"],
  },

  {
    firstName: "EMMYLOU",
    lastName: "MARIANO",
    role: "CM",
    chapels: ["Zamboanga"],
  },

  {
    firstName: "ADRIAN DR.",
    lastName: "SUSON",
    role: "GCM Staff",
    chapels: ["Zamboanga"],
  },

  {
    firstName: "LENIE MAY",
    lastName: "AUSEJO",
    role: "FCR",
    chapels: ["Zamboanga"],
  },

  {
    firstName: "SHEILA",
    lastName: "VILLANO",
    role: "FCR",
    chapels: ["Zamboanga"],
  },

  {
    firstName: "ROWELL",
    lastName: "MENDIJA",
    role: "FCR",
    chapels: ["Zamboanga"],
  },

  {
    firstName: "DANICA MAE",
    lastName: "LEDESMA",
    role: "FCR",
    chapels: ["Zamboanga"],
  },

  {
    firstName: "DEAN VINCENT",
    lastName: "TAMPARONG",
    role: "FCR",
    chapels: ["Pagadian"],
  },

  {
    firstName: "KIESHA CHARISSE",
    lastName: "BELLOAN",
    role: "FCR",
    chapels: ["Pagadian"],
  },

  {
    firstName: "RUBEN",
    lastName: "QUIPTE",
    role: "Driver",
    chapels: ["Buug"],
  },

  {
    firstName: "JOEL",
    lastName: "PANTUJAN",
    role: "Driver",
    chapels: ["Tangub"],
  },

  {
    firstName: "JUSIL",
    lastName: "ANTIPUESTO",
    role: "Driver",
    chapels: ["Oroquieta"],
  },

  {
    firstName: "CARY",
    lastName: "VILLANO",
    role: "Driver",
    chapels: ["Ipil"],
  },

  {
    firstName: "GREGORIO",
    lastName: "MATIAS",
    role: "Embalmer",
    chapels: ["Zamboanga"],
  },

  {
    firstName: "ERNIE",
    lastName: "DICO",
    role: "Embalmer",
    chapels: ["Tangub"],
  },

  {
    firstName: "DANIEL",
    lastName: "LAYOGUE",
    role: "Embalmer",
    chapels: ["Ipil"],
  },

  {
    firstName: "GLESERIO",
    lastName: "PAQUIBO",
    role: "Embalmer",
    chapels: ["Ipil"],
  },

  {
    firstName: "MICHAEL ARCH",
    lastName: "DANIEL",
    role: "Embalmer",
    chapels: ["Tangub"],
  },

  {
    firstName: "ENGELINE MAE",
    lastName: "TRIBUNALO",
    role: "Attendant",
    chapels: ["Pagadian"],
  },

  {
    firstName: "FREDE",
    lastName: "BERONDO",
    role: "Attendant",
    chapels: ["Pagadian"],
  },

  {
    firstName: "ROMEL",
    lastName: "MANUEL",
    role: "Attendant",
    chapels: ["Zamboanga"],
  },

  {
    firstName: "ROMANO",
    lastName: "CANTIGA",
    role: "Attendant",
    chapels: ["Ipil"],
  },

  {
    firstName: "JEFFREY",
    lastName: "DELOS REYES",
    role: "Attendant",
    chapels: ["Zamboanga"],
  },

  {
    firstName: "SUNNY",
    lastName: "CASTOR",
    role: "Attendant",
    chapels: ["Zamboanga"],
  },

  {
    firstName: "SANTIE",
    lastName: "ALFON",
    role: "Attendant",
    chapels: ["Zamboanga"],
  },

  {
    firstName: "JOEY",
    lastName: "DELA CRUZ",
    role: "Attendant/Asst Embalmer",
    chapels: ["Zamboanga"],
  },

  {
    firstName: "LOLIBOY",
    lastName: "ALMEDA",
    role: "Attendant/Asst Embalmer",
    chapels: ["Ipil"],
  },

  {
    firstName: "JUVEN",
    lastName: "ANTIPUESTO",
    role: "Attendant/Asst Embalmer",
    chapels: ["Oroquieta"],
  },

  {
    firstName: "HANZ",
    lastName: "CALAPIZ",
    role: "Attendant/Asst Embalmer",
    chapels: ["Oroquieta"],
  },

  {
    firstName: "JERRY",
    lastName: "LLEDO",
    role: "Attendant/Asst Embalmer",
    chapels: ["Zamboanga"],
  },

  {
    firstName: "JOVEN",
    lastName: "RENDON",
    role: "Driver/Asst Embalmer",
    chapels: ["Zamboanga"],
  },

  {
    firstName: "ELBERT JOHN",
    lastName: "FUTALAN",
    role: "Driver/Asst Embalmer",
    chapels: ["Zamboanga"],
  },

  {
    firstName: "RAMIL",
    lastName: "LIMEN",
    role: "Driver/Asst Embalmer",
    chapels: ["Zamboanga"],
  },

  {
    firstName: "RICHIE",
    lastName: "DELA CRUZ",
    role: "Driver/Asst Embalmer",
    chapels: ["Zamboanga"],
  },

  {
    firstName: "ROLANDO",
    lastName: "MINDANG",
    role: "Driver/Attendant",
    chapels: ["Ipil"],
  },

  {
    firstName: "IAN",
    lastName: "MORANDARTE",
    role: "Driver/Attendant",
    chapels: ["Buug"],
  },

  {
    firstName: "ROLANDO",
    lastName: "SAGOSO",
    role: "Driver/Attendant",
    chapels: ["Zamboanga"],
  },

  {
    firstName: "ELMER",
    lastName: "MONTEVERDE",
    role: "Driver/Attendant",
    chapels: ["Zamboanga"],
  },

  {
    firstName: "EARL JOHN",
    lastName: "NAVARRO",
    role: "Driver/Attendant",
    chapels: ["Zamboanga"],
  },

  {
    firstName: "OLIVER",
    lastName: "SUNURAN",
    role: "Driver/Attendant",
    chapels: ["Zamboanga"],
  },

  {
    firstName: "ELVIN",
    lastName: "DAGALEA",
    role: "Driver/Attendant",
    chapels: ["Zamboanga"],
  },

  {
    firstName: "NELVIN",
    lastName: "DAGALEA",
    role: "Driver/Attendant",
    chapels: ["Zamboanga"],
  },

  {
    firstName: "ALBRICH",
    lastName: "ANDRADE",
    role: "Driver/Attendant",
    chapels: ["Zamboanga"],
  },

  {
    firstName: "REY-AN",
    lastName: "BALATERO",
    role: "Driver/Attendant",
    chapels: ["Tangub"],
  },

  {
    firstName: "JESUS",
    lastName: "DELOS REYES",
    role: "Driver/Embalmer",
    chapels: ["Zamboanga"],
  },

  {
    firstName: "JEFFREY",
    lastName: "OGOCIERDO",
    role: "Driver/Embalmer",
    chapels: ["Pagadian"],
  },

  {
    firstName: "JULIETO",
    lastName: "QUINTANA",
    role: "Driver/Embalmer",
    chapels: ["Pagadian"],
  },

  {
    firstName: "JAY",
    lastName: "MATIAS",
    role: "Driver/Embalmer",
    chapels: ["Oroquieta"],
  },

  {
    firstName: "EDDIE",
    lastName: "SONOGAN",
    role: "Driver/Embalmer",
    chapels: ["Oroquieta"],
  },

  {
    firstName: "JASON",
    lastName: "DE ASIS",
    role: "Driver/Embalmer",
    chapels: ["Pagadian"],
  },

  {
    firstName: "DANDY",
    lastName: "TARIMAN",
    role: "Driver",
    chapels: ["Pagadian"],
  },
];

/*
 * ============================================================
 * ENSURE CHAPEL
 * ============================================================
 */

async function ensureChapel(client, chapelName, chapelMap) {
  if (!chapelName) {
    return null;
  }

  const key = chapelName.trim().toLowerCase();

  if (chapelMap.has(key)) {
    return chapelMap.get(key);
  }

  const result = await client.query(
    `
    INSERT INTO chapels (
      name,
      location
    )
    VALUES ($1, $1)
    ON CONFLICT (name)
    DO UPDATE SET
      name = EXCLUDED.name
    RETURNING id
    `,
    [chapelName.trim()],
  );

  const chapelId = result.rows[0].id;

  chapelMap.set(key, chapelId);

  return chapelId;
}

/*
 * ============================================================
 * ENSURE EMPLOYEE SCHEDULE
 * ============================================================
 */

async function ensureEmployeeSchedule(client, employeeId) {
  // Determine default day_off and default times from DEFAULT_SCHEDULE
  const off = DEFAULT_SCHEDULE.find((d) => d.dayOff) || { day: "Sunday" };
  const work =
    DEFAULT_SCHEDULE.find((d) => !d.dayOff && d.timeIn && d.timeOut) ||
    DEFAULT_SCHEDULE[0];
  const day_off = off.day;
  const time_in = work.timeIn ? `${work.timeIn}:00` : "08:00:00";
  const time_out = work.timeOut ? `${work.timeOut}:00` : "17:00:00";
  await client.query(
    `UPDATE employees SET day_off = $1, time_in = $2, time_out = $3 WHERE id = $4`,
    [day_off, time_in, time_out, employeeId],
  );
}

/*
 * ============================================================
 * MAIN SEED
 * ============================================================
 */

async function run() {
  const client = new Client(dbConfig);

  await client.connect();

  console.log("Connected to PostgreSQL.");

  try {
    /*
     * ==========================================================
     * TRANSACTION
     * ==========================================================
     */

    await client.query("BEGIN");

    /*
     * ==========================================================
     * ENSURE EMPLOYEE-CHAPELS TABLE
     * ==========================================================
     */

    await client.query(`
      CREATE TABLE IF NOT EXISTS employee_chapels (
        employee_id INTEGER
          REFERENCES employees(id)
          ON DELETE CASCADE,

        chapel_id INTEGER
          REFERENCES chapels(id)
          ON DELETE CASCADE,

        PRIMARY KEY (
          employee_id,
          chapel_id
        )
      );
    `);

    /*
     * ==========================================================
     * LOAD EXISTING CHAPELS
     * ==========================================================
     */

    const chapelResult = await client.query(
      `
      SELECT
        id,
        name
      FROM chapels
      `,
    );

    const chapelMap = new Map(
      chapelResult.rows.map((row) => [row.name.toLowerCase(), row.id]),
    );

    /*
     * ==========================================================
     * COUNTERS
     * ==========================================================
     */

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let chapelAssignments = 0;
    let schedulesCreated = 0;

    /*
     * ==========================================================
     * PROCESS EMPLOYEES
     * ==========================================================
     */

    for (const employee of dtrEmployees) {
      const firstName = employee.firstName?.trim() || "";

      const lastName = employee.lastName?.trim() || "";

      const role = EMPLOYEE_ROLES.includes(employee.role)
        ? employee.role
        : "Attendant";

      /*
       * --------------------------------------------------------
       * FIND EXISTING EMPLOYEE
       * --------------------------------------------------------
       */

      const existing = await client.query(
        `
        SELECT id
        FROM employees
        WHERE LOWER(first_name) = LOWER($1)
          AND LOWER(last_name) = LOWER($2)
        LIMIT 1
        `,
        [firstName, lastName],
      );

      let employeeId;

      /*
       * --------------------------------------------------------
       * CREATE / UPDATE EMPLOYEE
       * --------------------------------------------------------
       */

      if (existing.rowCount > 0) {
        employeeId = existing.rows[0].id;

        await client.query(
          `
          UPDATE employees
          SET
            role = $1,
            employment_type = COALESCE(
              employment_type,
              'Regular'
            ),
            updated_at = NOW()
          WHERE id = $2
          `,
          [role, employeeId],
        );

        updated++;
      } else {
        /*
         * Primary chapel
         *
         * First chapel in the list is considered
         * the employee's primary chapel.
         */

        let primaryChapelId = null;

        if (Array.isArray(employee.chapels) && employee.chapels.length > 0) {
          primaryChapelId = await ensureChapel(
            client,
            employee.chapels[0],
            chapelMap,
          );
        }

        const result = await client.query(
          `
          INSERT INTO employees (
            first_name,
            last_name,
            role,
            chapel_id,
            employment_type,
            status
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            'Regular',
            'active'
          )
          RETURNING id
          `,
          [firstName, lastName, role, primaryChapelId],
        );

        employeeId = result.rows[0].id;

        created++;
      }

      /*
       * --------------------------------------------------------
       * CHAPEL ASSIGNMENTS
       * --------------------------------------------------------
       *
       * Supports multiple chapels.
       *
       * Example:
       *
       * Divine Grace Carbonell
       * Pagadian
       * Buug
       *
       */

      if (Array.isArray(employee.chapels)) {
        for (const chapelName of employee.chapels) {
          const chapelId = await ensureChapel(client, chapelName, chapelMap);

          if (!chapelId) {
            continue;
          }

          await client.query(
            `
            INSERT INTO employee_chapels (
              employee_id,
              chapel_id
            )
            VALUES (
              $1,
              $2
            )
            ON CONFLICT DO NOTHING
            `,
            [employeeId, chapelId],
          );

          chapelAssignments++;
        }
      }

      /*
       * --------------------------------------------------------
       * DEFAULT SCHEDULE
       * --------------------------------------------------------
       */

      const empRow = await client.query(
        `SELECT day_off, time_in, time_out FROM employees WHERE id = $1`,
        [employeeId],
      );
      const schedRow = empRow.rows[0] || null;
      if (!schedRow || !schedRow.day_off) {
        await ensureEmployeeSchedule(client, employeeId);
        schedulesCreated += 1;
      }
    }

    /*
     * ==========================================================
     * COMMIT
     * ==========================================================
     */

    await client.query("COMMIT");

    console.log("");
    console.log("==========================================");
    console.log(" EMPLOYEE SEED COMPLETE");
    console.log("==========================================");
    console.log(`Employees created: ${created}`);
    console.log(`Employees updated: ${updated}`);
    console.log(`Chapel assignments processed: ${chapelAssignments}`);
    console.log(`Schedules created: ${schedulesCreated}`);
    console.log("==========================================");
    console.log("");
    console.log("Default schedule:");
    console.log("Monday-Saturday: 08:00 - 17:00");
    console.log("Sunday: DAY OFF");
    console.log("");
  } catch (error) {
    /*
     * ==========================================================
     * ROLLBACK
     * ==========================================================
     */

    await client.query("ROLLBACK");

    console.error("");
    console.error("==========================================");
    console.error(" EMPLOYEE SEED FAILED");
    console.error("==========================================");
    console.error(error.stack || error);

    throw error;
  } finally {
    await client.end();

    console.log("PostgreSQL connection closed.");
  }
}

/*
 * ============================================================
 * RUN DIRECTLY
 * ============================================================
 */

if (require.main === module) {
  run()
    .then(() => {
      process.exit(0);
    })
    .catch(() => {
      process.exit(1);
    });
}

/*
 * ============================================================
 * EXPORT
 * ============================================================
 */

module.exports = {
  run,
  dtrEmployees,
  DEFAULT_SCHEDULE,
};
