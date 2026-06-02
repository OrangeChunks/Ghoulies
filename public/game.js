// game.js

let socket = io({
  reconnection:true,
  reconnectionAttempts:99999,
  reconnectionDelay:1000
});

let state = null;
let myId = null;

let revealed = [];
let memoryDone = false;

let shownRoundPopup = false;

// FIX #8: Removed the top-level connectToRoom() call.
// The "connect" event fires reliably on every (re)connect,
// so calling it here as well caused a duplicate "join" emit on first load.
function connectToRoom(){

  socket.emit("join", "room1");
}

socket.on("connect", () => {

  connectToRoom();
});

socket.on("you", id => {

  myId = id;
});

function me(){

  return state?.players?.[myId];
}

function oppId(){

  return state?.order?.find(
    id => id !== myId
  );
}

function areaForPlayer(playerId){

  if (playerId === myId){

    return {
      hand: document.getElementById("hand"),
      pending: document.getElementById("pending")
    };
  }

  return {
    hand: document.getElementById("opponentHand"),
    pending: document.getElementById("opponentPending")
  };
}

function centerOf(el){

  const r =
    el.getBoundingClientRect();

  return {

    x:r.left + r.width/2,

    y:r.top + r.height/2
  };
}

function animateCard(fromEl,toEl,image){

  if (!fromEl || !toEl || !image){
    return;
  }

  const fx =
    document.getElementById("fxLayer");

  const start =
    centerOf(fromEl);

  const end =
    centerOf(toEl);

  const img =
    document.createElement("img");

  img.src = image;

  img.className = "flyingCard";

  img.style.left =
    start.x + "px";

  img.style.top =
    start.y + "px";

  fx.appendChild(img);

  requestAnimationFrame(() => {

    img.style.left =
      end.x + "px";

    img.style.top =
      end.y + "px";

    img.style.transform =
      "rotate(12deg)";
  });

  setTimeout(() => {

    img.remove();

  },600);
}

function showText(text,color="#fff"){

  const fx =
    document.getElementById("fxLayer");

  const div =
    document.createElement("div");

  div.className =
    "effectText";

  div.style.color =
    color;

  div.innerText =
    text;

  fx.appendChild(div);

  setTimeout(() => {

    div.remove();

  },1000);
}

function pulseCard(selector){

  const el =
    document.querySelector(selector);

  if (!el) return;

  el.style.transition =
    "0.2s";

  el.style.boxShadow =
    "0 0 30px #00ff88";

  el.style.transform =
    "scale(1.15)";

  setTimeout(() => {

    el.style.boxShadow = "";

    el.style.transform = "";

  },700);
}

function highlightCard(el, color="#00ff88"){

  if (!el) return;

  el.style.outline = `5px solid ${color}`;
  el.style.boxShadow = `0 0 20px ${color}`;
  el.style.transform = "scale(1.2) translateY(-10px)";
  el.style.zIndex = "10";
  el.style.transition = "0.15s";

  setTimeout(() => {
    el.style.outline = "";
    el.style.boxShadow = "";
    el.style.transform = "";
    el.style.zIndex = "";
  }, 900);
}

