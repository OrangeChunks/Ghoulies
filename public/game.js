// game.js

let socket = io({
  reconnection:        true,
  reconnectionAttempts:99999,
  reconnectionDelay:   1000
});

let state      = null;
let myId       = null;
let roomCode   = null;
let revealed   = [];
let memoryDone = false;
let shownRoundPopup = false;
let revealAll  = false;

// ─── screen management ────────────────────────────────────────────────────

function showScreen(id){
  ["lobbyScreen","gameScreen"].forEach(s => {
    document.getElementById(s).style.display =
      s === id ? "flex" : "none";
  });
}

// ─── socket basics ────────────────────────────────────────────────────────

socket.on("connect", () => {
  // If we were already in a room (reconnect), rejoin
  if (roomCode){
    socket.emit("joinRoom", roomCode);
  }
});

socket.on("you", id => { myId = id; });

socket.on("roomCode", code => {
  roomCode = code;
  document.getElementById("roomCodeDisplay").innerText = code;
});

socket.on("joinError", msg => {
  document.getElementById("joinErrorMsg").innerText = msg;
  document.getElementById("joinErrorMsg").style.display = "block";
});

socket.on("opponentLeft", () => {
  showToast("Opponent disconnected — waiting for someone to join…");
});

socket.on("forceReload", () => location.reload());

// ─── lobby button handlers ────────────────────────────────────────────────

document.getElementById("createRoomBtn").addEventListener("click", () => {
  socket.emit("createRoom");
  showScreen("gameScreen");
});

document.getElementById("joinRoomBtn").addEventListener("click", () => {
  const code = document.getElementById("joinCodeInput").value.trim().toUpperCase();
  if (!code){ return; }
  document.getElementById("joinErrorMsg").style.display = "none";
  socket.emit("joinRoom", code);
});

// If joinRoom succeeds the server will emit "you" + "roomCode" + "state"
// We switch to game screen when state arrives and we are in the player list
socket.on("state", g => {

  // Switch to game screen if we're a recognised player
  if (myId && g.players[myId]){
    showScreen("gameScreen");
  }

  state = g;
  render();

  // ── effects ──────────────────────────────────────────────────────────────
  if (g.effect){

    const actor = areaForPlayer(g.effect.player);

    switch(g.effect.type){

      case "drawDeck": {
        showText("DRAW", "#00d0ff");
        animateCard(
          document.getElementById("deck"),
          actor.pending,
          "/cards/back.png"
        );
        break;
      }

      case "takeDiscard": {
        showText("TAKE", "#00ff88");
        animateCard(
          document.getElementById("discard"),
          actor.pending,
          document.querySelector("#discard img")?.src
        );
        break;
      }

      case "discard": {
        showText("DISCARD", "#ff4444");
        animateCard(
          actor.pending,
          document.getElementById("discard"),
          "/cards/back.png"
        );
        break;
      }

      case "swap": {
        showText("SWAP", "#ffd000");
        const isMe = g.effect.player === myId;
        const handSelector = isMe
          ? `#hand img[data-index="${g.effect.handIndex}"]`
          : `#opponentHand img[data-oppindex="${g.effect.handIndex}"]`;
        const handEl = document.querySelector(handSelector);

        highlightCard(handEl, "#ffd000");
        if (handEl){
          handEl.classList.add("swapping");
          setTimeout(() => handEl.classList.remove("swapping"), 450);
        }

        const source = isMe
          ? actor.pending
          : document.getElementById("opponentPendingCard");

        setTimeout(() => {
          animateCard(source, handEl, "/cards/back.png");
          setTimeout(() => animateCard(handEl, document.getElementById("discard"), "/cards/back.png"), 200);
        }, 180);

        setTimeout(() => pulseCard(handSelector), 320);
        break;
      }

      case "ghoulies": {
        showText("GHOULIES!", "#ff4444");
        document.body.classList.add("ghouliesFlash");
        setTimeout(() => document.body.classList.remove("ghouliesFlash"), 600);
        if (g.finalTurnPlayer === myId) showLastTurnWarning();
        break;
      }

      case "skip": {
        showText("TURN SKIPPED", "#ff8800");
        break;
      }

      case "snapSuccess": {
        showText("SNAP!", "#00ff88");
        document.body.classList.add("snapFlash");
        setTimeout(() => document.body.classList.remove("snapFlash"), 250);
        break;
      }

      case "snapFail": {
        showText("MISS!", "#ff0000");
        break;
      }

      case "tenSwap": {
        showText("SPECIAL 10", "gold");
        const mine = g.effect.player === myId;
        const ownSelector = mine
          ? `#hand img[data-index="${g.effect.ownIndex}"]`
          : `#opponentHand img[data-oppindex="${g.effect.ownIndex}"]`;
        const oppSelector = mine
          ? `#opponentHand img[data-oppindex="${g.effect.oppIndex}"]`
          : `#hand img[data-index="${g.effect.oppIndex}"]`;
        const ownEl = document.querySelector(ownSelector);
        const oppEl = document.querySelector(oppSelector);

        highlightCard(ownEl, "#00ffcc");
        highlightCard(oppEl, "#ff00ff");

        if (ownEl){ ownEl.classList.add("swapping"); setTimeout(() => ownEl.classList.remove("swapping"), 450); }
        if (oppEl){ oppEl.classList.add("swapping"); setTimeout(() => oppEl.classList.remove("swapping"), 450); }

        setTimeout(() => {
          animateCard(ownEl, oppEl, "/cards/back.png");
          animateCard(oppEl, ownEl, "/cards/back.png");
        }, 200);
        break;
      }
    }
  }

  // ── game-over overlay ─────────────────────────────────────────────────
  if (g.gameOver){
    const isLoser  = g.losers.includes(myId);
    showGameOver(isLoser, g.scores[myId] ?? 0, g.scores[oppId()] ?? 0);
    return;
  } else {
    hideGameOver();
  }

  // ── end-of-round card reveal then score alert ─────────────────────────
  if (state.roundResult && !shownRoundPopup){
    shownRoundPopup = true;
    revealAll = true;
    render();

    setTimeout(() => {
      revealAll = false;

      const result       = state.roundResult[myId];
      const scoreDisplay = result.label
        ? `${result.score} (${result.label})`
        : `${result.score}`;
      const totalScore   = state.scores[myId] ?? 0;

      alert(
`ROUND OVER

You scored:
${scoreDisplay}

TOTAL SCORE:
${totalScore}`
      );

      memoryDone = false;
      revealed   = [];
    }, 5000);
  }

  if (!state.roundResult) shownRoundPopup = false;
});

