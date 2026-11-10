/** Represents a Skript expression value. */
export type Expr =
  | { kind: "player" }
  | { kind: "eventPlayer" }
  | { kind: "loopPlayer" }
  | { kind: "victim" }
  | { kind: "argument"; index: number }
  | { kind: "chatMessage" }
  | { kind: "variable"; name: string; index?: Expr }
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "item"; name: string }
  | { kind: "locationOf"; target: Expr }
  | { kind: "format"; parts: readonly (string | Expr)[] }
  // Engine-builtin expressions (MundoSK slice, phase 6). These have no
  // .sk equivalent: scripts using them are engine-only (see ir.ts).
  | { kind: "wsMessage" }
  | { kind: "wsId" }
  | { kind: "worldOf"; target: Expr }
  | { kind: "borderSize"; world: Expr }
  | { kind: "borderCenter"; world: Expr }
  // Engine-builtin expressions (SharpSK slice, phase 7): timers.
  | { kind: "timerId" }
  | { kind: "timerTimeLeft"; name: Expr };

/** Represents a Skript text expression. */
export type TextExpr = Extract<Expr, { kind: "string" } | { kind: "format" }>;

/** Represents a Skript condition. */
export type Cond =
  | { kind: "hasPermission"; target: Expr; permission: string }
  | { kind: "isOp"; target: Expr }
  // Engine-builtin condition (SharpSK slice, phase 7): a named timer exists.
  | { kind: "timerActive"; name: TextExpr };

/** Represents a Skript variable expression. */
export type VariableExpr = Extract<Expr, { kind: "variable" }>;

/** Source position in the TypeScript file where a builder call was made. */
export interface SourceLoc { file: string; line: number; column: number }

/** Represents a Skript statement. */
export type Stmt =
  | { kind: "send"; target: Expr; message: TextExpr; loc?: SourceLoc }
  | { kind: "broadcast"; message: TextExpr; loc?: SourceLoc }
  | { kind: "give"; target: Expr; itemName: string; amount: number; loc?: SourceLoc }
  | { kind: "teleport"; target: Expr; location: Expr; loc?: SourceLoc }
  | { kind: "setVar"; variable: VariableExpr; value: Expr; loc?: SourceLoc }
  | { kind: "addVar"; variable: VariableExpr; value: Expr; loc?: SourceLoc }
  | { kind: "if"; cond: Cond; then: readonly Stmt[]; else?: readonly Stmt[]; loc?: SourceLoc }
  | { kind: "loopPlayers"; body: readonly Stmt[]; loc?: SourceLoc }
  // Engine-builtin statements (MundoSK slice, phase 6): no .sk equivalent.
  | { kind: "wsConnect"; id: string; url: TextExpr; loc?: SourceLoc }
  | { kind: "wsSend"; id: string; message: TextExpr; loc?: SourceLoc }
  | { kind: "wsDisconnect"; id: string; loc?: SourceLoc }
  | { kind: "setBorderSize"; world: Expr; size: Expr; loc?: SourceLoc }
  | { kind: "setBorderCenter"; world: Expr; center: Expr; loc?: SourceLoc }
  // Engine-builtin statements (SharpSK slice, phase 7): named countdown timers.
  | { kind: "timerCreate"; id: string; seconds: Expr; loc?: SourceLoc }
  | { kind: "timerStop"; id: string; loc?: SourceLoc }
  | { kind: "timerPause"; id: string; loc?: SourceLoc }
  | { kind: "timerResume"; id: string; loc?: SourceLoc };

/** Represents a Skript event kind. The ws* kinds are engine-builtin events (phase 6), the timer* kinds are phase 7. */
export type EventKind =
  | "join" | "firstJoin" | "quit" | "chat" | "death"
  | "wsOpen" | "wsMessage" | "wsClose"
  | "timerTick" | "timerComplete";

/** Represents a Skript command argument type. */
export type CommandArgType = "text" | "player" | "integer";

/** Represents a Skript top-level declaration. */
export type TopLevel =
  | { kind: "event"; event: EventKind; body: readonly Stmt[]; loc?: SourceLoc }
  | { kind: "command"; name: string; argType: CommandArgType | null; argOptional: boolean; body: readonly Stmt[]; loc?: SourceLoc };

/** Represents a Skript script. */
export interface Script { kind: "script"; body: readonly TopLevel[] }