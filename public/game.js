let socket = io();
let state = null;
let myId = null;
let initialised = false;

socket.emit("join", "room1");

socket.on("you", (id) => {
  myId = id;
  document.getElementById("endScreen").classList.add("hidden");
});

socket.on("state", (g) => {
  state = g;

  // 🔥 HARD FIX: prevent stuck overlay on first load
  if (!initialised) {
    document.getElementById("endScreen").classList.add("hidden");
    initialised = true;
  }

  render();
});

function me(){
  return state?.players?.[myId];
}

function opp(){
  return Object.entries(state.players || {}).find(([id]) => id !== myId)?.[1];
}

/* CARD */
function file(card){
  const v = card.slice(0,-1);
  const s = card.slice(-1);
  const suit = { "♠":"s","♥":"h","♦":"d","♣":"c" }[s];
  return `/cards/${suit}${v.padStart(2,"0")}.png`;
}

function back(){
  return "/cards/back.png";
}

/* RENDER */
function render(){
  if (!state || !myId) return;

  const p = me();
  const o = opp();

  const isTurn = state.order[state.turn] === myId;

  document.getElementById("status").innerText =
    isTurn ? "Your turn" : "Their turn";

  /* END SCREEN FIX */
  const end = document.getElementById("endScreen");
  const txt = document.getElementById("endText");

  if (state.gameOver === true){
    txt.innerText = state.loser === myId ? "YOU LOSE 💀" : "YOU WIN 🎉";
    end.classList.remove("hidden");
  } else {
    end.classList.add("hidden");
  }

  /* HAND */
  document.getElementById("hand").innerHTML =
    p.hand.map(c => `<img class="card" data-card="${c}" src="${back()}">`).join("");

  /* OPP */
  document.getElementById("opponentHand").innerHTML =
    o ? o.hand.map(c => `<img class="card" src="${back()}">`).join("") : "";

  /* DISCARD */
  const top = state.discard.at(-1);
  document.getElementById("discard").innerHTML =
    top ? `<img class="card" src="${file(top)}">` : "";

  /* SCORES */
  document.getElementById("scores").innerHTML =
    Object.keys(state.players || {}).map(id =>
      `<div>${id === myId ? "You" : "Opponent"}: ${state.scores[id] || 0}</div>`
    ).join("");
}

/* INPUT */
document.addEventListener("click", (e) => {

  if (!state) return;

  if (state.gameOver) return;

  if (e.target.id === "deck") socket.emit("draw");

  if (e.target.closest("#discard")){
    socket.emit("takeDiscard");
  }

  if (e.target.dataset.card && me()?.pending){
    socket.emit("swap", e.target.dataset.card);
  }

  if (e.target.id === "ghouliesBtn"){
    socket.emit("callGhoulies");
  }

  if (e.target.id === "restartBtn"){
    document.getElementById("endScreen").classList.add("hidden");
    socket.emit("restartGame", "room1");
  }
});

document.addEventListener("dblclick", (e) => {
  if (state?.gameOver) return;

  const card = e.target.dataset.card;
  if (card) socket.emit("snap", card);
});