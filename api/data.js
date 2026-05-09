const { importSnapshot, readSnapshot } = require("./_lib/app-data");
const { handleError, methodNotAllowed, parseBody, sendJson } = require("./_lib/http");

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      sendJson(res, 200, await readSnapshot());
      return;
    }

    if (req.method === "PUT") {
      await importSnapshot(parseBody(req));
      sendJson(res, 200, { ok: true });
      return;
    }

    methodNotAllowed(res, ["GET", "PUT"]);
  } catch (error) {
    handleError(res, error);
  }
};
