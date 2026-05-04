const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const SUITS = ["♠","♥","♦","♣"];
const VALUES = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

function shuffle(a){ return a.sort(()=>Math.random()-0.5); }

function createDeck(){
  let d=[];
  for(let s of SUITS){
    for(let v of VALUES){
      d.push(v+s);
    }
  }
  return shuffle(d);
}

function value(card){
  const v=card.slice(0,-1);
  const s=card.slice(-1);

  if(v==="A") return 1;
  if(v==="J"||v==="Q"||v==="K"){
    if(v==="K"&&(s==="♥"||s==="♦")) return 0;
    return 10;
  }
  return parseInt(v);
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
    gameOver:false,
    loser:null,

    roundEnding:false,
    finalTurns:0,

    specialMode:null,
    peekActive:false
  };
}

function has2(g){ return Object.keys(g.players).length===2; }
function nextTurn(g){ g.turn=(g.turn+1)%g.order.length; }

function startPeek(room,g){
  g.peekActive=true;

  Object.values(g.players).forEach(p=>{
    p.peek=[p.hand[0],p.hand[1]];
    p.revealed=true;
  });

  io.to(room).emit("state",g);

  setTimeout(()=>{
    g.peekActive=false;
    Object.values(g.players).forEach(p=>{
      p.peek=[];
      p.revealed=false;
    });
    io.to(room).emit("state",g);
  },3000);
}

function endRound(game,room){

  /* ADD SCORES */
  for(const id in game.players){
    game.scores[id]=(game.scores[id]||0)+
      game.players[id].hand.reduce((a,c)=>a+value(c),0);
  }

  /* CHECK LOSER */
  for(const id in game.scores){
    if(game.scores[id] >= 51){
      game.gameOver = true;
      game.loser = id;
    }
  }

  /* IF GAME OVER → STOP */
  if(game.gameOver){
    io.to(room).emit("state",game);
    return;
  }

  /* RESET ROUND */
  const deck=createDeck();

  game.deck=deck;
  game.discard=[deck.pop()];

  game.roundEnding=false;
  game.finalTurns=0;
  game.specialMode=null;

  for(const id in game.players){
    game.players[id].hand=deck.splice(0,4);
    game.players[id].pending=null;
  }

  game.turn=0;

  startPeek(room,game);

  io.to(room).emit("state",game);
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
        peek:[],
        revealed:false
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

  /* BLOCK INPUT IF GAME OVER */
  function blocked(game){
    return game.gameOver || !has2(game);
  }

  /* DRAW */
  socket.on("draw",()=>{
    const game=g();
    if(blocked(game)||!isTurn()||game.specialMode) return;

    game.players[socket.id].pending=game.deck.pop();
    io.to(currentRoom).emit("state",game);
  });

  /* DISCARD */
  socket.on("takeDiscard",()=>{
    const game=g();
    if(blocked(game)||game.specialMode) return;

    const p=game.players[socket.id];

    if(!p.pending && game.discard.length){
      p.pending=game.discard.pop();
    }

    io.to(currentRoom).emit("state",game);
  });

  socket.on("reject",()=>{
    const game=g();
    const p=game.players[socket.id];

    if(p.pending){
      game.discard.push(p.pending);
      p.pending=null;
    }

    io.to(currentRoom).emit("state",game);
  });

  /* SWAP */
  socket.on("swap",(card)=>{
    const game=g();
    if(blocked(game)||!isTurn()||game.specialMode) return;

    const p=game.players[socket.id];

    const i=p.hand.indexOf(card);
    if(i===-1) return;

    const old=p.hand[i];

    p.hand[i]=p.pending;
    game.discard.push(old);
    p.pending=null;

    /* 10 RULE */
    if(old.startsWith("10")){
      game.specialMode={
        player:socket.id,
        step:1,
        selectedOwn:null
      };
      io.to(currentRoom).emit("state",game);
      return;
    }

    if(game.roundEnding){
      game.finalTurns--;
      if(game.finalTurns<=0){
        endRound(game,currentRoom);
        return;
      }
    } else {
      nextTurn(game);
    }

    io.to(currentRoom).emit("state",game);
  });

  /* 10 STEP 1 */
  socket.on("tenOwn",(card)=>{
    const game=g();
    if(!game.specialMode || game.specialMode.player!==socket.id) return;

    game.specialMode.selectedOwn=card;
    game.specialMode.step=2;

    io.to(currentRoom).emit("state",game);
  });

  /* 10 STEP 2 */
  socket.on("tenOpp",(card)=>{
    const game=g();
    if(!game.specialMode) return;

    const p=game.players[game.specialMode.player];
    const opp=Object.values(game.players).find(x=>x!==p);

    const i=opp.hand.indexOf(card);
    if(i===-1) return;

    const temp=opp.hand[i];
    opp.hand[i]=game.specialMode.selectedOwn;

    const ownIndex=p.hand.indexOf(game.specialMode.selectedOwn);
    p.hand[ownIndex]=temp;

    game.specialMode=null;

    if(game.roundEnding){
      game.finalTurns--;
      if(game.finalTurns<=0){
        endRound(game,currentRoom);
        return;
      }
    } else {
      nextTurn(game);
    }

    io.to(currentRoom).emit("state",game);
  });

  /* GHOULIES */
  socket.on("callGhoulies",()=>{
    const game=g();
    if(blocked(game)||game.roundEnding) return;

    game.roundEnding=true;
    game.finalTurns=1;

    nextTurn(game);

    io.to(currentRoom).emit("state",game);
  });

  /* SNAP */
  socket.on("snap",(card)=>{
    const game=g();
    if(game.gameOver) return;

    const p=game.players[socket.id];
    const top=game.discard.at(-1);

    if(card && top && card.slice(0,-1)===top.slice(0,-1)){
      p.hand=p.hand.filter(c=>c!==card);
      game.discard.push(card);
    }

    io.to(currentRoom).emit("state",game);
  });

});

server.listen(process.env.PORT||3000,()=>console.log("Server running"));