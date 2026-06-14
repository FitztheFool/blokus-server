import 'dotenv/config';
import { randomUUID } from 'crypto';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { setupSocketAuth, corsConfig, saveAttemptsAndEmit, connectToLobby } from '@kwizar/shared';

import { Room, Player } from './types';
import { applyMove, passTurn, hasAnyMove, BlokusMove, BlokusState } from './game';
import { PIECE_SIZE } from './pieces';
import { pickBotMove } from './bot';
import { rooms, freshState, roomHasBot, clearTurnTimer, startTurnTimer } from './rooms';

const app = express();
app.get('/health', (_req, res) => { res.set('Access-Control-Allow-Origin', '*'); res.status(200).send('ok'); });

const server = http.createServer(app);
const io = new Server(server, { cors: corsConfig, maxHttpBufferSize: 1e6 });

const isBot = (p: Player) => p.userId.startsWith('bot-');

// ─── Vue publique ────────────────────────────────────────────────────────────────

function publicState(room: Room) {
    const g: BlokusState = room.state.game;
    return {
        phase: room.state.phase,
        board: g.board,
        currentTurn: g.currentTurn,
        remaining: g.remaining,
        placedAny: g.placedAny,
        passed: g.passed,
        scores: g.scores,
        status: g.status,
        turnStartedAt: room.state.turnStartedAt,
        turnDuration: room.state.turnDuration,
        log: room.log,
        players: room.players.map(p => ({ userId: p.userId, username: p.username, colorIndex: p.colorIndex })),
    };
}

function emitState(room: Room): void {
    io.to(room.lobbyId).emit('blokus:state', publicState(room));
}

/** Classement final par score décroissant → placement 1..n. */
function finishGame(room: Room): void {
    const g = room.state.game;
    room.state.phase = 'finished';
    room.state.turnStartedAt = null;
    clearTurnTimer(room);

    const ranked = room.players
        .map(p => ({ p, score: g.scores[p.colorIndex] }))
        .sort((a, b) => b.score - a.score);

    if (ranked[0]) pushLog(room, 'coup', `${ranked[0].p.username} gagne avec ${ranked[0].score} cases !`);
    emitState(room);
    io.to(room.lobbyId).emit('blokus:finished', publicState(room));

    const scores = ranked.map(({ p, score }) => {
        const placement = 1 + ranked.filter(r => r.score > score).length; // ex-aequo = même rang
        return {
            userId: p.userId,
            username: p.username,
            score,
            placement,
            ...(room.surrendered.has(p.userId) ? { abandon: true } : {}),
            ...(room.afk.has(p.userId) ? { afk: true } : {}),
        };
    });

    saveAttemptsAndEmit(io, room.lobbyId, 'BLOKUS', room.currentGameId ?? room.lobbyId, scores, roomHasBot(room));
}

/** Tour expiré → le joueur actif passe (forfait des coups restants). */
function onTurnTimeout(room: Room): void {
    if (room.state.phase !== 'playing') return;
    const cur = room.players[room.state.game.currentTurn];
    if (cur) room.afk.add(cur.userId);
    passTurn(room.state.game);
    afterTurn(room);
}

/** Après un coup/passe : fin de partie ou tour suivant (+ bot). */
function afterTurn(room: Room): void {
    if (room.state.game.status === 'finished') { finishGame(room); return; }
    startTurnTimer(room, onTurnTimeout);
    emitState(room);
    maybeBotMove(room);
}

function maybeBotMove(room: Room): void {
    if (room.state.phase !== 'playing') return;
    const turn = room.state.game.currentTurn;
    const p = room.players[turn];
    if (!p || !isBot(p)) return;
    setTimeout(() => {
        if (room.state.phase !== 'playing' || room.state.game.currentTurn !== turn) return;
        const mv = pickBotMove(room.state.game, turn);
        if (mv) { clearTurnTimer(room); applyMove(room.state.game, mv); }
        else passTurn(room.state.game);
        afterTurn(room);
    }, 700);
}

function pushLog(room: Room, tone: string, text: string): void {
    room.log.push({ id: ++room.logSeq, tone, text });
    if (room.log.length > 80) room.log = room.log.slice(-80);
}

function handleMove(room: Room, colorIndex: number, move: BlokusMove): void {
    const g = room.state.game;
    if (room.state.phase !== 'playing' || g.currentTurn !== colorIndex) return;
    clearTurnTimer(room);
    if (!applyMove(g, move)) {            // coup illégal → on relance le tour
        startTurnTimer(room, onTurnTimeout, true);
        emitState(room);
        return;
    }
    const name = room.players[colorIndex]?.username ?? `J${colorIndex + 1}`;
    pushLog(room, 'move', `${name} pose une pièce de ${PIECE_SIZE[move.pieceId]} case${PIECE_SIZE[move.pieceId] > 1 ? 's' : ''}`);
    afterTurn(room);
}

// ─── Démarrage / configure ────────────────────────────────────────────────────────

setupSocketAuth(io, new TextEncoder().encode((process.env.SOCKET_USER_SECRET ?? process.env.INTERNAL_API_KEY)!));

const lobbySocket = connectToLobby('blokus-server', 'blokus');

