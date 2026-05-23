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

  /* WIN/LOSE */
  if (state.gameOver){

    if (state.losers.includes(myId)){

      setTimeout(() => {
        alert("YOU LOSE");
      }, 500);

    } else {

      setTimeout(() => {
        alert("YOU WIN");
      }, 500);
    }
  }

  /* ROUND */
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
  if (
    state.effect &&
    state.effect.player !== myId
  ){

    const effects = {
      drawDeck:"Opponent drew from deck",
      takeDiscard:"Opponent took discard",
      discard:"Opponent discarded a card",
      swap:"Opponent swapped a card",
      tenSwap:"Opponent used special 10 swap",
      noSwap:"Opponent cancelled special 10 swap",
      ghoulies:"Opponent called GHOULIES",
      snapSuccess:"Opponent snapped successfully",
      snapFail:"Opponent failed a snap and misses next turn",
      skip:"Opponent loses a turn"
    };

    document.getElementById("effect").innerText =
      effects[state.effect.type] || "";

    setTimeout(() => {

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

function render(){

  if (!state || !myId) return;

  const p = me();
  const o = state.players?.[oppId()];

  document.getElementById("scores").innerHTML =
    `You: ${state.scores?.[myId] || 0}
     | Opponent: ${state.scores?.[oppId()] || 0}`;

  document.getElementById("hand").innerHTML =
    p?.hand?.map((c,i) => {

      const visible =
        revealed.includes(i);

      return `
        <img
          class="card"
          data-card="${c}"
          data-index="${i}"
          src="${visible ? file(c) : back()}"
        >
      `;
    }).join("") || "";

  document.getElementById("opponentHand").innerHTML =
    o?.hand?.map((c,i) => {

      return `
        <img
          class="card"
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

  if (e.target.id === "resetBtn"){

    socket.emit(
      "fullReset",
      "room1"
    );

    return;
  }

  if (e.target.id === "ghouliesBtn"){

    socket.emit("callGhoulies");

    return;
  }

  if (e.target.closest("#deck")){

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
  }
});

document.addEventListener("dblclick", e => {

  const c =
    e.target.dataset.card;

  if (c){

    socket.emit("snap", c);
  }
});