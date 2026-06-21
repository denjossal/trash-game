// @trash/shared — THE WIRE CONTRACT. Single source of truth for both server and client.
// A change here breaks compilation on @trash/server AND @trash/client until both update
// (verified by the type-level consumers each package holds). [Source: epics.md#Story-1.3]
//
// This file is type-only EXCEPT for the pure `IntentError` class. There is NO runtime schema
// validation here — the TypeScript types ARE the contract; runtime intent validation lives in
// server/src/rules/validate.ts (Epic 2). Do NOT add zod/valibot or any validation library.

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

/**
 * A playing card. `rank` is the integer 1..13 (Ace = 1, lowest; King = 13, highest).
 * Comparison is `<`/`>` on `rank` ONLY; `suit` is decorative and is NEVER compared.
 * The rank→letter map (1→A … 13→K) is client-only (client/src/lib/card-display.ts, Story 1.9)
 * and must never appear in shared/server/rules. [Source: architecture.md lines 550–551]
 */
export type Card = {
  rank: number; // integer 1..13
  suit: "♠" | "♥" | "♦" | "♣"; // decorative — never compared
};

// ---------------------------------------------------------------------------
// Phase — the 7 canonical phase values, named up front (Decision #2; Winston review)
// ---------------------------------------------------------------------------

// Canonical phase machine — guards in dispatch (Epic 2); each Host edge bumps phaseToken:
//   lobby      --deal-->        dealing -> turns         (Host; phaseToken)
//   turns      --(last seat acted)--> allActed           (server-internal, on final accepted turn — Story 2.6)
//   allActed   --revealAll-->   showdown                 (Host; phaseToken; rejected unless phase === "allActed")
//   showdown   --(resolution)-> roundResult | gameOver   (server-internal: >=2 alive -> roundResult; <=1 -> gameOver)
//   roundResult--dealAgain-->   dealing -> turns         (Host; phaseToken — Story 3.4)
//   gameOver   --newGame-->     lobby                    (Host "one more?"; phaseToken; same roster — Story 3.6)
//   (any live phase, on DO wake with round===null) --D2.1 coerce--> roundResult (bump phaseToken before first projection)
//
// `allActed` is a REAL Phase literal (the state the server enters when the one pass completes),
// NOT a derived predicate. Story 2.6 emits it; Story 3.2 consumes it. [Source: architecture.md lines 574–590]
export type Phase =
  | "lobby"
  | "dealing"
  | "turns"
  | "allActed"
  | "showdown"
  | "roundResult"
  | "gameOver";

// ---------------------------------------------------------------------------
// TableState — the authoritative, server-only state (NEVER sent to clients as-is)
// ---------------------------------------------------------------------------

export type Player = {
  id: string;
  name: string;
  lives: number;
  isAlive: boolean;
  isConnected: boolean;
  seatIndex: number; // seating order
};

/**
 * In-flight round state. MEMORY-ONLY — never persisted (survives only while the DO is awake).
 * `hands` and `deck` are SERVER-ONLY: never serialized to clients except the owner's own hand,
 * or all hands once `revealed === true` (at showdown). [Source: architecture.md lines 304–315]
 */
export type Round = {
  startingPlayerId: string;
  currentTurnId: string;
  turnToken: number;
  hands: Record<string, Card>; // playerId -> own card. SERVER-ONLY.
  deck: Card[]; // SERVER-ONLY.
  acted: string[]; // playerIds who have taken their turn this one-pass
  revealed: boolean; // true only after a valid revealAll
  /**
   * The playerId who JUST received a swapped Card on the most recent accepted swap (Story 2.4) —
   * the value-free squirm transient (AR-7). MEMORY-ONLY (part of `round`, never persisted), set by
   * applySwap and cleared on the next accepted turn action. The projector reads it to set the
   * per-device `you.justReceivedSwap` flag, which carries NO card data (SM-6). Optional/omit-when-absent.
   */
  lastSwapReceiverId?: string;
};

/**
 * The full authoritative table state. The PERSISTED summary (single ctx.storage["table"] key)
 * is the subset `{ code, phase, hostId, startingLives, players, phaseToken }`; `round` is
 * memory-only and is null between rounds / after a D2.1 reload coercion.
 * [Source: architecture.md lines 304–315; 1-1-spike-findings AC2/D2.1]
 */
