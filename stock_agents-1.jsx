import { useState, useEffect } from "react";

const PROVIDERS = {
  gemini: {
    label:"Gemini 2.0 Flash", tag:"ฟรี 100% (แนะนำ)", tagColor:"#4ade80",
    placeholder:"AIzaSy...", storageKey:"gemini_key",
  },
  claude: {
    label:"Claude Sonnet 4.5", tag:"มีค่าบริการ (ไม่แนะนำ)", tagColor:"#f59e0b",
    placeholder:"sk-ant-api03-...", storageKey:"claude_key",
  },
};

const GEMINI_MODELS = ["gemini-1.5-flash", "gemini-2.0-flash-lite", "gemini-2.0-flash"];
const GEMINI_STREAM  = (m)=>`https://generativelanguage.googleapis.com/v1beta/models/${m}:streamGenerateContent?alt=sse`;
const CLAUDE_API     = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL   = "claude-sonnet-4-5";
const HISTORY_KEY    = "stock_history_v2";

const AGENTS = {
  chayakorn: {name:"ชยกร",  role:"นักคัดกรองหุ้น (TA + Watchlist)", emoji:"🔍", color:"#00d4ff", bg:"rgba(0,212,255,0.05)",  border:"rgba(0,212,255,0.2)"},
  watsaran:  {name:"วศรัญ", role:"นักวิเคราะห์ข่าว (Catalyst & News)", emoji:"📰", color:"#f59e0b", bg:"rgba(245,158,11,0.05)", border:"rgba(245,158,11,0.2)"},
  boss:      {name:"บอส ฒ", role:"ผู้ฟันธง & จัดการความเสี่ยง (Decision)", emoji:"⚡", color:"#ff4d6d", bg:"rgba(255,77,109,0.05)", border:"rgba(255,77,109,0.2)"},
};

function extractSymbols(text){
  const found = [...text.matchAll(/\*\*([A-Z0-9\-\.]{2,10})\*\*/g)].map(m=>m[1]);
  return [...new Set(found)];
}

function parseStocks(raw) {
  const tokens = raw.split(/[\s,]+/);
  const stocks = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i].toUpperCase().replace(/[^A-Z0-9\-\.]/g, "");
    if (/^[A-Z0-9\-\.]{2,10}$/.test(token) && !/^[0-9.]+$/.test(token)) {
      if (i + 1 < tokens.length) {
        const nextVal = tokens[i+1].replace(/[^\d.]/g, "");
        if (/^[0-9.]+$/.test(nextVal)) {
          stocks.push({ s: token, p: parseFloat(nextVal) });
          i++; 
        }
      }
    }
  }
  return stocks;
}

// Scrape Hoonstation via CORS proxy
async function scrapeHoonstation() {
  let html = "";
  try {
    if (window.location.protocol !== "file:") {
      const localResponse = await fetch("./proxy.php");
      if (localResponse.ok) {
        const localData = await localResponse.json();
        if (localData.contents) {
          html = localData.contents;
        }
      }
    }
  } catch (localErr) {
    console.warn("Local PHP proxy failed, trying public CORS proxy...", localErr);
  }

  // Fallback to allorigins public proxy if local proxy was unavailable or failed
  if (!html) {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent('https://www.hoonstation.com/top_hagreen')}`;
    const r = await fetch(proxyUrl);
    if (!r.ok) throw new Error("CORS Proxy error");
    const data = await r.json();
    html = data.contents;
  }

  if (!html) {
    throw new Error("ดึงข้อมูลจากเว็บล้มเหลว");
  }
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  
  const scripts = doc.querySelectorAll("script, style");
  scripts.forEach(s => s.remove());
  
  const bodyText = doc.body ? doc.body.innerText : "";
  const parsed = parseStocks(bodyText);
  
  const unique = [];
  const seen = new Set();
  const exclude = new Set(["HA", "SET", "SET50", "SET100", "MAI", "PE", "PBV", "DE", "EPS", "ROA", "ROE", "MCAP", "G1S", "G2S", "G3S", "HOON", "STATION"]);
  
  for (const item of parsed) {
    if (!seen.has(item.s) && !exclude.has(item.s) && isNaN(item.s)) {
      seen.add(item.s);
      unique.push(item);
    }
  }
  return unique;
}

async function saveToGist(gistId, ghToken, data){
  const url = `https://api.github.com/gists/${gistId}`;
  const r = await fetch(url,{
    method:"PATCH",
    headers:{
      "Authorization": `Bearer ${ghToken}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({
      files: {
        "analysis.json": { content: JSON.stringify(data) }
      }
    }),
  });
  if(!r.ok){ 
    const d = await r.json(); 
    throw new Error(d.message || "Gist save failed"); 
  }
}

async function getPreviousAnalysis(gistId, ghToken) {
  try {
    const url = `https://api.github.com/gists/${gistId}`;
    const headers = {};
    if (ghToken) {
      headers["Authorization"] = `Bearer ${ghToken}`;
    }
    const r = await fetch(url, { headers });
    if (!r.ok) return null;
    const d = await r.json();
    const file = d.files?.["analysis.json"];
    if (file && file.content) {
      return JSON.parse(file.content);
    }
  } catch (e) {
    console.error("Failed to load previous analysis", e);
  }
  return null;
}

function loadHistory(){ 
  try{ return JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]"); }catch{ return []; } 
}

function saveHistory(dateStr, boss){
  const h = loadHistory();
  h.unshift({dateStr, boss, ts:Date.now()});
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0,10)));
}

