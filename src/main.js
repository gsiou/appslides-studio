(() => {
  "use strict";

  const DEVICE = {
    iphone: { name:"iPhone 15 Plus", w:1284, h:2778, ratio:2778/1284, shellRadius:.078, screenPad:.027, screenRadius:.060 },
    ipad:   { name:"iPad Pro", w:2048, h:2732, ratio:2732/2048, shellRadius:.040, screenPad:.033, screenRadius:.026 },
    ipadLandscape:{ name:"iPad Pro Landscape", w:2732, h:2048, ratio:2048/2732, shellRadius:.040, screenPad:.033, screenRadius:.026 },
    ipadLandscapeSmall:{ name:"iPad Landscape Small", w:2732, h:2048, ratio:(1620/2160)*(1-.066)+.066, screenRatio:1620/2160, frameScale:.82, imageFit:"contain", shellRadius:.040, screenPad:.033, screenRadius:.026 },
    s24:    { name:"Galaxy S24", w:1080, h:2340, ratio:2340/1080, shellRadius:.064, screenPad:.023, screenRadius:.051 }
  };

  const defaultSlide = () => ({
    device:"iphone",
    eyebrow:"DESIGNED FOR MOBILE",
    headline:"Your strongest\nfeature goes here.",
    subhead:"Use one clear benefit, then let the product screenshot do the convincing.",
    headlineSize:90,
    textWidth:82,
    textX:8,
    textY:8.5,
    headlineColor:"#ffffff",
    subheadColor:"#d9e1f2",
    textAlign:"left",
    screenshotData:"",
    screenshotFit:"cover",
    phoneScale:78,
    phoneRotation:0,
    phoneX:50,
    phoneY:58,
    frameColor:"#0d1117",
    shadow:76,
    bg1:"#0b1020",
    bg2:"#17143a",
    bg3:"#312e81",
    bgAngle:135,
    showDots:true,
    showCurve:true,
    textureOpacity:40,
    glow1:{color:"#22d3ee",x:12,y:13,size:46,opacity:58,softness:78},
    glow2:{color:"#8b5cf6",x:92,y:38,size:52,opacity:62,softness:82},
    logoData:"",
    logo:{x:82,y:8,scale:12,opacity:100},
    showCallout:true,
    calloutTitle:"Fast to scan",
    calloutSub:"Optional proof point",
    calloutX:76,
    calloutY:26
  });

  const STORAGE_KEY = "appslides-studio-project";
  const LEGACY_STORAGE_KEY = "storeshot-studio-project";

  const defaultProject = () => ({
    version:1,
    name:"My App Screenshots",
    active:0,
    slides:[defaultSlide()]
  });

  function normalizeSlide(slide={}){
    const base=defaultSlide();
    const normalizedPhoneY=Number(slide.phoneY)===64 ? base.phoneY : slide.phoneY;
    return Object.assign(base,slide,{
      device:DEVICE[slide.device] ? slide.device : base.device,
      phoneY:normalizedPhoneY,
      glow1:Object.assign(base.glow1,slide.glow1||{}),
      glow2:Object.assign(base.glow2,slide.glow2||{}),
      logo:Object.assign(base.logo,slide.logo||{})
    });
  }

  function normalizeProject(raw){
    const base=defaultProject();
    if(!raw || !Array.isArray(raw.slides) || !raw.slides.length) return base;
    const slides=raw.slides.map(normalizeSlide);
    const active=Math.min(Math.max(Number(raw.active)||0,0),slides.length-1);
    return {
      version:1,
      name:typeof raw.name==="string" && raw.name.trim() ? raw.name : base.name,
      active,
      slides
    };
  }

  function loadSavedProject(){
    try{
      const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      return normalizeProject(JSON.parse(saved));
    }catch{
      try{ localStorage.removeItem(STORAGE_KEY); }catch{}
      return defaultProject();
    }
  }

  function persistProject(){
    try{
      localStorage.setItem(STORAGE_KEY,JSON.stringify(project));
      setStatus("Saved locally");
    }catch{
      setStatus("Local storage is full");
    }
  }

  function commitProjectChange(){
    persistProject();
    queueRender();
  }

  let project = loadSavedProject();

  const $ = sel => document.querySelector(sel);
  const $$ = sel => [...document.querySelectorAll(sel)];
  const preview = $("#previewCanvas");
  const pctx = preview.getContext("2d");
  const stageShell = $("#stageShell");
  const statusEl = $("#status");
  const toastEl = $("#toast");
  const imgCache = new Map();
  let renderQueued = false;
  let guides = false;

  const current = () => project.slides[project.active];

  function toast(message){
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  function setStatus(message){ statusEl.textContent = message; }

  function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

  function getPath(obj,path){
    return path.split(".").reduce((o,k)=>o?.[k],obj);
  }
  function setPath(obj,path,value){
    const keys=path.split(".");
    let o=obj;
    keys.slice(0,-1).forEach(k=>o=o[k]);
    o[keys.at(-1)] = value;
  }

  function isNumericInput(el){ return el.type === "range" || el.type === "number"; }

  function syncControls(){
    const s=current();
    $$("[data-bind]").forEach(el=>{
      const v=getPath(s,el.dataset.bind);
      if(el.type==="checkbox") el.checked=!!v;
      else el.value=v ?? "";
    });
    $$("[data-value]").forEach(el=>{
      const path=el.dataset.value, v=getPath(s,path);
      const suffix = path.includes("opacity") || ["textWidth","textX","textY","phoneScale","phoneX","phoneY","shadow","textureOpacity","calloutX","calloutY"].includes(path) || path.startsWith("logo.") || path.endsWith(".x") || path.endsWith(".y") || path.endsWith(".size") || path.endsWith(".softness") ? "%" : path==="phoneRotation" || path==="bgAngle" ? "°" : "px";
      el.textContent = `${v}${suffix}`;
    });
    $("#projectName").value=project.name;
    $("#dimensions").textContent=`${DEVICE[s.device].w} × ${DEVICE[s.device].h}`;
    renderSlides();
    resizePreview();
    queueRender();
  }

  function renderSlides(){
    const host=$("#slides"); host.innerHTML="";
    project.slides.forEach((s,i)=>{
      const b=document.createElement("button");
      b.className="slide-chip"+(i===project.active?" active":"");
      const title=(s.headline||"Untitled").replace(/\n/g," ");
      b.textContent=`${i+1}. ${title}`;
      b.title=title;
      b.onclick=()=>{ project.active=i; syncControls();persistProject(); };
      host.appendChild(b);
    });
  }

  function resizePreview(){
    const s=current(), d=DEVICE[s.device];
    const wrap=$("#dropZone");
    const maxW=Math.max(240,wrap.clientWidth-56);
    const maxH=Math.max(420,wrap.clientHeight-56);
    let cssW=Math.min(maxW,maxH*(d.w/d.h));
    let cssH=cssW*(d.h/d.w);
    stageShell.style.width=cssW+"px";
    stageShell.style.height=cssH+"px";
    preview.width=d.w;
    preview.height=d.h;
  }

  function queueRender(){
    if(renderQueued) return;
    renderQueued=true;
    requestAnimationFrame(()=>{ renderQueued=false; renderProject(preview,current(),guides); });
  }

  function hexToRgb(hex){
    const h=hex.replace("#","");
    const v=parseInt(h.length===3?h.split("").map(c=>c+c).join(""):h,16);
    return {r:(v>>16)&255,g:(v>>8)&255,b:v&255};
  }
  function rgba(hex,a){
    const {r,g,b}=hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }

  function roundedRect(ctx,x,y,w,h,r){
    r=Math.max(0,Math.min(r,Math.min(w,h)/2));
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }

  function gradientLine(w,h,angleDeg){
    const a=(angleDeg-90)*Math.PI/180;
    const cx=w/2,cy=h/2;
    const len=Math.abs(w*Math.cos(a))+Math.abs(h*Math.sin(a));
    return [cx-Math.cos(a)*len/2,cy-Math.sin(a)*len/2,cx+Math.cos(a)*len/2,cy+Math.sin(a)*len/2];
  }

  function drawGlow(ctx,w,h,g){
    const x=w*g.x/100,y=h*g.y/100,r=w*g.size/100;
    const soft=Math.max(.05,Math.min(.95,g.softness/100));
    const grad=ctx.createRadialGradient(x,y,0,x,y,r);
    grad.addColorStop(0,rgba(g.color,g.opacity/100));
    grad.addColorStop(Math.max(.05,1-soft),rgba(g.color,(g.opacity/100)*.55));
    grad.addColorStop(1,rgba(g.color,0));
    ctx.fillStyle=grad;ctx.fillRect(x-r,y-r,r*2,r*2);
  }

  function wrapLines(ctx,text,maxWidth){
    const explicit=String(text??"").split("\n");
    const lines=[];
    for(const para of explicit){
      const words=para.split(/\s+/).filter(Boolean);
      if(!words.length){lines.push("");continue}
      let line=words[0];
      for(let i=1;i<words.length;i++){
        const test=line+" "+words[i];
        if(ctx.measureText(test).width>maxWidth){lines.push(line);line=words[i]}
        else line=test;
      }
      lines.push(line);
    }
    return lines;
  }

  function drawTextBlock(ctx,s,w,h){
    const x=w*s.textX/100,y=h*s.textY/100,maxW=w*s.textWidth/100;
    const align=s.textAlign;
    const anchor=align==="left"?x:align==="center"?x+maxW/2:x+maxW;
    ctx.textAlign=align;
    ctx.textBaseline="alphabetic";

    const pillH=w*.045,pillPad=w*.022;
    ctx.font=`700 ${Math.round(w*.016)}px Inter, Arial, sans-serif`;
    const pillText=String(s.eyebrow||"").trim().toUpperCase();
    if(pillText){
      const pillW=ctx.measureText(pillText).width+pillPad*2;
      const pillX=align==="left"?x:align==="center"?anchor-pillW/2:anchor-pillW;
      ctx.fillStyle="rgba(255,255,255,.12)";
      ctx.strokeStyle="rgba(255,255,255,.18)";
      ctx.lineWidth=Math.max(1,w*.0015);
      roundedRect(ctx,pillX,y,pillW,pillH,pillH/2);ctx.fill();ctx.stroke();
      ctx.fillStyle="#ffffff";ctx.textAlign="center";
      ctx.fillText(pillText,pillX+pillW/2,y+pillH*.66);
      ctx.textAlign=align;
    }

    const headlinePx=w*(s.headlineSize/1290);
    ctx.font=`800 ${headlinePx}px Inter, Arial, sans-serif`;
    ctx.fillStyle=s.headlineColor;
    const headLines=wrapLines(ctx,s.headline,maxW);
    const headLH=headlinePx*1.08;
    let ty=pillText ? y+pillH+w*.075 : y;
    for(const line of headLines){ctx.fillText(line,anchor,ty);ty+=headLH}

    const subPx=w*.024;
    ctx.font=`400 ${subPx}px Inter, Arial, sans-serif`;
    ctx.fillStyle=s.subheadColor;
    const subLines=wrapLines(ctx,s.subhead,maxW);
    ty+=w*.022;
    const subLH=subPx*1.4;
    for(const line of subLines){ctx.fillText(line,anchor,ty);ty+=subLH}
  }

  function getImage(src){
    if(!src) return null;
    if(imgCache.has(src)) return imgCache.get(src);
    const img=new Image();
    const rec={img,ready:false,error:false};
    img.onload=()=>{rec.ready=true;queueRender()};
    img.onerror=()=>{rec.error=true;queueRender()};
    img.src=src;
    imgCache.set(src,rec);
    return rec;
  }

  function drawImageFit(ctx,img,x,y,w,h,fit="cover"){
    const ir=img.width/img.height, rr=w/h;
    let dw,dh,dx,dy;
    if((fit==="cover" && ir>rr)||(fit==="contain" && ir<rr)){dh=h;dw=h*ir}
    else{dw=w;dh=w/ir}
    dx=x+(w-dw)/2;dy=y+(h-dh)/2;
    ctx.drawImage(img,dx,dy,dw,dh);
  }

  function drawPlaceholderUI(ctx,x,y,w,h,s){
    ctx.fillStyle="#f8fafc";ctx.fillRect(x,y,w,h);
    ctx.fillStyle="#ffffff";ctx.fillRect(x,y,w,h*.06);
    ctx.fillStyle=s.glow2.color;ctx.beginPath();ctx.arc(x+w*.08,y+h*.03,w*.022,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#0f172a";roundedRect(ctx,x+w*.13,y+h*.019,w*.26,h*.014,h*.007);ctx.fill();
    ctx.fillStyle="#cbd5e1";roundedRect(ctx,x+w*.13,y+h*.040,w*.18,h*.009,h*.005);ctx.fill();
    const cardGrad=ctx.createLinearGradient(x+w*.04,y+h*.08,x+w*.96,y+h*.23);
    cardGrad.addColorStop(0,s.glow2.color);cardGrad.addColorStop(1,s.glow1.color);
    ctx.fillStyle=cardGrad;roundedRect(ctx,x+w*.04,y+h*.08,w*.92,h*.13,w*.035);ctx.fill();
    for(let i=0;i<4;i++){
      const cy=y+h*(.25+i*.14);
      ctx.fillStyle="#fff";roundedRect(ctx,x+w*.04,cy,w*.92,h*.11,w*.025);ctx.fill();
      ctx.fillStyle=rgba(s.glow2.color,.16+i*.04);ctx.beginPath();ctx.arc(x+w*.11,cy+h*.035,w*.028,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#172033";roundedRect(ctx,x+w*.17,cy+h*.022,w*.34,h*.013,h*.006);ctx.fill();
      ctx.fillStyle="#cbd5e1";roundedRect(ctx,x+w*.17,cy+h*.048,w*.26,h*.009,h*.004);ctx.fill();
      ctx.fillStyle="#e2e8f0";roundedRect(ctx,x+w*.08,cy+h*.075,w*.72,h*.008,h*.004);ctx.fill();
    }
    ctx.fillStyle="#64748b";
    ctx.textAlign="center";ctx.font=`700 ${w*.045}px Inter, Arial, sans-serif`;
    ctx.fillText("PASTE OR UPLOAD",x+w/2,y+h*.88);
    ctx.font=`400 ${w*.028}px Inter, Arial, sans-serif`;
    ctx.fillText("your app screenshot",x+w/2,y+h*.915);
  }

  function drawPhone(ctx,s,w,h){
    const d=DEVICE[s.device];
    const baseW=w*.70*(s.phoneScale/78)*(d.frameScale||1);
    const baseH=baseW*d.ratio;
    const cx=w*s.phoneX/100,cy=h*s.phoneY/100;
    const x=-baseW/2,y=-baseH/2;
    const shellR=baseW*d.shellRadius;
    const pad=baseW*d.screenPad;
    const sx=x+pad,sy=y+pad,sw=baseW-2*pad,sh=baseH-2*pad;
    const screenR=baseW*d.screenRadius;

    ctx.save();
    ctx.translate(cx,cy);
    ctx.rotate(s.phoneRotation*Math.PI/180);

    if(s.shadow>0){
      ctx.save();
      ctx.shadowColor=`rgba(0,0,0,${.25+.55*s.shadow/100})`;
      ctx.shadowBlur=w*(.02+.07*s.shadow/100);
      ctx.shadowOffsetY=w*.035;
      ctx.fillStyle="#05070b";
      roundedRect(ctx,x+baseW*.025,y+baseW*.025,baseW*.95,baseH*.97,shellR);ctx.fill();
      ctx.restore();
    }

    const metal=ctx.createLinearGradient(x,y,x+baseW,y);
    metal.addColorStop(0,"#111827");metal.addColorStop(.18,s.frameColor);
    metal.addColorStop(.5,"#05070b");metal.addColorStop(.82,s.frameColor);metal.addColorStop(1,"#0b0f17");
    ctx.fillStyle=metal;roundedRect(ctx,x,y,baseW,baseH,shellR);ctx.fill();
    ctx.lineWidth=Math.max(2,baseW*.004);
    ctx.strokeStyle="rgba(255,255,255,.24)";
    roundedRect(ctx,x+baseW*.009,y+baseW*.009,baseW*.982,baseH-baseW*.018,shellR-baseW*.008);ctx.stroke();

    ctx.save();
    roundedRect(ctx,sx,sy,sw,sh,screenR);ctx.clip();
    ctx.fillStyle="#0b1020";ctx.fillRect(sx,sy,sw,sh);
    const rec=getImage(s.screenshotData);
    if(rec?.ready) drawImageFit(ctx,rec.img,sx,sy,sw,sh,d.imageFit||s.screenshotFit);
    else drawPlaceholderUI(ctx,sx,sy,sw,sh,s);
    ctx.restore();

    if(s.device==="iphone"){
      const islandW=baseW*.26,islandH=baseW*.073;
      ctx.fillStyle="#030303";roundedRect(ctx,-islandW/2,sy+baseW*.026,islandW,islandH,islandH/2);ctx.fill();
      ctx.fillStyle="#172033";ctx.beginPath();ctx.arc(islandW*.26,sy+baseW*.062,baseW*.009,0,Math.PI*2);ctx.fill();
    }else if(s.device==="ipad" || s.device==="ipadLandscape"){
      ctx.fillStyle="#030303";ctx.beginPath();ctx.arc(0,sy+baseW*.030,baseW*.010,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#172033";ctx.beginPath();ctx.arc(0,sy+baseW*.030,baseW*.004,0,Math.PI*2);ctx.fill();
    }else{
      ctx.fillStyle="#030303";ctx.beginPath();ctx.arc(0,sy+baseW*.034,baseW*.016,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#172033";ctx.beginPath();ctx.arc(0,sy+baseW*.034,baseW*.006,0,Math.PI*2);ctx.fill();
    }

    ctx.strokeStyle="rgba(255,255,255,.13)";
    ctx.lineWidth=Math.max(1,baseW*.003);
    roundedRect(ctx,sx,sy,sw,sh,screenR);ctx.stroke();

    ctx.restore();
  }

  function drawLogo(ctx,s,w,h){
    if(!s.logoData)return;
    const rec=getImage(s.logoData);if(!rec?.ready)return;
    const targetW=w*s.logo.scale/100;
    const ratio=rec.img.height/rec.img.width;
    const targetH=targetW*ratio;
    ctx.save();ctx.globalAlpha=s.logo.opacity/100;
    ctx.drawImage(rec.img,w*s.logo.x/100-targetW/2,h*s.logo.y/100-targetH/2,targetW,targetH);
    ctx.restore();
  }

  function drawCallout(ctx,s,w,h){
    if(!s.showCallout)return;
    const boxW=w*.235,boxH=w*.090;
    const x=w*s.calloutX/100-boxW/2,y=h*s.calloutY/100-boxH/2;
    ctx.save();
    ctx.shadowColor="rgba(0,0,0,.22)";ctx.shadowBlur=w*.025;ctx.shadowOffsetY=w*.01;
    ctx.fillStyle="#fff";roundedRect(ctx,x,y,boxW,boxH,w*.025);ctx.fill();
    ctx.restore();
    const r=boxH*.23,cx=x+boxH*.35,cy=y+boxH/2;
    ctx.fillStyle=s.glow2.color;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#fff";ctx.lineWidth=w*.004;ctx.lineCap="round";ctx.lineJoin="round";
    ctx.beginPath();ctx.moveTo(cx-r*.35,cy);ctx.lineTo(cx-r*.05,cy+r*.32);ctx.lineTo(cx+r*.52,cy-r*.45);ctx.stroke();
    ctx.textAlign="left";ctx.fillStyle="#111827";ctx.font=`700 ${w*.0165}px Inter, Arial, sans-serif`;
    ctx.fillText(s.calloutTitle,x+boxH*.68,y+boxH*.43);
    ctx.fillStyle="#64748b";ctx.font=`400 ${w*.013}px Inter, Arial, sans-serif`;
    ctx.fillText(s.calloutSub,x+boxH*.68,y+boxH*.70);
  }

  function drawTexture(ctx,s,w,h){
    const alpha=(s.textureOpacity/100)*.32;
    if(s.showDots){
      ctx.fillStyle=`rgba(255,255,255,${alpha})`;
      const step=w*.032,r=w*.0027;
      for(let iy=0;iy<4;iy++)for(let ix=0;ix<7;ix++){
        ctx.beginPath();ctx.arc(w*(.065)+ix*step,h*(.205)+iy*step,r,0,Math.PI*2);ctx.fill();
      }
    }
    if(s.showCurve){
      ctx.strokeStyle=`rgba(255,255,255,${alpha*.8})`;
      ctx.lineWidth=Math.max(2,w*.0022);
      ctx.beginPath();ctx.moveTo(-w*.06,h*.24);ctx.bezierCurveTo(w*.25,h*.17,w*.52,h*.33,w*1.10,h*.24);ctx.stroke();
    }
  }

  function drawGuides(ctx,w,h){
    ctx.save();ctx.setLineDash([w*.011,w*.009]);ctx.lineWidth=Math.max(2,w*.0015);ctx.strokeStyle="rgba(255,255,255,.38)";
    roundedRect(ctx,w*.04,h*.025,w*.92,h*.95,w*.012);ctx.stroke();
    ctx.beginPath();ctx.moveTo(w*.08,h*.22);ctx.lineTo(w*.92,h*.22);ctx.stroke();
    ctx.restore();
  }

  function renderProject(canvas,s,withGuides=false){
    const d=DEVICE[s.device],ctx=canvas.getContext("2d");
    if(canvas.width!==d.w||canvas.height!==d.h){canvas.width=d.w;canvas.height=d.h}
    const w=canvas.width,h=canvas.height;
    ctx.clearRect(0,0,w,h);
    const [x0,y0,x1,y1]=gradientLine(w,h,s.bgAngle);
    const bg=ctx.createLinearGradient(x0,y0,x1,y1);
    bg.addColorStop(0,s.bg1);bg.addColorStop(.54,s.bg2);bg.addColorStop(1,s.bg3);
    ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
    drawGlow(ctx,w,h,s.glow1);drawGlow(ctx,w,h,s.glow2);
    drawTexture(ctx,s,w,h);
    drawTextBlock(ctx,s,w,h);
    drawPhone(ctx,s,w,h);
    drawCallout(ctx,s,w,h);
    drawLogo(ctx,s,w,h);
    if(withGuides) drawGuides(ctx,w,h);
  }

  function readAsDataURL(file){
    return new Promise((resolve,reject)=>{
      const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);
    });
  }

  async function setScreenshotFile(file){
    if(!file||!file.type.startsWith("image/"))return;
    setStatus("Loading screenshot…");
    current().screenshotData=await readAsDataURL(file);
    commitProjectChange();setStatus("Screenshot loaded");toast("Screenshot replaced");
  }

  async function setLogoFile(file){
    if(!file||!file.type.startsWith("image/"))return;
    current().logoData=await readAsDataURL(file);
    commitProjectChange();toast("Logo added");
  }

  async function pasteFromClipboard(){
    try{
      const items=await navigator.clipboard.read();
      for(const item of items){
        const type=item.types.find(t=>t.startsWith("image/"));
        if(type){await setScreenshotFile(await item.getType(type));return}
      }
      toast("Clipboard does not contain an image");
    }catch(err){
      toast("Clipboard access was blocked — use Ctrl/⌘ V or Upload");
    }
  }

  function handlePaste(e){
    const target=e.target;
    if(target && ["INPUT","TEXTAREA"].includes(target.tagName)) return;
    const item=[...e.clipboardData.items].find(i=>i.type.startsWith("image/"));
    if(item){e.preventDefault();setScreenshotFile(item.getAsFile())}
  }

  function sanitizeName(name){return String(name||"appslides").trim().replace(/[^\w\-]+/g,"_").replace(/^_+|_+$/g,"")||"appslides"}

  function canvasBlob(canvas,type="image/png",quality=1){
    return new Promise(resolve=>canvas.toBlob(resolve,type,quality));
  }

  async function renderBlobForSlide(s){
    const c=document.createElement("canvas");
    const d=DEVICE[s.device];c.width=d.w;c.height=d.h;
    renderProject(c,s,false);
    await waitForSlideImages(s);
    renderProject(c,s,false);
    return canvasBlob(c);
  }

  function waitForImage(src){
    return new Promise(resolve=>{
      if(!src)return resolve();
      const rec=getImage(src);
      if(rec.ready||rec.error)return resolve();
      const check=()=>rec.ready||rec.error?resolve():setTimeout(check,30);check();
    });
  }
  async function waitForSlideImages(s){
    await Promise.all([waitForImage(s.screenshotData),waitForImage(s.logoData)]);
  }

  function downloadBlob(blob,name){
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1500);
  }

  async function exportCurrent(){
    setStatus("Rendering PNG…");
    const s=current(),blob=await renderBlobForSlide(s);
    const filename=`${sanitizeName(project.name)}_${String(project.active+1).padStart(2,"0")}_${s.device}.png`;
    downloadBlob(blob,filename);setStatus("PNG exported");toast("PNG exported");
  }

  // Minimal uncompressed ZIP writer; no external library required.
  const crcTable=(()=>{
    const t=new Uint32Array(256);
    for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}
    return t;
  })();
  function crc32(bytes){
    let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;
  }
  function u16(v){return new Uint8Array([v&255,(v>>>8)&255])}
  function u32(v){return new Uint8Array([v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255])}
  function concat(parts){
    const len=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(len);let o=0;
    for(const p of parts){out.set(p,o);o+=p.length}return out;
  }
  function dosDateTime(date=new Date()){
    const time=(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1);
    const dt=((date.getFullYear()-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();
    return {time,dt};
  }
  async function makeZip(files){
    const enc=new TextEncoder(),locals=[],centrals=[];let offset=0;const {time,dt}=dosDateTime();
    for(const file of files){
      const name=enc.encode(file.name),data=new Uint8Array(await file.blob.arrayBuffer()),crc=crc32(data);
      const local=concat([u32(0x04034b50),u16(20),u16(0),u16(0),u16(time),u16(dt),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]);
      locals.push(local);
      const central=concat([u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(time),u16(dt),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);
      centrals.push(central);offset+=local.length;
    }
    const centralSize=centrals.reduce((n,p)=>n+p.length,0);
    const end=concat([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(centralSize),u32(offset),u16(0)]);
    return new Blob([concat([...locals,...centrals,end])],{type:"application/zip"});
  }

  async function exportAll(){
    setStatus("Rendering all slides…");
    const files=[];
    for(let i=0;i<project.slides.length;i++){
      setStatus(`Rendering ${i+1} of ${project.slides.length}…`);
      const s=project.slides[i],blob=await renderBlobForSlide(s);
      files.push({name:`${sanitizeName(project.name)}_${String(i+1).padStart(2,"0")}_${s.device}.png`,blob});
    }
    const zip=await makeZip(files);
    downloadBlob(zip,`${sanitizeName(project.name)}_exports.zip`);
    setStatus(`${files.length} PNGs exported`);toast("ZIP exported");
  }

  function saveProject(){
    const data=JSON.stringify(project,null,2);
    downloadBlob(new Blob([data],{type:"application/json"}),`${sanitizeName(project.name)}.appslides.json`);
    toast("Project saved");
  }

  function loadProjectFile(file){
    const r=new FileReader();
    r.onload=()=>{
      try{
        const p=JSON.parse(r.result);
        if(!Array.isArray(p.slides)||!p.slides.length)throw new Error();
        project=normalizeProject(p);
        syncControls();persistProject();toast("Project loaded");
      }catch{toast("That project file is not valid")}
    };
    r.readAsText(file);
  }

  const palettes=[
    ["#07111f","#132b46","#164e63","#22d3ee","#8b5cf6"],
    ["#1a1028","#3b174f","#7c2d6f","#fb7185","#a78bfa"],
    ["#071a16","#103b32","#065f46","#34d399","#facc15"],
    ["#171106","#3b2f13","#713f12","#f59e0b","#ef4444"],
    ["#0b1020","#17143a","#312e81","#22d3ee","#8b5cf6"]
  ];
  function randomizeStyle(){
    const s=current(),p=palettes[Math.floor(Math.random()*palettes.length)];
    [s.bg1,s.bg2,s.bg3]=p.slice(0,3);s.glow1.color=p[3];s.glow2.color=p[4];
    s.bgAngle=Math.floor(Math.random()*360);
    s.glow1.x=Math.floor(Math.random()*120)-10;s.glow1.y=Math.floor(Math.random()*80);
    s.glow2.x=Math.floor(Math.random()*120)-10;s.glow2.y=20+Math.floor(Math.random()*75);
    s.glow1.size=30+Math.floor(Math.random()*36);s.glow2.size=30+Math.floor(Math.random()*36);
    syncControls();persistProject();toast("Aesthetic randomized");
  }

  function applyStyleToAllSlides(){
    const source=current();
    const style={
      device:source.device,
      bg1:source.bg1,
      bg2:source.bg2,
      bg3:source.bg3,
      bgAngle:source.bgAngle,
      showDots:source.showDots,
      showCurve:source.showCurve,
      textureOpacity:source.textureOpacity,
      frameColor:source.frameColor,
      glow1:deepClone(source.glow1),
      glow2:deepClone(source.glow2)
    };
    project.slides.forEach(slide=>{
      Object.assign(slide,style,{
        glow1:deepClone(style.glow1),
        glow2:deepClone(style.glow2)
      });
    });
    syncControls();persistProject();toast(`Style applied to ${project.slides.length} slides`);
  }

  $$("[data-bind]").forEach(el=>{
    const event=el.tagName==="SELECT" ? "change" : "input";
    el.addEventListener(event,()=>{
      let value=el.type==="checkbox"?el.checked:isNumericInput(el)?Number(el.value):el.value;
      setPath(current(),el.dataset.bind,value);
      if(el.dataset.bind==="device") resizePreview();
      $$(`[data-value="${el.dataset.bind}"]`).forEach(v=>{
        const path=el.dataset.bind;
        const suffix = path.includes("opacity") || ["textWidth","textX","textY","phoneScale","phoneX","phoneY","shadow","textureOpacity","calloutX","calloutY"].includes(path) || path.startsWith("logo.") || path.endsWith(".x") || path.endsWith(".y") || path.endsWith(".size") || path.endsWith(".softness") ? "%" : path==="phoneRotation" || path==="bgAngle" ? "°" : "px";
        v.textContent=`${value}${suffix}`;
      });
      $("#dimensions").textContent=`${DEVICE[current().device].w} × ${DEVICE[current().device].h}`;
      renderSlides();commitProjectChange();
    });
  });

  $("#projectName").addEventListener("input",e=>{project.name=e.target.value;persistProject()});
  $("#newProject").onclick=()=>{project=defaultProject();syncControls();persistProject();toast("New project started")};
  $("#addSlide").onclick=()=>{project.slides.push(defaultSlide());project.active=project.slides.length-1;syncControls();persistProject();toast("Slide added")};
  $("#duplicateSlide").onclick=()=>{project.slides.splice(project.active+1,0,deepClone(current()));project.active++;syncControls();persistProject();toast("Slide duplicated")};
  $("#deleteSlide").onclick=()=>{
    if(project.slides.length===1){toast("A project needs at least one slide");return}
    project.slides.splice(project.active,1);project.active=Math.max(0,project.active-1);syncControls();persistProject();toast("Slide deleted");
  };
  $("#resetSlide").onclick=()=>{
    const keepShot=current().screenshotData,keepLogo=current().logoData,device=current().device;
    project.slides[project.active]=Object.assign(defaultSlide(),{device,screenshotData:keepShot,logoData:keepLogo});
    syncControls();persistProject();toast("Slide reset");
  };
  $("#randomizeStyle").onclick=randomizeStyle;
  $("#applyStyleAll").onclick=applyStyleToAllSlides;
  $("#uploadScreenshot").onclick=()=>$("#screenshotFile").click();
  $("#screenshotFile").onchange=e=>setScreenshotFile(e.target.files[0]);
  $("#pasteScreenshot").onclick=pasteFromClipboard;
  $("#uploadLogo").onclick=()=>$("#logoFile").click();
  $("#logoFile").onchange=e=>setLogoFile(e.target.files[0]);
  $("#removeLogo").onclick=()=>{current().logoData="";commitProjectChange();toast("Logo removed")};
  $("#showGuides").onchange=e=>{guides=e.target.checked;queueRender()};
  $("#exportCurrent").onclick=exportCurrent;
  $("#exportAll").onclick=exportAll;
  $("#saveProject").onclick=saveProject;
  $("#loadProject").onclick=()=>$("#projectFile").click();
  $("#projectFile").onchange=e=>loadProjectFile(e.target.files[0]);

  window.addEventListener("paste",handlePaste);
  window.addEventListener("resize",()=>{resizePreview();queueRender()});
  window.addEventListener("keydown",e=>{
    if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){e.preventDefault();exportCurrent()}
  });

  const dz=$("#dropZone"),dh=$("#dropHint");
  ["dragenter","dragover"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dh.classList.add("show")}));
  ["dragleave","drop"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dh.classList.remove("show")}));
  dz.addEventListener("drop",e=>{
    const file=[...e.dataTransfer.files].find(f=>f.type.startsWith("image/"));
    if(file)setScreenshotFile(file);
  });

  syncControls();
  setTimeout(()=>{resizePreview();queueRender()},50);
})();
