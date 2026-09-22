const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const state = { screen:"mine", data:null, tasks:[], withdrawals:[] };

async function api(path, options={}) {
  const headers = {...(options.headers||{})};
  if (tg?.initData) headers["X-Telegram-Init-Data"] = tg.initData;
  const res = await fetch(path,{...options,headers});
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function fallbackDemoUser(){
  return {id:0,firstName:"Demo",username:"demo",wallet:"",balance:0,totalMined:0,
    level:1,miningRate:1,referrals:0,referralEarned:0,mineable:0,dailyClaimAt:0};
}

async function load(){
  try { state.data = await api("/api/me"); }
  catch(e){
    state.data = {user:fallbackDemoUser(),config:{referralReward:100,minWithdraw:1000,botUsername:""}};
    console.warn(e.message);
  }
  render();
}

function u(){return state.data.user}
function fmt(n){return Number(n||0).toFixed(4)}
function setScreen(s){state.screen=s;render()}

function render(){
  document.querySelectorAll(".nav button").forEach(b=>b.classList.toggle("active",b.dataset.screen===state.screen));
  const s=document.getElementById("screen");
  if(state.screen==="mine") s.innerHTML=mineHTML();
  if(state.screen==="tasks") s.innerHTML=tasksHTML();
  if(state.screen==="boost") s.innerHTML=boostHTML();
  if(state.screen==="friends") s.innerHTML=friendsHTML();
  if(state.screen==="profile") s.innerHTML=profileHTML();
  bind();
}

function mineHTML(){
  const x=u();
  const max=Math.min(100,(x.mineable/(24*x.miningRate))*100);
  return `<div class="balance">
    <div class="muted">TERON BALANCE</div>
    <div class="num">${fmt(x.balance + x.mineable)}</div><div class="coin">TERON</div>
    <div class="circle">+${fmt(x.miningRate)}<small>/h</small></div>
    <div class="bar"><i style="width:${max}%"></i></div>
    <button class="btn" id="claimMine">CLAIM ${fmt(x.mineable)} TERON</button>
    <button class="btn secondary" id="daily">🎁 Daily Bonus +15 TERON</button>
  </div>
  <div class="card"><h2>Mining status</h2>
    <div class="row"><div><div class="muted">Level</div><div class="value">LV ${x.level}</div></div>
    <div><div class="muted">Mining rate</div><div class="value">${fmt(x.miningRate)} / hour</div></div></div>
  </div>`;
}

function tasksHTML(){
  return `<h1>Tasks</h1>
  <div class="card"><div class="muted">Complete tasks and claim TERON rewards.</div></div>
  <div id="tasksList" class="list"><div class="card">Loading...</div></div>`;
}

function boostHTML(){
  const x=u(), cost=Math.round(50*Math.pow(1.55,x.level-1));
  return `<h1>Miner Store</h1>
  <div class="card">
    <div class="muted">MY LEVEL</div><div class="big">Level ${x.level} / 1000</div>
    <div class="row" style="margin-top:12px"><div><div class="muted">Mining rate</div><b>${fmt(x.miningRate)}/h</b></div>
    <div><span class="pill">Next: ${cost} TERON</span></div></div>
    <button class="btn" id="upgrade">Upgrade Miner — ${cost} TERON</button>
  </div>
  <div class="card"><h2>Levels</h2><div class="muted">Higher levels increase your hourly mining rate.</div></div>`;
}

function friendsHTML(){
  const x=u(), username=state.data.config.botUsername || "YOUR_BOT";
  const link=`https://t.me/${username}?start=ref_${x.id}`;
  return `<h1>Friends</h1>
  <div class="card"><h2>Your invite link</h2>
    <input id="refLink" value="${link}" readonly>
    <button class="btn" id="copyRef">Copy</button>
  </div>
  <div class="stat">
    <div class="card"><div class="muted">Your Referrals</div><div class="big">${x.referrals}</div></div>
    <div class="card"><div class="muted">Referral Reward</div><div class="big">${fmt(x.referralEarned)}</div></div>
  </div>
  <div class="card"><h2>Team Wallet</h2><div class="muted">Referral reward: ${state.data.config.referralReward} TERON per eligible referral.</div></div>`;
}

function profileHTML(){
  const x=u();
  return `<h1>Profile</h1>
  <div class="card"><div class="row"><div><b>${escapeHtml(x.firstName||"TERON User")}</b><div class="muted">@${escapeHtml(x.username||"user")}</div></div><span class="pill">ID ${x.id}</span></div></div>
  <div class="card"><h2>Wallet</h2>
    <input id="wallet" placeholder="Enter TON wallet address" value="${escapeHtml(x.wallet||"")}">
    <button class="btn secondary" id="saveWallet">Save Wallet</button>
  </div>
  <div class="card"><h2>Total Assets</h2><div class="big">${fmt(x.balance)} TERON</div><div class="muted">Holding wallet: ${x.wallet?"Connected":"Not connected"}</div></div>
  <div class="card"><h2>Withdraw TERON</h2>
    <div class="muted">Minimum: ${state.data.config.minWithdraw} TERON</div>
    <input id="withdrawAmount" type="number" min="${state.data.config.minWithdraw}" placeholder="Amount">
    <button class="btn" id="withdraw">Request Withdrawal</button>
  </div>
  <div class="card"><h2>Withdrawal History</h2><div id="withdrawals">Loading...</div></div>`;
}

function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function toast(msg){ alert(msg); }

async function loadTasks(){
  try{
    const r=await api("/api/tasks"); state.tasks=r.tasks;
    document.getElementById("tasksList").innerHTML=state.tasks.length?state.tasks.map(t=>`
      <div class="card task"><div class="grow"><b>${escapeHtml(t.title)}</b><div class="muted">+${fmt(t.reward)} TERON</div></div>
      <button class="btn ${t.claimed?'secondary':''}" data-task="${t.id}" ${t.claimed?'disabled':''}>${t.claimed?'CLAIMED':'OPEN'}</button></div>`).join("")
      : `<div class="card">No active tasks yet.</div>`;
  }catch(e){toast(e.message)}
}

async function loadWithdrawals(){
  try{
    const r=await api("/api/withdrawals");
    document.getElementById("withdrawals").innerHTML=r.withdrawals.length?
      r.withdrawals.map(w=>`<div class="card"><div class="row"><b>${fmt(w.amount)} TERON</b><span class="pill">${w.status}</span></div><div class="muted">${new Date(w.created_at).toLocaleString()}</div></div>`).join("")
      : `<div class="muted">No withdrawals yet.</div>`;
  }catch(e){document.getElementById("withdrawals").textContent=e.message}
}

function bind(){
  document.querySelectorAll(".nav button").forEach(b=>b.onclick=()=>setScreen(b.dataset.screen));
  document.getElementById("claimMine")?.addEventListener("click",async()=>{
    try{const r=await api("/api/mine/claim",{method:"POST"});toast(`Claimed ${fmt(r.amount)} TERON`);await load()}catch(e){toast(e.message)}
  });
  document.getElementById("daily")?.addEventListener("click",async()=>{
    try{const r=await api("/api/daily",{method:"POST"});toast(r.ok?`Daily +${r.reward} TERON`:"Already claimed today");await load()}catch(e){toast(e.message)}
  });
  document.getElementById("upgrade")?.addEventListener("click",async()=>{
    try{const r=await api("/api/upgrade",{method:"POST"});toast(r.ok?`Upgraded to level ${r.level}`:`Need ${r.cost} TERON`);await load()}catch(e){toast(e.message)}
  });
  document.getElementById("copyRef")?.addEventListener("click",async()=>{
    await navigator.clipboard.writeText(document.getElementById("refLink").value);toast("Referral link copied");
  });
  document.querySelectorAll("[data-task]").forEach(btn=>btn.addEventListener("click",async()=>{
    const id=btn.dataset.task; const task=state.tasks.find(t=>String(t.id)===String(id));
    if(task?.url) window.open(task.url,"_blank");
    setTimeout(async()=>{
      try{const r=await api(`/api/tasks/${id}/claim`,{method:"POST"});toast(r.ok?`+${r.reward} TERON`:`${r.reason}`);await load()}catch(e){toast(e.message)}
    },1200);
  }));
  document.getElementById("saveWallet")?.addEventListener("click",async()=>{
    try{await api("/api/wallet",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({wallet:document.getElementById("wallet").value})});toast("Wallet saved");await load()}catch(e){toast(e.message)}
  });
  document.getElementById("withdraw")?.addEventListener("click",async()=>{
    try{
      const amount=Number(document.getElementById("withdrawAmount").value);
      const r=await api("/api/withdraw",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({amount})});
      toast(r.ok?`Withdrawal #${r.id} submitted`:`${r.reason||"Withdrawal failed"}`);await load();
    }catch(e){toast(e.message)}
  });
  if(state.screen==="tasks") loadTasks();
  if(state.screen==="profile") loadWithdrawals();
}

load();