socket.on("state", g => {

  if (g.effect){

    const actor =
      areaForPlayer(
        g.effect.player
      );

    switch(g.effect.type){

      // FIX #16: Each case wrapped in {} to safely scope const/let declarations
      case "drawDeck": {

        showText(
          "DRAW",
          "#00d0ff"
        );

        animateCard(
          document.getElementById("deck"),
          actor.pending,
          "/cards/back.png"
        );

        setTimeout(() => {

          if (g.effect.player !== myId){

            const pendingCard =
              document.getElementById(
                "opponentPendingCard"
              );

            if (pendingCard){
              pendingCard.style.display = "block";
            }
          }

        }, 500);

        break;
      }

      case "takeDiscard": {

        showText(
          "TAKE",
          "#00ff88"
        );

        animateCard(
          document.getElementById("discard"),
          actor.pending,
          document.querySelector("#discard img")?.src
        );

        setTimeout(() => {

          if (g.effect.player !== myId){

            const pendingCard =
              document.getElementById(
                "opponentPendingCard"
              );

            if (pendingCard){
              pendingCard.style.display = "block";
            }
          }

        }, 500);

        break;
      }

      case "discard": {

        const pendingCard =
          document.getElementById(
            "opponentPendingCard"
          );

        if (pendingCard){
          pendingCard.style.display = "none";
        }

        showText(
          "DISCARD",
          "#ff4444"
        );

        animateCard(
          actor.pending,
          document.getElementById("discard"),
          "/cards/back.png"
        );

        break;
      }

      case "swap": {

        showText("SWAP", "#ffd000");

        const handSelector =
          g.effect.player === myId
            ? `#hand img[data-index="${g.effect.handIndex}"]`
            : `#opponentHand img[data-oppindex="${g.effect.handIndex}"]`;

        const handEl =
          document.querySelector(handSelector);

        if (handEl){

          handEl.classList.add("swapping");

          setTimeout(() => {
            handEl.classList.remove("swapping");
          }, 400);
        }

        highlightCard(handEl,"#ffd000");

        setTimeout(() => {

          const source =
            g.effect.player === myId
              ? actor.pending
              : document.getElementById(
                  "opponentPendingCard"
                );

          animateCard(
            source,
            handEl,
            "/cards/back.png"
          );

          setTimeout(() => {
            animateCard(
              handEl,
              document.getElementById("discard"),
              "/cards/back.png"
            );
          },150);

        },200);

        setTimeout(() => {

          if (g.effect.player === myId){

            pulseCard(
              `#hand img[data-index="${g.effect.handIndex}"]`
            );

          } else {

            pulseCard(
              `#opponentHand img[data-oppindex="${g.effect.handIndex}"]`
            );
          }

        },300);

        break;
      }

      case "ghoulies": {

        showText(
          "GHOULIES!",
          "#ff4444"
        );

        document.body.classList.add(
          "ghouliesFlash"
        );

        setTimeout(() => {

          document.body.classList.remove(
            "ghouliesFlash"
          );

        }, 500);

        break;
      }

      case "skip": {

        showText(
          "TURN SKIPPED",
          "#ff8800"
        );

        break;
      }

      case "snapSuccess": {

        showText(
          "SNAP!",
          "#00ff88"
        );

        document.body.classList.add(
          "snapFlash"
        );

        setTimeout(() => {

          document.body.classList.remove(
            "snapFlash"
          );

        },200);

        break;
      }

      case "snapFail": {

        showText(
          "MISS!",
          "#ff0000"
        );

        break;
      }

      case "tenSwap": {

        showText("SPECIAL 10", "gold");

        const mine =
          g.effect.player === myId;

        const ownSelector =
          mine
            ? `#hand img[data-index="${g.effect.ownIndex}"]`
            : `#opponentHand img[data-oppindex="${g.effect.ownIndex}"]`;

        const oppSelector =
          mine
            ? `#opponentHand img[data-oppindex="${g.effect.oppIndex}"]`
            : `#hand img[data-index="${g.effect.oppIndex}"]`;

        const ownEl =
          document.querySelector(ownSelector);

        const oppEl =
          document.querySelector(oppSelector);

        if (ownEl){

          ownEl.classList.add("swapping");

          setTimeout(() => {
            ownEl.classList.remove("swapping");
          }, 400);
        }

        if (oppEl){

          oppEl.classList.add("swapping");

          setTimeout(() => {
            oppEl.classList.remove("swapping");
          }, 400);
        }

        highlightCard(ownEl,"#00ffcc");
        highlightCard(oppEl,"#ff00ff");

        setTimeout(() => {

          animateCard(
            ownEl,
            oppEl,
            "/cards/back.png"
          );

          animateCard(
            oppEl,
            ownEl,
            "/cards/back.png"
          );

        }, 200);

        break;
      }
    }
  }

  state = g;

  if (
    state.roundResult &&
    !shownRoundPopup
  ){

    shownRoundPopup = true;

    // FIX #3: roundResult entries are now objects { score, label }
    // so we display them correctly without risking NaN in arithmetic
    const result =
      state.roundResult[myId];

    const scoreDisplay =
      result.label
        ? `${result.score} (${result.label})`
        : `${result.score}`;

    // FIX #13: Use ?? 0 instead of || 0 so a genuine score of 0 is shown correctly
    const totalScore =
      state.scores[myId] ?? 0;

    alert(
`ROUND OVER

You scored:
${scoreDisplay}

TOTAL SCORE:
${totalScore}`
    );

    memoryDone = false;

    revealed = [];
  }

  if (!state.roundResult){

    shownRoundPopup = false;
  }

  render();
});

socket.on("forceReload", () => {

  location.reload();
});

function file(card){

  const v =
    card.slice(0,-1);

  const s =
    card.slice(-1);

  const suitMap = {

    "♠":"s",

    "♥":"h",

    "♦":"d",

    "♣":"c"
  };

  const valueMap = {

    "A":"01",

    "2":"02",

    "3":"03",

    "4":"04",

    "5":"05",

    "6":"06",

    "7":"07",

    "8":"08",

    "9":"09",

    "10":"10",

    "J":"11",

    "Q":"12",

    "K":"13"
  };

  return `/cards/${suitMap[s]}${valueMap[v]}.png`;
}

function back(){

  return "/cards/back.png";
}

function clickedDeck(el){

  return (
    el.id === "deck" ||
    el.closest("#deck")
  );
}

