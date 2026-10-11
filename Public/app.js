const $ = (id) => document.getElementById(id);
const state = { conversations: [], characters: [], currentId: null, activeCharacterId: null, status: {}, busy: false, lastPrompt: "", gallery: [] };
const APP_PASSWORD_KEY = "pocket-ai-app-password";
let toastTimer;
function id() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function escapeHtml(s="") { return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c])); }
function toast(message) { $("toast").textContent = message; $("toast").classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2800); }
function passwordHeaders() { const p = sessionStorage.getItem(APP_PASSWORD_KEY); return p ? { "x-app-password": p } : {}; }
async function api(url, options={}) {
  const response = await fetch(url, { ...options, headers: { "Content-Type":"application/json", ...passwordHeaders(), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function activeConversation() { return state.conversations.find(c => c.id === state.currentId); }
function activeCharacter() { return state.characters.find(c => c.id === state.activeCharacterId); }
async function loadData() {
  try {
    const data = await api("/api/data");
    state.conversations = data.conversations || [];
    state.characters = data.characters || [];
    state.status = data.status || {};
  } catch (err) {
    toast(err.message);
  }
  if (!state.conversations.length) createConversation(false);
  else { state.currentId = state.conversations[0].id; }
  renderAll();
  refreshStatus();
}
let saveQueue = Promise.resolve();
function saveData() {
  const payload = { conversations: state.conversations, characters: state.characters };
  saveQueue = saveQueue.catch(()=>{}).then(() => api("/api/data", { method:"PUT", body:JSON.stringify(payload) })).catch(err => toast(`Save failed: ${err.message}`));
  return saveQueue;
}
function createConversation(persist=true) {
  const c = { id:id(), title:"New chat", messages:[], updatedAt:Date.now() };
  state.conversations.unshift(c); state.currentId = c.id;
  renderAll();
  if (persist) saveData();
}
function switchConversation(cid) {
  state.currentId = cid;
  renderConversationList(); renderMessages();
  if (window.innerWidth <= 760) $("sidebar").classList.remove("open");
}
function renderConversationList() {
  const root = $("conversationList");
  root.innerHTML = "";
  for (const c of state.conversations.slice().sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0))) {
    const btn = document.createElement("button"); btn.className = `conversation-item ${c.id===state.currentId?"active":""}`;
    const label = document.createElement("span"); label.textContent = c.title || "New chat";
    const del = document.createElement("button"); del.className="delete-one"; del.type="button"; del.textContent="×"; del.title="Delete chat";
    del.addEventListener("click", async e => { e.stopPropagation(); if (!confirm("Delete this conversation?")) return; state.conversations = state.conversations.filter(x=>x.id!==c.id); if(state.currentId===c.id) state.currentId=state.conversations[0]?.id||null; if(!state.currentId) createConversation(false); renderAll(); await saveData(); });
    btn.append(label,del); btn.addEventListener("click",()=>switchConversation(c.id)); root.append(btn);
  }
}
function renderMessages() {
  const root = $("chatMessages"), c = activeConversation();
  root.innerHTML = "";
  if (!c || !c.messages.length) {
    const welcome = document.createElement("div"); welcome.className="welcome"; welcome.id="welcome";
    welcome.innerHTML = `<div class="welcome-mark">✦</div><h1>What can we create?</h1><p>Chat, build ideas, and develop consistent fictional characters.</p><div class="suggestions"><button data-prompt="Help me develop a fictional character with a consistent appearance.">♙ <span><b>Build a character</b><small>Appearance and personality notes</small></span></button><button data-prompt="Give me five creative, photorealistic image prompts for a poolside portrait.">▧ <span><b>Create an image prompt</b><small>Camera, lighting, and composition</small></span></button><button data-prompt="Help me plan a small business as a college student.">✧ <span><b>Explore an idea</b><small>Plan the next steps</small></span></button></div>`;
    root.append(welcome);
    welcome.querySelectorAll("[data-prompt]").forEach(b=>b.addEventListener("click",()=>{ $("chatInput").value=b.dataset.prompt; $("chatInput").focus(); }));
    return;
  }
  for (const m of c.messages) {
    const row=document.createElement("article"); row.className=`message ${m.role}`;
    const avatar=document.createElement("div"); avatar.className="message-avatar"; avatar.textContent=m.role==="user"?"●":"✦";
    const body=document.createElement("div"); body.className="message-body";
    const content=document.createElement("div"); content.textContent=m.content || "";
    body.append(content);
    if(m.role==="assistant") {
      const actions=document.createElement("div"); actions.className="message-actions";
      const copy=document.createElement("button"); copy.textContent="Copy"; copy.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(m.content);toast("Copied");}catch{toast("Copy is unavailable in this browser.");}});
      const regen=document.createElement("button"); regen.textContent="Regenerate"; regen.addEventListener("click",()=>regenerate(m.id));
      actions.append(copy,regen); body.append(actions);
    }
    row.append(avatar,body); root.append(row);
  }
  root.scrollTop=root.scrollHeight;
}
function renderCharacterPill() {
  const ch=activeCharacter(), pill=$("activeCharacterPill");
  if(!ch){pill.classList.add("hidden");pill.innerHTML="";return;}
  pill.classList.remove("hidden"); pill.innerHTML=`Using character: <b>${escapeHtml(ch.name)}</b> <button id="removeActiveCharacter">× Remove</button>`;
  $("removeActiveCharacter").addEventListener("click",()=>{state.activeCharacterId=null;renderCharacterPill();renderCharacterList();});
}
function renderCharacters() {
  const root=$("characterList"); $("characterCount").textContent=`${state.characters.length} saved`;
  if(!state.characters.length){root.innerHTML='<div class="empty-state">Your saved characters will appear here.</div>';return;}
  root.innerHTML="";
  for(const ch of state.characters) {
    const card=document.createElement("div");card.className="character-card";
    card.innerHTML=`<div class="character-avatar">♙</div><div class="character-card-main"><b>${escapeHtml(ch.name)}</b><p>${escapeHtml(ch.description||"No continuity notes yet.")}</p><small class="muted">${escapeHtml(ch.style||"Photorealistic")}</small><div><button class="select-character">Use in chat</button><button class="edit-character">Edit</button></div></div>`;
    card.querySelector(".select-character").addEventListener("click",()=>{state.activeCharacterId=ch.id;renderCharacterPill();toast(`${ch.name} selected`);showView("chat");});
    card.querySelector(".edit-character").addEventListener("click",()=>{ $("characterId").value=ch.id; $("characterName").value=ch.name; $("characterDescription").value=ch.description||""; $("characterStyle").value=ch.style||"Photorealistic"; $("characterFormTitle").textContent="Edit character"; $("deleteCharacter").disabled=false; window.scrollTo({top:0,behavior:"smooth"}); });
    root.append(card);
  }
}
function renderAll(){renderConversationList();renderMessages();renderCharacters();renderCharacterPill();}
function showView(view) {
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(v=>v.classList.toggle("active",v.dataset.view===view));
  $(`${view}View`).classList.add("active");
  if(window.innerWidth<=760) $("sidebar").classList.remove("open");
}
document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));
$("newChat").addEventListener("click",()=>{createConversation();showView("chat");if(window.innerWidth<=760)$("sidebar").classList.remove("open");$("chatInput").focus();});
$("clearChats").addEventListener("click",async()=>{if(!confirm("Delete all conversations?"))return;state.conversations=[];createConversation(false);renderAll();await saveData();});
$("openSidebar").addEventListener("click",()=>$("sidebar").classList.add("open"));
$("closeSidebar").addEventListener("click",()=>$("sidebar").classList.remove("open"));
function setBusy(busy){state.busy=busy;$("sendBtn").disabled=busy;$("generateBtn").disabled=busy;$("sendBtn").textContent=busy?"…":"↑";}
function titleFrom(s){return s.trim().split(/\s+/).slice(0,7).join(" ").slice(0,65)||"New chat";}
async function sendMessage(textOverride=null) {
  if(state.busy)return;
  const text=(textOverride ?? $("chatInput").value).trim(); if(!text)return;
  let c=activeConversation(); if(!c){createConversation(false);c=activeConversation();}
  $("chatInput").value=""; $("chatInput").style.height="auto";
  c.messages.push({id:id(),role:"user",content:text}); if(c.messages.filter(m=>m.role==="user").length===1)c.title=titleFrom(text); c.updatedAt=Date.now();
  renderAll(); showView("chat");
  const placeholder={id:id(),role:"assistant",content:"",pending:true}; c.messages.push(placeholder); renderMessages();
  setBusy(true);
  try {
    const messages=c.messages.filter(m=>!m.pending).map(m=>({role:m.role,content:m.content}));
    const result=await api("/api/chat",{method:"POST",body:JSON.stringify({messages,character:activeCharacter()})});
    const target=activeConversation(); const p=target?.messages.find(m=>m.id===placeholder.id);
    if(p){p.content=result.answer;p.pending=false;}
    c.updatedAt=Date.now(); renderAll(); await saveData();
  } catch(err) {
    const p=c.messages.find(m=>m.id===placeholder.id); if(p){p.content=`Error: ${err.message}`;p.pending=false;}
    renderAll();
  } finally {setBusy(false);$("chatInput").focus();}
}
$("chatForm").addEventListener("submit",e=>{e.preventDefault();sendMessage();});
$("chatInput").addEventListener("input",()=>{const el=$("chatInput");el.style.height="auto";el.style.height=`${Math.min(el.scrollHeight,180)}px`;});
$("chatInput").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}});
async function regenerate(messageId) {
  const c=activeConversation(); if(!c||state.busy)return;
  const idx=c.messages.findIndex(m=>m.id===messageId); if(idx<0)return;
  const previous=c.messages.slice(0,idx).filter(m=>m.role==="user"||m.role==="assistant").map(m=>({role:m.role,content:m.content}));
  const target=c.messages[idx]; target.content="";target.pending=true;renderMessages();setBusy(true);
  try {const r=await api("/api/chat",{method:"POST",body:JSON.stringify({messages:previous,character:activeCharacter()})});target.content=r.answer;target.pending=false;await saveData();}
  catch(err){target.content=`Error: ${err.message}`;target.pending=false;}
  renderAll();setBusy(false);
}
function resetCharacterForm(){ $("characterId").value="";$("characterName").value="";$("characterDescription").value="";$("characterStyle").value="Photorealistic";$("characterFormTitle").textContent="Create a character";$("deleteCharacter").disabled=true; }
$("resetCharacter").addEventListener("click",resetCharacterForm);
$("deleteCharacter").disabled=true;
$("characterForm").addEventListener("submit",async e=>{
  e.preventDefault();const cid=$("characterId").value;
  const ch={id:cid||id(),name:$("characterName").value.trim(),description:$("characterDescription").value.trim(),style:$("characterStyle").value,updatedAt:Date.now()};
  if(!ch.name)return;
  const idx=state.characters.findIndex(x=>x.id===ch.id);if(idx>=0)state.characters[idx]=ch;else state.characters.unshift(ch);
  if(!state.activeCharacterId)state.activeCharacterId=ch.id;
  await saveData();renderCharacters();renderCharacterPill();resetCharacterForm();toast("Character saved");
});
$("deleteCharacter").addEventListener("click",async()=>{const cid=$("characterId").value;if(!cid)return;state.characters=state.characters.filter(c=>c.id!==cid);if(state.activeCharacterId===cid)state.activeCharacterId=null;await saveData();renderAll();resetCharacterForm();toast("Character deleted");});
function imagePrompt() {
  const prompt=$("imagePrompt").value.trim();if(!prompt)return "";
  const style=$("imageStyle").value, ratio=$("imageRatio").value;
  const ch=activeCharacter();
  const continuity=$("useCharacter").checked&&ch?`\nCharacter continuity notes: ${ch.name}. ${ch.description}`:"";
  const shape=ratio==="Portrait"?"vertical portrait composition":ratio==="Landscape"?"wide landscape composition":"square composition";
  return `${prompt}\nStyle: ${style}. Composition: ${shape}.${continuity}\nUse a coherent composition, clear subject, natural anatomy, detailed lighting, and polished visual quality.`;
}
$("imageForm").addEventListener("submit",async e=>{
  e.preventDefault();const prompt=imagePrompt();if(!prompt){toast("Write an image prompt first.");return;}
  state.lastPrompt=prompt; $("imageState").textContent="Generating…";$("imageOutput").innerHTML='<div class="empty-art"><span>✧</span><b>Creating your image…</b><small>This can take a while on free providers.</small></div>'; $("imageActions").classList.add("hidden");setBusy(true);
  try {
    const r=await api("/api/image",{method:"POST",body:JSON.stringify({prompt})});
    const img=document.createElement("img");img.src=r.image;img.alt="AI generated image";
    $("imageOutput").innerHTML="";$("imageOutput").append(img);$("imageState").textContent=`Generated via ${r.provider}`;
    $("downloadImage").href=r.image;$("imageActions").classList.remove("hidden");
    state.gallery.unshift({id:id(),src:r.image,prompt:$("imagePrompt").value.trim(),date:Date.now()});state.gallery=state.gallery.slice(0,12);try{sessionStorage.setItem("pocket-ai-gallery",JSON.stringify(state.gallery));}catch{}
    renderGallery();toast("Image generated");
  } catch(err) {
    $("imageState").textContent="Could not generate";$("imageOutput").innerHTML=`<div class="empty-art"><span>!</span><b>Image generation failed</b><small>${escapeHtml(err.message)}</small></div>`;
  } finally {setBusy(false);}
});
$("usePrompt").addEventListener("click",()=>{$("imagePrompt").value=state.lastPrompt;toast("Prompt copied to editor");});
function renderGallery(){const root=$("imageGallery");if(!state.gallery.length){root.innerHTML='<p class="muted">Images you generate will be listed here.</p>';return;}root.innerHTML="";for(const item of state.gallery){const b=document.createElement("button");b.className="gallery-thumb";b.innerHTML=`<img alt="Generated image" src="${item.src}"><small>${escapeHtml(item.prompt)}</small>`;b.addEventListener("click",()=>{$("imageOutput").innerHTML=`<img alt="Generated image" src="${item.src}">`;$("imageState").textContent="Saved in this browser";$("downloadImage").href=item.src;$("imageActions").classList.remove("hidden");state.lastPrompt=item.prompt;});root.append(b);}}
try{state.gallery=JSON.parse(sessionStorage.getItem("pocket-ai-gallery")||"[]");}catch{state.gallery=[];}renderGallery();
function badge(el,ok,label){el.textContent=label;el.classList.toggle("ready",ok);el.classList.toggle("off",!ok);}
async function refreshStatus(){
  try{const h=await api("/api/health");state.status=h;
    $("providerDot").classList.toggle("ready",h.chatConfigured);$("providerStatus").textContent=h.chatConfigured?"Chat provider ready":"Chat needs setup";$("providerModel").textContent=h.chatConfigured?h.chatModel:"Add a server API key";
    badge($("chatStatusBadge"),h.chatConfigured,h.chatConfigured?"Configured":"Not configured");$("chatStatusText").textContent=h.chatConfigured?`Model: ${h.chatModel}`:"Set AI_API_KEY and AI_MODEL in the server .env file.";
    badge($("imageStatusBadge"),h.imageConfigured,h.imageConfigured?"Configured":"Not configured");$("imageStatusText").textContent=h.imageConfigured?`Provider: ${h.imageProvider}`:"Set HF_API_KEY and an available image model in .env.";
    badge($("passwordStatusBadge"),h.passwordRequired,h.passwordRequired?"Enabled":"Not enabled");$("passwordStatusText").textContent=h.passwordRequired?"Server requires an app password.":"For a public deployment, configure access protection and authentication.";
  }catch(err){$("providerStatus").textContent="Server unavailable";$("providerModel").textContent="Check deployment";}
}
function openSettings(){$("settingsModal").classList.remove("hidden");$("appPassword").value=sessionStorage.getItem(APP_PASSWORD_KEY)||"";refreshStatus();}
$("settingsBtn").addEventListener("click",openSettings);$("topSettings").addEventListener("click",openSettings);$("closeSettings").addEventListener("click",()=>$("settingsModal").classList.add("hidden"));
$("settingsModal").addEventListener("click",e=>{if(e.target===$("settingsModal"))$("settingsModal").classList.add("hidden");});
$("saveSettings").addEventListener("click",()=>{const p=$("appPassword").value;if(p)sessionStorage.setItem(APP_PASSWORD_KEY,p);else sessionStorage.removeItem(APP_PASSWORD_KEY);$("settingsModal").classList.add("hidden");refreshStatus();toast("Local settings saved");});
if("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
loadData();
