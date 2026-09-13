// lib/signals.js
// シグナル判定の共通モジュール。
// pages/index.js (clientCalcSignals) と pages/api/ssignal.js (calcSignals) の
// 重複していたロジックをここに一本化する。
//
// series: [{ c, h, l, v, va }] を古い→新しい順で渡す。
//   c=終値 / h=高値 / l=安値 / v=出来高 / va=売買代金
//   h,l が無い系列（旧market-bars）でも動くよう c でフォールバックする。

export const SIG_DEFAULTS = {
  minTurnover: 500_000_000, // 売買代金20日平均の下限（円）

  // --- OBV（符号バグ修正版）---
  obvWin: 10,   // 何本前と比較するか
  obvTh: 0.50,  // 正味出来高 ÷ 平均出来高。0.5＝平均出来高の半日分を正味で買い上がった

  // --- 値幅収縮（ATX相対に変更）---
  tightWin: 10,
  tightK: 3.0,      // 直近レンジ ÷ ATR14 がこの値以下なら「横ばい」
  tightCapPct: 0.12, // 保険。レンジが終値比12%を超えたら横ばい扱いしない

  // --- RSI ---
  rsiLo: 40, rsiHi: 65,

  // --- VCP ---
  vcpLookback: 45,   // 収縮を探す窓（本）
  vcpPivotK: 2,      // ピボット判定の左右本数
  vcpMinWaves: 2,    // 最低収縮回数
  vcpShrink: 0.75,   // 各収縮は前回の75%以下であること
  vcpMaxDepth: 0.35, // 最大の押しが35%を超えるものは除外
  vcpFinalDepth: 0.10, // 最後の収縮は10%以内
  vcpNearHigh: 0.92, // 終値が窓内高値の92%以上
  vcpVolShrink: 0.85, // 最終波の平均出来高が初回波の85%以下

  // --- MA ---
  maStrict: true, // true: 本数が足りないMAは null にして判定を不成立にする
};

// ───────── 基本ユーティリティ ─────────

export function sma(arr, period) {
  if (!arr || arr.length < period) return null;
  let s = 0;
  for (let i = arr.length - period; i < arr.length; i++) s += arr[i];
  return s / period;
}

function pick(d, keys, fallback) {
  for (const k of keys) {
    const v = Number(d[k]);
    if (isFinite(v) && v > 0) return v;
  }
  return fallback;
}

// series を { closes, highs, lows, volumes, turnovers } に正規化
export function normalize(series) {
  const closes = [], highs = [], lows = [], volumes = [], turnovers = [];
  for (const d of series) {
    const c = pick(d, ["c", "close", "C"], 0);
    if (!(c > 0)) continue;
    closes.push(c);
    highs.push(pick(d, ["h", "high", "H"], c));
    lows.push(pick(d, ["l", "low", "L"], c));
    volumes.push(Number(d.v ?? d.volume ?? d.Vo ?? 0) || 0);
    turnovers.push(Number(d.va ?? d.turnover ?? d.Va ?? 0) || 0);
  }
  return { closes, highs, lows, volumes, turnovers };
}

// ───────── ATR（True Range の単純平均）─────────

export function atr(highs, lows, closes, period = 14) {
  const n = closes.length;
  if (n < 2) return null;
  const p = Math.min(period, n - 1);
  let s = 0;
  for (let i = n - p; i < n; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    s += tr;
  }
  return s / p;
}

// ───────── OBV（符号バグ修正）─────────
//
// 旧: obv[n-1] > obv[n-10] * 1.01
//   OBVは符号付きの累積値なので、基準が負のとき *1.01 は「より小さい値」になり
//   条件が緩くなる。正のときだけ1%上昇を要求する非対称な判定だった。
// 新: 直近win本の「正味出来高 ÷ 総出来高」（買い越し比率、-1〜+1）で判定する。
//   符号にも銘柄の出来高規模にも依存せず、値の意味が一定になる。

export function obvStrength(closes, volumes, win) {
  const n = closes.length;
  if (n < 2) return 0;
  const w = Math.min(win, n - 1);
  let net = 0, gross = 0;
  for (let i = n - w; i < n; i++) {
    const v = volumes[i] || 0;
    gross += v;
    if (closes[i] > closes[i - 1]) net += v;
    else if (closes[i] < closes[i - 1]) net -= v;
  }
  if (!(gross > 0)) return 0;
  return net / gross; // +1.0 = 全出来高が上げ日 / 0 = 拮抗 / -1.0 = 全て下げ日
}

// ───────── 値幅収縮（ATR相対）─────────
//
// 旧: 直近10本のレンジが終値比5%未満（固定）
//   → 指数が週で6%動く局面では全銘柄が脱落し、凪の週は大量検出になる。
// 新: レンジ ÷ ATR14。銘柄・局面のボラティリティで自動的に基準が伸縮する。

