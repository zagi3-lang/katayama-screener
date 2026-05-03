// pages/api/jquants.js - J-Quants API v2 (x-api-key)

const BASE = "https://api.jquants.com/v2";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { action, apiKey, code } = req.body;
  const jqApiKey = process.env.JQUANTS_API_KEY || apiKey;
  if (!jqApiKey) return res.status(400).json({ error: "APIキーが必要です" });
  const headers = { "x-api-key": jqApiKey };

  // ─── 接続確認 ──────────────────────────────
  if (action === "verify") {
    try {
      // 直近の平日を取得（土日をスキップ）
      const d = new Date();
      d.setDate(d.getDate() - 2); // 2日前から試す
      const dateStr = d.toISOString().slice(0,10).replace(/-/g,"");
      const r = await fetch(
        `${BASE}/equities/bars/daily?code=72030&date=${dateStr}`,
        { headers }
      );
      if (r.status === 401 || r.status === 403) {
        return res.status(401).json({ error: `APIキーが無効です（${r.status}）` });
      }
      // 400や404はデータなしだが認証OK
      if (r.status === 400 || r.status === 404 || r.ok) {
        return res.status(200).json({ ok: true });
      }
      return res.status(r.status).json({ error: `接続エラー: ${r.status}` });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ─── 銘柄データ取得 ─────────────────────
  if (action === "fetch") {
    if (!code) return res.status(400).json({ error: "銘柄コードが必要です" });
    const debug = {}; // デバッグ用

    const items = {
      stockPrice: null, netSales: null, opProfit: null, netProfit: null,
      eps: null, bps: null, equityRatio: null,
      fcastSales: null, fcastOpProfit: null, fcastEps: null,
      per: null, pbr: null, roe: null, fetchedAt: null,
    };
    const retrieved = [], failed = [];

    // 株価取得
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0,10).replace(/-/g,"");
      try {
        const pRes = await fetch(`${BASE}/equities/bars/daily?code=${code}&date=${dateStr}`, { headers });
        debug[`price_${dateStr}_status`] = pRes.status;
        if (pRes.ok) {
          const pData = await pRes.json();
          debug[`price_${dateStr}_keys`] = Object.keys(pData);
          // レスポンスの最初のアイテムのキーを確認
          const arr = pData.bars || pData.daily_quotes || pData.equities || pData.data || [];
          debug[`price_${dateStr}_arr_len`] = arr.length;
          if (arr.length > 0) debug[`price_${dateStr}_item_keys`] = Object.keys(arr[0]);
          const bar = arr[0];
          if (bar) {
            // 様々なキー名を試す
            const close = bar.Close ?? bar.close ?? bar.AdjClose ?? bar.adj_close ?? bar.ClosePrice ?? bar.close_price;
            if (close) {
              items.stockPrice = close;
              items.fetchedAt = `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} 終値`;
              retrieved.push("株価");
              break;
            }
          }
        }
      } catch(e) { debug[`price_err`] = e.message; }
    }
    if (!items.stockPrice) failed.push("株価");

    // 財務データ取得 - 複数エンドポイントを試す
    const finEndpoints = [
      `${BASE}/fins/summary?code=${code}`,
      `${BASE}/fins/statements?code=${code}`,
      `${BASE}/fins/financial_statements?code=${code}`,
    ];

    for (const url of finEndpoints) {
      try {
        const fRes = await fetch(url, { headers });
        debug[`fins_${url.split('/').pop()}_status`] = fRes.status;
        if (fRes.ok) {
          const fData = await fRes.json();
          debug[`fins_keys`] = Object.keys(fData);
          const arr = fData.summary || fData.statements || fData.financial_statements || fData.data || [];
          debug[`fins_arr_len`] = arr.length;
          if (arr.length > 0) {
            debug[`fins_item_keys`] = Object.keys(arr[0]).slice(0, 20);
            const stmts = arr;
            const annual = stmts
              .filter(s => !s.TypeOfDocument || s.TypeOfDocument?.includes("Annual") || s.TypeOfDocument?.includes("FY") || s.TypeOfDocument === "3")
              .sort((a,b) => (b.DisclosedDate||b.CurrentPeriodEndDate||"").localeCompare(a.DisclosedDate||a.CurrentPeriodEndDate||""));
            const latest = annual[0] || stmts[stmts.length-1];
            if (latest) {
              const pick = (keys, destKey) => {
                for (const k of keys) {
                  const v = latest[k];
                  if (v !== undefined && v !== null && v !== "") { items[destKey] = Number(v); retrieved.push(destKey); return; }
                }
                failed.push(destKey);
              };
              pick(["NetSales","net_sales","Sales","sales"], "netSales");
              pick(["OperatingProfit","operating_profit","OperatingIncome"], "opProfit");
              pick(["Profit","profit","NetIncome","net_income"], "netProfit");
              pick(["EarningsPerShare","eps","EPS","earnings_per_share"], "eps");
              pick(["BookValuePerShare","bps","BPS","book_value_per_share"], "bps");
              pick(["ForecastNetSales","forecast_net_sales"], "fcastSales");
              pick(["ForecastOperatingProfit","forecast_operating_profit"], "fcastOpProfit");
              pick(["ForecastEarningsPerShare","forecast_eps","ForecastEPS"], "fcastEps");
              for (const k of ["EquityToAssetRatio","equity_to_asset_ratio","EquityRatio","equity_ratio"]) {
                if (latest[k] !== undefined && latest[k] !== null) {
                  const val = Number(latest[k]);
                  items.equityRatio = (val > 1 ? val : val * 100).toFixed(1);
                  retrieved.push("自己資本比率"); break;
                }
              }
              if (!retrieved.includes("自己資本比率")) failed.push("自己資本比率");
            }
            break; // 成功したらループ終了
          }
        }
      } catch(e) { debug[`fins_err`] = e.message; }
    }

    // コードで計算
    const useEps = items.fcastEps || items.eps;
    if (items.stockPrice && useEps && useEps > 0) { items.per = (items.stockPrice / useEps).toFixed(1); retrieved.push("PER"); } else failed.push("PER");
    if (items.stockPrice && items.bps && items.bps > 0) { items.pbr = (items.stockPrice / items.bps).toFixed(2); retrieved.push("PBR"); } else failed.push("PBR");
    if (items.eps && items.bps && items.bps > 0) { items.roe = ((items.eps / items.bps) * 100).toFixed(1); retrieved.push("ROE"); } else failed.push("ROE");

    const total = retrieved.length + failed.length;
    const sufficiency = total > 0 ? Math.round((retrieved.length / total) * 100) : 0;
    return res.status(200).json({ ...items, retrieved, failed, sufficiency, code, debug });
  }

  return res.status(400).json({ error: "不明なaction" });
}
