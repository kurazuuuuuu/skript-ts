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