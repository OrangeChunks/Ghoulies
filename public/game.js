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
  return game?.players?.[myId];
}

function getOpponent(game){
  return Object.values(game.players).find(p => p.id !== myId);
}

function file(card){
  const v = card.slice(0,-1);
  const s = card.slice(-1);

  const suit = {"♠":"s","♥":"h","♦":"d","♣":"c"};
  const map = {A:"01",J:"11",Q:"12",K:"13"};

  const val = map[v] || v.padStart(2,"0");

  return `/cards/${suit[s]}${val}.png`;
}

/* =========================
   RENDER
========================= */
function render(){

  if(!state || !myId) return;

  const me = getMe(state);

  const top = state.discard.at(-1);

  document.getElementById("discard").innerHTML =
    top ? `<img src="${file(top)}" class="card">` : "";

  document.getElementById("status").innerText =
    me?.pendingDraw
      ? `Picked up: ${me.pendingDraw}`
      : state.message;

  /* HAND */
  document.getElementById("hand").innerHTML =
    me.hand.map(c =>
      `<img src="${file(c)}" class="card" data-card="${c}">`
    ).join("");

  /* OPPONENT */
  const opp = getOpponent(state);
  document.getElementById("opponent").innerHTML =
    opp.hand.map(()=>`<div class="card-back"></div>`).join("");

  /* SCOREBOARD */
  let html = "<h3>Scores</h3>";
  for(const id in state.scores){
    html += `<div>${id === myId ? "You" : "Opponent"}: ${state.scores[id]}</div>`;
  }
  document.getElementById("scores").innerHTML = html;
}

/* =========================
   CLICK LOGIC
========================= */
document.addEventListener("click",(e)=>{

  const me = getMe(state);
  if(!me) return;

  if(e.target.id === "ghouliesBtn"){
    socket.emit("callGhoulies");
    return;
  }

  if(e.target.id === "deck"){
    socket.emit("draw");
    return;
  }

  if(e.target.closest("#discard")){

    const top = state.discard.at(-1);

    if(!me.pendingDraw){
      socket.emit("takeDiscard", top);
    } else {
      socket.emit("rejectDraw");
    }

    return;
  }

  if(e.target.dataset.card && me.pendingDraw){
    socket.emit("swap", e.target.dataset.card);
  }
});

/* =========================
   SNAP ANYTIME
========================= */
document.addEventListener("dblclick",(e)=>{

  const card = e.target.dataset.card;
  if(!card) return;

  socket.emit("snap", card);
});