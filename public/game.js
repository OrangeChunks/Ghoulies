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

  if(!state) return;

  const p = me();

  const top = state.discard.at(-1);

  document.getElementById("discard").innerHTML =
    top ? `<img src="${file(top)}" class="card">` : "";

  document.getElementById("status").innerText =
    p.pendingDraw ? `Picked up ${p.pendingDraw}` : state.message;

  document.getElementById("hand").innerHTML =
    p.hand.map(c=>`<img src="${file(c)}" data-card="${c}" class="card">`).join("");

  const o = opp();

  document.getElementById("opponent").innerHTML =
    o.hand.map(()=>`<div class="card-back"></div>`).join("");

  let scoreHTML = "<h3>Scores</h3>";
  for(const id in state.scores){
    scoreHTML += `<div>${id===myId?"You":"Opponent"}: ${state.scores[id]}</div>`;
  }
  document.getElementById("scores").innerHTML = scoreHTML;
}

/* CLICK */
document.addEventListener("click",(e)=>{

  const p = me();
  if(!p) return;

  if(e.target.id === "deck"){
    socket.emit("draw");
  }

  if(e.target.closest("#discard")){

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

  if(e.target.id === "ghouliesBtn"){
    socket.emit("callGhoulies");
  }
});

/* SNAP ANYTIME */
document.addEventListener("dblclick",(e)=>{

  const card = e.target.dataset.card;
  if(!card) return;

  socket.emit("snap",card);
});