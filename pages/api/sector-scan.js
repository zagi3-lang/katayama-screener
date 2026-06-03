// pages/api/sector-scan.js
// J-Quants v2 業種別一括スキャン（高速版）

const SECTOR_MAP = {
  "3650": "電気機器",
  "5250": "情報・通信業",
  "3600": "機械",
  "3500": "非鉄金属",
  "3750": "精密機器",
  "3250": "医薬品",
  "3700": "輸送用機器",
  "3200": "化学",
  "6400": "サービス業",
  "3800": "その他製品",
  "6050": "卸売業",
  "6100": "小売業",
  "5100": "海運業",
  "5050": "陸運業",
  "3450": "鉄鋼",
  "3550": "金属製品",
  "6150": "銀行業",
  "6350": "不動産業",
  "4050": "電気・ガス業",
  "all":  "全業種",
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { apiKey, sectors, signalMode } = req.body;
  if (!apiKey) return res.status(400).json({ error: "APIキーが必要です" });

  const headers = { "x-api-key": apiKey };

  try {
    // ── Step1: 銘柄マスター取得 & 業種フィルタリング ──
    const masterRes = await fetch("https://api.jquants.com/v2/equities/master", { headers });
    if (!masterRes.ok) return res.status(200).json({ ok: false, error: "銘柄マスター取得失敗" });
    const masterData = await masterRes.json();
    const allStocks = masterData.info ?? masterData.master ?? [];

    // 業種でフィルタ
    const targetSectors = sectors || ["all"];
    const filtered = targetSectors.includes("all")
      ? allStocks
      : allStocks.filter(s => targetSectors.includes(String(s.Sector33Code ?? s.sector33Code)));

    // コードと銘柄名のマップ作成
    const codeMap = {};
    filtered.forEach(s => {
      const code = String(s.Code ?? s.code ?? "").slice(0, 4);
      const name = s.CompanyName ?? s.companyName ?? s.Name ?? code;
      if (code && code.length === 4) codeMap[code] = name;
    });
    const codes = Object.keys(codeMap);

    if (codes.length === 0) return res.status(200).json({ ok: true, results: [], total: 0, message: "対象銘柄なし" });

    // ── Step2: 過去30営業日分のOHLCVを日付単位で一括取得 ──
    const tradingDays = getTradingDays(30);
    const stockData = {}; // code -> [{date,open,high,low,close,volume}]

    for (const dateStr of tradingDays) {
      try {
        const r = await fetch(
          `https://api.jquants.com/v2/equities/bars/daily?date=${dateStr}`,
          { headers, signal: AbortSignal.timeout(15000) }
        );
        if (!r.ok) continue;
        const json = await r.json();
        const quotes = json.daily_quotes ?? json.bars ?? [];
        for (const q of quotes) {
          const code = String(q.Code ?? q.code ?? "").slice(0, 4);
          if (!codeMap[code]) continue;
          if (!stockData[code]) stockData[code] = [];
          stockData[code].push({
            date:   q.Date ?? q.date,
            open:   parseFloat(q.Open   ?? q.O ?? 0),
            high:   parseFloat(q.High   ?? q.H ?? 0),
            low:    parseFloat(q.Low    ?? q.L ?? 0),
            close:  parseFloat(q.Close  ?? q.C ?? 0),
            volume: parseFloat(q.Volume ?? q.Vo ?? 0),
          });
        }
      } catch (_) {}
    }

    // ── Step3: 各銘柄のシグナル計算 ──
    const results = [];
    for (const code of codes) {
      const data = stockData[code];
      if (!data || data.length < 15) continue;
      data.sort((a, b) => a.date.localeCompare(b.date));

      const signal = calcSignals(data, signalMode);
      if (signal.patterns.length > 0) {
        results.push({
          code,
          name:          codeMap[code],
          rsi:           signal.rsi,
          close:         signal.close,
          ma5:           signal.ma5,
          ma25:          signal.ma25,
          ma75:          signal.ma75,
          ma200:         signal.ma200,
          perfect_order: signal.perfect_order,
          patterns:      signal.patterns,
          score:         signal.score,
          s_count:       signal.s_count,
          sector:        SECTOR_MAP[String(filtered.find(s => String(s.Code ?? s.code ?? "").slice(0,4) === code)?.Sector33Code)] ?? "",
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return res.status(200).json({
      ok: true,
      results,
      total: codes.length,
      scanned: Object.keys(stockData).length,
      message: `${codes.length}銘柄中 ${results.length}銘柄検出`,
    });

  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message });
  }
}

function getTradingDays(n) {
  const days = [];
  const d = new Date();
  while (days.length < n) {
    d.setDate(d.getDate() - 1);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    days.unshift(d.toISOString().slice(0, 10));
  }
  return days;
}

function calcSignals(data, mode) {
  const n = data.length;
  const closes  = data.map(d => d.close);
  const volumes = data.map(d => d.volume);

  const ma = (arr, period) => {
    if (arr.length < period) return null;
    return arr.slice(-period).reduce((a, b) => a + b, 0) / period;
  };
  const ma5   = ma(closes, 5);
  const ma25  = ma(closes, Math.min(25, n));
  const ma75  = ma(closes, Math.min(75, n));
  const ma200 = ma(closes, Math.min(200, n));

  const perfect_order = ma5 && ma25 && ma75 && ma200
    ? (ma5 > ma25 && ma25 > ma75 && ma75 > ma200) : false;

  // OBV
  let obv = 0;
  const obvArr = [0];
  for (let i = 1; i < n; i++) {
    if (closes[i] > closes[i-1])      obv += volumes[i];
    else if (closes[i] < closes[i-1]) obv -= volumes[i];
    obvArr.push(obv);
  }
  const obvRising = obvArr[n-1] > obvArr[Math.max(0, n-10)] * 1.02;

  // RSI(14)
  let gains = 0, losses = 0;
  const rsiLen = Math.min(14, n-1);
  for (let i = n - rsiLen; i < n; i++) {
    const diff = closes[i] - closes[i-1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const rsi = gains + losses === 0 ? 50 : Math.round(100 * gains / (gains + losses));

  // 株価横ばい
  const recent = closes.slice(-Math.min(10, n));
  const priceFlat = (Math.max(...recent) - Math.min(...recent)) / Math.min(...recent) < 0.05;

  // 出来高急増
  const vol5  = volumes.slice(-5).reduce((a,b)=>a+b,0) / 5;
  const vol20 = volumes.slice(-Math.min(20,n)).reduce((a,b)=>a+b,0) / Math.min(20,n);
  const volSurge = vol5 > vol20 * 1.5;

  const close = Math.round(closes[n-1]);
  const patterns = [];
  let score = 0;

  if (perfect_order) {
    patterns.push({ key: "PO", emoji: "🏆", label: "パーフェクトオーダー", detail: `MA5>MA25>MA75>MA200` });
    score += 40;
  }
  const sSignal = obvRising && priceFlat && rsi >= 40 && rsi <= 65;
  if (sSignal) {
    patterns.push({ key: "S", emoji: "💎", label: "仕込みS", detail: `OBV↑×横ばい×RSI${rsi}` });
    score += 30;
  }
  if (obvRising && !priceFlat) {
    patterns.push({ key: "DIV", emoji: "📡", label: "OBVダイバージェンス", detail: "OBV先行上昇" });
    score += 10;
  }
  if (volSurge) {
    patterns.push({ key: "VOL", emoji: "🔥", label: "出来高急増", detail: `直近5日 ${(vol5/vol20).toFixed(1)}x` });
    score += 10;
  }
  if (ma5 && ma25 && ma5 > ma25) {
    patterns.push({ key: "MA", emoji: "📐", label: "MA収束", detail: "MA5>MA25" });
    score += 10;
  }
  if (rsi >= 30 && rsi <= 45) {
    patterns.push({ key: "RSI", emoji: "🔄", label: "RSI反転", detail: `RSI${rsi}` });
    score += 5;
  }

  // モードフィルター
  if (mode === "po_only"   && !perfect_order)          return { patterns: [] };
  if (mode === "s_only"    && !sSignal)                return { patterns: [] };
  if (mode === "po_and_s"  && !(perfect_order && sSignal)) return { patterns: [] };

  return {
    close, rsi,
    ma5:   Math.round(ma5  ?? 0),
    ma25:  Math.round(ma25 ?? 0),
    ma75:  Math.round(ma75 ?? 0),
    ma200: Math.round(ma200 ?? 0),
    perfect_order, patterns, score,
    s_count: patterns.filter(p => p.key === "S").length,
  };
}
