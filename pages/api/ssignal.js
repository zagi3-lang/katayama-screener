// pages/api/ssignal.js — J-Quants v2正式対応版（dataキー対応）
// 判定ロジックは lib/signals.js に一本化済み（重複実装を廃止）
import { calcSignals, requiredBars } from "../../lib/signals";
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { codes, apiKey, mode } = req.body;
  if (!codes || !Array.isArray(codes) || codes.length === 0) {
    return res.status(400).json({ error: "codesが必要です" });
  }

  const results = [];
  const debug = { fetched: 0, failed: 0, no_signal: 0, skipped: {} };
  // モードが要求する本数から取得日数を逆算（暦日の平日ベースなので1.45倍しておく）
  const needDays = Math.ceil(requiredBars(mode) * 1.45);

  for (const code of codes) {
    try {
      let data = null;

      if (apiKey) {
        data = await fetchFromJQuants(code, apiKey, needDays);
      }
      if (!data || data.length < 5) {
        data = await fetchFromStooq(code);
      }
      if (!data || data.length < 5) { debug.failed++; continue; }

      debug.fetched++;
      const series = data.map(d => ({ c: d.close, h: d.high, l: d.low, v: d.volume, va: 0 }));
      const signal = calcSignals(series, mode);
      if (signal.skipped) debug.skipped[signal.skipped] = (debug.skipped[signal.skipped] || 0) + 1;
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
          po_available:  signal.poAvailable,
          obv_strength:  signal.obv_strength,
          range_atr:     signal.range_atr,
          vcp_waves:     signal.vcp_waves,
          bars:          signal.bars,
        });
      } else { debug.no_signal++; }
    } catch (e) { debug.failed++; }
  }

  results.sort((a, b) => b.score - a.score);
  return res.status(200).json({ results, debug, total: codes.length });
}

// ── J-Quants v2（dateパラメータ、dataキー対応）──
async function fetchFromJQuants(code, apiKey, days = 30) {
  try {
    const headers = { "x-api-key": apiKey };
    const tradingDays = getRecentTradingDays(days);
    const allQuotes = [];

    const BATCH = 5;
    for (let i = 0; i < tradingDays.length; i += BATCH) {
      const batch = tradingDays.slice(i, i + BATCH);
      const settled = await Promise.allSettled(
        batch.map(async (date) => {
          const dateStr = date.replace(/-/g, "");
          const url = `https://api.jquants.com/v2/equities/bars/daily?code=${code}&date=${dateStr}`;
          const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
          if (!r.ok) return [];
          const json = await r.json();
          // "data"キー対応（v2の実際のレスポンス）
          return json.daily_quotes ?? json.bars ?? json.data ?? [];
        })
      );
      for (const r of settled) {
        if (r.status === "fulfilled") allQuotes.push(...r.value);
      }
    }

    if (allQuotes.length < 5) return null;
    return allQuotes
      .sort((a, b) => (a.Date ?? a.date ?? "").localeCompare(b.Date ?? b.date ?? ""))
      .map(q => ({
        date:   q.Date   ?? q.date,
        open:   parseFloat(q.Open   ?? q.O ?? q.open   ?? 0),
        high:   parseFloat(q.High   ?? q.H ?? q.high   ?? 0),
        low:    parseFloat(q.Low    ?? q.L ?? q.low    ?? 0),
        close:  parseFloat(q.Close  ?? q.C ?? q.close  ?? 0),
        volume: parseFloat(q.Volume ?? q.Vo ?? q.volume ?? 0),
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
    if (lines.length < 5) return null;
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

// calcSignals はここにあった実装を lib/signals.js へ移動しました。
