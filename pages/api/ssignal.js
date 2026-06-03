// pages/api/ssignal.js — J-Quants v2対応 + パーフェクトオーダー + Sシグナル複合スクリーナー
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { codes, apiKey, mode } = req.body;
  if (!codes || !Array.isArray(codes) || codes.length === 0) {
    return res.status(400).json({ error: "codesが必要です" });
  }

  const results = [];
  const debug = { fetched: 0, failed: 0, no_signal: 0 };

  // J-Quantsのデータ取得日付範囲（200日分）
  const today = new Date();
  const dow = today.getDay();
  if (dow === 0) today.setDate(today.getDate() - 2);
  if (dow === 6) today.setDate(today.getDate() - 1);
  const toStr   = today.toISOString().slice(0, 10);
  const fromStr = new Date(Date.now() - 210 * 86400000).toISOString().slice(0, 10);

  for (const code of codes) {
    try {
      let data = null;

      // J-QuantsのAPIキーがあればJ-Quantsを優先使用
      if (apiKey) {
        data = await fetchFromJQuants(code, apiKey, fromStr, toStr);
      }

      // フォールバック: stooq.com
      if (!data || data.length < 30) {
        data = await fetchFromStooq(code);
      }

      if (!data || data.length < 30) { debug.failed++; continue; }
      debug.fetched++;

      const signal = calcSignals(data, mode);
      if (signal.patterns.length > 0) {
        results.push({
          code,
          name:     signal.name || code,
          rsi:      signal.rsi,
          s_count:  signal.s_count,
          close:    signal.close,
          ma5:      signal.ma5,
          ma25:     signal.ma25,
          ma75:     signal.ma75,
          ma200:    signal.ma200,
          patterns: signal.patterns,
          score:    signal.score,
          perfect_order: signal.perfect_order,
        });
      } else { debug.no_signal++; }
    } catch (e) { debug.failed++; }
  }

  results.sort((a, b) => b.score - a.score);
  return res.status(200).json({ results, debug, total: codes.length });
}

// ── J-Quantsからデータ取得 ──
async function fetchFromJQuants(code, apiKey, from, to) {
  try {
    const url = `https://api.jquants.com/v2/equities/bars/daily?code=${code}&from=${from}&to=${to}`;
    const r = await fetch(url, {
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const json = await r.json();
    const quotes = json.daily_quotes ?? json.bars ?? [];
    if (quotes.length < 30) return null;
    return quotes.map(q => ({
      date:   q.Date ?? q.date,
      open:   parseFloat(q.Open  ?? q.O ?? q.open  ?? 0),
      high:   parseFloat(q.High  ?? q.H ?? q.high  ?? 0),
      low:    parseFloat(q.Low   ?? q.L ?? q.low   ?? 0),
      close:  parseFloat(q.Close ?? q.C ?? q.close ?? 0),
      volume: parseFloat(q.Volume ?? q.Vo ?? q.volume ?? 0),
    })).filter(q => q.close > 0);
  } catch { return null; }
}

// ── stooq.comからフォールバック取得 ──
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
    if (lines.length < 30) return null;
    return lines.map(line => {
      const [date, open, high, low, close, volume] = line.split(",");
      return {
        date, open: +open, high: +high, low: +low,
        close: +close, volume: +volume || 0,
      };
    }).filter(q => q.close > 0);
  } catch { return null; }
}

