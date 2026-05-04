let socket = io();
let state=null;
let myId=null;

socket.emit("join","room1");

socket.on("you",(id)=>myId=id);
socket.on("state",(g)=>{state=g;render();});

function me(){return state.players[myId];}
function opp(){return Object.values(state.players).find(p=>p.id!==myId);}

function file(c){
  const v=c.slice(0,-1);
  const s=c.slice(-1);
  const suit={"♠":"s","♥":"h","♦":"d","♣":"c"};
  const map={A:"01",J:"11",Q:"12",K:"13"};
  return `/cards/${suit[s]}${map[v]||v.padStart(2,"0")}.png`;
}

function back(){return "/cards/back.png";}

function render(){
  if(!state||!myId) return;

  const p=me();
  const o=opp();

  const ready=Object.keys(state.players).length===2;
  const isTurn=state.order[state.turn]===myId;

  document.getElementById("status").innerText =
    !ready?"Waiting..."
    :state.phase==="final"?"Final round"
    :isTurn?"Your turn":"Their turn";

  document.getElementById("drawn").innerHTML =
    p.pending?`<img src="${file(p.pending)}" class="card">`:"";

  const top=state.discard.at(-1);
  document.getElementById("discard").innerHTML =
    top?`<img src="${file(top)}" class="card">`:"";

  document.getElementById("hand").innerHTML =
    p.hand.map(c=>`<img class="card" data-card="${c}" src="${back()}">`).join("");

  document.getElementById("opponentHand").innerHTML =
    o.hand.map(()=>`<img class="card" src="${back()}">`).join("");

  let html="<h3>Scores</h3>";
  for(const id in state.scores){
    html+=`<div>${id===myId?"You":"Opponent"}: ${state.scores[id]}</div>`;
  }
  document.getElementById("scores").innerHTML=html;

  document.getElementById("ghouliesBtn").disabled = state.ghoulies;
}

/* INPUT */
document.addEventListener("click",(e)=>{

  if(!state) return;

  const p=me();
  const isTurn=state.order[state.turn]===myId;

  if(e.target.id==="deck") socket.emit("draw");

  if(e.target.closest("#discard")){
    if(!p.pending){
      socket.emit("takeDiscard");
    } else {
      socket.emit("reject");
    }
  }

  if(e.target.dataset.card && p.pending && isTurn){
    socket.emit("swap",e.target.dataset.card);
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