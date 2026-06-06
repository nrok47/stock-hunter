import { useState } from "react";

const API   = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

const AGENTS = {
  chayakorn: { name:"ชยกร",  role:"นักคัดกรองหุ้น",   emoji:"🔍", color:"#00d4ff", bg:"rgba(0,212,255,0.08)",  border:"rgba(0,212,255,0.3)"  },
  watsaran:  { name:"วศรัญ", role:"นักวิเคราะห์ข่าว", emoji:"📰", color:"#f59e0b", bg:"rgba(245,158,11,0.08)", border:"rgba(245,158,11,0.3)"  },
  boss:      { name:"บอส ฒ", role:"ผู้ฟันธง",          emoji:"⚡", color:"#ff4d6d", bg:"rgba(255,77,109,0.08)", border:"rgba(255,77,109,0.3)"  },
};

// ── hoonstation.com/top_hagreen — 5 มิ.ย. 2569 ──────────────────────────────
const HOON_DATE = "5 มิ.ย. 2569";
const G1S = [
  {s:"TKN", p:4.22},
];
const G2S = [
  {s:"SYNTEC",p:1.68},{s:"AEONTS",p:95.25},{s:"FSMART",p:7.70},
  {s:"I2",   p:0.80},{s:"PRG",   p:9.15}, {s:"MINT",  p:22.90},
  {s:"PORT", p:0.60},
];
const G3S = [
  {s:"PPP",    p:0.97},{s:"BM",     p:1.05},{s:"CGH",    p:0.55},
  {s:"FPT",    p:6.55},{s:"ROCTEC", p:0.71},{s:"CHG",    p:1.43},
  {s:"VRANDA", p:4.46},{s:"PIN",    p:4.42},{s:"M",      p:21.70},
  {s:"GCAP",   p:0.28},{s:"PR9",    p:16.60},{s:"DUSIT",  p:10.30},
  {s:"GC",     p:4.52},{s:"WIN",    p:0.28},{s:"TMILL",  p:2.34},
  {s:"JAK",    p:0.75},{s:"XPG",    p:0.48},{s:"FORTH",  p:16.20},
  {s:"SA",     p:7.20},{s:"KUMWEL", p:1.98},{s:"KBSPIF", p:9.30},
  {s:"ASP",    p:2.18},{s:"WHABT",  p:5.85},{s:"QHOP",   p:3.26},
  {s:"BCH",    p:9.50},{s:"EP",     p:1.07},{s:"SCC",    p:234.00},
  {s:"MK",     p:0.53},{s:"SE-ED",  p:1.70},{s:"TIPH",   p:21.50},
  {s:"MRDIYT", p:9.05},{s:"ITC",    p:16.20},{s:"SAPPE",  p:30.00},
  {s:"GPI",    p:1.72},{s:"MATCH",  p:0.97},{s:"AKP",    p:0.73},
  {s:"INETREIT",p:12.50},{s:"MTC",  p:29.00},{s:"AHC",   p:12.80},
  {s:"BTS",    p:2.06},{s:"LHHOTEL",p:13.00},{s:"CAZ",   p:1.57},
  {s:"NEO",    p:17.10},{s:"MSC",   p:5.80},{s:"SPALI",  p:15.60},
  {s:"MAJOR",  p:6.85},{s:"SYNEX",  p:9.25},{s:"TNH",    p:30.00},
  {s:"AXTRART",p:12.90},{s:"FSX",   p:1.16},{s:"MCS",    p:7.50},
  {s:"VIH",    p:8.25},{s:"SST",    p:1.02},{s:"SISB",   p:9.90},
  {s:"NV",     p:0.50},{s:"GFPT",   p:8.65},{s:"ASTR",   p:5.00},
  {s:"PRIN",   p:1.38},{s:"SEAOIL", p:3.16},{s:"WACOAL", p:16.40},
  {s:"AMA",    p:3.86},
];

async function claude(system, user, maxTok=800) {
  try {
    const r = await fetch(API, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ model:MODEL, max_tokens:maxTok, system,
        messages:[{role:"user",content:user}] }),
    });
    if (!r.ok) throw new Error("HTTP "+r.status);
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    return (d.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("").trim();
  } catch(e) { return "⚠️ Error: "+e.message; }
}

function Dots({color}){
  return <div style={{display:"flex",gap:4}}>
    {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:color,
      animation:`bounce 0.8s ease-in-out ${i*0.15}s infinite`}}/>)}
  </div>;
}