export function tightness(highs, lows, closes, cfg) {
  const n = closes.length;
  const w = Math.min(cfg.tightWin, n);
  const hi = Math.max(...highs.slice(-w));
  const lo = Math.min(...lows.slice(-w));
  const a = atr(highs, lows, closes, 14);
  const range = hi - lo;
  const rangePct = lo > 0 ? range / lo : 1;
  if (!a || a <= 0) return { flat: false, ratio: null, rangePct };
  const ratio = range / a;
  return {
    flat: ratio <= cfg.tightK && rangePct <= cfg.tightCapPct,
    ratio,
    rangePct,
  };
}

// ───────── VCP（Volatility Contraction Pattern）─────────

function findPivots(highs, lows, k) {
  const out = [];
  for (let i = k; i < highs.length - k; i++) {
    let isH = true, isL = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (highs[j] >= highs[i]) isH = false;
      if (lows[j] <= lows[i]) isL = false;
    }
    if (isH) out.push({ i, type: "H", p: highs[i] });
    if (isL) out.push({ i, type: "L", p: lows[i] });
  }
  out.sort((a, b) => a.i - b.i);
  // 同種が連続したら極値の方を残して交互列にする
  const alt = [];
  for (const pv of out) {
    const last = alt[alt.length - 1];
    if (!last || last.type !== pv.type) { alt.push(pv); continue; }
    if (pv.type === "H" ? pv.p > last.p : pv.p < last.p) alt[alt.length - 1] = pv;
  }
  return alt;
}

export function detectVCP(highs, lows, closes, volumes, cfg) {
  const n = closes.length;
  const w = Math.min(cfg.vcpLookback, n);
  if (w < 15) return { ok: false, reason: "履歴不足", waves: 0 };

  const H = highs.slice(-w), L = lows.slice(-w), V = volumes.slice(-w);
  const alt = findPivots(H, L, cfg.vcpPivotK);
  if (alt.length < 3) return { ok: false, reason: "ピボット不足", waves: 0 };

  // 高値→安値 のペアを順に拾って収縮の深さを作る
  const waves = [];
  for (let i = 0; i < alt.length - 1; i++) {
    if (alt[i].type === "H" && alt[i + 1].type === "L") {
      const depth = (alt[i].p - alt[i + 1].p) / alt[i].p;
      if (depth > 0) waves.push({ depth, from: alt[i].i, to: alt[i + 1].i });
    }
  }
  if (waves.length < cfg.vcpMinWaves) {
    return { ok: false, reason: "収縮回数不足", waves: waves.length, depths: waves.map(x => x.depth) };
  }

  const depths = waves.map(x => x.depth);
  const maxDepth = Math.max(...depths);
  const finalDepth = depths[depths.length - 1];

  // 収縮が単調に縮んでいるか
  let shrinking = true;
  for (let i = 1; i < depths.length; i++) {
    if (depths[i] > depths[i - 1] * cfg.vcpShrink) { shrinking = false; break; }
  }

  // 出来高も枯れているか
  const first = waves[0], last = waves[waves.length - 1];
  const avg = (a, b) => {
    const seg = V.slice(a, Math.max(a + 1, b + 1));
    return seg.length ? seg.reduce((x, y) => x + y, 0) / seg.length : 0;
  };
  const vFirst = avg(first.from, first.to);
  const vLast = avg(last.from, last.to);
  const volRatio = vFirst > 0 ? vLast / vFirst : 1;

  const nearHigh = closes[n - 1] >= Math.max(...H) * cfg.vcpNearHigh;

  const ok =
    shrinking &&
    maxDepth <= cfg.vcpMaxDepth &&
    finalDepth <= cfg.vcpFinalDepth &&
    nearHigh &&
    volRatio <= cfg.vcpVolShrink;

  let reason = "";
  if (!shrinking) reason = "収縮が単調でない";
  else if (maxDepth > cfg.vcpMaxDepth) reason = "押しが深すぎ";
  else if (finalDepth > cfg.vcpFinalDepth) reason = "最終収縮が緩い";
  else if (!nearHigh) reason = "高値圏でない";
  else if (volRatio > cfg.vcpVolShrink) reason = "出来高が枯れていない";

  return {
    ok, reason,
    waves: waves.length,
    depths,
    maxDepth, finalDepth, volRatio, nearHigh,
  };
}

// ───────── 本体 ─────────

