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
  | { kind: "format"; parts: readonly (string | Expr)[] };

/** Represents a Skript text expression. */
export type TextExpr = Extract<Expr, { kind: "string" } | { kind: "format" }>;

/** Represents a Skript condition. */
export type Cond =
  | { kind: "hasPermission"; target: Expr; permission: string }
  | { kind: "isOp"; target: Expr };

/** Represents a Skript variable expression. */
export type VariableExpr = Extract<Expr, { kind: "variable" }>;

/** Represents a Skript statement. */
export type Stmt =
  | { kind: "send"; target: Expr; message: TextExpr }
  | { kind: "broadcast"; message: TextExpr }
  | { kind: "give"; target: Expr; itemName: string; amount: number }
  | { kind: "teleport"; target: Expr; location: Expr }
  | { kind: "setVar"; variable: VariableExpr; value: Expr }
  | { kind: "addVar"; variable: VariableExpr; value: Expr }
  | { kind: "if"; cond: Cond; then: readonly Stmt[]; else?: readonly Stmt[] }
  | { kind: "loopPlayers"; body: readonly Stmt[] };

/** Represents a Skript event kind. */
export type EventKind = "join" | "firstJoin" | "quit" | "chat" | "death";

/** Represents a Skript command argument type. */
export type CommandArgType = "text" | "player" | "integer";

/** Represents a Skript top-level declaration. */
export type TopLevel =
  | { kind: "event"; event: EventKind; body: readonly Stmt[] }
  | { kind: "command"; name: string; argType: CommandArgType | null; argOptional: boolean; body: readonly Stmt[] };

/** Represents a Skript script. */
export interface Script { kind: "script"; body: readonly TopLevel[] }