const { query } = require("../_lib/db");
const { handleError, methodNotAllowed, parseBody, sendJson } = require("../_lib/http");

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const result = await query("select id, name from app_tags order by sort_order, created_at");
      sendJson(res, 200, result.rows);
      return;
    }

    if (req.method === "POST") {
      const body = parseBody(req);
      const result = await query(
        `
          insert into app_tags (id, name, sort_order)
          values ($1, $2, coalesce((select max(sort_order) + 1 from app_tags), 0))
          returning id, name
        `,
        [body.id, body.name]
      );
      sendJson(res, 201, result.rows[0]);
      return;
    }

    if (req.method === "PUT") {
      const body = parseBody(req);
      const current = await query("select name from app_tags where id = $1", [req.query.id]);
      if (!current.rowCount) {
        sendJson(res, 404, { error: "Tag not found" });
        return;
      }
      await query("update app_recipe_tags set tag_name = $2 where tag_name = $1", [current.rows[0].name, body.name]);
      const result = await query(
        "update app_tags set name = $2, updated_at = now() where id = $1 returning id, name",
        [req.query.id, body.name]
      );
      sendJson(res, 200, result.rows[0]);
      return;
    }

    if (req.method === "DELETE") {
      const current = await query("select name from app_tags where id = $1", [req.query.id]);
      if (current.rowCount) {
        await query("delete from app_recipe_tags where tag_name = $1", [current.rows[0].name]);
      }
      await query("delete from app_tags where id = $1", [req.query.id]);
      sendJson(res, 200, { ok: true });
      return;
    }

    methodNotAllowed(res, ["GET", "POST", "PUT", "DELETE"]);
  } catch (error) {
    handleError(res, error);
  }
};