async function streamGemini(apiKey, system, user, onChunk, maxTok=1200, model="gemini-2.0-flash"){
  const r = await fetch(GEMINI_STREAM(model), {
    method:"POST",
    headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},
    body: JSON.stringify({
      systemInstruction:{parts:[{text:system}]},
      contents:[{role:"user",parts:[{text:user}]}],
      generationConfig:{maxOutputTokens:maxTok},
    }),
  });
  if(!r.ok){
    let msg = "HTTP "+r.status;
    try{ const d=await r.json(); msg=d.error?.message||msg; }catch{}
    throw new Error(msg);
  }
  const reader  = r.body.getReader();
  const decoder = new TextDecoder();
  let buf="", full="";
  while(true){
    const {done,value} = await reader.read();
    if(done) break;
    buf += decoder.decode(value,{stream:true});
    const lines = buf.split("\n");
    buf = lines.pop();
    for(const line of lines){
      if(!line.startsWith("data: ")) continue;
      try{
        const chunk = JSON.parse(line.slice(6));
        const txt   = chunk.candidates?.[0]?.content?.parts?.[0]?.text || "";
        full += txt;
        onChunk(full);
      }catch{}
    }
  }
  return full.trim() || "⚠️ ไม่มีผลลัพธ์";
}

async function streamClaude(apiKey, system, user, onChunk, maxTok=1200){
  const r = await fetch(CLAUDE_API, {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "x-api-key": apiKey,
      "anthropic-version":"2023-06-01",
      "anthropic-dangerous-direct-browser-access":"true",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL, max_tokens: maxTok, stream: true,
      system, messages:[{role:"user",content:user}],
    }),
  });
  if(!r.ok){
    let msg = "HTTP "+r.status;
    try{ const d=await r.json(); msg=d.error?.message||msg; }catch{}
    throw new Error(msg);
  }
  const reader  = r.body.getReader();
  const decoder = new TextDecoder();
  let buf="", full="";
  while(true){
    const {done,value} = await reader.read();
    if(done) break;
    buf += decoder.decode(value,{stream:true});
    const lines = buf.split("\n");
    buf = lines.pop();
    for(const line of lines){
      if(!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if(raw==="[DONE]") continue;
      try{
        const ev = JSON.parse(raw);
        if(ev.type==="content_block_delta" && ev.delta?.type==="text_delta"){
          full += ev.delta.text;
          onChunk(full);
        }
      }catch{}
    }
  }
  return full.trim() || "⚠️ ไม่มีผลลัพธ์";
}

function Dots({color}){
  return <div style={{display:"flex",gap:4}}>
    {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:color,animation:`bounce 0.8s ease-in-out ${i*0.15}s infinite`}}/>)}
  </div>;
}

