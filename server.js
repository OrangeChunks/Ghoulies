const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const SUITS=["♠","♥","♦","♣"];
const VALUES=["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

function shuffle(a){return a.sort(()=>Math.random()-0.5);}

function createDeck(){
  let d=[];
  for(let s of SUITS){
    for(let v of VALUES){
      d.push(v+s);
    }
  }
  return shuffle(d);
}

/* SCORE */
function cardValue(c){
  const v=c.slice(0,-1);
  const s=c.slice(-1);

  if(v==="A") return 1;
  if(v==="J"||v==="Q"||v==="K"){
    if(v==="K"&&(s==="♥"||s==="♦")) return 0;
    return 10;
  }
  return parseInt(v);
}

function handScore(h){
  return h.reduce((a,c)=>a+cardValue(c),0);
}

const rooms={};

function createGame(){
  const deck=createDeck();
  return {
    deck,
    discard:[deck.pop()],
    players:{},
    order:[],
    turn:0,
    scores:{},
    message:"",
    ghouliesCalled:false,
    finalRound:false,
    finalPlayer:null,
    showingScores:false,

    /* NEW */
    specialSwap:null,
    peek:false
  };
}

function has2(g){return Object.keys(g.players).length===2;}

function nextTurn(g){
  g.turn=(g.turn+1)%g.order.length;
}

function resetPeek(g){
  g.peek=true;

  Object.values(g.players).forEach(p=>{
    p.peekCards = [
      p.hand[Math.floor(Math.random()*p.hand.length)],
      p.hand[Math.floor(Math.random()*p.hand.length)]
    ];
  });

  setTimeout(()=>{
    g.peek=false;
    Object.values(g.players).forEach(p=>p.peekCards=[]);
    io.to(currentRoom).emit("state",g);
  },3000);
}

let currentRoom=null;

io.on("connection",(socket)=>{

  socket.on("join",(id)=>{
    currentRoom=id;

    if(!rooms[id]) rooms[id]=createGame();
    const g=rooms[id];

    if(Object.keys(g.players).length<2){
      g.players[socket.id]={
        hand:g.deck.splice(0,4),
        pendingDraw:null,
        peekCards:[],
        swapState:null
      };
      g.order.push(socket.id);
      g.scores[socket.id]=0;
    }

    socket.join(id);
    socket.emit("you",socket.id);
    io.to(id).emit("state",g);

    if(has2(g)) resetPeek(g);
  });

  const g=()=>rooms[currentRoom];
  const isTurn=()=>g().order[g().turn]===socket.id;

  /* DRAW */
  socket.on("draw",()=>{
    const game=g();
    if(!game||!has2(game)||!isTurn()) return;

    game.players[socket.id].pendingDraw=game.deck.pop();
    io.to(currentRoom).emit("state",game);
  });

  /* SWAP */
  socket.on("swap",(card)=>{
    const game=g();
    const p=game.players[socket.id];

    const i=p.hand.indexOf(card);
    if(i===-1) return;

    const old=p.hand[i];

    p.hand[i]=p.pendingDraw;
    game.discard.push(old);

    /* 10 RULE TRIGGER */
    if(old.startsWith("10")){
      game.specialSwap={
        player:socket.id,
        step:"chooseOwn"
      };
    }

    p.pendingDraw=null;
    nextTurn(game);

    io.to(currentRoom).emit("state",game);
  });

  /* SPECIAL SWAP OWN CARD */
  socket.on("specialOwn",(card)=>{
    const game=g();
    const p=game.players[socket.id];

    if(!game.specialSwap||game.specialSwap.player!==socket.id) return;

    game.specialSwap.step="chooseOpponent";
    game.specialSwap.card=card;

    io.to(currentRoom).emit("state",game);
  });

  /* SPECIAL SWAP OPPONENT CARD */
  socket.on("specialOpp",(card)=>{
    const game=g();

    if(!game.specialSwap) return;

    const opp=Object.values(game.players).find(x=>x.id!==socket.id);
    const p=game.players[socket.id];

    const i=opp.hand.indexOf(card);
    if(i===-1) return;

    const temp=opp.hand[i];
    opp.hand[i]=game.specialSwap.card;

    p.hand=p.hand.filter(c=>c!==game.specialSwap.card);
    p.hand.push(temp);

    game.specialSwap=null;

    io.to(currentRoom).emit("state",game);
  });

  /* GHOULIES FIXED */
  socket.on("callGhoulies",()=>{
    const game=g();
    if(!game||!has2(game)) return;

    if(game.ghouliesCalled) return;

    game.ghouliesCalled=true;
    game.finalRound=true;

    nextTurn(game);
    game.finalPlayer=game.order[game.turn];

    io.to(currentRoom).emit("state",game);
  });

  /* SNAP */
  socket.on("snap",(card)=>{
    const game=g();
    const p=game.players[socket.id];
    const top=game.discard.at(-1);

    if(card&&top&&card.slice(0,-1)===top.slice(0,-1)){
      p.hand=p.hand.filter(c=>c!==card);
      game.discard.push(card);
    }

    io.to(currentRoom).emit("state",game);
  });

});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log("Server running on",PORT));