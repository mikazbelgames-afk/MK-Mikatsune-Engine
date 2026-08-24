const DB_NAME = 'mk-mikatsune-engine';
const DB_VERSION = 1;
const STORE_NAME = 'projects';
const CURRENT_KEY = 'current';
const CHANNEL_NAME = 'mk-mikatsune-runtime';

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(STORE_NAME)){
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

export async function saveCurrentProject(project){
  const db=await openDB();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE_NAME,'readwrite');
    tx.objectStore(STORE_NAME).put(project,CURRENT_KEY);
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error);
  });
  db.close();
}

export async function loadCurrentProject(){
  const db=await openDB();
  const value=await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE_NAME,'readonly');
    const req=tx.objectStore(STORE_NAME).get(CURRENT_KEY);
    req.onsuccess=()=>resolve(req.result ?? null);
    req.onerror=()=>reject(req.error);
  });
  db.close();
  return value;
}

export function createProjectChannel(){
  if(!('BroadcastChannel' in window)) return null;
  return new BroadcastChannel(CHANNEL_NAME);
}

export function broadcastProject(project){
  const channel=createProjectChannel();
  if(!channel) return;
  channel.postMessage({type:'project',project});
  channel.close();
}
