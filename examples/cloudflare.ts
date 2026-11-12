import {
  broadcast,
  cfD1Query,
  cfError,
  cfId,
  cfOk,
  command,
  equals,
  fmt,
  ifElse,
  num,
  onCfResponse,
  script,
  str,
  variable,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// Cloudflare D1 builtin slice (M4 CF-1). This script is
// engine-only: the Cloudflare client lives in the skript-ts engine
// jar, so there is no .sk form of this file. The build emits only
// cloudflare.ir.json and Skript-mode deployment skips it.
//
// Scripts name a handle; the engine resolves it from SKRIPTTS_CF_*
// environment variables, so credentials never appear in scripts or
// IR. For handle "default": SKRIPTTS_CF_TOKEN,
// SKRIPTTS_CF_ACCOUNT_ID and SKRIPTTS_CF_D1_DATABASE_ID (the
// SKRIPTTS_CF_DEFAULT_* spellings also work). Other handles use
// only their own SKRIPTTS_CF_<HANDLE>_* variables.
//
// Requests are asynchronous: a cfD1Query statement returns
// immediately and the result arrives later through the
// onCfResponse event, which branches on cfId(). The SQL's
// expression parts are bound parameters, never inlined, so the
// value in /cfadd — a quote inside it — is data, not SQL syntax.
// D1 over REST has no session consistency: a read right after a
// write can observe older data on the real service.
//
// Commands:
//   /cfcreate     create the notes table if needed
//   /cfadd        insert one row (parameter-bound), report the
//                 affected-row count the store variable received
//   /cfread       read all rows into {rows}, report the count and
//                 the first row's body
//   /cfcount      report the row count via a count(*) query
//   /cfbadsql     run malformed SQL, report the error kind (api)
//   /cfbadhandle  query through an unconfigured handle, report
//                 the error kind (policy)
//   /cfauth       query through a handle whose token is wrong in
//                 the verification environment, report the error
//                 kind (auth)
export const cloudflareScript: Script = script(
  command("cfcreate", null, [
    cfD1Query(
      "create",
      "default",
      str("create table if not exists notes (id integer primary key, body text)"),
    ),
  ]),
  command("cfadd", null, [
    cfD1Query(
      "add",
      "default",
      fmt("insert into notes (body) values (", str("it's bound"), ")"),
      variable("added"),
    ),
  ]),
  command("cfread", null, [
    cfD1Query("read", "default", str("select id, body from notes order by id"), variable("rows")),
  ]),
  command("cfcount", null, [
    cfD1Query("count", "default", str("select count(*) as total from notes"), variable("c")),
  ]),
  command("cfbadsql", null, [cfD1Query("badsql", "default", str("selec from where"))]),
  command("cfbadhandle", null, [cfD1Query("badhandle", "bogus", str("select 1"))]),
  command("cfauth", null, [cfD1Query("auth", "badauth", str("select 1"))]),
  onCfResponse([
    ifElse(
      equals(cfId(), str("create")),
      [
        ifElse(
          cfOk(),
          [broadcast(str("cf[create] ok"))],
          [broadcast(fmt("cf[create] error ", cfError()))],
        ),
      ],
      [
        ifElse(
          equals(cfId(), str("add")),
          [
            ifElse(
              cfOk(),
              [broadcast(fmt("cf[add] ok added ", variable("added")))],
              [broadcast(fmt("cf[add] error ", cfError()))],
            ),
          ],
          [
            ifElse(
              equals(cfId(), str("read")),
              [
                ifElse(
                  cfOk(),
                  [
                    broadcast(
                      fmt(
                        "cf[read] rows ",
                        variable("rows"),
                        " first ",
                        variable("rows", fmt("body::", num(1))),
                      ),
                    ),
                  ],
                  [broadcast(fmt("cf[read] error ", cfError()))],
                ),
              ],
              [
                ifElse(
                  equals(cfId(), str("count")),
                  [
                    ifElse(
                      cfOk(),
                      [broadcast(fmt("cf[count] total ", variable("c", fmt("total::", num(1)))))],
                      [broadcast(fmt("cf[count] error ", cfError()))],
                    ),
                  ],
                  [
                    ifElse(
                      equals(cfId(), str("badsql")),
                      [broadcast(fmt("cf[badsql] error ", cfError()))],
                      [
                        ifElse(
                          equals(cfId(), str("badhandle")),
                          [broadcast(fmt("cf[badhandle] error ", cfError()))],
                          [
                            ifElse(
                              equals(cfId(), str("auth")),
                              [broadcast(fmt("cf[auth] error ", cfError()))],
                              [],
                            ),
                          ],
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ],
    ),
  ]),
);
