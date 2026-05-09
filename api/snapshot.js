const { readSnapshot } = require("./_lib/app-data");
const { handleError, methodNotAllowed, sendJson } = require("./_lib/http");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      methodNotAllowed(res, ["GET"]);
      return;
    }

    sendJson(res, 200, await readSnapshot());
  } catch (error) {
    handleError(res, error);
  }
};
