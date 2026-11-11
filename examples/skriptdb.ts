import {
  argument,
  command,
  dataSource,
  dbExecute,
  dbLastError,
  fmt,
  num,
  player,
  script,
  send,
  set,
  str,
  variable,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// skript-db builtin slice (phase 8). This script is engine-only: SQL
// data sources live in the skript-ts engine jar, so there is no .sk
// form of this file. The build emits only skriptdb.ir.json and
// Skript-mode deployment skips it.
//
// The data source is a value: each command (re)creates it from its
// documented URL and stores it in {sql}, the same pattern skript-db
// documents (`set {sql} to the database "..."`). Data sources are
// runtime-only values in the engine (they may carry credentials), so
// they are not persisted across restarts — creating one is cheap,
// it opens no connection by itself.
//
// Commands:
//   /dbsetup          (re)create the players table in a SQLite file
//   /dbadd <name>     insert a player name (parameter-bound, so a
//                     name that looks like SQL is stored as data)
//   /dbcount          report the number of player rows
//   /dbnames          report the first two stored names
//   /dbbad            run a failing query and report the last error
const sql = variable("sql");
const ds = dataSource(str("sqlite:skriptdb-test.db"));

export const skriptdbScript: Script = script(
  command("dbsetup", null, [
    set(sql, ds),
    dbExecute(sql, str("drop table if exists players")),
    dbExecute(sql, str("create table players (id integer primary key, name text)")),
    send(player(), str("db setup done")),
  ]),
  command("dbadd", "text", [
    set(sql, ds),
    dbExecute(sql, fmt("insert into players (name) values (", argument(1), ")"), variable("added")),
    send(player(), fmt("added ", variable("added"), " row")),
  ]),
  command("dbcount", null, [
    set(sql, ds),
    dbExecute(sql, str("select count(*) as total from players"), variable("c")),
    send(player(), fmt("total ", variable("c", fmt("total::", num(1))))),
  ]),
  command("dbnames", null, [
    set(sql, ds),
    dbExecute(sql, str("select name from players order by id"), variable("n")),
    send(
      player(),
      fmt(
        "names ",
        variable("n", fmt("name::", num(1))),
        " and ",
        variable("n", fmt("name::", num(2))),
      ),
    ),
  ]),
  command("dbbad", null, [
    set(sql, ds),
    dbExecute(sql, str("select * from missing_table"), variable("x")),
    send(player(), fmt("error: ", dbLastError())),
  ]),
);
