const { query } = require("../_lib/db");
const { handleError, methodNotAllowed, parseBody, sendJson } = require("../_lib/http");

module.exports = async function handler(req, res) {
  const { id } = req.query;
  try {
    if (req.method === "PUT") {
      const body = parseBody(req);
      const result = await query(
        "update app_categories set name = $2, updated_at = now() where id = $1 returning id, name",
        [id, body.name]
      );
      sendJson(res, result.rows[0] ? 200 : 404, result.rows[0] || { error: "Category not found" });
      return;
    }

    if (req.method === "DELETE") {
      const used = await query("select 1 from app_ingredients where category_id = $1 limit 1", [id]);
      if (used.rowCount) {
        sendJson(res, 409, { error: "Category has ingredients" });
        return;
      }
      await query("delete from app_categories where id = $1", [id]);
      sendJson(res, 200, { ok: true });
      return;
    }

    methodNotAllowed(res, ["PUT", "DELETE"]);
  } catch (error) {
    handleError(res, error);
  }
};
