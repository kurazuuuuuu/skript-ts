import type { Cond, Expr, Script, Stmt, TextExpr, TopLevel, VariableExpr } from "./ast.js";

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
        case "argument":
            return `%arg-${e.index}%`;
        case "chatMessage":
            return "%message%";
        case "variable":
            return emitValue(e);
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
        default: {
            const exhaustive: never = c;
            void exhaustive;
            throw new Error("Unhandled Cond in emitCond");
        }
    }
}

function emitBlock(stmts: readonly Stmt[], level: number): string[] {
    const lines: string[] = [];
    for (const stmt of stmts) {
        lines.push(...emitStmt(stmt, level));
    }
    return lines;
}

function emitStmt(s: Stmt, level: number): string[] {
    const prefix = " ".repeat(4 * level);
    switch (s.kind) {
        case "send":
            return [`${prefix}send ${emitText(s.message)} to ${emitValue(s.target)}`];
        case "broadcast":
            return [`${prefix}broadcast ${emitText(s.message)}`];
        case "give":
            return [`${prefix}give ${String(s.amount)} ${s.itemName} to ${emitValue(s.target)}`];
        case "teleport":
            return [`${prefix}teleport ${emitValue(s.target)} to ${emitValue(s.location)}`];
        case "setVar":
            return [`${prefix}set ${emitValue(s.variable)} to ${emitValue(s.value)}`];
        case "addVar":
            return [`${prefix}add ${emitValue(s.value)} to ${emitValue(s.variable)}`];
        case "if": {
            const lines = [`${prefix}if ${emitCond(s.cond)}:`];
            lines.push(...emitBlock(s.then, level + 1));
            if (s.else !== undefined) {
                lines.push(`${prefix}else:`);
                lines.push(...emitBlock(s.else, level + 1));
            }
            return lines;
        }
        case "loopPlayers": {
            const lines = [`${prefix}loop all players:`];
            lines.push(...emitBlock(s.body, level + 1));
            return lines;
        }
        default: {
            const exhaustive: never = s;
            void exhaustive;
            throw new Error("Unhandled Stmt in emitStmt");
        }
    }
}

function emitTop(t: TopLevel): string {
    switch (t.kind) {
        case "event": {
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
            const lines = [header, ...emitBlock(t.body, 1)];
            return lines.join("\n");
        }
        case "command": {
            const argPart =
                t.argType === null
                    ? ""
                    : ` ${t.argOptional ? `[<${t.argType}>]` : `<${t.argType}>`}`;
            const header = `command /${t.name}${argPart}:`;
            const lines = [header, "    trigger:", ...emitBlock(t.body, 2)];
            return lines.join("\n");
        }
        default: {
            const exhaustive: never = t;
            void exhaustive;
            throw new Error("Unhandled TopLevel in emitTop");
        }
    }
}

export function emit(script: Script): string {
    return script.body.map(emitTop).join("\n\n") + "\n";
}
