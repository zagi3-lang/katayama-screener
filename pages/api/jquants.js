// pages/api/jquants.js - J-Quants API v2 (x-api-key)
// 確定データ版: 株価・時価総額・売上YoY・ROE・PER・PBR をすべてJ-Quantsから算出する

const BASE = "https://api.jquants.com/v2";

// ── 共通ヘルパ ───────────────────────────────
const num = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const pickNum = (obj, keys) => {
  for (const k of keys) {
    const v = num(obj?.[k]);
    if (v !== null) return v;
  }
  return null;
};

const pickStr = (obj, keys) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return null;
};

const K = {
  // ── J-Quants v2 の実フィールド名（略称）を先頭に置く ──
  // v1系の長い名前は互換のため後ろに残す
  netSales:    ["Sales", "NetSales", "net_sales", "sales", "Revenue", "revenue"],
  opProfit:    ["OP", "OperatingProfit", "operating_profit", "OperatingIncome"],
  ordProfit:   ["OdP", "OrdinaryProfit", "ordinary_profit"],
  netProfit:   ["NP", "Profit", "profit", "NetIncome", "net_income"],
  eps:         ["EPS", "EarningsPerShare", "eps", "earnings_per_share"],
  dilutedEps:  ["DEPS", "DilutedEarningsPerShare"],
  bps:         ["BPS", "BookValuePerShare", "bps", "book_value_per_share"],
  totalAssets: ["TA", "TotalAssets", "total_assets"],
  equity:      ["Eq", "Equity", "equity", "NetAssets", "net_assets", "TotalNetAssets"],
  equityRatio: ["EqAR", "EquityToAssetRatio", "equity_to_asset_ratio", "EquityRatio", "equity_ratio"],
  fcastSales:  ["FcstSales", "NxtYrFcstSales", "ForecastNetSales", "forecast_net_sales"],
  fcastOp:     ["FcstOP", "NxtYrFcstOP", "ForecastOperatingProfit", "forecast_operating_profit"],
  fcastEps:    ["FcstEPS", "NxtYrFcstEPS", "ForecastEarningsPerShare", "forecast_eps", "ForecastEPS"],
  // 発行済株式数・自己株式：v2での略称が未確認のため候補を広めに取る
  shares: [
    "ShOut", "IssShares", "NumShares", "SharesOut", "TotalShares",
    "NumberOfIssuedAndOutstandingSharesAtTheEndOfFiscalYearIncludingTreasuryStock",
    "NumberOfIssuedAndOutstandingShares", "IssuedShares", "issued_shares",
  ],
  treasury: [
    "TrSh", "TreasuryShares", "NumTreasury", "TrStock",
    "NumberOfTreasuryStockAtTheEndOfFiscalYear",
    "NumberOfTreasuryStock", "treasury_stock",
  ],
  period:    ["CurPerType", "TypeOfCurrentPeriod", "type_of_current_period", "Period", "period"],
  periodEnd: ["CurPerEn", "CurrentPeriodEndDate", "current_period_end_date", "PeriodEndDate"],
  fyEnd:     ["CurFYEn", "CurrentFiscalYearEndDate", "current_fiscal_year_end_date"],
  disclosed: ["DiscDate", "DisclosedDate", "disclosed_date", "Date", "date"],
  docType:   ["DocType", "TypeOfDocument", "type_of_document"],
};