function AgentCard({ag,status,output,step}){
  const isRun=status==="running",isDone=status==="done",isPend=status==="pending";
  return(
    <div style={{background:ag.bg,borderRadius:16,padding:"18px 22px",marginBottom:14,
      border:`1px solid ${isDone||isRun?ag.border:"rgba(255,255,255,0.07)"}`,
      opacity:isPend?0.4:1,transition:"all 0.4s",position:"relative",overflow:"hidden"}}>
      {isRun&&<div style={{position:"absolute",top:0,left:0,right:0,height:2,
        background:`linear-gradient(90deg,transparent,${ag.color},transparent)`,
        animation:"scanline 1.5s linear infinite"}}/>}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:output?10:0}}>
        <div style={{width:40,height:40,borderRadius:"50%",background:`${ag.color}22`,
          border:`1.5px solid ${ag.color}`,display:"flex",alignItems:"center",
          justifyContent:"center",fontSize:18,
          boxShadow:isDone||isRun?`0 0 10px ${ag.color}55`:"none"}}>{ag.emoji}</div>
        <div>
          <div style={{color:ag.color,fontFamily:"'Noto Sans Thai',sans-serif",fontWeight:700,fontSize:14}}>
            Agent {step}: {ag.name}</div>
          <div style={{color:"rgba(255,255,255,0.35)",fontSize:11,fontFamily:"monospace"}}>{ag.role}</div>
        </div>
        <div style={{marginLeft:"auto"}}>
          {isRun&&<Dots color={ag.color}/>}
          {isDone&&<span style={{color:"#4ade80",fontSize:18}}>✓</span>}
          {isPend&&<span style={{color:"rgba(255,255,255,0.15)",fontSize:16}}>○</span>}
        </div>
      </div>
      {output&&<div style={{background:"rgba(0,0,0,0.35)",borderRadius:10,padding:"12px 14px",
        fontFamily:"'Noto Sans Thai','Sarabun',sans-serif",fontSize:13.5,lineHeight:1.85,
        color:"rgba(255,255,255,0.88)",whiteSpace:"pre-wrap",maxHeight:260,overflowY:"auto"}}>
        {output}</div>}
    </div>
  );
}

function Pill({s,color}){
  return <span title={`฿${s.p}`} style={{
    background:`${color}10`,border:`1px solid ${color}28`,color,
    borderRadius:5,padding:"1px 6px",fontSize:10,fontFamily:"monospace",fontWeight:600}}>
    {s.s}
  </span>;
}

