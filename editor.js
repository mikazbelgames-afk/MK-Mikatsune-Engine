import {Engine,fileToDataURL,loadImage} from './core.js';
import {idle,blink} from './animator.js';
import {saveCurrentProject,broadcastProject} from './bridge.js';

const q=s=>document.querySelector(s);
const engine=new Engine(q('#stage'));

let idleOn=true;
let blinkStart=null;
let persistTimer=null;

function renderLayers(){
  q('#layers').innerHTML='';
  [...engine.layers].reverse().forEach(l=>{
    const d=document.createElement('div');
    d.className='layer '+(l.id===engine.selectedId?'active':'');
    d.textContent=l.name+' · '+l.role;
    d.onclick=()=>{
      engine.selectedId=l.id;
      renderLayers();
      sync();
    };
    q('#layers').appendChild(d);
  });
}

function sync(){
  const l=engine.selected;
  if(!l)return;
  for(const k of ['x','y','scale','rotation','pivotX','pivotY']){
    q('#'+k).value=l[k];
  }
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
  }catch(err){
    console.error('No se pudo guardar el proyecto para runtime:',err);
  }
}

function queuePersist(){
  clearTimeout(persistTimer);
  persistTimer=setTimeout(()=>persistProject({broadcast:true}),120);
}

for(const k of ['x','y','scale','rotation','pivotX','pivotY']){
  q('#'+k).addEventListener('input',e=>{
    const l=engine.selected;
    if(!l)return;
    l[k]=Number(e.target.value);
    l.base=engine.snapshot(l);
    queuePersist();
  });
}

q('#role').addEventListener('change',e=>{
  const l=engine.selected;
  if(!l)return;
  l.role=e.target.value;
  renderLayers();
  queuePersist();
});

q('#add').onclick=()=>q('#file').click();

q('#file').addEventListener('change',async e=>{
  const f=e.target.files?.[0];
  if(!f)return;

  const src=await fileToDataURL(f);
  const image=await loadImage(src);

  engine.addLayer({
    name:f.name.replace(/\.[^.]+$/,''),
    src,
    image
  });

  renderLayers();
  sync();
  e.target.value='';
  await persistProject({broadcast:true});
});

q('#save').onclick=()=>{
  const b=new Blob(
    [JSON.stringify(currentProject(),null,2)],
    {type:'application/json'}
  );
  const a=document.createElement('a');
  a.href=URL.createObjectURL(b);
  a.download='mikatsune-project.json';
  a.click();
  URL.revokeObjectURL(a.href);
};

q('#load').onclick=()=>q('#loadFile').click();

q('#loadFile').addEventListener('change',async e=>{
  const f=e.target.files?.[0];
  if(!f)return;

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
  // Guardamos primero el proyecto actual en IndexedDB para que
  // runtime.html pueda abrirlo incluso en otra pestaña o en OBS.
  await persistProject({broadcast:true});

  const runtimeURL=new URL('./runtime.html',location.href);
  runtimeURL.searchParams.set('source','current');
  window.open(runtimeURL.href,'_blank','noopener');
};

function frame(now){
  if(idleOn) idle(engine,now/1000);

  if(blinkStart!==null){
    const p=(now-blinkStart)/220;
    if(p>=1) blinkStart=null;
    else blink(engine,p);
  }

  engine.draw();
  requestAnimationFrame(frame);
}

renderLayers();
persistProject();
requestAnimationFrame(frame);
