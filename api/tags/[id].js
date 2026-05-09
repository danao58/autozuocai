const { query } = require("../_lib/db");
const { handleError, methodNotAllowed, parseBody, sendJson } = require("../_lib/http");

module.exports = async function handler(req, res) {
  const { id } = req.query;
  try {
    if (req.method === "PUT") {
      const body = parseBody(req);
      const current = await query("select name from app_tags where id = $1", [id]);
      if (!current.rowCount) {
        sendJson(res, 404, { error: "Tag not found" });
        return;
      }
      await query("update app_recipe_tags set tag_name = $2 where tag_name = $1", [current.rows[0].name, body.name]);
      const result = await query(
        "update app_tags set name = $2, updated_at = now() where id = $1 returning id, name",
        [id, body.name]
      );
      sendJson(res, 200, result.rows[0]);
      return;
    }

    if (req.method === "DELETE") {
      const current = await query("select name from app_tags where id = $1", [id]);
      if (current.rowCount) {
        await query("delete from app_recipe_tags where tag_name = $1", [current.rows[0].name]);
      }
      await query("delete from app_tags where id = $1", [id]);
      sendJson(res, 200, { ok: true });
      return;
    }

    methodNotAllowed(res, ["PUT", "DELETE"]);
  } catch (error) {
    handleError(res, error);
  }
};