// ─── game-over overlay helpers ────────────────────────────────────────────

function showGameOver(isLoser, myScore, oppScore){
  const overlay = document.getElementById("gameOverOverlay");
  const title   = document.getElementById("gameOverTitle");
  const detail  = document.getElementById("gameOverDetail");

  if (isLoser){
    title.innerText       = "💀 YOU LOSE!";
    title.style.color     = "#ff3333";
    overlay.style.background = "rgba(80,0,0,0.92)";
  } else {
    title.innerText       = "🎉 YOU WIN!";
    title.style.color     = "#00ff88";
    overlay.style.background = "rgba(0,60,20,0.92)";
  }

  detail.innerHTML =
    `Final scores:<br>
     You: <strong>${myScore}</strong> pts &nbsp;|&nbsp;
     Opponent: <strong>${oppScore}</strong> pts`;

  overlay.style.display = "flex";
}

function hideGameOver(){
  document.getElementById("gameOverOverlay").style.display = "none";
}

document.getElementById("playAgainBtn").addEventListener("click", () => {
  hideGameOver();
  socket.emit("restart", roomCode);
});

document.getElementById("mainMenuBtn").addEventListener("click", () => {
  hideGameOver();
  socket.emit("fullReset", roomCode);
});

// ─── toast notification ───────────────────────────────────────────────────

function showToast(msg){
  const t = document.getElementById("toast");
  t.innerText       = msg;
  t.style.opacity   = "1";
  t.style.transform = "translateY(0)";
  setTimeout(() => {
    t.style.opacity   = "0";
    t.style.transform = "translateY(20px)";
  }, 3500);
}

// ─── instructions modal ───────────────────────────────────────────────────

document.getElementById("howToPlayBtn").addEventListener("click", () => {
  document.getElementById("instructionsModal").style.display = "flex";
});

document.getElementById("closeInstructionsBtn").addEventListener("click", () => {
  document.getElementById("instructionsModal").style.display = "none";
});

document.getElementById("instructionsModal").addEventListener("click", e => {
  if (e.target === document.getElementById("instructionsModal"))
    document.getElementById("instructionsModal").style.display = "none";
});

// ─── animation helpers ────────────────────────────────────────────────────

