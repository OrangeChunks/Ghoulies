let socket = io();

let state = null;
let myId = null;

/* memory peek system */
let revealed = [];

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

/* MAIN RENDER */
function render(){

  if (!state || !myId) return;

  const p = me();
  const o = state.players?.[oppId()];

  const turn = state.order[state.turn] === myId;

  document.getElementById("status").innerText =
    turn ? "Your turn" : "Their turn";

  document.getElementById("scores").innerHTML =
    `You: ${state.scores?.[myId] || 0}
     | Opponent: ${state.scores?.[oppId()] || 0}`;

  /* YOUR HAND */
  document.getElementById("hand").innerHTML =
    p?.hand?.map((c,i) => {

      const visible = revealed.includes(i);

      return `
        <img
          class="card"
          data-card="${c}"
          data-index="${i}"
          src="${visible ? file(c) : back()}"
        >
      `;
    }).join("") || "";

  /* OPPONENT HAND */
  document.getElementById("opponentHand").innerHTML =
    o?.hand?.map(() =>
      `<img class="card" src="${back()}">`
    ).join("") || "";

  /* DISCARD */
  const top = state.discard?.at(-1);

  document.getElementById("discard").innerHTML =
    top
      ? `<img class="card" src="${file(top)}">`
      : "";

  /* PENDING CARD */
  const pending = p?.pending;

  document.getElementById("pending").innerHTML =
    pending
      ? `
        <div style="margin-top:10px">
          You picked up:<br>
          <img class="card" src="${file(pending)}" style="width:80px">
        </div>
      `
      : "";

  document.getElementById("restartBtn").style.display =
    state.gameOver ? "block" : "none";
}

/* CLICK EVENTS */
document.addEventListener("click", e => {

  if (!state) return;

  /* START ROUND MEMORY PEEK */
  if (
    e.target.dataset.index !== undefined &&
    revealed.length < 2
  ) {
    const i = Number(e.target.dataset.index);

    if (!revealed.includes(i)){
      revealed.push(i);
      render();

      /* after selecting 2 cards */
      if (revealed.length === 2){

        setTimeout(() => {
          revealed = [];
          render();
        }, 5000);
      }
    }

    return;
  }

  /* DRAW */
  if (e.target.id === "deck"){
    socket.emit("draw");
  }

  /* TAKE DISCARD */
  if (e.target.closest("#discard")){
    socket.emit("takeDiscard");
  }

  /* SWAP */
  if (e.target.dataset.card && me()?.pending){
    socket.emit("swap", e.target.dataset.card);
  }

  /* GHOULIES */
  if (e.target.id === "ghouliesBtn"){
    socket.emit("callGhoulies");
  }

  /* RESTART */
  if (e.target.id === "restartBtn"){
    socket.emit("restart", "room1");
  }
});

/* SNAP */
document.addEventListener("dblclick", e => {

  const c = e.target.dataset.card;

  if (c){
    socket.emit("snap", c);
  }
});