// pages/api/jquants.js
// ★ サーバーサイドでJ-Quantsを呼ぶ → CORSの問題なし

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, email, password, code, idToken } = req.body;

  try {
    // ─────────────────────────────────
    // Action: login → IDトークン取得
    // ─────────────────────────────────
    if (action === "login") {
      if (!email || !password) {
        return res.status(400).json({ error: "メールアドレスとパスワードが必要です" });
      }

      // Step1: リフレッシュトークン取得
      const r1 = await fetch("https://api.jquants.com/v1/token/auth_user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailaddress: email, password }),
      });
      const d1 = await r1.json();
      if (!d1.refreshToken) {
        return res.status(401).json({ error: d1.message || "ログイン失敗。メールアドレス・パスワードを確認してください" });
      }

      // Step2: IDトークン取得
      const r2 = await fetch(
        `https://api.jquants.com/v1/token/auth_refresh?refreshtoken=${d1.refreshToken}`
      );
      const d2 = await r2.json();
      if (!d2.idToken) {
        return res.status(401).json({ error: d2.message || "IDトークン取得失敗" });
      }

      return res.status(200).json({ idToken: d2.idToken });
    }

    // ─────────────────────────────────
    // Action: fetch → 銘柄データ取得
    // ─────────────────────────────────
    if (action === "fetch") {
      if (!code || !idToken) {
        return res.status(400).json({ error: "銘柄コードとIDトークンが必要です" });
      }

      const headers = {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      };

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

          // 最新の通期決算を優先取得
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
            const pick = (key, label) => {
              const v = latest[key];
              if (v !== undefined && v !== null && v !== "") {
                items[label] = Number(v);
                retrieved.push(label);
              } else {
                failed.push(label);
              }
            };
            pick("NetSales",                    "netSales");
            pick("OperatingProfit",              "opProfit");
            pick("Profit",                       "netProfit");
            pick("EarningsPerShare",             "eps");
            pick("BookValuePerShare",            "bps");
            pick("EquityToAssetRatio",           "equityRatioRaw");
            pick("ForecastNetSales",             "fcastSales");
            pick("ForecastOperatingProfit",      "fcastOpProfit");
            pick("ForecastEarningsPerShare",     "fcastEps");

            // 自己資本比率は%換算
            if (items.equityRatioRaw != null) {
              items.equityRatio = (items.equityRatioRaw * 100).toFixed(1);
              retrieved.push("自己資本比率");
            } else {
              failed.push("自己資本比率");
            }
            delete items.equityRatioRaw;
          }
        } else if (fRes.status === 401) {
          // IDトークン期限切れ
          return res.status(401).json({ error: "IDトークンの期限が切れました。再ログインしてください" });
        }
      } catch (_) {
        ["売上高","営業利益","純利益","EPS","BPS","自己資本比率","会社予想売上","会社予想営業利益","会社予想EPS"]
          .forEach(k => failed.push(k));
      }

      // ★ コードで計算（AIに推測させない）
      const useEps = items.fcastEps || items.eps;
      if (items.stockPrice && useEps && useEps > 0) {
        items.per = (items.stockPrice / useEps).toFixed(1);
        retrieved.push("PER(計算済)");
      } else {
        failed.push("PER");
      }

      if (items.stockPrice && items.bps && items.bps > 0) {
        items.pbr = (items.stockPrice / items.bps).toFixed(2);
        retrieved.push("PBR(計算済)");
      } else {
        failed.push("PBR");
      }

      if (items.eps && items.bps && items.bps > 0) {
        items.roe = ((items.eps / items.bps) * 100).toFixed(1);
        retrieved.push("ROE(計算済)");
      } else {
        failed.push("ROE");
      }

      const total = retrieved.length + failed.length;
      const sufficiency = total > 0 ? Math.round((retrieved.length / total) * 100) : 0;

      return res.status(200).json({
        ...items, retrieved, failed, sufficiency, code,
      });
    }

    return res.status(400).json({ error: "不明なaction: " + action });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
