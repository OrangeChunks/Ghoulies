let socket = io();
let state = null;
let myId = null;

let snapMode = false;

socket.emit("join", "room1");

socket.on("you", (id) => {
  myId = id;
});

socket.on("state", (game) => {
  state = game;
  render();
});

function getMe(game) {
  return game.players[myId];
}

function getOpponent(game) {
  return Object.values(game.players).find(p => p.id !== myId);
}

function isMyTurn() {
  return state.order[state.turn] === myId;
}

/* =========================
   RENDER
========================= */
function render() {
  if (!state || !myId) return;

  const me = getMe(state);
  if (!me) return;

  const top = state.discard.at(-1);

  /* DISCARD */
  document.getElementById("discard").innerHTML = top
    ? `<img src="${file(top)}" class="card">`
    : "";

  /* STATUS */
  let msg = isMyTurn() ? "Your turn" : "Opponent's turn";

  if (me.pendingDraw) {
    msg = `Picked up: ${me.pendingDraw}`;
  }

  document.getElementById("status").innerText = msg;

  /* HAND */
  document.getElementById("hand").innerHTML = me.hand
    .map((c) => {
      let cls = "card";
      if (snapMode) cls += " snap";

      return `<img src="${file(c)}" class="${cls}" data-card="${c}">`;
    })
    .join("");

  /* OPPONENT */
  const opp = getOpponent(state);

  if (opp) {
    document.getElementById("opponent").innerHTML =
      opp.hand.map(() =>
        `<div class="card-back"></div>`
      ).join("");
  }

  /* SNAP BUTTON */
  document.getElementById("snapBtn").style.display =
    isMyTurn() ? "inline-block" : "none";
}

/* CARD IMAGE */
function file(card) {
  const v = card.slice(0, -1);
  const s = card.slice(-1);

  const suit = { "♠": "s", "♥": "h", "♦": "d", "♣": "c" };
  const map = { A: "01", J: "11", Q: "12", K: "13" };

  const val = map[v] || v.padStart(2, "0");

  return `/cards/${suit[s]}${val}.png`;
}

/* =========================
   CLICK LOGIC
========================= */
document.addEventListener("click", (e) => {

  if (!isMyTurn()) return;

  const me = getMe(state);
  if (!me) return;

  /* SNAP BUTTON */
  if (e.target.id === "snapBtn") {
    snapMode = true;
    return;
  }

  /* SNAP SELECT */
  if (snapMode && e.target.dataset.card) {
    socket.emit("snap", e.target.dataset.card);
    snapMode = false;
    return;
  }

  /* DRAW */
  if (e.target.id === "deck") {
    socket.emit("draw");
    return;
  }

  /* TAKE DISCARD */
  if (e.target.closest("#discard")) {
    const top = state.discard.at(-1);
    socket.emit("takeDiscard", top);
    return;
  }

  /* SWAP */
  if (e.target.dataset.card && me?.pendingDraw) {
    socket.emit("swap", e.target.dataset.card);
    return;
  }
});