let socket = io();
let state = null;
let myId = null;

socket.emit("join","room1");

socket.on("you",(id)=> myId = id );

socket.on("state",(game)=>{
  state = game;
  render();
});

function me(){
  return state.players[myId];
}

function opp(){
  return Object.values(state.players).find(p=>p.id!==myId);
}

function render(){

  if(!state) return;

  const p = me();
  const isTurn = state.order[state.turn] === myId;

  document.getElementById("status").innerText =
    isTurn ? "🎯 Your turn" : "⏳ Their turn";

  const top = state.discard.at(-1);

  document.getElementById("discard").innerText = top || "";

  document.getElementById("hand").innerHTML =
    p.hand.map(c=>`<button data-card="${c}">${c}</button>`).join("");

  const o = opp();

  document.getElementById("opponent").innerHTML =
    o.hand.map(()=>`<span>🂠</span>`).join("");

  let html = "<h3>Scores</h3>";
  for(const id in state.scores){
    html += `<div>${id===myId?"You":"Opponent"}: ${state.scores[id]}</div>`;
  }
  document.getElementById("scores").innerHTML = html;
}

/* CLICK */
document.addEventListener("click",(e)=>{

  const p = me();
  if(!p) return;

  /* ✅ GHOULIES ALWAYS WORKS */
  if(e.target.id === "ghouliesBtn"){
    socket.emit("callGhoulies");
    return;
  }

  const isTurn = state.order[state.turn] === myId;
  if(!isTurn) return;

  if(e.target.id === "deck"){
    socket.emit("draw");
  }

  if(e.target.id === "discard"){
    const top = state.discard.at(-1);

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

/* SNAP */
document.addEventListener("dblclick",(e)=>{

  const card = e.target.dataset.card;
  if(!card) return;

  socket.emit("snap",card);
});