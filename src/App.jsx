import { useState, useCallback, useRef, useEffect } from "react";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@300;400;500&display=swap');`;
const G = `
  *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
  body{background:#07090f;overscroll-behavior:none;}
  textarea{resize:none;outline:none;border:none;}
  input{outline:none;border:none;}
  ::-webkit-scrollbar{width:3px;}
  ::-webkit-scrollbar-thumb{background:#1e3a4a;border-radius:2px;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes popIn{0%{transform:scale(.85);opacity:0}100%{transform:scale(1);opacity:1}}
  @keyframes slideIn{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}
`;

const C = {
  bg:"#07090f", card:"#0d1117", border:"#1a2535",
  cyan:"#00d4ff", green:"#00ff88", yellow:"#ffd93d",
  orange:"#ff8c42", red:"#ff4d6d", purple:"#c084fc",
  muted:"#4a6070", text:"#c8d8e8", dim:"#6b8090", star:"#c084fc",
};

const scoreColor = s => s<30?C.green:s<55?C.yellow:s<75?C.orange:C.red;
const scoreLabel = s => s<30?"Certitude très faible":s<55?"Certitude faible":s<75?"Certitude élevée":"Certitude très élevée";
const scoreEmoji = s => s<30?"👤":s<55?"🔎":s<75?"🤖":"🚨";

// ── Fournisseurs IA ───────────────────────────────────────────────────────────
const PROVIDERS = [
  { id:"claude",   name:"Claude",   company:"Anthropic",  icon:"🔮", color:"#00d4ff", model:"claude-sonnet-4-20250514", keyHint:"sk-ant-..." },
  { id:"gpt",      name:"GPT-4o",   company:"OpenAI",     icon:"🟢", color:"#10a37f", model:"gpt-4o",                   keyHint:"sk-..." },
  { id:"gemini",   name:"Gemini",   company:"Google",     icon:"💎", color:"#4285f4", model:"gemini-1.5-pro",           keyHint:"AIza..." },
  { id:"mistral",  name:"Mistral",  company:"Mistral AI", icon:"🌊", color:"#ff6b35", model:"mistral-large-latest",     keyHint:"..." },
  { id:"gptzero",  name:"GPTZero",  company:"Bursting (spécialisé IA)", icon:"🎯", color:"#a855f7", model:"v2/predict/text", keyHint:"gptzero-...", specialist:true },
];

const SYSTEM_PROMPT = `Expert forensique en détection de textes générés par IA. Réponds UNIQUEMENT en JSON valide sans backticks ni commentaires:
{"score":<0-100>,"verdict":"<Certitude très faible|Certitude faible|Certitude élevée|Certitude très élevée>","ai_probable":"<ChatGPT (OpenAI)|Claude (Anthropic)|Gemini (Google)|Mistral AI|Llama (Meta)|Indéterminé|Humain>","ai_confidence":<0-100>,"probable_prompt":"<prompt probable ou null>","language":"<Français 🇫🇷|Anglais 🇬🇧|Espagnol 🇪🇸|Autre>","style_markers":["m1","m2","m3"],"indices":["r1","r2","r3"]}`;

// ── Appels API par fournisseur ────────────────────────────────────────────────
async function callClaude(text, key) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{"Content-Type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01"},
    body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:800,
      system: SYSTEM_PROMPT,
      messages:[{role:"user",content:`Analyse:\n\n${text}`}] })
  });
  const d = await r.json();
  if(d.error) throw new Error("Claude: "+d.error.message);
  return JSON.parse(d.content.filter(b=>b.type==="text").map(b=>b.text).join("").replace(/```json|```/g,"").trim());
}

async function callGPT(text, key) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":`Bearer ${key}`},
    body:JSON.stringify({ model:"gpt-4o", max_tokens:800,
      messages:[{role:"system",content:SYSTEM_PROMPT},{role:"user",content:`Analyse:\n\n${text}`}] })
  });
  const d = await r.json();
  if(d.error) throw new Error("GPT: "+d.error.message);
  return JSON.parse(d.choices[0].message.content.replace(/```json|```/g,"").trim());
}

