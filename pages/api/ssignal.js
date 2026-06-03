export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { codes, apiKey } = req.body;
  const code = codes?.[0] || "6981";
  const debug = {};

  // stooqテスト
  try {
    const url = `https://stooq.com/q/d/l/?s=${code}.jp&i=d`;
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
    const text = await r.text();
    const lines = text.trim().split("\n");
    debug.stooq = { ok: r.ok, status: r.status, lines: lines.length, sample: lines[1] };
  } catch(e) { debug.stooq = { ok: false, error: e.message }; }

  // J-Quantsテスト
  if (apiKey) {
    try {
      const url = `https://api.jquants.com/v2/equities/bars/daily?code=${code}&date=20260603`;
      const r = await fetch(url, { headers: { "x-api-key": apiKey }, signal: AbortSignal.timeout(8000) });
      const json = await r.json();
      debug.jquants = { ok: r.ok, status: r.status, keys: Object.keys(json), count: json.daily_quotes?.length ?? json.bars?.length ?? 0 };
    } catch(e) { debug.jquants = { ok: false, error: e.message }; }
  }

  return res.status(200).json({ results: [{ code, name: "DEBUG", score: 99, rsi: 50, close: 100, patterns: [{ key: "DEBUG", emoji: "🔧", label: JSON.stringify(debug) }], perfect_order: false, s_count: 0, ma5:0,ma25:0,ma75:0,ma200:0 }], debug, total: 1 });
}
