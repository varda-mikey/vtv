import { db, auth } from './firebase-client.js';
import { ref, onValue, set, update, remove } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';

const $=id=>document.getElementById(id);
const loginView=$('loginView'), appView=$('appView'), screensEl=$('screens');
let currentSlides=[];
let screenData={};

function msg(el,t){el.textContent=t||''}
function cleanId(v){return v.trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'')}
function base(){return location.origin + location.pathname.replace(/admin\.html$/,'').replace(/admin\/?$/,'')}
function shortUrl(id){return base().replace(/\/$/,'') + '/#' + id}
function esc(s){return String(s??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}
function secondsValue(){return Math.max(2,Math.min(120,parseInt($('slideSeconds').value||'10',10)||10))}
const AUDIO_LIMIT=2*1024*1024;
const AUDIO_INPUT_LIMIT=20*1024*1024;
function toDataUrl(blob){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(new Error('Could not read audio.'));
    reader.readAsDataURL(blob);
  });
}
async function encodeMp3(buffer,bitrate,progress){
  if(!window.lamejs?.Mp3Encoder) throw new Error('Music compressor is not available. Check your connection and reload VTV Admin.');
  const sampleRate=22050;
  const offline=new OfflineAudioContext(1,Math.ceil(buffer.duration*sampleRate),sampleRate);
  const source=offline.createBufferSource();
  source.buffer=buffer;
  source.connect(offline.destination);
  source.start();
  progress('Preparing audio…');
  const mono=(await offline.startRendering()).getChannelData(0);
  const encoder=new window.lamejs.Mp3Encoder(1,sampleRate,bitrate);
  const blocks=[];
  const CHUNK=1152;
  for(let i=0;i<mono.length;i+=CHUNK){
    const end=Math.min(mono.length,i+CHUNK);
    const pcm=new Int16Array(end-i);
    for(let j=i;j<end;j++){
      const n=Math.max(-1,Math.min(1,mono[j]));
      pcm[j-i]=n<0?n*32768:n*32767;
    }
    const encoded=encoder.encodeBuffer(pcm);
    if(encoded.length)blocks.push(new Uint8Array(encoded));
    if(i%(CHUNK*120)===0){
      progress('Compressing music… '+Math.min(99,Math.round(i/mono.length*100))+'%');
      await new Promise(resolve=>setTimeout(resolve,0));
    }
  }
  const last=encoder.flush();
  if(last.length)blocks.push(new Uint8Array(last));
  return new Blob(blocks,{type:'audio/mpeg'});
}
async function readAudio(file,progress=()=>{}){
  if(!file || !(/\.(mp3|m4a|wav|ogg|aac)$/i.test(file.name) || /^audio\//.test(file.type))) throw new Error('Choose an MP3, M4A, WAV or OGG music file.');
  if(file.size>AUDIO_INPUT_LIMIT) throw new Error('Music file is larger than the 20 MB input limit.');
  if(file.size<=AUDIO_LIMIT){
    progress('Music is already under 2 MB; no compression needed.');
    return {data:await toDataUrl(file),name:file.name};
  }
  progress('Opening music for automatic compression…');
  const context=new (window.AudioContext||window.webkitAudioContext)();
  let decoded;
  try{
    decoded=await context.decodeAudioData(await file.arrayBuffer());
  }catch(e){
    throw new Error('Your browser cannot decode this audio file. Try MP3 or WAV.');
  }finally{await context.close().catch(()=>{});}
  if(!decoded.duration || decoded.duration>15*60) throw new Error('Music longer than 15 minutes cannot be compressed here.');
  for(const bitrate of [48,32,24]){
    progress('Compressing to MP3 at '+bitrate+' kbps…');
    const mp3=await encodeMp3(decoded,bitrate,progress);
    // Base64 adds 33% overhead; budget for a little metadata overhead.
    if(mp3.size<=AUDIO_LIMIT){
      progress('Compressed '+(file.size/1048576).toFixed(1)+' MB to '+(mp3.size/1048576).toFixed(2)+' MB MP3.');
      return {data:await toDataUrl(mp3),name:file.name.replace(/\.[^.]+$/,'')+'-vtv.mp3'};
    }
  }
  throw new Error('This music is too long to fit the 2 MB limit, even at lower quality. Please use a shorter track.');
}
function isVideo(s){return s && s.mediaType==='video' && s.videoData}

function drawPreviews(){
  const wrap=$('previewWrap'), p=$('imagePreview');
  p.innerHTML='';
  if(!currentSlides.length){wrap.classList.add('hidden');return;}
  currentSlides.forEach((s,i)=>{
    const box=document.createElement('div');
    box.style.cssText='border:1px solid #e5e7eb;border-radius:12px;padding:8px;background:#fff';
    if(isVideo(s)){
      box.innerHTML=`<video src="${s.videoData}" controls muted playsinline style="width:100%;height:150px;object-fit:contain;background:#111;border-radius:8px;display:block"></video><div class="small muted" style="margin-top:6px">${i+1}. ${esc(s.videoName||'Video')}</div>`;
    }else{
      box.innerHTML=`<img src="${s.imageData}" alt="Slide ${i+1}" style="width:100%;height:150px;object-fit:contain;background:#111;border-radius:8px;display:block"><div class="small muted" style="margin-top:6px">${i+1}. ${esc(s.imageName||'Image')}</div>`;
    }
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
  return {mediaType:'image',imageData:out,imageName:file.name};
}

async function readVideo(file){
  if(!file || !file.type.startsWith('video/')) throw new Error('Please choose an MP4, WebM or OGG video.');
  if(file.size>8*1024*1024) throw new Error(file.name+' is larger than 8 MB. Please use a shorter/smaller video.');
  const dataUrl=await new Promise((resolve,reject)=>{
    const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=()=>reject(new Error('Could not read video.')); r.readAsDataURL(file);
  });
  return {mediaType:'video',videoData:dataUrl,videoName:file.name,videoMime:file.type};
}

$('screenImage').addEventListener('change',async e=>{
  const files=Array.from(e.target.files||[]);
  if(!files.length)return;
  const videos=files.filter(f=>f.type.startsWith('video/'));
  const images=files.filter(f=>f.type.startsWith('image/'));
  if(videos.length && (videos.length!==1 || images.length)) {e.target.value='';return msg($('formMsg'),'Choose either 1 video OR 1–6 images, not both.');}
  if(images.length>6){e.target.value='';return msg($('formMsg'),'Please select a maximum of 6 images per TV.');}
  try{
    currentSlides=[];
    if(videos.length){
      msg($('formMsg'),'Preparing video…');
      currentSlides.push(await readVideo(videos[0]));
      drawPreviews();
      msg($('formMsg'),'Video ready. It will play automatically on the TV.');
      return;
    }
    for(let i=0;i<images.length;i++){
      msg($('formMsg'),`Preparing image ${i+1} of ${images.length}…`);
      currentSlides.push(await compressImage(images[i]));
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
  if(!currentSlides.length) return msg($('formMsg'),'Please choose at least one image or one video first.');
  const sec=secondsValue();
  const hasVideo=isVideo(currentSlides[0]);
  if(hasVideo && currentSlides.length!==1) return msg($('formMsg'),'A video must be the only media for a TV.');
  const slides=currentSlides.map(s=>hasVideo?s:({...s,duration:sec}));
  const d={id,name:$('screenName').value.trim()||('TV '+id),slides,slideSeconds:sec,type:hasVideo?'video':'slideshow',fit:$('screenFit').value,active:true,updatedAt:Date.now()};
  if(!hasVideo && slides.length===1){d.imageData=slides[0].imageData;d.imageName=slides[0].imageName;d.type='image'}
  if(hasVideo){d.videoData=slides[0].videoData;d.videoName=slides[0].videoName;d.videoMime=slides[0].videoMime}
  const existing=screenData[id]||{};
  if(existing.audioData){d.audioData=existing.audioData;d.audioName=existing.audioName||'Music';}
  d.audioEnabled=existing.audioEnabled!==false;
  d.audioVolume=Number.isFinite(+existing.audioVolume)?+existing.audioVolume:25;
  try{
    $('saveBtn').disabled=true;
    msg($('formMsg'),'Saving to VARDA TV…');
    await set(ref(db,'screens/'+id),d);
    msg($('formMsg'),hasVideo?'Video saved. TV will play it automatically.':slides.length>1?`Saved ${slides.length}-image slideshow. Changes every ${sec} seconds.`:`Saved. TV ${id} updates automatically.`);
    $('screenImage').value='';
  }catch(e){msg($('formMsg'),'Save failed: '+e.message)}
  finally{$('saveBtn').disabled=false}
};

onAuthStateChanged(auth,user=>{loginView.classList.toggle('hidden',!!user);appView.classList.toggle('hidden',!user);if(user) start()});
let started=false;
function start(){if(started)return;started=true;onValue(ref(db,'screens'),snap=>render(snap.val()||{}))}

function slidesFrom(d){
  if(d && d.type==='video' && d.videoData)return [{mediaType:'video',videoData:d.videoData,videoName:d.videoName||'Video'}];
  if(Array.isArray(d.slides)&&d.slides.length)return d.slides;
  if(d.imageData)return [{mediaType:'image',imageData:d.imageData,imageName:d.imageName||'Uploaded menu',duration:d.slideSeconds||10}];
  return [];
}

function render(data){
  screenData=data;
  screensEl.innerHTML='';
  const entries=Object.entries(data).sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true}));
  if(!entries.length){screensEl.innerHTML='<div class="card muted">No screens yet. Add TV 1 above.</div>';return}
  for(const [id,d] of entries){
    const c=document.createElement('div');c.className='card';const s=shortUrl(id),slides=slidesFrom(d),first=slides[0];
    let thumb='';
    if(first?.videoData) thumb=`<video src="${first.videoData}" muted playsinline controls style="width:100%;max-height:220px;object-fit:contain;background:#111;border-radius:12px;margin:12px 0"></video>`;
    else if(first?.imageData) thumb=`<img src="${first.imageData}" alt="${esc(d.name||id)}" style="width:100%;max-height:220px;object-fit:contain;background:#111;border-radius:12px;margin:12px 0">`;
    const slideInfo=d.type==='video'?'VIDEO • autoplay + loop':slides.length>1?`${slides.length} images • ${d.slideSeconds||slides[0]?.duration||10}s each`:'1 image';
    c.innerHTML=`<div class="screen-head"><div><div class="screen-title">${esc(d.name||id)}</div><div class="muted">ID: <span class="code">${esc(id)}</span></div></div><span class="pill">● LIVE</span></div>${thumb}<div class="small muted">${esc(slideInfo)}</div><div class="small muted" style="margin-top:8px">TV link: <span class="code">${esc(s)}</span></div><div class="card" style="margin-top:12px;padding:12px;background:#f8fafc">
      <div style="font-weight:800;margin-bottom:6px">♫ Background music</div>
      <div class="small muted" data-audio-status>${d.audioData ? 'Music: '+esc(d.audioName||'Uploaded track') : 'No music assigned'} </div>
      <label>Upload music (MP3/M4A/WAV/OGG, up to 20 MB; auto-compressed if needed)</label><input type="file" accept=".mp3,.m4a,.wav,.ogg,.aac,audio/*" data-audio-file>
      <div class="row" style="margin-top:8px"><div><label>Volume: <span data-volume-label>${Number.isFinite(+d.audioVolume)?Math.round(+d.audioVolume):25}%</span></label><input data-audio-volume type="range" min="0" max="100" value="${Number.isFinite(+d.audioVolume)?Math.round(+d.audioVolume):25}"></div>
      <div><label>Playback</label><select data-audio-enable><option value="true" ${d.audioEnabled!==false?'selected':''}>On — loop continuously</option><option value="false" ${d.audioEnabled===false?'selected':''}>Off — mute</option></select></div></div>
      <div class="actions"><button class="btn secondary" data-act="saveaudio">Save music settings</button><button class="btn secondary" data-act="removeaudio">Remove music</button></div>
      <div class="small muted" data-audio-msg style="margin-top:6px">Menu images and videos are not changed by music settings.</div>
    </div><div class="actions"><button class="btn secondary" data-act="copy">Copy TV link</button><button class="btn secondary" data-act="replace">Edit display</button><button class="btn danger" data-act="delete">Delete</button></div>`;
    const slider=c.querySelector('[data-audio-volume]');
    slider.oninput=()=>c.querySelector('[data-volume-label]').textContent=slider.value+'%';
    c.querySelector('[data-act="saveaudio"]').onclick=async()=>{
      const file=c.querySelector('[data-audio-file]').files[0];
      const b=c.querySelector('[data-act="saveaudio"]'), note=c.querySelector('[data-audio-msg]');
      try {
        b.disabled=true;note.textContent='Saving music settings…';
        const settings={audioVolume:Number(slider.value),audioEnabled:c.querySelector('[data-audio-enable]').value==='true',updatedAt:Date.now()};
        if(file){const result=await readAudio(file,t=>note.textContent=t);settings.audioData=result.data;settings.audioName=result.name;}
        await update(ref(db,'screens/'+id),settings);
        note.textContent='Saved! TV will refresh automatically. If sound is blocked, tap Start Music on the TV.';
        c.querySelector('[data-audio-file]').value='';
      }catch(e){note.textContent='Music save failed: '+e.message}finally{b.disabled=false}
    };
    c.querySelector('[data-act="removeaudio"]').onclick=async()=>{
      if(!confirm('Remove music from TV '+id+'? The menu will remain.'))return;
      const note=c.querySelector('[data-audio-msg]');
      try{await update(ref(db,'screens/'+id),{audioData:null,audioName:null,audioEnabled:false,updatedAt:Date.now()});note.textContent='Music removed; menu unchanged.'}
      catch(e){note.textContent='Could not remove music: '+e.message}
    };
    c.querySelector('[data-act="copy"]').onclick=async()=>{await navigator.clipboard.writeText(s);const b=c.querySelector('[data-act="copy"]');b.textContent='Copied';setTimeout(()=>b.textContent='Copy TV link',1200)};
    c.querySelector('[data-act="replace"]').onclick=()=>{
      $('screenId').value=id;$('screenName').value=d.name||'';$('screenFit').value=d.fit||'contain';$('slideSeconds').value=d.slideSeconds||slides[0]?.duration||10;
      currentSlides=slides.map(x=>x.videoData?({mediaType:'video',videoData:x.videoData,videoName:x.videoName||'Video',videoMime:x.videoMime||'video/mp4'}):({mediaType:'image',imageData:x.imageData,imageName:x.imageName||'Uploaded menu'}));drawPreviews();
      scrollTo({top:0,behavior:'smooth'});msg($('formMsg'),'Current display loaded. Choose new media if needed, or change seconds and Save.')
    };
    c.querySelector('[data-act="delete"]').onclick=async()=>{if(confirm('Delete screen '+id+'?'))await remove(ref(db,'screens/'+id))};
    screensEl.appendChild(c)
  }
}
