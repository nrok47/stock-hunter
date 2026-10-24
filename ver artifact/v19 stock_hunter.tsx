import { useState, useEffect, useReducer, useCallback } from "react";

const API        = "https://api.anthropic.com/v1/messages";
const MODEL_FAST = "claude-haiku-4-5-20251001";
const MODEL_BEST = "claude-sonnet-4-6";
const STORAGE_WATCHLIST = "stock_hunter:watchlist";
const STORAGE_SETTINGS  = "stock_hunter:settings";
const FB_URL            = "https://stockhunter-5da7e-default-rtdb.asia-southeast1.firebasedatabase.app";
const API_TIMEOUT_MS    = 30000;
const MAX_HISTORY       = 30;

const AGENTS = {
  chayakorn:{ name:"ชยกร",  role:"นักคัดกรองหุ้น (TA + Watchlist)",   emoji:"🔍", color:"#00d4ff", bg:"rgba(0,212,255,0.05)",  border:"rgba(0,212,255,0.25)" },
  watsaran: { name:"วศรัญ", role:"นักวิเคราะห์ข่าว (Catalyst & News)", emoji:"📰", color:"#f59e0b", bg:"rgba(245,158,11,0.05)", border:"rgba(245,158,11,0.25)" },
  boss:     { name:"บอส ฒ", role:"ผู้ฟันธง & จัดการความเสี่ยง",        emoji:"⚡", color:"#ff4d6d", bg:"rgba(255,77,109,0.05)", border:"rgba(255,77,109,0.25)" },
};
const DEFAULT_SETTINGS = { portSize:1000000, risk:"medium", theme:"dark", weights:{ta:40,vol:20,cat:20,mom:20} };

async function fetchAutoNews(dateStr) {
  const ctrl=new AbortController(), timer=setTimeout(()=>ctrl.abort(),API_TIMEOUT_MS);
  const msgs=[{role:"user",content:`ค้นหาข่าวตลาดหุ้นไทย SET วันที่ ${dateStr} สรุปข่าวสำคัญ 3-5 ข้อ ตอบภาษาไทย`}];
  try {
    for(let i=0;i<5;i++){
      const r=await fetch(API,{method:"POST",signal:ctrl.signal,headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:MODEL_FAST,max_tokens:600,tools:[{"type":"web_search_20250305","name":"web_search"}],messages:msgs})});
      if(!r.ok) return "";
      const d=await r.json(), content=d.content||[];
      const toolUses=content.filter(b=>b.type==="tool_use");
      const texts=content.filter(b=>b.type==="text").map(b=>b.text).join("").trim();
      if(!toolUses.length) return texts;
      msgs.push({role:"assistant",content});
      msgs.push({role:"user",content:toolUses.map(tu=>({type:"tool_result",tool_use_id:tu.id,content:`done: ${tu.input?.query||""}`}))});
    }
    return "";
  } catch(e){return "";} finally{clearTimeout(timer);}
}

async function callClaude(system,user,maxTok=700,model=MODEL_FAST) {
  const ctrl=new AbortController(), timer=setTimeout(()=>ctrl.abort(),API_TIMEOUT_MS);
  try {
    const r=await fetch(API,{method:"POST",signal:ctrl.signal,headers:{"Content-Type":"application/json"},
      body:JSON.stringify({model,max_tokens:maxTok,system,messages:[{role:"user",content:user}]})});
    if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error?.message||"HTTP "+r.status);}
    const d=await r.json();
    if(d.error) throw new Error(d.error.message);
    return (d.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("").trim()||"⚠️ ไม่มีผลลัพธ์";
  } catch(e){if(e.name==="AbortError") throw new Error("timeout 30s"); throw e;}
  finally{clearTimeout(timer);}
}

function computeScores(activeList,volSpikesText,a2Text,weights) {
  const w=weights||DEFAULT_SETTINGS.weights;
  return activeList.map(s=>{
    const rawTA=s.cat==="G2S"?1.0:s.cat==="G1S"?0.7:0.4;
    const rawVol=volSpikesText.toLowerCase().includes(s.s.toLowerCase())?1.0:0.25;
    let rawCat=0.4;
    for(const l of a2Text.split("\n").filter(l=>l.toUpperCase().includes(s.s))){
      if(l.includes("🔴")){rawCat=1.0;break;} if(l.includes("🟡")){rawCat=0.6;break;} if(l.includes("⚪")){rawCat=0.25;break;}
    }
    const rawMom=s.cat==="G2S"?1.0:s.cat==="G1S"?0.6:0.25;
    const scoreTA=Math.round(rawTA*w.ta), scoreVol=Math.round(rawVol*w.vol);
    const scoreCat=Math.round(rawCat*w.cat), scoreMom=Math.round(rawMom*w.mom);
    return {...s,score:scoreTA+scoreVol+scoreCat+scoreMom,scoreTA,scoreVol,scoreCat,scoreMom};
  }).sort((a,b)=>b.score-a.score);
}

async function sGet(k){try{const r=await window.storage.get(k);return r?.value?JSON.parse(r.value):null;}catch{return null;}}
async function sSet(k,v){try{await window.storage.set(k,JSON.stringify(v));}catch(_){}}

function useWatchlist() {
  const [watchlist,setRaw]=useState([
    {s:"TKN",p:4.22,cat:"G2S",note:"ยอดขายดีจากนักท่องเที่ยว",on:true},
    {s:"SYNTEC",p:1.68,cat:"G2S",note:"Backlog หนาแน่น PE ต่ำกว่ากลุ่ม",on:true},
    {s:"AEONTS",p:95.25,cat:"G1S",note:"แนวโน้มตั้งสำรองลดลง กำไรฟื้น",on:true},
    {s:"FSMART",p:7.70,cat:"G2S",note:"ตู้เต่าบินขยายต่างประเทศ",on:true},
    {s:"MINT",p:22.90,cat:"G2S",note:"ไฮซีซั่นโรงแรมยุโรป",on:true},
  ]);
  const [loaded,setLoaded]=useState(false);
  useEffect(()=>{sGet(STORAGE_WATCHLIST).then(v=>{if(v)setRaw(v);setLoaded(true);});},[]);
  const setWatchlist=useCallback((up)=>{
    setRaw(prev=>{const next=typeof up==="function"?up(prev):up;sSet(STORAGE_WATCHLIST,next);return next;});
  },[]);
  return {watchlist,setWatchlist,loaded};
}

function useSettings() {
  const [settings,setRaw]=useState(DEFAULT_SETTINGS);
  useEffect(()=>{sGet(STORAGE_SETTINGS).then(v=>{if(v)setRaw({...DEFAULT_SETTINGS,...v,weights:{...DEFAULT_SETTINGS.weights,...v?.weights}});});},[]);
  const setSettings=useCallback((up)=>{
    setRaw(prev=>{const next=typeof up==="function"?up(prev):up;sSet(STORAGE_SETTINGS,next);return next;});
  },[]);
  return {settings,setSettings};
}

function useHistory() {
  const [history,setRaw]=useState([]);
  const [fbLoaded,setFbLoaded]=useState(false);
  useEffect(()=>{
    fetch(`${FB_URL}/history.json?orderBy="$key"&limitToLast=${MAX_HISTORY}`)
      .then(r=>r.json()).then(data=>{
        if(data&&typeof data==="object") setRaw(Object.values(data).sort((a,b)=>b.ts-a.ts));
        setFbLoaded(true);
      }).catch(()=>setFbLoaded(true));
  },[]);
  const addHistory=useCallback((entry)=>{
    fetch(`${FB_URL}/history/${entry.ts}.json`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(entry)}).catch(()=>{});
    setRaw(prev=>[entry,...prev].slice(0,MAX_HISTORY));
  },[]);
  const clearHistory=useCallback(()=>{fetch(`${FB_URL}/history.json`,{method:"DELETE"}).catch(()=>{});setRaw([]);},[]);
  return {history,addHistory,clearHistory,fbLoaded};
}

