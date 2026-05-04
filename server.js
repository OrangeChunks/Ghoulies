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
    if(v === "K" && (s === "♥" || s === "♦")) return 0;
    return 10;
  }

  return parseInt(v);
}

function handScore(hand){
  return hand.reduce((a,c)=>a+cardValue(c),0);
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
    scores:{},
    message:"Waiting for opponent...",
    finalRound:false,
    finalPlayer:null
  };
}

/* =========================
   HELPERS
========================= */
function hasTwoPlayers(game){
  return Object.keys(game.players).length === 2;
}

function nextTurn(game){
  game.turn = (game.turn + 1) % game.order.length;
}

/* RESET ROUND */
function resetRound(game){
  const deck = createDeck();

  game.deck = deck;
  game.discard = [deck.pop()];
  game.finalRound = false;
  game.finalPlayer = null;

  Object.values(game.players).forEach(p=>{
    p.hand = deck.splice(0,4);
    p.pendingDraw = null;
  });
}

/* =========================
   SOCKET
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

    if(hasTwoPlayers(game)){
      game.message = "Game started!";
    }

    socket.emit("you", socket.id);
    io.to(roomId).emit("state",game);
  });

  function isMyTurn(game, socket){
    return game.order[game.turn] === socket.id;
  }

  /* DRAW */
  socket.on("draw",()=>{
    const game = rooms[roomId];
    if(!game || !hasTwoPlayers(game)) return;
    if(!isMyTurn(game, socket)) return;

    const p = game.players[socket.id];
    p.pendingDraw = game.deck.pop();

    io.to(roomId).emit("state",game);
  });

  /* TAKE DISCARD */
  socket.on("takeDiscard",(card)=>{
    const game = rooms[roomId];
    if(!hasTwoPlayers(game)) return;
    if(!isMyTurn(game, socket)) return;

    const p = game.players[socket.id];
    const top = game.discard.at(-1);

    if(card !== top) return;

    game.discard.pop();
    p.pendingDraw = top;

    io.to(roomId).emit("state",game);
  });

  /* REJECT */
  socket.on("rejectDraw",()=>{
    const game = rooms[roomId];
    if(!hasTwoPlayers(game)) return;
    if(!isMyTurn(game, socket)) return;

    const p = game.players[socket.id];

    game.discard.push(p.pendingDraw);
    p.pendingDraw = null;

    /* 🔥 FINAL ROUND CHECK */
    if(game.finalRound && socket.id === game.finalPlayer){
      endRound(game);
      return;
    }

    nextTurn(game);
    io.to(roomId).emit("state",game);
  });

  /* SWAP */
  socket.on("swap",(card)=>{
    const game = rooms[roomId];
    if(!hasTwoPlayers(game)) return;
    if(!isMyTurn(game, socket)) return;

    const p = game.players[socket.id];
    const i = p.hand.indexOf(card);
    if(i === -1) return;

    const old = p.hand[i];

    p.hand[i] = p.pendingDraw;
    game.discard.push(old);
    p.pendingDraw = null;

    /* 🔥 FINAL ROUND CHECK */
    if(game.finalRound && socket.id === game.finalPlayer){
      endRound(game);
      return;
    }

    nextTurn(game);
    io.to(roomId).emit("state",game);
  });

  function endRound(game){

    /* CALCULATE SCORES */
    Object.values(game.players).forEach(p=>{
      game.scores[p.id] = (game.scores[p.id] || 0) + handScore(p.hand);
    });

    game.message = "Round over! Scores updated.";

    resetRound(game);

    io.to(roomId).emit("state",game);
  }

  /* SNAP */
  socket.on("snap",(card)=>{
    const game = rooms[roomId];
    if(!game) return;

    const p = game.players[socket.id];
    const top = game.discard.at(-1);

    if(!card || !top) return;

    if(card.slice(0,-1) === top.slice(0,-1)){
      p.hand = p.hand.filter(c=>c!==card);
      game.discard.push(card);
    }

    io.to(roomId).emit("state",game);
  });

  /* GHOULIES */
  socket.on("callGhoulies",()=>{
    const game = rooms[roomId];
    if(!game || !hasTwoPlayers(game)) return;

    game.finalRound = true;

    /* NEXT PLAYER IS FINAL PLAYER */
    nextTurn(game);
    game.finalPlayer = game.order[game.turn];

    game.message = "👻 Final turn for opponent!";

    io.to(roomId).emit("state",game);
  });

});

server.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});