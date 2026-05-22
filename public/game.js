let socket = io();

let state = null;
let myId = null;

/* MEMORY PHASE */
let revealed = [];
let memoryDone = false;

let shownRoundPopup = false;

socket.emit("join", "room1");

socket.on("you", id => {
  myId = id;
});

socket.on("state", g => {

  state = g;

  /* ROUND POPUP */
  if (
    state.roundResult &&
    !shownRoundPopup
  ){

    shownRoundPopup = true;

    const myScore =
      state.roundResult[myId];

    alert(
      `Round Over!\n\nYou scored ${myScore} points this round.`
    );

    /* RESET MEMORY PHASE */
    memoryDone = false;
    revealed = [];

  }

  /* RESET POPUP TRACKER */
  if (!state.roundResult){
    shownRoundPopup = false;
  }

  render();
});

function me(){
  return state.players?.[myId];
}

function oppId(){
  return state.order?.find(id => id !== myId);
}

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

function clickedDeck(el){
  return el.id === "deck" || el.closest("#deck");
}

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

  /* SPECIAL MESSAGE */
  if (state.message){

    document.getElementById("status").innerText =
      state.message;
  }

  document.getElementById("scores").innerHTML =
    `You: ${state.scores?.[myId] || 0}
     | Opponent: ${state.scores?.[oppId()] || 0}`;

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

  document.getElementById("opponentHand").innerHTML =
    o?.hand?.map((c,i) => {

      const tenGlow =
        state.tenSwap &&
        state.tenSwap.player === myId &&
        !state.tenSwap.selectingOwn;

      return `
        <img
          class="card ${tenGlow ? "tenGlow" : ""}"
          data-oppindex="${i}"
          src="${back()}"
        >
      `;
    }).join("") || "";

  const top = state.discard?.at(-1);

  document.getElementById("discard").innerHTML =
    top
      ? `<img class="card" src="${file(top)}">`
      : "";

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

  document.getElementById("restartBtn").style.display =
    state.gameOver
      ? "block"
      : "none";
}

/* CLICK EVENTS */
document.addEventListener("click", e => {

  if (!state) return;

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

  if (
    state.tenSwap &&
    state.tenSwap.player === myId &&
    state.tenSwap.selectingOwn &&
    e.target.dataset.index !== undefined
  ){

    socket.emit(
      "tenOwn",
      Number(e.target.dataset.index)
    );

    return;
  }

  if (
    state.tenSwap &&
    state.tenSwap.player === myId &&
    !state.tenSwap.selectingOwn &&
    e.target.dataset.oppindex !== undefined
  ){

    socket.emit(
      "tenOpp",
      Number(e.target.dataset.oppindex)
    );

    return;
  }

  if (clickedDeck(e.target)){

    socket.emit("draw");

    return;
  }

  if (e.target.closest("#discard")){

    socket.emit("takeDiscard");

    return;
  }

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

  if (e.target.id === "ghouliesBtn"){

    socket.emit("callGhoulies");

    return;
  }

  if (e.target.id === "restartBtn"){

    socket.emit("restart", "room1");

    return;
  }

  if (e.target.id === "resetBtn"){

    localStorage.clear();

    sessionStorage.clear();

    socket.disconnect();

    location.reload();

    return;
  }
});

document.addEventListener("dblclick", e => {

  if (!memoryDone) return;

  const c =
    e.target.dataset.card;

  if (c){

    socket.emit("snap", c);
  }
});