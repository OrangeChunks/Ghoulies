const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

/* =========================
   DECK
========================= */
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

/* =========================
   SCORING
========================= */
function cardValue(card){
  const v = card.slice(0,-1);
  const s = card.slice(-1);

  if(v === "A") return 1;

  if(v === "J" || v === "Q" || v === "K"){
    if(v === "K" && (s === "♥" || s === "♦")){
      return 0; // red kings
    }
    return 10;
  }

  return parseInt(v);
}

function handScore(hand){
  return hand.reduce((sum,c)=>sum+cardValue(c),0);
}

/* =========================
   GAME STATE
========================= */
const rooms = {};

function createGame(){
  const deck = createDeck();

  return {
    deck,
    discard:[deck.pop()],
    players:{},
    order:[],
    turn:0,
    ghouliesCalled:false,
    gameOver:false,
    message:""
  };
}

/* =========================
   SOCKET LOGIC
========================= */
io.on("connection",(socket)=>{

  let roomId = null;

  socket.on("join",(id)=>{

    roomId = id;

    if(!rooms[roomId]){
      rooms[roomId] = createGame();
    }

    const game = rooms[roomId];

    if(Object.keys(game.players).length < 2){

      game.players[socket.id] = {
        id: socket.id,
        hand: game.deck.splice(0,4),
        pendingDraw: null
      };

      game.order.push(socket.id);
    }

    socket.join(roomId);

    socket.emit("you", socket.id);
    io.to(roomId).emit("state",game);
  });

  function isMyTurn(game, socket){
    return game.order[game.turn] === socket.id;
  }

  function nextTurn(game){
    game.turn = (game.turn + 1) % game.order.length;

    if(game.ghouliesCalled){
      endGame(game);
    }
  }

  function endGame(game){
    game.gameOver = true;

    const scores = Object.values(game.players).map(p => ({
      id: p.id,
      score: handScore(p.hand)
    }));

    const worst = scores.sort((a,b)=>b.score-a.score)[0];

    game.message = `GAME OVER - Highest score loses`;
  }

  /* DRAW */
  socket.on("draw",()=>{

    const game = rooms[roomId];
    if(!game || game.gameOver) return;
    if(!isMyTurn(game, socket)) return;

    const p = game.players[socket.id];

    p.pendingDraw = game.deck.pop();

    game.message = "Card drawn";

    io.to(roomId).emit("state",game);
  });

  /* TAKE DISCARD */
  socket.on("takeDiscard",(card)=>{

    const game = rooms[roomId];
    if(!game || game.gameOver) return;
    if(!isMyTurn(game, socket)) return;

    const p = game.players[socket.id];

    const top = game.discard.at(-1);
    if(card !== top) return;

    game.discard.pop();
    p.pendingDraw = top;

    game.message = `Picked up ${top}`;

    io.to(roomId).emit("state",game);
  });

  /* SWAP */
  socket.on("swap",(card)=>{

    const game = rooms[roomId];
    if(!game || game.gameOver) return;
    if(!isMyTurn(game, socket)) return;

    const p = game.players[socket.id];

    const i = p.hand.indexOf(card);
    if(i === -1) return;

    const old = p.hand[i];

    p.hand[i] = p.pendingDraw;
    game.discard.push(old);

    p.pendingDraw = null;

    nextTurn(game);

    io.to(roomId).emit("state",game);
  });

  /* SNAP */
  socket.on("snap",(card)=>{

    const game = rooms[roomId];
    if(!game || game.gameOver) return;
    if(!isMyTurn(game, socket)) return;

    const p = game.players[socket.id];
    const top = game.discard.at(-1);

    if(!card || !top) return;

    const v1 = card.slice(0,-1);
    const v2 = top.slice(0,-1);

    if(v1 === v2){
      p.hand = p.hand.filter(c => c !== card);
      game.discard.push(card);
      game.message = "SNAP!";
    } else {
      game.message = "Wrong SNAP!";
    }

    nextTurn(game);

    io.to(roomId).emit("state",game);
  });

  /* GHOULIES */
  socket.on("callGhoulies",()=>{

    const game = rooms[roomId];
    if(!game || game.gameOver) return;

    game.ghouliesCalled = true;
    game.message = "👻 GHOULIES CALLED";

    io.to(roomId).emit("state",game);
  });

});

server.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});