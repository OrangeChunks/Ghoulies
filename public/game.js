let socket = io({
  reconnection:true,
  reconnectionAttempts:99999,
  reconnectionDelay:1000
});

let state = null;
let myId = null;

let revealed = [];
let memoryDone = false;

let shownRoundPopup = false;

/* SOUNDS */
const sounds = {
  draw:new Audio("/sounds/draw.mp3"),
  discard:new Audio("/sounds/discard.mp3"),
  snap:new Audio("/sounds/snap.mp3"),
  ghoulies:new Audio("/sounds/ghoulies.mp3"),
  swap:new Audio("/sounds/swap.mp3")
};

function play(name){

  if (!sounds[name]) return;

  sounds[name].currentTime = 0;
  sounds[name].play();
}

function vibrate(ms=100){

  if (navigator.vibrate){
    navigator.vibrate(ms);
  }
}

function connectToRoom(){

  socket.emit("join", "room1");
}

connectToRoom();

/* RECONNECT */
socket.on("connect", () => {

  connectToRoom();
});

socket.on("you", id => {
  myId = id;
});

socket.on("state", g => {

  /* EFFECTS */
  if (g.effect){

    switch(g.effect.type){

      case "drawDeck":
        play("draw");
        break;

      case "discard":
        play("discard");
        break;

      case "swap":
        play("swap");
        break;

      case "snapSuccess":
        play("snap");
        vibrate(150);

        document.body.classList.add("snapFlash");

        setTimeout(() => {
          document.body.classList.remove("snapFlash");
        },200);

        break;

      case "ghoulies":
        play("ghoulies");
        vibrate(400);

        document.body.classList.add("ghouliesFlash");

        setTimeout(() => {
          document.body.classList.remove("ghouliesFlash");
        },500);

        break;
    }
  }

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
`ROUND OVER

You scored:
${myScore}

TOTAL SCORE:
${state.scores[myId]}`
    );

    memoryDone = false;
    revealed = [];
  }

  if (!state.roundResult){
    shownRoundPopup = false;
  }

  render();
});

/* FORCE RESET */
socket.on("forceReload", () => {

  location.reload();
});

function me(){
  return state?.players?.[myId];
}

function oppId(){

  return state?.order?.find(
    id => id !== myId
  );
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

  /* TURN GLOW */
  document
    .getElementById("hand")
    .classList.toggle(
      "activeTurn",
      turn
    );

  let statusText = "";

  if (!memoryDone){

    statusText =
      `Memorise 2 cards (${revealed.length}/2)`;

  } else if (
    state.tenSwap &&
    state.tenSwap.player === myId
  ){

    if (state.tenSwap.selectingOwn){

      statusText =
        "Choose YOUR card";

    } else {

      statusText =
        "Choose OPPONENT card";
    }

  } else {

    statusText =
      turn
      ? "YOUR TURN"
      : "OPPONENT TURN";
  }

  if (
    state.message &&
    state.message[myId]
  ){
    statusText =
      state.message[myId];
  }

  document.getElementById("status").innerText =
    statusText;

  document.getElementById("scores").innerHTML =
`
You: ${state.scores?.[myId] || 0}
|
Opponent: ${state.scores?.[oppId()] || 0}
`;

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

  /* OPPONENT */
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

  /* DISCARD */
  const top = state.discard?.at(-1);

  document.getElementById("discard").innerHTML =
    top
      ? `<img class="card pop" src="${file(top)}">`
      : "";

  /* PENDING */
  const pending = p?.pending;

  document.getElementById("pending").innerHTML =
    pending && turn
      ? `
        <div>

          <div style="margin-bottom:8px">
            Picked Up
          </div>

          <img
            class="card flip bigCard"
            src="${file(pending)}"
          >

        </div>
      `
      : "";

  document.getElementById("noSwapBtn").style.display =
    (
      state.tenSwap &&
      state.tenSwap.player === myId &&
      state.tenSwap.selectingOwn
    )
      ? "inline-block"
      : "none";

  document.getElementById("restartBtn").style.display =
    state.gameOver
      ? "block"
      : "none";
}

/* CLICKS */
document.addEventListener("click", e => {

  if (!state) return;

  /* MEMORY */
  if (!memoryDone){

    if (e.target.dataset.index !== undefined){

      if (revealed.length >= 2){
        return;
      }

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

  if (e.target.id === "noSwapBtn"){

    socket.emit("tenOwn", null);

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

    document
      .getElementById("deck")
      .classList.add("deckShake");

    setTimeout(() => {
      document
        .getElementById("deck")
        .classList.remove("deckShake");
    },300);

    socket.emit("draw");

    return;
  }

  if (e.target.closest("#discard")){

    if (me()?.pending){

      socket.emit("discardPending");

    } else {

      socket.emit("takeDiscard");
    }

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

    socket.emit(
      "fullReset",
      "room1"
    );

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