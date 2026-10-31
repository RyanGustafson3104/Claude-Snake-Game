const GRID_SIZE = 20;          // the board is 20 cells wide and 20 cells tall
const CELL_SIZE = 20;          // each cell is 20 x 20 pixels on the canvas
const POINTS_PER_FOOD = 10;
const BEST_SCORE_KEY = "snake-best-score";   // name used to save the best score

// How far one step moves in each direction, as [x change, y change].
// On a canvas, y gets bigger going DOWN, so "up" is -1.
const DIRECTIONS = {
  up:    { x:  0, y: -1 },
  down:  { x:  0, y:  1 },
  left:  { x: -1, y:  0 },
  right: { x:  1, y:  0 },
};

// The snake can't turn straight back into itself, so we need to know opposites.
const OPPOSITE_DIRECTION = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

// Which keyboard keys steer in which direction
const KEY_TO_DIRECTION = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
};


const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");

const scoreDisplay = document.getElementById("score-display");
const bestDisplay = document.getElementById("best-display");

const menuScreen = document.getElementById("menu-screen");
const countdownScreen = document.getElementById("countdown-screen");
const pauseScreen = document.getElementById("pause-screen");
const gameOverScreen = document.getElementById("game-over-screen");

const countdownNumber = document.getElementById("countdown-number");

const finalScoreText = document.getElementById("final-score");
const finalLengthText = document.getElementById("final-length");
const finalBestText = document.getElementById("final-best");
const newBestMessage = document.getElementById("new-best-message");

const startButton = document.getElementById("start-button");
const restartButton = document.getElementById("restart-button");
const mainMenuButton = document.getElementById("main-menu-button");
const speedButtons = document.querySelectorAll(".speed-button");
const foodButtons = document.querySelectorAll(".food-button");
const dPadButtons = document.querySelectorAll(".d-pad button");
const screenElement = document.getElementById("screen");

const cssVariables = getComputedStyle(document.documentElement);
const COLOR_SCREEN = cssVariables.getPropertyValue("--lcd").trim();
const COLOR_PIXEL = cssVariables.getPropertyValue("--pixel").trim();
const COLOR_PIXEL_DIM = cssVariables.getPropertyValue("--pixel-dim").trim();


let gameState = "menu";

let snake = [];

let currentDirection = "right";

let pendingTurns = [];

let foods = [];
let numOfFoods = 1;
let score = 0;
let bestScore = 0;

let stepDelayMs = 100;          // time between snake steps; changed by the speed buttons
let gameLoopTimer = null;       // the setInterval that moves the snake
let countdownTimer = null;      // the setTimeout that runs the countdown


/* ---------------------------------------------------------
   4. BEST SCORE
   Saved in the browser's localStorage so it survives a page reload.
   localStorage can fail (e.g. in private browsing), so it's wrapped in try/catch
   and the game keeps working without it.
   --------------------------------------------------------- */

function loadBestScore() {
  try {
    const saved = localStorage.getItem(BEST_SCORE_KEY);
    return saved ? Number(saved) : 0;
  } catch (error) {
    return 0;
  }
}

function saveBestScore(value) {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(value));
  } catch (error) {
    // Couldn't save. Not a problem; the best score just won't persist.
  }
}

// Turns 30 into "0030" for the score bar
function formatScore(number) {
  return String(number).padStart(4, "0");
}

function updateScoreBar() {
  scoreDisplay.textContent = formatScore(score);
  bestDisplay.textContent = formatScore(bestScore);
}


/* ---------------------------------------------------------
   5. DRAWING
   The whole board is redrawn from scratch after every step.
   --------------------------------------------------------- */

// Fill one grid cell with a color.
// "inset" shrinks the square so there is a small gap between cells,
// which gives the LCD-pixel look.
function drawCell(cellX, cellY, color, inset) {
  const pixelX = cellX * CELL_SIZE + inset;
  const pixelY = cellY * CELL_SIZE + inset;
  const size = CELL_SIZE - inset * 2;

  ctx.fillStyle = color;
  ctx.fillRect(pixelX, pixelY, size, size);
}

function drawBackground() {
  // Plain screen color
  ctx.fillStyle = COLOR_SCREEN;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // A faint square in every cell, like the unlit pixels on an old LCD
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      drawCell(x, y, COLOR_PIXEL_DIM, 2);
    }
  }
}

function drawFood() {
  // A small square with a little "stem" on top, like an apple
  foods.forEach((food) => {
    drawCell(food.x, food.y, COLOR_PIXEL, 5);

    ctx.fillStyle = COLOR_PIXEL;
    ctx.fillRect(food.x * CELL_SIZE + 8, food.y * CELL_SIZE + 2, 4, 3);
  });
  
}

