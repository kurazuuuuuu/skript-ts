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
        case "variableList":
            return `{${e.name}::*}`;
        case "localVariable":
            return `{_${e.name}${e.index !== undefined ? `::%${emitValue(e.index)}%` : ""}}`;
        case "localVariableList":
            return `{_${e.name}::*}`;
        case "functionCall":
            return `${e.name}(${e.args.map((a) => emitValue(a)).join(", ")})`;
        case "listSize":
            return `size of ${emitValue(e.list)}`;
        case "loopValue":
            return "loop-value";
        case "loopIndex":
            return "loop-index";
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
        case "eventBlock":
            return "event-block";
        case "eventItem":
            return "event-item";
        case "clickedEntity":
            return "clicked entity";
        case "attacker":
            return "attacker";
        case "damageAmount":
            return "damage";
        case "damageCause":
            return "damage cause";
        case "typeOf":
            // Parenthesize an arithmetic operand so the emitted
            // text groups the operation, not the type-of.
            return e.target.kind === "arith"
                ? `type of (${emitValue(e.target)})`
                : `type of ${emitValue(e.target)}`;
        case "textLength":
            return `length of ${emitValue(e.target)}`;
        case "substring":
            return `substring of ${emitValue(e.target)} from ${emitValue(e.from)} to ${emitValue(e.to)}`;
        case "firstChars":
            return `first ${emitValue(e.count)} characters of ${emitValue(e.target)}`;
        case "lastChars":
            return `last ${emitValue(e.count)} characters of ${emitValue(e.target)}`;
        case "charAt":
            return `character at ${emitValue(e.index)} in ${emitValue(e.target)}`;
        case "upperCase":
            return `${emitValue(e.target)} in uppercase`;
        case "lowerCase":
            return `${emitValue(e.target)} in lowercase`;
        case "splitText":
            return `split ${emitValue(e.target)} at ${emitValue(e.delimiter)}${e.caseSensitive ? " with case sensitivity" : ""}`;
        case "joinText":
            return e.delimiter === null
                ? `join ${emitValue(e.source)}`
                : `join ${emitValue(e.source)} with ${emitValue(e.delimiter)}`;
        case "coloredText":
            return `colored ${emitValue(e.target)}`;
        case "formattedText":
            return `formatted ${emitValue(e.target)}`;
        case "uncoloredText":
            return `uncolored ${emitValue(e.target)}`;
        case "unformattedText":
            return `unformatted ${emitValue(e.target)}`;
        case "itemWithName":
            return `${emitValue(e.base)} named ${emitValue(e.name)}`;
        case "itemWithLore":
            return `${emitValue(e.base)} with lore ${andList(e.lines.map((l) => emitValue(l)))}`;
        case "itemWithAmount":
            return `${emitValue(e.amount)} of ${emitValue(e.base)}`;
        case "nameOf":
            // Parenthesize an arithmetic operand, as with typeOf.
            return e.target.kind === "arith"
                ? `name of (${emitValue(e.target)})`
                : `name of ${emitValue(e.target)}`;
        case "loreOf":
            return e.target.kind === "arith"
                ? `lore of (${emitValue(e.target)})`
                : `lore of ${emitValue(e.target)}`;
        case "amountOf":
            return e.target.kind === "arith"
                ? `amount of (${emitValue(e.target)})`
                : `amount of ${emitValue(e.target)}`;
        case "chestInventory":
            return `chest inventory with ${emitValue(e.rows)} rows${e.title !== undefined ? ` named ${emitValue(e.title)}` : ""}`;
        case "currentInventory":
            return `${emitValue(e.target)}'s current inventory`;
        case "eventInventory":
            return "event-inventory";
        case "slotItem":
            return `slot ${emitValue(e.slot)} of ${emitValue(e.inventory)}`;
        case "clickedSlotIndex":
            return "index of event-slot";
        case "clickedRawSlotIndex":
            return "raw index of event-slot";
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
        case "variableList":
        case "localVariable":
        case "localVariableList":
        case "functionCall":
        case "listSize":
        case "loopValue":
        case "loopIndex":
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
        case "eventBlock":
        case "eventItem":
        case "clickedEntity":
        case "attacker":
        case "damageAmount":
        case "damageCause":
        case "typeOf":
        case "textLength":
        case "substring":
        case "firstChars":
        case "lastChars":
        case "charAt":
        case "upperCase":
        case "lowerCase":
        case "splitText":
        case "joinText":
        case "coloredText":
        case "formattedText":
        case "uncoloredText":
        case "unformattedText":
        case "itemWithName":
        case "itemWithLore":
        case "itemWithAmount":
        case "nameOf":
        case "loreOf":
        case "amountOf":
        case "chestInventory":
        case "currentInventory":
        case "eventInventory":
        case "slotItem":
        case "clickedSlotIndex":
        case "clickedRawSlotIndex":
            return `%${emitValue(e)}%`;
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

