let socket = io();

let state = null;
let myId = null;

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

function file(card){
  const v = card.slice(0,-1);
  const s = card.slice(-1);

  const suitMap = {"♠":"s","♥":"h","♦":"d","♣":"c"};
  const valueMap = {
    "A":"01","2":"02","3":"03","4":"04","5":"05",
    "6":"06","7":"07","8":"08","9":"09","10":"10",
    "J":"11","Q":"12","K":"13"
  };

  return `/cards/${suitMap[s]}${valueMap[v]}.png`;
}

function back(){
  return "/cards/back.png";
}

/* MEMORY CLICK */
document.addEventListener("click", e => {

  if (!state) return;

  if (state.memoryPhase){

    if (e.target.dataset.index !== undefined){

      const i = Number(e.target.dataset.index);

      if (!revealed.includes(i)){
        revealed.push(i);
        render();

        if (revealed.length === 2){
          setTimeout(() => {
            socket.emit("memoryDone");
            memoryDone = true;
            revealed = [];
          }, 3000);
        }
      }
    }
    return;
  }

  /* DRAW */
  if (e.target.id === "deck"){
    socket.emit("draw");
    return;
  }

  /* DISCARD */
  if (e.target.closest("#discard")){
    socket.emit("takeDiscard");
    return;
  }

  /* SWAP */
  if (e.target.dataset.card && me()?.pending){
    socket.emit("swap", e.target.dataset.card);
    return;
  }

  if (e.target.id === "ghouliesBtn"){
    socket.emit("callGhoulies");
  }

});

function render(){

  if (!state || !myId) return;

  const p = me();

  document.getElementById("status").innerText =
    state.memoryPhase
      ? "Memorise 2 cards"
      : "Play!";

  document.getElementById("hand").innerHTML =
    p?.hand.map((c,i)=>`
      <img class="card"
        data-card="${c}"
        data-index="${i}"
        src="${state.memoryPhase ? file(c) : back()}"
      >
    `).join("");

}