export default function App(){
  const today = new Date().toLocaleDateString("th-TH",{day:"numeric",month:"long",year:"numeric"});
  
  // Navigation
  const [tab, setTab] = useState("dashboard");

  // Configuration
  const [provider, setProvider] = useState(()=>localStorage.getItem("provider")||"gemini");
  const prov = PROVIDERS[provider];
  const [apiKey, setApiKey] = useState(()=>localStorage.getItem(prov.storageKey)||"");
  const [dateStr, setDateStr] = useState(today);
  const [gistId, setGistId] = useState(()=>localStorage.getItem("gist_id")||"82fd61b97064c5df31452ab4ba448bdd");
  const [ghToken, setGhToken] = useState(()=>localStorage.getItem("gh_token")||"");
  const [tokenSave, setTokenSave] = useState(()=>localStorage.getItem("token_save")!=="0");
  const [geminiModel, setGeminiModel] = useState(()=>localStorage.getItem("gemini_model")||"gemini-2.0-flash");
  
  // Diverse Inputs
  const [volumeSpikes, setVolumeSpikes] = useState(()=>localStorage.getItem("volume_spikes")||"");
  const [marketNews, setMarketNews] = useState(()=>localStorage.getItem("market_news")||"");

  // Risk Management
  const [portfolioSize, setPortfolioSize] = useState(()=>Number(localStorage.getItem("portfolio_size")||"1000000"));
  const [riskProfile, setRiskProfile] = useState(()=>localStorage.getItem("risk_profile")||"medium");

  // Watchlist State
  const [watchlist, setWatchlist] = useState(() => {
    try {
      const saved = localStorage.getItem("stock_watchlist");
      return saved ? JSON.parse(saved) : [
        { s: "TKN", p: 4.22, category: "G1S", note: "ยอดขายดีจากปริมาณนักท่องเที่ยวฟื้นตัวชัดเจน", active: true },
        { s: "SYNTEC", p: 1.68, category: "G2S", note: "Backlog หนาแน่น ราคาปัจจุบันพีอีต่ำต่ำกว่ากลุ่ม", active: true }
      ];
    } catch(e) {
      return [];
    }
  });

  // Automated Scheduler state
  const [schedulerEnabled, setSchedulerEnabled] = useState(()=>localStorage.getItem("scheduler_enabled")==="1");
  const [morningTime, setMorningTime] = useState(()=>localStorage.getItem("morning_time")||"08:30");
  const [eveningTime, setEveningTime] = useState(()=>localStorage.getItem("evening_time")||"18:00");
  const [schedulerLogs, setSchedulerLogs] = useState(() => {
    try { return JSON.parse(localStorage.getItem("scheduler_logs")||"[]"); } catch { return []; }
  });
  const [nextRunText, setNextRunText] = useState("");

  // Running State
  const [status, setStatus] = useState({chayakorn:"pending",watsaran:"pending",boss:"pending"});
  const [output, setOutput] = useState({chayakorn:"",watsaran:"",boss:""});
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState(loadHistory);
  const [gistStatus, setGistStatus] = useState("");

  const addLog = (msg, type = "info") => {
    const newLog = { id: Date.now(), time: new Date().toLocaleTimeString("th-TH"), msg, type };
    setSchedulerLogs(prev => {
      const updated = [newLog, ...prev].slice(0, 50);
      localStorage.setItem("scheduler_logs", JSON.stringify(updated));
      return updated;
    });
  };

  const callAI = (sys,usr,onChunk,tok)=>
    provider==="claude" ? streamClaude(apiKey,sys,usr,onChunk,tok) : streamGemini(apiKey,sys,usr,onChunk,tok,geminiModel);

  // Auto-run Timer effect
  useEffect(() => {
    if (!schedulerEnabled) {
      setNextRunText("ปิดการทำงานตัวตั้งเวลา");
      return;
    }

    const interval = setInterval(() => {
      const now = new Date();
      const nowStr = now.toTimeString().split(" ")[0].substring(0, 5);
      const seconds = now.getSeconds();
      const todayDateStr = now.toLocaleDateString("en-CA");
      
      if (nowStr === morningTime && seconds === 0) {
        const lastDate = localStorage.getItem("last_run_date");
        const lastSlot = localStorage.getItem("last_run_slot");
        if (lastDate !== todayDateStr || lastSlot !== "morning") {
          triggerAutoRun("morning", todayDateStr);
        }
      }
      
      if (nowStr === eveningTime && seconds === 0) {
        const lastDate = localStorage.getItem("last_run_date");
        const lastSlot = localStorage.getItem("last_run_slot");
        if (lastDate !== todayDateStr || lastSlot !== "evening") {
          triggerAutoRun("evening", todayDateStr);
        }
      }

      setNextRunText(calculateCountdown(now, morningTime, eveningTime));
    }, 1000);

    return () => clearInterval(interval);
  }, [schedulerEnabled, morningTime, eveningTime, watchlist, apiKey, volumeSpikes, marketNews, portfolioSize, riskProfile]);

  function calculateCountdown(now, morning, evening) {
    const parseTime = (timeStr, baseDate) => {
      const [h, m] = timeStr.split(":").map(Number);
      const d = new Date(baseDate);
      d.setHours(h, m, 0, 0);
      return d;
    };

    const morningTimeToday = parseTime(morning, now);
    const eveningTimeToday = parseTime(evening, now);
    
    let nextRun = null;
    let slotName = "";

    if (now < morningTimeToday) {
      nextRun = morningTimeToday;
      slotName = "รอบเช้า";
    } else if (now < eveningTimeToday) {
      nextRun = eveningTimeToday;
      slotName = "รอบเย็น";
    } else {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      nextRun = parseTime(morning, tomorrow);
      slotName = "รอบเช้าวันถัดไป";
    }

    const diffMs = nextRun - now;
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const diffSecs = Math.floor((diffMs % (1000 * 60)) / 1000);

    const pad = (num) => String(num).padStart(2, "0");
    return `⏳ วิเคราะห์รอบถัดไป: ${slotName} ในอีก ${pad(diffHrs)}:${pad(diffMins)}:${pad(diffSecs)}`;
  }

  async function triggerAutoRun(slot, todayDateStr) {
    addLog(`🤖 เริ่มการวิเคราะห์อัตโนมัติ (${slot === "morning" ? "รอบเช้า" : "รอบเย็น"})`, "info");
    localStorage.setItem("last_run_date", todayDateStr);
    localStorage.setItem("last_run_slot", slot);
    
    try {
      await runAnalysis(slot);
      addLog(`✓ วิเคราะห์อัตโนมัติสำเร็จ (${slot === "morning" ? "รอบเช้า" : "รอบเย็น"})`, "success");
    } catch (e) {
      addLog(`⚠️ วิเคราะห์อัตโนมัติล้มเหลว: ${e.message}`, "error");
    }
  }

  async function runAnalysis(forcedSlot = null) {
    if(running) return;
    if(!apiKey.trim()){ setError("กรอก API Key ก่อน"); return; }
    
    const activeStocks = watchlist.filter(s => s.active);
    if(activeStocks.length === 0){
      const err = "ยังไม่มีหุ้นที่เลือกใน Watchlist";
      setError(err);
      throw new Error(err);
    }
    
    setError(""); setRunning(true); setDone(false); setCopied(false);
    setOutput({chayakorn:"",watsaran:"",boss:""});
    setStatus({chayakorn:"pending",watsaran:"pending",boss:"pending"});
    
    const g2s = activeStocks.filter(s => s.category === "G2S");
    const g1s = activeStocks.filter(s => s.category === "G1S");
    const g3s = activeStocks.filter(s => s.category === "G3S");
    
    const g2sStr = g2s.map(s=>`${s.s} ฿${s.p} (${s.note || "-"})`).join(", ") || "-";
    const g1sStr = g1s.map(s=>`${s.s} ฿${s.p} (${s.note || "-"})`).join(", ") || "-";
    const g3sStr = g3s.map(s=>`${s.s} ฿${s.p} (${s.note || "-"})`).join(", ") || "-";
    
    try {
      addLog("🔍 กำลังดึงประวัติวิเคราะห์รอบก่อนหน้าเพื่อใช้เป็น Memory Layer...", "info");
      const prevAnalysis = await getPreviousAnalysis(gistId, ghToken);
      let memoryContext = "ไม่มีข้อมูลประวัติวิเคราะห์รอบก่อนหน้า";
      if (prevAnalysis && prevAnalysis.boss) {
        memoryContext = `ผลการวิเคราะห์รอบก่อนหน้า (${prevAnalysis.date || "ไม่ระบุ"}): \n${prevAnalysis.boss}`;
        addLog(`✓ โหลดประวัติรอบก่อนหน้าสำเร็จ (${prevAnalysis.date || "ไม่ระบุ"})`, "success");
      }
      
      const currentSlot = forcedSlot || (new Date().getHours() < 12 ? "รอบเช้า (ก่อนเปิดตลาด)" : "รอบเย็น (หลังปิดตลาด)");

      // Agent 1: ชยกร
      setStatus(p=>({...p,chayakorn:"running"}));
      const a1 = await callAI(
        `คุณคือ "ชยกร" นักคัดกรองหุ้น SET ตอบภาษาไทยและใช้ Markdown
วิเคราะห์ความน่าสนใจทางเทคนิคของหุ้นจากข้อมูลที่ให้:
1. ข้อมูลหุ้นแบ่งตามความแข็งแกร่งของสัญญาณ Heikin Ashi (g2s = แข็งแกร่ง, g1s = เริ่มต้น, g3s = เฝ้าระวัง)
2. หุ้นที่มีสัญญาณ Volume Spike (ปริมาณการซื้อขายหนาแน่นผิดปกติ)
3. ประวัติการวิเคราะห์รอบก่อนหน้า (Memory Layer): เพื่อดูการพัฒนาของหุ้นจากรอบที่แล้ว

รูปแบบ:
- รายการหุ้นคัดกรองแล้ว (ไม่เกิน 12 ตัว) ระบุชื่อย่อ, ราคาปัจจุบัน, Sector, และ TA สั้นๆ 2-3 บรรทัด`,
        `วิเคราะห์รอบ: ${currentSlot} วันที่ ${dateStr}
🟢🟢 g2s: ${g2sStr}
🟢 g1s: ${g1sStr}
🟢 g3s: ${g3sStr}
--- Volume Spike ---
${volumeSpikes}
--- Memory Layer ---
${memoryContext}`,
        (chunk)=>setOutput(p=>({...p,chayakorn:chunk}))
      );
      setStatus(p=>({...p,chayakorn:"done",watsaran:"running"}));
      
      const a1symbols = tokenSave ? extractSymbols(a1).join(", ") : null;
      
      // Agent 2: วศรัญ
      const a2 = await callAI(
        `คุณคือ "วศรัญ" นักวิเคราะห์ประเด็นข่าวและปัจจัยสนับสนุน (Catalyst Analyst) หุ้นไทย ตอบภาษาไทย
วิเคราะห์ข่าวและตัวเร่งราคา (Catalyst) หุ้นที่เลือกโดยชยกร:
- ประเมินผลกระทบเป็น 3 ระดับ: 🔴 สูง, 🟡 กลาง, ⚪ ต่ำ
รูปแบบ:
1. **[SYMBOL]** [🔴/🟡/⚪] — [ประเด็นข่าวตัวเร่ง 1-2 บรรทัด]`,
        `ผลคัดกรองชยกร:\n${a1}\n--- ข่าวสารประจำวัน ---\n${marketNews}`,
        (chunk)=>setOutput(p=>({...p,watsaran:chunk}))
      );
      setStatus(p=>({...p,watsaran:"done",boss:"running"}));
      
      // Agent 3: บอส ฒ
      const a3 = await callAI(
        `คุณคือ "บอส ฒ" ผู้ฟันธงและจัดการความเสี่ยง ตอบภาษาไทยและใช้ Markdown
เลือกหุ้นเด่นที่สุด TOP 3 ตัว กำหนดแนวรับ/ราคาซื้อ (Entry), เป้าหมาย (Target), Stop Loss
คำนวณ Position Sizing ตามข้อมูล:
- ขนาดพอร์ต: ${portfolioSize.toLocaleString()} บาท
- ความเสี่ยงที่ตั้งไว้: ${riskProfile === "low" ? "ต่ำ (เสี่ยง 1.5% ต่อไม้)" : riskProfile === "medium" ? "ปานกลาง (เสี่ยง 4% ต่อไม้)" : "สูง (เสี่ยง 7% ต่อไม้)"}

สูตรคำนวณ Position Sizing:
- จำนวนเงินความเสี่ยงต่อพอร์ต = ขนาดพอร์ต * %ความเสี่ยง
- จำนวนหุ้นที่จะซื้อ = จำนวนเงินความเสี่ยง / (ราคา Entry - ราคา Stop Loss)
- เงินลงทุนในไม้นั้น = จำนวนหุ้นที่จะซื้อ * ราคา Entry (คุมไม่ให้เกิน 15% ของพอร์ตเพื่อกระจายความเสี่ยง)`,
        tokenSave
          ? `หุ้น: ${a1symbols}\nวศรัญ:\n${a2}`
          : `ชยกร:\n${a1}\nวศรัญ:\n${a2}`,
        (chunk)=>setOutput(p=>({...p,boss:chunk}))
      );
      setStatus(p=>({...p,boss:"done"}));
      setDone(true);
      
      saveHistory(dateStr, a3);
      setHistory(loadHistory());
      
      if(ghToken.trim()){
        setGistStatus("saving");
        try{
          await saveToGist(gistId, ghToken, {
            updated: new Date().toISOString(),
            date: dateStr,
            slot: currentSlot,
            provider,
            chayakorn: a1,
            watsaran:  a2,
            boss:      a3,
          });
          setGistStatus("saved");
          addLog("✓ อัปโหลดผลขึ้น Gist เรียบร้อย", "success");
        }catch(e){
          setGistStatus("error: "+e.message);
        }
      }
    } catch(e) {
      setError("⚠️ เกิดข้อผิดพลาด: "+e.message);
      setStatus(p=>({
        chayakorn: p.chayakorn==="running"?"done":p.chayakorn,
        watsaran: p.watsaran ==="running"?"done":p.watsaran,
        boss: p.boss ==="running"?"done":p.boss,
      }));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ color: "#fff", padding: 20 }}>
      {/* Component UI rendered locally */}
      <h2>🤖 UI Loaded. View in Browser.</h2>
    </div>
  );
}
