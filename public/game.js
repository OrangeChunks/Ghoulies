let socket = io();

let state = null;
let myId = null;

let revealed = [];
let memoryDone = false;

let shownRoundPopup = false;

function connectToRoom(){
  socket.emit("join", "room1");
}

connectToRoom();

socket.on("you", id => {
  myId = id;
});

socket.on("state", g => {

  state = g;

  /* WIN / LOSE */
  if (state.gameOver){

    if (state.losers.includes(myId)){

      setTimeout(() => {
        alert("YOU LOSE");
      }, 300);

    } else {

      setTimeout(() => {
        alert("YOU WIN");
      }, 300);
    }
  }

  /* ROUND RESULT */
  if (
    state.roundResult &&
    !shownRoundPopup
  ){

    shownRoundPopup = true;

    alert(
      `Round Over!\n\nYou scored ${state.roundResult[myId]} points this round.`
    );

    memoryDone = false;
    revealed = [];
  }

  if (!state.roundResult){
    shownRoundPopup = false;
  }

  /* EFFECTS */
  if (state.effect){

    const isOpponent =
      state.effect.player !== myId;

    const effectText = {

      drawDeck:
        isOpponent
          ? "Opponent drew from deck"
          : "You drew from deck",

      takeDiscard:
        isOpponent
          ? "Opponent took discard"
          : "You took discard",

      discard:
        isOpponent
          ? "Opponent discarded a card"
          : "You discarded a card",

      swap:
        isOpponent
          ? "Opponent swapped a card"
          : "You swapped a card",

      tenSwap:
        isOpponent
          ? "Opponent used special 10 swap"
          : "You used special 10 swap",

      noSwap:
        isOpponent
          ? "Opponent cancelled special 10 swap"
          : "You cancelled special 10 swap",

      ghoulies:
        isOpponent
          ? "Opponent called GHOULIES"
          : "You called GHOULIES",

      snapSuccess:
        isOpponent
          ? "Opponent snapped successfully"
          : "Successful SNAP",

      snapFail:
        isOpponent
          ? "Opponent failed SNAP and misses next turn"
          : "Failed SNAP — you miss next turn",

      skip:
        isOpponent
          ? "Opponent misses a turn"
          : "You miss a turn"
    };

    document.getElementById("effect").innerText =
      effectText[state.effect.type] || "";

    clearTimeout(window.effectTimer);

    window.effectTimer = setTimeout(() => {

      document.getElementById("effect").innerText =
        "";

    }, 2500);
  }

  render();
});

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

  return (
    el.id === "deck" ||
    el.closest("#deck")
  );
}

function render(){

  if (!state || !myId) return;

  const p = me();
  const o = state.players?.[oppId()];

  const turn =
    state.order[state.turn] === myId;

  /* STATUS */
  let statusText = "";

  if (!memoryDone){

    statusText =
      `Choose 2 cards to memorise (${revealed.length}/2)`;

  } else if (
    state.tenSwap &&
    state.tenSwap.player === myId
  ){

    if (state.tenSwap.selectingOwn){

      statusText =
        "Choose YOUR card to swap or press NO SWAP";

    } else {

      statusText =
        "Choose OPPONENT card to swap";
    }

  } else {

    statusText =
      turn ? "Your turn" : "Opponent's turn";
  }

  /* CUSTOM MESSAGE */
  if (
    state.message &&
    state.message[myId]
  ){
    statusText =
      state.message[myId];
  }

  document.getElementById("status").innerText =
    statusText;

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

  /* NO SWAP BUTTON */
  document.getElementById("noSwapBtn").style.display =
    (
      state.tenSwap &&
      state.tenSwap.player === myId &&
      state.tenSwap.selectingOwn
    )
      ? "inline-block"
      : "none";
}

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

  /* NO SWAP */
  if (e.target.id === "noSwapBtn"){

    socket.emit("tenOwn", null);

    return;
  }

  /* TEN OWN */
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

  /* TEN OPP */
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

  /* RESET */
  if (e.target.id === "resetBtn"){

    socket.emit(
      "fullReset",
      "room1"
    );

    return;
  }

  /* GHOULIES */
  if (e.target.id === "ghouliesBtn"){

    socket.emit("callGhoulies");

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
  /* DISCARD */
  if (e.target.closest("#discard")){

    if (me()?.pending){

      socket.emit("discardPending");

    } else {

      socket.emit("takeDiscard");
    }

    return;
  }

  /* SWAP */
  if (
    e.target.dataset.card &&
    me()?.pending
  ){

    socket.emit(
      "swap",
      e.target.dataset.card
    );
  }
});

/* SNAP */
document.addEventListener("dblclick", e => {

  const c =
    e.target.dataset.card;

  if (c){

    socket.emit("snap", c);
  }
});