function drawSnake() {
  for (let i = 0; i < snake.length; i++) {
    const segment = snake[i];
    const isHead = (i === 0);

    // The head is drawn slightly bigger than the body
    const inset = isHead ? 1 : 2;
    drawCell(segment.x, segment.y, COLOR_PIXEL, inset);
  }

  drawEyes(snake[0]);
}

// Two small dots on the head, placed toward the direction the snake is facing
function drawEyes(head) {
  const direction = DIRECTIONS[currentDirection];

  // Center of the head cell, nudged 4px forward
  const centerX = head.x * CELL_SIZE + CELL_SIZE / 2 + direction.x * 4;
  const centerY = head.y * CELL_SIZE + CELL_SIZE / 2 + direction.y * 4;

  // Spread the eyes apart sideways.
  // Moving up/down → eyes sit left and right. Moving left/right → eyes sit above and below.
  const movingVertically = (direction.y !== 0);
  const spreadX = movingVertically ? 4 : 0;
  const spreadY = movingVertically ? 0 : 4;

  const eyeSize = 3;
  ctx.fillStyle = COLOR_SCREEN;
  ctx.fillRect(centerX - spreadX - eyeSize / 2, centerY - spreadY - eyeSize / 2, eyeSize, eyeSize);
  ctx.fillRect(centerX + spreadX - eyeSize / 2, centerY + spreadY - eyeSize / 2, eyeSize, eyeSize);
}

function drawGame() {
  drawBackground();
  drawFood();
  drawSnake();
}


/* ---------------------------------------------------------
   6. SNAKE MOVEMENT
   --------------------------------------------------------- */

// Put the snake back in the middle of the board, 3 cells long, facing right
function resetSnake() {
  const middle = Math.floor(GRID_SIZE / 2);

  snake = [
    { x: middle,     y: middle },   // head
    { x: middle - 1, y: middle },
    { x: middle - 2, y: middle },   // tail
  ];

  currentDirection = "right";
  pendingTurns = [];
}

function isOnSnake(x, y) {
  return snake.some(segment => segment.x === x && segment.y === y);
}

function isOnFood(x, y) {
  return foods.some(food => food.x === x && food.y === y);
}

function findFoodIndex(x, y){
  foods.forEach((food, index) => {
    if(food.x === x && food.y === y){
      return index;
    }
  });

  return null;
}

function placeFoods(){
  foods = [];
  const emptyCells = [];
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      if (!isOnSnake(x, y) && !isOnFood(x, y)) {
        emptyCells.push({ x: x, y: y });
      }
    }
  }

  for(let i = 0; i < numOfFoods; i++){
    if(emptyCells.length > 0){
      const randomIndex = Math.floor(Math.random() * emptyCells.length);
      foods.push(emptyCells[randomIndex]);
      emptyCells.splice(randomIndex, 1);
    }
    
  }
}
// Put food in a random empty cell
function placeFood() {
  // List every cell the snake isn't on...
  const emptyCells = [];
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      if (!isOnSnake(x, y) && !isOnFood(x, y)) {
        emptyCells.push({ x: x, y: y });
      }
    }
  }

  let snakeHead = snake[0];
  let eatenFoodIndex;
  // Find food that was eaten
  foods.forEach((food, index) => {
    if(food.x === snakeHead.x && food.y === snakeHead.y){
      eatenFoodIndex = index;
    }
  });


  if(emptyCells.length > 0){
    const randomIndex = Math.floor(Math.random() * emptyCells.length);
    foods[eatenFoodIndex].x = emptyCells[randomIndex].x;
    foods[eatenFoodIndex].y = emptyCells[randomIndex].y;
    
  }

}

// Called when the player presses a direction.
// The turn is queued and happens on the next step.
function queueTurn(newDirection) {
  // Ignore input unless the game is actually running.
  // This is what stops the player from moving during the countdown.
  if (gameState !== "playing") {
    return;
  }

  // Compare against the last queued turn, or the current direction if none are queued
  const lastDirection = pendingTurns.length > 0
    ? pendingTurns[pendingTurns.length - 1]
    : currentDirection;

  const isSameDirection = (newDirection === lastDirection);
  const isReverse = (newDirection === OPPOSITE_DIRECTION[lastDirection]);
  const queueIsFull = (pendingTurns.length >= 2);

  if (isSameDirection || isReverse || queueIsFull) {
    return;
  }

  pendingTurns.push(newDirection);
}

