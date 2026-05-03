// pages/api/jquants.js
// J-Quants API v2 対応（2025年12月22日以降登録ユーザー用）
// ヘッダー: x-api-key  /  ベースURL: /v2/

const BASE = "https://api.jquants.com/v2";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { action, apiKey, code } = req.body;
  const jqApiKey = process.env.JQUANTS_API_KEY || apiKey;
  if (!jqApiKey) return res.status(400).json({ error: "J-Quants APIキーが必要です" });

  // V2: x-api-key ヘッダー
  const headers = { "x-api-key": jqApiKey, "Content-Type": "application/json" };

  try {
    // ─── 接続確認 ─────────────────────────────
    if (action === "verify") {
      const r = await fetch(`${BASE}/listed/equities?code=72030`, { headers });
      if (r.status === 401 || r.status === 403) {
        return res.status(401).json({ error: `APIキーが無効です（${r.status}）` });
      }
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: `J-Quants APIエラー: ${r.status} ${JSON.stringify(body).slice(0, 100)}` });
      }
      return res.status(200).json({ ok: true });
    }

    // ─── 銘柄データ取得 ──────────────────────
    if (action === "fetch") {
      if (!code) return res.status(400).json({ error: "銘柄コードが必要です" });

      const items = {
        stockPrice: null, netSales: null, opProfit: null, netProfit: null,
        eps: null, bps: null, equityRatio: null,
        fcastSales: null, fcastOpProfit: null, fcastEps: null,
        per: null, pbr: null, roe: null, fetchedAt: null,
      };
      const retrieved = [], failed = [];

      // 株価取得（/v2/equities/bars/daily）
      const today = new Date();
      let gotPrice = false;
      for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10).replace(/-/g, "");
        try {
          const pRes = await fetch(`${BASE}/equities/bars/daily?code=${code}&date=${dateStr}`, { headers });
          if (pRes.ok) {
            const pData = await pRes.json();
            // V2レスポンス形式: { bars: [{...}] } or { daily_quotes: [{...}] }
            const bar = (pData.bars || pData.daily_quotes || [])[0];
            const closePrice = bar?.Close || bar?.close || bar?.AdjClose || bar?.adj_close;
            if (closePrice) {
              items.stockPrice = closePrice;
              items.fetchedAt = `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} 終値`;
              retrieved.push("株価");
              gotPrice = true;
              break;
            }
          } else if (pRes.status === 401 || pRes.status === 403) {
            return res.status(401).json({ error: "APIキーの認証に失敗しました" });
          }
        } catch (_) {}
      }
      if (!gotPrice) failed.push("株価");

      // 財務データ取得（/v2/fins/summary or /v2/fins/statements）
      try {
        // まずsummaryエンドポイントを試す
        const fRes = await fetch(`${BASE}/fins/summary?code=${code}`, { headers });
        if (fRes.ok) {
          const fData = await fRes.json();
          const stmts = fData.summary || fData.statements || [];
          const annual = stmts
            .filter(s => !s.TypeOfDocument || s.TypeOfDocument?.includes("Annual") || s.TypeOfDocument?.includes("FY"))
            .sort((a, b) => (b.DisclosedDate || b.CurrentPeriodEndDate || "").localeCompare(a.DisclosedDate || a.CurrentPeriodEndDate || ""));
          const latest = annual[0] || stmts[stmts.length - 1];

          if (latest) {
            const pick = (keys, destKey) => {
              for (const k of keys) {
                const v = latest[k];
                if (v !== undefined && v !== null && v !== "") {
                  items[destKey] = Number(v);
                  retrieved.push(destKey);
                  return;
                }
              }
              failed.push(destKey);
            };
            pick(["NetSales", "net_sales", "Sales"], "netSales");
            pick(["OperatingProfit", "operating_profit"], "opProfit");
            pick(["Profit", "profit", "NetIncome"], "netProfit");
            pick(["EarningsPerShare", "eps", "EPS"], "eps");
            pick(["BookValuePerShare", "bps", "BPS"], "bps");
            pick(["ForecastNetSales", "forecast_net_sales"], "fcastSales");
            pick(["ForecastOperatingProfit", "forecast_operating_profit"], "fcastOpProfit");
            pick(["ForecastEarningsPerShare", "forecast_eps"], "fcastEps");
            const eqKeys = ["EquityToAssetRatio", "equity_to_asset_ratio", "EquityRatio"];
            for (const k of eqKeys) {
              if (latest[k] !== undefined && latest[k] !== null) {
                const val = Number(latest[k]);
                items.equityRatio = (val > 1 ? val : val * 100).toFixed(1);
                retrieved.push("自己資本比率");
                break;
              }
            }
            if (!retrieved.includes("自己資本比率")) failed.push("自己資本比率");
          }
        }
      } catch (_) {}

      // コードで計算
      const useEps = items.fcastEps || items.eps;
      if (items.stockPrice && useEps && useEps > 0) { items.per = (items.stockPrice / useEps).toFixed(1); retrieved.push("PER"); } else failed.push("PER");
      if (items.stockPrice && items.bps && items.bps > 0) { items.pbr = (items.stockPrice / items.bps).toFixed(2); retrieved.push("PBR"); } else failed.push("PBR");
      if (items.eps && items.bps && items.bps > 0) { items.roe = ((items.eps / items.bps) * 100).toFixed(1); retrieved.push("ROE"); } else failed.push("ROE");

      const total = retrieved.length + failed.length;
      const sufficiency = total > 0 ? Math.round((retrieved.length / total) * 100) : 0;
      return res.status(200).json({ ...items, retrieved, failed, sufficiency, code });
    }

    return res.status(400).json({ error: "不明なaction: " + action });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
