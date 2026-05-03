// pages/api/jquants.js
// J-Quants API v2 対応（2025年12月22日以降の新アカウント用）
// APIキーをそのままBearerトークンとして使用

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, apiKey, code } = req.body;

  // サーバー環境変数からAPIキーを取得（設定されていればそちらを優先）
  const jqApiKey = process.env.JQUANTS_API_KEY || apiKey;

  if (!jqApiKey) {
    return res.status(400).json({ error: "J-Quants APIキーが必要です" });
  }

  // v2: APIキーをそのままBearerトークンとして使用
  const headers = {
    Authorization: `Bearer ${jqApiKey}`,
    "Content-Type": "application/json",
  };

  try {
    // ─────────────────────────────────
    // Action: verify → 接続確認
    // ─────────────────────────────────
    if (action === "verify") {
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
      const r = await fetch(
        `https://api.jquants.com/v1/prices/daily_quotes?code=7203&date=${dateStr}`,
        { headers }
      );
      if (r.status === 401) {
        return res.status(401).json({ error: "APIキーが無効です。J-Quantsダッシュボードで確認してください" });
      }
      return res.status(200).json({ ok: true });
    }

    // ─────────────────────────────────
    // Action: fetch → 銘柄データ取得
    // ─────────────────────────────────
    if (action === "fetch") {
      if (!code) {
        return res.status(400).json({ error: "銘柄コードが必要です" });
      }

      const items = {
        stockPrice: null, netSales: null, opProfit: null, netProfit: null,
        eps: null, bps: null, equityRatio: null,
        fcastSales: null, fcastOpProfit: null, fcastEps: null,
        per: null, pbr: null, roe: null, fetchedAt: null,
      };
      const retrieved = [];
      const failed = [];

      // 株価取得（最大5営業日前までさかのぼる）
      const today = new Date();
      let gotPrice = false;
      for (let i = 0; i < 5; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10).replace(/-/g, "");
        try {
          const pRes = await fetch(
            `https://api.jquants.com/v1/prices/daily_quotes?code=${code}&date=${dateStr}`,
            { headers }
          );
          if (pRes.ok) {
            const pData = await pRes.json();
            const q = pData.daily_quotes?.[0];
            if (q?.Close) {
              items.stockPrice = q.Close;
              items.fetchedAt = `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} 終値`;
              retrieved.push("株価");
              gotPrice = true;
              break;
            }
          } else if (pRes.status === 401) {
            return res.status(401).json({ error: "APIキーの認証に失敗しました" });
          }
        } catch (_) {}
      }
      if (!gotPrice) failed.push("株価");

      // 財務データ取得
      try {
        const fRes = await fetch(
          `https://api.jquants.com/v1/fins/statements?code=${code}`,
          { headers }
        );
        if (fRes.ok) {
          const fData = await fRes.json();
          const stmts = fData.statements || [];

          const annual = stmts
            .filter(s =>
              s.TypeOfDocument?.includes("Annual") ||
              s.TypeOfDocument?.includes("FY") ||
              s.TypeOfDocument === "3"
            )
            .sort((a, b) =>
              (b.CurrentPeriodEndDate || "").localeCompare(a.CurrentPeriodEndDate || "")
            );
          const latest = annual[0] || stmts[stmts.length - 1];

          if (latest) {
            const pick = (srcKey, destKey) => {
              const v = latest[srcKey];
              if (v !== undefined && v !== null && v !== "") {
                items[destKey] = Number(v);
                retrieved.push(destKey);
              } else {
                failed.push(destKey);
              }
            };
            pick("NetSales",                     "netSales");
            pick("OperatingProfit",               "opProfit");
            pick("Profit",                        "netProfit");
            pick("EarningsPerShare",              "eps");
            pick("BookValuePerShare",             "bps");
            pick("ForecastNetSales",              "fcastSales");
            pick("ForecastOperatingProfit",       "fcastOpProfit");
            pick("ForecastEarningsPerShare",      "fcastEps");

            const eqRaw = latest["EquityToAssetRatio"];
            if (eqRaw !== undefined && eqRaw !== null && eqRaw !== "") {
              items.equityRatio = (Number(eqRaw) * 100).toFixed(1);
              retrieved.push("自己資本比率");
            } else {
              failed.push("自己資本比率");
            }
          }
        }
      } catch (_) {
        ["売上高","営業利益","純利益","EPS","BPS","自己資本比率"].forEach(k => failed.push(k));
      }

      // コードで計算（AIに推測させない）
      const useEps = items.fcastEps || items.eps;
      if (items.stockPrice && useEps && useEps > 0) {
        items.per = (items.stockPrice / useEps).toFixed(1);
        retrieved.push("PER(計算済)");
      } else failed.push("PER");

      if (items.stockPrice && items.bps && items.bps > 0) {
        items.pbr = (items.stockPrice / items.bps).toFixed(2);
        retrieved.push("PBR(計算済)");
      } else failed.push("PBR");

      if (items.eps && items.bps && items.bps > 0) {
        items.roe = ((items.eps / items.bps) * 100).toFixed(1);
        retrieved.push("ROE(計算済)");
      } else failed.push("ROE");

      const total = retrieved.length + failed.length;
      const sufficiency = total > 0 ? Math.round((retrieved.length / total) * 100) : 0;

      return res.status(200).json({ ...items, retrieved, failed, sufficiency, code });
    }

    return res.status(400).json({ error: "不明なaction: " + action });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