// One step of the game. Runs every stepDelayMs milliseconds while playing.
function step() {
  // 1. Use the next queued turn, if there is one
  if (pendingTurns.length > 0) {
    currentDirection = pendingTurns.shift();
  }

  // 2. Work out where the head will go next
  const direction = DIRECTIONS[currentDirection];
  const head = snake[0];
  const newHead = {
    x: head.x + direction.x,
    y: head.y + direction.y,
  };

  const willEat = foods.some(food => newHead.x === food.x && newHead.y === food.y);

  // 3. Check for crashes
  const hitWall =
    newHead.x < 0 ||
    newHead.y < 0 ||
    newHead.x >= GRID_SIZE ||
    newHead.y >= GRID_SIZE;

  // The tail moves out of the way this step unless we're eating,
  // so moving into the current tail cell is allowed when not eating.
  const bodyAfterMove = willEat ? snake : snake.slice(0, -1);
  const hitSelf = bodyAfterMove.some(segment => segment.x === newHead.x && segment.y === newHead.y);

  if (hitWall || hitSelf) {
    endGame();
    return;
  }

  // 4. Move: add the new head to the front
  snake.unshift(newHead);

  // 5. Either grow (eating) or remove the tail (normal move)
  if (willEat) {
    score += POINTS_PER_FOOD;
    updateScoreBar();

    // If the snake fills the whole board, the player has won
    if (snake.length === GRID_SIZE * GRID_SIZE) {
      endGame();
      return;
    }

    placeFood();
  } else {
    snake.pop();
  }

  // 6. Redraw
  drawGame();
}


/* ---------------------------------------------------------
   7. SWITCHING SCREENS
   Only one overlay is visible at a time. Pass null to hide them all
   (that's how the board shows while playing).
   --------------------------------------------------------- */

function showScreen(screenToShow) {
  const allScreens = [menuScreen, countdownScreen, pauseScreen, gameOverScreen];

  for (const screen of allScreens) {
    screen.hidden = (screen !== screenToShow);
  }
}


/* ---------------------------------------------------------
   8. STARTING, PAUSING AND ENDING THE GAME
   --------------------------------------------------------- */

function stopAllTimers() {
  clearInterval(gameLoopTimer);
  clearTimeout(countdownTimer);
  gameLoopTimer = null;
  countdownTimer = null;
}

function startGameLoop() {
  gameLoopTimer = setInterval(step, stepDelayMs);
}

// Put a fresh game on the board (used by the menu, Restart, and the countdown)
function setUpNewGame() {
  resetSnake();
  score = 0;
  placeFoods();
  updateScoreBar();
  drawGame();
}

// Shows 3, 2, 1, GO! and then starts the game.
// Used by both "Start game" and "Restart".
function startCountdown() {
  stopAllTimers();
  setUpNewGame();

  gameState = "countdown";
  showScreen(countdownScreen);

  const steps = ["3", "2", "1", "GO!"];
  let stepIndex = 0;

  function showNextCountdownStep() {
    // If the player left the countdown somehow, stop
    if (gameState !== "countdown") {
      return;
    }

    // Finished all the steps: hide the countdown and let the snake move
    if (stepIndex >= steps.length) {
      showScreen(null);
      gameState = "playing";
      startGameLoop();
      return;
    }

    countdownNumber.textContent = steps[stepIndex];
    restartPopAnimation();

    // Numbers stay up for 0.8s, "GO!" for 0.5s
    const isLastStep = (stepIndex === steps.length - 1);
    const delay = isLastStep ? 500 : 800;

    stepIndex++;
    countdownTimer = setTimeout(showNextCountdownStep, delay);
  }

  showNextCountdownStep();
}

// A CSS animation only plays once. To replay it for each new number,
// remove it, force the browser to notice (reading offsetWidth does this),
// then put it back.
function restartPopAnimation() {
  countdownNumber.style.animation = "none";
  void countdownNumber.offsetWidth;
  countdownNumber.style.animation = "";
}

function pauseGame() {
  if (gameState !== "playing") {
    return;
  }
  clearInterval(gameLoopTimer);
  gameState = "paused";
  showScreen(pauseScreen);
}

function resumeGame() {
  if (gameState !== "paused") {
    return;
  }
  showScreen(null);
  gameState = "playing";
  startGameLoop();
}

function togglePause() {
  if (gameState === "playing") {
    pauseGame();
  } else if (gameState === "paused") {
    resumeGame();
  }
}

