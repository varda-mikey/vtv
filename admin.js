import { db, auth } from './firebase-client.js';
import { ref, onValue, set, remove } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';

const $=id=>document.getElementById(id);
const loginView=$('loginView'), appView=$('appView'), screensEl=$('screens');
let currentSlides=[];

function msg(el,t){el.textContent=t||''}
function cleanId(v){return v.trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'')}
function base(){return location.origin + location.pathname.replace(/admin\.html$/,'').replace(/admin\/?$/,'')}
function shortUrl(id){return base().replace(/\/$/,'') + '/#' + id}
function esc(s){return String(s??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}
function secondsValue(){return Math.max(2,Math.min(120,parseInt($('slideSeconds').value||'10',10)||10))}

function drawPreviews(){
  const wrap=$('previewWrap'), p=$('imagePreview');
  p.innerHTML='';
  if(!currentSlides.length){wrap.classList.add('hidden');return;}
  currentSlides.forEach((s,i)=>{
    const box=document.createElement('div');
    box.style.cssText='border:1px solid #e5e7eb;border-radius:12px;padding:8px;background:#fff';
    box.innerHTML=`<img src="${s.imageData}" alt="Slide ${i+1}" style="width:100%;height:150px;object-fit:contain;background:#111;border-radius:8px;display:block"><div class="small muted" style="margin-top:6px">${i+1}. ${esc(s.imageName||'Image')}</div>`;
    p.appendChild(box);
  });
  wrap.classList.remove('hidden');
}

function clear(){
  ['screenId','screenName'].forEach(x=>$(x).value='');
  $('screenImage').value='';
  $('screenFit').value='contain';
  $('slideSeconds').value='10';
  currentSlides=[];
  drawPreviews();
  msg($('formMsg'),'');
}

async function readImage(file){
  if(!file || !file.type.startsWith('image/')) throw new Error('Please choose JPG, PNG or WebP images.');
  const dataUrl=await new Promise((resolve,reject)=>{
    const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=()=>reject(new Error('Could not read image.')); r.readAsDataURL(file);
  });
  return await new Promise((resolve,reject)=>{
    const i=new Image(); i.onload=()=>resolve(i); i.onerror=()=>reject(new Error('Could not open image.')); i.src=dataUrl;
  });
}

async function compressImage(file){
  const img=await readImage(file);
  const MAX_W=1600, MAX_H=1600, TARGET=1050000;
  let w=img.naturalWidth, h=img.naturalHeight;
  let scale=Math.min(1,MAX_W/w,MAX_H/h);
  w=Math.max(1,Math.round(w*scale)); h=Math.max(1,Math.round(h*scale));
  let quality=.86, out='';
  for(let pass=0;pass<5;pass++){
    const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
    const ctx=canvas.getContext('2d',{alpha:false});
    ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
    quality=.86;
    out=canvas.toDataURL('image/jpeg',quality);
    while(out.length>TARGET && quality>.52){quality-=.08;out=canvas.toDataURL('image/jpeg',quality)}
    if(out.length<=TARGET) break;
    w=Math.max(480,Math.round(w*.82));h=Math.max(480,Math.round(h*.82));
  }
  if(out.length>1500000) throw new Error(file.name+' is too large even after optimization.');
  return {imageData:out,imageName:file.name};
}

$('screenImage').addEventListener('change',async e=>{
  const files=Array.from(e.target.files||[]);
  if(!files.length)return;
  if(files.length>6){e.target.value='';return msg($('formMsg'),'Please select a maximum of 6 images per TV.');}
  try{
    currentSlides=[];
    for(let i=0;i<files.length;i++){
      msg($('formMsg'),`Preparing image ${i+1} of ${files.length}…`);
      currentSlides.push(await compressImage(files[i]));
      drawPreviews();
    }
    msg($('formMsg'),currentSlides.length>1?`${currentSlides.length} images ready for slideshow.`:'Image ready.');
  }catch(err){currentSlides=[];drawPreviews();msg($('formMsg'),err.message)}
});

$('loginBtn').onclick=async()=>{try{msg($('loginMsg'),'Signing in…');await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value);msg($('loginMsg'),'')}catch(e){msg($('loginMsg'),e.message)}};
$('logoutBtn').onclick=()=>signOut(auth);
$('clearBtn').onclick=clear;