function render(){

  if (!state || !myId){
    return;
  }

  const p = me();

  const o =
    state.players?.[oppId()];

  const turn =
    state.order[state.turn]
    === myId;

  document
    .getElementById("hand")
    .classList.toggle(
      "activeTurn",
      turn
    );

  let statusText = "";

  if (!memoryDone){

    statusText =
      `Memorise 2 cards (${revealed.length}/2)`;

  } else if (
    state.tenSwap &&
    state.tenSwap.player === myId
  ){

    if (
      state.tenSwap.selectingOwn
    ){

      statusText =
        "Choose YOUR card";

    } else {

      statusText =
        "Choose OPPONENT card";
    }

  } else {

    statusText =
      turn
      ? "YOUR TURN"
      : "OPPONENT TURN";
  }

  if (
    state.message &&
    state.message[myId]
  ){

    statusText =
      state.message[myId];
  }

  document.getElementById(
    "status"
  ).innerText =
    statusText;

  // FIX #13: Use ?? 0 instead of || 0 so a score of 0 renders as "0" not hidden
  document.getElementById(
    "scores"
  ).innerHTML =
`
You: ${state.scores?.[myId] ?? 0}
|
Opponent: ${state.scores?.[oppId()] ?? 0}
`;

  document.getElementById(
    "hand"
  ).innerHTML =

    p?.hand?.map((c,i) => {

      const visible =
        revealed.includes(i);

      const tenGlow =
        state.tenSwap &&
        state.tenSwap.player === myId &&
        state.tenSwap.selectingOwn;

      return `
        <img
          class="card ${tenGlow ? "tenGlow" : ""}"
          data-card="${c}"
          data-index="${i}"
          src="${visible ? file(c) : back()}"
        >
      `;
    }).join("") || "";

  document.getElementById(
    "opponentHand"
  ).innerHTML =

    o?.hand?.map((c,i) => {

      const tenGlow =
        state.tenSwap &&
        state.tenSwap.player === myId &&
        !state.tenSwap.selectingOwn;

      return `
        <img
          class="card ${tenGlow ? "tenGlow" : ""}"
          data-oppindex="${i}"
          src="${back()}"
        >
      `;
    }).join("") || "";

  const top =
    state.discard?.at(-1);

  document.getElementById(
    "discard"
  ).innerHTML =

    top
      ? `<img class="card pop" src="${file(top)}">`
      : "";

  const pending =
    p?.pending;

  document.getElementById(
    "pending"
  ).innerHTML =

    pending && turn
      ? `
        <div>

          <div style="margin-bottom:8px">
            Picked Up
          </div>

          <img
            class="card flip bigCard"
            src="${file(pending)}"
          >

        </div>
      `
      : "";

  document.getElementById(
    "noSwapBtn"
  ).style.display =

    (
      state.tenSwap &&
      state.tenSwap.player === myId &&
      state.tenSwap.selectingOwn
    )
      ? "inline-block"
      : "none";

  document.getElementById(
    "restartBtn"
  ).style.display =

    state.gameOver
      ? "block"
      : "none";
}

document.addEventListener(
  "click",
  e => {

    if (!state) return;

    if (!memoryDone){

      if (
        e.target.dataset.index
        !== undefined
      ){

        if (
          revealed.length >= 2
        ){
          return;
        }

        const i =
          Number(
            e.target.dataset.index
          );

        if (
          !revealed.includes(i)
        ){

          revealed.push(i);

          render();

          if (
            revealed.length === 2
          ){

            setTimeout(() => {

              revealed = [];

              memoryDone = true;

              render();

            },5000);
          }
        }
      }

      return;
    }

    if (
      e.target.id === "noSwapBtn"
    ){

      socket.emit(
        "tenOwn",
        null
      );

      return;
    }

    if (
      state.tenSwap &&
      state.tenSwap.player === myId &&
      state.tenSwap.selectingOwn &&
      e.target.dataset.index !== undefined
    ){

      socket.emit(
        "tenOwn",
        Number(
          e.target.dataset.index
        )
      );

      return;
    }

    if (
      state.tenSwap &&
      state.tenSwap.player === myId &&
      !state.tenSwap.selectingOwn &&
      e.target.dataset.oppindex !== undefined
    ){

      socket.emit(
        "tenOpp",
        Number(
          e.target.dataset.oppindex
        )
      );

      return;
    }

    if (
      clickedDeck(e.target)
    ){

      document
        .getElementById("deck")
        .classList.add(
          "deckShake"
        );

      setTimeout(() => {

        document
          .getElementById("deck")
          .classList.remove(
            "deckShake"
          );

      },300);

      socket.emit("draw");

      return;
    }

    if (
      e.target.closest("#discard")
    ){

      if (me()?.pending){

        socket.emit(
          "discardPending"
        );

      } else {

        socket.emit(
          "takeDiscard"
        );
      }

      return;
    }

    if (
      e.target.dataset.card &&
      me()?.pending
    ){

      socket.emit(
        "swap",
        e.target.dataset.card
      );

      return;
    }

    if (
      e.target.id === "ghouliesBtn"
    ){

      socket.emit(
        "callGhoulies"
      );

      return;
    }

    if (
      e.target.id === "restartBtn"
    ){

      socket.emit(
        "restart",
        "room1"
      );

      return;
    }

    if (
      e.target.id === "resetBtn"
    ){

      socket.emit(
        "fullReset",
        "room1"
      );

      return;
    }
});

document.addEventListener(
  "dblclick",
  e => {

    if (!memoryDone) return;

    const c =
      e.target.dataset.card;

    if (c){

      socket.emit(
        "snap",
        c
      );
    }
});