const fmtDate = (d) =>
  `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;

// 四半期ラベル → 年換算の倍率（ROEの年率換算用）
const annualizeFactor = (period) => {
  switch (String(period || "").toUpperCase()) {
    case "1Q": return 4;
    case "2Q": return 2;
    case "3Q": return 4 / 3;
    case "FY": return 1;
    default:   return null;
  }
};

const periodLabel = (p) => {
  const s = String(p || "").toUpperCase();
  if (s === "FY") return "通期";
  if (["1Q", "2Q", "3Q"].includes(s)) return `${s}累計`;
  return null;
};

const sufficiencyOf = (retrieved, failed) => {
  const total = retrieved.length + failed.length;
  return total > 0 ? Math.round((retrieved.length / total) * 100) : 0;
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { action, apiKey, code, codes } = req.body;
  const jqApiKey = process.env.JQUANTS_API_KEY || apiKey;
  if (!jqApiKey) return res.status(400).json({ error: "APIキーが必要です" });
  const headers = { "x-api-key": jqApiKey };

  // ─── 接続確認 ──────────────────────────────
  if (action === "verify") {
    try {
      const d = new Date();
      d.setDate(d.getDate() - 2);
      const dateStr = d.toISOString().slice(0, 10).replace(/-/g, "");
      const r = await fetch(`${BASE}/equities/bars/daily?code=72030&date=${dateStr}`, { headers });
      if (r.status === 401 || r.status === 403) {
        return res.status(401).json({ error: `APIキーが無効です（${r.status}）` });
      }
      if (r.status === 400 || r.status === 404 || r.ok) return res.status(200).json({ ok: true });
      return res.status(r.status).json({ error: `接続エラー: ${r.status}` });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ─── 複数銘柄まとめて取得（発掘タブ用）──────
  if (action === "fetchMany") {
    const list = Array.isArray(codes) ? codes.slice(0, 10) : [];
    if (list.length === 0) return res.status(400).json({ error: "銘柄コードが必要です" });
    const settled = await Promise.allSettled(list.map((c) => fetchOne(c, headers)));
    const results = {};
    list.forEach((c, i) => {
      results[c] = settled[i].status === "fulfilled"
        ? settled[i].value
        : { code: c, error: settled[i].reason?.message || "取得失敗" };
    });
    return res.status(200).json({ results });
  }

  // ─── 単一銘柄取得 ─────────────────────────
  if (action === "fetch") {
    if (!code) return res.status(400).json({ error: "銘柄コードが必要です" });
    try {
      return res.status(200).json(await fetchOne(code, headers));
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: "不明なaction" });
}

// ══════════════════════════════════════════════
// 1銘柄ぶんの確定データを組み立てる
// ══════════════════════════════════════════════
async function fetchOne(code, headers) {
  const debug = {};
  const retrieved = [], failed = [];
  const items = {
    code,
    stockPrice: null, priceDate: null,
    netSales: null, opProfit: null, netProfit: null,
    eps: null, bps: null, equity: null, equityRatio: null,
    fcastSales: null, fcastOpProfit: null, fcastEps: null,
    per: null, pbr: null, roe: null,
    roeBasis: null,          // "2025/12期 通期実績" / "2Q累計・年率換算"
    salesYoY: null,          // 直近実績の前年同期比（%）
    salesYoYBasis: null,     // "2026/12期 2Q累計 前年同期比"
    sharesOutstanding: null, // 発行済 − 自己株式
    marketCap: null,         // 円
    marketCapOku: null,      // 億円（表示用）
    statementDate: null,     // 財務データの開示日
    fetchedAt: null,         // このレスポンスを組み立てた日付
  };

  // ── 株価（直近営業日の終値）──────────────
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10).replace(/-/g, "");
    try {
      const r = await fetch(`${BASE}/equities/bars/daily?code=${code}&date=${dateStr}`, {
        headers, signal: AbortSignal.timeout(8000),
      });
      debug[`price_${dateStr}`] = r.status;
      if (!r.ok) continue;
      const j = await r.json();
      const arr = j.daily_quotes ?? j.bars ?? j.equities ?? j.data ?? [];
      const bar = arr[0];
      if (!bar) continue;
      // ssignal.js と同じキー順に揃える（v2は C / Close）
      const close = pickNum(bar, ["Close", "C", "close", "ClosePrice", "close_price"]);
      if (close && close > 0) {
        items.stockPrice = close;
        items.priceDate = pickStr(bar, ["Date", "date"]) || fmtDate(d);
        retrieved.push("株価");
        break;
      }
    } catch (e) { debug.price_err = e.message; }
  }
  if (!items.stockPrice) failed.push("株価");

  // ── 財務諸表（全期間を取得して並べ替える）──
  let stmts = [];
  for (const url of [
    `${BASE}/fins/statements?code=${code}`,
    `${BASE}/fins/summary?code=${code}`,
    `${BASE}/fins/financial_statements?code=${code}`,
  ]) {
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
      debug[`fins_${url.split("/").pop().split("?")[0]}`] = r.status;
      if (!r.ok) continue;
      const j = await r.json();
      const arr = j.statements ?? j.summary ?? j.financial_statements ?? j.data ?? [];
      if (Array.isArray(arr) && arr.length > 0) {
        stmts = arr;
        debug.fins_len = arr.length;
        debug.fins_keys = Object.keys(arr[0]); // 全件（株式数フィールド特定のため）
        break;
      }
    } catch (e) { debug.fins_err = e.message; }
  }

  if (stmts.length === 0) {
    failed.push("財務データ");
    items.fetchedAt = fmtDate(new Date());
    return { ...items, retrieved, failed, sufficiency: sufficiencyOf(retrieved, failed), debug };
  }

  // 開示日の昇順に並べる（最後が最新）
  const sorted = [...stmts].sort((a, b) =>
    (pickStr(a, K.disclosed) || "").localeCompare(pickStr(b, K.disclosed) || "")
  );
  const latest = sorted[sorted.length - 1];
  items.statementDate = pickStr(latest, K.disclosed);

  items.netSales      = pickNum(latest, K.netSales);
  items.opProfit      = pickNum(latest, K.opProfit);
  items.netProfit     = pickNum(latest, K.netProfit);
  items.eps           = pickNum(latest, K.eps);
  items.bps           = pickNum(latest, K.bps);
  items.equity        = pickNum(latest, K.equity);
  items.fcastSales    = pickNum(latest, K.fcastSales);
  items.fcastOpProfit = pickNum(latest, K.fcastOp);
  items.fcastEps      = pickNum(latest, K.fcastEps);
  ["netSales", "opProfit", "netProfit", "eps", "bps"].forEach((k) =>
    items[k] !== null ? retrieved.push(k) : failed.push(k)
  );

  const er = pickNum(latest, K.equityRatio);
  if (er !== null) {
    items.equityRatio = (er > 1 ? er : er * 100).toFixed(1);
    retrieved.push("自己資本比率");
  } else failed.push("自己資本比率");

  // ── ★ 売上成長率：同一期種どうしの前年同期比 ──
  // 「2Q累計 vs 前年2Q累計」で比較する。CAGRでも通期予想比でもない。
  const curPeriod = pickStr(latest, K.period);
  if (items.netSales !== null && curPeriod) {
    const lEnd = pickStr(latest, K.periodEnd) || pickStr(latest, K.disclosed) || "";
    const prior = [...sorted].reverse().find((s) => {
      if (s === latest) return false;
      if (pickStr(s, K.period) !== curPeriod) return false;
      const sEnd = pickStr(s, K.periodEnd) || pickStr(s, K.disclosed) || "";
      return sEnd < lEnd && pickNum(s, K.netSales) !== null;
    });
    if (prior) {
      const prev = pickNum(prior, K.netSales);
      if (prev && prev > 0) {
        items.salesYoY = +(((items.netSales / prev) - 1) * 100).toFixed(1);
        const fyEnd = pickStr(latest, K.fyEnd) || pickStr(latest, K.periodEnd) || "";
        const ym = fyEnd ? fyEnd.slice(0, 7).replace("-", "/") : "";
        items.salesYoYBasis = `${ym ? ym + "期 " : ""}${periodLabel(curPeriod) || curPeriod} 前年同期比`;
        retrieved.push("売上成長率(YoY)");
      }
    }
  }
  if (items.salesYoY === null) failed.push("売上成長率(YoY)");

  // ── ROE：通期実績を優先、四半期しかなければ年率換算 ──
  const fyStmt = [...sorted].reverse().find(
    (s) => String(pickStr(s, K.period) || "").toUpperCase() === "FY" &&
           pickNum(s, K.netProfit) !== null && pickNum(s, K.equity) !== null
  );
  if (fyStmt) {
    const p = pickNum(fyStmt, K.netProfit), eq = pickNum(fyStmt, K.equity);
    if (eq > 0) {
      items.roe = +((p / eq) * 100).toFixed(1);
      const fe = pickStr(fyStmt, K.fyEnd) || pickStr(fyStmt, K.periodEnd) || "";
      items.roeBasis = `${fe ? fe.slice(0, 7).replace("-", "/") + "期 " : ""}通期実績`;
      retrieved.push("ROE");
    }
  } else if (items.netProfit !== null && items.equity && items.equity > 0) {
    const f = annualizeFactor(curPeriod);
    if (f) {
      items.roe = +(((items.netProfit * f) / items.equity) * 100).toFixed(1);
      items.roeBasis = `${periodLabel(curPeriod) || curPeriod}・年率換算`;
      retrieved.push("ROE");
    }
  }
  if (items.roe === null) failed.push("ROE");

  // ── ★ 時価総額：終値 ×（発行済株式数 − 自己株式数）──
  // 株式数は最新の開示に載っていないことがあるので遡って探す
  let sharesRaw = null, treasuryRaw = null;
  for (const s of [...sorted].reverse()) {
    if (treasuryRaw === null) treasuryRaw = pickNum(s, K.treasury);
    if (sharesRaw === null) sharesRaw = pickNum(s, K.shares);
    if (sharesRaw !== null) break;
  }
  if (sharesRaw !== null) {
    items.sharesOutstanding = Math.max(0, sharesRaw - (treasuryRaw || 0));
    retrieved.push("発行済株式数");
    if (items.stockPrice) {
      items.marketCap = items.stockPrice * items.sharesOutstanding;
      items.marketCapOku = +(items.marketCap / 1e8).toFixed(1);
      retrieved.push("時価総額");
    } else failed.push("時価総額");
  } else {
    failed.push("発行済株式数");
    failed.push("時価総額");
  }

  // ── PER / PBR ─────────────────────────────
  const useEps = items.fcastEps || items.eps;
  if (items.stockPrice && useEps && useEps > 0) {
    items.per = +(items.stockPrice / useEps).toFixed(1);
    retrieved.push("PER");
  } else failed.push("PER");
  if (items.stockPrice && items.bps && items.bps > 0) {
    items.pbr = +(items.stockPrice / items.bps).toFixed(2);
    retrieved.push("PBR");
  } else failed.push("PBR");

  items.fetchedAt = fmtDate(new Date());
  return { ...items, retrieved, failed, sufficiency: sufficiencyOf(retrieved, failed), debug };
}
