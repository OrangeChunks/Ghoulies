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

function opponentId(){
  if (!state?.order) return null;
  return state.order.find(id => id !== myId);
}

/* CARD IMAGE */
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

  const me = state.players?.[myId];
  const opp = state.players?.[opponentId()];

  const isTurn = state.order[state.turn] === myId;

  document.getElementById("status").innerText =
    isTurn ? "Your turn" : "Their turn";

  /* SCORES (NO DUPLICATES) */
  const scoresEl = document.getElementById("scores");
  scoresEl.innerHTML = `
    <div>You: ${state.scores?.[myId] || 0}</div>
    <div>Opponent: ${state.scores?.[opponentId()] || 0}</div>
  `;

  /* PLAY AGAIN BUTTON */
  const btn = document.getElementById("restartBtn");
  btn.style.display = state.gameOver ? "block" : "none";

  /* YOUR HAND */
  document.getElementById("hand").innerHTML =
    me?.hand?.map(c =>
      `<img class="card" data-card="${c}" src="${back()}">`
    ).join("") || "";

  /* OPPONENT HAND */
  document.getElementById("opponentHand").innerHTML =
    opp?.hand?.map(() =>
      `<img class="card" src="${back()}">`
    ).join("") || "";

  /* DISCARD */
  const top = state.discard?.at(-1);
  document.getElementById("discard").innerHTML =
    top ? `<img class="card" src="${file(top)}">` : "";
}

/* INPUT */
document.addEventListener("click", (e) => {

  if (!state) return;

  if (state.gameOver) return;

  if (e.target.id === "deck") socket.emit("draw");

  if (e.target.closest("#discard"))
    socket.emit("takeDiscard");

  if (e.target.dataset.card && state.players?.[myId]?.pending)
    socket.emit("swap", e.target.dataset.card);

  if (e.target.id === "ghouliesBtn")
    socket.emit("callGhoulies");

  if (e.target.id === "restartBtn")
    socket.emit("restartGame", "room1");
});

/* SNAP */
document.addEventListener("dblclick", (e) => {
  const card = e.target.dataset.card;
  if (card) socket.emit("snap", card);
});