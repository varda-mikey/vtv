import { db } from "./firebase-client.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const stage = document.getElementById('stage');
const status = document.getElementById('status');

function screenId(){
  const p = location.pathname.split('/').filter(Boolean);
  // On a project-pages URL, repo name can be first segment. Prefer explicit ?id or hash.
  const q = new URLSearchParams(location.search);
  if(q.get('id')) return q.get('id').trim().toLowerCase();
  if(location.hash && location.hash.length>1) return location.hash.slice(1).trim().toLowerCase();
  if(p.length){
    const last = p[p.length-1].replace(/\.html$/,'');
    if(!['index','tv','404'].includes(last.toLowerCase())) return last.toLowerCase();
  }
  return '';
}

function setStatus(text, kind=''){
  status.textContent=text;
  status.className=kind;
}

function kindFrom(url, forced){
  if(forced && forced!=='auto') return forced;
  const clean=(url||'').split('?')[0].toLowerCase();
  if(/\.(png|jpe?g|webp|gif|svg)$/.test(clean)) return 'image';
  if(/\.(mp4|webm|ogg)$/.test(clean)) return 'video';
  return 'web';
}

function render(data){
  stage.innerHTML='';
  if(!data || data.active===false || !data.url){
    setStatus('This TV screen is not assigned yet.','error');
    return;
  }
  const type=kindFrom(data.url,data.type);
  let el;
  if(type==='image'){
    el=document.createElement('img');
    el.src=data.url;
    el.className='fit-'+(data.fit||'contain');
  }else if(type==='video'){
    el=document.createElement('video');
    el.src=data.url; el.autoplay=true; el.loop=true; el.muted=true; el.playsInline=true;
    el.className='fit-'+(data.fit||'contain');
  }else{
    el=document.createElement('iframe');
    el.src=data.url;
    el.allow='autoplay; fullscreen';
  }
  stage.appendChild(el);
  setStatus(`LIVE • ${data.name || 'TV'} • ${data.url}`,'ok');
  try{localStorage.setItem('varda-tv-cache',JSON.stringify({id:screenId(),data}));}catch(e){}
}

const id=screenId();
if(!id){
  setStatus('No screen ID. Use #1, ?id=1, or /1','error');
}else{
  setStatus('Connecting to screen '+id+'…');
  const cached=localStorage.getItem('varda-tv-cache');
  if(cached){try{const c=JSON.parse(cached); if(c.id===id) render(c.data);}catch(e){}}
  onValue(ref(db,'screens/'+id), snap=>{
    render(snap.val());
  }, err=>setStatus('Connection error: '+err.message,'error'));
}
