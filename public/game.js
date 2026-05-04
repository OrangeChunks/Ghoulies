let socket = io();
let state=null;
let myId=null;

socket.emit("join","room1");

socket.on("you",(id)=>myId=id);
socket.on("state",(g)=>{state=g;render();});

function me(){return state?.players?.[myId];}
function opp(){return Object.values(state.players||{}).find(p=>p.id!==myId);}

function file(c){
  const v=c.slice(0,-1);
  const s=c.slice(-1);
  const suit={"♠":"s","♥":"h","♦":"d","♣":"c"};
  const map={A:"01",J:"11",Q:"12",K:"13"};
  return `/cards/${suit[s]}${map[v]||v.padStart(2,"0")}.png`;
}

function render(){
  if(!state||!myId) return;

  const p=me();
  const ready=Object.keys(state.players).length===2;
  const isTurn=state.order[state.turn]===myId;

  document.getElementById("status").innerText =
    !ready?"Waiting..."
    :state.showingScores?"Scoring..."
    :isTurn?"Your turn":"Their turn";

  document.getElementById("ghouliesBtn").disabled =
    state.ghouliesCalled || state.showingScores;

  document.getElementById("drawn").innerHTML =
    p.pendingDraw?`<img src="${file(p.pendingDraw)}" class="card">`:"";

  const top=state.discard.at(-1);
  document.getElementById("discard").innerHTML =
    top?`<img src="${file(top)}" class="card">`:"";

  document.getElementById("hand").innerHTML =
    p.hand.map(c=>`<img class="card" data-card="${c}" src="${file(c)}">`).join("");

  const o=opp();
  document.getElementById("opponent").innerHTML =
    o?o.hand.map(()=>`<img src="/cards/back.png" class="card">`).join(""):"";

  let html="<h3>Scores</h3>";
  for(const id in state.scores){
    html+=`<div>${id===myId?"You":"Opponent"}: ${state.scores[id]}</div>`;
  }
  document.getElementById("scores").innerHTML=html;
}

/* INPUT */
document.addEventListener("click",(e)=>{

  if(!state||!myId) return;

  const p=me();
  const ready=Object.keys(state.players).length===2;
  const isTurn=state.order[state.turn]===myId;

  if(e.target.id==="ghouliesBtn"){
    socket.emit("callGhoulies");
    return;
  }

  if(!ready||state.showingScores) return;

  if(e.target.id==="deck") socket.emit("draw");

  if(e.target.closest("#discard")){
    const top=state.discard.at(-1);
    if(!p.pendingDraw) socket.emit("takeDiscard",top);
    else socket.emit("rejectDraw");
  }

  if(e.target.dataset.card && p.pendingDraw && isTurn){
    socket.emit("swap",e.target.dataset.card);
  }
});

/* SNAP */
document.addEventListener("dblclick",(e)=>{
  const c=e.target.dataset.card;
  if(c) socket.emit("snap",c);
});