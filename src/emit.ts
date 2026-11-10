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

function emitCond(c: Cond): string {
    switch (c.kind) {
        case "hasPermission":
            return `${emitValue(c.target)} has permission "${escapeText(c.permission)}"`;
        case "isOp":
            return `${emitValue(c.target)} is op`;
        case "timerActive":
        case "fileExists":
            throw new Error(`Unhandled Cond in emitCond: '${c.kind}' is an engine-only builtin with no .sk form`);
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
        case "if": {
            const lines = [own(`${prefix}if ${emitCond(s.cond)}:`, path, s.loc)];
            lines.push(...emitBlock(s.then, level + 1, path, "then"));
            if (s.else !== undefined) {
                lines.push(own(`${prefix}else:`, path, s.loc));
                lines.push(...emitBlock(s.else, level + 1, path, "else"));
            }
            return lines;
        }
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
