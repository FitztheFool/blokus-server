import type { BlokusState } from './game';

export interface Player {
    userId: string;
    username: string;
    socketId: string | null;
    colorIndices: number[];     // couleurs contrôlées (standard : 1 ; duo : 2)
}

// 'duo' = 2 joueurs, 2 couleurs chacun (joueur 0 : couleurs 0+2 bleu+rouge ; joueur 1 : 1+3 jaune+vert).
export type Variant = 'standard' | 'duo';

export interface RoomState {
    phase: 'waiting' | 'playing' | 'finished';
    game: BlokusState;
    turnStartedAt: number | null;
    turnDuration: number;
    variant: Variant;
}

export interface Room {
    lobbyId: string;
    players: Player[];
    state: RoomState;
    turnTimer: ReturnType<typeof setTimeout> | null;
    currentGameId?: string;
    disconnectTimers: Map<string, ReturnType<typeof setTimeout>>;
    surrendered: Set<string>;   // userIds ayant abandonné
    afk: Set<string>;           // userIds inactifs (timeout/déco)
    log: { id: number; tone: string; text: string }[];
    logSeq: number;
}