export default function App(){
  const [status, setStatus] = useState({chayakorn:"pending",watsaran:"pending",boss:"pending"});
  const [output, setOutput] = useState({chayakorn:"",watsaran:"",boss:""});
  const [running,setRunning]= useState(false);
  const [done,   setDone]   = useState(false);
  const today = new Date().toLocaleDateString("th-TH",{day:"numeric",month:"long",year:"numeric"});

  const total = G1S.length + G2S.length + G3S.length;
  const g1sStr = G1S.map(s=>`${s.s} ฿${s.p}`).join(", ");
  const g2sStr = G2S.map(s=>`${s.s} ฿${s.p}`).join(", ");
  const g3sStr = G3S.map(s=>`${s.s} ฿${s.p}`).join(", ");

  async function run(){
    if(running) return;
    setRunning(true); setDone(false);
    setOutput({chayakorn:"",watsaran:"",boss:""});
    setStatus({chayakorn:"pending",watsaran:"pending",boss:"pending"});

    setStatus(p=>({...p,chayakorn:"running"}));
    const a1 = await claude(
      `คุณคือ "ชยกร" คัดกรองหุ้น SET ตอบภาษาไทย
แบ่งเป็น 2 กลุ่มตามข้อมูลที่ให้:
### 🟢🟢 g2s — HA เขียว 2 แท่ง (สัญญาณแรงกว่า) | X ตัว
- **SYMBOL** ราคา฿ ~MCAPMillion — sector (เหตุผลสั้น)
### 🟢 g1s — HA เขียวแท่งแรก (สัญญาณเริ่มต้น) | X ตัว
- **SYMBOL** ราคา฿ ~MCAPMillion — sector
คัดเฉพาะ market cap 2,000–50,000M ประเมินจากความรู้ รวมไม่เกิน 12 ตัว`,
      `ข้อมูล hoonstation.com/top_hagreen วันที่ ${HOON_DATE}\n\ng1s (เขียวแท่งเดียว/อื่นๆ): ${g1sStr}\ng2s (เขียว 2 แท่ง): ${g2sStr}\ng3s (เขียวแท่งแรก): ${g3sStr}`
    );
    setOutput(p=>({...p,chayakorn:a1}));
    setStatus(p=>({...p,chayakorn:"done",watsaran:"running"}));

    const a2 = await claude(
      `คุณคือ "วศรัญ" วิเคราะห์ catalyst หุ้นไทย ตอบภาษาไทย
รูปแบบ:
1. **SYMBOL** 🔴สูง/🟡กลาง/⚪ต่ำ — [catalyst สั้นๆ 1 บรรทัด]
เฉพาะตัวที่ชยกรเลือก เรียงจาก impact มากไปน้อย`,
      `ผล ชยกร:\n${a1}`
    );
    setOutput(p=>({...p,watsaran:a2}));
    setStatus(p=>({...p,watsaran:"done",boss:"running"}));

    const a3 = await claude(
      `คุณคือ "บอส ฒ" ฟันธงหุ้น ตอบภาษาไทย
รูปแบบ:
## 🥇 อันดับ N | SYMBOL @ ราคา฿
**เหตุผล:** [TA + catalyst 1 บรรทัด]
**เป้าหมาย:** X฿
**Stop Loss:** X฿
**ความเชื่อมั่น:** ⭐⭐⭐/⭐⭐/⭐
---
TOP 3 เท่านั้น โอกาสวิ่ง 1–2 สัปดาห์`,
      `ชยกร:\n${a1}\nวศรัญ:\n${a2}`
    );
    setOutput(p=>({...p,boss:a3}));
    setStatus(p=>({...p,boss:"done"}));
    setRunning(false); setDone(true);
  }

  return(
    <div style={{minHeight:"100vh",background:"#050a14",
      backgroundImage:"radial-gradient(ellipse at 20% 20%,#0d1f3c,transparent 60%),radial-gradient(ellipse at 80% 80%,#1a0a1f,transparent 60%)",
      fontFamily:"'Noto Sans Thai','Sarabun',sans-serif",padding:"24px 18px"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;600;700&family=Share+Tech+Mono&display=swap');
        @keyframes scanline{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
        @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15);border-radius:4px}
      `}</style>

      <div style={{textAlign:"center",marginBottom:20}}>
        <div style={{display:"inline-block",background:"rgba(255,255,255,0.04)",
          border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:"3px 12px",
          fontSize:10,color:"rgba(255,255,255,0.35)",fontFamily:"'Share Tech Mono',monospace",
          marginBottom:8,letterSpacing:2}}>SET · {today}</div>
        <h1 style={{margin:0,fontSize:24,fontWeight:700,color:"#fff"}}>🤖 3-Agent Stock Hunter</h1>
      </div>

      {/* Source */}
      <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",
        borderRadius:14,padding:"14px 16px",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:10}}>
          <span style={{background:"rgba(0,212,255,0.1)",border:"1px solid rgba(0,212,255,0.2)",
            color:"#00d4ff",borderRadius:6,padding:"2px 9px",fontSize:11,fontFamily:"monospace"}}>
            hoonstation.com/top_hagreen</span>
          <span style={{fontSize:11,color:"#4ade80",fontFamily:"monospace"}}>
            ✓ {HOON_DATE} · {total} ตัว</span>
          <span style={{fontSize:11,color:"rgba(245,158,11,0.8)",fontFamily:"monospace"}}>
            MCap 2,000–50,000M</span>
        </div>
        {G1S.length>0&&<div style={{marginBottom:5}}>
          <span style={{fontSize:10,color:"rgba(255,255,255,0.4)",fontFamily:"monospace",marginRight:4}}>g1s ({G1S.length}):</span>
          {G1S.map(s=><Pill key={s.s} s={s} color="#a78bfa"/>)}
        </div>}
        <div style={{marginBottom:5}}>
          <span style={{fontSize:10,color:"rgba(0,212,255,0.6)",fontFamily:"monospace",marginRight:4}}>🟢🟢 g2s ({G2S.length}):</span>
          <span style={{display:"inline-flex",flexWrap:"wrap",gap:2}}>
            {G2S.map(s=><Pill key={s.s} s={s} color="#00d4ff"/>)}
          </span>
        </div>
        <div>
          <span style={{fontSize:10,color:"rgba(74,222,128,0.6)",fontFamily:"monospace",marginRight:4}}>🟢 g3s ({G3S.length}):</span>
          <div style={{display:"flex",flexWrap:"wrap",gap:2,marginTop:3,maxHeight:52,overflowY:"auto"}}>
            {G3S.map(s=><Pill key={s.s} s={s} color="#4ade80"/>)}
          </div>
        </div>
      </div>

      <div style={{textAlign:"center",marginBottom:20}}>
        <button onClick={run} disabled={running} style={{
          background:running?"rgba(255,255,255,0.06)"
            :"linear-gradient(135deg,rgba(0,212,255,0.12),rgba(255,77,109,0.12))",
          border:running?"1px solid rgba(255,255,255,0.1)":"1px solid rgba(255,100,130,0.45)",
          borderRadius:12,color:running?"rgba(255,255,255,0.4)":"#fff",
          padding:"12px 32px",fontSize:15,fontFamily:"'Noto Sans Thai',sans-serif",fontWeight:600,
          cursor:running?"not-allowed":"pointer",transition:"all 0.3s"}}>
          {running?"🔄 กำลังวิเคราะห์...":done?"🔁 วิเคราะห์ใหม่":"🚀 วิเคราะห์ 3 Agent"}
        </button>
      </div>

      <AgentCard ag={AGENTS.chayakorn} status={status.chayakorn} output={output.chayakorn} step={1}/>
      <AgentCard ag={AGENTS.watsaran}  status={status.watsaran}  output={output.watsaran}  step={2}/>
      <AgentCard ag={AGENTS.boss}      status={status.boss}      output={output.boss}      step={3}/>

      {done&&<div style={{textAlign:"center",marginTop:6,padding:"8px 14px",
        background:"rgba(255,77,109,0.05)",border:"1px solid rgba(255,77,109,0.12)",
        borderRadius:10,color:"rgba(255,255,255,0.25)",fontSize:11,animation:"fadeIn 0.5s ease"}}>
        ⚠️ วิเคราะห์เบื้องต้นเท่านั้น ไม่ใช่คำแนะนำการลงทุน
      </div>}
    </div>
  );
}
