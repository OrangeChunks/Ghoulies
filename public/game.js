// game.js

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

function connectToRoom(){
  socket.emit("join", "room1");
}

connectToRoom();

socket.on("connect", connectToRoom);

socket.on("you", id => {
  myId = id;
});

function me(){
  return state?.players?.[myId];
}

function oppId(){
  return state?.order?.find(id => id !== myId);
}

function areaForPlayer(playerId){
  if (playerId === myId){
    return {
      hand: document.getElementById("hand"),
      pending: document.getElementById("pending")
    };
  }

  return {
    hand: document.getElementById("opponentHand"),
    pending: document.getElementById("opponentPending")
  };
}

function centerOf(el){
  const r = el.getBoundingClientRect();
  return { x:r.left + r.width/2, y:r.top + r.height/2 };
}

function animateCard(fromEl,toEl,image){
  if (!fromEl || !toEl || !image) return;

  const fx = document.getElementById("fxLayer");

  const start = centerOf(fromEl);
  const end = centerOf(toEl);

  const img = document.createElement("img");
  img.src = image;
  img.className = "flyingCard";

  img.style.left = start.x + "px";
  img.style.top = start.y + "px";

  fx.appendChild(img);

  requestAnimationFrame(()=>{
    img.style.left = end.x + "px";
    img.style.top = end.y + "px";
    img.style.transform = "rotate(12deg)";
  });

  setTimeout(()=>img.remove(),600);
}

function showText(text,color="#fff"){
  const fx = document.getElementById("fxLayer");

  const div = document.createElement("div");
  div.className = "effectText";
  div.style.color = color;
  div.innerText = text;

  fx.appendChild(div);

  setTimeout(()=>div.remove(),1000);
}

/* 🔥 improved highlight */
function highlightCard(el, color="#00ff88"){
  if (!el) return;

  el.style.outline = `5px solid ${color}`;
  el.style.boxShadow = `0 0 20px ${color}`;
  el.style.transform = "scale(1.2) translateY(-10px)";
  el.style.zIndex = "10";

  setTimeout(()=>{
    el.style.outline = "";
    el.style.boxShadow = "";
    el.style.transform = "";
    el.style.zIndex = "";
  },900);
}

socket.on("state", g => {

  if (g.effect){

    const actor = areaForPlayer(g.effect.player);

    switch(g.effect.type){

      case "drawDeck":
        showText("DRAW","#00d0ff");
        animateCard(
          document.getElementById("deck"),
          actor.pending,
          "/cards/back.png"
        );
        break;

      case "takeDiscard":
        showText("TAKE","#00ff88");
        animateCard(
          document.getElementById("discard"),
          actor.pending,
          document.querySelector("#discard img")?.src
        );
        break;

      case "discard":
        showText("DISCARD","#ff4444");
        animateCard(
          actor.pending,
          document.getElementById("discard"),
          "/cards/back.png"
        );
        break;

      /* 🔥 CLEAN SWAP */
      case "swap":

        showText("SWAP","#ffd000");

        const handSelector =
          g.effect.player === myId
            ? `#hand img[data-index="${g.effect.handIndex}"]`
            : `#opponentHand img[data-oppindex="${g.effect.handIndex}"]`;

        const handEl = document.querySelector(handSelector);

        highlightCard(handEl,"#ffd000");

        setTimeout(()=>{

          animateCard(actor.pending, handEl, "/cards/back.png");

          handEl.classList.add("swapping");

          setTimeout(()=>{
            animateCard(
              handEl,
              document.getElementById("discard"),
              "/cards/back.png"
            );
            handEl.classList.remove("swapping");
          },150);

        },200);

        break;

      case "snapSuccess":
        showText("SNAP!","#00ff88");
        break;

      case "snapFail":
        showText("MISS!","#ff0000");
        break;

      /* 🔥 CLEAN TEN SWAP */
      case "tenSwap":

        showText("SPECIAL 10","gold");

        const mine = g.effect.player === myId;

        const ownSelector =
          mine
            ? `#hand img[data-index="${g.effect.ownIndex}"]`
            : `#opponentHand img[data-oppindex="${g.effect.ownIndex}"]`;

        const oppSelector =
          mine
            ? `#opponentHand img[data-oppindex="${g.effect.oppIndex}"]`
            : `#hand img[data-index="${g.effect.oppIndex}"]`;

        const ownEl = document.querySelector(ownSelector);
        const oppEl = document.querySelector(oppSelector);

        highlightCard(ownEl,"#00ffcc");
        highlightCard(oppEl,"#ff00ff");

        ownEl.classList.add("swapping");
        oppEl.classList.add("swapping");

        setTimeout(()=>{
          animateCard(ownEl, oppEl, "/cards/back.png");
          animateCard(oppEl, ownEl, "/cards/back.png");

          setTimeout(()=>{
            ownEl.classList.remove("swapping");
            oppEl.classList.remove("swapping");
          },300);

        },250);

        break;

      case "ghoulies":
        showText("GHOULIES!","#ff0000");
        break;
    }
  }

  state = g;
  render();
});