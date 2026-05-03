let socket = io();
let state = null;
let selectedCard = null;
let selectedSource = null;

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

  const discardTop = state.discard.at(-1);

  /* =========================
     DISCARD PILE
  ========================== */
  document.getElementById("discard").innerHTML = discardTop
    ? `<img src="${file(discardTop)}" class="card">`
    : "";

  /* =========================
     STATUS MESSAGE
  ========================== */
  let msg = state.message || "";

  if (selectedCard) {
    msg = `You selected: ${selectedCard}`;
  }

  document.getElementById("status").innerText = msg;

  /* =========================
     HAND (HIGHLIGHT LOGIC)
  ========================== */
  document.getElementById("hand").innerHTML = me.hand
    .map((c) => {
      let cls = "card";

      if (selectedCard) {
        cls += " snap"; // reuse red highlight
      }

      return `<img src="${file(c)}" class="${cls}" data-card="${c}">`;
    })
    .join("");

  /* =========================
     HIDE ALL BUTTONS (RULE)
  ========================== */
  // no permanent UI buttons
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
   MAIN CLICK LOGIC
========================= */
document.addEventListener("click", (e) => {

  const me = getMe(state);

  /* =========================
     STEP 1: PICK FROM DECK OR DISCARD
  ========================== */
  if (e.target.id === "deck") {
    socket.emit("draw");
    selectedCard = "deck card";
    selectedSource = "deck";
    return;
  }

  if (e.target.closest("#discard")) {
    socket.emit("draw"); // treat discard as draw in your server logic
    selectedCard = "discard card";
    selectedSource = "discard";
    return;
  }

  /* =========================
     STEP 2: CLICK HAND CARD (SWAP)
  ========================== */
  const card = e.target.dataset.card;

  if (card && selectedSource) {
    socket.emit("swap", card);

    selectedCard = null;
    selectedSource = null;

    return;
  }

});