async function callGemini(text, key) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${key}`, {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ contents:[{ parts:[{ text: SYSTEM_PROMPT+"\n\nAnalyse:\n\n"+text }] }] })
  });
  const d = await r.json();
  if(d.error) throw new Error("Gemini: "+d.error.message);
  const raw = d.candidates[0].content.parts[0].text;
  return JSON.parse(raw.replace(/```json|```/g,"").trim());
}

async function callMistral(text, key) {
  const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":`Bearer ${key}`},
    body:JSON.stringify({ model:"mistral-large-latest", max_tokens:800,
      messages:[{role:"system",content:SYSTEM_PROMPT},{role:"user",content:`Analyse:\n\n${text}`}] })
  });
  const d = await r.json();
  if(d.error) throw new Error("Mistral: "+d.error.message);
  return JSON.parse(d.choices[0].message.content.replace(/```json|```/g,"").trim());
}

const API_CALLS = { claude:callClaude, gpt:callGPT, gemini:callGemini, mistral:callMistral, gptzero:callGPTZero };

async function callGPTZero(text, key) {
  const r = await fetch("https://api.gptzero.me/v2/predict/text", {
    method:"POST",
    headers:{"Content-Type":"application/json","x-api-key":key},
    body:JSON.stringify({ document:text })
  });
  const d = await r.json();
  if(d.error||d.status==="error") throw new Error("GPTZero: "+(d.error||d.message||"Erreur API"));
  const doc = d.documents?.[0] || d;
  const rawScore = doc.completely_generated_prob ?? doc.average_generated_prob ?? 0;
  const score = Math.min(Math.round(rawScore * 100), 100);
  const burstiness = doc.overall_burstiness?.toFixed(1) ?? "N/A";
  const avgGenProb = ((doc.average_generated_prob||0)*100).toFixed(1);
  const completeProb = ((doc.completely_generated_prob||0)*100).toFixed(1);
  const sentCount = doc.sentences?.length ?? 0;
  return {
    score,
    verdict: scoreLabel(score),
    ai_probable: "Indéterminé (GPTZero spécialisé)",
    ai_confidence: score,
    probable_prompt: null,
    language: "Indéterminé",
    style_markers: [
      `Burstiness : ${burstiness}`,
      "Détecteur spécialisé IA",
      `${sentCount} phrases analysées`
    ],
    indices: [
      `Probabilité générée complètement : ${completeProb}%`,
      `Probabilité moyenne générée : ${avgGenProb}%`,
      `Score burstiness (variance stylistique) : ${burstiness}`,
      `Nombre de phrases analysées : ${sentCount}`
    ]
  };
}

// ── Analyse locale gratuite ───────────────────────────────────────────────────
function analyzeLocal(text) {
  const sentences=text.split(/[.!?]+/).filter(s=>s.trim().length>4);
  const words=text.toLowerCase().match(/\b[a-záàâäéèêëîïôöùûüçœæ\w]+\b/g)||[];
  if(words.length<30) return null;
  const avgLen=words.length/Math.max(sentences.length,1);
  const s1=avgLen>17&&avgLen<36?22:5;
  const unique=new Set(words).size, diversity=unique/words.length;
  const s2=diversity<0.52?24:diversity<0.63?12:4;
  const aiP=["il est important","en conclusion","en résumé","il convient","par ailleurs","néanmoins","cependant","tout d'abord","ainsi","de plus","en outre","it is important","in conclusion","furthermore","however","overall","in summary"];
  const low=text.toLowerCase(), matches=aiP.filter(p=>low.includes(p)).length;
  const s3=Math.min(matches*9,28);
  const lens=sentences.map(s=>s.trim().split(/\s+/).length);
  const mean=lens.reduce((a,b)=>a+b,0)/lens.length;
  const variance=lens.reduce((a,b)=>a+Math.pow(b-mean,2),0)/lens.length;
  const s4=variance<18?18:variance<35?9:2;
  const score=Math.min(Math.max(s1+s2+s3+s4,5),92);
  const frW=["le","la","les","de","du","des","un","une","et","est","dans","pour"];
  const enW=["the","and","is","are","was","were","this","that","with","from"];
  const lang=frW.filter(w=>words.includes(w)).length>enW.filter(w=>words.includes(w)).length?"Français 🇫🇷":"Anglais 🇬🇧";
  return { score, verdict:scoreLabel(score), ai_probable:"Analyse heuristique", ai_confidence:0,
    probable_prompt:null, language:lang, style_markers:["Analyse heuristique · mode gratuit"],
    indices:[`Longueur moy. des phrases : ${avgLen.toFixed(1)} mots`,`Diversité lexicale : ${(diversity*100).toFixed(0)}%`,`Marqueurs IA détectés : ${matches}`,`Variance des phrases : ${variance.toFixed(1)}`] };
}

// ── Plans ─────────────────────────────────────────────────────────────────────
const PLANS = [
  { id:"unit",      label:"À l'unité",   price:"1,99€",  sub:"par analyse",              credits:1,     badge:null,               color:C.cyan,   icon:"🔍", unlimited:false },
  { id:"pack10",    label:"Pack 10",     price:"3,99€",  sub:"soit 0,40€ / analyse",     credits:10,    badge:"−80%",             color:C.green,  icon:"📦", unlimited:false },
  { id:"sub200",    label:"200 / mois",  price:"9,99€",  sub:"abonnement mensuel",        credits:200,   badge:"Populaire",        color:C.purple, icon:"⚡", unlimited:false },
  { id:"sub500",    label:"500 / mois",  price:"19,99€", sub:"abonnement mensuel",        credits:500,   badge:"Meilleure valeur", color:C.yellow, icon:"🚀", unlimited:false },
  { id:"unlimited", label:"Illimité",    price:"39,99€", sub:"abonnement mensuel · ∞",    credits:99999, badge:"∞ Sans limite",    color:C.red,    icon:"♾️", unlimited:true  },
];

// ── Composants ────────────────────────────────────────────────────────────────
function ScoreArc({score, size=140}){
  const col=scoreColor(score), r=54*(size/140), cx=size/2, cy=size*0.5,
    circ=2*Math.PI*r, arc=circ*0.75, filled=arc*(score/100), offset=circ*0.125;
  return(
    <svg width={size} height={size*0.79} style={{overflow:"visible"}}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.border} strokeWidth="10" strokeDasharray={`${arc} ${circ-arc}`} strokeDashoffset={-offset} strokeLinecap="round"/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={col} strokeWidth="10" strokeDasharray={`${filled} ${circ-filled}`} strokeDashoffset={-offset} strokeLinecap="round" style={{filter:`drop-shadow(0 0 8px ${col})`,transition:"stroke-dasharray 1s ease"}}/>
      <text x={cx} y={cy-4} textAnchor="middle" fill={col} style={{fontSize:28*(size/140),fontFamily:"'Syne',sans-serif",fontWeight:800}}>{score}%</text>
      <text x={cx} y={cy+18*(size/140)} textAnchor="middle" fill={C.dim} style={{fontSize:10,fontFamily:"'DM Mono',monospace"}}>CERTITUDE IA</text>
    </svg>
  );
}

function Bdg({label,value,color}){
  return(
    <div style={{background:"#0a1420",border:`1px solid ${color||C.border}22`,borderRadius:8,padding:"10px 14px",display:"flex",flexDirection:"column",gap:3}}>
      <span style={{fontSize:9,color:C.muted,letterSpacing:1,textTransform:"uppercase"}}>{label}</span>
      <span style={{fontSize:12,color:color||C.text,fontFamily:"'DM Mono',monospace",fontWeight:500}}>{value}</span>
    </div>
  );
}

function Stars({value,onChange}){
  return(
    <div style={{display:"flex",gap:8,alignItems:"center"}}>
      {[1,2,3,4,5].map(i=>(
        <button key={i} onClick={()=>onChange(i)} style={{background:"none",border:"none",cursor:"pointer",padding:4,fontSize:26,opacity:i<=value?1:0.2,filter:i<=value?`drop-shadow(0 0 6px ${C.star})`:"none",transition:"all .2s"}}>★</button>
      ))}
      {value>0&&<span style={{fontSize:13,color:C.star,fontFamily:"'Syne',sans-serif",fontWeight:700,marginLeft:4}}>{value}<span style={{fontSize:10,color:C.muted,fontWeight:400}}> / 5</span></span>}
    </div>
  );
}

function CreditBar({current,total,color}){
  return(
    <div style={{background:"#0a1117",borderRadius:4,height:5,overflow:"hidden",marginTop:8}}>
      <div style={{height:"100%",width:`${Math.min((current/total)*100,100)}%`,background:color,borderRadius:4,transition:"width .6s ease",boxShadow:`0 0 6px ${color}88`}}/>
    </div>
  );
}

function BackBtn({onClick}){
  return <button onClick={onClick} style={{background:"#0d1117",border:`1px solid ${C.border}`,color:C.dim,borderRadius:10,padding:"8px 14px",fontSize:12,cursor:"pointer",fontFamily:"'DM Mono',monospace",flexShrink:0}}>← Retour</button>;
}

function Spinner({color}){
  return <span style={{width:13,height:13,border:`2px solid ${color||C.cyan}44`,borderTopColor:color||C.cyan,borderRadius:"50%",display:"inline-block",animation:"spin .8s linear infinite"}}/>;
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function Detectia(){
  const [screen,setScreen]=useState("home");
  const [mode,setMode]=useState("free");
  const [plan,setPlan]=useState(null);
  const [credits,setCredits]=useState(0);
  const [text,setText]=useState("");
  const [result,setResult]=useState(null);      // single result
  const [crossResults,setCrossResults]=useState({}); // {providerId: result|"loading"|"error"}
  const [analysisMode,setAnalysisMode]=useState("single"); // single|cross
  const [selectedProvider,setSelectedProvider]=useState("claude");
  const [apiKeys,setApiKeys]=useState({}); // {providerId: key}
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [rating,setRating]=useState(0);
  const [comment,setComment]=useState("");
  const [feedbacks,setFeedbacks]=useState([]);
  const [showHint,setShowHint]=useState(false);
  const [buySuccess,setBuySuccess]=useState(false);
  const [keyVisibility,setKeyVisibility]=useState({});
  const [testStatus,setTestStatus]=useState({});
  const longTimer=useRef(null);

  useEffect(()=>{
    (async()=>{
      try{
        const fb=await window.storage.get("detectia-feedbacks"); if(fb) setFeedbacks(JSON.parse(fb.value));
        const pl=await window.storage.get("detectia-plan"); if(pl){ const d=JSON.parse(pl.value); setPlan(d); setCredits(d.credits||0); }
        const keys=await window.storage.get("detectia-keys"); if(keys) setApiKeys(JSON.parse(keys.value));
      }catch{}
    })();
  },[]);

  const saveKeys=async(k)=>{ setApiKeys(k); try{ await window.storage.set("detectia-keys",JSON.stringify(k)); }catch{} };
  const wc=(text.match(/\b\S+\b/g)||[]).length;
  const cp=PLANS.find(p=>p.id===plan?.id);
  const configuredProviders=PROVIDERS.filter(p=>apiKeys[p.id]?.trim());

  const onTouchStart=()=>{
    longTimer.current=setTimeout(()=>{
      const sel=window.getSelection?.()?.toString?.()||"";
      if(sel.length>20){ setText(sel); setShowHint(true); setTimeout(()=>setShowHint(false),3000); }
    },600);
  };

  const buyPlan=async(p)=>{
    const d={...p,credits:p.credits}; setPlan(d); setCredits(p.credits);
    try{ await window.storage.set("detectia-plan",JSON.stringify(d)); }catch{}
    setBuySuccess(true);
    setTimeout(()=>{ setBuySuccess(false); setMode("premium"); setScreen("analyze"); },2000);
  };

  const testKey=async(pid)=>{
    const key=apiKeys[pid]; if(!key) return;
    setTestStatus(s=>({...s,[pid]:"testing"}));
    try{
      await API_CALLS[pid]("This is a test sentence to verify the API key works correctly.", key);
      setTestStatus(s=>({...s,[pid]:"ok"}));
    }catch(e){ setTestStatus(s=>({...s,[pid]:"error"})); }
  };

  // Analyse unique
  const analyzeSingle=useCallback(async()=>{
    setError(""); setResult(null);
    if(wc<30){ setError("⚠️ Minimum 30 mots requis."); return; }
    if(mode==="premium"&&credits<=0){ setError("❌ Plus de crédits disponibles."); return; }
    setLoading(true);
    try{
      let r;
      if(mode==="free"){ r=analyzeLocal(text); if(!r){ setError("Texte non analysable."); setLoading(false); return; } }
      else{
        const key=apiKeys[selectedProvider];
        if(!key){ setError(`Clé API ${PROVIDERS.find(p=>p.id===selectedProvider)?.name} manquante. Configurez-la dans les paramètres.`); setLoading(false); return; }
        r=await API_CALLS[selectedProvider](text,key);
        r._provider=selectedProvider;
        const nc=credits-1; setCredits(nc);
        try{ await window.storage.set("detectia-plan",JSON.stringify({...plan,credits:nc})); }catch{}
      }
      setResult(r); setScreen("result"); setRating(0); setComment("");
    }catch(e){ setError("Erreur : "+(e.message||"Vérifiez votre clé API.")); }
    finally{ setLoading(false); }
  },[mode,text,credits,plan,selectedProvider,apiKeys,wc]);

  // Cross-analyse (tous les fournisseurs configurés)
  const analyzeCross=useCallback(async()=>{
    setError(""); setCrossResults({});
    if(wc<30){ setError("⚠️ Minimum 30 mots requis."); return; }
    if(configuredProviders.length<2){ setError("Configurez au moins 2 clés API dans les paramètres pour la cross-analyse."); return; }
    const cost=configuredProviders.length;
    if(credits<cost){ setError(`❌ La cross-analyse avec ${cost} IA nécessite ${cost} crédits (vous en avez ${credits}).`); return; }
    setLoading(true);
    const init={};
    configuredProviders.forEach(p=>{ init[p.id]="loading"; });
    setCrossResults({...init});
    setScreen("cross");
    let usedCredits=0;
    await Promise.all(configuredProviders.map(async(p)=>{
      try{
        const r=await API_CALLS[p.id](text,apiKeys[p.id]);
        r._provider=p.id;
        setCrossResults(prev=>({...prev,[p.id]:r}));
        usedCredits++;
      }catch(e){
        setCrossResults(prev=>({...prev,[p.id]:{error:e.message||"Erreur"}}));
      }
    }));
    const nc=credits-usedCredits; setCredits(nc);
    try{ await window.storage.set("detectia-plan",JSON.stringify({...plan,credits:nc})); }catch{}
    setLoading(false);
  },[text,credits,plan,configuredProviders,apiKeys,wc]);

  const analyze=()=>analysisMode==="cross"?analyzeCross():analyzeSingle();

  const saveFeedback=async()=>{
    if(!rating) return;
    const entry={id:Date.now(),date:new Date().toLocaleDateString("fr-FR"),score:result?.score,verdict:result?.verdict,ai:result?.ai_probable,mode,provider:result?._provider||"local",rating,comment};
    const upd=[entry,...feedbacks].slice(0,100);
    setFeedbacks(upd); try{ await window.storage.set("detectia-feedbacks",JSON.stringify(upd)); }catch{}
    setScreen("home"); setText(""); setResult(null);
  };

  const col=result?scoreColor(result.score):C.cyan;
  const providerInfo=result?._provider?PROVIDERS.find(p=>p.id===result._provider):null;

  // ── HOME ────────────────────────────────────────────────────────────────────
  if(screen==="home") return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",padding:"0 20px 80px",fontFamily:"'DM Mono',monospace"}}>
      <style>{FONTS}{G}</style>
      <div style={{width:"100%",maxWidth:440,paddingTop:52,animation:"fadeUp .6s ease"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:32,fontWeight:800,color:C.cyan,letterSpacing:-1,lineHeight:1}}>DETECTIA</div>
            <div style={{fontSize:10,color:C.muted,letterSpacing:3,marginTop:4}}>FORENSIQUE IA · ANALYSE TEXTUELLE</div>
          </div>
          <button onClick={()=>setScreen("settings")} style={{background:"#0a1520",border:`1px solid ${C.border}`,borderRadius:12,width:44,height:44,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,cursor:"pointer"}}>⚙️</button>
        </div>
        <div style={{height:1,background:`linear-gradient(to right,transparent,${C.cyan}44,transparent)`,margin:"18px 0"}}/>

        {/* Fournisseurs configurés */}
        {configuredProviders.length>0&&(
          <div style={{background:"#0a1018",border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",marginBottom:14}}>
            <div style={{fontSize:9,color:C.muted,letterSpacing:2,marginBottom:10,textTransform:"uppercase"}}>IA configurées</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {configuredProviders.map(p=>(
                <div key={p.id} style={{display:"flex",alignItems:"