export type TableState = {
  code: string;
  phase: Phase;
  hostId: string;
  startingLives: number;
  players: Player[];
  round: Round | null;
  phaseToken: number;
};

// ---------------------------------------------------------------------------
// ProjectedTableState — the ONLY thing a client ever receives (via projectStateFor, Story 1.4)
// ---------------------------------------------------------------------------

/**
 * The per-player projection. Server→client is a SINGLE `tableState` event carrying a COMPLETE
 * ProjectedTableState — never deltas/patches (there is intentionally no `patch`/`delta` field).
 * Transient beat signals (`justReceivedSwap`, `revealed`, `loserIds`, `winnerIds`) are value-free
 * fields ON this snapshot, not separate streams; there are NO continuous/animation server messages.
 *
 * Serialization (AR-7): `{ type, payload }` envelope, camelCase fields. Omit a key when ABSENT
 * (hence the optionals); never serialize null; `[]`/`false`/`0` are meaningful and always present.
 * `you.isLastPlayer`, `you.isAlive`/`isConnected`, and `winnerIds` are server-computed/value-free so
 * the client never recomputes turn-order, elimination, or win logic. [Source: architecture.md lines 592–628]
 */
export type ProjectedTableState = {
  code: string;
  phase: Phase;
  hostId: string;
  startingLives: number;
  you: {
    playerId: string;
    isHost: boolean;
    isAlive: boolean;
    isConnected: boolean;
    isLastPlayer: boolean;
    hand?: Card; // own card only
  };
  players: {
    id: string;
    name: string;
    lives: number;
    isAlive: boolean;
    isConnected: boolean;
    seatIndex: number;
    hand?: Card; // present only when revealed
  }[];
  currentTurnId?: string;
  turnToken?: number;
  phaseToken: number;
  revealed: boolean;
  loserIds?: string[];
  winnerIds?: string[];
  justReceivedSwap?: boolean;
};

// ---------------------------------------------------------------------------
// Intent — client→server messages (discriminated union on `type`)
// ---------------------------------------------------------------------------

/**
 * `dealAgain` = between-rounds re-deal (Story 3.4); `newGame` = a new game on the same Table
 * (Host "one more?", gameOver→lobby, Story 3.6). Both are named NOW so later stories extend a
 * contract the type already names rather than introducing an intent late. [Source: epics.md#Story-1.3
 * AC2 (Winston review); architecture.md lines 595–604]
 */
export type Intent =
  | { type: "createRoom"; payload: { name: string } }
  | { type: "joinRoom"; payload: { code: string; name: string; sessionToken?: string } }
  | { type: "deal" | "revealAll" | "dealAgain" | "newGame"; payload: { phaseToken: number } }
  | { type: "swap" | "keep" | "drawFromDeck"; payload: { turnToken: number } }
  | { type: "hostSetLives"; payload: { phaseToken: number; lives: number } }
  | { type: "hostRemovePlayer"; payload: { phaseToken: number; playerId: string } }
  | { type: "hostReassign"; payload: { phaseToken: number; playerId: string } };

// ---------------------------------------------------------------------------
// ServerEvent / ErrorReason — server→client messages
// ---------------------------------------------------------------------------

/**
 * Exactly two event literals. A third literal anywhere is a wire-contract violation (AR-7):
 * all game state flows through `tableState`; everything else is a targeted `error`.
 * [Source: architecture.md lines 606–608]
 */
export type ServerEvent =
  | { type: "tableState"; payload: ProjectedTableState }
  | { type: "error"; payload: { reason: ErrorReason } };

/** Typed error codes — never free-form strings. [Source: architecture.md lines 610–612] */
export type ErrorReason =
  | "stale-turn"
  | "stale-phase"
  | "not-your-turn"
  | "not-host"
  | "bad-code"
  | "room-full"
  | "phase-illegal";

/**
 * The error the rule engine throws and the dispatcher catches to emit a `{ type: "error" }` event.
 * PURE: it only carries a `reason` and sets the Error message — no Date/Math.random/crypto/IO,
 * so it is safe to import from the purity-gated server/src/rules/** tree. [Source: epics.md#Story-1.3;
 * architecture.md#rule-enforcement-table]
 */
export class IntentError extends Error {
  readonly reason: ErrorReason;

  constructor(reason: ErrorReason) {
    super(reason);
    this.name = "IntentError";
    this.reason = reason;
  }
}