function me(){
  return state?.players?.[myId];
}

function oppId(){
  return state?.order?.find(id => id !== myId);
}

function areaForPlayer(playerId){
  if (playerId === myId){
    return { hand: document.getElementById("hand"), pending: document.getElementById("pending") };
  }
  return { hand: document.getElementById("opponentHand"), pending: document.getElementById("opponentPending") };
}

function centerOf(el){
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function animateCard(fromEl, toEl, image){
  if (!fromEl || !toEl || !image) return;
  const fx    = document.getElementById("fxLayer");
  const start = centerOf(fromEl);
  const end   = centerOf(toEl);
  const img   = document.createElement("img");
  img.src       = image;
  img.className = "flyingCard";
  img.style.cssText = `
    position:absolute; left:0; top:0; width:80px;
    will-change:transform,opacity;
    transform: translate(${start.x}px,${start.y}px) translate(-50%,-50%);
  `;
  fx.appendChild(img);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      img.style.transition = "transform 0.55s cubic-bezier(0.22,0.61,0.36,1), opacity 0.55s ease";
      img.style.transform  = `translate(${end.x}px,${end.y}px) translate(-50%,-50%) rotate(12deg)`;
    });
  });
  setTimeout(() => img.remove(), 650);
}

function showText(text, color = "#fff"){
  const fx  = document.getElementById("fxLayer");
  const div = document.createElement("div");
  div.className   = "effectText";
  div.style.color = color;
  div.innerText   = text;
  fx.appendChild(div);
  setTimeout(() => div.remove(), 1100);
}

function pulseCard(selector){
  const el = document.querySelector(selector);
  if (!el) return;
  el.style.transition = "box-shadow 0.2s, transform 0.2s";
  el.style.boxShadow  = "0 0 30px #00ff88";
  el.style.transform  = "scale(1.15)";
  setTimeout(() => { el.style.boxShadow = ""; el.style.transform = ""; }, 700);
}

function highlightCard(el, color = "#00ff88"){
  if (!el) return;
  el.style.transition = "outline 0.15s, box-shadow 0.15s, transform 0.15s";
  el.style.outline    = `5px solid ${color}`;
  el.style.boxShadow  = `0 0 22px ${color}`;
  el.style.transform  = "scale(1.2) translateY(-10px)";
  el.style.zIndex     = "10";
  setTimeout(() => {
    el.style.outline = ""; el.style.boxShadow = "";
    el.style.transform = ""; el.style.zIndex = "";
  }, 950);
}

function showLastTurnWarning(){
  const hand = document.getElementById("hand");
  hand.classList.add("lastTurnPulse");
  setTimeout(() => hand.classList.remove("lastTurnPulse"), 3000);
  const fx     = document.getElementById("fxLayer");
  const banner = document.createElement("div");
  banner.className = "lastTurnBanner";
  banner.innerText = "⚠️ LAST TURN!";
  fx.appendChild(banner);
  setTimeout(() => banner.remove(), 3200);
}

function file(card){
  const v = card.slice(0,-1);
  const s = card.slice(-1);
  const suitMap  = { "♠":"s","♥":"h","♦":"d","♣":"c" };
  const valueMap = { "A":"01","2":"02","3":"03","4":"04","5":"05","6":"06",
                     "7":"07","8":"08","9":"09","10":"10","J":"11","Q":"12","K":"13" };
  return `/cards/${suitMap[s]}${valueMap[v]}.png`;
}

function back(){ return "/cards/back.png"; }

function clickedDeck(el){
  return el.id === "deck" || el.closest("#deck");
}

// ─── render ───────────────────────────────────────────────────────────────

