const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const SUITS = ["♠","♥","♦","♣"];
const VALUES = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

function shuffle(a){
  return a.sort(()=>Math.random()-0.5);
}

function createDeck(){
  let d=[];
  for(let s of SUITS){
    for(let v of VALUES){
      d.push(v+s);
    }
  }
  return shuffle(d);
}

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

    phase:"normal",

    ghoulies:false,

    /* IMPORTANT STATE */
    specialMode:null,   // 10 rule flow
    peekActive:false
  };
}

function has2(g){
  return Object.keys(g.players).length===2;
}

function nextTurn(g){
  g.turn=(g.turn+1)%g.order.length;
}

/* 👀 PEAK SYSTEM */
function startPeek(room,g){
  g.peekActive=true;

  Object.values(g.players).forEach(p=>{
    p.peek=[
      p.hand[Math.floor(Math.random()*p.hand.length)],
      p.hand[Math.floor(Math.random()*p.hand.length)]
    ];
  });

  io.to(room).emit("state",g);

  setTimeout(()=>{
    g.peekActive=false;
    Object.values(g.players).forEach(p=>p.peek=[]);
    io.to(room).emit("state",g);
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
        pending:null,
        peek:[]
      };

      g.order.push(socket.id);
      g.scores[socket.id]=0;
    }

    socket.join(id);
    socket.emit("you",socket.id);
    io.to(id).emit("state",g);

    if(has2(g)) startPeek(id,g);
  });

  const g=()=>rooms[currentRoom];
  const isTurn=()=>g().order[g().turn]===socket.id;

  /* DRAW */
  socket.on("draw",()=>{
    const game=g();
    if(!game||!has2(game)||game.phase!=="normal") return;

    game.players[socket.id].pending=game.deck.pop();
    io.to(currentRoom).emit("state",game);
  });

  /* DISCARD PICK */
  socket.on("takeDiscard",()=>{
    const game=g();
    const p=game.players[socket.id];

    if(!p.pending && game.discard.length){
      p.pending=game.discard.pop();
    }

    io.to(currentRoom).emit("state",game);
  });

  /* REJECT */
  socket.on("reject",()=>{
    const game=g();
    const p=game.players[socket.id];

    if(p.pending){
      game.discard.push(p.pending);
      p.pending=null;
    }

    io.to(currentRoom).emit("state",game);
  });

  /* SWAP + 10 RULE */
  socket.on("swap",(card)=>{
    const game=g();
    const p=game.players[socket.id];

    const i=p.hand.indexOf(card);
    if(i===-1) return;

    const old=p.hand[i];

    p.hand[i]=p.pending;
    game.discard.push(old);
    p.pending=null;

    /* 🔥 10 RULE ACTIVATION */
    if(old.startsWith("10")){
      game.specialMode={
        player:socket.id,
        step:1,
        card:old
      };
    } else {
      nextTurn(game);
    }

    io.to(currentRoom).emit("state",game);
  });

  /* 🔥 10 RULE STEP 1 */
  socket.on("tenOwn",(card)=>{
    const game=g();
    if(!game.specialMode) return;

    game.specialMode.selectedOwn=card;
    game.specialMode.step=2;

    io.to(currentRoom).emit("state",game);
  });

  /* 🔥 10 RULE STEP 2 */
  socket.on("tenOpp",(card)=>{
    const game=g();
    const p=game.players[socket.id];

    const opp=Object.values(game.players).find(x=>x.id!==socket.id);
    const i=opp.hand.indexOf(card);

    if(i===-1) return;

    const temp=opp.hand[i];

    opp.hand[i]=game.specialMode.selectedOwn;

    p.hand=p.hand.filter(c=>c!==game.specialMode.selectedOwn);
    p.hand.push(temp);

    game.specialMode=null;

    io.to(currentRoom).emit("state",game);
  });

  /* GHOULIES FIXED */
  socket.on("callGhoulies",()=>{
    const game=g();
    if(!game||game.ghoulies) return;

    game.ghoulies=true;
    game.phase="final";

    nextTurn(game);

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

server.listen(process.env.PORT||3000,()=>console.log("Server running"));