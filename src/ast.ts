/** Represents a Skript expression value. */
export type Expr =
  | { kind: "player" }
  | { kind: "eventPlayer" }
  | { kind: "loopPlayer" }
  | { kind: "victim" }
  | { kind: "argument"; index: number }
  | { kind: "chatMessage" }
  | { kind: "variable"; name: string; index?: Expr }
  // Core-language list support (phase 12): the whole list {name::*}
  // as a value (its entries in iteration order), and its size.
  | { kind: "variableList"; name: string }
  | { kind: "listSize"; list: ListExpr }
  // Loop expressions (phase 12): the element a list loop is
  // visiting (in times/range loops, the current number; in player
  // loops, the player), and the index of a list loop (a number or
  // a text). loopIndex has no value outside list loops — Skript
  // rejects it there at parse time.
  | { kind: "loopValue" }
  | { kind: "loopIndex" }
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
  | { kind: "timerTimeLeft"; name: Expr }
  // Engine-builtin expressions (skript-db slice, phase 8): a data
  // source value parsed from a documented URL (sqlite:<path>,
  // mysql://..., mariadb://..., postgresql://...), and the message
  // of the last failed database execution.
  | { kind: "dataSource"; url: TextExpr }
  | { kind: "dbLastError" }
  // Engine-builtin expressions (skUtilities slice, phase 9): reads
  // from text files under the engine's files root. All three yield
  // no value when the file is missing.
  | { kind: "fileContents"; path: TextExpr }
  | { kind: "fileLine"; path: TextExpr; line: Expr }
  | { kind: "fileLineCount"; path: TextExpr }
  // Engine-builtin expressions (Ersatz slice, phase 10):
  // placeholderValue evaluates PlaceholderAPI placeholders in a
  // text for a player (a text without %...% is a single placeholder
  // name). placeholderIdentifier / placeholderPrefix expose the
  // parts of the request inside placeholder-request events.
  | { kind: "placeholderValue"; player: Expr; text: TextExpr }
  | { kind: "placeholderIdentifier" }
  | { kind: "placeholderPrefix" }
  // Core-language arithmetic (phase 11): a binary operation over two
  // expressions. "+" also concatenates when both operands are texts;
  // "mod" is the mathematical remainder (Skript's mod() function).
  | { kind: "arith"; op: ArithOp; left: Expr; right: Expr };

/** Represents a binary arithmetic operator. */
export type ArithOp = "+" | "-" | "*" | "/" | "mod";

/** Represents a Skript text expression. */
export type TextExpr = Extract<Expr, { kind: "string" } | { kind: "format" }>;

/** Represents a Skript condition. */
export type Cond =
  | { kind: "hasPermission"; target: Expr; permission: string }
  | { kind: "isOp"; target: Expr }
  // Core-language comparisons and logic (phase 11). The comparison
  // kinds mirror Skript's compare condition: text equality is
  // case-insensitive, values of different types are never equal,
  // and only numbers can be ordered. and/or are binary (the API
  // folds longer chains); not wraps any condition.
  | { kind: "equals"; left: Expr; right: Expr }
  | { kind: "notEquals"; left: Expr; right: Expr }
  | { kind: "greaterThan"; left: Expr; right: Expr }
  | { kind: "greaterOrEqual"; left: Expr; right: Expr }
  | { kind: "lessThan"; left: Expr; right: Expr }
  | { kind: "lessOrEqual"; left: Expr; right: Expr }
  | { kind: "and"; left: Cond; right: Cond }
  | { kind: "or"; left: Cond; right: Cond }
  | { kind: "not"; cond: Cond }
  // Engine-builtin condition (SharpSK slice, phase 7): a named timer exists.
  | { kind: "timerActive"; name: TextExpr }
  // Engine-builtin condition (skUtilities slice, phase 9): a file or
  // directory exists under the engine's files root.
  | { kind: "fileExists"; path: TextExpr };

/** Represents a Skript variable expression. */
export type VariableExpr = Extract<Expr, { kind: "variable" }>;