function endGame() {
  stopAllTimers();
  gameState = "gameOver";

  // Save a new best score if this one beat it
  const isNewBest = (score > bestScore);
  if (isNewBest) {
    bestScore = score;
    saveBestScore(bestScore);
  }
  updateScoreBar();

  // Fill in the game over screen
  finalScoreText.textContent = score;
  finalLengthText.textContent = snake.length;
  finalBestText.textContent = bestScore;
  newBestMessage.hidden = !(isNewBest && score > 0);

  showScreen(gameOverScreen);
  restartButton.focus();   // so pressing Enter restarts right away
}

function goToMainMenu() {
  stopAllTimers();
  gameState = "menu";
  setUpNewGame();          // draws a snake behind the menu so the board isn't empty
  showScreen(menuScreen);
  startButton.focus();
}


/* ---------------------------------------------------------
   9. PLAYER INPUT
   --------------------------------------------------------- */

// --- Menu buttons ---

startButton.addEventListener("click", startCountdown);
restartButton.addEventListener("click", startCountdown);
mainMenuButton.addEventListener("click", goToMainMenu);


// --- Speed buttons ---

for (const button of speedButtons) {
  button.addEventListener("click", () => {
    stepDelayMs = Number(button.dataset.ms);

    // Mark only the clicked button as selected
    for (const otherButton of speedButtons) {
      const isSelected = (otherButton === button);
      otherButton.setAttribute("aria-pressed", String(isSelected));
    }
  });
}

// --- Food buttons ---
for (const button of foodButtons) {
  button.addEventListener("click", () => {
    numOfFoods = Number(button.dataset.food);

    // Mark only the clicked button as selected
    for (const otherButton of foodButtons) {
      const isSelected = (otherButton === button);
      otherButton.setAttribute("aria-pressed", String(isSelected));
    }
  });
}


// --- On-screen D-pad (touch screens) ---
// pointerdown instead of click so the turn happens the instant it's pressed

for (const button of dPadButtons) {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    queueTurn(button.dataset.direction);
  });
}


// --- Keyboard ---

document.addEventListener("keydown", (event) => {
  // Lower-case it so "W" and "w" both work
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

  // Steering
  if (key in KEY_TO_DIRECTION) {
    event.preventDefault();   // stop arrow keys from scrolling the page
    queueTurn(KEY_TO_DIRECTION[key]);
    return;
  }

  // Pause with P, or with Space while a game is running
  const isPauseKey = (key === "p") ||
    (key === " " && (gameState === "playing" || gameState === "paused"));
  if (isPauseKey) {
    event.preventDefault();
    togglePause();
    return;
  }

  // Enter starts the game from the menu.
  // (If a button has focus, Enter already clicks that button, so skip it.)
  const buttonHasFocus = document.activeElement && document.activeElement.tagName === "BUTTON";
  if (key === "Enter" && gameState === "menu" && !buttonHasFocus) {
    event.preventDefault();
    startCountdown();
    return;
  }

  // Escape goes back to the menu from the pause or game over screen
  if (key === "Escape" && (gameState === "paused" || gameState === "gameOver")) {
    goToMainMenu();
  }
});


// --- Swipe on touch screens ---

let touchStart = null;
const MIN_SWIPE_DISTANCE = 24;   // pixels; shorter movements count as a tap, not a swipe

screenElement.addEventListener("touchstart", (event) => {
  const touch = event.touches[0];
  touchStart = { x: touch.clientX, y: touch.clientY };
}, { passive: true });

// Stop the page from scrolling while swiping during a game
screenElement.addEventListener("touchmove", (event) => {
  if (gameState === "playing") {
    event.preventDefault();
  }
}, { passive: false });

screenElement.addEventListener("touchend", (event) => {
  if (!touchStart) {
    return;
  }

  const touch = event.changedTouches[0];
  const distanceX = touch.clientX - touchStart.x;
  const distanceY = touch.clientY - touchStart.y;
  touchStart = null;

  const longestDistance = Math.max(Math.abs(distanceX), Math.abs(distanceY));
  if (longestDistance < MIN_SWIPE_DISTANCE) {
    return;
  }

  // Whichever way the finger moved further decides the direction
  const swipedSideways = Math.abs(distanceX) > Math.abs(distanceY);
  if (swipedSideways) {
    queueTurn(distanceX > 0 ? "right" : "left");
  } else {
    queueTurn(distanceY > 0 ? "down" : "up");
  }
});


// --- Auto-pause when the player switches to another tab ---

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pauseGame();
  }
});


/* ---------------------------------------------------------
   10. START UP
   --------------------------------------------------------- */

bestScore = loadBestScore();
goToMainMenu();

// Redraw once the web fonts finish loading, in case they arrived late
if (document.fonts) {
  document.fonts.ready.then(drawGame);
}
