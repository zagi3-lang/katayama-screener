// pages/jquants-test.js
// ← このファイルを pages/ フォルダに置く（publicではなく）
import { useState } from "react";

const F = { fontFamily: "'Hiragino Kaku Gothic ProN','Noto Sans JP','Yu Gothic',sans-serif" };

export default function JQuantsTest() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  async function runTest() {
    if (!token.trim()) return;
    setLoading(true); setResult(null);
    try {
      const res = await fetch("/api/jquants-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: token.trim() }),
      });
      const data = await res.json();
      setResult(data);
    } catch(e) {
      setResult({ ok: false, error: e.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0c10", color: "#e8eaf0", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...F }}>
      <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 14, padding: 28, width: "100%", maxWidth: 600 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg,#00e5a0,#4db8ff)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#0a0c10", fontSize: 18 }}>五</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#f0f6fc" }}>J-Quants 接続テスト</div>
            <div style={{ fontSize: 12, color: "#8b949e" }}>Sシグナル全銘柄スキャン実装前の動作確認</div>
          </div>
        </div>

        {/* Input */}
        <div style={{ fontSize: 12, color: "#8b949e", marginBottom: 6 }}>
          リフレッシュトークン（<a href="https://jpx-jquants.com/" target="_blank" rel="noreferrer" style={{ color: "#4db8ff" }}>jpx-jquants.com</a> → APIキーメニュー）
        </div>
        <input
          type="password"
          value={token}
          onChange={e => setToken(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !loading && runTest()}
          placeholder="リフレッシュトークンを貼り付け"
          style={{ width: "100%", background: "#0d1117", border: "1px solid #30363d", borderRadius: 8, padding: "12px 14px", color: "#f0f6fc", fontSize: 14, outline: "none", marginBottom: 12, fontFamily: "monospace", boxSizing: "border-box" }}
        />
        <button onClick={runTest} disabled={loading || !token.trim()}
          style={{ width: "100%", background: loading ? "#21262d" : "linear-gradient(135deg,#00e5a0,#00b87a)", border: "none", borderRadius: 9, padding: 14, color: loading ? "#8b949e" : "#0a0c10", fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", ...F }}>
          {loading ? "🔄 テスト中..." : "🔬 接続テスト開始"}
        </button>

        {/* Result */}
        {result && (
          <div style={{ marginTop: 20 }}>
            {!result.ok ? (
              <div style={{ background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 10, padding: 16, color: "#ff6b6b", fontSize: 13 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>❌ {result.step || "エラー"}</div>
                <div>{result.error}</div>
                {result.hint && <div style={{ fontSize: 11, color: "#8b949e", marginTop: 8 }}>💡 {result.hint}</div>}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {/* Steps */}
                <div style={{ background: "#0d1117", borderRadius: 10, padding: 14 }}>
                  {[["Step 1 IDトークン", result.steps?.step1],
                    ["Step 2 銘柄一覧", result.steps?.step2],
                    ["Step 3 日次データ", result.steps?.step3],
                    ["Step 4 OBV計算", result.steps?.step4]
                  ].map(([label, val]) => (
                    <div key={label} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid #21262d" }}>
                      <div style={{ fontSize: 12, color: "#8b949e", minWidth: 150 }}>{label}</div>
                      <div style={{ fontSize: 12, color: "#00e5a0" }}>{val}</div>
                    </div>
                  ))}
                </div>

                {/* Summary */}
                <div style={{ background: "#0d1117", borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#00e5a0", marginBottom: 10 }}>📊 テスト結果サマリー</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid #21262d" }}>
                    <span>上場銘柄数</span><span style={{ color: "#4db8ff", fontWeight: 700 }}>{result.summary?.totalListedStocks?.toLocaleString()}銘柄</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid #21262d" }}>
                    <span>OBV/RSI計算</span><span style={{ color: "#00e5a0", fontWeight: 700 }}>{result.summary?.obvFeasible ? "✅ 実装可能" : "⚠️ 要確認"}</span>
                  </div>
                  {(result.summary?.testCodesResult || []).filter(c => c.ok && c.latest).map(c => (
                    <div key={c.code} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid #21262d" }}>
                      <span>{c.code} 最新終値</span>
                      <span style={{ color: "#4db8ff", fontWeight: 700 }}>¥{c.latest.close?.toLocaleString()} ({c.latest.date})</span>
                    </div>
                  ))}
                </div>

                {/* 成功メッセージ */}
                <div style={{ background: "rgba(0,229,160,0.06)", border: "1px solid rgba(0,229,160,0.3)", borderRadius: 10, padding: 16, fontSize: 13, color: "#00e5a0", lineHeight: 1.7 }}>
                  ✅ {result.message}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
