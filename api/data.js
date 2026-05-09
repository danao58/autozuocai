const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = async function handler(req, res) {
  if (!process.env.DATABASE_URL) {
    res.status(500).json({ error: "DATABASE_URL is not configured" });
    return;
  }

  try {
    if (req.method === "GET") {
      const result = await pool.query("select data from app_data where id = $1", ["main"]);
      res.status(200).json(result.rows[0]?.data || {});
      return;
    }

    if (req.method === "PUT") {
      const data = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      await pool.query(
        `
          insert into app_data (id, data, updated_at)
          values ($1, $2::jsonb, now())
          on conflict (id)
          do update set data = excluded.data, updated_at = now()
        `,
        ["main", JSON.stringify(data || {})]
      );
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader("Allow", "GET, PUT");
    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Database request failed" });
  }
};
