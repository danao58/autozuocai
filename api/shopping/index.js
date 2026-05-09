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
  try {
    if (req.method === "GET") {
      const result = await query("select * from app_shopping_items order by created_at");
      sendJson(res, 200, result.rows.map(mapItem));
      return;
    }

    if (req.method === "POST") {
      const body = parseBody(req);
      const result = await query(
        `
          insert into app_shopping_items (id, ingredient_id, name, count, unit, checked)
          values ($1, nullif($2, ''), $3, $4, $5, coalesce($6, false))
          returning *
        `,
        [body.id, body.ingredientId || "", body.name, body.count || 1, body.unit || "", body.checked || false]
      );
      sendJson(res, 201, mapItem(result.rows[0]));
      return;
    }

    methodNotAllowed(res, ["GET", "POST"]);
  } catch (error) {
    handleError(res, error);
  }
};
