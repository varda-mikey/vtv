import { db, auth } from './firebase-client.js';
import { ref, onValue, set, remove } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';

const $=id=>document.getElementById(id);
const loginView=$('loginView'), appView=$('appView'), screensEl=$('screens');
function msg(el,t){el.textContent=t||''}
function cleanId(v){return v.trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'')}
function base(){return location.origin + location.pathname.replace(/admin\.html$/,'').replace(/admin\/?$/,'')}
function shortUrl(id){return base().replace(/\/$/,'') + '/#' + id}
function formData(){return {id:cleanId($('screenId').value),name:$('screenName').value.trim(),url:$('screenUrl').value.trim(),type:$('screenType').value,fit:$('screenFit').value,active:true,updatedAt:Date.now()}}
function clear(){['screenId','screenName','screenUrl'].forEach(x=>$(x).value='');$('screenType').value='auto';$('screenFit').value='contain';msg($('formMsg'),'')}

$('loginBtn').onclick=async()=>{try{msg($('loginMsg'),'Signing in…');await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value);msg($('loginMsg'),'')}catch(e){msg($('loginMsg'),e.message)}};
$('logoutBtn').onclick=()=>signOut(auth);
$('clearBtn').onclick=clear;
$('saveBtn').onclick=async()=>{const d=formData();if(!d.id||!d.url){return msg($('formMsg'),'Screen ID and Content URL are required.')}try{new URL(d.url)}catch(e){return msg($('formMsg'),'Please enter a full URL beginning with http:// or https://')}await set(ref(db,'screens/'+d.id),d);msg($('formMsg'),'Saved. TV updates automatically.');};

onAuthStateChanged(auth,user=>{loginView.classList.toggle('hidden',!!user);appView.classList.toggle('hidden',!user);if(user) start();});
let started=false;
function start(){if(started)return;started=true;onValue(ref(db,'screens'),snap=>render(snap.val()||{}));}
function render(data){screensEl.innerHTML='';const entries=Object.entries(data).sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true}));if(!entries.length){screensEl.innerHTML='<div class="card muted">No screens yet. Add Screen 1 above.</div>';return;}
for(const [id,d] of entries){const c=document.createElement('div');c.className='card';const s=shortUrl(id);c.innerHTML=`<div class="screen-head"><div><div class="screen-title">${esc(d.name||id)}</div><div class="muted">ID: <span class="code">${esc(id)}</span></div></div><span class="pill">● LIVE</span></div><div class="url-preview" title="${esc(d.url||'')}">${esc(d.url||'')}</div><div class="small muted" style="margin-top:10px">TV: <span class="code">${esc(s)}</span></div><div class="actions"><button class="btn secondary" data-act="copy">Copy TV link</button><button class="btn secondary" data-act="edit">Edit</button><button class="btn danger" data-act="delete">Delete</button></div>`;
c.querySelector('[data-act="copy"]').onclick=async()=>{await navigator.clipboard.writeText(s);c.querySelector('[data-act="copy"]').textContent='Copied';setTimeout(()=>c.querySelector('[data-act="copy"]').textContent='Copy TV link',1200)};
c.querySelector('[data-act="edit"]').onclick=()=>{$('screenId').value=id;$('screenName').value=d.name||'';$('screenUrl').value=d.url||'';$('screenType').value=d.type||'auto';$('screenFit').value=d.fit||'contain';scrollTo({top:0,behavior:'smooth'})};
c.querySelector('[data-act="delete"]').onclick=async()=>{if(confirm('Delete screen '+id+'?')) await remove(ref(db,'screens/'+id))};screensEl.appendChild(c);}}
function esc(s){return String(s??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}
