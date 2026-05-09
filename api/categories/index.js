const { query } = require("../_lib/db");
const { handleError, methodNotAllowed, parseBody, sendJson } = require("../_lib/http");

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const result = await query("select id, name from app_categories order by sort_order, created_at");
      sendJson(res, 200, result.rows);
      return;
    }

    if (req.method === "POST") {
      const body = parseBody(req);
      const result = await query(
        `
          insert into app_categories (id, name, sort_order)
          values ($1, $2, coalesce((select max(sort_order) + 1 from app_categories), 0))
          returning id, name
        `,
        [body.id, body.name]
      );
      sendJson(res, 201, result.rows[0]);
      return;
    }

    if (req.method === "PUT") {
      const body = parseBody(req);
      const result = await query(
        "update app_categories set name = $2, updated_at = now() where id = $1 returning id, name",
        [req.query.id, body.name]
      );
      sendJson(res, result.rows[0] ? 200 : 404, result.rows[0] || { error: "Category not found" });
      return;
    }

    if (req.method === "DELETE") {
      const used = await query("select 1 from app_ingredients where category_id = $1 limit 1", [req.query.id]);
      if (used.rowCount) {
        sendJson(res, 409, { error: "Category has ingredients" });
        return;
      }
      await query("delete from app_categories where id = $1", [req.query.id]);
      sendJson(res, 200, { ok: true });
      return;
    }

    methodNotAllowed(res, ["GET", "POST", "PUT", "DELETE"]);
  } catch (error) {
    handleError(res, error);
  }
};
