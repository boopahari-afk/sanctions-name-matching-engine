import { useState, useEffect, useRef } from "react";

// ── Fuzzy matching utilities ──────────────────────────────────────────────────

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function jaro(s1, s2) {
  if (s1 === s2) return 1;
  const l1 = s1.length, l2 = s2.length;
  const matchDist = Math.floor(Math.max(l1, l2) / 2) - 1;
  const s1m = Array(l1).fill(false), s2m = Array(l2).fill(false);
  let matches = 0, transpositions = 0;
  for (let i = 0; i < l1; i++) {
    const lo = Math.max(0, i - matchDist);
    const hi = Math.min(i + matchDist + 1, l2);
    for (let j = lo; j < hi; j++) {
      if (s2m[j] || s1[i] !== s2[j]) continue;
      s1m[i] = s2m[j] = true; matches++; break;
    }
  }
  if (!matches) return 0;
  let k = 0;
  for (let i = 0; i < l1; i++) {
    if (!s1m[i]) continue;
    while (!s2m[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  return (matches/l1 + matches/l2 + (matches - transpositions/2)/matches) / 3;
}

function jaroWinkler(s1, s2) {
  const j = jaro(s1, s2);
  let p = 0;
  const len = Math.min(s1.length, s2.length, 4);
  for (let i = 0; i < len; i++) { if (s1[i] === s2[i]) p++; else break; }
  return j + p * 0.1 * (1 - j);
}

function tokenSort(s) {
  return s.toLowerCase().split(/\s+/).sort().join(" ");
}

function normalize(s) {
  return s.toLowerCase()
    .replace(/[.,\-']/g, " ")
    .replace(/\b(mr|mrs|dr|jr|sr|the|al|bin|binti|von|van|de|el)\b/g, "")
    .replace(/\s+/g, " ").trim();
}

function scoreMatch(query, candidate) {
  const q = normalize(query), c = normalize(candidate);
  const qSorted = tokenSort(q), cSorted = tokenSort(c);

  const exact = q === c ? 100 : 0;
  const jwScore = Math.round(jaroWinkler(q, c) * 100);
  const jwSorted = Math.round(jaroWinkler(qSorted, cSorted) * 100);
  const maxLen = Math.max(q.length, c.length);
  const levScore = maxLen === 0 ? 100 : Math.round((1 - levenshtein(q, c) / maxLen) * 100);

  // Weighted ensemble
  const score = exact || Math.round(jwScore * 0.4 + jwSorted * 0.35 + levScore * 0.25);

  let method = "Jaro-Winkler";
  if (exact) method = "Exact Match";
  else if (jwSorted > jwScore + 5) method = "Token Sort + JW";
  else if (levScore > jwScore + 5) method = "Levenshtein";

  return { score: Math.min(score, 100), method };
}

function getRiskLevel(score) {
  if (score >= 90) return { label: "CRITICAL", color: "#ff2d55", bg: "rgba(255,45,85,0.12)", tier: 4 };
  if (score >= 75) return { label: "HIGH", color: "#ff9500", bg: "rgba(255,149,0,0.12)", tier: 3 };
  if (score >= 55) return { label: "MEDIUM", color: "#ffd60a", bg: "rgba(255,214,10,0.12)", tier: 2 };
  return { label: "LOW", color: "#30d158", bg: "rgba(48,209,88,0.12)", tier: 1 };
}

// ── Sanctions Dataset (OFAC / UN / EU inspired) ───────────────────────────────
const SANCTIONS_LIST = [
  { id:"OFAC-001", name:"Ali Hassan Al-Majid", aliases:["Chemical Ali","Ali al-Majid"], list:"OFAC SDN", country:"Iraq", category:"WMD" },
  { id:"OFAC-002", name:"Saddam Hussein Abd al-Majid", aliases:["Saddam Hussein"], list:"OFAC SDN", country:"Iraq", category:"Terrorism" },
  { id:"OFAC-003", name:"Osama Bin Laden", aliases:["Usama bin Ladin","Abu Abdallah"], list:"UN 1267", country:"Saudi Arabia", category:"Terrorism" },
  { id:"OFAC-004", name:"Ayman Al-Zawahiri", aliases:["Ayman al Zawahiri","Abu Muhammad"], list:"UN 1267", country:"Egypt", category:"Terrorism" },
  { id:"OFAC-005", name:"Viktor Bout", aliases:["Victor Bout","Merchant of Death"], list:"OFAC SDN", country:"Russia", category:"Arms Trafficking" },
  { id:"OFAC-006", name:"Muammar Gaddafi", aliases:["Moammar Gadhafi","Muammar al-Qaddafi"], list:"UN Sanctions", country:"Libya", category:"Human Rights" },
  { id:"OFAC-007", name:"Kim Jong-un", aliases:["Kim Jong Un","Kim Jong-eun"], list:"OFAC SDN", country:"North Korea", category:"WMD/Proliferation" },
  { id:"OFAC-008", name:"Ramzan Kadyrov", aliases:["Ramzan Akhmatovich Kadyrov"], list:"EU Sanctions", country:"Russia", category:"Human Rights" },
  { id:"OFAC-009", name:"Nazanin Boniadi", aliases:[], list:"OFAC SDN", country:"Iran", category:"Terrorism" },
  { id:"OFAC-010", name:"Pablo Emilio Escobar Gaviria", aliases:["El Patrón","Pablo Escobar"], list:"OFAC Narco", country:"Colombia", category:"Drug Trafficking" },
  { id:"OFAC-011", name:"Joaquin Archivaldo Guzman Loera", aliases:["El Chapo","Chapo Guzman"], list:"OFAC Narco", country:"Mexico", category:"Drug Trafficking" },
  { id:"OFAC-012", name:"Hassan Nasrallah", aliases:["Hasan Nasrallah"], list:"OFAC SDN", country:"Lebanon", category:"Terrorism" },
  { id:"OFAC-013", name:"Ismail Haniyeh", aliases:["Ismail Abdel Salam Ahmed Haniyeh"], list:"UN Sanctions", country:"Palestine", category:"Terrorism" },
  { id:"OFAC-014", name:"Abu Bakr Al-Baghdadi", aliases:["Ibrahim Awwad Ibrahim","Caliph Ibrahim"], list:"UN 1267", country:"Iraq", category:"Terrorism" },
  { id:"OFAC-015", name:"Ali Khamenei", aliases:["Sayyid Ali Hosseini Khamenei"], list:"OFAC SDN", country:"Iran", category:"Human Rights" },
  { id:"EU-001", name:"Igor Sechin", aliases:["Igor Ivanovich Sechin"], list:"EU Sanctions", country:"Russia", category:"Political" },
  { id:"EU-002", name:"Sergei Lavrov", aliases:["Sergey Lavrov"], list:"EU Sanctions", country:"Russia", category:"Political" },
  { id:"EU-003", name:"Alexander Lukashenko", aliases:["Aliaksandr Lukashenko"], list:"EU/OFAC SDN", country:"Belarus", category:"Human Rights" },
  { id:"UN-001", name:"Mohammed Omar", aliases:["Mullah Omar","Mullah Mohammed Omar Mujahid"], list:"UN 1988", country:"Afghanistan", category:"Terrorism" },
  { id:"UN-002", name:"Gulbuddin Hekmatyar", aliases:["Gulbaddin Hekmatyar"], list:"UN 1267", country:"Afghanistan", category:"Terrorism" },
];

// ── Main Component ─────────────────────────────────────────────────────────────
export default function SanctionsEngine() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [threshold, setThreshold] = useState(55);
  const [searched, setSearched] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selectedResult, setSelectedResult] = useState(null);
  const [stats, setStats] = useState({ total: SANCTIONS_LIST.length, scanned: 0, hits: 0, criticals: 0 });
  const [history, setHistory] = useState([]);
  const inputRef = useRef(null);
  const scanInterval = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function runSearch() {
    if (!query.trim()) return;
    setScanning(true);
    setResults([]);
    setSearched(false);
    setSelectedResult(null);
    let scanned = 0;

    scanInterval.current = setInterval(() => {
      scanned += 2;
      setStats(s => ({ ...s, scanned: Math.min(scanned, SANCTIONS_LIST.length) }));
      if (scanned >= SANCTIONS_LIST.length) {
        clearInterval(scanInterval.current);
        const scored = SANCTIONS_LIST.map(entry => {
          const nameMatch = scoreMatch(query, entry.name);
          const aliasMatches = entry.aliases.map(a => scoreMatch(query, a));
          const best = [nameMatch, ...aliasMatches].reduce((a, b) => b.score > a.score ? b : a);
          const risk = getRiskLevel(best.score);
          return { ...entry, score: best.score, method: best.method, risk };
        })
        .filter(r => r.score >= threshold)
        .sort((a, b) => b.score - a.score);

        const criticals = scored.filter(r => r.score >= 90).length;
        setStats({ total: SANCTIONS_LIST.length, scanned: SANCTIONS_LIST.length, hits: scored.length, criticals });
        setResults(scored);
        setSearched(true);
        setScanning(false);
        setHistory(h => [{ query, hits: scored.length, time: new Date().toLocaleTimeString(), criticals }, ...h.slice(0, 4)]);
      }
    }, 40);
  }

  function handleKey(e) { if (e.key === "Enter") runSearch(); }

  const categoryColors = {
    "Terrorism": "#ff2d55", "WMD": "#ff6b35", "Drug Trafficking": "#bf5af2",
    "Arms Trafficking": "#ff9500", "Human Rights": "#ffd60a", "Political": "#64d2ff",
    "WMD/Proliferation": "#ff6b35"
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080c14",
      fontFamily: "'Courier New', monospace",
      color: "#c8d8e8",
      padding: "0",
      overflow: "hidden auto"
    }}>
      {/* Animated grid background */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0,
        backgroundImage: `
          linear-gradient(rgba(0,200,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,200,255,0.03) 1px, transparent 1px)
        `,
        backgroundSize: "40px 40px",
        pointerEvents: "none"
      }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>

        {/* Header */}
        <div style={{ marginBottom: 36, borderBottom: "1px solid rgba(0,200,255,0.15)", paddingBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%", background: "#00c8ff",
              boxShadow: "0 0 12px #00c8ff",
              animation: "pulse 2s infinite"
            }} />
            <span style={{ fontSize: 11, letterSpacing: 4, color: "#00c8ff", textTransform: "uppercase" }}>
              OFAC · EU · UN · FINCEN · HMT
            </span>
          </div>
          <h1 style={{
            fontSize: "clamp(22px, 4vw, 38px)", fontWeight: 700, margin: "0 0 4px",
            letterSpacing: 2, color: "#e8f4ff",
            fontFamily: "'Courier New', monospace"
          }}>
            SANCTIONS SCREENING ENGINE
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "#607080", letterSpacing: 1 }}>
            ML-Powered Name Matching · Fuzzy Search · False Positive Reduction
          </p>
        </div>

        {/* Stats Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
          {[
            { label: "TOTAL ENTITIES", value: stats.total, color: "#64d2ff" },
            { label: "SCANNED", value: scanning ? stats.scanned : (searched ? stats.total : "—"), color: "#00c8ff" },
            { label: "MATCHES FOUND", value: searched ? stats.hits : "—", color: stats.hits > 0 ? "#ff9500" : "#64d2ff" },
            { label: "CRITICAL HITS", value: searched ? stats.criticals : "—", color: stats.criticals > 0 ? "#ff2d55" : "#64d2ff" },
          ].map(s => (
            <div key={s.label} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(0,200,255,0.12)",
              borderRadius: 8, padding: "14px 16px"
            }}>
              <div style={{ fontSize: 10, letterSpacing: 2, color: "#405060", marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: s.color, letterSpacing: 1 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Search Bar */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Enter name to screen... (e.g. 'Osama bin Laden', 'Ali Hassan')"
              style={{
                width: "100%", background: "rgba(0,200,255,0.05)",
                border: "1px solid rgba(0,200,255,0.25)",
                borderRadius: 8, padding: "14px 18px", fontSize: 15,
                color: "#e8f4ff", outline: "none", letterSpacing: 0.5,
                fontFamily: "'Courier New', monospace", boxSizing: "border-box",
                transition: "border-color 0.2s"
              }}
              onFocus={e => e.target.style.borderColor = "rgba(0,200,255,0.6)"}
              onBlur={e => e.target.style.borderColor = "rgba(0,200,255,0.25)"}
            />
          </div>
          <button
            onClick={runSearch}
            disabled={scanning || !query.trim()}
            style={{
              background: scanning ? "rgba(0,200,255,0.1)" : "rgba(0,200,255,0.15)",
              border: "1px solid rgba(0,200,255,0.4)",
              borderRadius: 8, padding: "0 28px", fontSize: 13,
              color: scanning ? "#405060" : "#00c8ff", cursor: scanning ? "not-allowed" : "pointer",
              letterSpacing: 2, fontFamily: "'Courier New', monospace", fontWeight: 700,
              transition: "all 0.2s", whiteSpace: "nowrap"
            }}
          >
            {scanning ? "SCANNING..." : "▶ RUN SCREEN"}
          </button>
        </div>

        {/* Threshold Slider */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28, padding: "12px 16px",
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(0,200,255,0.08)", borderRadius: 8 }}>
          <span style={{ fontSize: 11, color: "#405060", letterSpacing: 2, whiteSpace: "nowrap" }}>MATCH THRESHOLD</span>
          <input type="range" min={30} max={95} value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
            style={{ flex: 1, accentColor: "#00c8ff", cursor: "pointer" }} />
          <div style={{ fontSize: 18, fontWeight: 700, color: "#00c8ff", minWidth: 46, textAlign: "right" }}>
            {threshold}%
          </div>
          <div style={{ fontSize: 10, color: "#405060", letterSpacing: 1 }}>
            {threshold >= 75 ? "STRICT" : threshold >= 55 ? "BALANCED" : "PERMISSIVE"}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: selectedResult ? "1fr 380px" : "1fr", gap: 16 }}>

          {/* Results */}
          <div>
            {scanning && (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <div style={{ fontSize: 13, color: "#00c8ff", letterSpacing: 3, marginBottom: 16 }}>
                  SCREENING AGAINST {stats.total} ENTITIES...
                </div>
                <div style={{
                  height: 4, background: "rgba(0,200,255,0.1)", borderRadius: 2, overflow: "hidden"
                }}>
                  <div style={{
                    height: "100%", background: "linear-gradient(90deg, #00c8ff, #0080ff)",
                    width: `${(stats.scanned / stats.total) * 100}%`,
                    transition: "width 0.1s", borderRadius: 2
                  }} />
                </div>
              </div>
            )}

            {searched && results.length === 0 && (
              <div style={{
                textAlign: "center", padding: "48px 0",
                border: "1px solid rgba(48,209,88,0.2)", borderRadius: 8,
                background: "rgba(48,209,88,0.04)"
              }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
                <div style={{ fontSize: 16, color: "#30d158", letterSpacing: 2 }}>NO MATCHES FOUND</div>
                <div style={{ fontSize: 12, color: "#405060", marginTop: 6 }}>
                  Below {threshold}% threshold · Entity cleared
                </div>
              </div>
            )}

            {results.length > 0 && (
              <div>
                <div style={{ fontSize: 11, letterSpacing: 3, color: "#405060", marginBottom: 12 }}>
                  {results.length} MATCH{results.length > 1 ? "ES" : ""} · SORTED BY RISK SCORE
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {results.map(r => (
                    <div key={r.id}
                      onClick={() => setSelectedResult(selectedResult?.id === r.id ? null : r)}
                      style={{
                        background: selectedResult?.id === r.id ? "rgba(0,200,255,0.07)" : "rgba(255,255,255,0.02)",
                        border: `1px solid ${selectedResult?.id === r.id ? "rgba(0,200,255,0.3)" : r.risk.color + "33"}`,
                        borderLeft: `3px solid ${r.risk.color}`,
                        borderRadius: 8, padding: "14px 16px", cursor: "pointer",
                        transition: "all 0.15s"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                            <span style={{
                              fontSize: 10, padding: "2px 8px", borderRadius: 3,
                              background: r.risk.bg, color: r.risk.color,
                              letterSpacing: 2, fontWeight: 700
                            }}>{r.risk.label}</span>
                            <span style={{ fontSize: 10, color: "#405060", letterSpacing: 1 }}>{r.id}</span>
                            <span style={{
                              fontSize: 10, padding: "2px 6px", borderRadius: 3,
                              background: "rgba(255,255,255,0.05)", color: "#607080"
                            }}>{r.list}</span>
                          </div>
                          <div style={{ fontSize: 15, color: "#e8f4ff", fontWeight: 600, marginBottom: 3 }}>
                            {r.name}
                          </div>
                          <div style={{ fontSize: 11, color: "#405060" }}>
                            {r.country} · <span style={{ color: categoryColors[r.category] || "#607080" }}>{r.category}</span>
                            {r.aliases.length > 0 && ` · ${r.aliases.length} alias${r.aliases.length > 1 ? "es" : ""}`}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", marginLeft: 16 }}>
                          <div style={{ fontSize: 28, fontWeight: 700, color: r.risk.color, lineHeight: 1 }}>
                            {r.score}%
                          </div>
                          <div style={{ fontSize: 9, color: "#405060", marginTop: 2, letterSpacing: 1 }}>
                            {r.method}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!searched && !scanning && (
              <div style={{ padding: "32px 0" }}>
                {/* Algorithm explainer */}
                <div style={{ fontSize: 11, letterSpacing: 3, color: "#405060", marginBottom: 16 }}>
                  MATCHING ALGORITHMS
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  {[
                    { name: "Jaro-Winkler", desc: "Prefix-weighted string similarity. Best for names & transpositions.", weight: "40%" },
                    { name: "Token Sort", desc: "Reorders name tokens before matching. Catches word-order variations.", weight: "35%" },
                    { name: "Levenshtein", desc: "Edit distance between strings. Handles typos & OCR errors.", weight: "25%" },
                  ].map(a => (
                    <div key={a.name} style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(0,200,255,0.08)",
                      borderRadius: 8, padding: 16
                    }}>
                      <div style={{ fontSize: 12, color: "#00c8ff", marginBottom: 6, letterSpacing: 1 }}>{a.name}</div>
                      <div style={{ fontSize: 11, color: "#405060", lineHeight: 1.5, marginBottom: 8 }}>{a.desc}</div>
                      <div style={{ fontSize: 10, color: "#304050" }}>Weight: <span style={{ color: "#64d2ff" }}>{a.weight}</span></div>
                    </div>
                  ))}
                </div>

                {/* History */}
                {history.length > 0 && (
                  <div style={{ marginTop: 24 }}>
                    <div style={{ fontSize: 11, letterSpacing: 3, color: "#405060", marginBottom: 12 }}>RECENT SEARCHES</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {history.map((h, i) => (
                        <div key={i} onClick={() => { setQuery(h.query); }}
                          style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: "10px 14px", background: "rgba(255,255,255,0.02)",
                            border: "1px solid rgba(0,200,255,0.06)", borderRadius: 6, cursor: "pointer"
                          }}>
                          <span style={{ fontSize: 13, color: "#8090a0" }}>{h.query}</span>
                          <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
                            <span style={{ color: h.hits > 0 ? "#ff9500" : "#30d158" }}>{h.hits} hits</span>
                            {h.criticals > 0 && <span style={{ color: "#ff2d55" }}>{h.criticals} critical</span>}
                            <span style={{ color: "#304050" }}>{h.time}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Detail Panel */}
          {selectedResult && (
            <div style={{
              background: "rgba(0,10,20,0.8)", border: `1px solid ${selectedResult.risk.color}44`,
              borderRadius: 10, padding: 20, alignSelf: "start",
              backdropFilter: "blur(10px)"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ fontSize: 10, letterSpacing: 3, color: "#405060" }}>ENTITY DETAIL</span>
                <button onClick={() => setSelectedResult(null)}
                  style={{ background: "none", border: "none", color: "#405060", cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>

              <div style={{
                fontSize: 11, padding: "3px 10px", borderRadius: 3, display: "inline-block",
                background: selectedResult.risk.bg, color: selectedResult.risk.color,
                letterSpacing: 2, fontWeight: 700, marginBottom: 10
              }}>{selectedResult.risk.label} RISK</div>

              <div style={{ fontSize: 18, color: "#e8f4ff", fontWeight: 700, marginBottom: 16, lineHeight: 1.3 }}>
                {selectedResult.name}
              </div>

              {[
                { label: "MATCH SCORE", value: `${selectedResult.score}%`, color: selectedResult.risk.color },
                { label: "ALGORITHM", value: selectedResult.method },
                { label: "ENTITY ID", value: selectedResult.id },
                { label: "SANCTIONS LIST", value: selectedResult.list },
                { label: "NATIONALITY", value: selectedResult.country },
                { label: "CATEGORY", value: selectedResult.category, color: categoryColors[selectedResult.category] },
              ].map(f => (
                <div key={f.label} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 12
                }}>
                  <span style={{ color: "#405060", letterSpacing: 1, fontSize: 10 }}>{f.label}</span>
                  <span style={{ color: f.color || "#c8d8e8", fontWeight: 600 }}>{f.value}</span>
                </div>
              ))}

              {selectedResult.aliases.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 10, letterSpacing: 2, color: "#405060", marginBottom: 8 }}>KNOWN ALIASES</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {selectedResult.aliases.map((a, i) => (
                      <div key={i} style={{
                        padding: "6px 10px", background: "rgba(255,255,255,0.03)",
                        borderRadius: 4, fontSize: 12, color: "#8090a0"
                      }}>— {a}</div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 16, padding: "10px 12px",
                background: selectedResult.score >= 75 ? "rgba(255,45,85,0.08)" : "rgba(255,149,0,0.06)",
                border: `1px solid ${selectedResult.score >= 75 ? "rgba(255,45,85,0.2)" : "rgba(255,149,0,0.15)"}`,
                borderRadius: 6, fontSize: 11, color: "#8090a0", lineHeight: 1.6
              }}>
                {selectedResult.score >= 90
                  ? "⚠ BLOCK — Escalate immediately. File SAR if applicable."
                  : selectedResult.score >= 75
                  ? "⚠ REVIEW — Manual investigation required before processing."
                  : "ℹ MONITOR — Log for compliance record. Senior review recommended."}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        input[type=range]::-webkit-slider-thumb { width:14px; height:14px; }
        ::-webkit-scrollbar { width:6px; } ::-webkit-scrollbar-track { background:#080c14; }
        ::-webkit-scrollbar-thumb { background:#203040; border-radius:3px; }
      `}</style>
    </div>
  );
}
