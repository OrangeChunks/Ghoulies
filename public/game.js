let socket = io();
let state = null;
let myId = null;

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
  let msg = "";

  if (isMyTurn()) {
    msg = "Your turn";
  } else {
    msg = "Opponent's turn";
  }

  if (me.pendingDraw) {
    msg = `Picked up: ${me.pendingDraw}`;
  }

  document.getElementById("status").innerText = msg;

  /* HAND */
  document.getElementById("hand").innerHTML = me.hand
    .map((c) => {
      let cls = "card";
      if (me.pendingDraw) cls += " snap";

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
   CLICK LOGIC (TURN LOCKED)
========================= */
document.addEventListener("click", (e) => {

  if (!isMyTurn()) return;

  const me = getMe(state);
  if (!me) return;

  if (e.target.id === "deck") {
    socket.emit("draw");
    return;
  }

  if (e.target.closest("#discard")) {
    const top = state.discard.at(-1);
    socket.emit("takeDiscard", top);
    return;
  }

  const card = e.target.dataset.card;

  if (card && me?.pendingDraw) {
    socket.emit("swap", card);
    return;
  }
});