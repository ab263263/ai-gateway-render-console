export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runKeepalive(env));
  },
  async fetch(request, env, ctx) {
    const result = await runKeepalive(env);
    return new Response(JSON.stringify(result, null, 2), {
      status: result.ok ? 200 : 500,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
};

async function runKeepalive(env) {
  const urls = [env.KEEPALIVE_URL, env.KEEPALIVE_URL_FALLBACK].filter(Boolean);
  const results = [];
  let ok = true;

  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: { 'user-agent': 'cf-render-keepalive/1.0' }
      });
      results.push({ url, status: resp.status, ok: resp.ok });
      if (!resp.ok) ok = false;
    } catch (error) {
      ok = false;
      results.push({ url, ok: false, error: String(error) });
    }
  }

  return {
    ok,
    checkedAt: new Date().toISOString(),
    results
  };
}
