// pages/api/ssignal.js — J-Quants v2正式対応版
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { codes, apiKey, mode } = req.body;
  if (!codes || !Array.isArray(codes) || codes.length === 0) {
    return res.status(400).json({ error: "codesが必要です" });
  }

  const results = [];
  const debug = { fetched: 0, failed: 0, no_signal: 0 };

  for (const code of codes) {
    try {
      let data = null;

      if (apiKey) {
        data = await fetchFromJQuants(code, apiKey);
      }
      if (!data || data.length < 5) {
        data = await fetchFromStooq(code);
      }
      if (!data || data.length < 5) { debug.failed++; continue; }

      debug.fetched++;
      const signal = calcSignals(data, mode);
      if (signal.patterns.length > 0) {
        results.push({
          code,
          name:          signal.name || code,
          rsi:           signal.rsi,
          s_count:       signal.s_count,
          close:         signal.close,
          ma5:           signal.ma5,
          ma25:          signal.ma25,
          ma75:          signal.ma75,
          ma200:         signal.ma200,
          patterns:      signal.patterns,
          score:         signal.score,
          perfect_order: signal.perfect_order,
        });
      } else { debug.no_signal++; }
    } catch (e) { debug.failed++; }
  }

  results.sort((a, b) => b.score - a.score);
  return res.status(200).json({ results, debug, total: codes.length });
}

// ── J-Quants v2 (date単位で複数日取得) ──
async function fetchFromJQuants(code, apiKey) {
  try {
    const headers = { "x-api-key": apiKey };
    const tradingDays = getRecentTradingDays(30);
    const allQuotes = [];

    // 30日分を並列取得（最大5並列）
    const BATCH = 5;
    for (let i = 0; i < tradingDays.length; i += BATCH) {
      const batch = tradingDays.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (date) => {
          const dateStr = date.replace(/-/g, "");
          const url = `https://api.jquants.com/v2/equities/bars/daily?code=${code}&date=${dateStr}`;
          const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
          if (!r.ok) return [];
          const json = await r.json();
          return json.daily_quotes ?? json.bars ?? [];
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled") allQuotes.push(...r.value);
      }
    }

    if (allQuotes.length < 5) return null;
    return allQuotes
      .sort((a, b) => (a.Date ?? a.date ?? "").localeCompare(b.Date ?? b.date ?? ""))
      .map(q => ({
        date:   q.Date ?? q.date,
        open:   parseFloat(q.Open   ?? q.O ?? 0),
        high:   parseFloat(q.High   ?? q.H ?? 0),
        low:    parseFloat(q.Low    ?? q.L ?? 0),
        close:  parseFloat(q.Close  ?? q.C ?? 0),
        volume: parseFloat(q.Volume ?? q.Vo ?? 0),
      }))
      .filter(q => q.close > 0);
  } catch { return null; }
}

// ── stooq.com フォールバック ──
async function fetchFromStooq(code) {
  try {
    const num = code.replace(/[^0-9]/g, "");
    const url = `https://stooq.com/q/d/l/?s=${num}.jp&i=d`;
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const text = await r.text();
    const lines = text.trim().split("\n").slice(1);
    if (lines.length < 15) return null;
    return lines.map(line => {
      const [date, open, high, low, close, volume] = line.split(",");
      return { date, open: +open, high: +high, low: +low, close: +close, volume: +volume || 0 };
    }).filter(q => q.close > 0);
  } catch { return null; }
}

function getRecentTradingDays(n) {
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
  const obvRising = obvArr[n-1] > obvArr[Math.max(0, n-10)] * 1.01;

  // RSI(14)
  let gains = 0, losses = 0;
  const rsiLen = Math.min(14, n - 1);
  for (let i = n - rsiLen; i < n; i++) {
    const diff = closes[i] - closes[i-1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const rsi = gains + losses === 0 ? 50 : Math.round(100 * gains / (gains + losses));

  // 株価横ばい（直近10日の変動幅5%以内）
  const recent = closes.slice(-Math.min(10, n));
  const priceFlat = (Math.max(...recent) - Math.min(...recent)) / Math.min(...recent) < 0.05;

  // 出来高急増
  const vol5  = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const vol20 = volumes.slice(-Math.min(20, n)).reduce((a, b) => a + b, 0) / Math.min(20, n);
  const volSurge = vol20 > 0 && vol5 > vol20 * 1.5;

  const close = Math.round(closes[n - 1]);
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
    patterns.push({ key: "VOL", emoji: "🔥", label: "出来高急増", detail: `${(vol5/vol20).toFixed(1)}x` });
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

  if (mode === "po_only"  && !perfect_order)             return { patterns: [] };
  if (mode === "s_only"   && !sSignal)                   return { patterns: [] };
  if (mode === "po_and_s" && !(perfect_order && sSignal)) return { patterns: [] };

  return {
    close, rsi,
    ma5:   Math.round(ma5  ?? 0),
    ma25:  Math.round(ma25 ?? 0),
    ma75:  Math.round(ma75 ?? 0),
    ma200: Math.round(ma200 ?? 0),
    perfect_order, patterns, score,
    s_count: patterns.filter(p => p.key === "S").length,
    name: "",
  };
}