lobbySocket.on('blokus:configure', ({ lobbyId, players, fresh }: { lobbyId: string; players?: { userId: string; username: string }[]; fresh?: boolean }, ack?: () => void) => {
    if (!lobbyId || !players?.length) return;
    const existing = rooms.get(lobbyId);
    if (existing && existing.state.phase !== 'finished' && !fresh) { if (typeof ack === 'function') ack(); return; }
    if (existing?.turnTimer) clearTimeout(existing.turnTimer);

    const roster: Player[] = players.slice(0, 4).map((p, i) => ({
        userId: p.userId, username: p.username, socketId: null, colorIndex: i,
    }));
    rooms.set(lobbyId, {
        lobbyId, players: roster, state: freshState(roster.length),
        turnTimer: null, currentGameId: randomUUID(),
        disconnectTimers: new Map(), surrendered: new Set(), afk: new Set(), log: [], logSeq: 0,
    });
    maybeStart(rooms.get(lobbyId)!);
    if (typeof ack === 'function') ack();
});

/** Démarre dès que tous les humains sont connectés. */
function maybeStart(room: Room): void {
    if (room.state.phase !== 'waiting') return;
    const humansConnected = room.players.filter(p => !isBot(p)).every(p => p.socketId !== null);
    if (!humansConnected) return;
    room.state.phase = 'playing';
    startTurnTimer(room, onTurnTimeout);
    emitState(room);
    maybeBotMove(room);
}

// ─── Socket events ──────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
    socket.on('blokus:join', ({ lobbyId }: { lobbyId: string }) => {
        const { userId } = socket.data;
        socket.data.lobbyId = lobbyId;
        socket.join(lobbyId);

        const room = rooms.get(lobbyId);
        if (!room) { socket.emit('notFound'); return; }
        const player = room.players.find(p => p.userId === userId);
        if (!player) { socket.emit('blokus:error', { message: 'Player not in this game' }); return; }

        player.socketId = socket.id;
        const t = room.disconnectTimers.get(userId);
        if (t) { clearTimeout(t); room.disconnectTimers.delete(userId); io.to(lobbyId).emit('blokus:playerReconnected', { userId }); }

        maybeStart(room);
        emitState(room);
    });

    socket.on('blokus:move', (move: BlokusMove) => {
        const { lobbyId, userId } = socket.data ?? {};
        if (!lobbyId || !userId || !move || typeof move.pieceId !== 'string') return;
        const room = rooms.get(lobbyId);
        if (!room) return;
        const player = room.players.find(p => p.userId === userId);
        if (!player) return;
        handleMove(room, player.colorIndex, move);
    });

    socket.on('blokus:pass', () => {
        const { lobbyId, userId } = socket.data ?? {};
        if (!lobbyId || !userId) return;
        const room = rooms.get(lobbyId);
        if (!room || room.state.phase !== 'playing') return;
        const player = room.players.find(p => p.userId === userId);
        if (!player || room.state.game.currentTurn !== player.colorIndex) return;
        clearTurnTimer(room);
        pushLog(room, 'system', `${player.username} passe`);
        passTurn(room.state.game);
        afterTurn(room);
    });

    socket.on('blokus:surrender', () => {
        const { lobbyId, userId } = socket.data ?? {};
        if (!lobbyId || !userId) return;
        const room = rooms.get(lobbyId);
        if (!room || room.state.phase !== 'playing') return;
        const player = room.players.find(p => p.userId === userId);
        if (!player) return;
        room.surrendered.add(userId);
        const g = room.state.game;
        g.passed[player.colorIndex] = true;
        // si c'était son tour, on avance ; sinon il sera sauté à son prochain tour
        if (g.currentTurn === player.colorIndex) { clearTurnTimer(room); passTurn(g); afterTurn(room); }
        else if (!room.players.some(p => !g.passed[p.colorIndex] && hasAnyMove(g, p.colorIndex))) finishGame(room);
        else emitState(room);
    });

    socket.on('disconnect', () => {
        const { lobbyId, userId } = socket.data ?? {};
        if (!lobbyId || !userId) return;
        const room = rooms.get(lobbyId);
        if (!room) return;
        const player = room.players.find(p => p.userId === userId);
        if (!player || player.socketId !== socket.id) return;
        player.socketId = null;

        if (room.state.phase === 'playing') {
            io.to(lobbyId).emit('blokus:inactivityWarning', { userId, username: player.username, secondsLeft: 60 });
            const existing = room.disconnectTimers.get(userId);
            if (existing) clearTimeout(existing);
            const timer = setTimeout(() => {
                room.disconnectTimers.delete(userId);
                if (room.state.phase !== 'playing') return;
                const g = room.state.game;
                room.afk.add(userId);
                g.passed[player.colorIndex] = true;
                io.to(lobbyId).emit('blokus:playerKicked', { userId, username: player.username, reason: 'disconnect' });
                if (g.currentTurn === player.colorIndex) { clearTurnTimer(room); passTurn(g); afterTurn(room); }
                else if (!room.players.some(p => !g.passed[p.colorIndex] && hasAnyMove(g, p.colorIndex))) finishGame(room);
                else emitState(room);
            }, 60_000);
            room.disconnectTimers.set(userId, timer);
        } else if (room.players.every(p => p.socketId === null)) {
            clearTurnTimer(room);
            rooms.delete(lobbyId);
        }
    });
});

const PORT = process.env.PORT ?? 10018;
server.listen(PORT, () => console.log('[BLOKUS] listening on port', PORT));

const shutdown = () => {
    io.close(() => server.close(() => process.exit(0)));
    setTimeout(() => process.exit(1), 3000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
