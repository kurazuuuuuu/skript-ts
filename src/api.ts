import type { Expr, TextExpr, Cond, VariableExpr, Stmt, TopLevel, Script, CommandArgType, SourceLoc } from "./ast.js";
import { captureLoc } from "./loc.js";

/** Attach the TypeScript call-site location to a freshly built AST node. */
function withLoc<T extends Stmt | TopLevel>(node: T): T {
  const loc: SourceLoc | undefined = captureLoc();
  if (loc !== undefined) node.loc = loc;
  return node;
}

/** Construct a player expression. */
export function player(): Expr {
  return { kind: "player" };
}

/** Construct an event player expression. */
export function eventPlayer(): Expr {
  return { kind: "eventPlayer" };
}

/** Construct a loop player expression. */
export function loopPlayer(): Expr {
  return { kind: "loopPlayer" };
}

/** Construct a victim expression (the entity that died / was damaged, in death and damage events). */
export function victim(): Expr {
  return { kind: "victim" };
}

/** Construct an argument expression with a 1-based index. */
export function argument(index: number): Expr {
  if (!Number.isInteger(index) || index < 1) throw new RangeError("argument index must be a positive integer");
  return { kind: "argument", index };
}

/** Construct a chat message expression. */
export function chatMessage(): Expr {
  return { kind: "chatMessage" };
}

/** Construct a variable expression, optionally indexed. */
export function variable(name: string, index?: Expr): VariableExpr {
  if (index === undefined) return { kind: "variable", name };
  return { kind: "variable", name, index };
}

/** Construct a string literal expression. */
export function str(value: string): TextExpr {
  return { kind: "string", value };
}

/** Construct a number expression. */
export function num(value: number): Expr {
  return { kind: "number", value };
}

/** Construct a boolean expression. */
export function bool(value: boolean): Expr {
  return { kind: "boolean", value };
}

/** Construct an item expression. */
export function item(name: string): Expr {
  return { kind: "item", name };
}

/** Construct a location-of expression. */
export function locationOf(target: Expr): Expr {
  return { kind: "locationOf", target };
}

/** Construct a format expression from parts. */
export function fmt(...parts: (string | Expr)[]): TextExpr {
  return { kind: "format", parts };
}

/** Construct a has-permission condition. */
export function hasPermission(target: Expr, permission: string): Cond {
  return { kind: "hasPermission", target, permission };
}

/** Construct an is-op condition. */
export function isOp(target: Expr): Cond {
  return { kind: "isOp", target };
}

/** Construct a send statement. */
export function send(target: Expr, message: TextExpr): Stmt {
  return withLoc({ kind: "send", target, message });
}

/** Construct a broadcast statement. */
export function broadcast(message: TextExpr): Stmt {
  return withLoc({ kind: "broadcast", message });
}

/** Construct a give statement. */
export function give(target: Expr, itemName: string, amount: number): Stmt {
  return withLoc({ kind: "give", target, itemName, amount });
}

/** Construct a teleport statement. */
export function teleport(target: Expr, location: Expr): Stmt {
  return withLoc({ kind: "teleport", target, location });
}

/** Construct a set-variable statement. */
export function set(variable: VariableExpr, value: Expr): Stmt {
  return withLoc({ kind: "setVar", variable, value });
}

/** Construct an add-variable statement. */
export function add(variable: VariableExpr, value: Expr): Stmt {
  return withLoc({ kind: "addVar", variable, value });
}

/** Construct an if statement with optional else branch. */
export function ifElse(cond: Cond, then: readonly Stmt[], elseBody?: readonly Stmt[]): Stmt {
  if (elseBody === undefined) return withLoc({ kind: "if", cond, then });
  return withLoc({ kind: "if", cond, then, else: elseBody });
}

/** Construct a loop-players statement. */
export function loopPlayers(body: readonly Stmt[]): Stmt {
  return withLoc({ kind: "loopPlayers", body });
}

/** Construct an on-join event. */
export function onJoin(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "join", body });
}

/** Construct an on-first-join event. */
export function onFirstJoin(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "firstJoin", body });
}

/** Construct an on-quit event. */
export function onQuit(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "quit", body });
}

/** Construct an on-chat event. */
export function onChat(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "chat", body });
}

/** Construct an on-death event. */
export function onDeath(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "death", body });
}

/** Construct a command declaration with resolved optional-argument flag. */
export function command(name: string, argType: CommandArgType | null, body: readonly Stmt[], argOptional?: boolean): TopLevel {
  const resolved = argOptional === undefined ? argType !== null : argOptional;
  return withLoc({ kind: "command", name, argType, argOptional: resolved, body });
}

/** Construct a script from top-level declarations. */
export function script(...body: TopLevel[]): Script {
  return { kind: "script", body };
}

