// pages/api/market-bars.js
// 指定日の「全上場銘柄」の日足を1回で取得する（J-Quants v2）
//   GET /v2/equities/bars/daily?date=YYYYMMDD  → その日の全銘柄が返る（銘柄数に非依存）
// 返却: { ok, count, bars:[{code, c, v, va}], rateLimited?, error? }
//   code = 4桁に正規化 / c=終値(C) / v=出来高(Vo) / va=売買代金(Va, 後の流動性フィルタ用)
// 祝日・非営業日は data:[] が返るので count:0 で ok を返す（クライアント側でスキップ）。

const V2 = "https://api.jquants.com/v2";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  const { apiKey, date } = req.body || {};
  if (!apiKey) return res.status(200).json({ ok: false, error: "apiKey required" });
  if (!date)   return res.status(200).json({ ok: false, error: "date required" });

  const ymd = String(date).replace(/-/g, "");   // v2 は YYYYMMDD
  const headers = { "x-api-key": apiKey };

  try {
    const bars = [];
    let pageKey = null;
    let pages = 0;

    do {
      const url = new URL(`${V2}/equities/bars/daily`);
      url.searchParams.set("date", ymd);
      if (pageKey) url.searchParams.set("pagination_key", pageKey);

      const r = await fetch(url.toString(), { headers });

      if (r.status === 429) return res.status(200).json({ ok: false, rateLimited: true });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        return res.status(200).json({ ok: false, error: `HTTP ${r.status} ${t.slice(0, 200)}` });
      }

      const json = await r.json();
      const rows = json.data || [];
      for (const d of rows) {
        const code = String(d.Code ?? d.code ?? "").slice(0, 4);   // 5桁→4桁
        const c  = Number(d.C  ?? d.Close  ?? d.c);
        const v  = Number(d.Vo ?? d.Volume ?? d.v);
        const va = Number(d.Va ?? d.TurnoverValue ?? 0);           // 売買代金
        if (!code || !isFinite(c)) continue;
        bars.push({ code, c, v: isFinite(v) ? v : 0, va: isFinite(va) ? va : 0 });
      }
      pageKey = json.pagination_key || null;
      pages++;
    } while (pageKey && pages < 20);

    return res.status(200).json({ ok: true, count: bars.length, bars });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message });
  }
}
