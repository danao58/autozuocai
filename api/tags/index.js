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

    methodNotAllowed(res, ["GET", "POST"]);
  } catch (error) {
    handleError(res, error);
  }
};
