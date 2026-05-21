let socket = io();

let state = null;
let myId = null;

/* MEMORY PHASE */
let revealed = [];
let memoryDone = false;

socket.emit("join", "room1");

socket.on("you", id => {
  myId = id;
});

socket.on("state", g => {
  state = g;
  render();
});

function me(){
  return state.players?.[myId];
}

function oppId(){
  return state.order?.find(id => id !== myId);
}

/* CARD IMAGE */
function file(card){

  const v = card.slice(0,-1);
  const s = card.slice(-1);

  const suitMap = {
    "♠":"s",
    "♥":"h",
    "♦":"d",
    "♣":"c"
  };

  const valueMap = {
    "A":"01",
    "2":"02",
    "3":"03",
    "4":"04",
    "5":"05",
    "6":"06",
    "7":"07",
    "8":"08",
    "9":"09",
    "10":"10",
    "J":"11",
    "Q":"12",
    "K":"13"
  };

  return `/cards/${suitMap[s]}${valueMap[v]}.png`;
}

function back(){
  return "/cards/back.png";
}

/* DECK CLICK FIX */
function clickedDeck(el){
  return el.id === "deck" || el.closest("#deck");
}

/* MAIN RENDER */
function render(){

  if (!state || !myId) return;

  const p = me();
  const o = state.players?.[oppId()];

  const turn =
    state.order[state.turn] === myId;

  /* STATUS */
  if (!memoryDone){

    document.getElementById("status").innerText =
      `Choose 2 cards to memorise (${revealed.length}/2)`;

  } else if (
    state.tenSwap &&
    state.tenSwap.player === myId
  ){

    if (state.tenSwap.selectingOwn){

      document.getElementById("status").innerText =
        "Choose one of YOUR cards to swap";

    } else {

      document.getElementById("status").innerText =
        "Choose an OPPONENT card to swap";
    }

  } else {

    document.getElementById("status").innerText =
      turn ? "Your turn" : "Their turn";
  }

  /* SCORES */
  document.getElementById("scores").innerHTML =
    `You: ${state.scores?.[myId] || 0}
     | Opponent: ${state.scores?.[oppId()] || 0}`;

  /* YOUR HAND */
  document.getElementById("hand").innerHTML =
    p?.hand?.map((c,i) => {

      const visible =
        revealed.includes(i);

      const tenGlow =
        state.tenSwap &&
        state.tenSwap.player === myId &&
        state.tenSwap.selectingOwn;

      return `
        <img
          class="card ${tenGlow ? "tenGlow" : ""}"
          data-card="${c}"
          data-index="${i}"
          src="${visible ? file(c) : back()}"
        >
      `;
    }).join("") || "";

  /* OPPONENT HAND */
  document.getElementById("opponentHand").innerHTML =
    o?.hand?.map((c,i) => {

      const tenGlow =
        state.tenSwap &&
        state.tenSwap.player === myId &&
        !state.tenSwap.selectingOwn;

      return `
        <img
          class="card ${tenGlow ? "tenGlow" : ""}"
          data-opp="${c}"
          data-oppindex="${i}"
          src="${back()}"
        >
      `;
    }).join("") || "";

  /* DISCARD */
  const top = state.discard?.at(-1);

  document.getElementById("discard").innerHTML =
    top
      ? `<img class="card" src="${file(top)}">`
      : "";

  /* PENDING */
  const pending = p?.pending;

  document.getElementById("pending").innerHTML =
    pending && turn
      ? `
        <div style="margin-top:10px">

          <div style="margin-bottom:6px">
            You picked up:
          </div>

          <img
            class="card flip"
            src="${file(pending)}"
            style="width:80px"
          >

        </div>
      `
      : "";

  /* RESTART */
  document.getElementById("restartBtn").style.display =
    state.gameOver
      ? "block"
      : "none";
}

/* CLICK EVENTS */
document.addEventListener("click", e => {

  if (!state) return;

  /* MEMORY PHASE */
  if (!memoryDone){

    if (e.target.dataset.index !== undefined){

      const i =
        Number(e.target.dataset.index);

      if (!revealed.includes(i)){

        revealed.push(i);

        render();

        if (revealed.length === 2){

          setTimeout(() => {

            revealed = [];
            memoryDone = true;

            render();

          }, 5000);
        }
      }
    }

    return;
  }

  /* 🔥 10 OWN CARD */
  if (
    state.tenSwap &&
    state.tenSwap.player === myId &&
    state.tenSwap.selectingOwn &&
    e.target.dataset.card
  ){

    socket.emit(
      "tenOwn",
      e.target.dataset.card
    );

    return;
  }

  /* 🔥 10 OPP CARD */
  if (
    state.tenSwap &&
    state.tenSwap.player === myId &&
    !state.tenSwap.selectingOwn &&
    e.target.dataset.opp
  ){

    socket.emit(
      "tenOpp",
      e.target.dataset.opp
    );

    return;
  }

  /* DRAW */
  if (clickedDeck(e.target)){

    socket.emit("draw");

    const deck =
      document.querySelector("#deck img");

    if (deck){

      deck.classList.add("flip");

      setTimeout(() => {
        deck.classList.remove("flip");
      }, 600);
    }

    return;
  }

  /* TAKE DISCARD */
  if (e.target.closest("#discard")){

    socket.emit("takeDiscard");

    return;
  }

  /* NORMAL SWAP */
  if (
    e.target.dataset.card &&
    me()?.pending
  ){

    socket.emit(
      "swap",
      e.target.dataset.card
    );

    return;
  }

  /* GHOULIES */
  if (e.target.id === "ghouliesBtn"){

    socket.emit("callGhoulies");

    return;
  }

  /* RESTART */
  if (e.target.id === "restartBtn"){

    socket.emit("restart", "room1");

    return;
  }
});

/* SNAP */
document.addEventListener("dblclick", e => {

  if (!memoryDone) return;

  const c =
    e.target.dataset.card;

  if (c){

    socket.emit("snap", c);
  }
});