// ── シグナル計算（パーフェクトオーダー + Sシグナル） ──
function calcSignals(data, mode) {
  const n = data.length;
  const closes  = data.map(d => d.close);
  const volumes = data.map(d => d.volume);

  // ── MA計算 ──
  const ma = (arr, period) => {
    if (arr.length < period) return null;
    return arr.slice(-period).reduce((a, b) => a + b, 0) / period;
  };
  const ma5   = ma(closes, 5);
  const ma25  = ma(closes, 25);
  const ma75  = ma(closes, Math.min(75,  n));
  const ma200 = ma(closes, Math.min(200, n));

  // ── パーフェクトオーダー判定 ──
  const perfect_order = ma5 && ma25 && ma75 && ma200
    ? (ma5 > ma25 && ma25 > ma75 && ma75 > ma200)
    : false;

  // ── MA上向き判定（各MA5日前と比較） ──
  const maUpward = (arr, period) => {
    if (arr.length < period + 5) return false;
    const cur  = arr.slice(-period).reduce((a,b)=>a+b,0) / period;
    const prev = arr.slice(-period-5, -5).reduce((a,b)=>a+b,0) / period;
    return cur > prev;
  };
  const ma5up   = maUpward(closes, 5);
  const ma25up  = maUpward(closes, 25);
  const ma75up  = n >= 80  ? maUpward(closes, 75)  : false;
  const ma200up = n >= 205 ? maUpward(closes, 200) : false;

  // ── OBV計算 ──
  let obv = 0;
  const obvArr = [0];
  for (let i = 1; i < n; i++) {
    if (closes[i] > closes[i-1])      obv += volumes[i];
    else if (closes[i] < closes[i-1]) obv -= volumes[i];
    obvArr.push(obv);
  }
  const obvRecent = obvArr.slice(-10);
  const obvPrev   = obvArr.slice(-20, -10);
  const obvRising = obvRecent[9] > obvPrev[0] * 1.02;

  // ── RSI計算（14日） ──
  let gains = 0, losses = 0;
  for (let i = n - 14; i < n; i++) {
    const diff = closes[i] - closes[i-1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const rsi = gains + losses === 0 ? 50 : Math.round(100 * gains / (gains + losses));

  // ── 株価横ばい判定（直近10日の変動幅が5%以内） ──
  const recent10 = closes.slice(-10);
  const priceFlat = (Math.max(...recent10) - Math.min(...recent10)) / Math.min(...recent10) < 0.05;

  // ── 出来高急増判定 ──
  const vol5  = volumes.slice(-5).reduce((a,b)=>a+b,0) / 5;
  const vol20 = volumes.slice(-20).reduce((a,b)=>a+b,0) / 20;
  const volSurge = vol5 > vol20 * 1.5;

  // ── 株価位置（52週高値比） ──
  const high52 = Math.max(...closes.slice(-Math.min(252, n)));
  const pricePosition = closes[n-1] / high52;

  const close = Math.round(closes[n-1]);
  const patterns = [];
  let score = 0;

  // ── パターン判定 ──

  // ① パーフェクトオーダー（最重要）
  if (perfect_order) {
    patterns.push({ key: "PO", emoji: "🏆", label: "パーフェクトオーダー", detail: `MA5>${Math.round(ma5)} MA25>${Math.round(ma25)} MA75>${Math.round(ma75)}` });
    score += 40;
  }

  // ② Sシグナル（仕込み感）= OBV上昇×株価横ばい×RSI適正帯
  const sSignal = obvRising && priceFlat && rsi >= 40 && rsi <= 65;
  if (sSignal) {
    patterns.push({ key: "S", emoji: "💎", label: "仕込みS", detail: `OBV↑×横ばい×RSI${rsi}` });
    score += 30;
  }

  // ③ OBVダイバージェンス単体
  if (obvRising && !priceFlat) {
    patterns.push({ key: "DIV", emoji: "📡", label: "OBVダイバージェンス", detail: "OBV先行上昇" });
    score += 10;
  }

  // ④ 出来高急増
  if (volSurge) {
    patterns.push({ key: "VOL", emoji: "🔥", label: "出来高急増", detail: `直近5日平均 ${(vol5/vol20).toFixed(1)}x` });
    score += 10;
  }

  // ⑤ MA収束（上向き揃い）
  if (ma5up && ma25up) {
    patterns.push({ key: "MA", emoji: "📐", label: "MA収束", detail: "MA5・MA25上向き" });
    score += 10;
  }

  // ⑥ RSI反転ゾーン
  if (rsi >= 30 && rsi <= 45) {
    patterns.push({ key: "RSI", emoji: "🔄", label: "RSI反転", detail: `RSI${rsi}（売られ過ぎ圏）` });
    score += 5;
  }

  // モードフィルター
  if (mode === "perfect_order_only" && !perfect_order) return { patterns: [] };
  if (mode === "s_signal_only"      && !sSignal)       return { patterns: [] };
  if (mode === "po_and_s"           && !(perfect_order && sSignal)) return { patterns: [] };

  return {
    close, rsi, ma5: Math.round(ma5 ?? 0), ma25: Math.round(ma25 ?? 0),
    ma75: Math.round(ma75 ?? 0), ma200: Math.round(ma200 ?? 0),
    perfect_order, patterns, score,
    s_count: patterns.filter(p => p.key === "S").length,
    name: "",
  };
}
