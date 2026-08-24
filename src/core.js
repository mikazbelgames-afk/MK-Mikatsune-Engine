export function fileToDataURL(file){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(r.result);
    r.onerror=rej;
    r.readAsDataURL(file);
  });
}

export function loadImage(src){
  return new Promise((res,rej)=>{
    const i=new Image();
    i.onload=()=>res(i);
    i.onerror=rej;
    i.src=src;
  });
}

export class Engine{
  constructor(canvas){
    this.canvas=canvas;
    this.ctx=canvas.getContext('2d');
    this.layers=[];
    this.selectedId=null;
  }

  get selected(){
    return this.layers.find(x=>x.id===this.selectedId)||null;
  }

  addLayer(o){
    const l={
      id:o.id||crypto.randomUUID(),
      name:o.name||'pieza',
      role:o.role||'generic',
      src:o.src,
      image:o.image,
      x:o.x??540,
      y:o.y??540,
      scale:o.scale??1,
      rotation:o.rotation??0,
      opacity:o.opacity??1,
      pivotX:o.pivotX??0,
      pivotY:o.pivotY??0,
      visible:o.visible??true,
      runtime:{}
    };
    l.base=this.snapshot(l);
    this.layers.push(l);
    this.selectedId=l.id;
    return l;
  }

  snapshot(l){
    return{
      x:l.x,y:l.y,scale:l.scale,rotation:l.rotation,opacity:l.opacity,
      pivotX:l.pivotX,pivotY:l.pivotY
    };
  }

  resetRuntime(){
    for(const l of this.layers) l.runtime={};
  }

  draw(){
    const c=this.ctx;
    c.clearRect(0,0,this.canvas.width,this.canvas.height);
    for(const l of this.layers){
      if(!l.visible||!l.image) continue;
      const r=l.runtime||{};
      const x=r.x??l.x;
      const y=r.y??l.y;
      const s=r.scale??l.scale;
      const rot=r.rotation??l.rotation;
      const op=r.opacity??l.opacity;
      c.save();
      c.globalAlpha=op;
      c.translate(x,y);
      c.rotate(rot*Math.PI/180);
      c.scale(s,s);
      c.translate(-l.pivotX,-l.pivotY);
      c.drawImage(l.image,-l.image.width/2,-l.image.height/2);
      c.restore();
    }
  }

  serialize(){
    return{
      version:'0.2.0',
      layers:this.layers.map(l=>({
        id:l.id,name:l.name,role:l.role,src:l.src,
        x:l.x,y:l.y,scale:l.scale,rotation:l.rotation,opacity:l.opacity,
        pivotX:l.pivotX,pivotY:l.pivotY,visible:l.visible
      }))
    };
  }

  async load(data){
    this.layers=[];
    for(const raw of data.layers||[]){
      const image=await loadImage(raw.src);
      const l=this.addLayer({...raw,image});
      l.id=raw.id||l.id;
      l.base=this.snapshot(l);
    }
    this.selectedId=this.layers.at(-1)?.id||null;
  }
}
