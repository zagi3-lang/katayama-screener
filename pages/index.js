import { useState, useRef, useEffect } from "react";
import Head from "next/head";

const CRITERIA = [
  { key: "growth",     label: "成長性",         icon: "📈" },
  { key: "business",   label: "ビジネスモデル",  icon: "⚙️" },
  { key: "management", label: "経営者の質",      icon: "👤" },
  { key: "market",     label: "市場規模TAM",     icon: "🌐" },
  { key: "finance",    label: "財務健全性",      icon: "💴" },
  { key: "valuation",  label: "割安度",          icon: "🏷️" },
  { key: "tenbagger",  label: "テンバガー可能性", icon: "🚀" },
];

const HUNT_THEMES = [
  { id: "ai",       label: "AI・データセンター関連",    emoji: "🤖" },
  { id: "defense",  label: "防衛・安全保障",            emoji: "🛡️" },
  { id: "fiber",    label: "光ファイバー・非鉄金属",    emoji: "🔌" },
  { id: "saas",     label: "国内SaaS・DX",              emoji: "☁️" },
  { id: "inbound",  label: "インバウンド・観光",         emoji: "🗾" },
  { id: "smallcap", label: "小型成長株（グロース市場）", emoji: "💎" },
  { id: "shipbuild",label: "造船・舶用機器",            emoji: "🚢" },
];

const S_WATCHLIST = [
  "6954","6857","7012","7013","7011","6326","6506","6645","6702",
  "6723","6769","6762","6981","4063","8035","7735","6146","6501",
  "5803","5801","9412","9432","6701","6503","6988",
  "6814","6770","6751",
  "3697","4385","4478","3967","4443","4449","7048",
  "4901","4188","4208","4631",
  "4502","4503","4519","4568","6841",
  "6232","5572","6613","9310","2138","4168","4481",
  "2371","6809","6384","6125","6869","7730","9843",
];

const SIGNAL_MODES = [
  { id: "all",       label: "🔍 全シグナル",              desc: "すべての条件で抽出" },
  { id: "po_and_s",  label: "🏆 PO＋Sシグナル",          desc: "パーフェクトオーダー＋仕込みS（最強）" },
  { id: "po_only",   label: "📐 パーフェクトオーダーのみ", desc: "MA5>MA25>MA75>MA200" },
  { id: "s_only",    label: "💎 Sシグナルのみ",           desc: "OBV上昇×株価横ばい×RSI適正帯" },
];

const SECTORS = [
  { code: "all",  label: "🌐 全業種",      count: "~3,800" },
  { code: "3650", label: "💡 電気機器",    count: "~400" },
  { code: "5250", label: "📡 情報・通信",  count: "~350" },
  { code: "3600", label: "⚙️ 機械",        count: "~250" },
  { code: "3500", label: "🔩 非鉄金属",   count: "~80" },
  { code: "3750", label: "🔬 精密機器",   count: "~70" },
  { code: "3250", label: "💊 医薬品",      count: "~100" },
  { code: "3200", label: "🧪 化学",        count: "~200" },
  { code: "3700", label: "🚗 輸送用機器",  count: "~100" },
  { code: "6400", label: "🏢 サービス業", count: "~450" },
  { code: "5100", label: "🚢 海運",        count: "~15" },
];

const verdictCfg = {
  "強い買い候補": { color: "#00e5a0", bg: "rgba(0,229,160,0.1)", label: "🔥 強い買い候補" },
  "買い候補":     { color: "#4db8ff", bg: "rgba(77,184,255,0.1)", label: "✅ 買い候補" },
  "経過観察":     { color: "#ffd166", bg: "rgba(255,209,102,0.1)", label: "👁 経過観察" },
  "見送り":       { color: "#ff6b6b", bg: "rgba(255,107,107,0.1)", label: "❌ 見送り" },
};

const ANALYZE_SYSTEM = `あなたは片山晃（五月さん）の投資哲学を体現したAIスクリーニングエージェントです。
Web検索ツールを使い、IRバンク(irbank.net)・四季報オンライン・Yahoo!ファイナンス・企業IRページなどから最新の財務データを取得して分析してください。
分析後、以下のJSON形式のみで出力。マークダウン記号や説明文は不要:
{"summary":"総評（250字以内）","verdict":"買い候補","data_sources":["参照ソース1"],"key_metrics":{"revenue_growth":"直近売上成長率","roe":"ROE","pbr":"PBR","per":"PER","equity_ratio":"自己資本比率"},"scores":{"growth":7,"business":8,"management":7,"market":7,"finance":6,"valuation":6,"tenbagger":7},"strengths":["強み1","強み2","強み3"],"risks":["リスク1","リスク2"],"katayama_comment":"片山晃口調の一言"}
verdictは「強い買い候補」「買い候補」「経過観察」「見送り」のいずれか。scoresは1〜10の整数。`;

const HUNT_SYSTEM = `あなたは片山晃（五月さん）の投資哲学でテンバガー候補を発掘するAIエージェントです。
Web検索ツールを使い、IRバンク・四季報・グロース市場等から最新データを取得し、指定テーマで有望な日本株を3銘柄発掘してください。
発掘基準: 売上成長率20%以上、ROE15%超が理想、創業者・オーナー経営者、独自参入障壁、テンバガー余地あり
分析後、以下のJSON形式のみで出力。マークダウン記号や説明文は不要:
{"theme_comment":"テーマへの一言（口語・80字）","candidates":[{"code":"銘柄コード","name":"企業名","market":"グロース","reason":"発掘理由（120字）","appeal":"最大の魅力（25字）","key_metrics":{"revenue_growth":"XX%","roe":"XX%","pbr":"X.X倍"},"scores":{"growth":8,"business":7,"management":8,"market":7,"finance":6,"valuation":7,"tenbagger":8}}]}
candidatesは3件。marketは「グロース」「スタンダード」「プライム」のいずれか。scoresは1〜10の整数。`;

function extractJSON(text) {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try { return JSON.parse(cleaned); } catch (_) {}
  const s = cleaned.indexOf("{"), e = cleaned.lastIndexOf("}");
  if (s !== -1 && e > s) { try { return JSON.parse(cleaned.slice(s, e + 1)); } catch (_) {} }
  throw new Error("JSONの解析に失敗しました。");
}

