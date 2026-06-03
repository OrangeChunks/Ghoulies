// server.js

const express  = require("express");
const http     = require("http");
const { Server } = require("socket.io");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use(express.static("public"));

// ─── deck helpers ──────────────────────────────────────────────────────────

const SUITS  = ["♠","♥","♦","♣"];
const VALUES = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

function shuffle(a){
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createDeck(){
  const d = [];
  for (const s of SUITS)
    for (const v of VALUES)
      d.push(v + s);
  return shuffle(d);
}

function calculate(hand){
  return hand.reduce((t, c) => {
    const v = c.slice(0, -1);
    const s = c.slice(-1);
    // Red Kings (♥ ♦) = 0 pts
    if (v === "K" && (s === "♥" || s === "♦")) return t;
    if (v === "A") return t + 1;
    if (["J","Q","K"].includes(v)) return t + 10;
    return t + Number(v);
  }, 0);
}

// ─── room code generator ───────────────────────────────────────────────────

function makeCode(){
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++)
    code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ─── game factory ──────────────────────────────────────────────────────────

function newGame(){
  const deck = createDeck();
  return {
    deck,
    discard:        [deck.pop()],
    players:        {},
    order:          [],
    turn:           0,
    startingPlayer: 0,
    scores:         {},
    tenSwap:        null,
    ghouliesCaller: null,
    finalTurnPlayer:null,
    gameOver:       false,
    losers:         [],
    message:        {},
    roundResult:    null,
    skipTurn:       {},
    effect:         null,
    waiting:        true   // true until both seats are filled
  };
}

// ─── room registry ─────────────────────────────────────────────────────────

const rooms = {};   // code → game state

function getRoom(socket){
  const code = [...socket.rooms].find(r => r !== socket.id);
  return rooms[code];
}

function roomId(socket){
  return [...socket.rooms].find(r => r !== socket.id);
}

function roomIdFromGame(targetGame){
  return Object.keys(rooms).find(r => rooms[r] === targetGame);
}

// ─── connection ────────────────────────────────────────────────────────────

io.on("connection", socket => {

  // ── CREATE ROOM ──────────────────────────────────────────────────────────
  socket.on("createRoom", () => {

    // Generate a unique 4-char code
    let code;
    do { code = makeCode(); } while (rooms[code]);

    rooms[code] = newGame();
    const g     = rooms[code];

    socket.join(code);

    g.players[socket.id] = { hand: g.deck.splice(0, 4), pending: null };
    g.order.push(socket.id);
    g.scores[socket.id] = 0;

    socket.emit("you",       socket.id);
    socket.emit("roomCode",  code);
    socket.emit("state",     g);       // shows "waiting for opponent" lobby
  });

  // ── JOIN ROOM ────────────────────────────────────────────────────────────
  socket.on("joinRoom", code => {

    const upper = code.toUpperCase().trim();
    const g     = rooms[upper];

    if (!g){
      socket.emit("joinError", "Room not found. Check the code and try again.");
      return;
    }

    if (Object.keys(g.players).length >= 2){
      socket.emit("joinError", "That room is already full.");
      return;
    }

    socket.join(upper);

    g.players[socket.id] = { hand: g.deck.splice(0, 4), pending: null };
    g.order.push(socket.id);
    g.scores[socket.id] = 0;
    g.waiting = false;      // both players now in

    socket.emit("you",      socket.id);
    socket.emit("roomCode", upper);

    io.to(upper).emit("state", g);   // both players get the fresh game state
  });

  // ─── in-game helpers ─────────────────────────────────────────────────────

  function isTurn(g, id){
    return g.order[g.turn] === id;
  }

  function nextTurn(g){
    do {
      g.turn = (g.turn + 1) % g.order.length;
      const id = g.order[g.turn];
      if (g.skipTurn[id]){
        delete g.skipTurn[id];
        g.effect = { type:"skip", player:id };
      } else {
        break;
      }
    } while (true);
  }

  function finishRound(g){

    const roundScores = {};

    for (const id of g.order){

      const p     = g.players[id];
      let   score = calculate(p.hand);

      if (g.ghouliesCaller === id){
        const other      = g.order.find(x => x !== id);
        const myScore    = calculate(g.players[id].hand);
        const otherScore = calculate(g.players[other].hand);

        if (myScore < otherScore){
          score -= 5;
          roundScores[id] = { score, label:"-5 Ghoulies Bonus" };
        } else {
          score += 5;
          roundScores[id] = { score, label:"+5 Ghoulies Penalty" };
        }
      } else {
        roundScores[id] = { score, label:null };
      }

      g.scores[id] += score;
    }

    g.roundResult = roundScores;

    io.to(roomIdFromGame(g)).emit("state", g);

    // Check for game-over (≥51 pts)
    const overPlayers = Object.entries(g.scores).filter(([,s]) => s >= 51);

    if (overPlayers.length){
      const highest = Math.max(...overPlayers.map(x => x[1]));
      g.losers  = overPlayers.filter(x => x[1] === highest).map(x => x[0]);
      g.gameOver = true;

      // Re-emit with gameOver flag so clients show the end screen
      io.to(roomIdFromGame(g)).emit("state", g);
      return;
    }

    // Start next round after 6 s (client uses the first 5 s to reveal cards)
    setTimeout(() => {
      const deck = createDeck();
      g.deck    = deck;
      g.discard = [deck.pop()];

      for (const id of g.order){
        g.players[id] = { hand: deck.splice(0, 4), pending: null };
      }

      g.startingPlayer  = (g.startingPlayer + 1) % g.order.length;
      g.turn            = g.startingPlayer;
      g.tenSwap         = null;
      g.ghouliesCaller  = null;
      g.finalTurnPlayer = null;
      g.message         = {};
      g.roundResult     = null;
      g.effect          = null;

      io.to(roomIdFromGame(g)).emit("state", g);
    }, 6000);
  }

  function endTurn(g, id){
    if (g.finalTurnPlayer && id === g.finalTurnPlayer){
      finishRound(g);
    } else {
      nextTurn(g);
    }
  }

  // ─── game events ──────────────────────────────────────────────────────────

  socket.on("draw", () => {
    const g = getRoom(socket);
    if (!g || g.waiting) return;
    if (!isTurn(g, socket.id)) return;
    const p = g.players[socket.id];
    if (p.pending) return;
    if (g.deck.length <= 0){ finishRound(g); return; }
    p.pending = g.deck.pop();
    g.effect  = { type:"drawDeck", player:socket.id };
    io.to(roomId(socket)).emit("state", g);
  });

  socket.on("takeDiscard", () => {
    const g = getRoom(socket);
    if (!g || g.waiting) return;
    if (!isTurn(g, socket.id)) return;
    const p = g.players[socket.id];
    if (p.pending || !g.discard.length) return;
    p.pending = g.discard.pop();
    g.effect  = { type:"takeDiscard", player:socket.id };
    io.to(roomId(socket)).emit("state", g);
  });

  socket.on("discardPending", () => {
    const g = getRoom(socket);
    if (!g || g.waiting) return;
    if (!isTurn(g, socket.id)) return;
    const p = g.players[socket.id];
    if (!p.pending) return;
    g.discard.push(p.pending);
    p.pending = null;
    g.effect  = { type:"discard", player:socket.id };
    endTurn(g, socket.id);
    io.to(roomId(socket)).emit("state", g);
  });

  socket.on("swap", card => {
    const g = getRoom(socket);
    if (!g || g.waiting) return;
    const p = g.players[socket.id];
    if (!p.pending) return;
    const i = p.hand.indexOf(card);
    if (i === -1) return;
    const discarded = p.hand[i];
    p.hand[i] = p.pending;
    p.pending  = null;
    g.discard.push(discarded);
    g.effect   = { type:"swap", player:socket.id, handIndex:i };

    if (discarded.startsWith("10")){
      const other = g.order.find(id => id !== socket.id);
      g.message   = {};
      g.message[socket.id] = "You used a SPECIAL 10.";
      g.message[other]     = "Opponent used a SPECIAL 10.";
      g.tenSwap = { player:socket.id, selectingOwn:true, ownIndex:null };
      io.to(roomId(socket)).emit("state", g);
      return;
    }

    endTurn(g, socket.id);
    io.to(roomId(socket)).emit("state", g);
  });

  socket.on("tenOwn", index => {
    const g = getRoom(socket);
    if (!g || !g.tenSwap) return;
    if (index == null){
      g.effect  = { type:"noSwap", player:socket.id };
      g.message = {};
      g.tenSwap = null;
      endTurn(g, socket.id);
      io.to(roomId(socket)).emit("state", g);
      return;
    }
    g.tenSwap.ownIndex     = index;
    g.tenSwap.selectingOwn = false;
    io.to(roomId(socket)).emit("state", g);
  });

  socket.on("tenOpp", oppIndex => {
    const g = getRoom(socket);
    if (!g || !g.tenSwap) return;
    const playerId = g.tenSwap.player;
    const oId      = g.order.find(id => id !== playerId);
    const p1       = g.players[playerId];
    const p2       = g.players[oId];
    const i1       = g.tenSwap.ownIndex;
    const temp     = p1.hand[i1];
    p1.hand[i1]    = p2.hand[oppIndex];
    p2.hand[oppIndex] = temp;
    g.effect  = { type:"tenSwap", player:playerId, ownIndex:i1, oppIndex };
    g.message = {};
    g.tenSwap = null;
    endTurn(g, playerId);
    io.to(roomId(socket)).emit("state", g);
  });

  socket.on("snap", card => {
    const g = getRoom(socket);
    if (!g || g.waiting) return;
    const p   = g.players[socket.id];
    const top = g.discard.at(-1);
    if (!top) return;
    if (top.slice(0,-1) === card.slice(0,-1)){
      const index = p.hand.indexOf(card);
      if (index !== -1){
        p.hand.splice(index, 1);
        if (p.hand.length === 0){ finishRound(g); return; }
      }
      g.discard.push(card);
      g.effect = { type:"snapSuccess", player:socket.id };
    } else {
      g.skipTurn[socket.id] = true;
      g.effect = { type:"snapFail", player:socket.id };
    }
    io.to(roomId(socket)).emit("state", g);
  });

  socket.on("callGhoulies", () => {
    const g = getRoom(socket);
    if (!g || g.waiting || g.ghouliesCaller) return;
    const caller = socket.id;
    const other  = g.order.find(id => id !== caller);
    g.message    = {};
    g.message[caller] = "You called GHOULIES.";
    g.message[other]  = "Opponent called GHOULIES.";
    g.effect = { type:"ghoulies", player:caller };
    g.ghouliesCaller  = caller;
    g.finalTurnPlayer = other;
    g.turn = g.order.indexOf(other);
    io.to(roomId(socket)).emit("state", g);
  });

  socket.on("restart", code => {
    const oldGame = rooms[code];
    if (!oldGame) return;
    const newState = newGame();
    newState.waiting = false;
    for (const id of oldGame.order){
      newState.players[id] = { hand: newState.deck.splice(0,4), pending:null };
      newState.order.push(id);
      newState.scores[id] = 0;
    }
    rooms[code] = newState;
    io.to(code).emit("state", newState);
  });

  socket.on("fullReset", code => {
    delete rooms[code];
    io.to(code).emit("forceReload");
  });

  socket.on("disconnect", () => {
    const code = roomId(socket);
    if (!code) return;
    const g = rooms[code];
    if (!g) return;

    delete g.players[socket.id];
    g.order = g.order.filter(id => id !== socket.id);

    if (g.order.length === 0){
      delete rooms[code];
      return;
    }

    // One player left — reset to a waiting state so they're not stuck
    const remainingId  = g.order[0];
    const freshGame    = newGame();
    freshGame.waiting  = true;
    freshGame.players[remainingId] = { hand: freshGame.deck.splice(0,4), pending:null };
    freshGame.order    = [remainingId];
    freshGame.scores[remainingId] = g.scores[remainingId] ?? 0;
    rooms[code] = freshGame;

    io.to(code).emit("state", freshGame);
    io.to(code).emit("opponentLeft");
  });

});

server.listen(
  process.env.PORT || 3000,
  () => console.log("Server running on port", process.env.PORT || 3000)
);