export function calcSignals(series, mode, options = {}) {
  const cfg = { ...SIG_DEFAULTS, ...options };
  const { closes, highs, lows, volumes, turnovers } = normalize(series);
  const n = closes.length;
  if (n < 5) return { patterns: [], skipped: "履歴5本未満" };

  // 流動性フィルタ（turnover が全てゼロの系列では無効化＝旧ssignal互換）
  const tw = Math.min(20, n);
  const avgTurnover = turnovers.slice(-tw).reduce((a, b) => a + b, 0) / tw;
  const hasTurnover = turnovers.some(x => x > 0);
  if (hasTurnover && avgTurnover < cfg.minTurnover) {
    return { patterns: [], skipped: "売買代金不足" };
  }

  // --- 移動平均（本数不足のMAは null。旧実装の Math.min(200,n) は
  //     n<200 のとき MA75 と MA200 が同値になり PO が恒常的に false だった）---
  const ma5 = sma(closes, 5);
  const ma25 = sma(closes, 25);
  const ma75 = sma(closes, 75);
  const ma200 = sma(closes, 200);
  const poAvailable = ma5 !== null && ma25 !== null && ma75 !== null && ma200 !== null;
  const perfect_order = poAvailable
    ? (ma5 > ma25 && ma25 > ma75 && ma75 > ma200)
    : false;

  // --- OBV ---
  const obvStr = obvStrength(closes, volumes, cfg.obvWin);
  const obvRising = obvStr >= cfg.obvTh;

  // --- RSI ---
  let gains = 0, losses = 0;
  const rsiLen = Math.min(14, n - 1);
  for (let i = n - rsiLen; i < n; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const rsi = gains + losses === 0 ? 50 : Math.round(100 * gains / (gains + losses));

  // --- 収縮 ---
  const tight = tightness(highs, lows, closes, cfg);
  const priceFlat = tight.flat;

  // --- 出来高急増 ---
  const vol5 = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const vw = Math.min(20, n);
  const vol20 = volumes.slice(-vw).reduce((a, b) => a + b, 0) / vw;
  const volSurge = vol20 > 0 && vol5 > vol20 * 1.5;

  // --- VCP ---
  const vcp = detectVCP(highs, lows, closes, volumes, cfg);

  const close = Math.round(closes[n - 1]);
  const patterns = [];
  let score = 0;

  if (perfect_order) {
    patterns.push({ key: "PO", emoji: "🏆", label: "パーフェクトオーダー", detail: "MA5>MA25>MA75>MA200" });
    score += 40;
  }
  if (vcp.ok) {
    patterns.push({
      key: "VCP", emoji: "🌀", label: "VCP",
      detail: `${vcp.waves}段収縮 ${vcp.depths.map(d => (d * 100).toFixed(0) + "%").join("→")} 出来高${(vcp.volRatio * 100).toFixed(0)}%`,
    });
    score += 35;
  }
  const sSignal = obvRising && priceFlat && rsi >= cfg.rsiLo && rsi <= cfg.rsiHi;
  if (sSignal) {
    patterns.push({
      key: "S", emoji: "💎", label: "仕込みS",
      detail: `OBV${obvStr.toFixed(2)}×レンジ${tight.ratio ? tight.ratio.toFixed(1) : "-"}ATR×RSI${rsi}`,
    });
    score += 30;
  }
  if (obvRising && !priceFlat) {
    patterns.push({ key: "DIV", emoji: "📡", label: "OBVダイバージェンス", detail: `OBV${obvStr.toFixed(2)}` });
    score += 10;
  }
  if (volSurge) {
    patterns.push({ key: "VOL", emoji: "🔥", label: "出来高急増", detail: `${(vol5 / vol20).toFixed(1)}x` });
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

  // モードフィルタ
  if (mode === "po_only" && !perfect_order) return { patterns: [], poAvailable };
  if (mode === "s_only" && !sSignal) return { patterns: [], poAvailable };
  if (mode === "vcp_only" && !vcp.ok) return { patterns: [], poAvailable, vcpReason: vcp.reason };
  if (mode === "po_and_s" && !(perfect_order && sSignal)) return { patterns: [], poAvailable };
  if (mode === "vcp_and_s" && !(vcp.ok && sSignal)) return { patterns: [], poAvailable };

  return {
    close, rsi,
    ma5: Math.round(ma5 ?? 0),
    ma25: Math.round(ma25 ?? 0),
    ma75: Math.round(ma75 ?? 0),
    ma200: Math.round(ma200 ?? 0),
    perfect_order, poAvailable,
    obv_strength: Math.round(obvStr * 100) / 100,
    range_atr: tight.ratio ? Math.round(tight.ratio * 10) / 10 : null,
    vcp_waves: vcp.waves, vcp_ok: vcp.ok,
    patterns, score,
    s_count: patterns.filter(p => p.key === "S").length,
    bars: n,
    name: "",
  };
}

// PO / VCP に必要な履歴本数をモードから逆算する（取得日数の決定に使う）
export function requiredBars(mode) {
  if (mode === "po_only" || mode === "po_and_s") return 200;
  if (mode === "vcp_only" || mode === "vcp_and_s") return 60;
  return 60;
}