async function callAPI(system, userMsg) {
  const res = await fetch("/api/claude", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, userMsg }),
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error || "APIエラー"); }
  return extractJSON((await res.json()).text);
}

function scoreAvg(scores) {
  const vals = Object.values(scores || {}).map(Number).filter(n => !isNaN(n));
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : 0;
}
// 売買代金の下限（円）。直近20日平均がこれ未満の銘柄は除外。5億円=500_000_000。
const MIN_TURNOVER = 500_000_000;
// 直近n営業日（土日のみ除外。祝日は market-bars 側で弾く）
function getRecentTradingDays(n) {
  const days = [];
  const d = new Date();
  while (days.length < n) {
    d.setDate(d.getDate() - 1);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    days.unshift(d.toISOString().slice(0, 10)); // 古い→新しい順
  }
  return days;
}

// クライアント側シグナル判定（ssignalのcalcSignalsを移植。series=[{c,v},...]昇順）
function clientCalcSignals(series, mode) {
  const n = series.length;
  if (n < 5) return { patterns: [] };
  const closes = series.map(d => d.c);
  const volumes = series.map(d => d.v);
  const turnovers = series.map(d => d.va || 0);
  const avgTurnover = turnovers.slice(-Math.min(20, n)).reduce((a, b) => a + b, 0) / Math.min(20, n);
  if (avgTurnover < MIN_TURNOVER) return { patterns: [] }; // 売買代金が薄い銘柄を除外
  const ma = (arr, p) => (arr.length < p ? null : arr.slice(-p).reduce((a, b) => a + b, 0) / p);

  const ma5 = ma(closes, 5);
  const ma25 = ma(closes, Math.min(25, n));
  const ma75 = ma(closes, Math.min(75, n));
  const ma200 = ma(closes, Math.min(200, n));
  const perfect_order = ma5 && ma25 && ma75 && ma200 ? (ma5 > ma25 && ma25 > ma75 && ma75 > ma200) : false;

  let obv = 0; const obvArr = [0];
  for (let i = 1; i < n; i++) {
    if (closes[i] > closes[i - 1]) obv += volumes[i];
    else if (closes[i] < closes[i - 1]) obv -= volumes[i];
    obvArr.push(obv);
  }
  const obvRising = obvArr[n - 1] > obvArr[Math.max(0, n - 10)] * 1.01;

  let gains = 0, losses = 0;
  const rsiLen = Math.min(14, n - 1);
  for (let i = n - rsiLen; i < n; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const rsi = gains + losses === 0 ? 50 : Math.round(100 * gains / (gains + losses));

  const recent = closes.slice(-Math.min(10, n));
  const priceFlat = (Math.max(...recent) - Math.min(...recent)) / Math.min(...recent) < 0.05;

  const vol5 = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const vol20 = volumes.slice(-Math.min(20, n)).reduce((a, b) => a + b, 0) / Math.min(20, n);
  const volSurge = vol20 > 0 && vol5 > vol20 * 1.5;

  const close = Math.round(closes[n - 1]);
  const patterns = []; let score = 0;
  if (perfect_order) { patterns.push({ key: "PO", emoji: "🏆", label: "パーフェクトオーダー" }); score += 40; }
  const sSignal = obvRising && priceFlat && rsi >= 40 && rsi <= 65;
  if (sSignal) { patterns.push({ key: "S", emoji: "💎", label: "仕込みS" }); score += 30; }
  if (obvRising && !priceFlat) { patterns.push({ key: "DIV", emoji: "📡", label: "OBVダイバージェンス" }); score += 10; }
  if (volSurge) { patterns.push({ key: "VOL", emoji: "🔥", label: "出来高急増" }); score += 10; }
  if (ma5 && ma25 && ma5 > ma25) { patterns.push({ key: "MA", emoji: "📐", label: "MA収束" }); score += 10; }
  if (rsi >= 30 && rsi <= 45) { patterns.push({ key: "RSI", emoji: "🔄", label: "RSI反転" }); score += 5; }

  if (mode === "po_only" && !perfect_order) return { patterns: [] };
  if (mode === "s_only" && !sSignal) return { patterns: [] };
  if (mode === "po_and_s" && !(perfect_order && sSignal)) return { patterns: [] };

  return {
    close, rsi,
    ma5: Math.round(ma5 ?? 0), ma25: Math.round(ma25 ?? 0),
    ma75: Math.round(ma75 ?? 0), ma200: Math.round(ma200 ?? 0),
    perfect_order, patterns, score,
  };
}
const F = { fontFamily: "'Hiragino Kaku Gothic ProN','Noto Sans JP','Yu Gothic',sans-serif" };

function ScoreBar({ score }) {
  const s = Math.min(10, Math.max(1, Number(score) || 1));
  const c = s >= 8 ? "#00e5a0" : s >= 6 ? "#4db8ff" : s >= 4 ? "#ffd166" : "#ff6b6b";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 5, background: "#21262d", borderRadius: 3 }}>
        <div style={{ width: s * 10 + "%", height: "100%", background: c, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, color: c, width: 16, textAlign: "right", fontWeight: 700 }}>{s}</span>
    </div>
  );
}

function Dots({ color = "#00e5a0" }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 14 }}>
      {[0,1,2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: color, animation: `dot 1.2s ease-in-out ${i*0.4}s infinite` }} />)}
    </div>
  );
}

