let socket = io();
let state = null;

socket.emit("join", "room1");

socket.on("state", (game) => {
  state = game;
  render();
});

function getMe(game) {
  return Object.values(game.players)[0];
}

/* =========================
   RENDER
========================= */
function render() {
  if (!state) return;

  const me = getMe(state);
  if (!me) return;

  const top = state.discard.at(-1);

  /* DISCARD */
  document.getElementById("discard").innerHTML = top
    ? `<img src="${file(top)}" class="card">`
    : "";

  /* STATUS */
  let msg = "Choose deck or discard";

  if (me.pendingDraw) {
    msg = `Picked up: ${me.pendingDraw}`;
  } else if (state.message) {
    msg = state.message;
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
}

/* =========================
   CARD FILE MAP
========================= */
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

  const me = getMe(state);

  /* DRAW FROM DECK */
  if (e.target.id === "deck") {
    socket.emit("draw");
    return;
  }

  /* TAKE DISCARD (FIXED: SEND TOP CARD) */
  if (e.target.closest("#discard")) {
    const top = state.discard.at(-1);
    socket.emit("takeDiscard", top);
    return;
  }

  /* SWAP */
  const card = e.target.dataset.card;

  if (card && me?.pendingDraw) {
    socket.emit("swap", card);
    return;
  }
});