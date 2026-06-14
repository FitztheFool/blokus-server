// Règles de Blokus : placement (1ʳᵉ pièce sur son coin ; ensuite contact par coin de même couleur,
// jamais par côté), passe automatique, fin de partie, score (carrés posés + bonus).
import { PIECE_IDS, PIECE_ORIENTATIONS, PIECE_SIZE, TOTAL_SQUARES, Cell } from './pieces';

export const BOARD_SIZE = 20;
export const TURN_DURATION = 60;

export interface BlokusMove {
    pieceId: string;
    ori: number;     // index d'orientation
    x: number;       // origine
    y: number;
}

export interface BlokusState {
    board: number[][];          // -1 vide, sinon index joueur 0..n-1
    numPlayers: number;
    currentTurn: number;
    remaining: string[][];      // ids de pièces restantes par joueur
    placedAny: boolean[];
    passed: boolean[];
    lastWasMono: boolean[];
    status: 'playing' | 'finished';
    scores: number[];           // carrés posés par joueur (+bonus en fin)
}

// Coin de départ de chaque joueur.
const CORNERS: ReadonlyArray<readonly [number, number]> = [
    [0, 0], [BOARD_SIZE - 1, 0], [BOARD_SIZE - 1, BOARD_SIZE - 1], [0, BOARD_SIZE - 1],
];

const inBoard = (x: number, y: number) => x >= 0 && y >= 0 && x < BOARD_SIZE && y < BOARD_SIZE;
const EDGES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAGS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

export function initState(numPlayers: number): BlokusState {
    const n = Math.max(2, Math.min(4, numPlayers));
    return {
        board: Array.from({ length: BOARD_SIZE }, () => new Array(BOARD_SIZE).fill(-1)),
        numPlayers: n,
        currentTurn: 0,
        remaining: Array.from({ length: n }, () => [...PIECE_IDS]),
        placedAny: new Array(n).fill(false),
        passed: new Array(n).fill(false),
        lastWasMono: new Array(n).fill(false),
        status: 'playing',
        scores: new Array(n).fill(0),
    };
}

/** Cellules absolues d'un coup, ou null si pièce/orientation invalide. */
function moveCells(state: BlokusState, player: number, move: BlokusMove): Cell[] | null {
    if (!state.remaining[player]?.includes(move.pieceId)) return null;
    const oris = PIECE_ORIENTATIONS[move.pieceId];
    if (!oris || move.ori < 0 || move.ori >= oris.length) return null;
    return oris[move.ori].map(([cx, cy]) => [move.x + cx, move.y + cy] as Cell);
}

/** Le coup est-il légal pour `player` ? */
export function canPlace(state: BlokusState, player: number, move: BlokusMove): boolean {
    const cells = moveCells(state, player, move);
    if (!cells) return false;

    for (const [x, y] of cells) {
        if (!inBoard(x, y) || state.board[y][x] !== -1) return false;
        // jamais de contact par côté avec une de ses propres pièces
        for (const [dx, dy] of EDGES) {
            const nx = x + dx, ny = y + dy;
            if (inBoard(nx, ny) && state.board[ny][nx] === player) return false;
        }
    }

    if (!state.placedAny[player]) {
        // 1ʳᵉ pièce : doit couvrir le coin du joueur
        const [cx, cy] = CORNERS[player];
        return cells.some(([x, y]) => x === cx && y === cy);
    }

    // sinon : au moins un contact par coin avec une de ses pièces
    for (const [x, y] of cells) {
        for (const [dx, dy] of DIAGS) {
            const nx = x + dx, ny = y + dy;
            if (inBoard(nx, ny) && state.board[ny][nx] === player) return true;
        }
    }
    return false;
}

/** Applique un coup (mutation). Renvoie false si illégal. */
export function applyMove(state: BlokusState, move: BlokusMove): boolean {
    if (state.status !== 'playing') return false;
    const player = state.currentTurn;
    if (!canPlace(state, player, move)) return false;

    const cells = moveCells(state, player, move)!;
    for (const [x, y] of cells) state.board[y][x] = player;
    state.remaining[player] = state.remaining[player].filter(id => id !== move.pieceId);
    state.placedAny[player] = true;
    state.lastWasMono[player] = PIECE_SIZE[move.pieceId] === 1;
    state.scores[player] += cells.length;

    advanceTurn(state);
    return true;
}

/** Le joueur a-t-il au moins un coup légal ? (sortie anticipée) */
export function hasAnyMove(state: BlokusState, player: number): boolean {
    if (state.remaining[player].length === 0) return false;
    for (const pieceId of state.remaining[player]) {
        const oris = PIECE_ORIENTATIONS[pieceId];
        for (let ori = 0; ori < oris.length; ori++) {
            for (let y = 0; y < BOARD_SIZE; y++) {
                for (let x = 0; x < BOARD_SIZE; x++) {
                    if (canPlace(state, player, { pieceId, ori, x, y })) return true;
                }
            }
        }
    }
    return false;
}

/** Tous les coups légaux du joueur (pour le bot). */
export function legalMoves(state: BlokusState, player: number): BlokusMove[] {
    const out: BlokusMove[] = [];
    for (const pieceId of state.remaining[player]) {
        const oris = PIECE_ORIENTATIONS[pieceId];
        for (let ori = 0; ori < oris.length; ori++) {
            for (let y = 0; y < BOARD_SIZE; y++) {
                for (let x = 0; x < BOARD_SIZE; x++) {
                    const mv = { pieceId, ori, x, y };
                    if (canPlace(state, player, mv)) out.push(mv);
                }
            }
        }
    }
    return out;
}

/** Passe au prochain joueur capable de jouer ; termine la partie si plus personne ne peut. */
function advanceTurn(state: BlokusState): void {
    for (let step = 1; step <= state.numPlayers; step++) {
        const next = (state.currentTurn + step) % state.numPlayers;
        if (!state.passed[next] && hasAnyMove(state, next)) {
            state.currentTurn = next;
            return;
        }
        if (!state.passed[next]) state.passed[next] = true;
    }
    // personne ne peut jouer → fin
    finish(state);
}

function finish(state: BlokusState): void {
    state.status = 'finished';
    for (let p = 0; p < state.numPlayers; p++) {
        const remainingSquares = state.remaining[p].reduce((s, id) => s + PIECE_SIZE[id], 0);
        let score = TOTAL_SQUARES - remainingSquares;     // carrés posés
        if (remainingSquares === 0) score += 15;          // bonus : toutes les pièces posées
        if (remainingSquares === 0 && state.lastWasMono[p]) score += 5; // dernière = monomino
        state.scores[p] = score;
    }
}

/** Le joueur passe volontairement (ou est forcé). */
export function passTurn(state: BlokusState): void {
    if (state.status !== 'playing') return;
    state.passed[state.currentTurn] = true;
    advanceTurn(state);
}
