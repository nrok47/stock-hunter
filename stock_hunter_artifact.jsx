import { useState } from "react";

// ---- CONFIG ----
const API        = "https://api.anthropic.com/v1/messages";
const MODEL_FAST = "claude-haiku-4-5-20251001";   // A1, A2 — เร็ว ประหยัด
const MODEL_BEST = "claude-sonnet-4-6";            // A3 boss — ฉลาดกว่า

const AGENTS = {
  chayakorn: { name:"ชยกร",  role:"นักคัดกรองหุ้น (TA + Watchlist)", emoji:"🔍", color:"#00d4ff", bg:"rgba(0,212,255,0.05)",  border:"rgba(0,212,255,0.25)" },
  watsaran:  { name:"วศรัญ", role:"นักวิเคราะห์ข่าว (Catalyst & News)", emoji:"📰", color:"#f59e0b", bg:"rgba(245,158,11,0.05)", border:"rgba(245,158,11,0.25)" },
  boss:      { name:"บอส ฒ", role:"ผู้ฟันธง & จัดการความเสี่ยง", emoji:"⚡", color:"#ff4d6d", bg:"rgba(255,77,109,0.05)", border:"rgba(255,77,109,0.25)" },
};

const DEFAULT_WATCHLIST = [
  { s:"TKN",    p:4.22,  cat:"G2S", note:"ยอดขายดีจากนักท่องเที่ยว", on:true },
  { s:"SYNTEC", p:1.68,  cat:"G2S", note:"Backlog หนาแน่น PE ต่ำกว่ากลุ่ม", on:true },
  { s:"AEONTS", p:95.25, cat:"G1S", note:"แนวโน้มตั้งสำรองลดลง กำไรฟื้น", on:true },
  { s:"FSMART", p:7.70,  cat:"G2S", note:"ตู้เต่าบินขยายต่างประเทศ", on:true },
  { s:"MINT",   p:22.90, cat:"G2S", note:"ไฮซีซั่นโรงแรมยุโรป", on:true },
];

// ---- API CALL ----
async function callClaude(system, user, maxTok=700, model=MODEL_FAST) {
  try {
    const r = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model, max_tokens: maxTok,
        system,
        messages: [{ role:"user", content: user }],
      }),
    });
    if (!r.ok) {
      const e = await r.json().catch(()=>({}));
      throw new Error(e.error?.message || "HTTP "+r.status);
    }
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    return (d.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("").trim()
      || "⚠️ ไม่มีผลลัพธ์";
  } catch(e) {
    return "⚠️ Error: " + e.message;
  }
}

