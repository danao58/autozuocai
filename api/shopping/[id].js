const { query } = require("../_lib/db");
const { handleError, methodNotAllowed, parseBody, sendJson } = require("../_lib/http");

function mapItem(row) {
  return {
    id: row.id,
    ingredientId: row.ingredient_id || "",
    name: row.name,
    count: Number(row.count) || 0,
    unit: row.unit || "",
    checked: Boolean(row.checked)
  };
}

module.exports = async function handler(req, res) {
  const { id } = req.query;
  try {
    if (req.method === "PUT") {
      const body = parseBody(req);
      const result = await query(
        `
          update app_shopping_items
          set ingredient_id = nullif($2, ''),
              name = $3,
              count = $4,
              unit = $5,
              checked = coalesce($6, checked),
              updated_at = now()
          where id = $1
          returning *
        `,
        [id, body.ingredientId || "", body.name, body.count || 1, body.unit || "", body.checked]
      );
      sendJson(res, result.rows[0] ? 200 : 404, result.rows[0] ? mapItem(result.rows[0]) : { error: "Shopping item not found" });
      return;
    }

    if (req.method === "DELETE") {
      await query("delete from app_shopping_items where id = $1", [id]);
      sendJson(res, 200, { ok: true });
      return;
    }

    methodNotAllowed(res, ["PUT", "DELETE"]);
  } catch (error) {
    handleError(res, error);
  }
};
