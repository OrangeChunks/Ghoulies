let socket = io();
let state = null;
let myId = null;

socket.emit("join", "room1");

socket.on("you", id => myId = id);

socket.on("state", g => {
  state = g;
  render();
});

function me(){ return state.players?.[myId]; }

function oppId(){
  return state.order?.find(id => id !== myId);
}

/* ✔ FIXED CARD MAPPING (THIS FIXES JACKS ETC) */
function file(card){
  const v = card.slice(0,-1);
  const s = card.slice(-1);

  const suitMap = {
    "♠":"s","♥":"h","♦":"d","♣":"c"
  };

  const valueMap = {
    "A":"01","2":"02","3":"03","4":"04","5":"05",
    "6":"06","7":"07","8":"08","9":"09",
    "10":"10","J":"11","Q":"12","K":"13"
  };

  return `/cards/${suitMap[s]}${valueMap[v]}.png`;
}

function back(){ return "/cards/back.png"; }

function render(){
  if (!state) return;

  const p = me();
  const o = state.players?.[oppId()];

  const turn = state.order[state.turn] === myId;

  document.getElementById("status").innerText =
    turn ? "Your turn" : "Their turn";

  document.getElementById("scores").innerHTML =
    `You: ${state.scores[myId] || 0} | Opponent: ${state.scores[oppId()] || 0}`;

  document.getElementById("restartBtn").style.display =
    state.gameOver ? "block" : "none";

  document.getElementById("hand").innerHTML =
    p?.hand?.map(c =>
      `<img class="card" data-card="${c}" src="${back()}">`
    ).join("") || "";

  document.getElementById("opponentHand").innerHTML =
    o?.hand?.map(() =>
      `<img class="card" src="${back()}">`
    ).join("") || "";

  const top = state.discard?.at(-1);
  document.getElementById("discard").innerHTML =
    top ? `<img class="card" src="${file(top)}">` : "";
}

/* INPUT */
document.addEventListener("click", e => {
  if (!state) return;

  if (e.target.id === "deck") socket.emit("draw");

  if (e.target.closest("#discard")) socket.emit("takeDiscard");

  if (e.target.dataset.card && me()?.pending)
    socket.emit("swap", e.target.dataset.card);

  if (e.target.id === "ghouliesBtn")
    socket.emit("callGhoulies");

  if (e.target.id === "restartBtn")
    socket.emit("restart", "room1");
});

document.addEventListener("dblclick", e => {
  const c = e.target.dataset.card;
  if (c) socket.emit("snap", c);
});