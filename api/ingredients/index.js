const { query } = require("../_lib/db");
const { handleError, methodNotAllowed, parseBody, sendJson } = require("../_lib/http");

function mapIngredient(row) {
  return {
    id: row.id,
    name: row.name,
    categoryId: row.category_id || "",
    stock: Number(row.stock) || 0,
    unit: row.unit || "",
    expireAt: row.expire_at ? row.expire_at.toISOString().slice(0, 10) : ""
  };
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const result = await query("select * from app_ingredients order by created_at");
      sendJson(res, 200, result.rows.map(mapIngredient));
      return;
    }

    if (req.method === "POST") {
      const body = parseBody(req);
      const result = await query(
        `
          insert into app_ingredients (id, name, category_id, stock, unit, expire_at)
          values ($1, $2, nullif($3, ''), $4, $5, nullif($6, '')::date)
          returning *
        `,
        [body.id, body.name, body.categoryId || "", body.stock || 0, body.unit || "", body.expireAt || ""]
      );
      sendJson(res, 201, mapIngredient(result.rows[0]));
      return;
    }

    methodNotAllowed(res, ["GET", "POST"]);
  } catch (error) {
    handleError(res, error);
  }
};
