// game.js

let socket = io({
  reconnection:         true,
  reconnectionAttempts: 99999,
  reconnectionDelay:    1000
});

let state           = null;
let myId            = null;
let roomCode        = null;
let revealed        = [];
let memoryDone      = false;
let shownRoundPopup = false;
let revealAll       = false;
let chatOpen        = false;
let unreadCount     = 0;

// ─── screen management ────────────────────────────────────────────────────

function showScreen(id){
  ["lobbyScreen","gameScreen"].forEach(s => {
    document.getElementById(s).style.display = s === id ? "flex" : "none";
  });
}

// ─── socket core ──────────────────────────────────────────────────────────

socket.on("connect", () => {
  if (roomCode) socket.emit("joinRoom", roomCode);
});

socket.on("you",      id   => { myId = id; });
socket.on("roomCode", code => {
  roomCode = code;
  document.getElementById("roomCodeDisplay").innerText = code;
});
socket.on("joinError", msg => {
  const el = document.getElementById("joinErrorMsg");
  el.innerText = msg;
  el.style.display = "block";
});
socket.on("opponentLeft", () => showToast("Opponent disconnected…"));
socket.on("forceReload",  () => location.reload());

// ─── chat ─────────────────────────────────────────────────────────────────

socket.on("chatMsg", ({ from, text }) => {
  const mine = from === myId;
  appendChatMsg(text, mine ? "mine" : "theirs");
  if (!chatOpen && !mine){
    unreadCount++;
    document.getElementById("chatToggleBtn").classList.add("hasUnread");
  }
});

function appendChatMsg(text, type){
  const box = document.getElementById("chatMessages");
  const div = document.createElement("div");
  div.className = "chatMsg " + type;
  div.textContent = text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function openChat(){
  chatOpen = true;
  unreadCount = 0;
  document.getElementById("chatDrawer").classList.add("open");
  document.getElementById("chatToggleBtn").classList.remove("hasUnread");
  setTimeout(() => document.getElementById("chatInput").focus(), 320);
}

function closeChat(){
  chatOpen = false;
  document.getElementById("chatDrawer").classList.remove("open");
}

function sendChat(){
  const input = document.getElementById("chatInput");
  const text  = input.value.trim();
  if (!text) return;
  socket.emit("chatMsg", text);
  input.value = "";
}

// tenSwap skip button — same as the old noSwapBtn but much more visible
document.getElementById("tenSwapSkipBtn").addEventListener("click", () => {
  socket.emit("tenOwn", null);
});

document.getElementById("chatToggleBtn").addEventListener("click", () => chatOpen ? closeChat() : openChat());
document.getElementById("closeChatBtn").addEventListener("click", closeChat);
document.getElementById("chatSendBtn").addEventListener("click", sendChat);
document.getElementById("chatInput").addEventListener("keydown", e => {
  if (e.key === "Enter"){ e.preventDefault(); sendChat(); }
});

// ─── lobby buttons ────────────────────────────────────────────────────────

document.getElementById("createRoomBtn").addEventListener("click", () => {
  socket.emit("createRoom");
  showScreen("gameScreen");
});

document.getElementById("joinRoomBtn").addEventListener("click", () => {
  const code = document.getElementById("joinCodeInput").value.trim().toUpperCase();
  if (!code) return;
  document.getElementById("joinErrorMsg").style.display = "none";
  socket.emit("joinRoom", code);
});

// also allow Enter key in code input
document.getElementById("joinCodeInput").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("joinRoomBtn").click();
});

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

// ─── game-over overlay ────────────────────────────────────────────────────

function showGameOver(isLoser, myScore, oppScore){
  const overlay = document.getElementById("gameOverOverlay");
  const title   = document.getElementById("gameOverTitle");
  const detail  = document.getElementById("gameOverDetail");

  if (isLoser){
    title.innerText           = "💀 You Lose";
    title.style.color         = "#e74c3c";
    overlay.style.background  = "rgba(70,10,10,0.92)";
  } else {
    title.innerText           = "🎉 You Win!";
    title.style.color         = "#2ecc71";
    overlay.style.background  = "rgba(10,50,25,0.92)";
  }

  detail.innerHTML =
    `Final scores<br>
     You: <strong>${myScore}</strong> &nbsp;·&nbsp; Opponent: <strong>${oppScore}</strong>`;

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

// ─── toast ────────────────────────────────────────────────────────────────

let toastTimer = null;
function showToast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
}

