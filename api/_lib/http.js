function sendJson(res, status, data) {
  res.status(status).json(data);
}

function methodNotAllowed(res, methods) {
  res.setHeader("Allow", methods.join(", "));
  sendJson(res, 405, { error: "Method not allowed" });
}

function handleError(res, error) {
  console.error(error);
  const message = error.message === "DATABASE_URL is not configured"
    ? "DATABASE_URL is not configured"
    : "Request failed";
  sendJson(res, 500, { error: message });
}

function parseBody(req) {
  if (!req.body) return {};
  return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
}

module.exports = {
  handleError,
  methodNotAllowed,
  parseBody,
  sendJson
};
