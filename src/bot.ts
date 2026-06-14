// Bot Blokus — pose la plus grosse pièce jouable (stratégie de base : placer les grandes tôt).
import { BOARD_SIZE, BlokusMove, BlokusState, canPlace } from './game';
import { PIECE_ORIENTATIONS, PIECE_SIZE } from './pieces';

export function pickBotMove(state: BlokusState, player: number): BlokusMove | null {
    const pieces = [...state.remaining[player]].sort((a, b) => PIECE_SIZE[b] - PIECE_SIZE[a]);
    for (const pieceId of pieces) {
        const oris = PIECE_ORIENTATIONS[pieceId];
        const moves: BlokusMove[] = [];
        for (let ori = 0; ori < oris.length; ori++) {
            for (let y = 0; y < BOARD_SIZE; y++) {
                for (let x = 0; x < BOARD_SIZE; x++) {
                    const mv = { pieceId, ori, x, y };
                    if (canPlace(state, player, mv)) moves.push(mv);
                }
            }
        }
        if (moves.length) return moves[Math.floor(Math.random() * moves.length)];
    }
    return null;
}
