const TAU=Math.PI*2;

export function idle(engine,t){
  for(const l of engine.layers){
    const b=l.base||l;
    l.runtime={};
    if(l.role==='body'){
      l.runtime.scale=b.scale*(1+Math.sin(t*TAU/4.2)*.008);
      l.runtime.y=b.y+Math.sin(t*TAU/4.2)*1.5;
    }
    if(l.role==='head') l.runtime.rotation=b.rotation+Math.sin(t*TAU/5.5)*.5;
    if(l.role==='earL') l.runtime.rotation=b.rotation+Math.sin(t*TAU/5.1)*1.2;
    if(l.role==='earR') l.runtime.rotation=b.rotation+Math.sin((t+.8)*TAU/5.7)*1.0;
    if(l.role==='tail') l.runtime.rotation=b.rotation+Math.sin(t*TAU/4.8)*2;
    if(l.role==='crystal'){
      l.runtime.rotation=b.rotation+Math.sin(t*TAU/3.8)*1.3;
      l.runtime.y=b.y+Math.sin(t*TAU/3.8)*1.2;
    }
  }
}

export function blink(engine,p){
  const close=p<.5?p*2:(1-p)*2;
  for(const l of engine.layers){
    if(l.role==='eyeL'||l.role==='eyeR'){
      l.runtime=l.runtime||{};
      l.runtime.scale=(l.base?.scale??l.scale)*Math.max(.08,1-close*.92);
    }
  }
}
