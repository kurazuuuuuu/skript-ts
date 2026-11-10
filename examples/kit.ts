import {
  add,
  argument,
  command,
  fmt,
  give,
  hasPermission,
  ifElse,
  num,
  player,
  script,
  send,
  str,
  variable,
} from "../src/index.js";
import type { Script } from "../src/index.js";

export const kitScript: Script = script(
  command("kit", "text", [
    ifElse(
      hasPermission(player(), "server.kit"),
      [
        give(player(), "golden apple", 3),
        add(variable("kits", player()), num(1)),
        send(player(), fmt("キット ", argument(1), " を配布しました")),
      ],
      [send(player(), str("権限がありません"))],
    ),
  ]),
);
