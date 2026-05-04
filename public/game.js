let socket = io();
let state = null;
let myId = null;

socket.emit("join", "room1");

socket.on("you", (id) => {
  myId = id;
});

socket.on("state", (g) => {
  state = g;
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
  const map = { "♠":"s","♥":"h","♦":"d","♣":"c" };
  return `/cards/${map[s]}${v.padStart(2,"0")}.png`;
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

  /* SCORES */
  document.getElementById("scores").innerHTML =
    Object.keys(state.scores || {}).map(id =>
      `<div>${id === myId ? "You" : "Opponent"}: ${state.scores[id]}</div>`
    ).join("");

  /* PLAY AGAIN BUTTON (NO OVERLAY) */
  const btn = document.getElementById("restartBtn");

  if (state.gameOver === true){
    btn.style.display = "block";
  } else {
    btn.style.display = "none";
  }

  /* HAND */
  document.getElementById("hand").innerHTML =
    p.hand.map(c =>
      `<img class="card" data-card="${c}" src="${back()}">`
    ).join("");

  /* OPP */
  document.getElementById("opponentHand").innerHTML =
    o ? o.hand.map(() => `<img class="card" src="${back()}">`).join("") : "";

  /* DISCARD */
  const top = state.discard.at(-1);
  document.getElementById("discard").innerHTML =
    top ? `<img class="card" src="${file(top)}">` : "";
}

/* INPUT */
document.addEventListener("click", (e) => {

  if (!state) return;

  if (state.gameOver) return;

  if (e.target.id === "deck") socket.emit("draw");

  if (e.target.closest("#discard")) socket.emit("takeDiscard");

  if (e.target.dataset.card && me()?.pending)
    socket.emit("swap", e.target.dataset.card);

  if (e.target.id === "restartBtn")
    socket.emit("restartGame", "room1");
});

/* SNAP */
document.addEventListener("dblclick", (e) => {
  const card = e.target.dataset.card;
  if (card) socket.emit("snap", card);
});