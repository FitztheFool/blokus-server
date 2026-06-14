// Les 21 polyominoes de Blokus (1 mono, 1 domino, 2 trominoes, 5 tetrominoes, 12 pentominoes).
// Chaque pièce = liste de cellules [x,y]. On génère les orientations uniques (4 rotations × 2 reflets).

export type Cell = [number, number];

// Formes de base (id stable).
export const BASE_PIECES: { id: string; cells: Cell[] }[] = [
    { id: 'mono', cells: [[0, 0]] },
    { id: 'domino', cells: [[0, 0], [1, 0]] },
    { id: 'tri_I', cells: [[0, 0], [1, 0], [2, 0]] },
    { id: 'tri_L', cells: [[0, 0], [1, 0], [1, 1]] },
    { id: 'tet_I', cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
    { id: 'tet_O', cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
    { id: 'tet_T', cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
    { id: 'tet_S', cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
    { id: 'tet_L', cells: [[0, 0], [0, 1], [0, 2], [1, 2]] },
    { id: 'pen_F', cells: [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]] },
    { id: 'pen_I', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },
    { id: 'pen_L', cells: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3]] },
    { id: 'pen_N', cells: [[1, 0], [1, 1], [0, 2], [1, 2], [0, 3]] },
    { id: 'pen_P', cells: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]] },
    { id: 'pen_T', cells: [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]] },
    { id: 'pen_U', cells: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]] },
    { id: 'pen_V', cells: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]] },
    { id: 'pen_W', cells: [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]] },
    { id: 'pen_X', cells: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]] },
    { id: 'pen_Y', cells: [[1, 0], [0, 1], [1, 1], [1, 2], [1, 3]] },
    { id: 'pen_Z', cells: [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2]] },
];

export const PIECE_IDS = BASE_PIECES.map(p => p.id);
export const PIECE_SIZE: Record<string, number> = Object.fromEntries(BASE_PIECES.map(p => [p.id, p.cells.length]));
/** Total de carrés d'un joueur (89). */
export const TOTAL_SQUARES = BASE_PIECES.reduce((s, p) => s + p.cells.length, 0);

function normalize(cells: Cell[]): Cell[] {
    const minX = Math.min(...cells.map(c => c[0]));
    const minY = Math.min(...cells.map(c => c[1]));
    return cells.map(([x, y]) => [x - minX, y - minY] as Cell)
        .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
const keyOf = (cells: Cell[]) => normalize(cells).map(c => c.join(',')).join('|');
const rotate = (cells: Cell[]): Cell[] => cells.map(([x, y]) => [y, -x] as Cell);
const reflect = (cells: Cell[]): Cell[] => cells.map(([x, y]) => [-x, y] as Cell);

/** Toutes les orientations uniques d'une pièce (déjà normalisées). */
export function orientations(cells: Cell[]): Cell[][] {
    const seen = new Map<string, Cell[]>();
    let cur = cells;
    for (let r = 0; r < 4; r++) {
        for (const variant of [cur, reflect(cur)]) {
            const n = normalize(variant);
            seen.set(keyOf(n), n);
        }
        cur = rotate(cur);
    }
    return [...seen.values()];
}

/** id -> orientations (précalculé). */
export const PIECE_ORIENTATIONS: Record<string, Cell[][]> = Object.fromEntries(
    BASE_PIECES.map(p => [p.id, orientations(p.cells)]),
);