const initAnalysis={newsStatus:"idle",newsText:"",status:{chayakorn:"pending",watsaran:"pending",boss:"pending"},output:{chayakorn:"",watsaran:"",boss:""},scores:[],running:false,done:false,error:""};
function aReducer(s,a){
  switch(a.type){
    case "START":     return {...initAnalysis,running:true,newsStatus:"running"};
    case "NEWS_DONE": return {...s,newsStatus:"done",newsText:a.text,status:{...s.status,chayakorn:"running"}};
    case "NEWS_SKIP": return {...s,newsStatus:"skip",status:{...s.status,chayakorn:"running"}};
    case "A1_DONE":   return {...s,output:{...s.output,chayakorn:a.text},status:{...s.status,chayakorn:"done",watsaran:"running"}};
    case "A2_DONE":   return {...s,output:{...s.output,watsaran:a.text},status:{...s.status,watsaran:"done",boss:"running"},scores:a.scores||[]};
    case "A3_DONE":   return {...s,output:{...s.output,boss:a.text},status:{...s.status,boss:"done"},running:false,done:true};
    case "LOAD":      return {...initAnalysis,done:true,newsStatus:"skip",status:{chayakorn:"done",watsaran:"done",boss:"done"},output:a.output,scores:a.scores||[]};
    case "ERROR":     return {...s,error:a.msg,running:false,newsStatus:s.newsStatus==="running"?"error":s.newsStatus,status:{...s.status,chayakorn:s.status.chayakorn==="running"?"error":s.status.chayakorn,watsaran:s.status.watsaran==="running"?"error":s.status.watsaran,boss:s.status.boss==="running"?"error":s.status.boss}};
    case "CLEAR_ERR": return {...s,error:""};
    default: return s;
  }
}

const darkCSS=`
  body{background:#030712;color:#f3f4f6;background-image:radial-gradient(ellipse at 10% 10%,rgba(29,78,216,.15),transparent 50%),radial-gradient(ellipse at 90% 90%,rgba(112,26,117,.15),transparent 50%);background-attachment:fixed}
  .card{background:rgba(17,24,39,.6);border:1px solid rgba(255,255,255,.05)}
  .field{background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.1);color:#f3f4f6}
  .field:focus{border-color:#00d4ff}
  .label{color:rgba(255,255,255,.5)}
  .tab-btn{color:rgba(255,255,255,.4)}
  .tab-btn.active{background:rgba(255,255,255,.05);color:#fff;border:1px solid rgba(255,255,255,.1)}
  .btn-secondary{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.12);color:#f3f4f6}
  .tab-nav{border-bottom:1px solid rgba(255,255,255,.08)}
  select.field{background:#050a14}
  .sub-tab-btn{background:transparent;border:none;padding:7px 14px;border-radius:8px 8px 0 0;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit;color:rgba(255,255,255,.4);transition:all .2s}
  .sub-tab-btn.active{background:rgba(255,255,255,.06);color:#fff;border-bottom:2px solid #00d4ff}
`;
const lightCSS=`
  body{background:#f1f5f9;color:#0f172a;background-image:none}
  .card{background:rgba(255,255,255,.95);border:1px solid rgba(0,0,0,.08);box-shadow:0 4px 16px rgba(0,0,0,.06)}
  .field{background:rgba(255,255,255,.9);border:1px solid rgba(0,0,0,.15);color:#0f172a}
  .field:focus{border-color:#0077ff}
  .label{color:rgba(15,23,42,.5)}
  .tab-btn{color:rgba(15,23,42,.4)}
  .tab-btn.active{background:rgba(0,0,0,.05);color:#0f172a;border:1px solid rgba(0,0,0,.12)}
  .btn-secondary{background:rgba(0,0,0,.04);border-color:rgba(0,0,0,.12);color:#0f172a}
  .tab-nav{border-bottom:1px solid rgba(0,0,0,.08)}
  select.field{background:#fff}
  .sub-tab-btn{background:transparent;border:none;padding:7px 14px;border-radius:8px 8px 0 0;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit;color:rgba(15,23,42,.4);transition:all .2s}
  .sub-tab-btn.active{background:rgba(0,0,0,.04);color:#0f172a;border-bottom:2px solid #0077ff}
`;
const baseCSS=`
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&family=Noto+Sans+Thai:wght@300;400;600;700&family=Share+Tech+Mono&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Outfit','Noto Sans Thai',sans-serif;min-height:100vh;transition:background .3s,color .3s}
  @keyframes scanline{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
  @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
  @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:rgba(0,0,0,.1)}
  ::-webkit-scrollbar-thumb{background:rgba(128,128,128,.3);border-radius:4px}
  .card{backdrop-filter:blur(16px);border-radius:16px;padding:20px;margin-bottom:16px;animation:fadeIn .4s ease;box-shadow:0 10px 30px rgba(0,0,0,.15);transition:background .3s,border .3s}
  .label{display:block;font-size:11px;font-family:'Share Tech Mono',monospace;font-weight:600;margin-bottom:5px;letter-spacing:1px;text-transform:uppercase;transition:color .3s}
  .field{width:100%;border-radius:8px;padding:9px 12px;font-size:13px;outline:none;font-family:inherit;transition:border-color .3s,background .3s}
  .btn{padding:10px 20px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;transition:all .2s;border:1px solid transparent;font-family:inherit}
  .btn-primary{background:linear-gradient(135deg,#00b4ff,#0077ff);color:#fff;box-shadow:0 4px 14px rgba(0,180,255,.3)}
  .btn-danger{background:rgba(255,77,109,.1);border-color:rgba(255,77,109,.25);color:#ff4d6d}
  .btn-warn{background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.25);color:#f59e0b}
  .btn:hover{filter:brightness(1.1);transform:translateY(-1px)}
  .btn:disabled{opacity:.5;cursor:not-allowed;transform:none;filter:none}
  .tab-nav{display:flex;gap:8px;margin-bottom:20px;padding-bottom:10px;overflow-x:auto;transition:border .3s}
  .tab-btn{background:transparent;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;transition:all .3s;white-space:nowrap;font-family:inherit}
  .dots span{display:inline-block;width:6px;height:6px;border-radius:50%;margin:0 2px;animation:bounce .8s ease-in-out infinite}
  .spinner{width:14px;height:14px;border:2px solid rgba(255,255,255,.2);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;display:inline-block}
  .pill{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-family:monospace;font-weight:700}
  .pill-am{background:rgba(251,191,36,.12);color:#f59e0b;border:1px solid rgba(251,191,36,.25)}
  .pill-pm{background:rgba(139,92,246,.12);color:#a78bfa;border:1px solid rgba(139,92,246,.25)}
  .range-slider{-webkit-appearance:none;width:100%;height:4px;border-radius:4px;outline:none;cursor:pointer}
  .range-slider::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#00b4ff;cursor:pointer;box-shadow:0 2px 6px rgba(0,180,255,.4)}
`;

function Dots({color}){return <span className="dots">{[0,1,2].map(i=><span key={i} style={{background:color,animationDelay:`${i*.15}s`}}/>)}</span>;}
function SlotPill({slot}){const am=slot?.includes("เช้า");return <span className={`pill ${am?"pill-am":"pill-pm"}`}>{am?"🌅 เช้า":"🌆 เย็น"}</span>;}

function NewsCard({status,text,isDark}){
  if(status==="idle"||status==="skip") return null;
  const isRun=status==="running";
  return (
    <div style={{background:"rgba(16,185,129,.06)",borderRadius:12,padding:"12px 16px",marginBottom:12,
      border:`1px solid ${isRun?"rgba(16,185,129,.2)":"rgba(16,185,129,.3)"}`,position:"relative",overflow:"hidden",animation:"fadeIn .4s ease"}}>
      {isRun&&<div style={{position:"absolute",top:0,left:0,right:0,height:2,background:"linear-gradient(90deg,transparent,#10b981,transparent)",animation:"scanline 1.5s linear infinite"}}/>}
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span>🌐</span><span style={{color:"#10b981",fontWeight:700,fontSize:13}}>Auto News</span>
        {isRun&&<Dots color="#10b981"/>}
        {status==="done"&&<span style={{color:"#4ade80"}}>✓</span>}
        {status==="error"&&<span style={{color:"#f87171",fontSize:11}}>ดึงไม่สำเร็จ</span>}
      </div>
      {status==="done"&&text&&<div style={{marginTop:8,fontSize:12,color:isDark?"rgba(255,255,255,.6)":"rgba(15,23,42,.6)",lineHeight:1.7,whiteSpace:"pre-wrap",maxHeight:80,overflowY:"auto"}}>{text}</div>}
    </div>
  );
}

