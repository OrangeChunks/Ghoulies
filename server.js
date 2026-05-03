const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

/* =========================
   CARD SETUP
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
   ROOMS (MULTIPLAYER CORE)
========================= */
const rooms = {};

/* =========================
   CREATE GAME STATE
========================= */
function createGame(){
  const deck = createDeck();

  return {
    deck,
    discard:[deck.pop()],
    players:{},
    phase:"choose",
    message:"",
    turn:0
  };
}

/* =========================
   SOCKET CONNECTION
========================= */
io.on("connection",(socket)=>{

  let roomId = null;

  /* JOIN ROOM */
  socket.on("join",(id)=>{

    roomId = id;

    if(!rooms[roomId]){
      rooms[roomId] = createGame();
    }

    const game = rooms[roomId];

    if(Object.keys(game.players).length < 2){
      game.players[socket.id] = {
        hand: game.deck.splice(0,4),
        pendingDraw:null
      };
    }

    socket.join(roomId);

    io.to(roomId).emit("state",game);
  });

  /* DRAW */
  socket.on("draw",()=>{

    const game = rooms[roomId];
    const p = game.players[socket.id];

    if(game.phase !== "choose") return;

    p.pendingDraw = game.deck.pop();
    game.phase = "resolve";

    game.message = "Card drawn";

    io.to(roomId).emit("state",game);
  });

  /* DISCARD */
  socket.on("discard",()=>{

    const game = rooms[roomId];
    const p = game.players[socket.id];

    game.discard.push(p.pendingDraw);
    p.pendingDraw = null;

    game.phase = "choose";
    game.message = "";

    io.to(roomId).emit("state",game);
  });

  /* SWAP */
  socket.on("swap",(card)=>{

    const game = rooms[roomId];
    const p = game.players[socket.id];

    const i = p.hand.indexOf(card);
    if(i === -1) return;

    const old = p.hand[i];

    p.hand[i] = p.pendingDraw;
    game.discard.push(old);

    p.pendingDraw = null;

    game.phase = "choose";

    io.to(roomId).emit("state",game);
  });

  /* SNAP */
  socket.on("snap",(card)=>{

    const game = rooms[roomId];
    const p = game.players[socket.id];
    const top = game.discard.at(-1);

    const v1 = card.slice(0,-1);
    const v2 = top.slice(0,-1);

    if(v1 === v2){
      p.hand = p.hand.filter(c => c !== card);
      game.discard.push(card);
      game.message = "SNAP SUCCESS!";
    } else {
      game.message = "Wrong SNAP!";
    }

    game.phase = "choose";

    io.to(roomId).emit("state",game);
  });

});

server.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});
