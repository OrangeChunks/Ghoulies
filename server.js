const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

/* =========================
   CARD DATA
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
    message:"Waiting...",
    finalRound:false,
    finalPlayer:null,
    showingScores:false,
    ghouliesCalled:false
  };
}

function hasTwoPlayers(g){
  return Object.keys(g.players).length === 2;
}

function nextTurn(g){
  g.turn = (g.turn + 1) % g.order.length;
}

function resetRound(g){
  const deck = createDeck();

  g.deck = deck;
  g.discard = [deck.pop()];
  g.finalRound = false;
  g.finalPlayer = null;
  g.showingScores = false;
  g.ghouliesCalled = false;

  Object.values(g.players).forEach(p=>{
    p.hand = deck.splice(0,4);
    p.pendingDraw = null;
  });
}

/* =========================
   SOCKET IO
========================= */
io.on("connection",(socket)=>{

  let roomId = null;

  socket.on("join",(id)=>{
    roomId = id;

    if(!rooms[id]) rooms[id] = createGame();
    const g = rooms[id];

    if(Object.keys(g.players).length < 2){
      g.players[socket.id] = {
        id: socket.id,
        hand: g.deck.splice(0,4),
        pendingDraw: null
      };
      g.order.push(socket.id);
      g.scores[socket.id] = 0;
    }

    socket.join(id);
    socket.emit("you", socket.id);
    io.to(id).emit("state", g);
  });

  const game = () => rooms[roomId];
  const isTurn = () => game()?.order[game().turn] === socket.id;

  /* DRAW */
  socket.on("draw",()=>{
    const g = game();
    if(!g || !hasTwoPlayers(g) || !isTurn() || g.showingScores) return;

    g.players[socket.id].pendingDraw = g.deck.pop();
    io.to(roomId).emit("state", g);
  });

  /* TAKE DISCARD */
  socket.on("takeDiscard",(card)=>{
    const g = game();
    if(!hasTwoPlayers(g) || !isTurn() || g.showingScores) return;

    const top = g.discard.at(-1);
    if(card !== top) return;

    g.discard.pop();
    g.players[socket.id].pendingDraw = top;

    io.to(roomId).emit("state", g);
  });

  /* REJECT */
  socket.on("rejectDraw",()=>{
    const g = game();
    if(!hasTwoPlayers(g) || !isTurn() || g.showingScores) return;

    const p = g.players[socket.id];
    g.discard.push(p.pendingDraw);
    p.pendingDraw = null;

    nextTurn(g);
    io.to(roomId).emit("state", g);
  });

  /* SWAP */
  socket.on("swap",(card)=>{
    const g = game();
    if(!hasTwoPlayers(g) || !isTurn() || g.showingScores) return;

    const p = g.players[socket.id];
    const i = p.hand.indexOf(card);
    if(i === -1) return;

    const old = p.hand[i];

    p.hand[i] = p.pendingDraw;
    g.discard.push(old);
    p.pendingDraw = null;

    nextTurn(g);
    io.to(roomId).emit("state", g);
  });

  /* END ROUND */
  function endRound(g){
    g.showingScores = true;

    Object.values(g.players).forEach(p=>{
      g.scores[p.id] += handScore(p.hand);
    });

    io.to(roomId).emit("state", g);

    setTimeout(()=>{
      resetRound(g);
      io.to(roomId).emit("state", g);
    },3000);
  }

  /* SNAP */
  socket.on("snap",(card)=>{
    const g = game();
    if(!g) return;

    const p = g.players[socket.id];
    const top = g.discard.at(-1);

    if(card && top && card.slice(0,-1) === top.slice(0,-1)){
      p.hand = p.hand.filter(c => c !== card);
      g.discard.push(card);
    }

    io.to(roomId).emit("state", g);
  });

  /* GHOULIES (LOCKED) */
  socket.on("callGhoulies",()=>{
    const g = game();
    if(!g || !hasTwoPlayers(g)) return;

    if(g.ghouliesCalled) return; // 🔒 STOP SPAM

    g.ghouliesCalled = true;
    g.finalRound = true;

    nextTurn(g);
    g.finalPlayer = g.order[g.turn];

    io.to(roomId).emit("state", g);
  });

});

/* =========================
   🚨 FIX FOR RAILWAY 502
========================= */
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});