function CandidateCard({ c, rank, onAnalyze }) {
  const rc = rank === 0 ? "#00e5a0" : rank === 1 ? "#4db8ff" : "#ffd166";
  const mc = c.market === "グロース" ? "#ffd166" : c.market === "スタンダード" ? "#4db8ff" : "#8b949e";
  const sc = c.scores || {}, km = c.key_metrics || {};
  return (
    <div style={{ position: "relative", marginTop: 16 }}>
      <div style={{ position: "absolute", top: -11, left: 16, background: rc, color: "#0a0c10", fontSize: 10, fontWeight: 800, padding: "2px 12px", borderRadius: 10, zIndex: 1 }}>
        #{rank+1} 推奨{rank===0?" ★":""}
      </div>
      <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 14, padding: 22, display: "flex", flexDirection: "column", gap: 13 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: "#f0f6fc" }}>{c.code}</span>
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, background: mc+"20", color: mc, border: "1px solid "+mc+"40" }}>{c.market}</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#c9d1d9" }}>{c.name}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#00e5a0", lineHeight: 1 }}>{scoreAvg(sc)}</div>
            <div style={{ fontSize: 10, color: "#8b949e", marginTop: 2 }}>/ 10</div>
          </div>
        </div>
        {c.appeal && <div style={{ background: "rgba(0,229,160,0.06)", border: "1px solid rgba(0,229,160,0.18)", borderRadius: 7, padding: "8px 13px", fontSize: 13, color: "#00e5a0", fontWeight: 700 }}>✨ {c.appeal}</div>}
        {Object.keys(km).length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {km.revenue_growth && <div style={{ display:"inline-flex",alignItems:"center",gap:5,background:"rgba(77,184,255,0.08)",border:"1px solid rgba(77,184,255,0.2)",borderRadius:6,padding:"4px 10px" }}><span style={{fontSize:10,color:"#8b949e"}}>売上成長</span><span style={{fontSize:12,color:"#4db8ff",fontWeight:700}}>{km.revenue_growth}</span></div>}
            {km.roe && <div style={{ display:"inline-flex",alignItems:"center",gap:5,background:"rgba(77,184,255,0.08)",border:"1px solid rgba(77,184,255,0.2)",borderRadius:6,padding:"4px 10px" }}><span style={{fontSize:10,color:"#8b949e"}}>ROE</span><span style={{fontSize:12,color:"#4db8ff",fontWeight:700}}>{km.roe}</span></div>}
          </div>
        )}
        {c.reason && <div style={{ fontSize: 13, color: "#8b949e", lineHeight: 1.75 }}>{c.reason}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {CRITERIA.map(cr => (
            <div key={cr.key} style={{ display: "grid", gridTemplateColumns: "110px 1fr", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: "#6e7681" }}>{cr.icon} {cr.label}</span>
              <ScoreBar score={sc[cr.key] || 1} />
            </div>
          ))}
        </div>
        <button onClick={() => onAnalyze(c.code+" "+c.name)}
          style={{ background: "rgba(77,184,255,0.08)", border: "1px solid rgba(77,184,255,0.3)", borderRadius: 9, padding: 11, color: "#4db8ff", fontSize: 14, fontWeight: 700, cursor: "pointer", ...F }}>
          🔬 この銘柄を詳細分析
        </button>
      </div>
    </div>
  );
}

function AnalysisResult({ result }) {
  const vc = verdictCfg[result.verdict] || verdictCfg["経過観察"];
  const total = scoreAvg(result.scores), sc = result.scores || {};
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "#161b22", border: "1px solid "+vc.color+"50", borderRadius: 14, padding: 22, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "inline-block", background: vc.bg, border: "1px solid "+vc.color+"60", borderRadius: 7, padding: "5px 14px", color: vc.color, fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{vc.label}</div>
          <div style={{ fontSize: 14, color: "#c9d1d9", lineHeight: 1.75 }}>{result.summary}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 78, height: 78, borderRadius: "50%", border: "3px solid "+vc.color, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: vc.bg }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: vc.color }}>{total}</span>
            <span style={{ fontSize: 9, color: "#8b949e" }}>/ 10</span>
          </div>
          <div style={{ fontSize: 10, color: "#8b949e", marginTop: 4 }}>総合スコア</div>
        </div>
      </div>
      <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 14, padding: 22 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#8b949e", marginBottom: 16 }}>片山流 7基準スコア</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {CRITERIA.map(c => (
            <div key={c.key} style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 13, color: "#c9d1d9" }}>{c.icon} {c.label}</span>
              <ScoreBar score={sc[c.key] || 1} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ background: "#161b22", border: "1px solid rgba(0,229,160,0.22)", borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#00e5a0", marginBottom: 11 }}>✅ 強み</div>
          {(result.strengths||[]).map((s,i,a) => <div key={i} style={{ fontSize: 13, color: "#c9d1d9", lineHeight: 1.65, padding: "5px 0", borderBottom: i<a.length-1?"1px solid #21262d":"none" }}>・{s}</div>)}
        </div>
        <div style={{ background: "#161b22", border: "1px solid rgba(255,107,107,0.22)", borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#ff6b6b", marginBottom: 11 }}>⚠️ リスク</div>
          {(result.risks||[]).map((r,i,a) => <div key={i} style={{ fontSize: 13, color: "#c9d1d9", lineHeight: 1.65, padding: "5px 0", borderBottom: i<a.length-1?"1px solid #21262d":"none" }}>・{r}</div>)}
        </div>
      </div>
      <div style={{ background: "linear-gradient(135deg,#161b22,#1c2128)", border: "1px solid #4db8ff35", borderRadius: 14, padding: 22 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg,#4db8ff,#0070f3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 800, color: "white", flexShrink: 0 }}>五</div>
          <div>
            <div style={{ fontSize: 11, color: "#4db8ff", marginBottom: 6, fontWeight: 700 }}>片山晃（五月さん）ならこう言う</div>
            <div style={{ fontSize: 15, color: "#f0f6fc", lineHeight: 1.8, fontStyle: "italic" }}>「{result.katayama_comment}」</div>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: "#6e7681", padding: "10px 15px", background: "#161b22", border: "1px solid #21262d", borderRadius: 9, lineHeight: 1.6 }}>
        ⚠️ 公開情報をもとにAIが分析。投資判断はご自身の責任で行ってください。
      </div>
    </div>
  );
}

