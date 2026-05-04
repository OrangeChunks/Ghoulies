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

function deepClone(obj){
  return JSON.parse(JSON.stringify(obj));
}

function newGame(){
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

    specialMode: null,
    roundEnding: false,
    finalTurns: 0
  };
}

const rooms = {};

/* 🔥 SAFE ROOM GETTER (FIXES 502 CRASHES) */
function getRoom(socket){
  const roomId = [...socket.rooms].find(r => r !== socket.id);
  if (!roomId) return null;
  return rooms[roomId];
}

function getRoomId(socket){
  return [...socket.rooms].find(r => r !== socket.id);
}

function endGame(roomId, g){
  let loser = null;
  let max = -1;

  for (let id in g.scores){
    if (g.scores[id] > max){
      max = g.scores[id];
      loser = id;
    }
  }

  g.gameOver = true;
  g.loser = loser;

  io.to(roomId).emit("state", deepClone(g));
}

io.on("connection", (socket) => {

  socket.on("join", (roomId) => {

    if (!rooms[roomId]){
      rooms[roomId] = newGame();
    }

    const g = rooms[roomId];
    socket.join(roomId);

    if (!g.players[socket.id] && Object.keys(g.players).length < 2){
      g.players[socket.id] = {
        hand: g.deck.splice(0,4),
        pending: null
      };

      g.order.push(socket.id);
      g.scores[socket.id] = 0;
    }

    socket.emit("you", socket.id);
    socket.emit("state", deepClone(g));

    if (Object.keys(g.players).length === 2){
      io.to(roomId).emit("state", deepClone(g));
    }
  });

  const isTurn = (g) => g.order[g.turn] === socket.id;

  socket.on("draw", () => {
    const g = getRoom(socket);
    if (!g || g.gameOver) return;
    if (!isTurn(g)) return;

    const p = g.players[socket.id];
    p.pending = g.deck.pop();

    io.to(getRoomId(socket)).emit("state", deepClone(g));
  });

  socket.on("takeDiscard", () => {
    const g = getRoom(socket);
    if (!g) return;

    const p = g.players[socket.id];
    if (!p.pending && g.discard.length){
      p.pending = g.discard.pop();
    }

    io.to(getRoomId(socket)).emit("state", deepClone(g));
  });

  socket.on("reject", () => {
    const g = getRoom(socket);
    if (!g) return;

    const p = g.players[socket.id];
    if (p.pending){
      g.discard.push(p.pending);
      p.pending = null;
    }

    io.to(getRoomId(socket)).emit("state", deepClone(g));
  });

  socket.on("swap", (card) => {
    const g = getRoom(socket);
    if (!g) return;

    const p = g.players[socket.id];
    const i = p.hand.indexOf(card);
    if (i === -1) return;

    const old = p.hand[i];
    p.hand[i] = p.pending;
    g.discard.push(old);
    p.pending = null;

    g.turn = (g.turn + 1) % g.order.length;

    io.to(getRoomId(socket)).emit("state", deepClone(g));
  });

  socket.on("snap", (card) => {
    const g = getRoom(socket);
    if (!g || g.gameOver) return;

    const p = g.players[socket.id];
    const top = g.discard.at(-1);

    if (top && card.slice(0,-1) === top.slice(0,-1)){
      p.hand = p.hand.filter(c => c !== card);
      g.discard.push(card);
    }

    io.to(getRoomId(socket)).emit("state", deepClone(g));
  });

  socket.on("callGhoulies", () => {
    const g = getRoom(socket);
    if (!g || g.roundEnding) return;

    g.roundEnding = true;
    g.finalTurns = 1;

    g.turn = (g.turn + 1) % g.order.length;

    io.to(getRoomId(socket)).emit("state", deepClone(g));
  });

  socket.on("restartGame", (roomId) => {
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

      specialMode: null,
      roundEnding: false,
      finalTurns: 0
    };

    const g = rooms[roomId];

    for (let id in g.players){
      g.players[id].hand = g.deck.splice(0,4);
      g.players[id].pending = null;
      g.scores[id] = 0;
    }

    io.to(roomId).emit("state", deepClone(g));
  });

});

server.listen(3000, () => console.log("Server running"));