import { json } from "@sveltejs/kit";
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization,x-termlings-token"
};
function corsJson(payload, init) {
  const response = json(payload, init);
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}
function corsEmpty() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}
function isAuthorized(request) {
  const token = process.env.TERMLINGS_API_TOKEN?.trim();
  if (!token) return true;
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const prefix = "Bearer ";
    if (authHeader.startsWith(prefix) && authHeader.slice(prefix.length) === token) {
      return true;
    }
  }
  const tokenHeader = request.headers.get("x-termlings-token");
  if (tokenHeader && tokenHeader === token) {
    return true;
  }
  return false;
}
export {
  corsJson as a,
  corsEmpty as c,
  isAuthorized as i
};
