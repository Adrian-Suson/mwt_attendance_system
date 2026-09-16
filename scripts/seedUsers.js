const bcrypt = require("bcrypt");
const path = require("path");
const { Client } = require("pg");
const { dbConfig } = require(path.join(__dirname, "..", "src", "config"));

const chapelUsers = [
  { email: "zamboangachapel@stpeter.com.ph", chapel: "Zamboanga" },
  { email: "ipilchapel@stpeter.com.ph", chapel: "Ipil" },
  { email: "buugchapel@stpeter.com.ph", chapel: "Buug" },
  { email: "pagadianchapel@stpeter.com.ph", chapel: "Pagadian" },
  { email: "tangubchapel@stpeter.com.ph", chapel: "Tangub" },
  { email: "oroquietachapel@stpeter.com.ph", chapel: "Oroquieta" },
  { email: "pagadiandaochapel@stpeter.com.ph", chapel: "Pagadian DAO" },
];

async function seedUsers() {
  const gcmPassword = process.env.GCM_USER_PASSWORD || "admin123";
  const chapelPassword = process.env.CHAPEL_USER_PASSWORD || "admin123";

  const client = new Client(dbConfig);
  await client.connect();

  try {
    await client.query(
      `INSERT INTO chapels (name, location)
       VALUES ('Pagadian DAO', 'Pagadian DAO')
       ON CONFLICT (name) DO NOTHING`,
    );

    const gcmHash = await bcrypt.hash(gcmPassword, 10);
    await client.query(
      `INSERT INTO users (email, password_hash, full_name, chapel_id, role)
       VALUES ($1, $2, $3, NULL, 'gcm_super_admin')
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         full_name = EXCLUDED.full_name,
         chapel_id = NULL,
         role = EXCLUDED.role,
         updated_at = NOW()`,
      ["dennisqp@stpeter.com.ph", gcmHash, "Dennis Q. Pamaran"],
    );

    const chapelHash = await bcrypt.hash(chapelPassword, 10);
    for (const user of chapelUsers) {
      await client.query(
        `INSERT INTO users (email, password_hash, full_name, chapel_id, role)
         SELECT $1, $2, $3, c.id, 'cm_admin'
         FROM chapels c
         WHERE c.name = $4
         ON CONFLICT (email) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           full_name = EXCLUDED.full_name,
           chapel_id = EXCLUDED.chapel_id,
           role = EXCLUDED.role,
           updated_at = NOW()`,
        [user.email, chapelHash, `${user.chapel} Chapel`, user.chapel],
      );
    }

    console.log("Configured GCM and chapel CM users successfully.");
  } finally {
    await client.end();
  }
}

seedUsers().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
