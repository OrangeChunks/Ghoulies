const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const SUITS = ["♠", "♥", "♦", "♣"];
const VALUES = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

function shuffle(a){ return a.sort(() => Math.random() - 0.5); }

function createDeck(){
  let d = [];
  for (let s of SUITS){
    for (let v of VALUES){
      d.push(v + s);
    }
  }
  return shuffle(d);
}

function value(card){
  const v = card.slice(0,-1);
  const s = card.slice(-1);

  if (v === "A") return 1;
  if (v === "J" || v === "Q" || v === "K"){
    if (v === "K" && (s === "♥" || s === "♦")) return 0;
    return 10;
  }
  return parseInt(v);
}

const rooms = {};

function newGameState(){
  const deck = createDeck();

  return {
    deck,
    discard: [deck.pop()],
    players: {},
    order: [],
    turn: 0,

    scores: {},
    gameOver: false,
    loser: null,

    roundEnding: false,
    finalTurns: 0,
    specialMode: null,
    peekActive: false
  };
}

function deepClone(obj){
  return JSON.parse(JSON.stringify(obj));
}

function startPeek(room, g){
  g.peekActive = true;

  Object.values(g.players).forEach(p => {
    p.peek = [p.hand[0], p.hand[1]];
    p.revealed = true;
  });

  io.to(room).emit("state", deepClone(g));

  setTimeout(() => {
    g.peekActive = false;

    Object.values(g.players).forEach(p => {
      p.peek = [];
      p.revealed = false;
    });

    io.to(room).emit("state", deepClone(g));
  }, 3000);
}

/* 🔥 HARD RESET ROOM */
function resetRoom(roomId){
  const old = rooms[roomId];
  if (!old) return;

  const deck = createDeck();

  rooms[roomId] = {
    deck,
    discard: [deck.pop()],
    players: old.players,
    order: old.order,
    turn: 0,

    scores: {},
    gameOver: false,
    loser: null,

    roundEnding: false,
    finalTurns: 0,
    specialMode: null,
    peekActive: false
  };

  const g = rooms[roomId];

  for (const id in g.players){
    g.players[id].hand = g.deck.splice(0,4);
    g.players[id].pending = null;
    g.scores[id] = 0;
  }

  io.to(roomId).emit("state", deepClone(g));
}

io.on("connection", (socket) => {

  socket.on("join", (roomId) => {

    if (!rooms[roomId]) {
      rooms[roomId] = newGameState();
    }

    const g = rooms[roomId];
    socket.join(roomId);

    if (!g.players[socket.id] && Object.keys(g.players).length < 2){
      g.players[socket.id] = {
        hand: g.deck.splice(0,4),
        pending: null,
        peek: [],
        revealed: false
      };

      g.order.push(socket.id);
      g.scores[socket.id] = 0;
    }

    socket.emit("you", socket.id);

    // 🔥 ALWAYS SEND CLEAN SNAPSHOT
    socket.emit("state", deepClone(g));

    if (Object.keys(g.players).length === 2){
      startPeek(roomId, g);
    }
  });

  const getRoom = () => rooms[socket.rooms.values().next().value];

  function isTurn(g){
    return g.order[g.turn] === socket.id;
  }

  socket.on("draw", () => {
    const g = getRoom();
    if (!g || g.gameOver) return;
    if (!isTurn(g)) return;

    g.players[socket.id].pending = g.deck.pop();
    io.to([...socket.rooms][1]).emit("state", deepClone(g));
  });

  socket.on("takeDiscard", () => {
    const g = getRoom();
    if (!g) return;

    const p = g.players[socket.id];
    if (!p.pending && g.discard.length){
      p.pending = g.discard.pop();
    }

    io.to([...socket.rooms][1]).emit("state", deepClone(g));
  });

  socket.on("reject", () => {
    const g = getRoom();
    const p = g.players[socket.id];

    if (p.pending){
      g.discard.push(p.pending);
      p.pending = null;
    }

    io.to([...socket.rooms][1]).emit("state", deepClone(g));
  });

  socket.on("swap", (card) => {
    const g = getRoom();
    if (!g) return;

    const p = g.players[socket.id];
    const i = p.hand.indexOf(card);
    if (i === -1) return;

    const old = p.hand[i];
    p.hand[i] = p.pending;
    g.discard.push(old);
    p.pending = null;

    g.turn = (g.turn + 1) % g.order.length;

    io.to([...socket.rooms][1]).emit("state", deepClone(g));
  });

  socket.on("snap", (card) => {
    const g = getRoom();
    if (!g || g.gameOver) return;

    const p = g.players[socket.id];
    const top = g.discard.at(-1);

    if (card && top && card.slice(0,-1) === top.slice(0,-1)){
      p.hand = p.hand.filter(c => c !== card);
      g.discard.push(card);
    }

    io.to([...socket.rooms][1]).emit("state", deepClone(g));
  });

  socket.on("callGhoulies", () => {
    const g = getRoom();
    if (!g || g.roundEnding) return;

    g.roundEnding = true;
    g.finalTurns = 1;
    g.turn = (g.turn + 1) % g.order.length;

    io.to([...socket.rooms][1]).emit("state", deepClone(g));
  });

  socket.on("restartGame", (roomId) => {
    resetRoom(roomId);
  });

});

server.listen(3000, () => console.log("Server running"));