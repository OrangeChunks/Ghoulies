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
          // Keep faded until the animation has fully landed
          setTimeout(() => handEl.classList.remove("swapping"), 1000);
        }

        const source = isMe
          ? actor.pending
          : document.getElementById("opponentPendingCard");

        // Stagger: first card arrives (~750ms), then second launches
        // Slight delay before first so highlight is visible first
        setTimeout(() => {
          animateCard(source, handEl, "/cards/back.png");
        }, 150);

        // Second animation launches after first has mostly landed
        setTimeout(() => {
          animateCard(handEl, document.getElementById("discard"), "/cards/back.png");
        }, 700);

        setTimeout(() => pulseCard(handSelector), 780);
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

        if (ownEl){ ownEl.classList.add("swapping"); setTimeout(() => ownEl.classList.remove("swapping"), 1100); }
        if (oppEl){ oppEl.classList.add("swapping"); setTimeout(() => oppEl.classList.remove("swapping"), 1100); }

        // Both cards launch together after highlights are visible
        setTimeout(() => {
          animateCard(ownEl, oppEl, "/cards/back.png");
          animateCard(oppEl, ownEl, "/cards/back.png");
        }, 300);
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

// ─── Card animation ───────────────────────────────────────────────────────
// • compositor-only transform — no layout reflow, no jitter
// • image is preloaded before measuring/launching so coordinates are accurate
// • long ease-out curve mimics the physical feel of placing a card on a table
// • subtle random end-rotation so repeated moves don't look robotic
// • shadow lifts during flight then settles, giving a sense of physical depth

function animateCard(fromEl, toEl, image){
  if (!fromEl || !toEl || !image) return;

  const fx    = document.getElementById("fxLayer");
  const start = centerOf(fromEl);
  const end   = centerOf(toEl);

  // Skip if positions are essentially the same (element off-screen / hidden)
  if (Math.abs(start.x - end.x) < 2 && Math.abs(start.y - end.y) < 2) return;

  const img = document.createElement("img");

  img.onload = () => {
    // Place card at source, invisible, no transition yet
    img.style.cssText = `
      position: absolute;
      left: 0; top: 0;
      width: 80px;
      border-radius: 6px;
      pointer-events: none;
      will-change: transform, opacity, box-shadow;
      opacity: 0;
      transform: translate(${start.x}px, ${start.y}px) translate(-50%, -50%) rotate(0deg);
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      z-index: 9999;
    `;
    fx.appendChild(img);

    // Paint frame 1: starting state visible
    // Paint frame 2: begin transition to destination
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const endAngle = (Math.random() * 10 - 5).toFixed(1);

        img.style.transition = [
          "transform  0.75s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
          "opacity    0.12s ease-out",
          "box-shadow 0.75s ease-out"
        ].join(", ");

        img.style.opacity   = "1";
        img.style.transform = `translate(${end.x}px, ${end.y}px) translate(-50%, -50%) rotate(${endAngle}deg)`;
        img.style.boxShadow = "0 14px 30px rgba(0,0,0,0.6)";
      });
    });

    // Fade out at end of flight, then remove
    setTimeout(() => {
      img.style.transition = "opacity 0.15s ease-in";
      img.style.opacity    = "0";
      setTimeout(() => img.remove(), 160);
    }, 720);
  };

  img.src = image;  // triggers preload; onload fires even when cached
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
  el.style.transition = "box-shadow 0.35s ease, transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94)";
  el.style.boxShadow  = "0 0 28px #00ff88, 0 8px 20px rgba(0,0,0,0.5)";
  el.style.transform  = "scale(1.12) translateY(-4px)";
  setTimeout(() => {
    el.style.transition = "box-shadow 0.5s ease, transform 0.5s ease";
    el.style.boxShadow  = "";
    el.style.transform  = "";
  }, 650);
}

function highlightCard(el, color = "#00ff88"){
  if (!el) return;
  // Slow, deliberate glow-up — like someone pointing to a card on a table
  el.style.transition = [
    "outline   0.25s ease",
    "box-shadow 0.25s ease",
    "transform  0.3s cubic-bezier(0.25,0.46,0.45,0.94)"
  ].join(", ");
  el.style.outline   = `4px solid ${color}`;
  el.style.boxShadow = `0 0 18px ${color}88, 0 8px 20px rgba(0,0,0,0.5)`;
  el.style.transform = "scale(1.15) translateY(-8px)";
  el.style.zIndex    = "10";
  setTimeout(() => {
    el.style.transition = [
      "outline    0.4s ease",
      "box-shadow 0.4s ease",
      "transform  0.4s ease"
    ].join(", ");
    el.style.outline   = "";
    el.style.boxShadow = "";
    el.style.transform = "";
    el.style.zIndex    = "";
  }, 1100);
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