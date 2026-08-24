import {Engine} from './core.js';
import {idle,blink} from './animator.js';
import {loadCurrentProject,createProjectChannel} from './bridge.js';

const engine=new Engine(document.querySelector('#stage'));
let blinkStart=null;
let channel=null;

async function loadProjectData(data){
  if(!data || !Array.isArray(data.layers)) return false;
  try{
    await engine.load(data);
    return true;
  }catch(err){
    console.error('No se pudo cargar el proyecto en runtime:',err);
    return false;
  }
}

async function loadFromProjectURL(projectURL){
  try{
    const response=await fetch(projectURL,{cache:'no-store'});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    return loadProjectData(await response.json());
  }catch(err){
    console.error('No se pudo cargar ?project=:',err);
    return false;
  }
}

async function boot(){
  const url=new URL(location.href);
  const externalProject=url.searchParams.get('project');
  let loaded=false;
  if(externalProject) loaded=await loadFromProjectURL(externalProject);

  if(!loaded){
    try{ loaded=await loadProjectData(await loadCurrentProject()); }
    catch(err){ console.error('No se pudo leer el proyecto actual:',err); }
  }

  channel=createProjectChannel();
  if(channel){
    channel.onmessage=async event=>{
      if(event.data?.type!=='project') return;
      await loadProjectData(event.data.project);
    };
  }

  requestAnimationFrame(frame);
}

function frame(now){
  idle(engine,now/1000);
  if(Math.random()<.0018 && blinkStart===null) blinkStart=now;
  if(blinkStart!==null){
    const p=(now-blinkStart)/220;
    if(p>=1) blinkStart=null; else blink(engine,p);
  }
  engine.draw();
  requestAnimationFrame(frame);
}

window.Mikatsune={
  trigger(name){ if(name==='blink') blinkStart=performance.now(); },
  async reload(){ await loadProjectData(await loadCurrentProject()); }
};

boot();