function render(){
  if (!state || !myId) return;

  // Waiting lobby state
  if (state.waiting){
    document.getElementById("status").innerText = `Room Code: ${roomCode} — Waiting for opponent…`;
    document.getElementById("hand").innerHTML = "";
    document.getElementById("opponentHand").innerHTML = "";
    document.getElementById("discard").innerHTML = "";
    document.getElementById("pending").innerHTML = "";
    document.getElementById("scores").innerHTML = "";
    document.getElementById("noSwapBtn").style.display  = "none";
    document.getElementById("restartBtn").style.display = "none";
    return;
  }

  const p    = me();
  const o    = state.players?.[oppId()];
  const turn = state.order[state.turn] === myId;

  document.getElementById("hand").classList.toggle("activeTurn", turn);

  // Status
  let statusText = "";
  if (!memoryDone){
    statusText = `Memorise 2 cards (${revealed.length}/2)`;
  } else if (state.tenSwap && state.tenSwap.player === myId){
    statusText = state.tenSwap.selectingOwn ? "Choose YOUR card" : "Choose OPPONENT card";
  } else {
    statusText = turn ? "YOUR TURN" : "OPPONENT TURN";
  }
  if (state.message && state.message[myId]) statusText = state.message[myId];
  document.getElementById("status").innerText = statusText;

  // Scores
  document.getElementById("scores").innerHTML =
    `You: ${state.scores?.[myId] ?? 0} | Opponent: ${state.scores?.[oppId()] ?? 0}`;

  // My hand
  document.getElementById("hand").innerHTML =
    p?.hand?.map((c,i) => {
      const visible = revealAll || revealed.includes(i);
      const tenGlow = state.tenSwap && state.tenSwap.player === myId && state.tenSwap.selectingOwn;
      return `<img class="card ${tenGlow?"tenGlow":""}" data-card="${c}" data-index="${i}" src="${visible?file(c):back()}">`;
    }).join("") || "";

  // Opponent hand
  document.getElementById("opponentHand").innerHTML =
    o?.hand?.map((c,i) => {
      const tenGlow = state.tenSwap && state.tenSwap.player === myId && !state.tenSwap.selectingOwn;
      return `<img class="card ${tenGlow?"tenGlow":""}" data-oppindex="${i}" src="${revealAll?file(c):back()}">`;
    }).join("") || "";

  // Discard
  const top = state.discard?.at(-1);
  document.getElementById("discard").innerHTML =
    top ? `<img class="card pop" src="${file(top)}">` : "";

  // Pending
  const pending = p?.pending;
  document.getElementById("pending").innerHTML =
    pending && turn
      ? `<div><div style="margin-bottom:8px">Picked Up</div><img class="card flip bigCard" src="${file(pending)}"></div>`
      : "";

  // Opponent pending
  const opc = document.getElementById("opponentPendingCard");
  if (opc) opc.style.display = !!(state.players?.[oppId()]?.pending) ? "block" : "none";

  // Buttons
  document.getElementById("noSwapBtn").style.display =
    (state.tenSwap && state.tenSwap.player === myId && state.tenSwap.selectingOwn) ? "inline-block" : "none";
  document.getElementById("restartBtn").style.display = state.gameOver ? "block" : "none";
}

// ─── click handler ────────────────────────────────────────────────────────

document.addEventListener("click", e => {
  if (!state || state.waiting) return;

  if (!memoryDone){
    if (e.target.dataset.index !== undefined){
      if (revealed.length >= 2) return;
      const i = Number(e.target.dataset.index);
      if (!revealed.includes(i)){
        revealed.push(i);
        render();
        if (revealed.length === 2){
          setTimeout(() => { revealed = []; memoryDone = true; render(); }, 5000);
        }
      }
    }
    return;
  }

  if (e.target.id === "noSwapBtn"){ socket.emit("tenOwn", null); return; }

  if (state.tenSwap && state.tenSwap.player === myId && state.tenSwap.selectingOwn && e.target.dataset.index !== undefined){
    socket.emit("tenOwn", Number(e.target.dataset.index)); return;
  }
  if (state.tenSwap && state.tenSwap.player === myId && !state.tenSwap.selectingOwn && e.target.dataset.oppindex !== undefined){
    socket.emit("tenOpp", Number(e.target.dataset.oppindex)); return;
  }

  if (clickedDeck(e.target)){
    document.getElementById("deck").classList.add("deckShake");
    setTimeout(() => document.getElementById("deck").classList.remove("deckShake"), 300);
    socket.emit("draw"); return;
  }

  if (e.target.closest("#discard")){
    me()?.pending ? socket.emit("discardPending") : socket.emit("takeDiscard");
    return;
  }

  if (e.target.dataset.card && me()?.pending){ socket.emit("swap", e.target.dataset.card); return; }
  if (e.target.id === "ghouliesBtn"){ socket.emit("callGhoulies"); return; }
  if (e.target.id === "restartBtn") { socket.emit("restart",   roomCode); return; }
  if (e.target.id === "resetBtn")   { socket.emit("fullReset", roomCode); return; }
});

document.addEventListener("dblclick", e => {
  if (!memoryDone) return;
  const c = e.target.dataset.card;
  if (c) socket.emit("snap", c);
});