// ---------------------------------------------------------------------------
// Engine builtins (MundoSK slice, phase 6)
//
// These builders produce nodes the .sk emitter intentionally does not
// support: the features live in the skript-ts engine jar itself, not in
// a separate addon plugin and not in Skript text. A script using any of
// them is detected as engine-only at build time (see ir.ts) and is
// deployed as IR only.
// ---------------------------------------------------------------------------

function requireWsId(id: string): string {
  if (typeof id !== "string" || id.trim() === "") {
    throw new RangeError("websocket id must be a non-empty string");
  }
  return id;
}

/** Construct a websocket-connect statement (engine builtin). */
export function wsConnect(id: string, url: TextExpr): Stmt {
  return withLoc({ kind: "wsConnect", id: requireWsId(id), url });
}

/** Construct a websocket-send statement (engine builtin). */
export function wsSend(id: string, message: TextExpr): Stmt {
  return withLoc({ kind: "wsSend", id: requireWsId(id), message });
}

/** Construct a websocket-disconnect statement (engine builtin). */
export function wsDisconnect(id: string): Stmt {
  return withLoc({ kind: "wsDisconnect", id: requireWsId(id) });
}

/** Construct an on-websocket-open event (engine builtin). */
export function onWsOpen(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "wsOpen", body });
}

/** Construct an on-websocket-message event (engine builtin). */
export function onWsMessage(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "wsMessage", body });
}

/** Construct an on-websocket-close event (engine builtin). */
export function onWsClose(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "wsClose", body });
}

/** Construct a websocket-message expression: the text received, inside wsMessage events. */
export function wsMessage(): Expr {
  return { kind: "wsMessage" };
}

/** Construct a websocket-id expression: the connection id, inside websocket events. */
export function wsId(): Expr {
  return { kind: "wsId" };
}

/** Construct a world-of expression (engine builtin): the world of a player/location expression. */
export function worldOf(target: Expr): Expr {
  return { kind: "worldOf", target };
}

/** Construct a border-size expression (engine builtin): the current size of a world's border. */
export function borderSize(world: Expr): Expr {
  return { kind: "borderSize", world };
}

/** Construct a border-center expression (engine builtin): the center location of a world's border. */
export function borderCenter(world: Expr): Expr {
  return { kind: "borderCenter", world };
}

/** Construct a set-border-size statement (engine builtin). */
export function setBorderSize(world: Expr, size: Expr): Stmt {
  return withLoc({ kind: "setBorderSize", world, size });
}

/** Construct a set-border-center statement (engine builtin). */
export function setBorderCenter(world: Expr, center: Expr): Stmt {
  return withLoc({ kind: "setBorderCenter", world, center });
}

// ---------------------------------------------------------------------------
// Engine builtins (SharpSK slice, phase 7): named countdown timers
//
// Timers are SharpSK's headline standalone feature, reimplemented on
// the Bukkit scheduler. A timer is created with a name and a duration
// in seconds; the tick event fires every second while it runs (after
// the remaining time is decremented, while it is still above zero),
// and the complete event fires once when the countdown reaches zero,
// after which the timer no longer exists. Stopping removes a timer
// silently; pausing freezes it (still active, no ticks). Creating a
// timer whose name is already in use restarts it.
// ---------------------------------------------------------------------------

function requireTimerId(id: string): string {
  if (typeof id !== "string" || id.trim() === "") {
    throw new RangeError("timer id must be a non-empty string");
  }
  return id;
}

/** Construct a timer-create statement (engine builtin): start a named countdown of the given seconds. */
export function timerCreate(id: string, seconds: Expr): Stmt {
  return withLoc({ kind: "timerCreate", id: requireTimerId(id), seconds });
}

/** Construct a timer-stop statement (engine builtin): remove a timer without firing its complete event. */
export function timerStop(id: string): Stmt {
  return withLoc({ kind: "timerStop", id: requireTimerId(id) });
}

/** Construct a timer-pause statement (engine builtin): freeze a timer's countdown. */
export function timerPause(id: string): Stmt {
  return withLoc({ kind: "timerPause", id: requireTimerId(id) });
}

/** Construct a timer-resume statement (engine builtin): continue a paused timer. */
export function timerResume(id: string): Stmt {
  return withLoc({ kind: "timerResume", id: requireTimerId(id) });
}

/** Construct an on-timer-tick event (engine builtin): fires every second while a timer runs. */
export function onTimerTick(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "timerTick", body });
}

/** Construct an on-timer-complete event (engine builtin): fires once when a timer's countdown reaches zero. */
export function onTimerComplete(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "timerComplete", body });
}

/** Construct a timer-id expression: the name of the timer, inside timer events. */
export function timerId(): Expr {
  return { kind: "timerId" };
}

/** Construct a timer-time-left expression (engine builtin): seconds remaining on the named timer, or no value when it is not active. */
export function timerTimeLeft(name: Expr): Expr {
  return { kind: "timerTimeLeft", name };
}

/** Construct a timer-active condition (engine builtin): the named timer exists (running or paused). */
export function timerActive(name: TextExpr): Cond {
  return { kind: "timerActive", name };
}

