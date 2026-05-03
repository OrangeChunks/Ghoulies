const socket = io();

let room = "room1";

socket.emit("join",room);

let state;

function file(card){
  const v = card.slice(0,-1);
  const s = card.slice(-1);

  const suit = {"♠":"s","♥":"h","♦":"d","♣":"c"};
  const map = {"A":"01","J":"11","Q":"12","K":"13"};

  const val = map[v] || v.padStart(2,"0");

  return `/cards/${suit[s]}${val}.png`;
}

/* =========================
   RECEIVE STATE
========================= */
socket.on("state",(g)=>{
  state = g;
  render();
});

/* =========================
   RENDER
========================= */
function render(){

  const me = Object.values(state.players)[0];

  const top = state.discard.at(-1);

  document.getElementById("discard").innerHTML =
    `<img src="${file(top)}" class="card">`;

  document.getElementById("hand").innerHTML =
    me.hand.map(c=>
      `<img src="${file(c)}" class="card" data-card="${c}">`
    ).join("");

  document.getElementById("status").innerText = state.message || state.phase;

  document.getElementById("actions").innerHTML =
    state.phase === "choose"
      ? `<button id="snapBtn">SNAP</button>`
      : `<button id="discardBtn">Discard</button>`;
}

/* =========================
   EVENTS
========================= */
document.addEventListener("click",(e)=>{

  if(e.target.id==="deck"){
    socket.emit("draw");
  }

  if(e.target.id==="discardBtn"){
    socket.emit("discard");
  }

  if(e.target.id==="snapBtn"){
    socket.emit("snapMode");
  }

  if(e.target.dataset.card){

    if(state.phase==="snap"){
      socket.emit("snap",e.target.dataset.card);
    }

    if(state.phase==="resolve"){
      socket.emit("swap",e.target.dataset.card);
    }
  }
});