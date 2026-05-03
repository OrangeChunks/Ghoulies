let socket = io();
let state;

socket.emit("join", "room1");

socket.on("state", (game) => {
  state = game;
  render();
});

function getMe(game) {
  const players = Object.values(game.players);
  return players[0]; // fallback safe (fixes undefined issue)
}

function render() {
  if (!state) return;

  const me = getMe(state);
  if (!me) return;

  /* =========================
     DISCARD PILE
  ========================== */
  const top = state.discard[state.discard.length - 1];

  document.getElementById("discard").innerHTML = top
    ? `<img src="${file(top)}" class="card">`
    : "";

  /* =========================
     HAND
  ========================== */
  document.getElementById("hand").innerHTML = me.hand
    .map((c) => `<img src="${file(c)}" class="card" data-card="${c}">`)
    .join("");

  /* =========================
     STATUS
  ========================== */
  document.getElementById("status").innerText =
    state.message || "Waiting...";
}

/* =========================
   CARD IMAGE MAP
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
   CLICK EVENTS
========================= */
document.addEventListener("click", (e) => {

  const card = e.target.dataset.card;

  if (card) {
    socket.emit("snap", card);
  }

  if (e.target.id === "deck") {
    socket.emit("draw");
  }
});