function JQTestPanel({ refreshToken, setRefreshToken, onConnect }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  async function runTest() {
    if (!refreshToken.trim()) return;
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch("/api/jquants-test", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({refreshToken:refreshToken.trim()}) });
      const data = await res.json();
      setTestResult(data);
      if (data.ok) onConnect(refreshToken.trim());
    } catch(e) { setTestResult({ok:false,error:e.message}); }
    finally { setTesting(false); }
  }
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#f0f6fc", marginBottom: 14 }}>
        🔑 J-Quants APIキー設定
        <span style={{ fontSize: 11, color: "#8b949e", fontWeight: 400, marginLeft: 10 }}>
          <a href="https://jpx-jquants.com/" target="_blank" rel="noreferrer" style={{color:"#4db8ff"}}>jpx-jquants.com</a> → ログイン → APIキー
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "flex-end", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 5 }}>APIキー</div>
          <input type="password" value={refreshToken} onChange={e=>setRefreshToken(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!testing&&runTest()}
            placeholder="APIキーを貼り付け"
            style={{ width:"100%",background:"#161b22",border:"1px solid #30363d",borderRadius:7,padding:"9px 12px",color:"#f0f6fc",fontSize:13,outline:"none",fontFamily:"inherit" }} />
        </div>
        <button onClick={runTest} disabled={testing||!refreshToken.trim()}
          style={{ background:testing?"#21262d":"linear-gradient(135deg,#00e5a0,#00b87a)",border:"none",borderRadius:7,padding:"9px 20px",color:testing?"#8b949e":"#0a0c10",fontSize:14,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit" }}>
          {testing?"テスト中...":"🔬 接続テスト"}
        </button>
      </div>
      {testResult && (
        <div style={{ background:"#0d1117",border:`1px solid ${testResult.ok?"rgba(0,229,160,0.3)":"rgba(255,107,107,0.3)"}`,borderRadius:10,padding:14 }}>
          {testResult.ok
            ? <div style={{fontSize:12,color:"#00e5a0",fontWeight:700}}>✅ 接続成功！業種別全銘柄スキャン可能</div>
            : <div><div style={{fontSize:12,color:"#ff6b6b",fontWeight:700,marginBottom:6}}>❌ {testResult.error}</div></div>}
        </div>
      )}
    </div>
  );
}

// シグナル結果カード
function SignalCard({ r, onAnalyze }) {
  return (
    <div style={{ background:"#161b22",border:`1px solid ${r.perfect_order?"rgba(255,215,0,0.4)":"#30363d"}`,borderRadius:12,padding:"16px 20px" }}>
      <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,marginBottom:10 }}>
        <div style={{ display:"flex",alignItems:"center",gap:12 }}>
          <div>
            <div style={{ display:"flex",alignItems:"center",gap:8 }}>
              <span style={{ fontSize:18,fontWeight:800,color:"#f0f6fc" }}>{r.code}</span>
              {r.perfect_order && <span style={{ fontSize:10,padding:"2px 8px",borderRadius:5,background:"rgba(255,215,0,0.15)",border:"1px solid rgba(255,215,0,0.4)",color:"#ffd700",fontWeight:700 }}>🏆 PO</span>}
            </div>
            <div style={{ fontSize:11,color:"#8b949e",marginTop:2 }}>{r.name}{r.sector?` · ${r.sector}`:""}</div>
          </div>
          <div style={{ background:"rgba(0,229,160,0.08)",border:"1px solid rgba(0,229,160,0.3)",borderRadius:8,padding:"4px 10px",textAlign:"center" }}>
            <div style={{ fontSize:16,fontWeight:800,color:"#00e5a0" }}>{r.score}</div>
            <div style={{ fontSize:9,color:"#8b949e" }}>score</div>
          </div>
        </div>
        <button onClick={() => onAnalyze(r.code+" "+r.name)}
          style={{ background:"rgba(77,184,255,0.08)",border:"1px solid rgba(77,184,255,0.3)",borderRadius:8,padding:"9px 14px",color:"#4db8ff",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit" }}>
          🔬 詳細分析
        </button>
      </div>
      {r.perfect_order && (
        <div style={{ background:"rgba(255,215,0,0.06)",border:"1px solid rgba(255,215,0,0.2)",borderRadius:6,padding:"6px 10px",marginBottom:8,fontSize:11,color:"#ffd700" }}>
          🏆 MA5({r.ma5}) &gt; MA25({r.ma25}) &gt; MA75({r.ma75}) &gt; MA200({r.ma200})
        </div>
      )}
      <div style={{ display:"flex",flexWrap:"wrap",gap:6,marginBottom:8 }}>
        {(r.patterns||[]).map(p => <span key={p.key} style={{ fontSize:11,padding:"4px 10px",borderRadius:6,fontWeight:700,background:"rgba(0,229,160,0.08)",border:"1px solid rgba(0,229,160,0.35)",color:"#00e5a0" }}>{p.emoji} {p.label}</span>)}
      </div>
      <div style={{ display:"flex",flexWrap:"wrap",gap:6 }}>
        <span style={{ fontSize:11,padding:"3px 9px",borderRadius:5,border:"1px solid #30363d",color:r.rsi<=45?"#00e5a0":r.rsi<=63?"#ffd166":"#ff6b6b" }}>RSI {r.rsi}</span>
        <span style={{ fontSize:11,padding:"3px 9px",borderRadius:5,background:"rgba(107,114,128,0.08)",border:"1px solid #30363d",color:"#8b949e" }}>¥{r.close?.toLocaleString()}</span>
      </div>
    </div>
  );
}

export default function Home() {
  const [mode, setMode]                   = useState("hunt");
  const [ticker, setTicker]               = useState("");
  const [loading, setLoading]             = useState(false);
  const [statusMsg, setStatusMsg]         = useState("");
  const [huntResult, setHuntResult]       = useState(null);
  const [analyzeResult, setAnalyzeResult] = useState(null);
  const [analyzeTicker, setAnalyzeTicker] = useState("");
  const [selTheme, setSelTheme]           = useState(null);
  const [error, setError]                 = useState(null);
  const [jqApiKey, setJqApiKey]           = useState("");
  const [jqRefreshToken, setJqRefreshToken] = useState("");
  const [jqStatus, setJqStatus]           = useState("");
  const [showSettings, setShowSettings]   = useState(false);

  // Sシグナル
  const [sResult,  setSResult]   = useState([]);
  const [sLoading, setSLoading]  = useState(false);
  const [sStatus,  setSStatus]   = useState("");
  const [sError,   setSError]    = useState(null);
  const [sFilter,  setSFilter]   = useState("all");
  const [customInput, setCustomInput] = useState("");
  const [scanMode,    setScanMode]    = useState("watchlist");
  const [signalMode,  setSignalMode]  = useState("all");

  // 業種スキャン
  const [scanTarget,      setScanTarget]      = useState("watchlist"); // "watchlist"|"sector"|"custom"
  const [selectedSectors, setSelectedSectors] = useState(["all"]);
  const [sectorLoading,   setSectorLoading]   = useState(false);
  const [sectorStatus,    setSectorStatus]    = useState("");

  const inputRef = useRef(null);
  useEffect(() => { if (mode==="analyze") inputRef.current?.focus(); }, [mode]);

  function toggleSector(code) {
    if (code === "all") { setSelectedSectors(["all"]); return; }
    setSelectedSectors(prev => {
      const without = prev.filter(s => s !== "all");
      return without.includes(code) ? (without.filter(s=>s!==code)||["all"]) : [...without, code];
    });
  }

  async function hunt(theme) {
    setSelTheme(theme); setLoading(true); setHuntResult(null); setError(null);
    setStatusMsg("最新データを取得中...");
    try {
      const res = await callAPI(HUNT_SYSTEM, `片山晃流で「${theme.label}」テーマの日本株テンバガー候補を3銘柄発掘してください。JSONのみ出力。`);
      if (!Array.isArray(res.candidates)||res.candidates.length===0) throw new Error("候補データが取得できませんでした");
      setHuntResult(res);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); setStatusMsg(""); }
  }

  async function analyze(t) {
    const target = (t||ticker).trim(); if (!target) return;
    setMode("analyze"); setAnalyzeTicker(target);
    setLoading(true); setAnalyzeResult(null); setError(null);
    try {
      setStatusMsg("🧠 片山流7基準で分析中...");
      const res = await callAPI(ANALYZE_SYSTEM, `日本株「${target}」を分析してください。JSONのみ出力。`);
      setAnalyzeResult(res);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); setStatusMsg(""); }
  }

  async function startScan() {
    setSLoading(true); setSResult([]); setSError(null);

  
    // 業種スキャン（date ベース：銘柄数に依存せず日数ぶんで全市場を取得）
    if (scanTarget === "sector") {
      if (!jqApiKey) { setSError("業種スキャンにはJ-QuantsのAPIキー設定が必要です。右上⚙️設定から接続してください。"); setSLoading(false); return; }
      try {
        // Step1: 対象コード＋銘柄名を取得
        setSStatus("📡 銘柄マスターを取得中...");
        const masterRes = await fetch("/api/sector-scan", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: jqApiKey, sectors: selectedSectors }),
        });
        const masterData = await masterRes.json();
        if (!masterData.ok) { setSError(masterData.error || "銘柄マスター取得失敗"); setSLoading(false); return; }

        const targetCodes = new Set(masterData.codes || []);
        const codeMap = masterData.codeMap || {};
        if (targetCodes.size === 0) { setSError("対象銘柄が見つかりませんでした"); setSLoading(false); return; }

        // Step2: 直近DAYS営業日ぶんの全市場日足を「日付ごと」に取得
        const DAYS = 60; // 多いほどMA精度↑だがAPIコール↑（MA200には約200日必要）
        const tradingDays = getRecentTradingDays(DAYS);
        const seriesByCode = {};
        let gotDays = 0;

        for (let i = 0; i < tradingDays.length; i++) {
          setSStatus(`📈 全市場の日足を取得中... (${i + 1}/${tradingDays.length}日)`);
          let attempt = 0, done = false;
          while (attempt < 2 && !done) {
            attempt++;
            const r = await fetch("/api/market-bars", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ apiKey: jqApiKey, date: tradingDays[i] }),
            });
            const day = await r.json().catch(() => ({ ok: false }));
            if (day.ok) {
              done = true;
              if (day.count > 0) {
                gotDays++;
                for (const b of day.bars) {
                  if (!targetCodes.has(b.code)) continue; // 対象業種のみ保持
                  if (!seriesByCode[b.code]) seriesByCode[b.code] = [];
                  seriesByCode[b.code].push({ c: b.c, v: b.v, va: b.va });
                }
              }
            } else if (day.rateLimited) {
              await new Promise(res => setTimeout(res, 5000)); // 429は5秒待って再試行
            } else {
              done = true; // 取得不可日はスキップ
            }
          }
          await new Promise(res => setTimeout(res, 1100)); // Light 60req/分を尊重
        }

        if (gotDays === 0) { setSError("日足が取得できませんでした（APIキー/プラン/レート制限を確認）"); setSLoading(false); return; }

        // Step3: クライアント側でシグナル判定（名前はcodeMapから付与）
        setSStatus("🧮 シグナル判定中...");
        const all = [];
        for (const code of targetCodes) {
          const series = seriesByCode[code];
          if (!series || series.length < 5) continue;
          const sig = clientCalcSignals(series, signalMode);
          if (sig.patterns.length > 0) all.push({ code, name: codeMap[code] || code, ...sig });
        }
        all.sort((a, b) => b.score - a.score);
        setSResult(all);
        setSStatus(all.length === 0
          ? `${targetCodes.size}銘柄スキャン完了（${gotDays}日ぶん） — 条件を満たす銘柄なし`
          : `完了！ ${targetCodes.size}銘柄中 ${all.length}銘柄検出（${gotDays}日ぶん）`);
      } catch (e) { setSError(e.message); }
      finally { setSLoading(false); }
      return;
    }

    // ウォッチリスト or カスタム（date ベース：業種スキャンと同じ配管を再利用）
    const targetCodes = scanTarget === "custom"
      ? customInput.split(/[\s,\n]+/).map(s => s.trim()).filter(s => /^[0-9A-Za-z]{4}$/.test(s))
      : S_WATCHLIST;
    if (targetCodes.length === 0) { setSError("有効な4桁の銘柄コードを入力してください"); setSLoading(false); return; }
    if (!jqApiKey) { setSError("スキャンにはJ-QuantsのAPIキー設定が必要です。右上⚙️設定から接続してください。"); setSLoading(false); return; }

    try {
      const targetSet = new Set(targetCodes);
      const codeMap = {};
      for (const c of targetCodes) codeMap[c] = c; // 名前は後でbarsから付かないので暫定でコード

      const DAYS = 60;
      const tradingDays = getRecentTradingDays(DAYS);
      const seriesByCode = {};
      let gotDays = 0;

      for (let i = 0; i < tradingDays.length; i++) {
        setSStatus(`📈 日足を取得中... (${i + 1}/${tradingDays.length}日)`);
        let attempt = 0, done = false;
        while (attempt < 2 && !done) {
          attempt++;
          const r = await fetch("/api/market-bars", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ apiKey: jqApiKey, date: tradingDays[i] }),
          });
          const day = await r.json().catch(() => ({ ok: false }));
          if (day.ok) {
            done = true;
            if (day.count > 0) {
              gotDays++;
              for (const b of day.bars) {
                if (!targetSet.has(b.code)) continue; // 貼ったコードだけ保持
                if (!seriesByCode[b.code]) seriesByCode[b.code] = [];
                seriesByCode[b.code].push({ c: b.c, v: b.v, va: b.va });
              }
            }
          } else if (day.rateLimited) {
            await new Promise(res => setTimeout(res, 5000));
          } else {
            done = true;
          }
        }
        await new Promise(res => setTimeout(res, 1100)); // Light 60req/分
      }

      if (gotDays === 0) { setSError("日足が取得できませんでした（APIキー/プラン/レート制限を確認）"); setSLoading(false); return; }

      setSStatus("🧮 シグナル判定中...");
      const all = [];
      for (const code of targetCodes) {
        const series = seriesByCode[code];
        if (!series || series.length < 5) continue;
        const sig = clientCalcSignals(series, signalMode);
        if (sig.patterns.length > 0) all.push({ code, name: codeMap[code] || code, ...sig });
      }
      all.sort((a, b) => b.score - a.score);
      setSResult(all);
      setSStatus(all.length === 0
        ? `${targetCodes.length}銘柄スキャン完了（${gotDays}日ぶん） — 条件を満たす銘柄なし`
        : `完了！ ${targetCodes.length}銘柄中 ${all.length}銘柄検出（${gotDays}日ぶん）`);
    } catch (e) { setSError(e.message); }
    finally { setSLoading(false); }
  }

  const modeCfg = SIGNAL_MODES.find(m=>m.id===signalMode)||SIGNAL_MODES[0];
  const filteredResults = sResult.filter(r => sFilter==="all"||(r.patterns||[]).some(p=>p.key===sFilter));

  return (
    <>
      <Head><title>片山晃流 AIスクリーニングエージェント</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <div style={{ minHeight:"100vh",background:"#0a0c10",color:"#e8eaf0",...F }}>
        {/* Header */}
        <div style={{ background:"#161b22",borderBottom:"1px solid #21262d",padding:"16px 32px",position:"sticky",top:0,zIndex:10 }}>
          <div style={{ maxWidth:960,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10 }}>
            <div style={{ display:"flex",alignItems:"center",gap:12 }}>
              <div style={{ width:38,height:38,borderRadius:10,background:"linear-gradient(135deg,#00e5a0,#4db8ff)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:800,color:"#0a0c10" }}>五</div>
              <div>
                <div style={{ fontSize:16,fontWeight:700,color:"#f0f6fc" }}>片山晃流 AIスクリーニングエージェント</div>
                <div style={{ fontSize:11,color:"#8b949e" }}>J-Quants確定データ＋AI定性分析で追跡候補を発掘</div>
              </div>
            </div>
            <div style={{ display:"flex",gap:8,alignItems:"center" }}>
              <div style={{ fontSize:11,padding:"4px 10px",borderRadius:7,fontWeight:600,
                background:jqStatus==="ok"?"rgba(0,229,160,0.08)":"rgba(255,209,102,0.08)",
                border:jqStatus==="ok"?"1px solid rgba(0,229,160,0.3)":"1px solid rgba(255,209,102,0.3)",
                color:jqStatus==="ok"?"#00e5a0":"#ffd166" }}>
                {jqStatus==="ok"?"✅ J-Quants接続済":"⚠️ J-Quants未接続"}
              </div>
              <button onClick={()=>setShowSettings(v=>!v)} style={{ background:"#21262d",border:"1px solid #30363d",borderRadius:7,padding:"5px 12px",color:"#8b949e",fontSize:12,cursor:"pointer",fontFamily:"inherit" }}>⚙️ 設定</button>
            </div>
          </div>
          {showSettings && (
            <div style={{ maxWidth:960,margin:"12px auto 0",background:"#0d1117",border:"1px solid #30363d",borderRadius:10,padding:18 }}>
              <JQTestPanel refreshToken={jqRefreshToken} setRefreshToken={setJqRefreshToken} onConnect={token=>{ setJqApiKey(token); setJqStatus("ok"); }} />
            </div>
          )}
        </div>

        <div style={{ maxWidth:900,margin:"0 auto",padding:"32px 24px" }}>
          {/* Tabs */}
          <div style={{ display:"flex",gap:8,marginBottom:28,background:"#161b22",borderRadius:12,padding:5,border:"1px solid #30363d" }}>
            {[["hunt","🔍 銘柄を発掘する"],["analyze","🔬 銘柄を分析する"],["ssignal","🔎 Sシグナル発掘"]].map(([id,label])=>(
              <button key={id} onClick={()=>{setMode(id);setError(null);}} style={{
                flex:1,padding:"13px 10px",borderRadius:9,
                border:mode===id?"1px solid #4db8ff40":"1px solid transparent",
                background:mode===id?"linear-gradient(135deg,rgba(0,229,160,0.1),rgba(77,184,255,0.1))":"transparent",
                color:mode===id?"#f0f6fc":"#8b949e",fontWeight:mode===id?700:400,
                cursor:"pointer",fontSize:14,...F }}>{label}</button>
            ))}
          </div>

          {/* HUNT */}
          {mode==="hunt" && (
            <div>
              <div style={{ fontSize:14,color:"#8b949e",marginBottom:18 }}>テーマを選ぶと、IRバンク・四季報等から最新データを取得してテンバガー候補を3銘柄発掘します</div>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))",gap:11,marginBottom:28 }}>
                {HUNT_THEMES.map(th=>(
                  <button key={th.id} onClick={()=>hunt(th)} disabled={loading} style={{
                    background:selTheme?.id===th.id?"rgba(0,229,160,0.09)":"#161b22",
                    border:selTheme?.id===th.id?"1px solid rgba(0,229,160,0.5)":"1px solid #30363d",
                    borderRadius:11,padding:"16px 14px",color:"#c9d1d9",fontSize:13,fontWeight:600,
                    cursor:loading?"not-allowed":"pointer",textAlign:"left",...F,
                    display:"flex",alignItems:"center",gap:10,opacity:loading?0.5:1 }}>
                    <span style={{fontSize:22}}>{th.emoji}</span><span>{th.label}</span>
                  </button>
                ))}
              </div>
              {loading && <div style={{textAlign:"center",padding:"56px 0",color:"#8b949e"}}><div style={{fontSize:42,marginBottom:14}}>🔍</div><div style={{fontSize:15,marginBottom:6}}>「<span style={{color:"#00e5a0"}}>{selTheme?.label}</span>」のテンバガー候補を発掘中...</div><Dots color="#00e5a0"/></div>}
              {error&&!loading && <div style={{background:"rgba(255,107,107,0.08)",border:"1px solid rgba(255,107,107,0.3)",borderRadius:11,padding:18}}><div style={{color:"#ff6b6b",fontWeight:700,marginBottom:6}}>⚠️ エラー</div><div style={{color:"#ff9999",fontSize:13}}>{error}</div></div>}
              {huntResult&&!loading && (
                <div>
                  <div style={{background:"linear-gradient(135deg,#161b22,#1c2128)",border:"1px solid #4db8ff35",borderRadius:14,padding:20,marginBottom:22,display:"flex",gap:14,alignItems:"flex-start"}}>
                    <div style={{width:38,height:38,borderRadius:"50%",background:"linear-gradient(135deg,#4db8ff,#0070f3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800,color:"white"}}>五</div>
                    <div><div style={{fontSize:11,color:"#4db8ff",marginBottom:5,fontWeight:700}}>片山晃（五月さん）のテーマ評価</div><div style={{fontSize:14,color:"#f0f6fc",lineHeight:1.8,fontStyle:"italic"}}>「{huntResult.theme_comment}」</div></div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))",gap:16}}>
                    {huntResult.candidates.map((c,i)=><CandidateCard key={i} c={c} rank={i} onAnalyze={analyze}/>)}
                  </div>
                </div>
              )}
              {!huntResult&&!loading&&!error && <div style={{textAlign:"center",padding:"48px",color:"#6e7681",fontSize:14}}>👆 テーマを選択してください</div>}
            </div>
          )}

          {/* ANALYZE */}
          {mode==="analyze" && (
            <div>
              <div style={{background:"#161b22",border:"1px solid #30363d",borderRadius:14,padding:22,marginBottom:22}}>
                <div style={{fontSize:13,color:"#8b949e",marginBottom:9}}>銘柄コード または 企業名</div>
                <div style={{display:"flex",gap:10}}>
                  <input ref={inputRef} value={ticker} onChange={e=>setTicker(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!loading&&analyze()}
                    placeholder="例：5803 / 藤倉コンポジット / 川崎重工"
                    style={{flex:1,background:"#0d1117",border:"1px solid #30363d",borderRadius:9,padding:"13px 16px",color:"#f0f6fc",fontSize:15,outline:"none",...F}}/>
                  <button onClick={()=>analyze()} disabled={loading||!ticker.trim()} style={{background:loading?"#21262d":"linear-gradient(135deg,#00e5a0,#00b87a)",border:"none",borderRadius:9,padding:"13px 22px",color:loading?"#8b949e":"#0a0c10",fontSize:14,fontWeight:700,cursor:loading?"not-allowed":"pointer",whiteSpace:"nowrap",...F}}>
                    {loading?"分析中...":"最新データで分析"}
                  </button>
                </div>
              </div>
              {loading && <div style={{textAlign:"center",padding:"56px 0",color:"#8b949e"}}><div style={{fontSize:42,marginBottom:14}}>🔬</div><div style={{fontSize:15,marginBottom:6}}>「<span style={{color:"#4db8ff"}}>{analyzeTicker}</span>」を分析中...</div><div style={{fontSize:13,color:"#4db8ff",minHeight:20}}>{statusMsg}</div><Dots color="#4db8ff"/></div>}
              {error&&!loading && <div style={{background:"rgba(255,107,107,0.08)",border:"1px solid rgba(255,107,107,0.3)",borderRadius:11,padding:18}}><div style={{color:"#ff6b6b",fontWeight:700}}>⚠️ エラー</div><div style={{color:"#ff9999",fontSize:13}}>{error}</div></div>}
              {analyzeResult&&!loading && <AnalysisResult result={analyzeResult}/>}
              {!analyzeResult&&!loading&&!error && <div style={{textAlign:"center",padding:"48px",color:"#6e7681",fontSize:14}}>👆 銘柄を入力して分析</div>}
            </div>
          )}

          {/* Sシグナル発掘 */}
          {mode==="ssignal" && (
            <div>
              {/* シグナルモード */}
              <div style={{background:"#161b22",border:"1px solid #30363d",borderRadius:12,padding:16,marginBottom:16}}>
                <div style={{fontSize:12,color:"#8b949e",marginBottom:10,fontWeight:700}}>📊 スクリーニングモード</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {SIGNAL_MODES.map(m=>(
                    <button key={m.id} onClick={()=>setSignalMode(m.id)}
                      style={{padding:"10px 12px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",textAlign:"left",
                        background:signalMode===m.id?"linear-gradient(135deg,rgba(0,229,160,0.12),rgba(77,184,255,0.12))":"#0d1117",
                        border:signalMode===m.id?"1px solid rgba(0,229,160,0.5)":"1px solid #30363d",
                        color:signalMode===m.id?"#f0f6fc":"#8b949e"}}>
                      <div style={{fontSize:13,fontWeight:signalMode===m.id?700:400}}>{m.label}</div>
                      <div style={{fontSize:11,color:"#6e7681",marginTop:3}}>{m.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* スキャン対象 */}
              <div style={{background:"#161b22",border:"1px solid #30363d",borderRadius:12,padding:16,marginBottom:16}}>
                <div style={{fontSize:12,color:"#8b949e",marginBottom:10,fontWeight:700}}>🎯 スキャン対象</div>
                <div style={{display:"flex",gap:8,marginBottom:12}}>
                  {[["watchlist",`📋 ウォッチリスト（${S_WATCHLIST.length}銘柄）`],["sector","🏭 業種別スキャン"],["custom","✏️ カスタム"]].map(([t,label])=>(
                    <button key={t} onClick={()=>setScanTarget(t)}
                      style={{flex:1,padding:"9px 8px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:scanTarget===t?700:400,
                        background:scanTarget===t?"linear-gradient(135deg,rgba(0,229,160,0.1),rgba(77,184,255,0.1))":"transparent",
                        border:scanTarget===t?"1px solid #4db8ff40":"1px solid #30363d",
                        color:scanTarget===t?"#f0f6fc":"#8b949e"}}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* 業種選択 */}
                {scanTarget==="sector" && (
                  <div>
                    {jqStatus!=="ok" && (
                      <div style={{background:"rgba(255,209,102,0.08)",border:"1px solid rgba(255,209,102,0.3)",borderRadius:8,padding:"10px 14px",marginBottom:10,fontSize:12,color:"#ffd166"}}>
                        ⚠️ 業種スキャンにはJ-Quantsのご接続が必要です。右上⚙️設定からAPIキーを入力してください。
                      </div>
                    )}
                    <div style={{fontSize:11,color:"#8b949e",marginBottom:8}}>業種を選択（複数可）</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {SECTORS.map(s=>{
                        const sel = selectedSectors.includes(s.code)||(s.code==="all"&&selectedSectors.includes("all"));
                        return (
                          <button key={s.code} onClick={()=>toggleSector(s.code)}
                            style={{padding:"7px 12px",borderRadius:8,fontSize:12,cursor:"pointer",fontFamily:"inherit",
                              background:sel?"rgba(0,229,160,0.1)":"#0d1117",
                              border:sel?"1px solid rgba(0,229,160,0.5)":"1px solid #30363d",
                              color:sel?"#00e5a0":"#8b949e"}}>
                            {s.label} <span style={{fontSize:10,color:"#6e7681"}}>({s.count})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* カスタム入力 */}
                {scanTarget==="custom" && (
                  <div>
                    <div style={{fontSize:12,color:"#8b949e",marginBottom:8}}>銘柄コードをスペース・カンマ・改行で入力</div>
                    <textarea value={customInput} onChange={e=>setCustomInput(e.target.value)}
                      placeholder={"6981 8035 6857 7012 4449\n7013 6809 5803 6769"}
                      style={{width:"100%",minHeight:80,background:"#0d1117",border:"1px solid #30363d",borderRadius:8,padding:"10px 12px",color:"#f0f6fc",fontSize:13,outline:"none",fontFamily:"monospace",resize:"vertical",boxSizing:"border-box"}}/>
                  </div>
                )}
              </div>

              {/* フィルター */}
              <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
                {[["all","🔍 全件"],["PO","🏆 PO"],["S","💎 仕込みS"],["DIV","📡 OBVダイバージェンス"],["VOL","🔥 出来高急増"],["MA","📐 MA収束"],["RSI","🔄 RSI反転"]].map(([f,label])=>(
                  <button key={f} onClick={()=>setSFilter(f)}
                    style={{padding:"7px 14px",borderRadius:8,fontSize:12,cursor:"pointer",fontFamily:"inherit",
                      background:sFilter===f?"rgba(0,229,160,0.1)":"#161b22",
                      border:sFilter===f?"1px solid rgba(0,229,160,0.5)":"1px solid #30363d",
                      color:sFilter===f?"#00e5a0":"#8b949e"}}>
                    {label}
                  </button>
                ))}
              </div>

              {/* スキャンボタン */}
              <button onClick={startScan} disabled={sLoading}
                style={{width:"100%",background:sLoading?"#21262d":"linear-gradient(135deg,#00e5a0,#00b87a)",
                  border:"none",borderRadius:11,padding:"16px",color:sLoading?"#8b949e":"#0a0c10",
                  fontSize:15,fontWeight:700,cursor:sLoading?"not-allowed":"pointer",marginBottom:20,fontFamily:"inherit"}}>
                {sLoading?`🔄 ${sStatus}`:`${modeCfg.label} でスキャン開始`}
              </button>

              {sLoading && (
                <div style={{background:"#161b22",border:"1px solid rgba(0,229,160,0.3)",borderRadius:14,padding:28,textAlign:"center",marginBottom:16}}>
                  <div style={{fontSize:36,marginBottom:12}}>🔎</div>
                  <div style={{fontSize:15,color:"#f0f6fc",fontWeight:700,marginBottom:8}}>スキャン中...</div>
                  <div style={{fontSize:13,color:"#00e5a0",marginBottom:16}}>{sStatus}</div>
                  <Dots color="#00e5a0"/>
                  {jqStatus==="ok" && <div style={{fontSize:11,color:"#4db8ff",marginTop:12}}>✅ J-Quants APIで高精度スキャン中</div>}
                </div>
              )}

              {sError && <div style={{background:"rgba(255,107,107,0.08)",border:"1px solid rgba(255,107,107,0.3)",borderRadius:11,padding:18,color:"#ff6b6b"}}>⚠️ {sError}</div>}

              {filteredResults.length>0&&!sLoading && (
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{fontSize:13,color:"#00e5a0",fontWeight:700,marginBottom:4}}>✅ {filteredResults.length}銘柄検出 — スコア順</div>
                  {filteredResults.map(r=><SignalCard key={r.code} r={r} onAnalyze={analyze}/>)}
                </div>
              )}

              {!sLoading&&sResult.length===0&&!sError&&sStatus==="" && (
                <div style={{textAlign:"center",padding:"48px",color:"#6e7681",fontSize:14}}>
                  👆 モードと対象を選んでスキャン開始<br/>
                  <span style={{fontSize:12,color:jqStatus==="ok"?"#4db8ff":"#6e7681"}}>
                    {jqStatus==="ok"?"✅ J-Quants接続済 — 業種別全銘柄スキャン可能":"⚠️ J-Quants未設定 — ⚙️設定からAPIキーを入力すると業種スキャンが使えます"}
                  </span>
                </div>
              )}
              {!sLoading&&sResult.length===0&&!sError&&sStatus!=="" && (
                <div style={{background:"rgba(255,209,102,0.06)",border:"1px solid rgba(255,209,102,0.3)",borderRadius:14,padding:28,textAlign:"center"}}>
                  <div style={{fontSize:32,marginBottom:12}}>🔍</div>
                  <div style={{fontSize:14,color:"#ffd166",fontWeight:700}}>現時点で条件を満たす銘柄はゼロでした</div>
                  <div style={{fontSize:11,color:"#6e7681",marginTop:8}}>{sStatus}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