/**
 * Emit a message expression: string literals and formats emit as
 * quoted Skript text; any other expression (a variable, a function
 * call, ...) emits as a bare value, which Skript's send/broadcast
 * effects accept (%objects%).
 */
function emitText(t: Expr): string {
    switch (t.kind) {
        case "string":
            return `"${escapeText(t.value)}"`;
        case "format":
            return `"${emitStringParts(t.parts)}"`;
        default:
            return emitValue(t);
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
        case "contains":
            return negated
                ? `${emitValue(c.container)} does not contain ${emitValue(c.item)}`
                : `${emitValue(c.container)} contains ${emitValue(c.item)}`;
        case "startsWith":
            return negated
                ? `${emitValue(c.target)} does not start with ${emitValue(c.prefix)}`
                : `${emitValue(c.target)} starts with ${emitValue(c.prefix)}`;
        case "endsWith":
            return negated
                ? `${emitValue(c.target)} does not end with ${emitValue(c.suffix)}`
                : `${emitValue(c.target)} ends with ${emitValue(c.suffix)}`;
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

/**
 * Emit a while-loop head condition. A while head cannot lower
 * logic to control flow the way emitIfLines does, and Skript has
 * no textual conjunction, so only leaf conditions and not(leaf)
 * have a .sk form (the whileLoop builder rejects the rest; the
 * emitLeafCond calls below reject them again for hand-built ASTs).
 */
function emitWhileCond(c: Cond): string {
    if (c.kind === "not") return emitLeafCond(c.cond, true);
    return emitLeafCond(c, false);
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
        case "listAdd":
            return [own(`${prefix}add ${emitValue(s.value)} to ${emitValue(s.list)}`, path, s.loc)];
        case "listRemove":
            return [own(`${prefix}remove ${emitValue(s.value)} from ${emitValue(s.list)}`, path, s.loc)];
        case "deleteVar":
            return [own(`${prefix}delete ${emitValue(s.target)}`, path, s.loc)];
        case "loopList": {
            const lines = [own(`${prefix}loop ${emitValue(s.list)}:`, path, s.loc)];
            lines.push(...emitBlock(s.body, level + 1, path, "body"));
            return lines;
        }
        case "loopTimes": {
            const lines = [own(`${prefix}loop ${emitValue(s.count)} times:`, path, s.loc)];
            lines.push(...emitBlock(s.body, level + 1, path, "body"));
            return lines;
        }
        case "loopRange": {
            const lines = [own(`${prefix}loop numbers from ${emitValue(s.from)} to ${emitValue(s.to)}:`, path, s.loc)];
            lines.push(...emitBlock(s.body, level + 1, path, "body"));
            return lines;
        }
        case "while": {
            const lines = [own(`${prefix}while ${emitWhileCond(s.cond)}:`, path, s.loc)];
            lines.push(...emitBlock(s.body, level + 1, path, "body"));
            return lines;
        }
        case "wait":
            return [own(`${prefix}wait ${emitValue(s.amount)} ${s.unit}`, path, s.loc)];
        case "return":
            return [own(`${prefix}return ${emitValue(s.value)}`, path, s.loc)];
        case "cancelEvent":
            return [own(`${prefix}cancel event`, path, s.loc)];
        case "uncancelEvent":
            return [own(`${prefix}uncancel event`, path, s.loc)];
        case "setDamage":
            return [own(`${prefix}set damage to ${emitValue(s.value)}`, path, s.loc)];
        case "textReplace":
            return [own(
                `${prefix}replace ${s.firstOnly ? "first" : "all"} ${emitValue(s.find)} in ${emitValue(s.target)} with ${emitValue(s.replacement)}${s.caseSensitive ? " with case sensitivity" : ""}`,
                path,
                s.loc,
            )];
        case "giveItem":
            return [own(`${prefix}give ${emitValue(s.item)} to ${emitValue(s.target)}`, path, s.loc)];
        case "setItemName":
            return [own(`${prefix}set name of ${emitValue(s.target)} to ${emitValue(s.name)}`, path, s.loc)];
        case "setItemLore":
            return [own(`${prefix}set lore of ${emitValue(s.target)} to ${andList(s.lines.map((l) => emitValue(l)))}`, path, s.loc)];
        case "setItemAmount":
            return [own(`${prefix}set amount of ${emitValue(s.target)} to ${emitValue(s.amount)}`, path, s.loc)];
        case "setSlot":
            return [own(`${prefix}set slot ${emitValue(s.slot)} of ${emitValue(s.inventory)} to ${emitValue(s.item)}`, path, s.loc)];
        case "openInventory":
            return [own(`${prefix}open ${emitValue(s.inventory)} to ${emitValue(s.target)}`, path, s.loc)];
        case "openGui":
            return [own(
                `${prefix}open chest inventory with ${emitValue(s.rows)} rows${s.title !== undefined ? ` named ${emitValue(s.title)}` : ""} to ${emitValue(s.target)}`,
                path,
                s.loc,
            )];
        case "closeInventory":
            return [own(`${prefix}close ${emitValue(s.target)}'s inventory`, path, s.loc)];
        case "stop":
            return [own(`${prefix}stop`, path, s.loc)];
        case "callStmt":
            return [own(`${prefix}${s.name}(${s.args.map((a) => emitValue(a)).join(", ")})`, path, s.loc)];
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

/**
 * A Skript type-name list as it appears in a filtered event
 * header: one name bare, two joined with "or", three or more as
 * "a, b or c" (all shapes verified to parse on Skript 2.17.1).
 */
function typeList(names: readonly string[]): string {
    if (names.length === 1) return names[0]!;
    if (names.length === 2) return `${names[0]} or ${names[1]}`;
    return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/**
 * An "and" list of already-emitted values, in the shape Skript
 * list positions take (lore lines, phase 17): one value bare,
 * two joined with "and", three or more as "a, b and c".
 */
function andList(values: readonly string[]): string {
    if (values.length === 1) return values[0]!;
    if (values.length === 2) return `${values[0]} and ${values[1]}`;
    return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}

/** The .sk header line of an event top-level, filter slots included (phase 16). */
function eventHeader(t: Extract<TopLevel, { kind: "event" }>): string {
    const f = t.filter;
    switch (t.event) {
        case "join":
            return "on join:";
        case "firstJoin":
            return "on first join:";
        case "quit":
            return "on quit:";
        case "chat":
            return "on chat:";
        case "death":
            return "on death:";
        case "blockBreak":
            return `on block break${f?.ofTypes ? ` of ${typeList(f.ofTypes)}` : ""}:`;
        case "blockPlace":
            return `on block place${f?.ofTypes ? ` of ${typeList(f.ofTypes)}` : ""}:`;
        case "rightClick":
        case "leftClick": {
            const base = t.event === "rightClick" ? "on right click" : "on left click";
            const on = f?.onTypes
                ? ` on ${typeList(f.onTypes)}`
                : f?.onEntityTypes
                  ? ` on ${typeList(f.onEntityTypes)}`
                  : "";
            const withPart = f?.withTypes ? ` with ${typeList(f.withTypes)}` : "";
            return `${base}${on}${withPart}:`;
        }
        case "damage": {
            const of = f?.victimTypes ? ` of ${typeList(f.victimTypes)}` : "";
            const by = f?.attackerTypes ? ` by ${typeList(f.attackerTypes)}` : "";
            return `on damage${of}${by}:`;
        }
        case "pickup":
            return `on pick up${f?.ofTypes ? ` of ${typeList(f.ofTypes)}` : ""}:`;
        case "drop":
            return `on drop${f?.ofTypes ? ` of ${typeList(f.ofTypes)}` : ""}:`;
        case "respawn":
            return "on respawn:";
        case "bedEnter":
            return "on bed enter:";
        case "bedLeave":
            return "on bed leave:";
        case "inventoryClick":
            return "on inventory click:";
        case "inventoryClose":
            return "on inventory close:";
        default:
            // Engine-only events (ws / timer / papiRequest) are
            // rejected by emitTop before the header is computed.
            throw new Error(`Unhandled Event in eventHeader: '${t.event}'`);
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
            const header = eventHeader(t);
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
        case "function": {
            const params = t.params
                .map((p) =>
                    p.default === undefined
                        ? `${p.name}: ${p.type}`
                        : `${p.name}: ${p.type} = ${emitValue(p.default)}`,
                )
                .join(", ");
            const ret = t.returnType === null ? "" : ` :: ${t.returnType}`;
            const header = `function ${t.name}(${params})${ret}:`;
            return [own(header, path, t.loc), ...emitBlock(t.body, 1, path, "body")];
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
