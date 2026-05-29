// pages/api/ssignal.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { codes } = req.body;
  if (!codes || !Array.isArray(codes) || codes.length === 0) {
    return res.status(400).json({ error: "codesが必要です" });
  }

  const results = [];
  const debug   = { fetched: 0, failed: 0, no_signal: 0 };

  for (const code of codes.slice(0, 60)) {
    try {
      const data = await fetchOHLCV(code);
      if (!data || data.length < 20) { debug.failed++; continue; }
      debug.fetched++;
      const signal = calcSSignal(data);
      if (signal.fired) {
        results.push({ code, name: signal.name || code, rsi: signal.rsi,
          obv_slope: signal.obv_slope, price_chg_pct: signal.price_chg_pct,
          s_count: signal.s_count, close: signal.close, ma25: signal.ma25 });
      } else { debug.no_signal++; }
    } catch (e) { debug.failed++; }
  }

  results.sort((a, b) => b.s_count - a.s_count);
  return res.status(200).json({ results, debug, total: codes.length });
}

async function fetchOHLCV(code) {
  const num = code.replace(/[^0-9]/g, "");
  
  // stooq.com - Vercelから取得しやすい
  try {
    const url = `https://stooq.com/q/d/l/?s=${num}.jp&i=d`;
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000)
    });
    if (r.ok) {
      const text = await r.text();
      const lines = text.trim().split("\n").slice(1);
      if (lines.length >= 20) {
        const bars = lines.map(line => {
          const [date, open, high, low, close, volume] = line.split(",");
          const c = parseFloat(close), v = parseInt(volume) || 100000;
          if (!c || isNaN(c)) return null;
          return { date: new Date(date), open: parseFloat(open)||c, high: parseFloat(high)||c,
                   low: parseFloat(low)||c, close: c, volume: v, name: num };
        }).filter(Boolean);
        if (bars.length >= 20) return bars;
      }
    }
  } catch (_) {}

  // Yahoo Finance v7 CSV fallback
  try {
    const ticker = num + ".T";
    const now    = Math.floor(Date.now() / 1000);
    const from   = now - 7776000; // 90日
    const url = `https://query2.finance.yahoo.com/v7/finance/download/${ticker}?period1=${from}&period2=${now}&interval=1d&events=history`;
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0",
        "Referer": "https://finance.yahoo.com/"
      },
      signal: AbortSignal.timeout(8000)
    });
    if (r.ok) {
      const text  = await r.text();
      const lines = text.trim().split("\n").slice(1);
      const bars  = lines.map(line => {
        const [date, open, high, low, close, adj, volume] = line.split(",");
        const c = parseFloat(close), v = parseInt(volume) || 100000;
        if (!c || isNaN(c)) return null;
        return { date: new Date(date), open: parseFloat(open)||c, high: parseFloat(high)||c,
                 low: parseFloat(low)||c, close: c, volume: v, name: ticker };
      }).filter(Boolean);
      if (bars.length >= 20) return bars;
    }
  } catch (_) {}

  // Yahoo Finance v8 JSON fallback
  try {
    const ticker = num + ".T";
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=3mo`;
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://finance.yahoo.com/" },
      signal: AbortSignal.timeout(8000)
    });
    if (r.ok) {
      const json  = await r.json();
      const chart = json?.chart?.result?.[0];
      if (chart) {
        const timestamps = chart.timestamp || [];
        const q    = chart.indicators?.quote?.[0] || {};
        const name = chart.meta?.shortName || ticker;
        const bars = timestamps.map((t, i) => ({
          date: new Date(t * 1000), open: q.open?.[i]||0, high: q.high?.[i]||0,
          low: q.low?.[i]||0, close: q.close?.[i]||0, volume: q.volume?.[i]||100000, name
        })).filter(b => b.close > 0);
        if (bars.length >= 20) return bars;
      }
    }
  } catch (_) {}

  return null;
}

function calcSSignal(bars) {
  const n = bars.length;
  if (n < 20) return { fired: false };
  const name    = bars[0].name || "";
  const closes  = bars.map(b => b.close);
  const volumes = bars.map(b => b.volume);
  const opens   = bars.map(b => b.open);
  const obv     = [0];
  for (let i = 1; i < n; i++) {
    const sign = closes[i] > closes[i-1] ? 1 : closes[i] < closes[i-1] ? -1 : 0;
    obv.push(obv[i-1] + sign * volumes[i]);
  }
  const ma25arr  = sma(closes, Math.min(25, n-1));
  const rsi14arr = rsi(closes, Math.min(14, n-1));
  const vol20    = sma(volumes, Math.min(20, n-1));
  const i        = n - 1;
  const close    = closes[i];
  const ma25v    = ma25arr[i] || close;
  const rsiVal   = rsi14arr[i] || 50;
  const avgVol   = vol20[i] || 1;
  const vol      = volumes[i];
  const spike_th = 2.0;
  const obv_slope    = linregSlope(obv.slice(Math.max(0, i-14), i+1));
  const obv_norm     = avgVol > 0 ? obv_slope / avgVol : 0;
  const price_chg    = Math.abs(close - closes[Math.max(0, i-15)]) / (closes[Math.max(0,i-15)]||1) * 100;
  const last20       = bars.slice(-20);
  const bull_vol     = last20.filter(b => b.close >= b.open).reduce((s,b) => s+b.volume, 0);
  const bull_cnt     = last20.filter(b => b.close >= b.open).length;
  const bear_vol     = last20.filter(b => b.close <  b.open).reduce((s,b) => s+b.volume, 0);
  const bear_cnt     = last20.filter(b => b.close <  b.open).length;
  const avg_bull     = bull_cnt > 0 ? bull_vol/bull_cnt : 0;
  const avg_bear     = bear_cnt > 0 ? bear_vol/bear_cnt : 1;
  const bullish_ok   = avg_bull > avg_bear * 1.2;
  const spike_count  = last20.filter(b => b.volume > avgVol * spike_th).length;
  const multi_ok     = spike_count >= 2;
  const s61 = obv_norm > 0 && price_chg < 5.0 && rsiVal >= 45 && rsiVal <= 63 && close > ma25v && bullish_ok && multi_ok;
  const obv_3up = n >= 3 && obv[i] > obv[i-1] && obv[i-1] > obv[i-2];
  const body    = Math.abs(close - opens[i]);
  const bsafe   = body > 0 ? body : (bars[i].high - bars[i].low) * 0.01 || 1;
  const uw      = bars[i].high - Math.max(close, opens[i]);
  const longup  = uw / bsafe > 0.5;
  const sv3 = vol > avgVol*1.1 && vol < avgVol*spike_th && obv_3up && rsiVal >= 48 && rsiVal <= 63 && close > ma25v && close > opens[i] && !longup;
  const fired = s61 || sv3;
  let s_count = 0;
  for (let j = Math.max(0, i-14); j <= i; j++) {
    const c_j=closes[j], ma_j=ma25arr[j]||closes[j], rsi_j=rsi14arr[j]||50;
    const v_j=volumes[j], avg_j=vol20[j]||1, o_j=opens[j];
    const slp_j = linregSlope(obv.slice(Math.max(0,j-14),j+1));
    const nrm_j = avg_j > 0 ? slp_j/avg_j : 0;
    const pch_j = j>=15 ? Math.abs(c_j-closes[j-15])/(closes[j-15]||1)*100 : 10;
    const s61_j = nrm_j>0 && pch_j<5.0 && rsi_j>=45 && rsi_j<=63 && c_j>ma_j;
    const o3_j  = j>=2 && obv[j]>obv[j-1] && obv[j-1]>obv[j-2];
    const sv3_j = v_j>avg_j*1.1 && v_j<avg_j*spike_th && o3_j && rsi_j>=48 && rsi_j<=63 && c_j>ma_j && c_j>o_j;
    if (s61_j || sv3_j) s_count++;
  }
  return { fired, name, rsi: Math.round(rsiVal*10)/10, obv_slope: Math.round(obv_norm*100)/100, price_chg_pct: Math.round(price_chg*10)/10, s_count, close, ma25: Math.round(ma25v) };
}

function sma(arr, period) {
  const result = new Array(arr.length).fill(null);
  for (let i = period-1; i < arr.length; i++) result[i] = arr.slice(i-period+1,i+1).reduce((a,b)=>a+b,0)/period;
  return result;
}

function rsi(closes, period=14) {
  const result = new Array(closes.length).fill(50);
  let gains=0, losses=0;
  for (let i=1; i<=period && i<closes.length; i++) { const d=closes[i]-closes[i-1]; if(d>0) gains+=d; else losses-=d; }
  let ag=gains/period, al=losses/period;
  if (period < closes.length) result[period] = al===0?100:100-100/(1+ag/al);
  for (let i=period+1; i<closes.length; i++) {
    const d=closes[i]-closes[i-1];
    ag=(ag*(period-1)+Math.max(d,0))/period;
    al=(al*(period-1)+Math.max(-d,0))/period;
    result[i]=al===0?100:100-100/(1+ag/al);
  }
  return result;
}

function linregSlope(arr) {
  const n=arr.length; if(n<2) return 0;
  let sx=0,sy=0,sxy=0,sx2=0;
  for(let i=0;i<n;i++){sx+=i;sy+=arr[i];sxy+=i*arr[i];sx2+=i*i;}
  const d=n*sx2-sx*sx;
  return d===0?0:(n*sxy-sx*sy)/d;
}
