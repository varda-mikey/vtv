import { db, auth } from './firebase-client.js';
import { ref, onValue, set, remove } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';

const $=id=>document.getElementById(id);
const loginView=$('loginView'), appView=$('appView'), screensEl=$('screens');
let currentImageData='';
let currentImageName='';

function msg(el,t){el.textContent=t||''}
function cleanId(v){return v.trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'')}
function base(){return location.origin + location.pathname.replace(/admin\.html$/,'').replace(/admin\/?$/,'')}
function shortUrl(id){return base().replace(/\/$/,'') + '/#' + id}
function esc(s){return String(s??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}

function clear(){
  ['screenId','screenName'].forEach(x=>$(x).value='');
  $('screenImage').value='';
  $('screenFit').value='contain';
  currentImageData=''; currentImageName='';
  $('previewWrap').classList.add('hidden');
  $('imagePreview').removeAttribute('src');
  msg($('formMsg'),'');
}

async function compressImage(file){
  if(!file || !file.type.startsWith('image/')) throw new Error('Please choose a JPG, PNG or WebP image.');
  const dataUrl=await new Promise((resolve,reject)=>{
    const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=()=>reject(new Error('Could not read image.')); r.readAsDataURL(file);
  });
  const img=await new Promise((resolve,reject)=>{
    const i=new Image(); i.onload=()=>resolve(i); i.onerror=()=>reject(new Error('Could not open image.')); i.src=dataUrl;
  });

  // 1920x1080 is ideal for most TV menus and keeps Firebase payload small.
  const MAX_W=1920, MAX_H=1080;
  let w=img.naturalWidth, h=img.naturalHeight;
  const scale=Math.min(1,MAX_W/w,MAX_H/h);
  w=Math.max(1,Math.round(w*scale)); h=Math.max(1,Math.round(h*scale));
  const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
  const ctx=canvas.getContext('2d',{alpha:false});
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h); ctx.drawImage(img,0,0,w,h);
  let out=canvas.toDataURL('image/jpeg',0.9);
  // Extra compression if the base64 string is still large.
  if(out.length>4_500_000) out=canvas.toDataURL('image/jpeg',0.78);
  if(out.length>7_500_000) throw new Error('Image is still too large. Please use a smaller image.');
  return out;
}

$('screenImage').addEventListener('change',async e=>{
  const file=e.target.files?.[0]; if(!file)return;
  try{
    msg($('formMsg'),'Preparing image…');
    currentImageData=await compressImage(file);
    currentImageName=file.name;
    $('imagePreview').src=currentImageData;
    $('previewWrap').classList.remove('hidden');
    msg($('formMsg'),'Image ready. Click Upload & Save.');
  }catch(err){currentImageData='';msg($('formMsg'),err.message)}
});

$('loginBtn').onclick=async()=>{try{msg($('loginMsg'),'Signing in…');await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value);msg($('loginMsg'),'')}catch(e){msg($('loginMsg'),e.message)}};
$('logoutBtn').onclick=()=>signOut(auth);
$('clearBtn').onclick=clear;

$('saveBtn').onclick=async()=>{
  const id=cleanId($('screenId').value);
  if(!id) return msg($('formMsg'),'Screen ID is required. Example: 1');
  if(!currentImageData) return msg($('formMsg'),'Please choose a menu image first.');
  const d={
    id,
    name:$('screenName').value.trim() || ('TV '+id),
    imageData:currentImageData,
    imageName:currentImageName,
    type:'image',
    fit:$('screenFit').value,
    active:true,
    updatedAt:Date.now()
  };
  try{
    $('saveBtn').disabled=true;
    msg($('formMsg'),'Uploading image…');
    await set(ref(db,'screens/'+id),d);
    msg($('formMsg'),'Saved. TV '+id+' updates automatically.');
    currentImageData=''; currentImageName=''; $('screenImage').value='';
  }catch(e){msg($('formMsg'),'Save failed: '+e.message)}
  finally{$('saveBtn').disabled=false;}
};

onAuthStateChanged(auth,user=>{loginView.classList.toggle('hidden',!!user);appView.classList.toggle('hidden',!user);if(user) start();});
let started=false;
function start(){if(started)return;started=true;onValue(ref(db,'screens'),snap=>render(snap.val()||{}));}

function render(data){
  screensEl.innerHTML='';
  const entries=Object.entries(data).sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true}));
  if(!entries.length){screensEl.innerHTML='<div class="card muted">No screens yet. Add TV 1 above.</div>';return;}
  for(const [id,d] of entries){
    const c=document.createElement('div'); c.className='card'; const s=shortUrl(id);
    const thumb=d.imageData ? `<img src="${d.imageData}" alt="${esc(d.name||id)}" style="width:100%;max-height:220px;object-fit:contain;background:#111;border-radius:12px;margin:12px 0">` : '';
    c.innerHTML=`<div class="screen-head"><div><div class="screen-title">${esc(d.name||id)}</div><div class="muted">ID: <span class="code">${esc(id)}</span></div></div><span class="pill">● LIVE</span></div>${thumb}<div class="small muted">Image: ${esc(d.imageName||'Uploaded menu')}</div><div class="small muted" style="margin-top:8px">TV link: <span class="code">${esc(s)}</span></div><div class="actions"><button class="btn secondary" data-act="copy">Copy TV link</button><button class="btn secondary" data-act="replace">Replace image</button><button class="btn danger" data-act="delete">Delete</button></div>`;
    c.querySelector('[data-act="copy"]').onclick=async()=>{await navigator.clipboard.writeText(s);const b=c.querySelector('[data-act="copy"]');b.textContent='Copied';setTimeout(()=>b.textContent='Copy TV link',1200)};
    c.querySelector('[data-act="replace"]').onclick=()=>{
      $('screenId').value=id; $('screenName').value=d.name||''; $('screenFit').value=d.fit||'contain';
      currentImageData=d.imageData||''; currentImageName=d.imageName||'';
      if(currentImageData){$('imagePreview').src=currentImageData;$('previewWrap').classList.remove('hidden');}
      scrollTo({top:0,behavior:'smooth'}); msg($('formMsg'),'Choose a new image, or click Upload & Save to keep the current one.');
    };
    c.querySelector('[data-act="delete"]').onclick=async()=>{if(confirm('Delete screen '+id+'?')) await remove(ref(db,'screens/'+id))};
    screensEl.appendChild(c);
  }
}
