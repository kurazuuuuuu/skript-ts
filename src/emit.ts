import type { Cond, Expr, Script, SourceLoc, Stmt, TextExpr, TopLevel, VariableExpr } from "./ast.js";
import type { LineMapping } from "./source-map.js";

function escapeText(s: string): string {
    return s.replace(/"/g, '""').replace(/%/g, "%%");
}

function emitValue(e: Expr): string {
    switch (e.kind) {
        case "player":
            return "player";
        case "eventPlayer":
            return "event-player";
        case "loopPlayer":
            return "loop-player";
        case "victim":
            return "victim";
        case "argument":
            return `arg-${e.index}`;
        case "chatMessage":
            return "message";
        case "variable":
            return `{${e.name}${e.index !== undefined ? `::%${emitValue(e.index)}%` : ""}}`;
        case "string":
            return `"${escapeText(e.value)}"`;
        case "number":
            return String(e.value);
        case "boolean":
            return e.value ? "true" : "false";
        case "item":
            return e.name;
        case "locationOf":
            return `location of ${emitValue(e.target)}`;
        case "arith":
            // Arithmetic is always parenthesized so the emitted tree
            // means the same thing regardless of Skript's own
            // operator precedence; mod is Skript's mod() function
            // (Skript has no infix remainder operator).
            return e.op === "mod"
                ? `mod(${emitValue(e.left)}, ${emitValue(e.right)})`
                : `(${emitValue(e.left)} ${e.op} ${emitValue(e.right)})`;
        case "format":
            return `"${emitStringParts(e.parts)}"`;
        case "wsMessage":
        case "wsId":
        case "worldOf":
        case "borderSize":
        case "borderCenter":
        case "timerId":
        case "timerTimeLeft":
        case "dataSource":
        case "dbLastError":
        case "fileContents":
        case "fileLine":
        case "fileLineCount":
        case "placeholderValue":
        case "placeholderIdentifier":
        case "placeholderPrefix":
            // Engine-builtin expressions (phases 6-10) exist only in
            // the engine jar; there is no Skript text form to emit.
            throw new Error(`Unhandled Expr in emitValue: '${e.kind}' is an engine-only builtin with no .sk form`);
        default: {
            const exhaustive: never = e;
            void exhaustive;
            throw new Error("Unhandled Expr in emitValue");
        }
    }
}

function emitString(e: Expr): string {
    switch (e.kind) {
        case "player":
            return "%player%";
        case "eventPlayer":
            return "%event-player%";
        case "loopPlayer":
            return "%loop-player%";
        case "victim":
            return "%victim%";
        case "argument":
            return `%arg-${e.index}%`;
        case "chatMessage":
            return "%message%";
        case "variable":
            // Inside a string, a variable must be %-wrapped to interpolate
            // its value; a bare {..} would be literal text in Skript.
            return `%${emitValue(e)}%`;
        case "string":
            return escapeText(e.value);
        case "number":
            return String(e.value);
        case "boolean":
            return e.value ? "true" : "false";
        case "item":
            return e.name;
        case "locationOf":
            return `%location of ${emitValue(e.target)}%`;
        case "arith":
            return `%${emitValue(e)}%`;
        case "format":
            return emitStringParts(e.parts);
        case "wsMessage":
        case "wsId":
        case "worldOf":
        case "borderSize":
        case "borderCenter":
        case "timerId":
        case "timerTimeLeft":
        case "dataSource":
        case "dbLastError":
        case "fileContents":
        case "fileLine":
        case "fileLineCount":
        case "placeholderValue":
        case "placeholderIdentifier":
        case "placeholderPrefix":
            throw new Error(`Unhandled Expr in emitString: '${e.kind}' is an engine-only builtin with no .sk form`);
        default: {
            const exhaustive: never = e;
            void exhaustive;
            throw new Error("Unhandled Expr in emitString");
        }
    }
}

function emitStringParts(parts: readonly (string | Expr)[]): string {
    let result = "";
    for (const part of parts) {
        if (typeof part === "string") {
            result += escapeText(part);
        } else {
            result += emitString(part);
        }
    }
    return result;
}

function emitText(t: TextExpr): string {
    switch (t.kind) {
        case "string":
            return `"${escapeText(t.value)}"`;
        case "format":
            return `"${emitStringParts(t.parts)}"`;
        default: {
            const exhaustive: never = t;
            void exhaustive;
            throw new Error("Unhandled TextExpr in emitText");
        }
    }
}

/**
 * Emit a leaf condition (anything except and/or/not). With
 * `negated`, emit Skript's native negated form of the same leaf:
 * the compare condition's "is not ..." patterns, "is not op", and
 * "does not have permission" — all verified to parse and to behave
 * as exact boolean negations on the real Skript 2.17.1.
 */
function emitLeafCond(c: Cond, negated: boolean): string {
    switch (c.kind) {
        case "hasPermission":
            return negated
                ? `${emitValue(c.target)} does not have permission "${escapeText(c.permission)}"`
                : `${emitValue(c.target)} has permission "${escapeText(c.permission)}"`;
        case "isOp":
            return negated ? `${emitValue(c.target)} is not op` : `${emitValue(c.target)} is op`;
        case "equals":
            return negated
                ? `${emitValue(c.left)} is not ${emitValue(c.right)}`
                : `${emitValue(c.left)} is ${emitValue(c.right)}`;
        case "notEquals":
            return negated
                ? `${emitValue(c.left)} is ${emitValue(c.right)}`
                : `${emitValue(c.left)} is not ${emitValue(c.right)}`;
        case "greaterThan":
            return negated
                ? `${emitValue(c.left)} is not greater than ${emitValue(c.right)}`
                : `${emitValue(c.left)} is greater than ${emitValue(c.right)}`;
        case "greaterOrEqual":
            return negated
                ? `${emitValue(c.left)} is not greater than or equal to ${emitValue(c.right)}`
                : `${emitValue(c.left)} is greater than or equal to ${emitValue(c.right)}`;
        case "lessThan":
            return negated
                ? `${emitValue(c.left)} is not less than ${emitValue(c.right)}`
                : `${emitValue(c.left)} is less than ${emitValue(c.right)}`;
        case "lessOrEqual":
            return negated
                ? `${emitValue(c.left)} is not less than or equal to ${emitValue(c.right)}`
                : `${emitValue(c.left)} is less than or equal to ${emitValue(c.right)}`;
        case "timerActive":
        case "fileExists":
            throw new Error(`Unhandled Cond in emitCond: '${c.kind}' is an engine-only builtin with no .sk form`);
        case "and":
        case "or":
        case "not":
            throw new Error(`Unhandled Cond in emitCond: '${c.kind}' is a logic node, not a leaf condition`);
        default: {
            const exhaustive: never = c;
            void exhaustive;
            throw new Error("Unhandled Cond in emitCond");
        }
    }
}

/** One emitted line plus the AST node that produced it. */
interface OwnedLine {
    text: string;
    node: string;
    loc?: SourceLoc;
}

function own(text: string, node: string, loc: SourceLoc | undefined): OwnedLine {
    return loc === undefined ? { text, node } : { text, node, loc };
}

function emitBlock(stmts: readonly Stmt[], level: number, parentPath: string, branch: string): OwnedLine[] {
    const lines: OwnedLine[] = [];
    stmts.forEach((stmt, i) => {
        lines.push(...emitStmt(stmt, level, `${parentPath}.${branch}[${i}]`));
    });
    return lines;
}

/**
 * Emit an if statement, lowering logic conditions (and/or/not) to
 * control flow. The sandbox's Skript 2.17.1 rejects every textual
 * conjunction form probed (bare, parenthesized, =-forms, mixed
 * with permission conditions — all "Can't understand this
 * condition"), and has no general `not` condition either, so:
 *
 *   and(a, b)  ->  if a: if b: <then> else: <else>  / else: <else>
 *   or(a, b)   ->  if a: <then>  / else: if b: <then> else: <else>
 *   not(c)     ->  branches swapped when an else exists, De Morgan
 *                  for and/or, and Skript's native negated leaf
 *                  forms ("is not ...", "does not have ...") when
 *                  there is no else to swap into.
 *
 * The lowering is semantically exact: conditions in this subset
 * are pure, and the negated leaf forms are exact negations.
 */
function emitIfLines(
    cond: Cond,
    then: readonly Stmt[],
    elseOpt: readonly Stmt[] | undefined,
    level: number,
    path: string,
    loc: SourceLoc | undefined,
): OwnedLine[] {
    const prefix = " ".repeat(4 * level);
    switch (cond.kind) {
        case "and": {
            const inner: Stmt =
                elseOpt === undefined
                    ? { kind: "if", cond: cond.right, then, loc }
                    : { kind: "if", cond: cond.right, then, else: elseOpt, loc };
            return emitIfLines(cond.left, [inner], elseOpt, level, path, loc);
        }
        case "or": {
            const inner: Stmt =
                elseOpt === undefined
                    ? { kind: "if", cond: cond.right, then, loc }
                    : { kind: "if", cond: cond.right, then, else: elseOpt, loc };
            return emitIfLines(cond.left, then, [inner], level, path, loc);
        }
        case "not": {
            const inner = cond.cond;
            if (inner.kind === "not") {
                return emitIfLines(inner.cond, then, elseOpt, level, path, loc);
            }
            if (inner.kind === "and" || inner.kind === "or") {
                const flipped: Cond =
                    inner.kind === "and"
                        ? { kind: "or", left: { kind: "not", cond: inner.left }, right: { kind: "not", cond: inner.right } }
                        : { kind: "and", left: { kind: "not", cond: inner.left }, right: { kind: "not", cond: inner.right } };
                return emitIfLines(flipped, then, elseOpt, level, path, loc);
            }
            if (elseOpt !== undefined) {
                return emitIfLines(inner, elseOpt, then, level, path, loc);
            }
            const lines = [own(`${prefix}if ${emitLeafCond(inner, true)}:`, path, loc)];
            lines.push(...emitBlock(then, level + 1, path, "then"));
            return lines;
        }
        default: {
            const lines = [own(`${prefix}if ${emitLeafCond(cond, false)}:`, path, loc)];
            lines.push(...emitBlock(then, level + 1, path, "then"));
            if (elseOpt !== undefined) {
                lines.push(own(`${prefix}else:`, path, loc));
                lines.push(...emitBlock(elseOpt, level + 1, path, "else"));
            }
            return lines;
        }
    }
}

function emitStmt(s: Stmt, level: number, path: string): OwnedLine[] {
    const prefix = " ".repeat(4 * level);
    switch (s.kind) {
        case "send":
            return [own(`${prefix}send ${emitText(s.message)} to ${emitValue(s.target)}`, path, s.loc)];
        case "broadcast":
            return [own(`${prefix}broadcast ${emitText(s.message)}`, path, s.loc)];
        case "give":
            return [own(`${prefix}give ${String(s.amount)} ${s.itemName} to ${emitValue(s.target)}`, path, s.loc)];
        case "teleport":
            return [own(`${prefix}teleport ${emitValue(s.target)} to ${emitValue(s.location)}`, path, s.loc)];
        case "setVar":
            return [own(`${prefix}set ${emitValue(s.variable)} to ${emitValue(s.value)}`, path, s.loc)];
        case "addVar":
            return [own(`${prefix}add ${emitValue(s.value)} to ${emitValue(s.variable)}`, path, s.loc)];
        case "if":
            return emitIfLines(s.cond, s.then, s.else, level, path, s.loc);
        case "loopPlayers": {
            const lines = [own(`${prefix}loop all players:`, path, s.loc)];
            lines.push(...emitBlock(s.body, level + 1, path, "body"));
            return lines;
        }
        case "wsConnect":
        case "wsSend":
        case "wsDisconnect":
        case "setBorderSize":
        case "setBorderCenter":
        case "timerCreate":
        case "timerStop":
        case "timerPause":
        case "timerResume":
        case "dbExecute":
        case "fileCreate":
        case "dirCreate":
        case "fileDelete":
        case "fileWrite":
        case "fileAppend":
        case "setPlaceholderResult":
            throw new Error(`Unhandled Stmt in emitStmt: '${s.kind}' is an engine-only builtin with no .sk form`);
        default: {
            const exhaustive: never = s;
            void exhaustive;
            throw new Error("Unhandled Stmt in emitStmt");
        }
    }
}

function emitTop(t: TopLevel, path: string): OwnedLine[] {
    switch (t.kind) {
        case "event": {
            if (
                t.event === "wsOpen" || t.event === "wsMessage" || t.event === "wsClose" ||
                t.event === "timerTick" || t.event === "timerComplete" || t.event === "papiRequest"
            ) {
                throw new Error(`Unhandled Event in emitTop: '${t.event}' is an engine-only builtin with no .sk form`);
            }
            const header =
                t.event === "join"
                    ? "on join:"
                    : t.event === "firstJoin"
                      ? "on first join:"
                      : t.event === "quit"
                        ? "on quit:"
                        : t.event === "chat"
                          ? "on chat:"
                          : "on death:";
            return [own(header, path, t.loc), ...emitBlock(t.body, 1, path, "body")];
        }
        case "command": {
            const argPart =
                t.argType === null
                    ? ""
                    : ` ${t.argOptional ? `[<${t.argType}>]` : `<${t.argType}>`}`;
            const header = `command /${t.name}${argPart}:`;
            return [
                own(header, path, t.loc),
                own("    trigger:", path, t.loc),
                ...emitBlock(t.body, 2, path, "body"),
            ];
        }
        default: {
            const exhaustive: never = t;
            void exhaustive;
            throw new Error("Unhandled TopLevel in emitTop");
        }
    }
}

/** Result of emitting a script together with its line mappings. */
export interface EmitResult {
    code: string;
    lines: LineMapping[];
}

/** Emit Skript source and, for every emitted line, which AST node and TS call site produced it. */
export function emitWithMap(script: Script): EmitResult {
    const owned: OwnedLine[] = [];
    script.body.forEach((top, i) => {
        if (i > 0) owned.push({ text: "", node: "" });
        owned.push(...emitTop(top, `body[${i}]`));
    });
    const code = owned.map((l) => l.text).join("\n") + "\n";
    const lines: LineMapping[] = owned.map((l, i) => {
        const base: LineMapping = { line: i + 1, node: l.node };
        return l.loc === undefined ? base : { ...base, ts: l.loc };
    });
    return { code, lines };
}

export function emit(script: Script): string {
    return emitWithMap(script).code;
}
