let socket = io();
let state = null;

let pickedCard = null;
let pickedSource = null;

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

  /* =========================
     DISCARD PILE
  ========================== */
  document.getElementById("discard").innerHTML = top
    ? `<img src="${file(top)}" class="card">`
    : "";

  /* =========================
     STATUS MESSAGE (NOW SHOWS REAL CARD)
  ========================== */
  let msg = state.message || "Choose deck or discard";

  if (pickedCard) {
    msg = `Picked up: ${pickedCard}`;
  }

  document.getElementById("status").innerText = msg;

  /* =========================
     HAND (RED HIGHLIGHT WHEN ACTIVE)
  ========================== */
  document.getElementById("hand").innerHTML = me.hand
    .map((c) => {
      let cls = "card";

      if (pickedCard) cls += " snap";

      return `<img src="${file(c)}" class="${cls}" data-card="${c}">`;
    })
    .join("");
}

/* =========================
   CARD IMAGE MAPPER
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

  /* =========================
     PICK FROM DECK
  ========================== */
  if (e.target.id === "deck") {
    socket.emit("draw");

    // show real intent instead of generic text
    pickedCard = "Card drawn from deck";
    pickedSource = "deck";

    return;
  }

  /* =========================
     PICK FROM DISCARD
  ========================== */
  if (e.target.closest("#discard")) {
    socket.emit("draw");

    pickedCard = "Card drawn from discard";
    pickedSource = "discard";

    return;
  }

  /* =========================
     SWAP INTO HAND
  ========================== */
  const card = e.target.dataset.card;

  if (card && pickedCard) {
    socket.emit("swap", card);

    pickedCard = null;
    pickedSource = null;

    return;
  }
});