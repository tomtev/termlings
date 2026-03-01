const GET = () => {
  return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
    headers: {
      "content-type": "application/json"
    }
  });
};
export {
  GET
};
