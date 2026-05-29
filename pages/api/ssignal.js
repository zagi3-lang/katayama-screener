// pages/api/ssignal.js
// Sシグナルスクリーナー - Yahoo Finance経由でOHLCVを取得してS判定

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { codes } = req.body;
  if (!codes || !Array.isArray(codes) || codes.length === 0) {
    return res.status(400).json({ error: "codesが必要です" });
  }

  const results = [];

  for (const code of codes.slice(0, 50)) { // 最大50銘柄
    try {
      const data = await fetchYahooOHLCV(code);
      if (!data || data.length < 30) continue;

      const signal = calcSSignal(data);
      if (signal.fired) {
        results.push({
          code,
          name: signal.name || code,
          rsi: signal.rsi,
          obv_slope: signal.obv_slope,
          price_chg_pct: signal.price_chg_pct,
          s_count: signal.s_count,
          close: signal.close,
          ma25: signal.ma25,
        });
      }
    } catch (_) {
      // 個別銘柄のエラーはスキップ
    }
  }

  // スコア順（S点灯数×OBV傾きの強さ）でソート
  results.sort((a, b) => b.s_count - a.s_count);

  return res.status(200).json({ results });
}

// Yahoo Finance から日足OHLCVを取得（直近60日）
async function fetchYahooOHLCV(code) {
  // 日本株は末尾に .T を付ける
  const ticker = code.replace(/[^0-9]/g, "") + ".T";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=3mo`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) return null;

  const json = await res.json();
  const chart = json?.chart?.result?.[0];
  if (!chart) return null;

  const timestamps = chart.timestamp || [];
  const q = chart.indicators?.quote?.[0] || {};
  const closes  = q.close  || [];
  const volumes = q.volume || [];
  const opens   = q.open   || [];
  const highs   = q.high   || [];
  const lows    = q.low    || [];
  const name    = chart.meta?.shortName || "";

  const bars = timestamps.map((t, i) => ({
    date: new Date(t * 1000),
    open:   opens[i]   || 0,
    high:   highs[i]   || 0,
    low:    lows[i]    || 0,
    close:  closes[i]  || 0,
    volume: volumes[i] || 0,
    name,
  })).filter(b => b.close > 0 && b.volume > 0);

  return bars;
}

// Sシグナル判定ロジック（Pine Script v3の条件をJSで再現）
function calcSSignal(bars) {
  const n = bars.length;
  if (n < 30) return { fired: false };

  const name   = bars[0].name || "";
  const closes  = bars.map(b => b.close);
  const volumes = bars.map(b => b.volume);
  const opens   = bars.map(b => b.open);

  // OBV計算
  const obv = [0];
  for (let i = 1; i < n; i++) {
    const sign = closes[i] > closes[i - 1] ? 1 : closes[i] < closes[i - 1] ? -1 : 0;
    obv.push(obv[i - 1] + sign * volumes[i]);
  }

  // SMA25
  const ma25arr = sma(closes, 25);

  // RSI14
  const rsi14arr = rsi(closes, 14);

  // 出来高SMA20
  const vol_sma20 = sma(volumes, 20);

  // 現在のバー（最新）
  const i = n - 1;
  const close   = closes[i];
  const ma25val = ma25arr[i];
  const rsiVal  = rsi14arr[i];
  const avgVol  = vol_sma20[i];
  const vol     = volumes[i];
  const spike_th = 2.0;

  // OBV傾き（15日のlinreg）
  const obv_slope = linregSlope(obv.slice(-15));
  const obv_norm  = avgVol > 0 ? obv_slope / avgVol : 0;

  // 価格変化率（15日前比）
  const base_close   = closes[Math.max(0, i - 15)];
  const price_chg_pct = Math.abs(close - base_close) / base_close * 100;

  // 陽線/陰線出来高比
  const last20_bars = bars.slice(-20);
  const bull_vol = last20_bars.filter(b => b.close >= b.open).reduce((s, b) => s + b.volume, 0);
  const bull_cnt = last20_bars.filter(b => b.close >= b.open).length;
  const bear_vol = last20_bars.filter(b => b.close < b.open).reduce((s, b) => s + b.volume, 0);
  const bear_cnt = last20_bars.filter(b => b.close < b.open).length;
  const avg_bull = bull_cnt > 0 ? bull_vol / bull_cnt : 0;
  const avg_bear = bear_cnt > 0 ? bear_vol / bear_cnt : 1;
  const bullish_ok = avg_bull > avg_bear * 1.2;

  // スパイク回数
  const spike_count = last20_bars.filter(b => b.volume > avgVol * spike_th).length;
  const multi_ok    = spike_count >= 2;

  // ── Sシグナル① v6.1方式 ──
  const s61 = obv_norm > 0
    && price_chg_pct < 5.0
    && rsiVal >= 45 && rsiVal <= 63
    && close > ma25val
    && bullish_ok
    && multi_ok;

  // ── Sシグナル② v3方式（OBV 3日連続上昇）──
  const obv_3up = n >= 3 && obv[i] > obv[i - 1] && obv[i - 1] > obv[i - 2];
  const body    = Math.abs(close - opens[i]);
  const bsafe   = body > 0 ? body : (bars[i].high - bars[i].low) * 0.01;
  const uw      = bars[i].high - Math.max(close, opens[i]);
  const longup  = uw / bsafe > 0.5;
  const sv3 = vol > avgVol * 1.1
    && vol < avgVol * spike_th
    && obv_3up
    && rsiVal >= 48 && rsiVal <= 63
    && close > ma25val
    && close > opens[i]
    && !longup;

  const fired = s61 || sv3;

  // 直近15日のS点灯カウント（簡易）
  let s_count = 0;
  for (let j = Math.max(0, i - 14); j <= i; j++) {
    const c_j   = closes[j];
    const ma_j  = ma25arr[j];
    const rsi_j = rsi14arr[j];
    const v_j   = volumes[j];
    const avg_j = vol_sma20[j];
    const o_j   = opens[j];

    const slope_j  = linregSlope(obv.slice(Math.max(0, j - 14), j + 1));
    const norm_j   = avg_j > 0 ? slope_j / avg_j : 0;
    const pchg_j   = j >= 15 ? Math.abs(c_j - closes[j - 15]) / closes[j - 15] * 100 : 10;

    const s61_j = norm_j > 0 && pchg_j < 5.0 && rsi_j >= 45 && rsi_j <= 63 && c_j > ma_j;
    const obv3_j = j >= 2 && obv[j] > obv[j - 1] && obv[j - 1] > obv[j - 2];
    const sv3_j  = v_j > avg_j * 1.1 && v_j < avg_j * spike_th && obv3_j && rsi_j >= 48 && rsi_j <= 63 && c_j > ma_j && c_j > o_j;

    if (s61_j || sv3_j) s_count++;
  }

  return {
    fired,
    name,
    rsi:          Math.round(rsiVal * 10) / 10,
    obv_slope:    Math.round(obv_norm * 100) / 100,
    price_chg_pct: Math.round(price_chg_pct * 10) / 10,
    s_count,
    close,
    ma25:         Math.round(ma25val),
  };
}

// ─── 数学ユーティリティ ───────────────────────────────

function sma(arr, period) {
  const result = new Array(arr.length).fill(null);
  for (let i = period - 1; i < arr.length; i++) {
    const slice = arr.slice(i - period + 1, i + 1);
    result[i] = slice.reduce((a, b) => a + b, 0) / period;
  }
  return result;
}

function rsi(closes, period = 14) {
  const result = new Array(closes.length).fill(50);
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgG = gains / period;
  let avgL = losses / period;
  result[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + Math.max(diff, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-diff, 0)) / period;
    result[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return result;
}

function linregSlope(arr) {
  const n = arr.length;
  if (n < 2) return 0;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  for (let i = 0; i < n; i++) {
    sx += i; sy += arr[i]; sxy += i * arr[i]; sx2 += i * i;
  }
  const denom = n * sx2 - sx * sx;
  return denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
}
