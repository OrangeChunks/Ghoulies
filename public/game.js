let socket = io();
let state=null;
let myId=null;

socket.emit("join","room1");

socket.on("you",(id)=>myId=id);
socket.on("state",(g)=>{state=g;render();});

function me(){ return state.players[myId]; }

function opp(){
  return Object.entries(state.players)
    .find(([id])=>id!==myId)?.[1];
}

function file(c){
  const v=c.slice(0,-1);
  const s=c.slice(-1);
  const suit={"♠":"s","♥":"h","♦":"d","♣":"c"};
  const map={A:"01",J:"11",Q:"12",K:"13"};
  return `/cards/${suit[s]}${map[v]||v.padStart(2,"0")}.png`;
}

function back(){ return "/cards/back.png"; }

function render(){
  if(!state || !myId) return;

  const p = me();
  const o = opp();

  const isTurn = state.order[state.turn]===myId;

  document.getElementById("status").innerText =
    isTurn ? "Your turn" : "Their turn";

  const special = state.specialMode;
  const step = special?.step;

  /* 👀 PEEK / DRAW */
  if(state.peekActive && p.revealed){
    document.getElementById("drawn").innerHTML =
      p.peek.map(c=>`<img src="${file(c)}" class="card">`).join("");
  } else {
    document.getElementById("drawn").innerHTML =
      p.pending ? `<img src="${file(p.pending)}" class="card">` : "";
  }

  /* DISCARD */
  const top = state.discard.at(-1);
  document.getElementById("discard").innerHTML =
    top ? `<img src="${file(top)}" class="card">` : "";

  /* YOUR HAND */
  document.getElementById("hand").innerHTML =
    p.hand.map(c=>{
      let style="";
      if(special && step===1 && special.player===myId){
        style="border:3px solid red;";
      }
      return `<img class="card" data-card="${c}" src="${back()}" style="${style}">`;
    }).join("");

  /* OPPONENT HAND */
  document.getElementById("opponentHand").innerHTML =
    o ? o.hand.map(c=>{
      let style="";
      if(special && step===2){
        style="border:3px solid red;";
      }
      return `<img class="card" data-card="${c}" src="${back()}" style="${style}">`;
    }).join("") : "";

  /* 🧮 SCOREBOARD (FIX) */
  if(state.scores){
    const players = Object.keys(state.players);

    const scoreHTML = players.map(id=>{
      const label = id===myId ? "You" : "Opponent";
      const score = state.scores[id] || 0;
      return `<div><strong>${label}:</strong> ${score}</div>`;
    }).join("");

    document.getElementById("scores").innerHTML = scoreHTML;
  }
}

/* INPUT */
document.addEventListener("click",(e)=>{

  if(!state) return;

  const p = me();
  const isTurn = state.order[state.turn]===myId;

  /* 10 MODE */
  if(state.specialMode){

    if(state.specialMode.step===1 && e.target.dataset.card){
      socket.emit("tenOwn", e.target.dataset.card);
      return;
    }

    if(state.specialMode.step===2 && e.target.dataset.card){
      socket.emit("tenOpp", e.target.dataset.card);
      return;
    }
  }

  /* NORMAL */

  if(e.target.id==="deck"){
    if(isTurn) socket.emit("draw");
  }

  if(e.target.closest("#discard")){
    if(!p.pending) socket.emit("takeDiscard");
    else socket.emit("reject");
  }

  if(e.target.dataset.card && p.pending && isTurn){
    socket.emit("swap", e.target.dataset.card);
  }

  if(e.target.id==="ghouliesBtn"){
    socket.emit("callGhoulies");
  }
});

/* SNAP */
document.addEventListener("dblclick",(e)=>{
  const c=e.target.dataset.card;
  if(c) socket.emit("snap",c);
});