// ---- STYLES ----
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&family=Noto+Sans+Thai:wght@300;400;600;700&family=Share+Tech+Mono&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#030712;color:#f3f4f6;font-family:'Outfit','Noto Sans Thai',sans-serif;min-height:100vh;
    background-image:radial-gradient(ellipse at 10% 10%,rgba(29,78,216,.15),transparent 50%),
    radial-gradient(ellipse at 90% 90%,rgba(112,26,117,.15),transparent 50%);background-attachment:fixed}
  @keyframes scanline{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
  @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
  @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:rgba(0,0,0,.2)}
  ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);border-radius:4px}
  .card{background:rgba(17,24,39,.6);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.05);border-radius:16px;padding:20px;margin-bottom:16px;animation:fadeIn .4s ease;box-shadow:0 10px 30px rgba(0,0,0,.5)}
  .label{display:block;color:rgba(255,255,255,.5);font-size:11px;font-family:'Share Tech Mono',monospace;font-weight:600;margin-bottom:5px;letter-spacing:1px;text-transform:uppercase}
  .field{width:100%;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:9px 12px;color:#f3f4f6;font-size:13px;outline:none;font-family:inherit;transition:border-color .3s}
  .field:focus{border-color:#00d4ff}
  .btn{padding:10px 20px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;transition:all .2s;border:1px solid transparent;font-family:inherit}
  .btn-primary{background:linear-gradient(135deg,#00b4ff,#0077ff);color:#fff;box-shadow:0 4px 14px rgba(0,180,255,.3)}
  .btn-secondary{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.12);color:#f3f4f6}
  .btn:hover{filter:brightness(1.15);transform:translateY(-1px)}
  .btn:disabled{opacity:.5;cursor:not-allowed;transform:none;filter:none}
  .tab-nav{display:flex;gap:8px;margin-bottom:20px;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:10px;overflow-x:auto}
  .tab-btn{background:transparent;border:none;color:rgba(255,255,255,.4);padding:8px 16px;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;transition:all .3s;white-space:nowrap;font-family:inherit}
  .tab-btn.active{background:rgba(255,255,255,.05);color:#fff;border:1px solid rgba(255,255,255,.1)}
  .dots span{display:inline-block;width:6px;height:6px;border-radius:50%;margin:0 2px;animation:bounce .8s ease-in-out infinite}
  .spinner{width:14px;height:14px;border:2px solid rgba(255,255,255,.2);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;display:inline-block}
`;

// ---- COMPONENTS ----
function Dots({ color }) {
  return <span className="dots">
    {[0,1,2].map(i=><span key={i} style={{background:color,animationDelay:`${i*.15}s`}}/>)}
  </span>;
}

function AgentCard({ ag, status, output, step, onCopy, copied }) {
  const isRun = status==="running", isDone = status==="done", isPend = status==="pending";
  return (
    <div style={{background:ag.bg,borderRadius:16,padding:"18px 22px",marginBottom:14,
      border:`1px solid ${isDone||isRun?ag.border:"rgba(255,255,255,.05)"}`,
      opacity:isPend?.4:1,transition:"all .4s",position:"relative",overflow:"hidden"}}>
      {isRun&&<div style={{position:"absolute",top:0,left:0,right:0,height:2,
        background:`linear-gradient(90deg,transparent,${ag.color},transparent)`,
        animation:"scanline 1.5s linear infinite"}}/>}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:output?12:0}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,borderRadius:"50%",background:`${ag.color}15`,
            border:`1.5px solid ${ag.color}`,display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:16,boxShadow:isDone||isRun?`0 0 10px ${ag.color}33`:"none"}}>{ag.emoji}</div>
          <div>
            <div style={{color:ag.color,fontWeight:700,fontSize:14}}>Agent {step}: {ag.name}</div>
            <div style={{color:"rgba(255,255,255,.35)",fontSize:11,fontFamily:"monospace"}}>{ag.role}</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {isDone&&onCopy&&<button onClick={onCopy} className="btn" style={{
            background:copied?"rgba(74,222,128,.1)":"rgba(255,255,255,.04)",
            borderColor:copied?"rgba(74,222,128,.3)":"rgba(255,255,255,.1)",
            color:copied?"#4ade80":"rgba(255,255,255,.5)",padding:"3px 10px",fontSize:11}}>
            {copied?"✓ copied":"copy"}
          </button>}
          {isRun&&<Dots color={ag.color}/>}
          {isDone&&<span style={{color:"#4ade80",fontSize:16,fontWeight:"bold"}}>✓</span>}
          {isPend&&<span style={{color:"rgba(255,255,255,.15)"}}>○</span>}
        </div>
      </div>
      {output&&<div style={{background:"rgba(0,0,0,.3)",borderRadius:10,padding:14,
        fontSize:13.5,lineHeight:1.8,color:"rgba(255,255,255,.9)",whiteSpace:"pre-wrap",
        border:"1px solid rgba(255,255,255,.03)"}}>
        {output}
      </div>}
    </div>
  );
}

// ---- MAIN APP ----
export default function App() {
  const today = new Date().toLocaleDateString("th-TH",{day:"numeric",month:"long",year:"numeric"});
  const [tab, setTab]             = useState("dashboard");
  const [watchlist, setWatchlist] = useState(DEFAULT_WATCHLIST);
  const [dateStr, setDateStr]     = useState(today);
  const [volSpikes, setVolSpikes] = useState("");
  const [news, setNews]           = useState("");
  const [portSize, setPortSize]   = useState(1000000);
  const [risk, setRisk]           = useState("medium");
  const [newSym, setNewSym]       = useState("");
  const [newPri, setNewPri]       = useState("");
  const [newCat, setNewCat]       = useState("G2S");
  const [newNote,setNewNote]      = useState("");

  const [status, setStatus] = useState({chayakorn:"pending",watsaran:"pending",boss:"pending"});
  const [output, setOutput] = useState({chayakorn:"",watsaran:"",boss:""});
  const [running, setRunning] = useState(false);
  const [done, setDone]       = useState(false);
  const [error, setError]     = useState("");
  const [copied, setCopied]   = useState(false);
  const [history, setHistory] = useState([]);

  const active = watchlist.filter(s=>s.on);

  async function runAnalysis() {
    if (running) return;
    if (active.length === 0) { setError("ยังไม่มีหุ้นที่เปิดใน Watchlist"); return; }
    setError(""); setRunning(true); setDone(false); setCopied(false);
    setOutput({chayakorn:"",watsaran:"",boss:""});
    setStatus({chayakorn:"running",watsaran:"pending",boss:"pending"});

    const g2s = active.filter(s=>s.cat==="G2S").map(s=>`${s.s} ฿${s.p} (${s.note||"-"})`).join(", ")||"-";
    const g1s = active.filter(s=>s.cat==="G1S").map(s=>`${s.s} ฿${s.p} (${s.note||"-"})`).join(", ")||"-";
    const g3s = active.filter(s=>s.cat==="G3S").map(s=>`${s.s} ฿${s.p} (${s.note||"-"})`).join(", ")||"-";
    const slot = new Date().getHours()<12?"รอบเช้า (ก่อนเปิดตลาด)":"รอบเย็น (หลังปิดตลาด)";
    const riskLabel = risk==="low"?"ต่ำ 1.5%":risk==="medium"?"ปานกลาง 4%":"สูง 7%";

    // Agent 1: ชยกร
    const a1 = await callClaude(
      `คุณคือ "ชยกร" นักคัดกรองหุ้น SET ตอบภาษาไทย ใช้ Markdown จัดหน้า
วิเคราะห์หุ้นแบบ Heikin Ashi และ Volume Spike คัดไว้ไม่เกิน 8 ตัว
ต่อแต่ละตัวระบุ: ชื่อย่อ, ราคา, แนวโน้ม TA สั้น 1-2 บรรทัด, แนวรับ/แนวต้านคร่าวๆ`,
      `รอบ: ${slot} วันที่ ${dateStr}
g2s (HA เขียว 2+ แท่ง): ${g2s}
g1s (HA เขียวแท่งแรก): ${g1s}
g3s (เฝ้าระวัง): ${g3s}
Volume Spike: ${volSpikes||"ไม่มีข้อมูล"}`,
      800, MODEL_FAST
    );
    setOutput(p=>({...p,chayakorn:a1}));
    setStatus(p=>({...p,chayakorn:"done",watsaran:"running"}));

    // Agent 2: วศรัญ
    const a2 = await callClaude(
      `คุณคือ "วศรัญ" นักวิเคราะห์ Catalyst & News ตอบภาษาไทย
ประเมินข่าวและปัจจัยเร่งราคาของหุ้นที่ชยกรคัดมา
จัดระดับ 🔴สูง / 🟡กลาง / ⚪ต่ำ ต่อแต่ละตัว สรุปสั้น 1 บรรทัด`,
      `ผลชยกร:\n${a1}\n\nข่าว Catalyst วันนี้:\n${news||"ไม่มีประเด็นพิเศษ"}`,
      700, MODEL_FAST
    );
    setOutput(p=>({...p,watsaran:a2}));
    setStatus(p=>({...p,watsaran:"done",boss:"running"}));

    // Agent 3: บอส ฒ
    const a3 = await callClaude(
      `คุณคือ "บอส ฒ" ผู้ฟันธงและจัดการความเสี่ยง ตอบภาษาไทย ใช้ Markdown
เลือก TOP 3 หุ้น กำหนด Entry / Target / Stop Loss และคำนวณ Position Sizing
พอร์ต ${portSize.toLocaleString()} บาท ความเสี่ยง ${riskLabel} ต่อไม้

สูตร Position:
- Risk Amount = พอร์ต × %risk
- Risk/Share = Entry − Stop
- จำนวนหุ้น = Risk Amount ÷ Risk/Share
- เงินลงทุน = จำนวนหุ้น × Entry (cap 15% ของพอร์ต)

Format ต่อหุ้น:
## 🥇 N | SYMBOL @ Entry
- เหตุผล: (TA + Catalyst 1 บรรทัด)
- Target: X.XX | Stop: X.XX
- ความเชื่อมั่น: ⭐⭐⭐
- ลงทุน: X,XXX บาท (~X,XXX หุ้น) | ความเสี่ยง: X%`,
      `ชยกร:\n${a1}\n\nวศรัญ:\n${a2}`,
      1000, MODEL_BEST
    );
    setOutput(p=>({...p,boss:a3}));
    setStatus(p=>({...p,boss:"done"}));
    setDone(true);
    setRunning(false);
    setHistory(h=>[{dateStr,slot,boss:a3,ts:Date.now()},...h].slice(0,10));
  }

  function addStock(e) {
    e.preventDefault();
    if (!newSym.trim()) return;
    const sym = newSym.trim().toUpperCase();
    if (watchlist.some(s=>s.s===sym)) { alert("มีหุ้นนี้อยู่แล้ว"); return; }
    setWatchlist(w=>[...w,{s:sym,p:parseFloat(newPri)||0,cat:newCat,note:newNote,on:true}]);
    setNewSym(""); setNewPri(""); setNewNote("");
  }

  return (
    <>
      <style>{css}</style>
      <div style={{maxWidth:820,margin:"0 auto",padding:"24px 16px"}}>

        {/* Header */}
        <div className="card" style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          background:"rgba(10,25,47,.7)",borderColor:"rgba(0,212,255,.15)"}}>
          <div>
            <div style={{display:"inline-block",background:"rgba(0,212,255,.1)",border:"1px solid rgba(0,212,255,.3)",
              borderRadius:8,padding:"3px 10px",fontSize:10,color:"#00d4ff",fontFamily:"'Share Tech Mono',monospace",
              letterSpacing:1.5,marginBottom:6}}>STOCK HUNTER CONTROL CENTER</div>
            <h1 style={{fontSize:22,fontWeight:700}}>🤖 3-Agent Stock Hunter</h1>
          </div>
          <div style={{textAlign:"right",fontSize:10,color:"rgba(255,255,255,.3)",fontFamily:"monospace"}}>
            {dateStr}
          </div>
        </div>

        {/* Tabs */}
        <div className="tab-nav">
          {[["dashboard","💻 วิเคราะห์"],["watchlist","📈 Watchlist"],["inputs","📰 ข้อมูล"],["settings","⚙️ ตั้งค่า"],["history","🕐 ประวัติ"]].map(([id,label])=>(
            <button key={id} className={`tab-btn${tab===id?" active":""}`} onClick={()=>setTab(id)}>{label}</button>
          ))}
        </div>

        {error&&<div style={{background:"rgba(255,77,77,.08)",border:"1px solid rgba(255,77,77,.3)",
          borderRadius:10,padding:"12px 16px",marginBottom:16,color:"#ff7777",fontSize:13}}>⚠️ {error}</div>}

        {/* ── DASHBOARD ── */}
        {tab==="dashboard"&&<div>
          <div className="card" style={{textAlign:"center",padding:"24px 20px"}}>
            <p style={{color:"rgba(255,255,255,.6)",fontSize:13,marginBottom:16}}>
              3 Agents: นักคัดกรอง 🔍 → นักวิเคราะห์ข่าว 📰 → ผู้ฟันธง ⚡<br/>
              วิเคราะห์เฉพาะหุ้นที่เปิดใน Watchlist ({active.length} ตัว)
            </p>
            <button className="btn btn-primary" onClick={runAnalysis} disabled={running}
              style={{fontSize:14,padding:"12px 36px"}}>
              {running?<><span className="spinner" style={{marginRight:8}}/>กำลังวิเคราะห์...</>
               :done?"🔁 วิเคราะห์ใหม่":"🚀 เริ่มวิเคราะห์ 3 Agents"}
            </button>
            {running&&<div style={{marginTop:14,display:"flex",justifyContent:"center",gap:20,fontSize:11,fontFamily:"monospace"}}>
              {Object.entries(status).map(([k,s])=>{
                const ag=AGENTS[k];
                return <span key={k} style={{color:s==="running"?ag.color:s==="done"?"#4ade80":"#555"}}>
                  {ag.name}: {s==="running"?"กำลังรัน...":s==="done"?"✓ เสร็จ":"รอคิว"}
                </span>;
              })}
            </div>}
          </div>
          <AgentCard ag={AGENTS.chayakorn} status={status.chayakorn} output={output.chayakorn} step={1}/>
          <AgentCard ag={AGENTS.watsaran}  status={status.watsaran}  output={output.watsaran}  step={2}/>
          <AgentCard ag={AGENTS.boss} status={status.boss} output={output.boss} step={3}
            onCopy={()=>{navigator.clipboard.writeText(output.boss).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000)})}}
            copied={copied}/>
          {done&&<div style={{textAlign:"center",fontSize:11,color:"rgba(255,255,255,.2)",padding:10}}>
            ⚠️ เพื่อการศึกษาเท่านั้น ไม่ใช่คำแนะนำการลงทุน
          </div>}
        </div>}

        {/* ── WATCHLIST ── */}
        {tab==="watchlist"&&<div>
          <div className="card">
            <h3 style={{fontSize:15,fontWeight:700,marginBottom:12}}>➕ เพิ่มหุ้น</h3>
            <form onSubmit={addStock} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10,alignItems:"end"}}>
              <div><span className="label">Symbol</span>
                <input value={newSym} onChange={e=>setNewSym(e.target.value)} className="field" placeholder="เช่น TKN" style={{textTransform:"uppercase"}} required/></div>
              <div><span className="label">ราคา (฿)</span>
                <input type="number" step="0.01" value={newPri} onChange={e=>setNewPri(e.target.value)} className="field" placeholder="0.00"/></div>
              <div><span className="label">กลุ่ม</span>
                <select value={newCat} onChange={e=>setNewCat(e.target.value)} className="field" style={{background:"#050a14"}}>
                  <option value="G2S">G2S (HA เขียว 2+)</option>
                  <option value="G1S">G1S (HA เขียว 1)</option>
                  <option value="G3S">G3S (เฝ้าระวัง)</option>
                </select></div>
              <div><button type="submit" className="btn btn-primary" style={{width:"100%"}}>เพิ่ม</button></div>
            </form>
            <div style={{marginTop:10}}>
              <span className="label">โน้ต / ปัจจัยพื้นฐาน</span>
              <input value={newNote} onChange={e=>setNewNote(e.target.value)} className="field" placeholder="สรุปความเห็น..."/>
            </div>
          </div>

          <div className="card" style={{overflowX:"auto"}}>
            <h3 style={{fontSize:15,fontWeight:700,marginBottom:12}}>📋 รายการ ({watchlist.length} ตัว, เปิด {active.length} ตัว)</h3>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:520}}>
              <thead><tr style={{borderBottom:"1px solid rgba(255,255,255,.06)"}}>
                {["เปิด","หุ้น","ราคา","กลุ่ม","โน้ต",""].map(h=>(
                  <th key={h} style={{padding:"6px 10px",fontSize:11,color:"rgba(255,255,255,.4)",textAlign:"left"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{watchlist.map((s,i)=>(
                <tr key={s.s} style={{borderBottom:"1px solid rgba(255,255,255,.04)",background:i%2?"transparent":"rgba(255,255,255,.01)"}}>
                  <td style={{padding:"8px 10px"}}>
                    <input type="checkbox" checked={s.on} onChange={()=>setWatchlist(w=>w.map(x=>x.s===s.s?{...x,on:!x.on}:x))}/>
                  </td>
                  <td style={{padding:"8px 10px",fontWeight:"bold"}}>{s.s}</td>
                  <td style={{padding:"8px 10px"}}>
                    <input type="number" step="0.01" value={s.p} className="field"
                      style={{width:72,padding:"3px 6px"}}
                      onChange={e=>setWatchlist(w=>w.map(x=>x.s===s.s?{...x,p:parseFloat(e.target.value)||0}:x))}/>
                  </td>
                  <td style={{padding:"8px 10px"}}>
                    <select value={s.cat} className="field" style={{width:100,padding:"3px 6px",fontSize:11,background:"#050a14"}}
                      onChange={e=>setWatchlist(w=>w.map(x=>x.s===s.s?{...x,cat:e.target.value}:x))}>
                      <option value="G2S">G2S</option><option value="G1S">G1S</option><option value="G3S">G3S</option>
                    </select>
                  </td>
                  <td style={{padding:"8px 10px"}}>
                    <input value={s.note||""} className="field" style={{padding:"3px 8px"}}
                      onChange={e=>setWatchlist(w=>w.map(x=>x.s===s.s?{...x,note:e.target.value}:x))}
                      placeholder="โน้ต..."/>
                  </td>
                  <td style={{padding:"8px 10px"}}>
                    <button onClick={()=>{if(confirm(`ลบ ${s.s}?`))setWatchlist(w=>w.filter(x=>x.s!==s.s))}}
                      style={{background:"rgba(255,77,109,.1)",border:"1px solid rgba(255,77,109,.25)",color:"#ff4d6d",
                      borderRadius:4,padding:"2px 8px",cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>ลบ</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>}

        {/* ── INPUTS ── */}
        {tab==="inputs"&&<div className="card">
          <h3 style={{fontSize:15,fontWeight:700,marginBottom:14}}>📰 ข้อมูลประกอบการวิเคราะห์</h3>
          <div style={{marginBottom:14}}>
            <span className="label">📅 วันที่วิเคราะห์</span>
            <input value={dateStr} onChange={e=>setDateStr(e.target.value)} className="field"/>
          </div>
          <div style={{marginBottom:14}}>
            <span className="label">🔥 Volume Spikes วันนี้</span>
            <textarea value={volSpikes} onChange={e=>setVolSpikes(e.target.value)} rows={3} className="field"
              placeholder="เช่น TKN (Volume 200% เกินค่าเฉลี่ย), MINT"/>
          </div>
          <div>
            <span className="label">📰 ข่าวเศรษฐกิจ & Catalyst วันนี้</span>
            <textarea value={news} onChange={e=>setNews(e.target.value)} rows={6} className="field"
              placeholder="วาง/พิมพ์ข่าวสำคัญที่นี่ เช่น&#10;- กนง.คงดอกเบี้ย 2.50%&#10;- นักท่องเที่ยวจีนทะลุเป้า"/>
          </div>
        </div>}

        {/* ── SETTINGS ── */}
        {tab==="settings"&&<div className="card">
          <h3 style={{fontSize:15,fontWeight:700,marginBottom:14}}>🛡️ ขนาดพอร์ต & ความเสี่ยง</h3>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
            <div>
              <span className="label">ขนาดพอร์ต (บาท)</span>
              <input type="number" value={portSize} onChange={e=>setPortSize(Number(e.target.value))} className="field"/>
            </div>
            <div>
              <span className="label">ความเสี่ยงต่อไม้</span>
              <select value={risk} onChange={e=>setRisk(e.target.value)} className="field" style={{background:"#050a14"}}>
                <option value="low">ต่ำ (1.5% ต่อไม้)</option>
                <option value="medium">ปานกลาง (4% ต่อไม้)</option>
                <option value="high">สูง (7% ต่อไม้)</option>
              </select>
            </div>
          </div>
          <div style={{background:"rgba(0,212,255,.04)",border:"1px solid rgba(0,212,255,.12)",borderRadius:10,padding:14,fontSize:12,color:"rgba(255,255,255,.5)",lineHeight:1.7}}>
            <div style={{color:"#00d4ff",fontWeight:700,marginBottom:6}}>ℹ️ เกี่ยวกับ AI ที่ใช้</div>
            A1 & A2 ใช้ <strong style={{color:"#4ade80"}}>Claude Haiku</strong> (เร็ว ประหยัด)<br/>
            A3 ใช้ <strong style={{color:"#f59e0b"}}>Claude Sonnet</strong> (ฉลาดกว่า สำหรับฟันธง)<br/>
            ทั้งหมดรันผ่าน claude.ai — ไม่ต้องมี API Key
          </div>
        </div>}

        {/* ── HISTORY ── */}
        {tab==="history"&&<div className="card">
          <h3 style={{fontSize:15,fontWeight:700,marginBottom:14}}>🕐 ประวัติวิเคราะห์ (session นี้)</h3>
          {history.length===0
            ?<div style={{color:"rgba(255,255,255,.3)",padding:20,textAlign:"center"}}>ยังไม่มีประวัติในรอบนี้</div>
            :history.map(h=>(
              <div key={h.ts} style={{background:"rgba(0,0,0,.2)",border:"1px solid rgba(255,255,255,.05)",
                borderRadius:12,padding:"12px 16px",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{color:"#00d4ff",fontSize:12,fontFamily:"monospace"}}>📅 {h.dateStr} — {h.slot}</span>
                  <button className="btn btn-secondary" style={{padding:"3px 10px",fontSize:11}}
                    onClick={()=>{setOutput(p=>({...p,boss:h.boss}));setStatus({chayakorn:"done",watsaran:"done",boss:"done"});setDone(true);setTab("dashboard")}}>
                    โหลด
                  </button>
                </div>
                <div style={{fontSize:12,whiteSpace:"pre-wrap",color:"rgba(255,255,255,.7)",lineHeight:1.6,maxHeight:120,overflowY:"auto"}}>{h.boss}</div>
              </div>
            ))
          }
        </div>}

        {/* Dev Notes */}
        <div style={{marginTop:28,borderTop:"1px solid rgba(255,255,255,.05)",paddingTop:20}}>
          <div style={{fontSize:10,fontFamily:"'Share Tech Mono',monospace",color:"rgba(255,255,255,.15)",letterSpacing:2,marginBottom:12}}>
            // 3-Agent Stock Hunter — Artifact Edition v0.5
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,fontSize:11}}>
            <div style={{background:"rgba(74,222,128,.03)",border:"1px solid rgba(74,222,128,.1)",borderRadius:10,padding:12}}>
              <div style={{color:"#4ade80",fontWeight:700,marginBottom:8}}>✓ Features</div>
              {["Watchlist G1S/G2S/G3S + โน้ต","Volume Spikes & ข่าว Catalyst","Position Sizing Calculator","A3 รับ full A1+A2 (ไม่ตัด)","History (session)","Haiku A1/A2 + Sonnet A3"].map(t=>(
                <div key={t} style={{color:"rgba(255,255,255,.4)",marginBottom:4,paddingLeft:8,borderLeft:"2px solid rgba(74,222,128,.2)"}}>{t}</div>
              ))}
            </div>
            <div style={{background:"rgba(0,212,255,.03)",border:"1px solid rgba(0,212,255,.1)",borderRadius:10,padding:12}}>
              <div style={{color:"#00d4ff",fontWeight:700,marginBottom:8}}>◎ แผนถัดไป</div>
              {["Export ผล → LINE message","Portfolio tracker entry จริง","Price alert (Target/Stop)","Chart mini preview","Hoonstation import (ถ้า CORS ผ่าน)"].map(t=>(
                <div key={t} style={{color:"rgba(255,255,255,.35)",marginBottom:4,paddingLeft:8,borderLeft:"2px solid rgba(0,212,255,.15)"}}>{t}</div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
