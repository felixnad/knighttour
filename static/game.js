const socket = io();
let isMyTurn = false;
let lastMove = null;
let currentBoard = null;
let boardSize = 8;
let timerInterval = null;
let timerStart = null;

// Log de connexion Socket.IO
socket.on('connect', () => {
    console.log('Connecté au serveur Socket.IO');
});

socket.on('disconnect', () => {
    console.log('Déconnecté du serveur Socket.IO');
});

// Éléments DOM
const createGameBtn = document.getElementById('create-game');
const boardSizeSelect = document.getElementById('board-size');
const gameBoard = document.getElementById('game-board');
const gameStatus = document.getElementById('game-status');
const boardContainer = document.getElementById('board-container');
const currentPlayerSpan = document.getElementById('current-player');
const undoBtn = document.getElementById('undo-move');
const timerSpan = document.getElementById('timer');
const themeToggleBtn = document.getElementById('theme-toggle');

// Nouvelle partie
createGameBtn.addEventListener('click', () => {
    boardSize = parseInt(boardSizeSelect.value);
    resetBoardDisplay();
    lastMove = null;
    isMyTurn = false;
    currentBoard = null;
    socket.emit('create_game', { size: boardSize });
    gameBoard.style.display = 'block';
    gameStatus.textContent = 'Création de la partie...';
    resetTimer();
    startTimer();
});

undoBtn.addEventListener('click', () => {
    socket.emit('undo_move');
});

function resetBoardDisplay() {
    boardContainer.innerHTML = '';
    for (let i = 0; i < boardSize; i++) {
        for (let j = 0; j < boardSize; j++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.row = i;
            cell.dataset.col = j;
            cell.addEventListener('click', () => {
                if (isMyTurn && cell.classList.contains('possible-move')) {
                    socket.emit('make_move', {
                        row: i,
                        col: j
                    });
                }
            });
            boardContainer.appendChild(cell);
        }
    }
}

function startTimer() {
    timerStart = Date.now();
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 1000);
    updateTimer();
}

function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
}

function resetTimer() {
    stopTimer();
    timerSpan.textContent = '00:00';
}

function updateTimer() {
    if (!timerStart) return;
    const elapsed = Math.floor((Date.now() - timerStart) / 1000);
    const min = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const sec = String(elapsed % 60).padStart(2, '0');
    timerSpan.textContent = `${min}:${sec}`;
}

// Événements Socket.IO
socket.on('game_created', (data) => {
    // On attend le board du serveur dans game_start
});

socket.on('game_start', (data) => {
    currentBoard = data.board;
    boardSize = data.size;
    renderBoard(boardSize);
    updateBoard(data.board);
    isMyTurn = true;
    resetTimer();
    startTimer();
});

socket.on('move_made', (data) => {
    currentBoard = data.board;
    updateBoard(data.board);
    isMyTurn = true;
});

socket.on('undo_done', (data) => {
    currentBoard = data.board;
    updateBoard(data.board);
    isMyTurn = true;
});

socket.on('error', (data) => {
    gameStatus.textContent = `Erreur: ${data.message}`;
});

function renderBoard(size) {
    boardContainer.innerHTML = '';
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.row = i;
            cell.dataset.col = j;
            cell.addEventListener('click', () => {
                if (isMyTurn && cell.classList.contains('possible-move')) {
                    socket.emit('make_move', {
                        row: i,
                        col: j
                    });
                }
            });
            boardContainer.appendChild(cell);
        }
    }
    boardContainer.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
}

function updateBoard(board) {
    let foundLast = false;
    let lastRow = null, lastCol = null;
    let filledCount = 0;
    const size = board.length;
    const totalCells = size * size;
    // Met à jour les cases
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const cell = boardContainer.querySelector(`.cell[data-row="${i}"][data-col="${j}"]`);
            if (!cell) continue;
            cell.textContent = board[i][j] || '';
            cell.className = 'cell';
            if (board[i][j]) {
                cell.classList.add('visited');
                filledCount++;
                if (!foundLast || board[i][j] > board[lastRow][lastCol]) {
                    lastRow = i;
                    lastCol = j;
                    foundLast = true;
                }
            }
        }
    }
    // Ajoute la classe last-move à la dernière case jouée et l'emoji cavalier (plus gros, sans le numéro, toujours noir)
    document.querySelectorAll('.cell.last-move').forEach(cell => cell.classList.remove('last-move'));
    if (foundLast) {
        const lastCell = boardContainer.querySelector(`.cell[data-row="${lastRow}"][data-col="${lastCol}"]`);
        if (lastCell) {
            lastCell.classList.add('last-move');
            lastCell.innerHTML = `<span style='font-size:2.5em;display:flex;align-items:center;justify-content:center;height:100%;width:100%;color:#101214;'>♞</span>`;
        }
    }
    // Calcul des coups possibles
    let possibleMoves = [];
    if (!foundLast) {
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                if (!board[i][j]) possibleMoves.push([i, j]);
            }
        }
    } else {
        possibleMoves = getKnightMoves(lastRow, lastCol, board);
    }
    possibleMoves.forEach(([i, j]) => {
        const cell = boardContainer.querySelector(`.cell[data-row="${i}"][data-col="${j}"]`);
        if (cell) cell.classList.add('possible-move');
    });
    lastMove = foundLast ? [lastRow, lastCol] : null;
    if (filledCount === totalCells) {
        gameStatus.textContent = 'Victoire';
        stopTimer();
    } else if (possibleMoves.length === 0 && filledCount !== 0) {
        gameStatus.textContent = 'Game Over';
    } else {
        gameStatus.textContent = 'Good Luck';
    }
}

function getKnightMoves(row, col, board) {
    const moves = [
        [2, 1], [1, 2], [-1, 2], [-2, 1],
        [-2, -1], [-1, -2], [1, -2], [2, -1]
    ];
    const result = [];
    const size = board.length;
    for (const [dr, dc] of moves) {
        const nr = row + dr, nc = col + dc;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size && !board[nr][nc]) {
            result.push([nr, nc]);
        }
    }
    return result;
}

// Thème sombre/clair
function setTheme(dark) {
    if (dark) {
        document.body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
        themeToggleBtn.textContent = '☀️';
    } else {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('theme', 'light');
        themeToggleBtn.textContent = '🌙';
    }
}

themeToggleBtn.addEventListener('click', () => {
    setTheme(!document.body.classList.contains('dark-mode'));
});

// Applique le thème au chargement
(function() {
    const saved = localStorage.getItem('theme');
    setTheme(saved === 'dark');
})(); 