// ─── state handler ────────────────────────────────────────────────────────

socket.on("state", g => {

  if (myId && g.players[myId]) showScreen("gameScreen");

  state = g;
  render();

  // ── effects ──────────────────────────────────────────────────────────────
  if (g.effect){

    const actor = areaForPlayer(g.effect.player);

    switch(g.effect.type){

      case "drawDeck": {
        showText("DRAW", "#5dade2");
        // Card lifts from deck with a slight rise before flying to pending
        animateCard(
          document.getElementById("deck"),
          actor.pending,
          "/cards/back.png",
          { lift: true }
        );
        break;
      }

      case "takeDiscard": {
        showText("TAKE", "#58d68d");
        animateCard(
          document.getElementById("discard"),
          actor.pending,
          document.querySelector("#discard img")?.src ?? "/cards/back.png",
          { lift: true }
        );
        break;
      }

      case "discard": {
        showText("DISCARD", "#e74c3c");
        // Card arcs from pending zone down to the discard pile
        animateCard(
          actor.pending,
          document.getElementById("discard"),
          "/cards/back.png",
          { arc: true }
        );
        break;
      }

      case "swap": {
        showText("SWAP", "#f0c040");
        const isMe = g.effect.player === myId;
        const handSelector = isMe
          ? `#hand img[data-index="${g.effect.handIndex}"]`
          : `#opponentHand img[data-oppindex="${g.effect.handIndex}"]`;
        const handEl = document.querySelector(handSelector);

        highlightCard(handEl, "#f0c040");
        if (handEl){
          handEl.classList.add("swapping");
          setTimeout(() => handEl.classList.remove("swapping"), 1000);
        }

        const source = isMe
          ? actor.pending
          : document.getElementById("opponentPendingCard");

        setTimeout(() => animateCard(source, handEl, "/cards/back.png"), 150);
        setTimeout(() => animateCard(handEl, document.getElementById("discard"), "/cards/back.png", { arc: true }), 700);
        setTimeout(() => pulseCard(handSelector), 800);
        break;
      }

      case "ghoulies": {
        showText("GHOULIES!", "#e74c3c");
        document.body.classList.add("ghouliesFlash");
        setTimeout(() => document.body.classList.remove("ghouliesFlash"), 700);
        if (g.finalTurnPlayer === myId) showLastTurnWarning();
        break;
      }

      case "skip": {
        showText("SKIPPED", "#e67e22");
        break;
      }

      case "snapSuccess": {
        showText("SNAP!", "#2ecc71");
        document.body.classList.add("snapFlash");
        setTimeout(() => document.body.classList.remove("snapFlash"), 280);
        break;
      }

      case "snapFail": {
        showText("MISS!", "#e74c3c");
        break;
      }

      case "tenSwap": {
        showText("SPECIAL 10", "#e8c96a");
        const mine = g.effect.player === myId;
        const ownSel = mine
          ? `#hand img[data-index="${g.effect.ownIndex}"]`
          : `#opponentHand img[data-oppindex="${g.effect.ownIndex}"]`;
        const oppSel = mine
          ? `#opponentHand img[data-oppindex="${g.effect.oppIndex}"]`
          : `#hand img[data-index="${g.effect.oppIndex}"]`;

        const ownEl = document.querySelector(ownSel);
        const oppEl = document.querySelector(oppSel);

        highlightCard(ownEl, "#5dade2");
        highlightCard(oppEl, "#af7ac5");

        if (ownEl){ ownEl.classList.add("swapping"); setTimeout(() => ownEl.classList.remove("swapping"), 1100); }
        if (oppEl){ oppEl.classList.add("swapping"); setTimeout(() => oppEl.classList.remove("swapping"), 1100); }

        setTimeout(() => {
          animateCard(ownEl, oppEl, "/cards/back.png");
          animateCard(oppEl, ownEl, "/cards/back.png");
        }, 300);
        break;
      }
    }
  }

  // ── game-over ─────────────────────────────────────────────────────────
  if (g.gameOver){
    showGameOver(g.losers.includes(myId), g.scores[myId] ?? 0, g.scores[oppId()] ?? 0);
    return;
  } else {
    hideGameOver();
  }

  // ── end-of-round reveal ───────────────────────────────────────────────
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

      showRoundModal(scoreDisplay, state.scores[myId] ?? 0);

      memoryDone = false;
      revealed   = [];
    }, 5000);
  }

  if (!state.roundResult) shownRoundPopup = false;
});

