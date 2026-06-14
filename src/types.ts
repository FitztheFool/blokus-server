import type { BlokusState } from './game';

export interface Player {
    userId: string;
    username: string;
    socketId: string | null;
    colorIndex: number;     // 0..numPlayers-1
}

export interface RoomState {
    phase: 'waiting' | 'playing' | 'finished';
    game: BlokusState;
    turnStartedAt: number | null;
    turnDuration: number;
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
