import type {
  CommandArgType,
  Cond,
  Expr,
  Script,
  SourceLoc,
  Stmt,
  TextExpr,
  TopLevel,
  VariableExpr,
} from "./ast.js";
import type { LineMapping } from "./source-map.js";

function escapeText(s: string): string {
  return s.replace(/"/g, '""').replace(/%/g, "%%");
}

/** A literal timespan in the original's text form (`5 seconds`, `100 ticks`); fractional amounts print plainly (probed: `2.5 seconds` parses and lands on 50 ticks). */
function emitTimespan(t: { amount: number; unit: string }): string {
  return `${String(t.amount)} ${t.unit}`;
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
    case "eventEntity":
      return "event-entity";
    case "hookedEntity":
      return "hooked entity";
    case "fishingHook":
      return "fishing hook";
    case "eventFishingState":
      return "event-fishing state";
    case "fishingState":
      // A state literal is written BARE, like a weather
      // or game mode literal (phase 22).
      return e.name;
    case "droppedItemEntity":
      return "event-dropped item";
    case "itemOfEntity":
      return e.target.kind === "arith"
        ? `item of (${emitValue(e.target)})`
        : `item of ${emitValue(e.target)}`;
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
    case "blockAt":
      return `block at ${emitValue(e.location)}`;
    case "locationAt":
      return e.world !== undefined
        ? `location(${emitValue(e.x)}, ${emitValue(e.y)}, ${emitValue(e.z)}, ${emitValue(e.world)})`
        : `location(${emitValue(e.x)}, ${emitValue(e.y)}, ${emitValue(e.z)})`;
    case "xOf":
      return `x-coordinate of ${emitValue(e.target)}`;
    case "yOf":
      return `y-coordinate of ${emitValue(e.target)}`;
    case "zOf":
      return `z-coordinate of ${emitValue(e.target)}`;
    case "offsetLoc":
      return `${emitValue(e.location)} ~ vector(${emitValue(e.dx)}, ${emitValue(e.dy)}, ${emitValue(e.dz)})`;
    case "relativeBlock": {
      // The direction phrase shapes differ per direction
      // (all probed): `block [n] above %target%` and
      // `block [n] behind %target%` take no "of"; the
      // cardinals and front do (`block [n] north of
      // %target%`, `block [n] in front of %target%`).
      const count =
        e.amount.kind === "number" && e.amount.value === 1 ? "" : `${emitValue(e.amount)} `;
      switch (e.direction) {
        case "above":
        case "below":
        case "behind":
          return `block ${count}${e.direction} ${emitValue(e.target)}`;
        case "front":
          return `block ${count}in front of ${emitValue(e.target)}`;
        default:
          return `block ${count}${e.direction} of ${emitValue(e.target)}`;
      }
    }
    case "world":
      return `world "${escapeText(e.name)}"`;
    case "worldOf":
      return `world of ${emitValue(e.target)}`;
    case "worldTime":
      return `time in ${emitValue(e.world)}`;
    case "clockTime":
      return e.text;
    case "worldWeather":
      return `weather in ${emitValue(e.world)}`;
    case "weatherType":
      return e.name;
    case "healthOf":
      return `health of ${emitValue(e.target)}`;
    case "maxHealthOf":
      return `max health of ${emitValue(e.target)}`;
    case "foodLevelOf":
      return `food level of ${emitValue(e.target)}`;
    case "saturationOf":
      return `saturation of ${emitValue(e.target)}`;
    case "gameModeOf":
      return `gamemode of ${emitValue(e.target)}`;
    case "gameModeType":
      return e.name;
    case "experienceOf":
      return `experience of ${emitValue(e.target)}`;
    case "levelOf":
      return `level of ${emitValue(e.target)}`;
    case "lastSpawnedEntity":
      return "last spawned entity";
    case "bossBar":
      // The create forms (all probed): plain and color-only
      // use `a boss bar`; a title uses the one-word
      // `bossbar ... with title %text%` shape, with or
      // without a color word in front.
      requireBossBarColor(e.color, undefined);
      if (e.title !== undefined) {
        return `a ${e.color !== undefined ? `${e.color} ` : ""}bossbar with title ${emitText(e.title)}`;
      }
      return `a ${e.color !== undefined ? `${e.color} ` : ""}boss bar`;
    case "bossBarTitleOf":
      return e.bar.kind === "arith"
        ? `title of (${emitValue(e.bar)})`
        : `title of ${emitValue(e.bar)}`;
    case "bossBarProgressOf":
      return e.bar.kind === "arith"
        ? `progress of (${emitValue(e.bar)})`
        : `progress of ${emitValue(e.bar)}`;
    case "keyedBossBar":
      // The keyed create forms (all probed in phase 24):
      // bare and color-only use `a keyed ... boss bar with
      // key %text%`; a title adds `with title %text%` after
      // the key — two-word `boss bar` without a color, the
      // one-word `bossbar` shape with one.
      requireBossBarColor(e.color, undefined);
      if (e.title !== undefined) {
        return e.color !== undefined
          ? `a keyed ${e.color} bossbar with key ${emitText(e.key)} with title ${emitText(e.title)}`
          : `a keyed boss bar with key ${emitText(e.key)} with title ${emitText(e.title)}`;
      }
      return `a keyed ${e.color !== undefined ? `${e.color} ` : ""}boss bar with key ${emitText(e.key)}`;
    case "keyedBossBarOf":
      return `boss bar with key ${emitText(e.key)}`;
    case "bossBarKeyOf":
      return e.bar.kind === "arith"
        ? `boss bar key of (${emitValue(e.bar)})`
        : `boss bar key of ${emitValue(e.bar)}`;
    case "bossBarStyleOf":
      return e.bar.kind === "arith"
        ? `style of (${emitValue(e.bar)})`
        : `style of ${emitValue(e.bar)}`;
    case "eventBossBar":
      return "event-bossbar";
    case "arith":
      // Arithmetic is always parenthesized so the emitted tree
      // means the same thing regardless of Skript's own
      // operator precedence; mod is Skript's mod() function
      // (Skript has no infix remainder operator).
      return e.op === "mod"
        ? `mod(${emitValue(e.left)}, ${emitValue(e.right)})`
        : `(${emitValue(e.left)} ${e.op} ${emitValue(e.right)})`;
    case "randomNumber":
      return `random number between ${emitValue(e.min)} and ${emitValue(e.max)}`;
    case "randomInteger":
      return `random integer between ${emitValue(e.min)} and ${emitValue(e.max)}`;
    case "format":
      return `"${emitStringParts(e.parts)}"`;
    case "timespan":
      return emitTimespan(e);
    case "fishingWaitTime":
      return `${e.bound} fishing wait time`;
    case "fishingBiteTime":
      return "fishing bite time";
    case "fishingApproachAngle":
      return `${e.bound} fishing approach angle`;
    case "wsMessage":
    case "wsId":
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
    case "httpId":
    case "httpStatus":
    case "httpBody":
    case "httpError":
    case "httpSavedPath":
    case "envVar":
    case "cfId":
    case "cfError":
      // Engine-builtin expressions (phases 6-10, 26) exist only
      // in the engine jar; there is no Skript text form to emit.
      throw new Error(
        `Unhandled Expr in emitValue: '${e.kind}' is an engine-only builtin with no .sk form`,
      );
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
    case "eventEntity":
    case "hookedEntity":
    case "fishingHook":
    case "eventFishingState":
    case "droppedItemEntity":
    case "itemOfEntity":
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
    case "blockAt":
    case "locationAt":
    case "xOf":
    case "yOf":
    case "zOf":
    case "offsetLoc":
    case "relativeBlock":
    case "world":
    case "worldOf":
    case "worldTime":
    case "clockTime":
    case "worldWeather":
    case "weatherType":
    case "fishingState":
    case "healthOf":
    case "maxHealthOf":
    case "foodLevelOf":
    case "saturationOf":
    case "gameModeOf":
    case "gameModeType":
    case "experienceOf":
    case "levelOf":
    case "lastSpawnedEntity":
    case "bossBar":
    case "bossBarTitleOf":
    case "bossBarProgressOf":
    case "keyedBossBar":
    case "keyedBossBarOf":
    case "bossBarKeyOf":
    case "bossBarStyleOf":
    case "eventBossBar":
    case "timespan":
    case "fishingWaitTime":
    case "fishingBiteTime":
    case "fishingApproachAngle":
      return `%${emitValue(e)}%`;
    case "arith":
    case "randomNumber":
    case "randomInteger":
      return `%${emitValue(e)}%`;
    case "format":
      return emitStringParts(e.parts);
    case "wsMessage":
    case "wsId":
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
    case "httpId":
    case "httpStatus":
    case "httpBody":
    case "httpError":
    case "httpSavedPath":
    case "envVar":
    case "cfId":
    case "cfError":
      throw new Error(
        `Unhandled Expr in emitString: '${e.kind}' is an engine-only builtin with no .sk form`,
      );
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
    case "chance":
      // The original has no negated chance form (probed: a
      // general `not` is rejected, and there is no "does not"
      // pattern), so a negation here can only come from a
      // not(...) if WITHOUT an else branch or a negated while
      // head — both are rejected by the builders / lowering
      // before this point for API-built scripts. Throw rather
      // than emit text the original cannot parse.
      if (negated) {
        throw new Error(
          "Unhandled Cond in emitCond: 'chance' has no negated .sk form; " +
            "give the if an else branch so not(chance(...)) can swap branches",
        );
      }
      return `chance of ${emitValue(c.value)}`;
    case "bossBarDarkensSky":
      return negated
        ? `${emitValue(c.bar)} does not darken the sky`
        : `${emitValue(c.bar)} darkens the sky`;
    case "bossBarCreatesFog":
      return negated
        ? `${emitValue(c.bar)} does not create fog`
        : `${emitValue(c.bar)} creates fog`;
    case "bossBarPlaysBossMusic":
      return negated
        ? `${emitValue(c.bar)} does not play boss music`
        : `${emitValue(c.bar)} plays boss music`;
    case "timerActive":
    case "fileExists":
    case "httpOk":
    case "cfOk":
      throw new Error(
        `Unhandled Cond in emitCond: '${c.kind}' is an engine-only builtin with no .sk form`,
      );
    case "and":
    case "or":
    case "not":
      throw new Error(
        `Unhandled Cond in emitCond: '${c.kind}' is a logic node, not a leaf condition`,
      );
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

function emitBlock(
  stmts: readonly Stmt[],
  level: number,
  parentPath: string,
  branch: string,
): OwnedLine[] {
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
            ? {
                kind: "or",
                left: { kind: "not", cond: inner.left },
                right: { kind: "not", cond: inner.right },
              }
            : {
                kind: "and",
                left: { kind: "not", cond: inner.left },
                right: { kind: "not", cond: inner.right },
              };
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

// The builders validate these closed literal sets already;
// the emitter re-checks them because an AST can be built by
// hand, and an unchecked name would either emit a line the
// original rejects or (for flags) silently emit the wrong
// verb. (Phase 27: the validation asymmetry of review item
// R-1, closed for the closed-set names; event filter type
// names stay unchecked — that set is open-ended.)
const EMIT_BOSS_BAR_COLORS: ReadonlySet<string> = new Set([
  "pink",
  "blue",
  "red",
  "green",
  "yellow",
  "purple",
  "white",
]);
const EMIT_BOSS_BAR_STYLES: ReadonlySet<string> = new Set([
  "solid",
  "6 notches",
  "10 notches",
  "12 notches",
  "20 notches",
]);
const EMIT_BOSS_BAR_FLAGS: ReadonlySet<string> = new Set([
  "darkenSky",
  "createFog",
  "playBossMusic",
]);

function invalidNameError(what: string, value: unknown, loc?: SourceLoc): Error {
  const location = loc ? ` (at ${loc.file}:${loc.line}:${loc.column})` : "";
  return new Error(`invalid ${what}: ${JSON.stringify(value)}${location}`);
}

function requireBossBarColor(value: string | undefined, loc?: SourceLoc): void {
  if (value !== undefined && !EMIT_BOSS_BAR_COLORS.has(value)) {
    throw invalidNameError("boss bar color name", value, loc);
  }
}

function requireBossBarStyle(value: string, loc?: SourceLoc): void {
  if (!EMIT_BOSS_BAR_STYLES.has(value)) {
    throw invalidNameError("boss bar style name", value, loc);
  }
}

function requireBossBarFlag(value: string, loc?: SourceLoc): void {
  if (!EMIT_BOSS_BAR_FLAGS.has(value)) {
    throw invalidNameError("boss bar flag name", value, loc);
  }
}

function emitStmt(s: Stmt, level: number, path: string): OwnedLine[] {
  const prefix = " ".repeat(4 * level);
  switch (s.kind) {
    case "send":
      return [own(`${prefix}send ${emitText(s.message)} to ${emitValue(s.target)}`, path, s.loc)];
    case "broadcast":
      return [own(`${prefix}broadcast ${emitText(s.message)}`, path, s.loc)];
    case "sendTitle": {
      // The timing tail comes after the target (probed:
      // `for` before `to` is a parse error), in stay /
      // fade-in / fade-out order; the fade-out is joined
      // with "and" only when a fade-in precedes it. A
      // statement with neither part is meaningless (the
      // builders cannot produce one) — reject it here
      // instead of crashing inside emitText (phase 27,
      // review item R-2).
      if (s.title === undefined && s.subtitle === undefined) {
        const suffix = s.loc ? ` (at ${s.loc.file}:${s.loc.line}:${s.loc.column})` : "";
        throw new Error(`sendTitle statement has neither a title nor a subtitle${suffix}`);
      }
      let tail = "";
      if (s.stay !== undefined) tail += ` for ${emitValue(s.stay)}`;
      if (s.fadeIn !== undefined) tail += ` with fadein ${emitValue(s.fadeIn)}`;
      if (s.fadeOut !== undefined) {
        tail +=
          s.fadeIn !== undefined
            ? ` and fade out ${emitValue(s.fadeOut)}`
            : ` with fade out ${emitValue(s.fadeOut)}`;
      }
      const head =
        s.title !== undefined
          ? `send title ${emitText(s.title)}${s.subtitle !== undefined ? ` with subtitle ${emitText(s.subtitle)}` : ""} to ${emitValue(s.target)}`
          : `send subtitle ${emitText(s.subtitle as Expr)} to ${emitValue(s.target)}`;
      return [own(`${prefix}${head}${tail}`, path, s.loc)];
    }
    case "sendActionBar":
      return [
        own(
          `${prefix}send action bar ${emitText(s.message)} to ${emitValue(s.target)}`,
          path,
          s.loc,
        ),
      ];
    case "clearTitle":
      return [
        own(`${prefix}${s.reset ? "reset" : "clear"} title of ${emitValue(s.target)}`, path, s.loc),
      ];
    case "setBossBarTitle":
      return [
        own(`${prefix}set title of ${emitValue(s.bar)} to ${emitText(s.title)}`, path, s.loc),
      ];
    case "setBossBarColor":
      requireBossBarColor(s.name, s.loc);
      return [own(`${prefix}set color of ${emitValue(s.bar)} to ${s.name}`, path, s.loc)];
    case "setBossBarProgress":
      return [
        own(`${prefix}set progress of ${emitValue(s.bar)} to ${emitValue(s.value)}`, path, s.loc),
      ];
    case "addBossBarViewer":
      return [
        own(`${prefix}add ${emitValue(s.viewer)} to viewers of ${emitValue(s.bar)}`, path, s.loc),
      ];
    case "removeBossBarViewer":
      return [
        own(
          `${prefix}remove ${emitValue(s.viewer)} from viewers of ${emitValue(s.bar)}`,
          path,
          s.loc,
        ),
      ];
    case "deleteKeyedBossBar":
      return [own(`${prefix}delete boss bar with key ${emitText(s.key)}`, path, s.loc)];
    case "setBossBarStyle":
      requireBossBarStyle(s.style, s.loc);
      return [own(`${prefix}set style of ${emitValue(s.bar)} to ${s.style}`, path, s.loc)];
    case "setBossBarFlag": {
      requireBossBarFlag(s.flag, s.loc);
      const verb =
        s.flag === "darkenSky"
          ? "darken the sky"
          : s.flag === "createFog"
            ? "create fog"
            : "play boss music";
      return [
        own(
          s.enabled
            ? `${prefix}make ${emitValue(s.bar)} ${verb}`
            : `${prefix}make ${emitValue(s.bar)} no longer ${verb}`,
          path,
          s.loc,
        ),
      ];
    }
    case "createBossBarSection": {
      requireBossBarColor(s.color, s.loc);
      const head =
        s.key !== undefined
          ? `set ${emitValue(s.target)} to a keyed ${s.color !== undefined ? `${s.color} ` : ""}boss bar with key ${emitText(s.key)}:`
          : `set ${emitValue(s.target)} to a ${s.color !== undefined ? `${s.color} ` : ""}boss bar:`;
      const lines = [own(`${prefix}${head}`, path, s.loc)];
      lines.push(...emitBlock(s.body, level + 1, path, "body"));
      return lines;
    }
    case "give":
      return [
        own(
          `${prefix}give ${String(s.amount)} ${s.itemName} to ${emitValue(s.target)}`,
          path,
          s.loc,
        ),
      ];
    case "teleport":
      return [
        own(`${prefix}teleport ${emitValue(s.target)} to ${emitValue(s.location)}`, path, s.loc),
      ];
    case "setVar":
      return [own(`${prefix}set ${emitValue(s.variable)} to ${emitValue(s.value)}`, path, s.loc)];
    case "addVar":
      return [own(`${prefix}add ${emitValue(s.value)} to ${emitValue(s.variable)}`, path, s.loc)];
    case "removeVar":
      return [
        own(`${prefix}remove ${emitValue(s.value)} from ${emitValue(s.variable)}`, path, s.loc),
      ];
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
      const lines = [
        own(`${prefix}loop numbers from ${emitValue(s.from)} to ${emitValue(s.to)}:`, path, s.loc),
      ];
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
    case "waitFor":
      return [own(`${prefix}wait ${emitValue(s.value)}`, path, s.loc)];
    case "setFishingWaitTime":
      return [
        own(`${prefix}set ${s.bound} fishing wait time to ${emitValue(s.value)}`, path, s.loc),
      ];
    case "setFishingBiteTime":
      return [own(`${prefix}set fishing bite time to ${emitValue(s.value)}`, path, s.loc)];
    case "setFishingApproachAngle":
      return [
        own(`${prefix}set ${s.bound} fishing approach angle to ${emitValue(s.value)}`, path, s.loc),
      ];
    case "return":
      return [own(`${prefix}return ${emitValue(s.value)}`, path, s.loc)];
    case "cancelEvent":
      return [own(`${prefix}cancel event`, path, s.loc)];
    case "uncancelEvent":
      return [own(`${prefix}uncancel event`, path, s.loc)];
    case "setDamage":
      return [own(`${prefix}set damage to ${emitValue(s.value)}`, path, s.loc)];
    case "textReplace":
      return [
        own(
          `${prefix}replace ${s.firstOnly ? "first" : "all"} ${emitValue(s.find)} in ${emitValue(s.target)} with ${emitValue(s.replacement)}${s.caseSensitive ? " with case sensitivity" : ""}`,
          path,
          s.loc,
        ),
      ];
    case "giveItem":
      return [own(`${prefix}give ${emitValue(s.item)} to ${emitValue(s.target)}`, path, s.loc)];
    case "setItemName":
      return [
        own(`${prefix}set name of ${emitValue(s.target)} to ${emitValue(s.name)}`, path, s.loc),
      ];
    case "setItemLore":
      return [
        own(
          `${prefix}set lore of ${emitValue(s.target)} to ${andList(s.lines.map((l) => emitValue(l)))}`,
          path,
          s.loc,
        ),
      ];
    case "setItemAmount":
      return [
        own(`${prefix}set amount of ${emitValue(s.target)} to ${emitValue(s.amount)}`, path, s.loc),
      ];
    case "setSlot":
      return [
        own(
          `${prefix}set slot ${emitValue(s.slot)} of ${emitValue(s.inventory)} to ${emitValue(s.item)}`,
          path,
          s.loc,
        ),
      ];
    case "openInventory":
      return [
        own(`${prefix}open ${emitValue(s.inventory)} to ${emitValue(s.target)}`, path, s.loc),
      ];
    case "openGui":
      return [
        own(
          `${prefix}open chest inventory with ${emitValue(s.rows)} rows${s.title !== undefined ? ` named ${emitValue(s.title)}` : ""} to ${emitValue(s.target)}`,
          path,
          s.loc,
        ),
      ];
    case "closeInventory":
      return [own(`${prefix}close ${emitValue(s.target)}'s inventory`, path, s.loc)];
    case "setBlock":
      return [
        own(`${prefix}set block at ${emitValue(s.location)} to ${emitValue(s.item)}`, path, s.loc),
      ];
    case "setWorldTime":
      return [
        own(`${prefix}set time in ${emitValue(s.world)} to ${emitValue(s.value)}`, path, s.loc),
      ];
    case "setWorldWeather":
      return [own(`${prefix}set weather in ${emitValue(s.world)} to ${s.name}`, path, s.loc)];
    case "setHealth":
      return [
        own(`${prefix}set health of ${emitValue(s.target)} to ${emitValue(s.value)}`, path, s.loc),
      ];
    case "setMaxHealth":
      return [
        own(
          `${prefix}set max health of ${emitValue(s.target)} to ${emitValue(s.value)}`,
          path,
          s.loc,
        ),
      ];
    case "setFoodLevel":
      return [
        own(
          `${prefix}set food level of ${emitValue(s.target)} to ${emitValue(s.value)}`,
          path,
          s.loc,
        ),
      ];
    case "setSaturation":
      return [
        own(
          `${prefix}set saturation of ${emitValue(s.target)} to ${emitValue(s.value)}`,
          path,
          s.loc,
        ),
      ];
    case "setGameMode":
      return [own(`${prefix}set gamemode of ${emitValue(s.target)} to ${s.name}`, path, s.loc)];
    case "setExperience":
      return [
        own(
          `${prefix}set experience of ${emitValue(s.target)} to ${emitValue(s.value)}`,
          path,
          s.loc,
        ),
      ];
    case "setLevel":
      return [
        own(`${prefix}set level of ${emitValue(s.target)} to ${emitValue(s.value)}`, path, s.loc),
      ];
    case "heal":
      return [
        own(
          s.amount !== undefined
            ? `${prefix}heal ${emitValue(s.target)} by ${emitValue(s.amount)}`
            : `${prefix}heal ${emitValue(s.target)}`,
          path,
          s.loc,
        ),
      ];
    case "addToExpr":
      return [own(`${prefix}add ${emitValue(s.value)} to ${emitValue(s.expr)}`, path, s.loc)];
    case "removeFromExpr":
      return [own(`${prefix}remove ${emitValue(s.value)} from ${emitValue(s.expr)}`, path, s.loc)];
    case "applyPotion":
      return [
        own(
          `${prefix}apply ${s.potion}${s.level !== undefined && s.level !== 1 ? ` ${String(s.level)}` : ""} to ${emitValue(s.target)}${s.durationSeconds !== undefined ? ` for ${String(s.durationSeconds)} seconds` : ""}`,
          path,
          s.loc,
        ),
      ];
    case "removePotion":
      return [own(`${prefix}remove ${s.potion} from ${emitValue(s.target)}`, path, s.loc)];
    case "spawnEntity":
      return [
        own(
          `${prefix}spawn ${s.count !== undefined && s.count !== 1 ? `${String(s.count)} of ` : ""}${s.entityType} at ${emitValue(s.at)}`,
          path,
          s.loc,
        ),
      ];
    case "dropItem":
      return [own(`${prefix}drop ${emitValue(s.item)} at ${emitValue(s.at)}`, path, s.loc)];
    case "playSound":
      return [
        own(`${prefix}play sound "${escapeText(s.name)}" at ${emitValue(s.at)}`, path, s.loc),
      ];
    case "stop":
      return [own(`${prefix}stop`, path, s.loc)];
    case "callStmt":
      return [
        own(`${prefix}${s.name}(${s.args.map((a) => emitValue(a)).join(", ")})`, path, s.loc),
      ];
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
    case "httpFetch":
    case "httpDownload":
    case "cfD1Query":
      throw new Error(
        `Unhandled Stmt in emitStmt: '${s.kind}' is an engine-only builtin with no .sk form`,
      );
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
      return `on death${f?.victimTypes ? ` of ${typeList(f.victimTypes)}` : ""}:`;
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
    case "entityPickup":
      return `on entity pick up${f?.ofTypes ? ` of ${typeList(f.ofTypes)}` : ""}:`;
    case "entityDrop":
      return `on entity drop${f?.ofTypes ? ` of ${typeList(f.ofTypes)}` : ""}:`;
    case "fishCast":
      return "on fishing line cast:";
    case "fishApproach":
      return "on fish approaching:";
    case "fishBite":
      return "on fish bite:";
    case "fishCaught":
      return "on fish caught:";
    case "entityHooked":
      return "on entity hooked:";
    case "hookInGround":
      return "on bobber in ground:";
    case "fishEscape":
      return "on fish escape:";
    case "fishReelIn":
      return "on fishing rod reel in:";
    case "fishingStateChange":
      return "on fishing state change:";
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
        t.event === "wsOpen" ||
        t.event === "wsMessage" ||
        t.event === "wsClose" ||
        t.event === "timerTick" ||
        t.event === "timerComplete" ||
        t.event === "papiRequest" ||
        t.event === "httpResponse" ||
        t.event === "cfResponse"
      ) {
        throw new Error(
          `Unhandled Event in emitTop: '${t.event}' is an engine-only builtin with no .sk form`,
        );
      }
      const header = eventHeader(t);
      return [own(header, path, t.loc), ...emitBlock(t.body, 1, path, "body")];
    }
    case "command": {
      // Phase 20: any number of typed arguments ([<type>]
      // for optional ones) plus the permission / usage /
      // aliases section entries before the trigger. The
      // "offlinePlayer" type spells "offline player" in the
      // header; every other type is its own name.
      const skArgType = (ty: CommandArgType): string =>
        ty === "offlinePlayer" ? "offline player" : ty;
      const argPart =
        t.args.length === 0
          ? ""
          : " " +
            t.args
              .map((a) => (a.optional ? `[<${skArgType(a.type)}>]` : `<${skArgType(a.type)}>`))
              .join(" ");
      const lines: OwnedLine[] = [own(`command /${t.name}${argPart}:`, path, t.loc)];
      if (t.permission !== undefined) {
        lines.push(own(`    permission: ${t.permission}`, path, t.loc));
      }
      if (t.usage !== undefined) {
        lines.push(own(`    usage: ${t.usage}`, path, t.loc));
      }
      if (t.aliases !== undefined && t.aliases.length > 0) {
        lines.push(own(`    aliases: ${t.aliases.join(", ")}`, path, t.loc));
      }
      lines.push(own("    trigger:", path, t.loc));
      lines.push(...emitBlock(t.body, 2, path, "body"));
      return lines;
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
    case "periodical": {
      // The unit word is always the plural (the original's
      // timespan grammar accepts "every 1 minutes" too —
      // probed), matching how `wait` emits its units.
      const header = `every ${String(t.amount)} ${t.unit}:`;
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
