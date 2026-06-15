import { Room, RoomState } from './types';
import { initState, TURN_DURATION } from './game';

export const rooms = new Map<string, Room>();

export function freshState(numPlayers: number): RoomState {
    return {
        phase: 'waiting',
        game: initState(numPlayers),
        turnStartedAt: null,
        turnDuration: TURN_DURATION,
    };
}

export function roomHasBot(room: Room): boolean {
    return room.players.some(p => p.userId.startsWith('bot-'));
}

export function clearTurnTimer(room: Room): void {
    if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }
}

export function startTurnTimer(room: Room, onTimeout: (room: Room) => void, resuming = false): void {
    clearTurnTimer(room);
    const dur = room.state.turnDuration ?? TURN_DURATION;
    if (!resuming) room.state.turnStartedAt = Date.now();
    if (dur <= 0) return;                              // 0 = pas de limite (jamais AFK)
    let delay = dur * 1000;
    if (resuming && room.state.turnStartedAt) {
        delay = Math.max(0, dur * 1000 - (Date.now() - room.state.turnStartedAt));
    }
    room.turnTimer = setTimeout(() => onTimeout(room), delay);
}