// ---------------------------------------------------------------------------
// Engine builtins (skript-db slice, phase 8): SQL data sources
//
// A data source is a value: build one from a documented URL and keep
// it in a variable, as in `set(variable("sql"), dataSource(str(
// "sqlite:data.db")))`. Supported URL forms are "sqlite:<path>"
// (relative paths resolve under the engine's data folder),
// "mysql://host[:port]/db?user=..&password=..", "mariadb://..." and
// "postgresql://..."; credentials travel as query parameters.
//
// dbExecute runs one statement. The query is a text expression: its
// literal parts are the author's own SQL, and every expression part
// of a format is bound by the engine as a JDBC parameter — values
// are never inlined into the SQL text, so they cannot inject. With a
// store variable, a result set is mapped to entries
// <var>::<column>::<row> (rows are 1-based, previous entries are
// cleared first) and the variable itself is set to the row count;
// for a statement without a result set the variable receives the
// number of affected rows. Execution is synchronous on the calling
// thread; failures do not throw — read dbLastError() afterwards.
// ---------------------------------------------------------------------------

/** Construct a data-source expression (engine builtin) from a documented database URL. */
export function dataSource(url: TextExpr): Expr {
  return { kind: "dataSource", url };
}

/** Construct a database-execute statement (engine builtin): run one SQL statement, optionally storing its result. */
export function dbExecute(datasource: Expr, query: TextExpr, store?: VariableExpr): Stmt {
  if (store === undefined) return withLoc({ kind: "dbExecute", datasource, query });
  return withLoc({ kind: "dbExecute", datasource, query, store });
}

/** Construct a last-database-error expression (engine builtin): the last failed execution's message, or no value. */
export function dbLastError(): Expr {
  return { kind: "dbLastError" };
}

// ---------------------------------------------------------------------------
// Engine builtins (skUtilities slice, phase 9): the text file core
//
// skUtilities' flagship area is file operations; this slice covers
// the core of it as documented behavior — create / delete / write /
// append / read text files, count and pick lines, test existence —
// reimplemented clean-room from the documented behavior (the addon
// is GPL-3.0; no addon code was consulted).
//
// Paths are text expressions. Relative paths resolve under the
// engine's files root (plugins/skript-ts/files/); absolute paths
// and paths that escape the root after normalization are refused —
// statements do nothing, expressions yield no value, the condition
// is false. (The original addon is deliberately non-restrictive
// about paths; the confinement is an engine safety rule, recorded
// in the development log.)
//
// Semantics: fileCreate makes parent directories and an empty file
// and leaves an existing file's contents untouched; fileWrite
// replaces the whole file (UTF-8); fileAppend adds the text plus a
// newline; fileDelete removes a regular file or an *empty*
// directory (no recursive delete). fileContents returns the whole
// file as one string, fileLine is 1-based, fileLineCount counts
// lines (an empty file is 0); all three yield no value for a
// missing file. Failures never throw: they log a warning engine
// side and read as no-ops / no value.
// ---------------------------------------------------------------------------

/** Construct a file-create statement (engine builtin): create an empty file (and parents), leaving an existing file untouched. */
export function fileCreate(path: TextExpr): Stmt {
  return withLoc({ kind: "fileCreate", path });
}

/** Construct a directory-create statement (engine builtin): create a directory including parents. */
export function dirCreate(path: TextExpr): Stmt {
  return withLoc({ kind: "dirCreate", path });
}

/** Construct a file-delete statement (engine builtin): delete a regular file or an empty directory. */
export function fileDelete(path: TextExpr): Stmt {
  return withLoc({ kind: "fileDelete", path });
}

/** Construct a file-write statement (engine builtin): replace a file's whole contents with the text (UTF-8). */
export function fileWrite(path: TextExpr, text: TextExpr): Stmt {
  return withLoc({ kind: "fileWrite", path, text });
}

/** Construct a file-append statement (engine builtin): append the text plus a newline to a file, creating it if needed. */
export function fileAppend(path: TextExpr, text: TextExpr): Stmt {
  return withLoc({ kind: "fileAppend", path, text });
}

/** Construct a file-contents expression (engine builtin): the whole text of a file, or no value when it is missing. */
export function fileContents(path: TextExpr): Expr {
  return { kind: "fileContents", path };
}

/** Construct a file-line expression (engine builtin): the 1-based line of a file, or no value when out of range / missing. */
export function fileLine(path: TextExpr, line: Expr): Expr {
  return { kind: "fileLine", path, line };
}

/** Construct a file-line-count expression (engine builtin): the number of lines in a file, or no value when it is missing. */
export function fileLineCount(path: TextExpr): Expr {
  return { kind: "fileLineCount", path };
}

/** Construct a file-exists condition (engine builtin): a file or directory exists at the path. */
export function fileExists(path: TextExpr): Cond {
  return { kind: "fileExists", path };
}