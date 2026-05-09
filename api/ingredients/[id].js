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
  const { id } = req.query;
  try {
    if (req.method === "PUT") {
      const body = parseBody(req);
      const result = await query(
        `
          update app_ingredients
          set name = $2,
              category_id = nullif($3, ''),
              stock = $4,
              unit = $5,
              expire_at = nullif($6, '')::date,
              updated_at = now()
          where id = $1
          returning *
        `,
        [id, body.name, body.categoryId || "", body.stock || 0, body.unit || "", body.expireAt || ""]
      );
      sendJson(res, result.rows[0] ? 200 : 404, result.rows[0] ? mapIngredient(result.rows[0]) : { error: "Ingredient not found" });
      return;
    }

    if (req.method === "DELETE") {
      await query("delete from app_ingredients where id = $1", [id]);
      sendJson(res, 200, { ok: true });
      return;
    }

    methodNotAllowed(res, ["PUT", "DELETE"]);
  } catch (error) {
    handleError(res, error);
  }
};
