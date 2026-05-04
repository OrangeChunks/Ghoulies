let socket = io();
let state=null;
let myId=null;

socket.emit("join","room1");

socket.on("you",(id)=> myId=id);

socket.on("state",(game)=>{
  state=game;
  render();
});

function me(){ return state?.players?.[myId]; }
function opp(){ return Object.values(state.players).find(p=>p.id!==myId); }

function file(card){
  const v=card.slice(0,-1);
  const s=card.slice(-1);

  const suit={"♠":"s","♥":"h","♦":"d","♣":"c"};
  const map={A:"01",J:"11",Q:"12",K:"13"};

  return `/cards/${suit[s]}${map[v]||v.padStart(2,"0")}.png`;
}

function render(){

  if(!state||!myId) return;

  const p=me();
  if(!p) return;

  const ready = Object.keys(state.players).length===2;
  const isTurn = state.order[state.turn]===myId;

  document.getElementById("status").innerText =
    !ready ? "Waiting for opponent..."
    : state.showingScores ? "Scores updating..."
    : isTurn ? "Your turn"
    : "Their turn";

  /* DRAWN */
  document.getElementById("drawn").innerHTML =
    p.pendingDraw ? `<img src="${file(p.pendingDraw)}" class="card">` : "";

  /* DISCARD */
  const top=state.discard.at(-1);
  document.getElementById("discard").innerHTML =
    top ? `<img src="${file(top)}" class="card">` : "";

  /* HAND */
  document.getElementById("hand").innerHTML =
    p.hand.map(c=>`<img src="${file(c)}" data-card="${c}" class="card">`).join("");

  /* OPPONENT */
  const o=opp();
  document.getElementById("opponent").innerHTML =
    o ? o.hand.map(()=>`<img src="/cards/back.png" class="card">`).join("") : "";

  /* SCORES */
  let html="<h3>Scores</h3>";
  for(const id in state.scores){
    html += `<div>${id===myId?"You":"Opponent"}: ${state.scores[id]}</div>`;
  }
  document.getElementById("scores").innerHTML = html;
}

/* CLICK */
document.addEventListener("click",(e)=>{

  if(!state||!myId) return;

  const p=me();
  if(!p) return;

  const ready = Object.keys(state.players).length===2;
  const isTurn = state.order[state.turn]===myId;

  if(e.target.id==="ghouliesBtn"){
    if(ready && !state.showingScores){
      socket.emit("callGhoulies");
    }
    return;
  }

  if(!ready || !isTurn || state.showingScores) return;

  if(e.target.id==="deck"){
    socket.emit("draw");
  }

  if(e.target.closest("#discard")){
    const top=state.discard.at(-1);

    if(!p.pendingDraw){
      socket.emit("takeDiscard",top);
    } else {
      socket.emit("rejectDraw");
    }
  }

  if(e.target.dataset.card && p.pendingDraw){
    socket.emit("swap",e.target.dataset.card);
  }
});

/* SNAP ANYTIME */
document.addEventListener("dblclick",(e)=>{
  const card=e.target.dataset.card;
  if(card) socket.emit("snap",card);
});