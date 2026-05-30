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

const verdictCfg = {
  "強い買い候補": { color: "#00e5a0", bg: "rgba(0,229,160,0.1)", label: "🔥 強い買い候補" },
  "買い候補":     { color: "#4db8ff", bg: "rgba(77,184,255,0.1)", label: "✅ 買い候補" },
  "経過観察":     { color: "#ffd166", bg: "rgba(255,209,102,0.1)", label: "👁 経過観察" },
  "見送り":       { color: "#ff6b6b", bg: "rgba(255,107,107,0.1)", label: "❌ 見送り" },
};

const ANALYZE_SYSTEM = `あなたは片山晃（五月さん）の投資哲学を体現したAIスクリーニングエージェントです。
Web検索ツールを使い、IRバンク(irbank.net)・四季報オンライン・Yahoo!ファイナンス・企業IRページなどから最新の財務データを取得して分析してください。
分析後、以下のJSON形式のみで出力。マークダウン記号や説明文は不要:
{"summary":"総評（250字以内）","verdict":"買い候補","data_sources":["参照ソース1","参照ソース2"],"key_metrics":{"revenue_growth":"直近売上成長率","roe":"ROE","pbr":"PBR","per":"PER","equity_ratio":"自己資本比率"},"scores":{"growth":7,"business":8,"management":7,"market":7,"finance":6,"valuation":6,"tenbagger":7},"strengths":["強み1","強み2","強み3"],"risks":["リスク1","リスク2"],"katayama_comment":"片山晃口調の一言"}
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
  if (s !== -1 && e > s) {
    try { return JSON.parse(cleaned.slice(s, e + 1)); } catch (_) {}
  }
  throw new Error("JSONの解析に失敗しました。もう一度お試しください。");
}

async function callAPI(system, userMsg) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, userMsg }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || "APIエラー " + res.status);
  }
  const data = await res.json();
  return extractJSON(data.text);
}

function scoreAvg(scores) {
  const vals = Object.values(scores || {}).map(Number).filter(n => !isNaN(n));
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : 0;
}

const F = { fontFamily: "'Hiragino Kaku Gothic ProN','Noto Sans JP','Yu Gothic',sans-serif" };

function ScoreBar({ score }) {
  const s = Math.min(10, Math.max(1, Number(score) || 1));
  const c = s >= 8 ? "#00e5a0" : s >= 6 ? "#4db8ff" : s >= 4 ? "#ffd166" : "#ff6b6b";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 5, background: "#21262d", borderRadius: 3 }}>
        <div style={{ width: s * 10 + "%", height: "100%", background: c, borderRadius: 3, transition: "width 0.6s ease" }} />
      </div>
      <span style={{ fontSize: 12, color: c, width: 16, textAlign: "right", fontWeight: 700 }}>{s}</span>
    </div>
  );
}

function Dots({ color = "#00e5a0" }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 14 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: color, animation: `dot 1.2s ease-in-out ${i * 0.4}s infinite` }} />
      ))}
    </div>
  );
}

function MetricBadge({ label, value }) {
  if (!value || value === "N/A") return null;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(77,184,255,0.08)", border: "1px solid rgba(77,184,255,0.2)", borderRadius: 6, padding: "4px 10px" }}>
      <span style={{ fontSize: 10, color: "#8b949e" }}>{label}</span>
      <span style={{ fontSize: 12, color: "#4db8ff", fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function CandidateCard({ c, rank, onAnalyze }) {
  const rc = rank === 0 ? "#00e5a0" : rank === 1 ? "#4db8ff" : "#ffd166";
  const mc = c.market === "グロース" ? "#ffd166" : c.market === "スタンダード" ? "#4db8ff" : "#8b949e";
  const sc = c.scores || {};
  const km = c.key_metrics || {};
  return (
    <div style={{ position: "relative", marginTop: 16 }}>
      <div style={{ position: "absolute", top: -11, left: 16, background: rc, color: "#0a0c10", fontSize: 10, fontWeight: 800, padding: "2px 12px", borderRadius: 10, zIndex: 1 }}>
        #{rank + 1} 推奨{rank === 0 ? " ★" : ""}
      </div>
      <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 14, padding: 22, display: "flex", flexDirection: "column", gap: 13 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: "#f0f6fc" }}>{c.code}</span>
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, background: mc + "20", color: mc, border: "1px solid " + mc + "40" }}>{c.market}</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#c9d1d9" }}>{c.name}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#00e5a0", lineHeight: 1 }}>{scoreAvg(sc)}</div>
            <div style={{ fontSize: 10, color: "#8b949e", marginTop: 2 }}>/ 10</div>
          </div>
        </div>
        {c.appeal && (
          <div style={{ background: "rgba(0,229,160,0.06)", border: "1px solid rgba(0,229,160,0.18)", borderRadius: 7, padding: "8px 13px", fontSize: 13, color: "#00e5a0", fontWeight: 700 }}>✨ {c.appeal}</div>
        )}
        {Object.keys(km).length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <MetricBadge label="売上成長" value={km.revenue_growth} />
            <MetricBadge label="ROE" value={km.roe} />
            <MetricBadge label="PBR" value={km.pbr} />
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
        <button onClick={() => onAnalyze(c.code + " " + c.name)}
          style={{ background: "rgba(77,184,255,0.08)", border: "1px solid rgba(77,184,255,0.3)", borderRadius: 9, padding: 11, color: "#4db8ff", fontSize: 14, fontWeight: 700, cursor: "pointer", ...F }}>
          🔬 この銘柄を詳細分析（最新データ取得）
        </button>
      </div>
    </div>
  );
}

function AnalysisResult({ result, sd }) {
  const vc = verdictCfg[result.verdict] || verdictCfg["経過観察"];
  const total = scoreAvg(result.scores);
  const sc = result.scores || {};
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "#161b22", border: "1px solid " + vc.color + "50", borderRadius: 14, padding: 22, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "inline-block", background: vc.bg, border: "1px solid " + vc.color + "60", borderRadius: 7, padding: "5px 14px", color: vc.color, fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{vc.label}</div>
          <div style={{ fontSize: 14, color: "#c9d1d9", lineHeight: 1.75 }}>{result.summary}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 78, height: 78, borderRadius: "50%", border: "3px solid " + vc.color, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: vc.bg }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: vc.color }}>{total}</span>
            <span style={{ fontSize: 9, color: "#8b949e" }}>/ 10</span>
          </div>
          <div style={{ fontSize: 10, color: "#8b949e", marginTop: 4 }}>総合スコア</div>
        </div>
      </div>
      {sd && sd.sufficiency === 0 && sd.debug && (
        <div style={{ background: "rgba(255,209,102,0.06)", border: "1px solid rgba(255,209,102,0.3)", borderRadius: 11, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#ffd166", marginBottom: 8 }}>🔧 デバッグ情報（開発者用）</div>
          <pre style={{ fontSize: 10, color: "#c9d1d9", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.5, maxHeight: 200, overflow: "auto" }}>
            {JSON.stringify(sd.debug, null, 2)}
          </pre>
        </div>
      )}
      {sd && (
        <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 14, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#8b949e" }}>📊 確定データ（J-Quants取得・コード計算済）</span>
            <span style={{ fontSize: 10, color: "#6e7681" }}>{sd.fetchedAt}</span>
          </div>
          <SuffBar pct={sd.sufficiency} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <DataChip label="株価" value={sd.stockPrice ? "¥" + sd.stockPrice.toLocaleString() : null} />
            <DataChip label="売上高" value={fmtM(sd.netSales)} />
            <DataChip label="営業利益" value={fmtM(sd.opProfit)} />
            <DataChip label="純利益" value={fmtM(sd.netProfit)} />
            <DataChip label="EPS" value={sd.eps != null ? sd.eps + "円" : null} />
            <DataChip label="BPS" value={sd.bps != null ? sd.bps + "円" : null} />
            <DataChip label="自己資本比率" value={sd.equityRatio != null ? sd.equityRatio + "%" : null} />
            <DataChip label="会社予想EPS" value={sd.fcastEps != null ? sd.fcastEps + "円" : null} />
            <DataChip label="PER" value={sd.per != null ? sd.per + "倍" : null} calc />
            <DataChip label="PBR" value={sd.pbr != null ? sd.pbr + "倍" : null} calc />
            <DataChip label="ROE" value={sd.roe != null ? sd.roe + "%" : null} calc />
          </div>
          {sd.failed?.length > 0 && <div style={{ fontSize: 10, color: "#6e7681", marginTop: 8 }}>取得不可: {sd.failed.join("、")}</div>}
        </div>
      )}
      <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 14, padding: 22 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#8b949e", marginBottom: 16, letterSpacing: "0.1em" }}>片山流 7基準スコア</div>
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
          {(result.strengths || []).map((s, i, a) => (
            <div key={i} style={{ fontSize: 13, color: "#c9d1d9", lineHeight: 1.65, padding: "5px 0", borderBottom: i < a.length - 1 ? "1px solid #21262d" : "none" }}>・{s}</div>
          ))}
        </div>
        <div style={{ background: "#161b22", border: "1px solid rgba(255,107,107,0.22)", borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#ff6b6b", marginBottom: 11 }}>⚠️ リスク</div>
          {(result.risks || []).map((r, i, a) => (
            <div key={i} style={{ fontSize: 13, color: "#c9d1d9", lineHeight: 1.65, padding: "5px 0", borderBottom: i < a.length - 1 ? "1px solid #21262d" : "none" }}>・{r}</div>
          ))}
        </div>
      </div>
      {result.data_sources?.length > 0 && (
        <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 11, padding: 14 }}>
          <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 8, fontWeight: 700 }}>📄 参照データソース</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {result.data_sources.map((s, i) => (
              <span key={i} style={{ fontSize: 11, color: "#4db8ff", background: "rgba(77,184,255,0.08)", border: "1px solid rgba(77,184,255,0.2)", borderRadius: 5, padding: "3px 8px" }}>{s}</span>
            ))}
          </div>
        </div>
      )}
      <div style={{ background: "linear-gradient(135deg,#161b22,#1c2128)", border: "1px solid #4db8ff35", borderRadius: 14, padding: 22 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg,#4db8ff,#0070f3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 800, color: "white", flexShrink: 0 }}>五</div>
          <div>
            <div style={{ fontSize: 11, color: "#4db8ff", marginBottom: 6, fontWeight: 700, letterSpacing: "0.06em" }}>片山晃（五月さん）ならこう言う</div>
            <div style={{ fontSize: 15, color: "#f0f6fc", lineHeight: 1.8, fontStyle: "italic" }}>「{result.katayama_comment}」</div>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: "#6e7681", padding: "10px 15px", background: "#161b22", border: "1px solid #21262d", borderRadius: 9, lineHeight: 1.6 }}>
        ⚠️ IRバンク・四季報等の公開情報をもとにAIが分析。投資判断はご自身の責任で行ってください。
      </div>
    </div>
  );
}

async function jqVerify(apiKey) {
  const res = await fetch("/api/jquants", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "verify", apiKey }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "接続失敗");
  return true;
}

async function jqFetch(code, apiKey) {
  const res = await fetch("/api/jquants", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "fetch", code, apiKey }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "データ取得失敗");
  return data;
}

function fmtM(val) {
  if (val == null) return null;
  return val >= 1e9 ? (val / 1e9).toFixed(1) + "十億円"
    : val >= 1e6 ? (val / 1e6).toFixed(0) + "百万円"
    : val.toLocaleString() + "円";
}

function DataChip({ label, value, calc }) {
  const ok = value != null && value !== "" && value !== "-";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: ok ? "rgba(0,229,160,0.06)" : "rgba(107,114,128,0.08)", border: ok ? "1px solid rgba(0,229,160,0.2)" : "1px solid #30363d", borderRadius: 6, padding: "4px 9px" }}>
      <span style={{ fontSize: 9, color: ok ? (calc ? "#a78bfa" : "#00e5a0") : "#6e7681" }}>{ok ? (calc ? "⚙️" : "✅") : "－"}</span>
      <span style={{ fontSize: 10, color: "#8b949e" }}>{label}</span>
      <span style={{ fontSize: 12, color: ok ? "#f0f6fc" : "#4a5568", fontWeight: 700 }}>{ok ? value : "取得不可"}</span>
    </div>
  );
}

function SuffBar({ pct }) {
  const c = pct >= 80 ? "#00e5a0" : pct >= 50 ? "#ffd166" : "#ff6b6b";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <span style={{ fontSize: 11, color: "#8b949e", whiteSpace: "nowrap" }}>データ充足率</span>
      <div style={{ flex: 1, height: 6, background: "#21262d", borderRadius: 3 }}>
        <div style={{ width: pct + "%", height: "100%", background: c, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, color: c, fontWeight: 700 }}>{pct}%</span>
    </div>
  );
}

export default function Home() {
  const [mode, setMode]             = useState("hunt");
  const [ticker, setTicker]         = useState("");
  const [loading, setLoading]       = useState(false);
  const [statusMsg, setStatusMsg]   = useState("");
  const [huntResult, setHuntResult] = useState(null);
  const [analyzeResult, setAnalyzeResult] = useState(null);
  const [analyzeTicker, setAnalyzeTicker] = useState("");
  const [stockData, setStockData]   = useState(null);
  const [selTheme, setSelTheme]     = useState(null);
  const [error, setError]           = useState(null);
  const [jqApiKey, setJqApiKey]     = useState("");
  const [jqStatus, setJqStatus]     = useState("");
  const [jqErr, setJqErr]           = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [sResult,  setSResult]  = useState([]);
  const [sLoading, setSLoading] = useState(false);
  const [sStatus,  setSStatus]  = useState("");
  const [sError,   setSError]   = useState(null);
  const [sFilter,     setSFilter]    = useState("all");
  const [customInput, setCustomInput] = useState("");
  const [scanMode,    setScanMode]    = useState("watchlist");
  const inputRef = useRef(null);

  useEffect(() => { if (mode === "analyze") inputRef.current?.focus(); }, [mode]);

  async function connectJQ() {
    if (!jqApiKey) return;
    setJqStatus("connecting"); setJqErr("");
    try {
      await jqVerify(jqApiKey);
      setJqStatus("ok");
    } catch (e) {
      setJqStatus("error"); setJqErr(e.message);
    }
  }

  async function hunt(theme) {
    setSelTheme(theme); setLoading(true); setHuntResult(null); setError(null);
    setStatusMsg("最新データを取得中...");
    try {
      const res = await callAPI(HUNT_SYSTEM,
        `片山晃流で「${theme.label}」テーマの日本株テンバガー候補を3銘柄発掘してください。JSONのみ出力。`
      );
      if (!Array.isArray(res.candidates) || res.candidates.length === 0) throw new Error("候補データが取得できませんでした");
      setHuntResult(res);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); setStatusMsg(""); }
  }

  async function analyze(t) {
    const target = (t || ticker).trim();
    if (!target) return;
    setMode("analyze"); setAnalyzeTicker(target);
    setLoading(true); setAnalyzeResult(null); setStockData(null); setError(null);
    try {
      let sd = null;
      const codeMatch = target.match(/\b(\d{4}[A-Z]?)\b/);
      const code = codeMatch?.[1];
      if (code && jqApiKey && jqStatus === "ok") {
        setStatusMsg("📡 J-Quantsから財務データを取得中...");
        try { sd = await jqFetch(code, jqApiKey); } catch (_) {}
      }
      setStockData(sd);
      const dataBlock = sd ? `
