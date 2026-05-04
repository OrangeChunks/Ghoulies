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
function val(c){
  const v=c.slice(0,-1);
  const s=c.slice(-1);

  if(v==="A") return 1;
  if(v==="J"||v==="Q"||v==="K"){
    if(v==="K"&&(s==="♥"||s==="♦")) return 0;
    return 10;
  }
  return parseInt(v);
}

function score(h){
  return h.reduce((a,c)=>a+val(c),0);
}

const rooms={};

function game(){
  const deck=createDeck();
  return {
    deck,
    discard:[deck.pop()],
    players:{},
    order:[],
    turn:0,
    scores:{},
    ghoulies:false,
    phase:"normal", // normal | final | showing
    peek:false
  };
}

function has2(g){return Object.keys(g.players).length===2;}

function next(g){
  g.turn=(g.turn+1)%g.order.length;
}

function resetPeek(g){
  g.peek=true;

  Object.values(g.players).forEach(p=>{
    p.peekCards=[
      p.hand[Math.floor(Math.random()*p.hand.length)],
      p.hand[Math.floor(Math.random()*p.hand.length)]
    ];
  });

  setTimeout(()=>{
    g.peek=false;
    Object.values(g.players).forEach(p=>p.peekCards=[]);
    io.to(room).emit("state",g);
  },3000);
}

let room=null;

io.on("connection",(socket)=>{

  socket.on("join",(id)=>{
    room=id;

    if(!rooms[id]) rooms[id]=game();
    const g=rooms[id];

    if(Object.keys(g.players).length<2){
      g.players[socket.id]={
        hand:g.deck.splice(0,4),
        pending:null,
        peekCards:[]
      };

      g.order.push(socket.id);
      g.scores[socket.id]=0;
    }

    socket.join(id);
    socket.emit("you",socket.id);
    io.to(id).emit("state",g);

    if(has2(g)) resetPeek(g);
  });

  const g=()=>rooms[room];
  const isTurn=()=>g().order[g().turn]===socket.id;

  /* DRAW */
  socket.on("draw",()=>{
    const game=g();
    if(!game||!has2(game)||game.phase!=="normal"||!isTurn()) return;

    game.players[socket.id].pending=game.deck.pop();
    io.to(room).emit("state",game);
  });

  /* TAKE DISCARD */
  socket.on("takeDiscard",()=>{
    const game=g();
    const p=game.players[socket.id];

    if(!p.pending && game.discard.length){
      p.pending=game.discard.pop();
    }

    io.to(room).emit("state",game);
  });

  /* REJECT (PUT BACK DISCARD) */
  socket.on("reject",()=>{
    const game=g();
    const p=game.players[socket.id];

    if(p.pending){
      game.discard.push(p.pending);
      p.pending=null;
    }

    io.to(room).emit("state",game);
  });

  /* SWAP */
  socket.on("swap",(card)=>{
    const game=g();
    const p=game.players[socket.id];

    const i=p.hand.indexOf(card);
    if(i===-1) return;

    const old=p.hand[i];

    p.hand[i]=p.pending;
    game.discard.push(old);
    p.pending=null;

    /* 10 RULE */
    if(old.startsWith("10")){
      game.swapMode={
        player:socket.id,
        step:1,
        card:old
      };
    }

    next(game);
    io.to(room).emit("state",game);
  });

  /* GHOULIES FIXED */
  socket.on("callGhoulies",()=>{
    const game=g();
    if(!game||!has2(game)) return;

    if(game.ghoulies) return;

    game.ghoulies=true;
    game.phase="final";

    next(game); // give OTHER player final turn

    io.to(room).emit("state",game);
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

    io.to(room).emit("state",game);
  });

});

server.listen(process.env.PORT||3000,()=>console.log("Server running"));