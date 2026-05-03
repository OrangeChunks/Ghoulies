let socket = io();
let state = null;
let myId = null;

socket.emit("join","room1");

socket.on("you",(id)=>{
  myId = id;
});

socket.on("state",(game)=>{
  state = game;
  render();
});

function getMe(game){
  if(!game || !myId) return null;
  return game.players[myId];
}

function getOpponent(game){
  return Object.values(game.players).find(p => p.id !== myId);
}

function isMyTurn(){
  return state?.order[state.turn] === myId;
}

/* =========================
   RENDER
========================= */
function render(){

  if(!state || !myId){
    document.getElementById("status").innerText = "Connecting...";
    return;
  }

  const me = getMe(state);
  if(!me) return;

  const top = state.discard.at(-1);

  document.getElementById("discard").innerHTML =
    top ? `<img src="${file(top)}" class="card">` : "";

  let msg = isMyTurn() ? "Your turn" : "Opponent turn";

  if(me.pendingDraw){
    msg = `Picked up: ${me.pendingDraw} (click discard to reject or card to swap)`;
  }

  document.getElementById("status").innerText = msg;

  document.getElementById("hand").innerHTML =
    me.hand.map(c =>
      `<img src="${file(c)}" class="card" data-card="${c}">`
    ).join("");

  const opp = getOpponent(state);

  if(opp){
    document.getElementById("opponent").innerHTML =
      opp.hand.map(()=> `<div class="card-back"></div>`).join("");
  }
}

/* CARD IMAGE */
function file(card){
  const v = card.slice(0,-1);
  const s = card.slice(-1);

  const suit = {"♠":"s","♥":"h","♦":"d","♣":"c"};
  const map = {A:"01",J:"11",Q:"12",K:"13"};

  const val = map[v] || v.padStart(2,"0");

  return `/cards/${suit[s]}${val}.png`;
}

/* =========================
   CLICK LOGIC
========================= */
document.addEventListener("click",(e)=>{

  if(!isMyTurn()) return;

  const me = getMe(state);
  if(!me) return;

  /* GHOULIES */
  if(e.target.id === "ghouliesBtn"){
    socket.emit("callGhoulies");
    return;
  }

  /* DRAW */
  if(e.target.id === "deck"){
    socket.emit("draw");
    return;
  }

  /* DISCARD LOGIC */
  if(e.target.closest("#discard")){

    const top = state.discard.at(-1);

    /* take discard */
    if(!me.pendingDraw){
      socket.emit("takeDiscard", top);
      return;
    }

    /* reject draw */
    if(me.pendingDraw){
      socket.emit("rejectDraw");
      return;
    }
  }

  /* SWAP */
  if(e.target.dataset.card && me.pendingDraw){
    socket.emit("swap", e.target.dataset.card);
    return;
  }
});

/* =========================
   SNAP (DOUBLE CLICK)
========================= */
document.addEventListener("dblclick",(e)=>{

  if(!isMyTurn()) return;

  const card = e.target.dataset.card;
  if(!card) return;

  socket.emit("snap", card);
});