// ─── round result modal (replaces browser alert) ─────────────────────────

function showRoundModal(scoreDisplay, total){
  const existing = document.getElementById("roundModal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "roundModal";
  modal.style.cssText = `
    position:fixed; inset:0; z-index:9200;
    background:rgba(0,0,0,0.75);
    display:flex; align-items:center; justify-content:center;
    padding:24px;
  `;

  modal.innerHTML = `
    <div style="
      background:#1e2e23; border:1px solid rgba(255,255,255,0.12);
      border-radius:18px; padding:28px 24px; text-align:center;
      max-width:320px; width:100%;
    ">
      <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#888;margin-bottom:12px">Round Over</div>
      <div style="font-size:36px;font-weight:800;color:#f0ede6;margin-bottom:4px">${scoreDisplay}</div>
      <div style="font-size:13px;color:#888;margin-bottom:20px">pts this round</div>
      <div style="font-size:15px;color:#ccc;margin-bottom:24px">Total: <strong style="color:#f0ede6">${total}</strong> pts</div>
      <button id="roundModalClose" style="
        padding:12px 32px; border-radius:10px; border:none;
        background:#27ae60; color:#fff; font-size:15px;
        font-weight:600; cursor:pointer; width:100%;
      ">Continue</button>
    </div>
  `;

  document.body.appendChild(modal);
  document.getElementById("roundModalClose").addEventListener("click", () => modal.remove());
}

// ─── helpers ──────────────────────────────────────────────────────────────

function me()    { return state?.players?.[myId]; }
function oppId() { return state?.order?.find(id => id !== myId); }

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

// ─── animateCard ──────────────────────────────────────────────────────────
// options.lift — card rises slightly at the source before flying (draw/take)
// options.arc  — card follows a subtle arc (discard — adds a midpoint peak)

function animateCard(fromEl, toEl, image, options = {}){
  if (!fromEl || !toEl || !image) return;

  const fx    = document.getElementById("fxLayer");
  const start = centerOf(fromEl);
  const end   = centerOf(toEl);

  if (Math.abs(start.x - end.x) < 2 && Math.abs(start.y - end.y) < 2) return;

  const DURATION = 780; // ms — natural, unhurried

  const img = document.createElement("img");

  img.onload = () => {
    img.style.cssText = `
      position:absolute; left:0; top:0;
      width: var(--card-w, 68px);
      border-radius: var(--radius, 10px);
      pointer-events:none;
      will-change:transform,opacity,box-shadow;
      opacity:0;
      z-index:9999;
      transform: translate(${start.x}px,${start.y}px) translate(-50%,-50%) scale(1);
      box-shadow: 0 4px 10px rgba(0,0,0,0.4);
    `;
    fx.appendChild(img);

    if (options.lift){
      // ── LIFT: rise from source, THEN fly ─────────────────────────────
      // Phase 1: lift up and fade in (200ms)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        img.style.transition = [
          `transform  0.2s cubic-bezier(0.25,0.46,0.45,0.94)`,
          `opacity    0.1s ease-out`,
          `box-shadow 0.2s ease`
        ].join(", ");
        img.style.opacity   = "1";
        img.style.transform = `translate(${start.x}px,${start.y}px) translate(-50%,-55%) scale(1.08)`;
        img.style.boxShadow = "0 16px 32px rgba(0,0,0,0.65)";
      }));

      // Phase 2: fly to destination (after lift completes)
      setTimeout(() => {
        const angle = (Math.random() * 8 - 4).toFixed(1);
        img.style.transition = [
          `transform  ${DURATION}ms cubic-bezier(0.25,0.46,0.45,0.94)`,
          `box-shadow ${DURATION}ms ease-out`
        ].join(", ");
        img.style.transform = `translate(${end.x}px,${end.y}px) translate(-50%,-50%) rotate(${angle}deg) scale(1)`;
        img.style.boxShadow = "0 6px 16px rgba(0,0,0,0.45)";
      }, 210);

      // Fade out and remove
      setTimeout(() => {
        img.style.transition = "opacity 0.15s ease-in";
        img.style.opacity    = "0";
        setTimeout(() => img.remove(), 160);
      }, 210 + DURATION + 40);

    } else if (options.arc){
      // ── ARC: card follows a curved path through a high midpoint ───────
      // Achieved with a CSS keyframe animation created dynamically.
      const mx  = (start.x + end.x) / 2;
      const my  = Math.min(start.y, end.y) - 80; // peak 80px above the lower of the two
      const ang = (Math.random() * 10 - 5).toFixed(1);
      const id  = "arc_" + Date.now();

      const style = document.createElement("style");
      style.textContent = `
        @keyframes ${id} {
          0%   { transform: translate(${start.x}px,${start.y}px) translate(-50%,-50%) scale(1) rotate(0deg);
                 opacity: 0; box-shadow: 0 4px 10px rgba(0,0,0,0.3); }
          5%   { opacity: 1; }
          40%  { transform: translate(${mx}px,${my}px) translate(-50%,-50%) scale(1.1) rotate(${ang / 2}deg);
                 box-shadow: 0 20px 36px rgba(0,0,0,0.65); }
          90%  { opacity: 1; }
          100% { transform: translate(${end.x}px,${end.y}px) translate(-50%,-50%) scale(1) rotate(${ang}deg);
                 box-shadow: 0 4px 12px rgba(0,0,0,0.35); opacity: 1; }
        }
      `;
      document.head.appendChild(style);

      img.style.animation = `${id} ${DURATION + 100}ms cubic-bezier(0.25,0.46,0.45,0.94) forwards`;

      setTimeout(() => {
        img.style.transition = "opacity 0.15s ease-in";
        img.style.opacity    = "0";
        img.style.animation  = "none";
        setTimeout(() => { img.remove(); style.remove(); }, 160);
      }, DURATION + 100 + 20);

    } else {
      // ── DEFAULT: straight smooth flight ──────────────────────────────
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const angle = (Math.random() * 10 - 5).toFixed(1);
        img.style.transition = [
          `transform  ${DURATION}ms cubic-bezier(0.25,0.46,0.45,0.94)`,
          `opacity    0.1s ease-out`,
          `box-shadow ${DURATION}ms ease-out`
        ].join(", ");
        img.style.opacity   = "1";
        img.style.transform = `translate(${end.x}px,${end.y}px) translate(-50%,-50%) rotate(${angle}deg)`;
        img.style.boxShadow = "0 14px 28px rgba(0,0,0,0.6)";
      }));

      setTimeout(() => {
        img.style.transition = "opacity 0.15s ease-in";
        img.style.opacity    = "0";
        setTimeout(() => img.remove(), 160);
      }, DURATION + 40);
    }
  };

  img.src = image;
}