【確定データ（J-Quants取得・計算済み・推測禁止）】
株価：${sd.stockPrice ? "¥" + sd.stockPrice.toLocaleString() : "取得不可"}（${sd.fetchedAt || ""}）
売上高：${fmtM(sd.netSales) || "取得不可"}
営業利益：${fmtM(sd.opProfit) || "取得不可"}
純利益：${fmtM(sd.netProfit) || "取得不可"}
EPS：${sd.eps != null ? sd.eps + "円" : "取得不可"}
BPS：${sd.bps != null ? sd.bps + "円" : "取得不可"}
自己資本比率：${sd.equityRatio != null ? sd.equityRatio + "%" : "取得不可"}
会社予想EPS：${sd.fcastEps != null ? sd.fcastEps + "円" : "取得不可"}
PER：${sd.per != null ? sd.per + "倍（計算済）" : "取得不可"}
PBR：${sd.pbr != null ? sd.pbr + "倍（計算済）" : "取得不可"}
ROE：${sd.roe != null ? sd.roe + "%（計算済）" : "取得不可"}
データ充足率：${sd.sufficiency}%
※上記の数値はそのまま使用すること。推測・上書き・レンジ表記禁止。不明は「-」と記載。
` : "【データ未取得】数値はすべて「-」と表示し、定性評価のみ実施してください。";
      setStatusMsg("🧠 片山流7基準で定性分析中...");
      const res = await callAPI(ANALYZE_SYSTEM,
        `日本株「${target}」を以下の確定データをもとに分析してください。\n\n${dataBlock}\n\nJSONのみ出力。`
      );
      setAnalyzeResult(res);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); setStatusMsg(""); }
  }

  async function scanSSignal(targetCodes) {
    setSLoading(true);
    setSResult([]);
    setSError(null);
    const codesToScan = targetCodes || S_WATCHLIST;
    const CHUNK = 10;
    const all = [];
    try {
      for (let i = 0; i < codesToScan.length; i += CHUNK) {
        const chunk = codesToScan.slice(i, i + CHUNK);
        setSStatus(`スキャン中... (${Math.min(i + CHUNK, codesToScan.length)}/${codesToScan.length})`);
        try {
          const res = await fetch("/api/ssignal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ codes: chunk }),
          });
          if (res.ok) {
            const data = await res.json();
            all.push(...(data.results || []));
          }
        } catch (_) {}
      }
      all.sort((a, b) => b.s_count - a.s_count);
      setSResult(all);
      if (all.length === 0) {
        setSStatus("Sシグナル点灯銘柄なし（条件を満たす銘柄が現時点でゼロ）");
      } else {
        setSStatus(`完了！ ${all.length}銘柄でSシグナル検出`);
      }
    } catch (e) {
      setSError(e.message);
    } finally {
      setSLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>片山晃流 AIスクリーニングエージェント</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div style={{ minHeight: "100vh", background: "#0a0c10", color: "#e8eaf0", ...F }}>
        <div style={{ background: "#161b22", borderBottom: "1px solid #21262d", padding: "16px 32px", position: "sticky", top: 0, zIndex: 10 }}>
          <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: "linear-gradient(135deg,#00e5a0,#4db8ff)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 800, color: "#0a0c10" }}>五</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#f0f6fc" }}>片山晃流 AIスクリーニングエージェント</div>
                <div style={{ fontSize: 11, color: "#8b949e" }}>J-Quants確定データ＋AI定性分析で追跡候補を発掘</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{
                fontSize: 11, padding: "4px 10px", borderRadius: 7, fontWeight: 600,
                background: jqStatus === "ok" ? "rgba(0,229,160,0.08)" : "rgba(255,209,102,0.08)",
                border: jqStatus === "ok" ? "1px solid rgba(0,229,160,0.3)" : "1px solid rgba(255,209,102,0.3)",
                color: jqStatus === "ok" ? "#00e5a0" : "#ffd166",
              }}>
                {jqStatus === "ok" ? "✅ J-Quants接続済" : "⚠️ J-Quants未接続"}
              </div>
              <button onClick={() => setShowSettings(v => !v)} style={{ background: "#21262d", border: "1px solid #30363d", borderRadius: 7, padding: "5px 12px", color: "#8b949e", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                ⚙️ 設定
              </button>
            </div>
          </div>
          {showSettings && (
            <div style={{ maxWidth: 960, margin: "12px auto 0", background: "#0d1117", border: "1px solid #30363d", borderRadius: 10, padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f0f6fc", marginBottom: 14 }}>
                🔑 J-Quants APIキー設定
                <span style={{ fontSize: 11, color: "#8b949e", fontWeight: 400, marginLeft: 10 }}>
                  <a href="https://jpx-jquants.com/" target="_blank" rel="noreferrer" style={{ color: "#4db8ff" }}>jpx-jquants.com</a> → ログイン → API Keys
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "flex-end" }}>
                <div>
                  <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 5 }}>APIキー</div>
                  <input type="password" value={jqApiKey} onChange={e => setJqApiKey(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && connectJQ()}
                    placeholder="APIキーを貼り付け"
                    style={{ width: "100%", background: "#161b22", border: "1px solid #30363d", borderRadius: 7, padding: "9px 12px", color: "#f0f6fc", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
                </div>
                <button onClick={connectJQ} disabled={jqStatus === "connecting" || !jqApiKey}
                  style={{ background: jqStatus === "connecting" ? "#21262d" : "linear-gradient(135deg,#00e5a0,#00b87a)", border: "none", borderRadius: 7, padding: "9px 20px", color: jqStatus === "connecting" ? "#8b949e" : "#0a0c10", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>
                  {jqStatus === "connecting" ? "確認中..." : "接続する"}
                </button>
              </div>
              {jqStatus === "ok" && <div style={{ fontSize: 11, color: "#00e5a0", marginTop: 8 }}>✅ 接続成功！</div>}
              {jqStatus === "error" && <div style={{ fontSize: 11, color: "#ff6b6b", marginTop: 8 }}>❌ {jqErr}</div>}
            </div>
          )}
        </div>

        <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 28, background: "#161b22", borderRadius: 12, padding: 5, border: "1px solid #30363d" }}>
            {[["hunt", "🔍 銘柄を発掘する"], ["analyze", "🔬 銘柄を分析する"], ["ssignal", "🔎 Sシグナル発掘"]].map(([id, label]) => (
              <button key={id} onClick={() => { setMode(id); setError(null); }} style={{
                flex: 1, padding: "13px 10px", borderRadius: 9,
                border: mode === id ? "1px solid #4db8ff40" : "1px solid transparent",
                background: mode === id ? "linear-gradient(135deg,rgba(0,229,160,0.1),rgba(77,184,255,0.1))" : "transparent",
                color: mode === id ? "#f0f6fc" : "#8b949e", fontWeight: mode === id ? 700 : 400,
                cursor: "pointer", fontSize: 14, transition: "all 0.2s", ...F,
              }}>{label}</button>
            ))}
          </div>

          {/* HUNT */}
          {mode === "hunt" && (
            <div>
              <div style={{ fontSize: 14, color: "#8b949e", marginBottom: 18 }}>テーマを選ぶと、IRバンク・四季報等から最新データを取得してテンバガー候補を3銘柄発掘します</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 11, marginBottom: 28 }}>
                {HUNT_THEMES.map(th => (
                  <button key={th.id} onClick={() => hunt(th)} disabled={loading} style={{
                    background: selTheme?.id === th.id ? "rgba(0,229,160,0.09)" : "#161b22",
                    border: selTheme?.id === th.id ? "1px solid rgba(0,229,160,0.5)" : "1px solid #30363d",
                    borderRadius: 11, padding: "16px 14px", color: "#c9d1d9", fontSize: 13, fontWeight: 600,
                    cursor: loading ? "not-allowed" : "pointer", textAlign: "left", ...F,
                    display: "flex", alignItems: "center", gap: 10, transition: "all 0.2s", opacity: loading ? 0.5 : 1,
                  }}>
                    <span style={{ fontSize: 22 }}>{th.emoji}</span><span>{th.label}</span>
                  </button>
                ))}
              </div>
              {loading && (
                <div style={{ textAlign: "center", padding: "56px 0", color: "#8b949e" }}>
                  <div style={{ fontSize: 42, marginBottom: 14 }}>🔍</div>
                  <div style={{ fontSize: 15, marginBottom: 6 }}>「<span style={{ color: "#00e5a0" }}>{selTheme?.label}</span>」のテンバガー候補を発掘中...</div>
                  <div style={{ fontSize: 13, color: "#4db8ff", minHeight: 20 }}>{statusMsg}</div>
                  <Dots color="#00e5a0" />
                </div>
              )}
              {error && !loading && (
                <div style={{ background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 11, padding: 18 }}>
                  <div style={{ color: "#ff6b6b", fontWeight: 700, marginBottom: 6 }}>⚠️ エラー</div>
                  <div style={{ color: "#ff9999", fontSize: 13 }}>{error}</div>
                </div>
              )}
              {huntResult && !loading && (
                <div>
                  <div style={{ background: "linear-gradient(135deg,#161b22,#1c2128)", border: "1px solid #4db8ff35", borderRadius: 14, padding: 20, marginBottom: 22, display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, background: "linear-gradient(135deg,#4db8ff,#0070f3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: "white" }}>五</div>
                    <div>
                      <div style={{ fontSize: 11, color: "#4db8ff", marginBottom: 5, fontWeight: 700 }}>片山晃（五月さん）のテーマ評価</div>
                      <div style={{ fontSize: 14, color: "#f0f6fc", lineHeight: 1.8, fontStyle: "italic" }}>「{huntResult.theme_comment}」</div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                    {huntResult.candidates.map((c, i) => (
                      <CandidateCard key={i} c={c} rank={i} onAnalyze={analyze} />
                    ))}
                  </div>
                </div>
              )}
              {!huntResult && !loading && !error && (
                <div style={{ textAlign: "center", padding: "48px", color: "#6e7681", fontSize: 14 }}>👆 テーマを選択してください</div>
              )}
            </div>
          )}

          {/* ANALYZE */}
          {mode === "analyze" && (
            <div>
              <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 14, padding: 22, marginBottom: 22 }}>
                <div style={{ fontSize: 13, color: "#8b949e", marginBottom: 9 }}>銘柄コード または 企業名</div>
                <div style={{ display: "flex", gap: 10 }}>
                  <input ref={inputRef} value={ticker} onChange={e => setTicker(e.target.value)} onKeyDown={e => e.key === "Enter" && !loading && analyze()}
                    placeholder="例：5803 / 藤倉コンポジット / 川崎重工"
                    style={{ flex: 1, background: "#0d1117", border: "1px solid #30363d", borderRadius: 9, padding: "13px 16px", color: "#f0f6fc", fontSize: 15, outline: "none", ...F }} />
                  <button onClick={() => analyze()} disabled={loading || !ticker.trim()} style={{
                    background: loading ? "#21262d" : "linear-gradient(135deg,#00e5a0,#00b87a)", border: "none", borderRadius: 9,
                    padding: "13px 22px", color: loading ? "#8b949e" : "#0a0c10", fontSize: 14, fontWeight: 700,
                    cursor: loading ? "not-allowed" : "pointer", whiteSpace: "nowrap", ...F,
                  }}>{loading ? "取得・分析中..." : "最新データで分析"}</button>
                </div>
              </div>
              {loading && (
                <div style={{ textAlign: "center", padding: "56px 0", color: "#8b949e" }}>
                  <div style={{ fontSize: 42, marginBottom: 14 }}>🔬</div>
                  <div style={{ fontSize: 15, marginBottom: 6 }}>「<span style={{ color: "#4db8ff" }}>{analyzeTicker}</span>」を分析中...</div>
                  <div style={{ fontSize: 13, color: "#4db8ff", minHeight: 20 }}>{statusMsg}</div>
                  <Dots color="#4db8ff" />
                </div>
              )}
              {error && !loading && (
                <div style={{ background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 11, padding: 18 }}>
                  <div style={{ color: "#ff6b6b", fontWeight: 700 }}>⚠️ エラー</div>
                  <div style={{ color: "#ff9999", fontSize: 13 }}>{error}</div>
                </div>
              )}
              {analyzeResult && !loading && <AnalysisResult result={analyzeResult} sd={stockData} />}
              {!analyzeResult && !loading && !error && (
                <div style={{ textAlign: "center", padding: "48px", color: "#6e7681", fontSize: 14 }}>
                  👆 銘柄を入力して最新データで分析
                </div>
              )}
            </div>
          )}

          {/* Sシグナル発掘 */}
          {mode === "ssignal" && (
            <div>
              {/* モード切り替え */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16, background: "#161b22", borderRadius: 10, padding: 4, border: "1px solid #30363d" }}>
                {[["watchlist", `📋 ウォッチリスト（${S_WATCHLIST.length}銘柄）`], ["custom", "✏️ カスタム銘柄コードをスキャン"]].map(([m, label]) => (
                  <button key={m} onClick={() => setScanMode(m)}
                    style={{ flex: 1, padding: "10px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: scanMode===m?700:400,
                      background: scanMode===m ? "linear-gradient(135deg,rgba(0,229,160,0.1),rgba(77,184,255,0.1))" : "transparent",
                      border: scanMode===m ? "1px solid #4db8ff40" : "1px solid transparent",
                      color: scanMode===m ? "#f0f6fc" : "#8b949e" }}>
                    {label}
                  </button>
                ))}
              </div>

              {/* カスタム入力エリア */}
              {scanMode === "custom" && (
                <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 12, padding: 18, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: "#8b949e", marginBottom: 8 }}>
                    銘柄コードをスペース・カンマ・改行で区切って入力（例：7012 4449 6384 7013）
                  </div>
                  <textarea
                    value={customInput}
                    onChange={e => setCustomInput(e.target.value)}
                    placeholder={"6981 8035 6857 7012 4449 6384\n7013 6809 5803 6769 6723 6125\n投資の森などで気になった銘柄コードをここに貼り付け"}
                    style={{ width: "100%", minHeight: 100, background: "#0d1117", border: "1px solid #30363d", borderRadius: 8,
                      padding: "10px 12px", color: "#f0f6fc", fontSize: 13, outline: "none", fontFamily: "monospace", resize: "vertical", boxSizing: "border-box" }}
                  />
                  <div style={{ fontSize: 11, color: "#6e7681", marginTop: 6 }}>
                    💡 投資の森でテーマを選択 → 銘柄コード一覧をコピー → ここに貼り付けてスキャン
                  </div>
                </div>
              )}

              <div style={{ fontSize: 13, color: "#8b949e", marginBottom: 12 }}>
                <span style={{ color: "#00e5a0", fontWeight: 700 }}>OBV先行上昇×株価横ばい×RSI適正帯</span>
                などのパターンを自動抽出します
              </div>

              {/* フィルター */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {[["all","🔍 全件"],["S","💎 仕込みS"],["DIV","📡 OBVダイバージェンス"],["VOL","🔥 出来高急増"],["MA","📐 MA収束"],["RSI","🔄 RSI反転"]].map(([f, label]) => (
                  <button key={f} onClick={() => setSFilter(f)}
                    style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                      background: sFilter === f ? "rgba(0,229,160,0.1)" : "#161b22",
                      border: sFilter === f ? "1px solid rgba(0,229,160,0.5)" : "1px solid #30363d",
                      color: sFilter === f ? "#00e5a0" : "#8b949e" }}>
                    {label}
                  </button>
                ))}
              </div>

              {/* スキャンボタン */}
              <button onClick={() => {
                  if (scanMode === "custom") {
                    const codes = customInput.split(/[\s,\n]+/).map(s=>s.trim()).filter(s=>/^\d{4}$/.test(s));
                    if (codes.length === 0) { setSError("有効な4桁の銘柄コードを入力してください"); return; }
                    scanSSignal(codes);
                  } else {
                    scanSSignal(S_WATCHLIST);
                  }
                }} disabled={sLoading}
                style={{ width: "100%", background: sLoading ? "#21262d" : "linear-gradient(135deg,#00e5a0,#00b87a)",
                  border: "none", borderRadius: 11, padding: "16px", color: sLoading ? "#8b949e" : "#0a0c10",
                  fontSize: 15, fontWeight: 700, cursor: sLoading ? "not-allowed" : "pointer", marginBottom: 20, fontFamily: "inherit" }}>
                {sLoading ? `🔄 ${sStatus}` : scanMode === "custom" ? `🔎 カスタム銘柄をスキャン` : `🔎 ウォッチリストをスキャン（${S_WATCHLIST.length}銘柄）`}
              </button>

              {sLoading && (
                <div style={{ background: "#161b22", border: "1px solid rgba(0,229,160,0.3)", borderRadius: 14, padding: 28, textAlign: "center", marginBottom: 16 }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>🔎</div>
                  <div style={{ fontSize: 15, color: "#f0f6fc", fontWeight: 700, marginBottom: 8 }}>Sシグナルスキャン中...</div>
                  <div style={{ fontSize: 13, color: "#00e5a0", marginBottom: 16, minHeight: 20 }}>{sStatus}</div>
                  <div style={{ background: "#21262d", borderRadius: 6, height: 8, overflow: "hidden", marginBottom: 16 }}>
                    <div style={{ height: "100%", background: "linear-gradient(90deg,#00e5a0,#4db8ff,#00e5a0)", backgroundSize: "200% 100%", borderRadius: 6, width: "60%" }} />
                  </div>
                  <Dots color="#00e5a0" />
                  <div style={{ fontSize: 11, color: "#6e7681", marginTop: 12 }}>Yahoo Financeからデータ取得中。そのままお待ちください。</div>
                </div>
              )}

              {sError && (
                <div style={{ background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 11, padding: 18, color: "#ff6b6b" }}>
                  ⚠️ {sError}
                </div>
              )}

              {sResult.length > 0 && !sLoading && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 13, color: "#00e5a0", fontWeight: 700, marginBottom: 4 }}>
                    ✅ {sResult.length}銘柄検出 — S点灯数順
                  </div>
                  {sResult
                    .filter(r => {
                      if (sFilter === "all") return true;
                      return (r.patterns || []).some(p => p.key === sFilter);
                    })
                    .map(r => (
                      <div key={r.code} style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 12, padding: "16px 20px" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div>
                              <div style={{ fontSize: 18, fontWeight: 800, color: "#f0f6fc" }}>{r.code}</div>
                              <div style={{ fontSize: 10, color: "#8b949e", marginTop: 2 }}>{r.name}</div>
                            </div>
                            <div style={{ textAlign: "center", background: "rgba(0,229,160,0.08)", border: "1px solid rgba(0,229,160,0.3)", borderRadius: 8, padding: "4px 10px" }}>
                              <div style={{ fontSize: 16, fontWeight: 800, color: "#00e5a0" }}>{r.score}</div>
                              <div style={{ fontSize: 9, color: "#8b949e" }}>score</div>
                            </div>
                          </div>
                          <button onClick={() => { setTicker(r.code + " " + r.name); analyze(r.code + " " + r.name); }}
                            style={{ background: "rgba(77,184,255,0.08)", border: "1px solid rgba(77,184,255,0.3)", borderRadius: 8,
                              padding: "9px 14px", color: "#4db8ff", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>
                            🔬 詳細分析
                          </button>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                          {(r.patterns || []).map(p => (
                            <span key={p.key} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, fontWeight: 700,
                              background: "rgba(0,229,160,0.08)", border: "1px solid rgba(0,229,160,0.35)", color: "#00e5a0" }}>
                              {p.emoji} {p.label}
                            </span>
                          ))}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 5, border: "1px solid #30363d",
                            color: r.rsi <= 45 ? "#00e5a0" : r.rsi <= 63 ? "#ffd166" : "#ff6b6b",
                            background: r.rsi <= 45 ? "rgba(0,229,160,0.06)" : "rgba(255,209,102,0.06)" }}>
                            RSI {r.rsi}
                          </span>
                          {r.s_count > 0 && (
                            <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 5, background: "rgba(77,184,255,0.08)", border: "1px solid rgba(77,184,255,0.2)", color: "#4db8ff" }}>
                              S×{r.s_count}
                            </span>
                          )}
                          <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 5, background: "rgba(107,114,128,0.08)", border: "1px solid #30363d", color: "#8b949e" }}>
                            ¥{r.close?.toLocaleString()}
                          </span>
                          {(r.patterns||[]).map(p => (
                            <span key={"d"+p.key} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 5, background: "rgba(107,114,128,0.06)", border: "1px solid #30363d", color: "#6e7681" }}>
                              {p.detail}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {!sLoading && sResult.length === 0 && !sError && sStatus === "" && (
                <div style={{ textAlign: "center", padding: "48px", color: "#6e7681", fontSize: 14 }}>
                  👆 スキャン開始ボタンを押してください<br />
                  <span style={{ fontSize: 12 }}>{scanMode === "custom" ? "銘柄コードを入力してスキャン" : `${S_WATCHLIST.length}銘柄をスキャンします（約30〜60秒）`}</span>
                </div>
              )}
              {!sLoading && sResult.length === 0 && !sError && sStatus !== "" && (
                <div style={{ background: "rgba(255,209,102,0.06)", border: "1px solid rgba(255,209,102,0.3)", borderRadius: 14, padding: 28, textAlign: "center" }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
                  <div style={{ fontSize: 14, color: "#ffd166", fontWeight: 700, marginBottom: 8 }}>現時点でSシグナル点灯銘柄はゼロでした</div>
                  <div style={{ fontSize: 12, color: "#8b949e", lineHeight: 1.7 }}>
                    スキャン対象銘柄のうち、現在の条件（OBV上昇×株価横ばい×RSI45〜63）を<br />
                    満たす銘柄が見つかりませんでした。<br /><br />
                    <span style={{ color: "#ffd166" }}>翌日以降に再スキャンすると変化することがあります。</span>
                  </div>
                  <div style={{ marginTop: 16, fontSize: 11, color: "#6e7681" }}>{sStatus}</div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  );
}