function AgentCard({ag,status,output,step,onCopy,copied,isDark}){
  const isRun=status==="running",isDone=status==="done",isPend=status==="pending",isErr=status==="error";
  return (
    <div style={{background:ag.bg,borderRadius:16,padding:"18px 22px",marginBottom:14,
      border:`1px solid ${isDone||isRun?ag.border:isErr?"rgba(255,77,77,.3)":"rgba(128,128,128,.1)"}`,
      opacity:isPend?.4:1,transition:"all .4s",position:"relative",overflow:"hidden"}}>
      {isRun&&<div style={{position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${ag.color},transparent)`,animation:"scanline 1.5s linear infinite"}}/>}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:output?12:0}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,borderRadius:"50%",background:`${ag.color}15`,border:`1.5px solid ${isErr?"#ff4d6d":ag.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,boxShadow:isDone||isRun?`0 0 10px ${ag.color}33`:"none"}}>{ag.emoji}</div>
          <div>
            <div style={{color:isErr?"#ff7777":ag.color,fontWeight:700,fontSize:14}}>Agent {step}: {ag.name}</div>
            <div style={{color:isDark?"rgba(255,255,255,.35)":"rgba(15,23,42,.4)",fontSize:11,fontFamily:"monospace"}}>{ag.role}</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {isDone&&onCopy&&<button onClick={onCopy} className="btn" style={{background:copied?"rgba(74,222,128,.1)":"rgba(128,128,128,.08)",borderColor:copied?"rgba(74,222,128,.3)":"rgba(128,128,128,.2)",color:copied?"#4ade80":"rgba(128,128,128,.6)",padding:"3px 10px",fontSize:11}}>{copied?"✓ copied":"copy"}</button>}
          {isRun&&<Dots color={ag.color}/>}
          {isDone&&<span style={{color:"#4ade80",fontSize:16,fontWeight:"bold"}}>✓</span>}
          {isPend&&<span style={{color:"rgba(128,128,128,.3)"}}>○</span>}
          {isErr&&<span style={{color:"#ff4d6d",fontSize:16}}>✗</span>}
        </div>
      </div>
      {output&&<div style={{background:isDark?"rgba(0,0,0,.3)":"rgba(0,0,0,.04)",borderRadius:10,padding:14,fontSize:13.5,lineHeight:1.8,color:isDark?"rgba(255,255,255,.9)":"rgba(15,23,42,.85)",whiteSpace:"pre-wrap",border:`1px solid ${isDark?"rgba(255,255,255,.03)":"rgba(0,0,0,.06)"}`}}>{output}</div>}
    </div>
  );
}

function ScoreBoard({scores,weights,isDark}){
  if(!scores?.length) return null;
  const w=weights||DEFAULT_SETTINGS.weights, maxScore=w.ta+w.vol+w.cat+w.mom;
  return (
    <div style={{borderRadius:16,padding:"18px 22px",marginBottom:14,border:"1px solid rgba(255,215,0,.2)",animation:"fadeIn .4s ease",background:isDark?"rgba(17,24,39,.6)":"rgba(255,255,255,.95)"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
        <span style={{fontSize:16}}>🏆</span>
        <span style={{color:"#f59e0b",fontWeight:700,fontSize:14}}>Ranking Score</span>
        <span style={{fontSize:10,color:isDark?"rgba(255,255,255,.25)":"rgba(15,23,42,.35)",fontFamily:"monospace"}}>TA {w.ta}% · Vol {w.vol}% · Cat {w.cat}% · Mom {w.mom}%</span>
      </div>
      {scores.map((s,i)=>{
        const medal=i===0?"#ffd700":i===1?"#c0c0c0":i===2?"#cd7f32":"rgba(128,128,128,.6)";
        const bar=i===0?"linear-gradient(90deg,#ffd700,#f59e0b)":i===1?"linear-gradient(90deg,#c0c0c0,#9ca3af)":i===2?"linear-gradient(90deg,#cd7f32,#a16207)":"linear-gradient(90deg,#3b82f6,#1d4ed8)";
        return (
          <div key={s.s} style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{width:18,fontSize:12,color:"rgba(128,128,128,.4)"}}>{i+1}</span>
                <span style={{fontWeight:700,color:medal,fontSize:14}}>{s.s}</span>
                <span style={{fontSize:10,background:"rgba(128,128,128,.1)",borderRadius:4,padding:"1px 6px",color:"rgba(128,128,128,.5)"}}>{s.cat}</span>
              </div>
              <span style={{fontWeight:800,color:medal,fontSize:15,fontFamily:"monospace"}}>{s.score}<span style={{fontSize:9,color:"rgba(128,128,128,.4)"}}>/{maxScore}</span></span>
            </div>
            <div style={{height:6,background:"rgba(128,128,128,.1)",borderRadius:4,overflow:"hidden",marginBottom:5}}>
              <div style={{height:"100%",width:`${(s.score/maxScore)*100}%`,borderRadius:4,background:bar,transition:"width .8s ease"}}/>
            </div>
            <div style={{display:"flex",gap:6,fontSize:10,fontFamily:"monospace"}}>
              {[["TA",s.scoreTA,w.ta,"#3b82f6"],["Vol",s.scoreVol,w.vol,"#22c55e"],["Cat",s.scoreCat,w.cat,"#f59e0b"],["Mom",s.scoreMom,w.mom,"#a855f7"]].map(([k,v,mx,c])=>(
                <span key={k} style={{background:"rgba(128,128,128,.06)",borderRadius:4,padding:"1px 6px",color:v===mx?c:"rgba(128,128,128,.4)",border:`1px solid ${v===mx?c+"44":"rgba(128,128,128,.1)"}`}}>{k}:{v}</span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DeleteButton({label,onConfirm,cls="btn-danger"}){
  const [ask,setAsk]=useState(false);
  if(ask) return <span style={{display:"inline-flex",alignItems:"center",gap:6}}>
    <span style={{fontSize:11,color:"rgba(128,128,128,.6)"}}>ยืนยัน?</span>
    <button onClick={onConfirm} className={`btn ${cls}`} style={{padding:"2px 8px",fontSize:11}}>ใช่</button>
    <button onClick={()=>setAsk(false)} className="btn btn-secondary" style={{padding:"2px 8px",fontSize:11}}>ยกเลิก</button>
  </span>;
  return <button onClick={()=>setAsk(true)} className={`btn ${cls}`} style={{padding:"2px 8px",fontSize:11}}>{label}</button>;
}

function extractTop3(text=""){
  const m=[...text.matchAll(/##\s*[🥇🥈🥉].*?([A-Z]{2,8})/g)].map(m=>m[1]);
  if(m.length) return [...new Set(m)].slice(0,3);
  return [...new Set([...text.matchAll(/([A-Z]{2,8})\s*@/g)].map(m=>m[1]))].slice(0,3);
}

function DiffView({curr,prev}){
  if(!curr||!prev) return <div style={{color:"rgba(128,128,128,.4)",fontSize:12,padding:8}}>ไม่มีข้อมูลเปรียบเทียบ</div>;
  const c=extractTop3(curr),p=extractTop3(prev);
  return (
    <div>
      <div style={{fontSize:11,color:"rgba(128,128,128,.5)",marginBottom:8,fontFamily:"monospace"}}>เปรียบเทียบ TOP3</div>
      <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
        {[[c,"รอบล่าสุด",p],[p,"รอบก่อนหน้า",c]].map(([arr,label,other],si)=>(
          <div key={label}>
            <div style={{fontSize:10,color:"rgba(128,128,128,.4)",marginBottom:4}}>{label}</div>
            {arr.map((s,i)=>{const diff=!other.includes(s);return <div key={s} style={{fontSize:13,fontWeight:700,marginBottom:4}}>
              <span style={{color:"rgba(128,128,128,.3)",marginRight:4}}>{["🥇","🥈","🥉"][i]}</span>
              <span style={{color:diff?(si===0?"#4ade80":"#f87171"):"rgba(128,128,128,.4)"}}>{s}</span>
              {diff&&<span style={{fontSize:9,marginLeft:4,color:si===0?"#4ade80":"#f87171"}}>{si===0?"NEW":"OUT"}</span>}
            </div>;})}
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryTab({history,clearHistory,onLoad,setTab,isDark}){
  const [filter,setFilter]=useState("all");
  const [expandId,setExpandId]=useState(null);
  const [diffIdx,setDiffIdx]=useState(null);
  const [copyId,setCopyId]=useState(null);
  const filtered=filter==="all"?history:history.filter(h=>filter==="am"?h.slot?.includes("เช้า"):h.slot?.includes("เย็น"));
  const muted=isDark?"rgba(255,255,255,.3)":"rgba(15,23,42,.3)";
  return (
    <div>
      <div className="card" style={{padding:"14px 16px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {[["all","ทั้งหมด"],["am","🌅 เช้า"],["pm","🌆 เย็น"]].map(([v,l])=>(
              <button key={v} onClick={()=>setFilter(v)} className="btn"
                style={{padding:"4px 12px",fontSize:11,background:filter===v?"rgba(0,180,255,.12)":"transparent",
                  borderColor:filter===v?"rgba(0,180,255,.4)":"rgba(128,128,128,.2)",color:filter===v?"#00b4ff":muted}}>
                {l}
              </button>
            ))}
            <span style={{fontSize:11,color:muted,fontFamily:"monospace"}}>{filtered.length}/{history.length}</span>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>navigator.clipboard.writeText(filtered.map(h=>`=== ${h.dateStr} ${h.slot} ===\n[A1]\n${h.output?.chayakorn||"-"}\n\n[A2]\n${h.output?.watsaran||"-"}\n\n[A3]\n${h.output?.boss||"-"}`).join("\n\n"+"─".repeat(40)+"\n\n")).then(()=>alert("copy แล้ว!"))}
              disabled={!filtered.length} className="btn btn-secondary" style={{padding:"4px 12px",fontSize:11}}>📋 export</button>
            <DeleteButton label="ล้างประวัติ" onConfirm={clearHistory} cls="btn-warn"/>
          </div>
        </div>
      </div>
      {!filtered.length
        ?<div className="card" style={{textAlign:"center",color:muted,padding:32}}>ไม่มีประวัติ</div>
        :filtered.map((h,i)=>{
          const isExp=expandId===h.ts,isDiff=diffIdx===i,prev=filtered[i+1];
          return (
            <div key={h.ts} className="card" style={{padding:"14px 16px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <SlotPill slot={h.slot}/>
                  <span style={{color:"#00d4ff",fontSize:12,fontFamily:"monospace"}}>📅 {h.dateStr}</span>
                  <span style={{fontSize:10,color:muted,fontFamily:"monospace"}}>{new Date(h.ts).toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"})}</span>
                </div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {extractTop3(h.output?.boss||"").map(s=>(
                    <span key={s} style={{background:"rgba(128,128,128,.1)",border:"1px solid rgba(128,128,128,.2)",borderRadius:4,padding:"1px 7px",fontSize:11,fontWeight:700}}>{s}</span>
                  ))}
                </div>
              </div>
              <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
                <button onClick={()=>setExpandId(isExp?null:h.ts)} className="btn btn-secondary" style={{padding:"3px 10px",fontSize:11}}>{isExp?"▲ ย่อ":"▼ ดูผลเต็ม"}</button>
                {prev&&<button onClick={()=>setDiffIdx(isDiff?null:i)} className="btn btn-secondary" style={{padding:"3px 10px",fontSize:11,color:isDiff?"#00d4ff":"",borderColor:isDiff?"rgba(0,212,255,.3)":""}}>⇄ diff</button>}
                <button onClick={()=>navigator.clipboard.writeText(`📊 ${h.dateStr} ${h.slot}\n\n${h.output?.boss||"-"}`).then(()=>{setCopyId(h.ts);setTimeout(()=>setCopyId(null),2000);})}
                  className="btn btn-secondary" style={{padding:"3px 10px",fontSize:11,color:copyId===h.ts?"#4ade80":"",borderColor:copyId===h.ts?"rgba(74,222,128,.3)":""}}>
                  {copyId===h.ts?"✓":"📋 copy A3"}
                </button>
                <button onClick={()=>{onLoad(h);setTab("dashboard");}} className="btn btn-secondary" style={{padding:"3px 10px",fontSize:11}}>↩ โหลด</button>
              </div>
              {isDiff&&prev&&<div style={{marginTop:12,background:"rgba(0,180,255,.05)",borderRadius:10,padding:12,border:"1px solid rgba(0,212,255,.1)"}}>
                <DiffView curr={h.output?.boss} prev={prev.output?.boss}/>
              </div>}
              {isExp&&<div style={{marginTop:12}}>
                {["chayakorn","watsaran","boss"].map(k=>h.output?.[k]&&(
                  <div key={k} style={{marginBottom:10}}>
                    <div style={{fontSize:10,color:AGENTS[k].color,fontFamily:"monospace",marginBottom:4}}>{AGENTS[k].emoji} {AGENTS[k].name}</div>
                    <div style={{background:isDark?"rgba(0,0,0,.3)":"rgba(0,0,0,.04)",borderRadius:8,padding:12,fontSize:12,whiteSpace:"pre-wrap",lineHeight:1.7,maxHeight:200,overflowY:"auto"}}>{h.output[k]}</div>
                  </div>
                ))}
              </div>}
            </div>
          );
        })
      }
    </div>
  );
}

function WeightSlider({label,color,value,onChange}){
  return (
    <div style={{marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <span style={{fontSize:12,fontWeight:600,color}}>{label}</span>
        <span style={{fontSize:13,fontWeight:800,color,fontFamily:"monospace"}}>{value}<span style={{fontSize:10,color:"rgba(128,128,128,.5)"}}>%</span></span>
      </div>
      <input type="range" min={0} max={60} value={value} onChange={e=>onChange(Number(e.target.value))}
        className="range-slider"
        style={{background:`linear-gradient(90deg,${color} ${(value/60)*100}%,rgba(128,128,128,.2) ${(value/60)*100}%)`}}/>
    </div>
  );
}

// ── Quick Paste Parser ──
function QuickPaste({watchlist,setWatchlist,isDark}){
  const [pasteText,setPasteText] = useState("");
  const [result,setResult]       = useState([]);
  const [parsing,setParsing]     = useState(false);
  const [err,setErr]             = useState("");
  const [added,setAdded]         = useState(false);
  const muted = isDark?"rgba(255,255,255,.4)":"rgba(15,23,42,.4)";

  async function parse(){
    if(!pasteText.trim()) return;
    setParsing(true); setResult([]); setErr(""); setAdded(false);
    try {
      const raw = await callClaude(
        `แยกชื่อหุ้นและราคาจากข้อความ ตอบเป็น JSON array เท่านั้น ไม่มีข้อความอื่น ไม่มี markdown backtick
format: [{"s":"SYMBOL","p":0.00,"note":"ความเห็นสั้นๆถ้ามี"}]
- s = ชื่อย่อหุ้น ตัวพิมพ์ใหญ่ เช่น TKN MINT AEONTS
- p = ราคา เป็นตัวเลขทศนิยม ถ้าไม่มีใส่ 0
- note = ความเห็น/สัญญาณสั้นๆภาษาไทย ถ้าไม่มีใส่ ""
ถ้าไม่พบหุ้นใดเลย ตอบ []`,
        pasteText.trim(), 600, MODEL_FAST
      );
      const clean=raw.replace(/```json|```/g,"").trim();
      const parsed=JSON.parse(clean);
      if(Array.isArray(parsed)&&parsed.length>0){
        setResult(parsed.map(x=>({...x,s:(x.s||"").toUpperCase(),p:parseFloat(x.p)||0,cat:"G2S",sel:true})));
      } else {
        setErr("ไม่พบหุ้นในข้อความนี้");
      }
    } catch(e){ setErr("parse ไม่สำเร็จ: "+e.message); }
    finally{ setParsing(false); }
  }

  function addSelected(){
    const sel=result.filter(x=>x.sel);
    if(!sel.length) return;
    const dupes=[], added=[];
    sel.forEach(x=>{
      if(watchlist.some(w=>w.s===x.s)) dupes.push(x.s);
      else added.push({s:x.s,p:x.p,cat:x.cat,note:x.note||"",on:true});
    });
    if(added.length) setWatchlist(w=>[...w,...added]);
    setAdded(true);
    if(dupes.length) setErr(`${dupes.join(", ")} มีอยู่แล้ว`);
    else setErr("");
    setTimeout(()=>{setPasteText("");setResult([]);setAdded(false);},1800);
  }

  const selCount=result.filter(x=>x.sel).length;

  return (
    <div>
      {/* คำอธิบาย */}
      <div className="card" style={{padding:"14px 16px"}}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>🔍 Quick Paste Parser</div>
        <div style={{fontSize:12,color:muted,lineHeight:1.9}}>
          วางข้อความอะไรก็ได้ — Claude Haiku จะดึงชื่อหุ้น + ราคาให้อัตโนมัติ รองรับทุกรูปแบบ:
        </div>
        <div style={{marginTop:10,display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:11}}>
          {[
            ["💬 LINE กลุ่มหุ้น","TKN วิ่งแรง เป้า 4.80\nMINT HA เขียว 3 แท่ง"],
            ["🌐 Hoonstation (text)","TKN 4.22 ↑ Vol สูง\nSYNTEC 1.68 Breakout"],
            ["⌨️ พิมพ์เอง","TKN 4.22, MINT 22.90, AEONTS 95.25"],
            ["📝 ข้อความปนกัน","TKN ราคา 4.22 ขาขึ้นแรง น่าเข้า"],
          ].map(([label,ex])=>(
            <div key={label} style={{background:isDark?"rgba(255,255,255,.03)":"rgba(0,0,0,.03)",borderRadius:8,padding:"8px 10px",border:`1px solid ${isDark?"rgba(255,255,255,.06)":"rgba(0,0,0,.06)"}`}}>
              <div style={{fontWeight:600,color:isDark?"rgba(255,255,255,.6)":"rgba(15,23,42,.6)",marginBottom:4,fontSize:11}}>{label}</div>
              <pre style={{fontSize:10,color:muted,fontFamily:"'Share Tech Mono',monospace",whiteSpace:"pre-wrap",lineHeight:1.6}}>{ex}</pre>
            </div>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="card">
        <span className="label">วางข้อความที่นี่</span>
        <textarea value={pasteText} onChange={e=>setPasteText(e.target.value)} rows={6} className="field"
          placeholder="วาง/พิมพ์ข้อความได้เลย..."/>
        <div style={{display:"flex",gap:8,marginTop:10,alignItems:"center",flexWrap:"wrap"}}>
          <button onClick={parse} disabled={parsing||!pasteText.trim()} className="btn btn-primary" style={{padding:"8px 24px",fontSize:13}}>
            {parsing?<><span className="spinner" style={{marginRight:8}}/>กำลัง parse...</>:"🔍 Parse หุ้น"}
          </button>
          {pasteText&&<button onClick={()=>{setPasteText("");setResult([]);setErr("");}} className="btn btn-secondary" style={{padding:"8px 16px",fontSize:12}}>ล้าง</button>}
          {err&&<span style={{fontSize:11,color:"#f87171"}}>⚠️ {err}</span>}
          {added&&<span style={{fontSize:11,color:"#4ade80"}}>✓ เพิ่มแล้ว!</span>}
        </div>
      </div>

      {/* Results */}
      {result.length>0&&<div className="card">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontWeight:700,fontSize:13}}>ผลลัพธ์ ({result.length} ตัว)</div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <span style={{fontSize:11,color:muted}}>เลือก {selCount} ตัว</span>
            <button onClick={addSelected} disabled={!selCount} className="btn btn-primary" style={{padding:"6px 18px",fontSize:12}}>
              ➕ เพิ่มที่เลือก ({selCount})
            </button>
          </div>
        </div>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{borderBottom:`1px solid ${isDark?"rgba(255,255,255,.06)":"rgba(0,0,0,.06)"}`}}>
            {["","หุ้น","ราคา","กลุ่ม","โน้ต"].map(h=>(
              <th key={h} style={{padding:"6px 8px",fontSize:11,color:muted,textAlign:"left"}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>{result.map((r,i)=>(
            <tr key={i} style={{borderBottom:`1px solid ${isDark?"rgba(255,255,255,.04)":"rgba(0,0,0,.04)"}`,
              background:r.sel?(isDark?"rgba(0,212,255,.04)":"rgba(0,119,255,.03)"):"transparent",transition:"background .2s"}}>
              <td style={{padding:"7px 8px"}}>
                <input type="checkbox" checked={r.sel} onChange={()=>setResult(prev=>prev.map((x,j)=>j===i?{...x,sel:!x.sel}:x))}/>
              </td>
              <td style={{padding:"7px 8px"}}>
                <input value={r.s} onChange={e=>setResult(prev=>prev.map((x,j)=>j===i?{...x,s:e.target.value.toUpperCase()}:x))}
                  className="field" style={{width:80,padding:"3px 6px",fontWeight:700}}/>
              </td>
              <td style={{padding:"7px 8px"}}>
                <input type="number" step="0.01" value={r.p} onChange={e=>setResult(prev=>prev.map((x,j)=>j===i?{...x,p:parseFloat(e.target.value)||0}:x))}
                  className="field" style={{width:72,padding:"3px 6px"}}/>
              </td>
              <td style={{padding:"7px 8px"}}>
                <select value={r.cat} onChange={e=>setResult(prev=>prev.map((x,j)=>j===i?{...x,cat:e.target.value}:x))}
                  className="field" style={{width:90,padding:"3px 6px",fontSize:11}}>
                  <option value="G2S">G2S</option><option value="G1S">G1S</option><option value="G3S">G3S</option>
                </select>
              </td>
              <td style={{padding:"7px 8px"}}>
                <input value={r.note||""} onChange={e=>setResult(prev=>prev.map((x,j)=>j===i?{...x,note:e.target.value}:x))}
                  className="field" style={{padding:"3px 8px"}} placeholder="โน้ต..."/>
              </td>
            </tr>
          ))}</tbody>
        </table>
        <div style={{marginTop:10,fontSize:11,color:muted}}>แก้ไขข้อมูลได้ก่อนกด "เพิ่มที่เลือก"</div>
      </div>}
    </div>
  );
}

export default function App() {
  const today=new Date().toLocaleDateString("th-TH",{day:"numeric",month:"long",year:"numeric"});
  const [tab,setTab]            = useState("dashboard");
  const [wlTab,setWlTab]        = useState("list");
  const [dateStr,setDateStr]    = useState(today);
  const [volSpikes,setVolSpikes]= useState("");
  const [news,setNews]          = useState("");
  const [newSym,setNewSym]      = useState("");
  const [newPri,setNewPri]      = useState("");
  const [newCat,setNewCat]      = useState("G2S");
  const [newNote,setNewNote]    = useState("");
  const [showChart,setShowChart]= useState(false);
  const [copied,setCopied]      = useState(false);

  const {watchlist,setWatchlist,loaded} = useWatchlist();
  const {settings,setSettings}          = useSettings();
  const {history,addHistory,clearHistory,fbLoaded} = useHistory();
  const [state,dispatch]                = useReducer(aReducer,initAnalysis);
  const active=watchlist.filter(s=>s.on);
  const isDark=settings.theme==="dark";

  useEffect(()=>{ document.body.setAttribute("data-theme",settings.theme); },[settings.theme]);

  const weightSum=(settings.weights?.ta||0)+(settings.weights?.vol||0)+(settings.weights?.cat||0)+(settings.weights?.mom||0);
  const weightOK=weightSum===100;
  const muted=isDark?"rgba(255,255,255,.4)":"rgba(15,23,42,.4)";

  async function runAnalysis() {
    if(state.running) return;
    if(!active.length){dispatch({type:"ERROR",msg:"ยังไม่มีหุ้นที่เปิดใน Watchlist"});return;}
    if(!weightOK){dispatch({type:"ERROR",msg:`น้ำหนัก Ranking Score รวม ${weightSum}% — ต้องเท่ากับ 100%`});return;}
    dispatch({type:"START"});
    const g2s=active.filter(s=>s.cat==="G2S").map(s=>`${s.s} ฿${s.p} (${s.note||"-"})`).join(", ")||"-";
    const g1s=active.filter(s=>s.cat==="G1S").map(s=>`${s.s} ฿${s.p} (${s.note||"-"})`).join(", ")||"-";
    const g3s=active.filter(s=>s.cat==="G3S").map(s=>`${s.s} ฿${s.p} (${s.note||"-"})`).join(", ")||"-";
    const slot=new Date().getHours()<12?"รอบเช้า (ก่อนเปิดตลาด)":"รอบเย็น (หลังปิดตลาด)";
    const riskLabel=settings.risk==="low"?"ต่ำ 1.5%":settings.risk==="medium"?"ปานกลาง 4%":"สูง 7%";
    try {
      let newsToUse=news.trim();
      if(!newsToUse){const auto=await fetchAutoNews(dateStr);newsToUse=auto;dispatch({type:"NEWS_DONE",text:auto||"(ดึงไม่สำเร็จ)"});}
      else dispatch({type:"NEWS_SKIP"});
      let ydCtx="ไม่มีข้อมูลเมื่อวาน";
      try{const now=Date.now(),s=now-2*24*60*60*1000,e=now-6*60*60*1000;
        const arr=history.filter(x=>x.ts>=s&&x.ts<=e).sort((a,b)=>b.ts-a.ts);
        if(arr.length) ydCtx=arr.map(x=>`[${x.dateStr} ${x.slot}]\nTOP3:\n${x.output?.boss||"-"}`).join("\n\n---\n\n");
      }catch(_){}
      let a1;
      try{a1=await callClaude(`คุณคือ "ชยกร" นักคัดกรองหุ้น SET ตอบภาษาไทย ใช้ Markdown\nวิเคราะห์แบบ Heikin Ashi + Volume Spike คัดไม่เกิน 8 ตัว\nระบุ: ชื่อย่อ, ราคา, แนวโน้ม TA 1-2 บรรทัด, แนวรับ/แนวต้าน`,`รอบ: ${slot} วันที่ ${dateStr}\ng2s: ${g2s}\ng1s: ${g1s}\ng3s: ${g3s}\nVolume: ${volSpikes||"-"}`,800,MODEL_FAST);}
      catch(e){dispatch({type:"ERROR",msg:`ชยกร ล้มเหลว: ${e.message}`});return;}
      dispatch({type:"A1_DONE",text:a1});
      let a2;
      try{a2=await callClaude(`คุณคือ "วศรัญ" นักวิเคราะห์ Catalyst & News ตอบภาษาไทย\nจัดระดับ 🔴สูง / 🟡กลาง / ⚪ต่ำ ต่อแต่ละตัว สรุป 1 บรรทัด\nพิจารณา context เมื่อวานด้วย`,`ผลชยกร:\n${a1}\n\nข่าววันนี้:\n${newsToUse||"ไม่มี"}\n\n=== เมื่อวาน ===\n${ydCtx}`,900,MODEL_BEST);}
      catch(e){dispatch({type:"ERROR",msg:`วศรัญ ล้มเหลว: ${e.message}`});return;}
      const scores=computeScores(active,volSpikes,a2,settings.weights);
      dispatch({type:"A2_DONE",text:a2,scores});
      const w=settings.weights;
      const scoreTable=scores.map((s,i)=>`${i+1}. ${s.s}: ${s.score}pts (TA:${s.scoreTA} Vol:${s.scoreVol} Cat:${s.scoreCat} Mom:${s.scoreMom})`).join("\n");
      let a3;
      try{a3=await callClaude(`คุณคือ "บอส ฒ" ผู้ฟันธงและจัดการความเสี่ยง ตอบภาษาไทย ใช้ Markdown\nเลือก TOP 3 หุ้น กำหนด Entry/Target/Stop Loss + Position Sizing\nพอร์ต ${settings.portSize.toLocaleString()} บาท ความเสี่ยง ${riskLabel}\n\nRanking Score (TA ${w.ta}% · Vol ${w.vol}% · Cat ${w.cat}% · Mom ${w.mom}%):\n${scoreTable}\n\nสูตร: Risk=พอร์ต×%risk, Risk/Share=Entry−Stop, จำนวน=Risk÷Risk/Share, เงิน=จำนวน×Entry (cap 15%)\n\nFormat:\n## 🥇 N | SYMBOL @ Entry\n- เหตุผล: TA+Catalyst+Score\n- Target: X.XX | Stop: X.XX | ความเชื่อมั่น: ⭐⭐⭐\n- ลงทุน: X,XXX บาท (~X,XXX หุ้น) | ความเสี่ยง: X%`,`ชยกร:\n${a1}\n\nวศรัญ:\n${a2}`,1000,MODEL_BEST);}
      catch(e){dispatch({type:"ERROR",msg:`บอส ฒ ล้มเหลว: ${e.message}`});return;}
      dispatch({type:"A3_DONE",text:a3});
      addHistory({dateStr,slot,ts:Date.now(),output:{chayakorn:a1,watsaran:a2,boss:a3},scores});
    } catch(e){dispatch({type:"ERROR",msg:"เกิดข้อผิดพลาด: "+e.message});}
  }

  function addStock(){
    if(!newSym.trim()) return;
    const sym=newSym.trim().toUpperCase();
    if(watchlist.some(s=>s.s===sym)){alert("มีหุ้นนี้อยู่แล้ว");return;}
    setWatchlist(w=>[...w,{s:sym,p:parseFloat(newPri)||0,cat:newCat,note:newNote,on:true}]);
    setNewSym("");setNewPri("");setNewNote("");
  }

  return (
    <>
      <style>{baseCSS+(isDark?darkCSS:lightCSS)}</style>
      <div style={{maxWidth:820,margin:"0 auto",padding:"24px 16px"}}>

        <div className="card" style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          background:isDark?"rgba(10,25,47,.7)":"rgba(255,255,255,.98)",borderColor:isDark?"rgba(0,212,255,.15)":"rgba(0,0,0,.08)"}}>
          <div>
            <div style={{display:"inline-block",background:"rgba(0,212,255,.1)",border:"1px solid rgba(0,212,255,.3)",borderRadius:8,padding:"3px 10px",fontSize:10,color:"#00d4ff",fontFamily:"'Share Tech Mono',monospace",letterSpacing:1.5,marginBottom:6}}>STOCK HUNTER v0.9.1</div>
            <h1 style={{fontSize:20,fontWeight:700}}>🤖 3-Agent Stock Hunter</h1>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button onClick={()=>setSettings(s=>({...s,theme:s.theme==="dark"?"light":"dark"}))}
              style={{background:isDark?"rgba(255,255,255,.08)":"rgba(0,0,0,.06)",border:`1px solid ${isDark?"rgba(255,255,255,.15)":"rgba(0,0,0,.12)"}`,borderRadius:20,padding:"5px 12px",cursor:"pointer",fontSize:13,transition:"all .3s",color:isDark?"#f3f4f6":"#0f172a"}}>
              {isDark?"☀️ Light":"🌙 Dark"}
            </button>
            <div style={{textAlign:"right",fontSize:9,color:muted,fontFamily:"monospace"}}>
              <span style={{color:loaded?"#4ade80":"#f59e0b"}}>{loaded?"● ok":"○ ..."}</span>{" "}
              <span style={{color:fbLoaded?"#4ade80":"#f59e0b"}}>{fbLoaded?`☁️ ${history.length}รอบ`:"○"}</span>
            </div>
          </div>
        </div>

        <div className="tab-nav">
          {[["dashboard","💻 วิเคราะห์"],["watchlist","📈 Watchlist"],["inputs","📰 ข้อมูล"],["settings","⚙️ ตั้งค่า"],
            ["history",`🕐 ประวัติ${history.length>0?` (${history.length})`:""}`]
          ].map(([id,label])=>(
            <button key={id} className={`tab-btn${tab===id?" active":""}`} onClick={()=>setTab(id)}>{label}</button>
          ))}
        </div>

        {state.error&&<div style={{background:"rgba(255,77,77,.08)",border:"1px solid rgba(255,77,77,.3)",borderRadius:10,padding:"12px 16px",marginBottom:16,color:"#ff7777",fontSize:13,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span>⚠️ {state.error}</span>
          <button onClick={()=>dispatch({type:"CLEAR_ERR"})} style={{background:"none",border:"none",color:"#ff7777",cursor:"pointer",fontSize:16}}>✕</button>
        </div>}

        {tab==="dashboard"&&<div>
          <div className="card" style={{textAlign:"center",padding:"24px 20px"}}>
            <p style={{color:muted,fontSize:12,marginBottom:16}}>
              🌐 Auto News → 🔍 ชยกร (Haiku) → 📰 วศรัญ (Sonnet) → 🏆 Score → ⚡ บอส ฒ (Sonnet)<br/>
              Watchlist: {active.length} ตัว {!weightOK&&<span style={{color:"#f87171"}}>⚠️ Weights = {weightSum}%</span>}
            </p>
            <button className="btn btn-primary" onClick={runAnalysis} disabled={state.running||!weightOK} style={{fontSize:14,padding:"12px 36px"}}>
              {state.running?<><span className="spinner" style={{marginRight:8}}/>กำลังวิเคราะห์...</>:state.done?"🔁 วิเคราะห์ใหม่":"🚀 เริ่มวิเคราะห์"}
            </button>
            {state.running&&<div style={{marginTop:14,display:"flex",justifyContent:"center",gap:14,fontSize:11,fontFamily:"monospace",flexWrap:"wrap"}}>
              <span style={{color:state.newsStatus==="running"?"#10b981":state.newsStatus==="done"?"#4ade80":"rgba(128,128,128,.4)"}}>
                🌐 {state.newsStatus==="running"?"กำลังดึง...":state.newsStatus==="done"?"✓":state.newsStatus==="skip"?"(manual)":"รอ"}
              </span>
              {Object.entries(state.status).map(([k,s])=>{const ag=AGENTS[k];return(
                <span key={k} style={{color:s==="running"?ag.color:s==="done"?"#4ade80":s==="error"?"#ff4d6d":"rgba(128,128,128,.4)"}}>
                  {ag.emoji} {ag.name}: {s==="running"?"กำลังรัน...":s==="done"?"✓":s==="error"?"✗":"รอ"}
                </span>
              );})}
            </div>}
          </div>
          <NewsCard status={state.newsStatus} text={state.newsText} isDark={isDark}/>
          <AgentCard ag={AGENTS.chayakorn} status={state.status.chayakorn} output={state.output.chayakorn} step={1} isDark={isDark}/>
          <AgentCard ag={AGENTS.watsaran}  status={state.status.watsaran}  output={state.output.watsaran}  step={2} isDark={isDark}/>
          {state.scores.length>0&&<ScoreBoard scores={state.scores} weights={settings.weights} isDark={isDark}/>}
          <AgentCard ag={AGENTS.boss} status={state.status.boss} output={state.output.boss} step={3} isDark={isDark}
            onCopy={()=>navigator.clipboard.writeText(state.output.boss).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);})} copied={copied}/>
          {state.done&&<div style={{textAlign:"center",fontSize:11,color:muted,padding:10}}>⚠️ เพื่อการศึกษาเท่านั้น</div>}
        </div>}

        {tab==="watchlist"&&<div>
          {/* Sub-tab nav */}
          <div style={{display:"flex",gap:4,marginBottom:16,borderBottom:`2px solid ${isDark?"rgba(255,255,255,.06)":"rgba(0,0,0,.06)"}`}}>
            {[["list","📋 รายการ"],["paste","🔍 Quick Paste"]].map(([v,l])=>(
              <button key={v} onClick={()=>setWlTab(v)} className={`sub-tab-btn${wlTab===v?" active":""}`}>{l}</button>
            ))}
          </div>

          {wlTab==="list"&&<div>
            <div className="card">
              <h3 style={{fontSize:15,fontWeight:700,marginBottom:12}}>➕ เพิ่มหุ้น</h3>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10,alignItems:"end"}}>
                <div><span className="label">Symbol</span>
                  <input value={newSym} onChange={e=>setNewSym(e.target.value)} className="field" placeholder="เช่น TKN"
                    style={{textTransform:"uppercase"}} onKeyDown={e=>e.key==="Enter"&&addStock()}/></div>
                <div><span className="label">ราคา (฿)</span>
                  <input type="number" step="0.01" value={newPri} onChange={e=>setNewPri(e.target.value)} className="field" placeholder="0.00"/></div>
                <div><span className="label">กลุ่ม</span>
                  <select value={newCat} onChange={e=>setNewCat(e.target.value)} className="field">
                    <option value="G2S">G2S (HA เขียว 2+)</option>
                    <option value="G1S">G1S (HA เขียว 1)</option>
                    <option value="G3S">G3S (เฝ้าระวัง)</option>
                  </select></div>
                <div><button onClick={addStock} className="btn btn-primary" style={{width:"100%"}}>เพิ่ม</button></div>
              </div>
              <div style={{marginTop:10}}>
                <span className="label">โน้ต</span>
                <input value={newNote} onChange={e=>setNewNote(e.target.value)} className="field" placeholder="สรุปความเห็น..."/>
              </div>
            </div>
            <div className="card" style={{overflowX:"auto"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <h3 style={{fontSize:15,fontWeight:700}}>รายการ ({watchlist.length} ตัว, เปิด {active.length} ตัว)</h3>
                <button onClick={()=>setShowChart(v=>!v)} className="btn btn-secondary"
                  style={{padding:"4px 12px",fontSize:11,borderColor:showChart?"rgba(0,212,255,.4)":"",color:showChart?"#00d4ff":""}}>
                  {showChart?"▲ ซ่อน Chart":"📊 Chart"}
                </button>
              </div>
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:520}}>
                <thead><tr style={{borderBottom:`1px solid ${isDark?"rgba(255,255,255,.06)":"rgba(0,0,0,.06)"}`}}>
                  {["เปิด","หุ้น","ราคา","กลุ่ม","โน้ต",""].map(h=>(
                    <th key={h} style={{padding:"6px 10px",fontSize:11,color:muted,textAlign:"left"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>{watchlist.map((s,i)=>(
                  <tr key={s.s} style={{borderBottom:`1px solid ${isDark?"rgba(255,255,255,.04)":"rgba(0,0,0,.04)"}`,background:i%2?"transparent":isDark?"rgba(255,255,255,.01)":"rgba(0,0,0,.01)"}}>
                    <td style={{padding:"8px 10px"}}><input type="checkbox" checked={s.on} onChange={()=>setWatchlist(w=>w.map(x=>x.s===s.s?{...x,on:!x.on}:x))}/></td>
                    <td style={{padding:"8px 10px",fontWeight:"bold"}}>{s.s}</td>
                    <td style={{padding:"8px 10px"}}>
                      <input type="number" step="0.01" value={s.p} className="field" style={{width:72,padding:"3px 6px"}}
                        onChange={e=>setWatchlist(w=>w.map(x=>x.s===s.s?{...x,p:parseFloat(e.target.value)||0}:x))}/>
                    </td>
                    <td style={{padding:"8px 10px"}}>
                      <select value={s.cat} className="field" style={{width:100,padding:"3px 6px",fontSize:11}}
                        onChange={e=>setWatchlist(w=>w.map(x=>x.s===s.s?{...x,cat:e.target.value}:x))}>
                        <option value="G2S">G2S</option><option value="G1S">G1S</option><option value="G3S">G3S</option>
                      </select>
                    </td>
                    <td style={{padding:"8px 10px"}}>
                      <input value={s.note||""} className="field" style={{padding:"3px 8px"}}
                        onChange={e=>setWatchlist(w=>w.map(x=>x.s===s.s?{...x,note:e.target.value}:x))} placeholder="โน้ต..."/>
                    </td>
                    <td style={{padding:"8px 10px"}}>
                      <DeleteButton label="ลบ" onConfirm={()=>setWatchlist(w=>w.filter(x=>x.s!==s.s))}/>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
              {showChart&&<div style={{marginTop:16}}>
                <div style={{fontSize:11,color:muted,marginBottom:10,fontFamily:"monospace"}}>📊 TradingView — SET</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:12}}>
                  {watchlist.map(s=>(
                    <div key={s.s} style={{borderRadius:10,overflow:"hidden",border:`1px solid ${isDark?"rgba(255,255,255,.08)":"rgba(0,0,0,.08)"}`}}>
                      <div style={{background:isDark?"rgba(0,0,0,.4)":"rgba(0,0,0,.04)",padding:"6px 10px",fontSize:11,fontWeight:700,display:"flex",justifyContent:"space-between",color:s.on?"#00d4ff":muted}}>
                        <span>{s.s} <span style={{fontSize:9,color:muted}}>{s.cat}</span></span>
                        <span style={{color:muted}}>฿{s.p}</span>
                      </div>
                      <iframe src={`https://www.tradingview.com/widgetembed/?symbol=SET:${s.s}&interval=D&theme=${isDark?"dark":"light"}&style=1&timezone=Asia%2FBangkok&locale=th&hidesidetoolbar=1&hide_top_toolbar=1&save_image=0`}
                        style={{width:"100%",height:220,border:"none",display:"block"}} title={`Chart ${s.s}`} loading="lazy"/>
                    </div>
                  ))}
                </div>
                <div style={{marginTop:8,fontSize:10,color:muted,textAlign:"center"}}>ถ้า chart ไม่แสดง — browser block iframe</div>
              </div>}
            </div>
          </div>}

          {wlTab==="paste"&&<QuickPaste watchlist={watchlist} setWatchlist={setWatchlist} isDark={isDark}/>}
        </div>}

        {tab==="inputs"&&<div className="card">
          <h3 style={{fontSize:15,fontWeight:700,marginBottom:14}}>📰 ข้อมูลประกอบการวิเคราะห์</h3>
          <div style={{background:"rgba(16,185,129,.06)",border:"1px solid rgba(16,185,129,.2)",borderRadius:10,padding:12,marginBottom:14,fontSize:12,color:muted}}>
            🌐 <strong style={{color:"#10b981"}}>Auto News</strong> — ถ้าช่อง "ข่าว" ว่างไว้ ระบบดึงข่าว SET อัตโนมัติ
          </div>
          <div style={{marginBottom:14}}><span className="label">📅 วันที่</span><input value={dateStr} onChange={e=>setDateStr(e.target.value)} className="field"/></div>
          <div style={{marginBottom:14}}><span className="label">🔥 Volume Spikes</span><textarea value={volSpikes} onChange={e=>setVolSpikes(e.target.value)} rows={3} className="field" placeholder="เช่น TKN (Volume 200%), MINT"/></div>
          <div><span className="label">📰 ข่าว & Catalyst (ว่างไว้ = Auto)</span><textarea value={news} onChange={e=>setNews(e.target.value)} rows={5} className="field" placeholder="ว่างไว้ให้ดึงข่าวอัตโนมัติ หรือพิมพ์ข่าวที่ต้องการเน้น"/></div>
        </div>}

        {tab==="settings"&&<div>
          <div className="card">
            <h3 style={{fontSize:15,fontWeight:700,marginBottom:14}}>🛡️ พอร์ต & ความเสี่ยง</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div><span className="label">ขนาดพอร์ต (บาท)</span><input type="number" value={settings.portSize} onChange={e=>setSettings(s=>({...s,portSize:Number(e.target.value)}))} className="field"/></div>
              <div><span className="label">ความเสี่ยงต่อไม้</span>
                <select value={settings.risk} onChange={e=>setSettings(s=>({...s,risk:e.target.value}))} className="field">
                  <option value="low">ต่ำ (1.5%)</option><option value="medium">ปานกลาง (4%)</option><option value="high">สูง (7%)</option>
                </select></div>
            </div>
          </div>
          <div className="card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h3 style={{fontSize:15,fontWeight:700}}>🏆 Ranking Score Weights</h3>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:13,fontWeight:800,fontFamily:"monospace",color:weightOK?"#4ade80":"#f87171"}}>{weightSum}<span style={{fontSize:10,color:muted}}>/100</span></span>
                {!weightOK&&<span style={{fontSize:10,color:"#f87171"}}>⚠️ ต้องรวม = 100</span>}
              </div>
            </div>
            <WeightSlider label="📐 TA (Technical Analysis)" color="#3b82f6" value={settings.weights?.ta||40} onChange={v=>setSettings(s=>({...s,weights:{...s.weights,ta:v}}))}/>
            <WeightSlider label="📊 Volume" color="#22c55e" value={settings.weights?.vol||20} onChange={v=>setSettings(s=>({...s,weights:{...s.weights,vol:v}}))}/>
            <WeightSlider label="📰 Catalyst" color="#f59e0b" value={settings.weights?.cat||20} onChange={v=>setSettings(s=>({...s,weights:{...s.weights,cat:v}}))}/>
            <WeightSlider label="🚀 Momentum" color="#a855f7" value={settings.weights?.mom||20} onChange={v=>setSettings(s=>({...s,weights:{...s.weights,mom:v}}))}/>
            <button onClick={()=>setSettings(s=>({...s,weights:{ta:40,vol:20,cat:20,mom:20}}))} className="btn btn-secondary" style={{padding:"4px 14px",fontSize:11,marginTop:4}}>↺ reset (40/20/20/20)</button>
          </div>
          <div className="card">
            <h3 style={{fontSize:15,fontWeight:700,marginBottom:14}}>🎨 Theme</h3>
            <div style={{display:"flex",gap:10}}>
              {[["dark","🌙 Dark"],["light","☀️ Light"]].map(([v,l])=>(
                <button key={v} onClick={()=>setSettings(s=>({...s,theme:v}))} className="btn"
                  style={{flex:1,padding:"10px",fontSize:13,background:settings.theme===v?"rgba(0,180,255,.12)":"transparent",borderColor:settings.theme===v?"rgba(0,180,255,.4)":"rgba(128,128,128,.2)",color:settings.theme===v?"#00b4ff":muted}}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="card">
            <h3 style={{fontSize:15,fontWeight:700,marginBottom:12,color:"#ff4d6d"}}>🔒 Firebase Rules</h3>
            <pre style={{background:isDark?"rgba(0,0,0,.4)":"rgba(0,0,0,.06)",borderRadius:8,padding:12,fontSize:11,color:isDark?"#a5f3fc":"#0f172a",overflowX:"auto",lineHeight:1.6}}>{`{
  "rules": {
    "history": {
      ".indexOn": ["ts"],
      ".read": true,
      ".write": true,
      "$entry": {
        ".validate": "newData.hasChildren(
          ['ts','dateStr','slot','output'])"
      }
    }
  }
}`}</pre>
            <div style={{marginTop:8,fontSize:11,color:muted}}>Firebase Console → Realtime Database → Rules → Publish</div>
          </div>
        </div>}

        {tab==="history"&&<HistoryTab history={history} clearHistory={clearHistory} isDark={isDark}
          onLoad={h=>dispatch({type:"LOAD",output:h.output,scores:h.scores||[]})} setTab={setTab}/>}

        <div style={{marginTop:28,borderTop:`1px solid ${isDark?"rgba(255,255,255,.05)":"rgba(0,0,0,.06)"}`,paddingTop:20}}>
          <div style={{fontSize:10,fontFamily:"'Share Tech Mono',monospace",color:muted,letterSpacing:2,marginBottom:12}}>// 3-Agent Stock Hunter v0.9.1</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,fontSize:11}}>
            <div style={{background:"rgba(74,222,128,.04)",border:"1px solid rgba(74,222,128,.12)",borderRadius:10,padding:12}}>
              <div style={{color:"#4ade80",fontWeight:700,marginBottom:8}}>✓ v0.9.1</div>
              {["Quick Paste Parser (sub-tab)","รองรับข้อความทุกรูปแบบ","แก้ไขผลก่อน confirm","เลือก/ยกเลิก รายตัวได้"].map(t=>(
                <div key={t} style={{color:muted,marginBottom:4,paddingLeft:8,borderLeft:"2px solid rgba(74,222,128,.2)"}}>{t}</div>
              ))}
            </div>
            <div style={{background:"rgba(0,212,255,.03)",border:"1px solid rgba(0,212,255,.1)",borderRadius:10,padding:12}}>
              <div style={{color:"#00d4ff",fontWeight:700,marginBottom:8}}>◎ แผนถัดไป</div>
              {["Export → LINE message","Post-Trade Analysis","Portfolio tracker","Price alert","User field (CK/หมออาร์ม)"].map(t=>(
                <div key={t} style={{color:muted,marginBottom:4,paddingLeft:8,borderLeft:"2px solid rgba(0,212,255,.15)"}}>{t}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