$('saveBtn').onclick=async()=>{
  const id=cleanId($('screenId').value);
  if(!id) return msg($('formMsg'),'Screen ID is required. Example: 21');
  if(!currentSlides.length) return msg($('formMsg'),'Please choose at least one image first.');
  const sec=secondsValue();
  const slides=currentSlides.map(s=>({imageData:s.imageData,imageName:s.imageName,duration:sec}));
  const d={id,name:$('screenName').value.trim()||('TV '+id),slides,slideSeconds:sec,type:'slideshow',fit:$('screenFit').value,active:true,updatedAt:Date.now()};
  if(slides.length===1){d.imageData=slides[0].imageData;d.imageName=slides[0].imageName;d.type='image'}
  try{
    $('saveBtn').disabled=true;
    msg($('formMsg'),'Saving to VARDA TV…');
    await set(ref(db,'screens/'+id),d);
    msg($('formMsg'),slides.length>1?`Saved ${slides.length}-image slideshow. Changes every ${sec} seconds.`:`Saved. TV ${id} updates automatically.`);
    $('screenImage').value='';
  }catch(e){msg($('formMsg'),'Save failed: '+e.message)}
  finally{$('saveBtn').disabled=false}
};

onAuthStateChanged(auth,user=>{loginView.classList.toggle('hidden',!!user);appView.classList.toggle('hidden',!user);if(user) start()});
let started=false;
function start(){if(started)return;started=true;onValue(ref(db,'screens'),snap=>render(snap.val()||{}))}

function slidesFrom(d){
  if(Array.isArray(d.slides)&&d.slides.length)return d.slides;
  if(d.imageData)return [{imageData:d.imageData,imageName:d.imageName||'Uploaded menu',duration:d.slideSeconds||10}];
  return [];
}

function render(data){
  screensEl.innerHTML='';
  const entries=Object.entries(data).sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true}));
  if(!entries.length){screensEl.innerHTML='<div class="card muted">No screens yet. Add TV 1 above.</div>';return}
  for(const [id,d] of entries){
    const c=document.createElement('div');c.className='card';const s=shortUrl(id),slides=slidesFrom(d),first=slides[0];
    const thumb=first?.imageData?`<img src="${first.imageData}" alt="${esc(d.name||id)}" style="width:100%;max-height:220px;object-fit:contain;background:#111;border-radius:12px;margin:12px 0">`:'';
    const slideInfo=slides.length>1?`${slides.length} images • ${d.slideSeconds||slides[0]?.duration||10}s each`:'1 image';
    c.innerHTML=`<div class="screen-head"><div><div class="screen-title">${esc(d.name||id)}</div><div class="muted">ID: <span class="code">${esc(id)}</span></div></div><span class="pill">● LIVE</span></div>${thumb}<div class="small muted">${esc(slideInfo)}</div><div class="small muted" style="margin-top:8px">TV link: <span class="code">${esc(s)}</span></div><div class="actions"><button class="btn secondary" data-act="copy">Copy TV link</button><button class="btn secondary" data-act="replace">Edit display</button><button class="btn danger" data-act="delete">Delete</button></div>`;
    c.querySelector('[data-act="copy"]').onclick=async()=>{await navigator.clipboard.writeText(s);const b=c.querySelector('[data-act="copy"]');b.textContent='Copied';setTimeout(()=>b.textContent='Copy TV link',1200)};
    c.querySelector('[data-act="replace"]').onclick=()=>{
      $('screenId').value=id;$('screenName').value=d.name||'';$('screenFit').value=d.fit||'contain';$('slideSeconds').value=d.slideSeconds||slides[0]?.duration||10;
      currentSlides=slides.map(x=>({imageData:x.imageData,imageName:x.imageName||'Uploaded menu'}));drawPreviews();
      scrollTo({top:0,behavior:'smooth'});msg($('formMsg'),'Current display loaded. Choose new images if needed, or change seconds and Save.')
    };
    c.querySelector('[data-act="delete"]').onclick=async()=>{if(confirm('Delete screen '+id+'?'))await remove(ref(db,'screens/'+id))};
    screensEl.appendChild(c)
  }
}