/** Represents a whole-list variable expression ({name::*}). */
export type ListExpr = Extract<Expr, { kind: "variableList" }>;

/** Represents a wait duration unit (phase 12). */
export type TimeUnit = "ticks" | "seconds" | "minutes";

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
  // Core-language list statements and control flow (phase 12).
  // listAdd appends at the smallest unused positive integer index;
  // listRemove deletes the first matching entry (in iteration
  // order); deleteVar removes a variable, one list entry, or a
  // whole list; the loops expose loopValue (and list loops also
  // loopIndex); while accepts leaf conditions only (the builder
  // enforces it — a while head has no control-flow lowering);
  // wait suspends the rest of the trigger for the duration.
  | { kind: "listAdd"; list: ListExpr; value: Expr; loc?: SourceLoc }
  | { kind: "listRemove"; list: ListExpr; value: Expr; loc?: SourceLoc }
  | { kind: "deleteVar"; target: VariableExpr | ListExpr; loc?: SourceLoc }
  | { kind: "loopList"; list: ListExpr; body: readonly Stmt[]; loc?: SourceLoc }
  | { kind: "loopTimes"; count: Expr; body: readonly Stmt[]; loc?: SourceLoc }
  | { kind: "loopRange"; from: Expr; to: Expr; body: readonly Stmt[]; loc?: SourceLoc }
  | { kind: "while"; cond: Cond; body: readonly Stmt[]; loc?: SourceLoc }
  | { kind: "wait"; amount: Expr; unit: TimeUnit; loc?: SourceLoc }
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
  | { kind: "timerResume"; id: string; loc?: SourceLoc }
  // Engine-builtin statement (skript-db slice, phase 8): execute one
  // SQL statement on a data source. The query is a text expression;
  // its expression parts are bound as statement parameters by the
  // engine, never inlined. When `store` is given, a result set is
  // mapped to <store>::<column>::<row> entries (and <store> itself
  // becomes the row count); otherwise the variable receives the
  // number of affected rows.
  | { kind: "dbExecute"; datasource: Expr; query: TextExpr; store?: VariableExpr; loc?: SourceLoc }
  // Engine-builtin statements (skUtilities slice, phase 9): the text
  // file core. Paths are text expressions resolved by the engine
  // under its files root; escaping paths are refused.
  | { kind: "fileCreate"; path: TextExpr; loc?: SourceLoc }
  | { kind: "dirCreate"; path: TextExpr; loc?: SourceLoc }
  | { kind: "fileDelete"; path: TextExpr; loc?: SourceLoc }
  | { kind: "fileWrite"; path: TextExpr; text: TextExpr; loc?: SourceLoc }
  | { kind: "fileAppend"; path: TextExpr; text: TextExpr; loc?: SourceLoc }
  // Engine-builtin statement (Ersatz slice, phase 10): set the
  // answer string for the placeholder request being handled. Only
  // meaningful inside an onPlaceholderRequest body; a request whose
  // handler never sets a result resolves to no value.
  | { kind: "setPlaceholderResult"; text: TextExpr; loc?: SourceLoc };

/** Represents a Skript event kind. The ws* kinds are engine-builtin events (phase 6), the timer* kinds are phase 7, papiRequest is phase 10. */
export type EventKind =
  | "join" | "firstJoin" | "quit" | "chat" | "death"
  | "wsOpen" | "wsMessage" | "wsClose"
  | "timerTick" | "timerComplete"
  | "papiRequest";

/** Represents a Skript command argument type. */
export type CommandArgType = "text" | "player" | "integer";

/** Represents a Skript top-level declaration. */
export type TopLevel =
  // `prefixes` is set only for the papiRequest event (phase 10): the
  // PlaceholderAPI expansion identifiers this handler serves.
  | { kind: "event"; event: EventKind; body: readonly Stmt[]; prefixes?: readonly string[]; loc?: SourceLoc }
  | { kind: "command"; name: string; argType: CommandArgType | null; argOptional: boolean; body: readonly Stmt[]; loc?: SourceLoc };

/** Represents a Skript script. */
export interface Script { kind: "script"; body: readonly TopLevel[] }