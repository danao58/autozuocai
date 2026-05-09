const { importSnapshot } = require("./_lib/app-data");
const { handleError, methodNotAllowed, parseBody, sendJson } = require("./_lib/http");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      methodNotAllowed(res, ["POST"]);
      return;
    }

    await importSnapshot(parseBody(req));
    sendJson(res, 200, { ok: true });
  } catch (error) {
    handleError(res, error);
  }
};