function showText(text, color = "#fff"){
  const fx  = document.getElementById("fxLayer");
  const div = document.createElement("div");
  div.className    = "effectText";
  div.style.color  = color;
  div.textContent  = text;
  fx.appendChild(div);
  setTimeout(() => div.remove(), 1100);
}

function pulseCard(selector){
  const el = document.querySelector(selector);
  if (!el) return;
  el.style.transition = "box-shadow 0.3s ease, transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)";
  el.style.boxShadow  = "0 0 0 3px #58d68d, 0 8px 20px rgba(0,0,0,0.5)";
  el.style.transform  = "scale(1.1) translateY(-4px)";
  setTimeout(() => {
    el.style.transition = "box-shadow 0.5s ease, transform 0.5s ease";
    el.style.boxShadow  = "";
    el.style.transform  = "";
  }, 600);
}

function highlightCard(el, color = "#58d68d"){
  if (!el) return;
  el.style.transition = "outline 0.2s ease, box-shadow 0.2s ease, transform 0.25s cubic-bezier(0.25,0.46,0.45,0.94)";
  el.style.outline    = `3px solid ${color}`;
  el.style.boxShadow  = `0 0 14px ${color}88, 0 6px 18px rgba(0,0,0,0.45)`;
  el.style.transform  = "scale(1.12) translateY(-6px)";
  el.style.zIndex     = "10";
  setTimeout(() => {
    el.style.transition = "outline 0.35s, box-shadow 0.35s, transform 0.35s";
    el.style.outline = ""; el.style.boxShadow = "";
    el.style.transform = ""; el.style.zIndex = "";
  }, 1100);
}

