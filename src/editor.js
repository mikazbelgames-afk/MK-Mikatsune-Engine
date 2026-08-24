import {Engine,fileToDataURL,loadImage} from './core.js';
import {idle,blink} from './animator.js';
import {saveCurrentProject,broadcastProject} from './bridge.js';

const q=s=>document.querySelector(s);
const engine=new Engine(q('#stage'));
let idleOn=true;
let blinkStart=null;
let persistTimer=null;
let splitBackup=null;

function renderLayers(){
  q('#layers').innerHTML='';
  [...engine.layers].reverse().forEach(l=>{
    const d=document.createElement('div');
    d.className='layer '+(l.id===engine.selectedId?'active':'');
    const text=document.createElement('div');
    text.innerHTML=`<strong>${escapeHTML(l.name)}</strong><small>${escapeHTML(l.role)}</small>`;
    d.appendChild(text);
    d.onclick=()=>{
      engine.selectedId=l.id;
      renderLayers();
      sync();
    };
    q('#layers').appendChild(d);
  });
}

function escapeHTML(value=''){
  return String(value).replace(/[&<>'"]/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  })[ch]);
}

function sync(){
  const l=engine.selected;
  if(!l) return;
  for(const k of ['x','y','scale','rotation','pivotX','pivotY']) q('#'+k).value=l[k];
  q('#role').value=l.role;
}

function currentProject(){
  return engine.serialize();
}

async function persistProject({broadcast=false}={}){
  const project=currentProject();
  try{
    await saveCurrentProject(project);
    if(broadcast) broadcastProject(project);
    return true;
  }catch(err){
    console.error('No se pudo guardar el proyecto para runtime:',err);
    return false;
  }
}

function queuePersist(){
  clearTimeout(persistTimer);
  persistTimer=setTimeout(()=>persistProject({broadcast:true}),120);
}

for(const k of ['x','y','scale','rotation','pivotX','pivotY']){
  q('#'+k).addEventListener('input',e=>{
    const l=engine.selected;
    if(!l) return;
    l[k]=Number(e.target.value);
    l.base=engine.snapshot(l);
    queuePersist();
  });
}

q('#role').addEventListener('change',e=>{
  const l=engine.selected;
  if(!l) return;
  l.role=e.target.value;
  renderLayers();
  queuePersist();
});

q('#add').onclick=()=>q('#file').click();
q('#file').addEventListener('change',async e=>{
  const f=e.target.files?.[0];
  if(!f) return;
  const src=await fileToDataURL(f);
  const image=await loadImage(src);
  engine.addLayer({name:f.name.replace(/\.[^.]+$/,''),src,image});
  renderLayers();
  sync();
  e.target.value='';
  await persistProject({broadcast:true});
});

q('#save').onclick=()=>{
  const b=new Blob([JSON.stringify(currentProject(),null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(b);
  a.download='mikatsune-project-v0.2.json';
  a.click();
  URL.revokeObjectURL(a.href);
};

q('#load').onclick=()=>q('#loadFile').click();
q('#loadFile').addEventListener('change',async e=>{
  const f=e.target.files?.[0];
  if(!f) return;
  await engine.load(JSON.parse(await f.text()));
  renderLayers();
  sync();
  e.target.value='';
  await persistProject({broadcast:true});
});

q('#idle').onclick=()=>{
  idleOn=!idleOn;
  q('#idle').textContent=idleOn?'⏸ Idle':'▶ Idle';
};
q('#blink').onclick=()=>blinkStart=performance.now();
q('#reset').onclick=()=>{
  for(const l of engine.layers){
    Object.assign(l,l.base);
    l.runtime={};
  }
  sync();
  queuePersist();
};

q('#runtime').onclick=async()=>{
  const status=q('#runtimeStatus');
  status.textContent='Preparando runtime…';
  const saved=await persistProject({broadcast:true});
  if(!saved){
    status.textContent='No se pudo preparar el runtime. Revisa la consola.';
    return;
  }
  const runtimeURL=new URL('./runtime.html',location.href);
  runtimeURL.searchParams.set('source','current');
  const win=window.open(runtimeURL.href,'_blank');
  if(!win){
    status.textContent='El navegador bloqueó la ventana emergente. Permite pop-ups para este sitio.';
    return;
  }
  status.textContent='Runtime abierto y sincronizado.';
  setTimeout(()=>broadcastProject(currentProject()),300);
  setTimeout(()=>broadcastProject(currentProject()),900);
};

// -----------------------------------------------------------------------------
// Layer Splitter V1
// -----------------------------------------------------------------------------
const splitter={
  targetId:null,
  tool:'brush',
  painting:false,
  lastPoint:null,
  lassoPoints:[],
  sourceCanvas:document.createElement('canvas'),
  maskCanvas:document.createElement('canvas'),
  sourceCtx:null,
  maskCtx:null,
  display:q('#splitterCanvas'),
  displayCtx:q('#splitterCanvas').getContext('2d'),
  preview:q('#splitPreview'),
  previewCtx:q('#splitPreview').getContext('2d')
};
splitter.sourceCtx=splitter.sourceCanvas.getContext('2d',{willReadFrequently:true});
splitter.maskCtx=splitter.maskCanvas.getContext('2d',{willReadFrequently:true});

function setSplitterTool(tool){
  splitter.tool=tool;
  splitter.painting=false;
  splitter.lastPoint=null;
  splitter.lassoPoints=[];
  q('#toolBrush').classList.toggle('active',tool==='brush');
  q('#toolErase').classList.toggle('active',tool==='erase');
  q('#toolLasso').classList.toggle('active',tool==='lasso');
  renderSplitter();
}

function openSplitter(){
  const l=engine.selected;
  if(!l?.image){
    alert('Primero selecciona una capa con imagen.');
    return;
  }
  splitter.targetId=l.id;
  const w=l.image.naturalWidth||l.image.width;
  const h=l.image.naturalHeight||l.image.height;
  for(const c of [splitter.sourceCanvas,splitter.maskCanvas,splitter.display]){
    c.width=w;
    c.height=h;
  }
  splitter.sourceCtx.clearRect(0,0,w,h);
  splitter.sourceCtx.drawImage(l.image,0,0,w,h);
  splitter.maskCtx.clearRect(0,0,w,h);
  q('#splitName').value=`${l.name} · parte`;
  q('#splitRole').value=l.role==='generic'?'generic':l.role;
  q('#splitterSubtitle').textContent=`Capa fuente: ${l.name} · ${w}×${h}px`;
  q('#splitInfo').textContent='Pinta una zona para ver la vista previa.';
  setSplitterTool('brush');
  renderSplitter();
  renderSplitPreview();
  q('#splitterModal').classList.add('open');
  q('#splitterModal').setAttribute('aria-hidden','false');
}

function closeSplitter(){
  splitter.painting=false;
  splitter.targetId=null;
  q('#splitterModal').classList.remove('open');
  q('#splitterModal').setAttribute('aria-hidden','true');
  q('#splitterCursor').hidden=true;
}

function renderSplitter(){
  const c=splitter.displayCtx;
  const w=splitter.display.width;
  const h=splitter.display.height;
  c.clearRect(0,0,w,h);
  c.drawImage(splitter.sourceCanvas,0,0);
  c.save();
  c.globalAlpha=Number(q('#maskOpacity').value)/100;
  c.drawImage(splitter.maskCanvas,0,0);
  c.restore();

  if(splitter.tool==='lasso' && splitter.lassoPoints.length>1){
    c.save();
    c.strokeStyle='#ffffff';
    c.lineWidth=Math.max(1,w/900*2);
    c.setLineDash([8,6]);
    c.beginPath();
    c.moveTo(splitter.lassoPoints[0].x,splitter.lassoPoints[0].y);
    for(const p of splitter.lassoPoints.slice(1)) c.lineTo(p.x,p.y);
    c.stroke();
    c.restore();
  }
}

function canvasPoint(event){
  const rect=splitter.display.getBoundingClientRect();
  return{
    x:(event.clientX-rect.left)*splitter.display.width/rect.width,
    y:(event.clientY-rect.top)*splitter.display.height/rect.height
  };
}

function drawBrushSegment(a,b){
  const ctx=splitter.maskCtx;
  const size=Number(q('#brushSize').value);
  ctx.save();
  if(splitter.tool==='erase'){
    ctx.globalCompositeOperation='destination-out';
    ctx.strokeStyle='rgba(0,0,0,1)';
    ctx.fillStyle='rgba(0,0,0,1)';
  }else{
    ctx.globalCompositeOperation='source-over';
    ctx.strokeStyle='#ff69d4';
    ctx.fillStyle='#ff69d4';
  }
  ctx.lineWidth=size;
  ctx.lineCap='round';
  ctx.lineJoin='round';
  ctx.beginPath();
  ctx.moveTo(a.x,a.y);
  ctx.lineTo(b.x,b.y);
  ctx.stroke();
  if(a.x===b.x&&a.y===b.y){
    ctx.beginPath();
    ctx.arc(a.x,a.y,size/2,0,Math.PI*2);
    ctx.fill();
  }
  ctx.restore();
}

function fillLasso(points){
  if(points.length<3) return;
  const ctx=splitter.maskCtx;
  ctx.save();
  ctx.globalCompositeOperation='source-over';
  ctx.fillStyle='#ff69d4';
  ctx.beginPath();
  ctx.moveTo(points[0].x,points[0].y);
  for(const p of points.slice(1)) ctx.lineTo(p.x,p.y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function maskBounds(){
  const w=splitter.maskCanvas.width;
  const h=splitter.maskCanvas.height;
  if(!w||!h) return null;
  const mask=splitter.maskCtx.getImageData(0,0,w,h).data;
  const src=splitter.sourceCtx.getImageData(0,0,w,h).data;
  let minX=w,minY=h,maxX=-1,maxY=-1,count=0;
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const i=(y*w+x)*4;
      if(mask[i+3]>10 && src[i+3]>0){
        if(x<minX)minX=x;
        if(y<minY)minY=y;
        if(x>maxX)maxX=x;
        if(y>maxY)maxY=y;
        count++;
      }
    }
  }
  if(maxX<0) return null;
  return{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1,count};
}

function renderSplitPreview(){
  const p=splitter.previewCtx;
  const pc=splitter.preview;
  p.clearRect(0,0,pc.width,pc.height);
  const b=maskBounds();
  if(!b){
    q('#splitInfo').textContent='Pinta una zona para ver la vista previa.';
    return;
  }

  const temp=extractCanvas(b,false);
  const pad=18;
  const s=Math.min((pc.width-pad*2)/b.w,(pc.height-pad*2)/b.h);
  const dw=b.w*s,dh=b.h*s;
  p.drawImage(temp,(pc.width-dw)/2,(pc.height-dh)/2,dw,dh);
  q('#splitInfo').textContent=`Selección: ${b.w}×${b.h}px · ${b.count.toLocaleString()} píxeles visibles`;
}

function extractCanvas(bounds,removeFromOriginal=false){
  const w=splitter.sourceCanvas.width;
  const h=splitter.sourceCanvas.height;
  const srcData=splitter.sourceCtx.getImageData(0,0,w,h);
  const maskData=splitter.maskCtx.getImageData(0,0,w,h);
  const out=document.createElement('canvas');
  out.width=bounds.w;
  out.height=bounds.h;
  const octx=out.getContext('2d');
  const outData=octx.createImageData(bounds.w,bounds.h);

  for(let yy=0;yy<bounds.h;yy++){
    const sy=bounds.y+yy;
    for(let xx=0;xx<bounds.w;xx++){
      const sx=bounds.x+xx;
      const si=(sy*w+sx)*4;
      const oi=(yy*bounds.w+xx)*4;
      if(maskData.data[si+3]>10 && srcData.data[si+3]>0){
        outData.data[oi]=srcData.data[si];
        outData.data[oi+1]=srcData.data[si+1];
        outData.data[oi+2]=srcData.data[si+2];
        outData.data[oi+3]=srcData.data[si+3];
        if(removeFromOriginal) srcData.data[si+3]=0;
      }
    }
  }
  octx.putImageData(outData,0,0);
  if(removeFromOriginal) splitter.sourceCtx.putImageData(srcData,0,0);
  return out;
}

async function extractSelectedLayer(){
  const sourceLayer=engine.layers.find(l=>l.id===splitter.targetId);
  if(!sourceLayer){
    alert('La capa fuente ya no existe.');
    closeSplitter();
    return;
  }
  const b=maskBounds();
  if(!b){
    alert('Todavía no hay una selección para extraer.');
    return;
  }

  // Una copia completa del proyecto permite deshacer este split sin perder datos.
  splitBackup=currentProject();
  q('#undoSplit').disabled=false;

  const originalW=sourceLayer.image.width;
  const originalH=sourceLayer.image.height;
  const remove=q('#removeOriginal').checked;
  const cropCanvas=extractCanvas(b,remove);
  const cropSrc=cropCanvas.toDataURL('image/png');
  const cropImage=await loadImage(cropSrc);

  if(remove){
    const baseSrc=splitter.sourceCanvas.toDataURL('image/png');
    sourceLayer.src=baseSrc;
    sourceLayer.image=await loadImage(baseSrc);
  }

  // Mantiene la nueva pieza exactamente alineada con el original, incluso si
  // el original ya tiene escala, rotación y pivote.
  const cropCenterX=b.x+b.w/2;
  const cropCenterY=b.y+b.h/2;
  const localOffsetX=cropCenterX-originalW/2;
  const localOffsetY=cropCenterY-originalH/2;

  const newLayer=engine.addLayer({
    name:q('#splitName').value.trim()||'Pieza separada',
    role:q('#splitRole').value,
    src:cropSrc,
    image:cropImage,
    x:sourceLayer.x,
    y:sourceLayer.y,
    scale:sourceLayer.scale,
    rotation:sourceLayer.rotation,
    opacity:sourceLayer.opacity,
    pivotX:sourceLayer.pivotX-localOffsetX,
    pivotY:sourceLayer.pivotY-localOffsetY,
    visible:true
  });
  newLayer.base=engine.snapshot(newLayer);
  sourceLayer.base=engine.snapshot(sourceLayer);

  renderLayers();
  sync();
  closeSplitter();
  await persistProject({broadcast:true});
}

q('#splitLayer').onclick=openSplitter;
q('#splitClose').onclick=closeSplitter;
q('#splitCancel').onclick=closeSplitter;
q('#extractLayer').onclick=extractSelectedLayer;
q('#toolBrush').onclick=()=>setSplitterTool('brush');
q('#toolErase').onclick=()=>setSplitterTool('erase');
q('#toolLasso').onclick=()=>setSplitterTool('lasso');
q('#clearMask').onclick=()=>{
  splitter.maskCtx.clearRect(0,0,splitter.maskCanvas.width,splitter.maskCanvas.height);
  renderSplitter();
  renderSplitPreview();
};
q('#selectVisible').onclick=()=>{
  const ctx=splitter.maskCtx;
  ctx.clearRect(0,0,splitter.maskCanvas.width,splitter.maskCanvas.height);
  ctx.drawImage(splitter.sourceCanvas,0,0);
  ctx.globalCompositeOperation='source-in';
  ctx.fillStyle='#ff69d4';
  ctx.fillRect(0,0,splitter.maskCanvas.width,splitter.maskCanvas.height);
  ctx.globalCompositeOperation='source-over';
  renderSplitter();
  renderSplitPreview();
};
q('#brushSize').addEventListener('input',e=>{
  q('#brushSizeValue').textContent=`${e.target.value} px`;
});
q('#maskOpacity').addEventListener('input',e=>{
  q('#maskOpacityValue').textContent=`${e.target.value}%`;
  renderSplitter();
});

splitter.display.addEventListener('pointerdown',e=>{
  if(e.button!==0) return;
  splitter.display.setPointerCapture(e.pointerId);
  const p=canvasPoint(e);
  splitter.painting=true;
  splitter.lastPoint=p;
  if(splitter.tool==='lasso'){
    splitter.lassoPoints=[p];
  }else{
    drawBrushSegment(p,p);
    renderSplitter();
  }
});

splitter.display.addEventListener('pointermove',e=>{
  const rect=splitter.display.getBoundingClientRect();
  const cursor=q('#splitterCursor');
  if(splitter.tool==='brush'||splitter.tool==='erase'){
    const cssSize=Number(q('#brushSize').value)*rect.width/splitter.display.width;
    cursor.hidden=false;
    cursor.style.left=`${e.clientX}px`;
    cursor.style.top=`${e.clientY}px`;
    cursor.style.width=`${cssSize}px`;
    cursor.style.height=`${cssSize}px`;
  }else cursor.hidden=true;

  if(!splitter.painting) return;
  const p=canvasPoint(e);
  if(splitter.tool==='lasso'){
    const prev=splitter.lassoPoints.at(-1);
    const minStep=Math.max(2,splitter.display.width/700);
    if(!prev||Math.hypot(p.x-prev.x,p.y-prev.y)>=minStep) splitter.lassoPoints.push(p);
  }else{
    drawBrushSegment(splitter.lastPoint,p);
    splitter.lastPoint=p;
  }
  renderSplitter();
});

function finishPointer(){
  if(!splitter.painting) return;
  splitter.painting=false;
  if(splitter.tool==='lasso'){
    fillLasso(splitter.lassoPoints);
    splitter.lassoPoints=[];
  }
  splitter.lastPoint=null;
  renderSplitter();
  renderSplitPreview();
}
splitter.display.addEventListener('pointerup',finishPointer);
splitter.display.addEventListener('pointercancel',finishPointer);
splitter.display.addEventListener('pointerleave',()=>q('#splitterCursor').hidden=true);

q('#undoSplit').onclick=async()=>{
  if(!splitBackup) return;
  const data=splitBackup;
  splitBackup=null;
  q('#undoSplit').disabled=true;
  await engine.load(data);
  renderLayers();
  sync();
  await persistProject({broadcast:true});
};

document.addEventListener('keydown',async e=>{
  if(e.key==='Escape' && q('#splitterModal').classList.contains('open')) closeSplitter();
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!q('#splitterModal').classList.contains('open')){
    if(splitBackup){
      e.preventDefault();
      q('#undoSplit').click();
    }
  }
});

function frame(now){
  if(idleOn) idle(engine,now/1000);
  if(blinkStart!==null){
    const p=(now-blinkStart)/220;
    if(p>=1) blinkStart=null; else blink(engine,p);
  }
  engine.draw();
  requestAnimationFrame(frame);
}

renderLayers();
persistProject();
requestAnimationFrame(frame);
