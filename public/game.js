let socket = io();
let state = null;
let myId = null;

socket.emit("join","room1");

socket.on("you",(id)=> {
  myId = id;
});

socket.on("state",(game)=>{
  state = game;
  render();
});

function me(){
  if(!state || !myId) return null;
  return state.players[myId];
}

function opp(){
  return Object.values(state.players).find(p=>p.id!==myId);
}

/* CARD IMAGE */
function file(card){
  const v = card.slice(0,-1);
  const s = card.slice(-1);

  const suit = {"♠":"s","♥":"h","♦":"d","♣":"c"};
  const map = {A:"01",J:"11",Q:"12",K:"13"};

  return `/cards/${suit[s]}${map[v]||v.padStart(2,"0")}.png`;
}

/* RENDER */
function render(){

  if(!state || !myId) return;

  const p = me();
  if(!p) return;

  const isTurn = state.order[state.turn] === myId;

  document.getElementById("status").innerText =
    isTurn ? "🎯 Your turn" : "⏳ Their turn";

  /* DISCARD */
  const top = state.discard.at(-1);

  document.getElementById("discard").innerHTML =
    top ? `<img src="${file(top)}" class="card">` : "";

  /* HAND */
  document.getElementById("hand").innerHTML =
    p.hand.map(c =>
      `<img src="${file(c)}" data-card="${c}" class="card">`
    ).join("");

  /* OPPONENT */
  const o = opp();
  document.getElementById("opponent").innerHTML =
    o ? o.hand.map(()=>`<img src="/cards/back.png" class="card">`).join("") : "";

  /* SCORES */
  let html = "<h3>Scores</h3>";
  for(const id in state.scores){
    html += `<div>${id===myId?"You":"Opponent"}: ${state.scores[id]}</div>`;
  }
  document.getElementById("scores").innerHTML = html;
}

/* =========================
   CLICK HANDLER (FIXED)
========================= */
document.addEventListener("click",(e)=>{

  if(!state || !myId) return;

  const p = me();
  if(!p) return;

  /* ✅ GHOULIES ALWAYS WORKS */
  if(e.target.id === "ghouliesBtn"){
    console.log("Ghoulies clicked");
    socket.emit("callGhoulies");
    return;
  }

  const isTurn = state.order[state.turn] === myId;

  /* ❌ block gameplay clicks if not your turn */
  if(!isTurn) return;

  /* DRAW */
  if(e.target.id === "deck"){
    console.log("Draw clicked");
    socket.emit("draw");
    return;
  }

  /* DISCARD */
  if(e.target.closest("#discard")){

    const top = state.discard.at(-1);

    if(!p.pendingDraw){
      console.log("Take discard");
      socket.emit("takeDiscard", top);
    } else {
      console.log("Reject draw");
      socket.emit("rejectDraw");
    }

    return;
  }

  /* HAND */
  if(e.target.dataset.card && p.pendingDraw){
    console.log("Swap", e.target.dataset.card);
    socket.emit("swap", e.target.dataset.card);
  }
});

/* =========================
   SNAP (ANYTIME)
========================= */
document.addEventListener("dblclick",(e)=>{

  if(!state) return;

  const card = e.target.dataset.card;
  if(!card) return;

  console.log("Snap attempt:", card);
  socket.emit("snap",card);
});