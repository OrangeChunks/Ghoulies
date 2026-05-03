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
   GAME STATE
========================= */
const rooms = {};

function createGame(){
  const deck = createDeck();

  return {
    deck,
    discard:[deck.pop()],
    players:{},
    phase:"choose",
    message:""
  };
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
        hand: game.deck.splice(0,4),
        pendingDraw: null
      };
    }

    socket.join(roomId);
    io.to(roomId).emit("state",game);
  });

  /* =========================
     DRAW FROM DECK
========================= */
  socket.on("draw",()=>{

    const game = rooms[roomId];
    const p = game.players[socket.id];

    if(!game || game.phase !== "choose") return;

    const drawn = game.deck.pop();

    p.pendingDraw = drawn;
    game.phase = "resolve";

    game.message = `You drew: ${drawn}`;

    io.to(roomId).emit("state",game);
  });

  /* =========================
     TAKE DISCARD (FIXED + SAFE)
========================= */
  socket.on("takeDiscard",(clientCard)=>{

    const game = rooms[roomId];
    const p = game.players[socket.id];

    if(!game || game.phase !== "choose") return;
    if(game.discard.length === 0) return;

    const topCard = game.discard.at(-1);

    // 🔒 HARD VALIDATION (prevents mismatch)
    if (clientCard !== topCard) return;

    game.discard.pop();

    p.pendingDraw = topCard;
    game.phase = "resolve";

    game.message = `You took: ${topCard}`;

    io.to(roomId).emit("state",game);
  });

  /* =========================
     SWAP
========================= */
  socket.on("swap",(card)=>{

    const game = rooms[roomId];
    const p = game.players[socket.id];

    if(!p?.pendingDraw) return;

    const i = p.hand.indexOf(card);
    if(i === -1) return;

    const old = p.hand[i];

    p.hand[i] = p.pendingDraw;
    game.discard.push(old);

    p.pendingDraw = null;
    game.phase = "choose";

    io.to(roomId).emit("state",game);
  });

});

server.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});