function showLastTurnWarning(){
  const hand = document.getElementById("hand");
  hand.classList.add("lastTurnPulse");
  setTimeout(() => hand.classList.remove("lastTurnPulse"), 3000);
  const fx     = document.getElementById("fxLayer");
  const banner = document.createElement("div");
  banner.className = "lastTurnBanner";
  banner.textContent = "⚠️ LAST TURN!";
  fx.appendChild(banner);
  setTimeout(() => banner.remove(), 3200);
}

function file(card){
  const v = card.slice(0,-1), s = card.slice(-1);
  const suitMap  = { "♠":"s","♥":"h","♦":"d","♣":"c" };
  const valueMap = { "A":"01","2":"02","3":"03","4":"04","5":"05","6":"06",
                     "7":"07","8":"08","9":"09","10":"10","J":"11","Q":"12","K":"13" };
  return `/cards/${suitMap[s]}${valueMap[v]}.png`;
}
function back(){ return "/cards/back.png"; }
function clickedDeck(el){ return el.id === "deck" || el.closest("#deck"); }

// ─── render ───────────────────────────────────────────────────────────────

function render(){
  if (!state || !myId) return;

  // Waiting for opponent
  if (state.waiting){
    const pill = document.getElementById("statusPill");
    pill.textContent = `Room ${roomCode} — Waiting…`;
    pill.className   = "oppTurn";
    document.getElementById("scores").innerHTML = "";
    document.getElementById("hand").innerHTML         = "";
    document.getElementById("opponentHand").innerHTML = "";
    document.getElementById("discard").innerHTML      = "";
    document.getElementById("pending").innerHTML      = "";
    document.getElementById("pendingLabel").style.display = "none";
    document.getElementById("noSwapBtn").style.display   = "none";
    document.getElementById("restartBtn").style.display  = "none";
    document.getElementById("tenSwapPrompt").style.display = "none";
    return;
  }

  const p    = me();
  const o    = state.players?.[oppId()];
  const turn = state.order[state.turn] === myId;

  // ── HUD ──────────────────────────────────────────────────────────────────
  document.getElementById("scores").innerHTML =
    `<strong>${state.scores?.[myId] ?? 0}</strong> · <strong>${state.scores?.[oppId()] ?? 0}</strong>`;

  const pill = document.getElementById("statusPill");
  let statusText = "";
  let pillClass  = "";

  if (!memoryDone){
    statusText = `Memorise ${2 - revealed.length} more card${2 - revealed.length !== 1 ? "s" : ""}`;
    pillClass  = "warning";
  } else if (state.tenSwap && state.tenSwap.player === myId){
    statusText = state.tenSwap.selectingOwn ? "Choose your card" : "Choose their card";
    pillClass  = "warning";
  } else {
    statusText = turn ? "Your Turn" : "Their Turn";
    pillClass  = turn ? "myTurn" : "oppTurn";
  }
  if (state.message && state.message[myId]){
    statusText = state.message[myId];
    pillClass  = "warning";
  }

  pill.textContent = statusText;
  pill.className   = pillClass;

  // ── hand active glow ──────────────────────────────────────────────────
  document.getElementById("hand").classList.toggle("activeTurn", turn);

  // ── my hand ───────────────────────────────────────────────────────────
  document.getElementById("hand").innerHTML =
    p?.hand?.map((c,i) => {
      const visible = revealAll || revealed.includes(i);
      const tenGlow = state.tenSwap && state.tenSwap.player === myId && state.tenSwap.selectingOwn;
      return `<img class="card${tenGlow?" tenGlow":""}" data-card="${c}" data-index="${i}"
                src="${visible ? file(c) : back()}" draggable="false">`;
    }).join("") || "";

  // ── opponent hand ─────────────────────────────────────────────────────
  document.getElementById("opponentHand").innerHTML =
    o?.hand?.map((c,i) => {
      const tenGlow = state.tenSwap && state.tenSwap.player === myId && !state.tenSwap.selectingOwn;
      return `<img class="card${tenGlow?" tenGlow":""}" data-oppindex="${i}"
                src="${revealAll ? file(c) : back()}" draggable="false">`;
    }).join("") || "";

  // ── discard ───────────────────────────────────────────────────────────
  const top = state.discard?.at(-1);
  document.getElementById("discard").innerHTML =
    top ? `<img class="pop" src="${file(top)}" draggable="false" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:var(--radius)">` : "";

  // ── pending ───────────────────────────────────────────────────────────
  const pending = p?.pending;
  const pendingLabel = document.getElementById("pendingLabel");
  const pendingZone  = document.getElementById("pending");

  if (pending && turn){
    pendingLabel.style.display = "block";
    pendingZone.innerHTML = `<img class="card flip" src="${file(pending)}" draggable="false"
      style="width:var(--card-w);height:var(--card-h);object-fit:cover;border-radius:var(--radius);">`;
  } else {
    pendingLabel.style.display = "none";
    pendingZone.innerHTML = "";
  }

  // ── opponent pending ──────────────────────────────────────────────────
  const opc = document.getElementById("opponentPendingCard");
  if (opc) opc.style.display = !!(state.players?.[oppId()]?.pending) ? "block" : "none";

  // ── Special-10 prompt banner ─────────────────────────────────────────
  const tenSwapPrompt = document.getElementById("tenSwapPrompt");
  const tenSwapText   = document.getElementById("tenSwapPromptText");
  const myTenSwap     = state.tenSwap && state.tenSwap.player === myId;

  if (myTenSwap){
    tenSwapPrompt.style.display = "flex";
    if (state.tenSwap.selectingOwn){
      tenSwapText.textContent    = "Special 10 — tap one of your cards to swap";
      // Show skip button only when selecting own card (first step)
      document.getElementById("tenSwapSkipBtn").style.display = "inline-block";
    } else {
      tenSwapText.textContent    = "Now tap your opponent's card to swap with";
      document.getElementById("tenSwapSkipBtn").style.display = "none";
    }
  } else {
    tenSwapPrompt.style.display = "none";
  }

  // Legacy noSwapBtn hidden — tenSwapSkipBtn takes over
  document.getElementById("noSwapBtn").style.display = "none";
  document.getElementById("restartBtn").style.display = state.gameOver ? "inline-flex" : "none";
}

// ─── click ────────────────────────────────────────────────────────────────

document.addEventListener("click", e => {
  if (!state || state.waiting) return;

  // Memory phase
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

  if (e.target.id === "noSwapBtn" || e.target.id === "tenSwapSkipBtn"){ socket.emit("tenOwn", null); return; }

  if (state.tenSwap && state.tenSwap.player === myId && state.tenSwap.selectingOwn
      && e.target.dataset.index !== undefined){
    socket.emit("tenOwn", Number(e.target.dataset.index)); return;
  }
  if (state.tenSwap && state.tenSwap.player === myId && !state.tenSwap.selectingOwn
      && e.target.dataset.oppindex !== undefined){
    socket.emit("tenOpp", Number(e.target.dataset.oppindex)); return;
  }

  if (clickedDeck(e.target)){
    document.getElementById("deck").classList.add("deckShake");
    setTimeout(() => document.getElementById("deck").classList.remove("deckShake"), 280);
    socket.emit("draw");
    return;
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

// ─── double-tap / double-click → snap ────────────────────────────────────

document.addEventListener("dblclick", e => {
  if (!memoryDone) return;
  const c = e.target.dataset.card;
  if (c) socket.emit("snap", c);
});