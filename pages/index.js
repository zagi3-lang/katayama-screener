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

// フロントエンドは自分のAPIルートを叩く（APIキーは露出しない）
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

function AnalysisResult({ result, ticker }) {
  const vc = verdictCfg[result.verdict] || verdictCfg["経過観察"];
  const total = scoreAvg(result.scores);
  const sc = result.scores || {};
  const km = result.key_metrics || {};
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "#161b22", border: "1px solid " + vc.color + "50", borderRadius: 14, padding: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 18 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#f0f6fc", marginBottom: 9 }}>{ticker}</div>
          <div style={{ display: "inline-block", background: vc.bg, border: "1px solid " + vc.color + "60", borderRadius: 7, padding: "5px 14px", color: vc.color, fontWeight: 700, fontSize: 15, marginBottom: 11 }}>{vc.label}</div>
          <div style={{ fontSize: 14, color: "#c9d1d9", lineHeight: 1.75, marginBottom: 12 }}>{result.summary}</div>
          {Object.keys(km).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              <MetricBadge label="売上成長" value={km.revenue_growth} />
              <MetricBadge label="ROE" value={km.roe} />
              <MetricBadge label="PBR" value={km.pbr} />
              <MetricBadge label="PER" value={km.per} />
              <MetricBadge label="自己資本比率" value={km.equity_ratio} />
            </div>
          )}
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 82, height: 82, borderRadius: "50%", border: "3px solid " + vc.color, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: vc.bg }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: vc.color }}>{total}</span>
            <span style={{ fontSize: 10, color: "#8b949e" }}>/ 10</span>
          </div>
          <div style={{ fontSize: 11, color: "#8b949e", marginTop: 5 }}>総合スコア</div>
        </div>
      </div>
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
  const inputRef = useRef(null);

  useEffect(() => { if (mode === "analyze") inputRef.current?.focus(); }, [mode]);

  async function hunt(theme) {
    setSelTheme(theme);
    setLoading(true);
    setHuntResult(null);
    setError(null);
    setStatusMsg("IRバンク・四季報等から最新データを取得中...");
    try {
      const res = await callAPI(
        HUNT_SYSTEM,
        `片山晃流で「${theme.label}」テーマの日本株テンバガー候補を3銘柄、最新データを検索して発掘してください。JSONのみ出力。`
      );
      if (!Array.isArray(res.candidates) || res.candidates.length === 0) throw new Error("候補データが取得できませんでした");
      setHuntResult(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setStatusMsg("");
    }
  }

  async function analyze(t) {
    const target = (t || ticker).trim();
    if (!target) return;
    setMode("analyze");
    setAnalyzeTicker(target);
    setLoading(true);
    setAnalyzeResult(null);
    setError(null);
    setStatusMsg("IRバンク・四季報等から最新財務データを検索中...");
    try {
      const res = await callAPI(
        ANALYZE_SYSTEM,
        `日本株「${target}」について、IRバンク・四季報・Yahoo!ファイナンス等から最新データを検索し、片山晃流7基準で徹底分析してください。JSONのみ出力。`
      );
      setAnalyzeResult(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setStatusMsg("");
    }
  }

  return (
    <>
      <Head>
        <title>片山晃流 AIスクリーニングエージェント</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div style={{ minHeight: "100vh", background: "#0a0c10", color: "#e8eaf0", ...F }}>
        {/* Header */}
        <div style={{ background: "#161b22", borderBottom: "1px solid #21262d", padding: "20px 32px", position: "sticky", top: 0, zIndex: 10 }}>
          <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: "linear-gradient(135deg,#00e5a0,#4db8ff)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: "#0a0c10" }}>五</div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#f0f6fc" }}>片山晃流 AIスクリーニングエージェント</div>
              <div style={{ fontSize: 12, color: "#8b949e" }}>IRバンク・四季報等から最新財務データを取得してテンバガー候補を分析</div>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 28, background: "#161b22", borderRadius: 12, padding: 5, border: "1px solid #30363d" }}>
            {[["hunt", "🔍 銘柄を発掘する"], ["analyze", "🔬 銘柄を分析する"]].map(([id, label]) => (
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
                  <div style={{ fontSize: 11, color: "#6e7681", marginTop: 16 }}>※Web検索を複数回行うため30〜60秒かかります</div>
                </div>
              )}

              {error && !loading && (
                <div style={{ background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 11, padding: 18 }}>
                  <div style={{ color: "#ff6b6b", fontWeight: 700, marginBottom: 6 }}>⚠️ エラー</div>
                  <div style={{ color: "#ff9999", fontSize: 13 }}>{error}</div>
                  <div style={{ fontSize: 12, color: "#8b949e", marginTop: 8 }}>もう一度テーマを選んでください。</div>
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
                  <div style={{ fontSize: 11, color: "#6e7681", marginTop: 16, padding: "10px 15px", background: "#161b22", border: "1px solid #21262d", borderRadius: 9 }}>
                    ⚠️ IRバンク・四季報等の公開情報をもとにAIが分析。投資判断はご自身の責任で。
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
                <div style={{ fontSize: 13, color: "#8b949e", marginBottom: 9 }}>銘柄コード または 企業名（IRバンク・四季報等から最新データを取得して分析）</div>
                <div style={{ display: "flex", gap: 10 }}>
                  <input ref={inputRef} value={ticker} onChange={e => setTicker(e.target.value)} onKeyDown={e => e.key === "Enter" && !loading && analyze()}
                    placeholder="例：5803 / 藤倉コンポジット / 川崎重工 / スカパーJSAT"
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
                  <div style={{ fontSize: 15, marginBottom: 6 }}>「<span style={{ color: "#4db8ff" }}>{analyzeTicker}</span>」の最新データを取得・分析中...</div>
                  <div style={{ fontSize: 13, color: "#4db8ff", minHeight: 20 }}>{statusMsg}</div>
                  <Dots color="#4db8ff" />
                  <div style={{ fontSize: 11, color: "#6e7681", marginTop: 16 }}>※Web検索を複数回行うため30〜60秒かかります</div>
                </div>
              )}

              {error && !loading && (
                <div style={{ background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 11, padding: 18 }}>
                  <div style={{ color: "#ff6b6b", fontWeight: 700, marginBottom: 6 }}>⚠️ エラー</div>
                  <div style={{ color: "#ff9999", fontSize: 13 }}>{error}</div>
                </div>
              )}

              {analyzeResult && !loading && <AnalysisResult result={analyzeResult} ticker={analyzeTicker} />}

              {!analyzeResult && !loading && !error && (
                <div style={{ textAlign: "center", padding: "48px", color: "#6e7681", fontSize: 14 }}>
                  👆 銘柄を入力して最新データで分析<br />
                  <span style={{ fontSize: 13 }}>発掘モードの「詳細分析」ボタンからも使えます</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
