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
  return a.sort(() => Math.random() - 0.5);
}

function createDeck(){
  let d = [];
  for (let s of SUITS){
    for (let v of VALUES){
      d.push(v + s);
    }
  }
  return shuffle(d);
}

function calculate(hand){
  return hand.reduce((t,c) => {
    const v = c.slice(0,-1);
    if (v === "A") return t + 1;
    if (["J","Q","K"].includes(v)) return t + 10;
    return t + Number(v);
  },0);
}

function newGame(){
  const deck = createDeck();

  return {
    deck,
    discard:[deck.pop()],
    players:{},
    order:[],
    turn:0,
    scores:{},

    pendingMemory: {},   // NEW
    memoryPhase: true,   // NEW

    tenSwap:null,
    ghouliesCaller:null,
    finalTurn:false,

    gameOver:false
  };
}

const rooms = {};

function getRoom(socket){
  const room = [...socket.rooms].find(r => r !== socket.id);
  return rooms[room];
}

function roomId(socket){
  return [...socket.rooms].find(r => r !== socket.id);
}

io.on("connection", socket => {

  socket.on("join", room => {

    if (!rooms[room]){
      rooms[room] = newGame();
    }

    const g = rooms[room];

    socket.join(room);

    if (!g.players[socket.id] && Object.keys(g.players).length < 2){

      g.players[socket.id] = {
        hand: g.deck.splice(0,5),
        pending: null
      };

      g.order.push(socket.id);
      g.scores[socket.id] ||= 0;
    }

    socket.emit("you", socket.id);
    io.to(room).emit("state", g);
  });

  function isTurn(g,id){
    return g.order[g.turn] === id;
  }

  function nextTurn(g){
    g.turn = (g.turn + 1) % g.order.length;
  }

  function finishRound(g){

    for (let id of g.order){
      const p = g.players[id];
      g.scores[id] += calculate(p.hand);

      if (g.scores[id] >= 51){
        g.gameOver = true;
      }
    }

    if (!g.gameOver){

      const deck = createDeck();

      g.deck = deck;
      g.discard = [deck.pop()];

      for (let id of g.order){
        g.players[id] = {
          hand: deck.splice(0,5),
          pending: null
        };
      }

      g.turn = 0;
      g.tenSwap = null;
      g.ghouliesCaller = null;
      g.finalTurn = false;

      g.memoryPhase = true;
      g.pendingMemory = {};
    }
  }

  /* ✅ MEMORY COMPLETE */
  socket.on("memoryDone", () => {

    const g = getRoom(socket);
    if (!g) return;

    g.pendingMemory[socket.id] = true;

    const allDone =
      g.order.every(id => g.pendingMemory[id]);

    if (allDone){
      g.memoryPhase = false;
    }

    io.to(roomId(socket)).emit("state", g);
  });

  /* DRAW */
  socket.on("draw", () => {

    const g = getRoom(socket);
    if (!g || g.memoryPhase) return;
    if (!isTurn(g,socket.id)) return;

    const p = g.players[socket.id];
    if (p.pending) return;

    p.pending = g.deck.pop();
    io.to(roomId(socket)).emit("state", g);
  });

  /* DISCARD */
  socket.on("takeDiscard", () => {

    const g = getRoom(socket);
    if (!g || g.memoryPhase) return;
    if (!isTurn(g,socket.id)) return;

    const p = g.players[socket.id];
    if (p.pending) return;

    p.pending = g.discard.pop();
    io.to(roomId(socket)).emit("state", g);
  });

  socket.on("swap", card => {

    const g = getRoom(socket);
    if (!g || g.memoryPhase) return;
    if (!isTurn(g,socket.id)) return;

    const p = g.players[socket.id];
    if (!p.pending) return;

    const i = p.hand.indexOf(card);
    if (i === -1) return;

    const discarded = p.hand[i];

    p.hand[i] = p.pending;
    p.pending = null;

    g.discard.push(discarded);

    if (discarded.startsWith("10")){
      g.tenSwap = { player: socket.id };
    }

    nextTurn(g);
    io.to(roomId(socket)).emit("state", g);
  });

  socket.on("snap", card => {

    const g = getRoom(socket);
    if (!g) return;

    const p = g.players[socket.id];
    const top = g.discard.at(-1);

    if (!top) return;

    if (top.slice(0,-1) === card.slice(0,-1)){
      p.hand = p.hand.filter(c => c !== card);
      g.discard.push(card);
    }

    io.to(roomId(socket)).emit("state", g);
  });

  socket.on("callGhoulies", () => {

    const g = getRoom(socket);
    if (!g) return;

    if (g.ghouliesCaller) return;

    const caller = socket.id;
    const other = g.order.find(id => id !== caller);

    g.ghouliesCaller = caller;
    g.finalTurn = true;

    g.turn = g.order.indexOf(other);

    io.to(roomId(socket)).emit("state", g);
  });

});

server.listen(process.env.PORT || 3000);