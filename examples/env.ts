import {
  argument,
  broadcast,
  command,
  env,
  fmt,
  script,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// env() builtin slice (phase 26). This script is engine-only: the
// envVar expression lives in the skript-ts engine jar, so there is
// no .sk form of this file. The build emits only env.ir.json and
// Skript-mode deployment skips it.
//
// env resolves the environment variables the JVM inherited when
// the server process started; they do not change while the server
// runs, so changing a variable requires a server restart. An
// unset name has no value and formats as <none>.
//
// Commands:
//   /envshow <name>   broadcast the value of the named
//                     environment variable ("envval <value>")
export const envScript: Script = script(
  command("envshow", "text", [
    broadcast(fmt("envval ", env(fmt(argument(1))))),
  ]),
);
