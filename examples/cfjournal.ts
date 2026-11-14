import {
  broadcast,
  cfD1Query,
  cfId,
  cfOk,
  cfR2Presign,
  cfR2Put,
  cfSignedUrl,
  command,
  equals,
  fmt,
  ifElse,
  nameOf,
  num,
  onCfResponse,
  onJoin,
  onResourcePackStatus,
  packRequired,
  packSha1,
  player,
  resourcePackStatus,
  script,
  send,
  sendResourcePack,
  str,
  variable,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// Integrated Cloudflare sample (M4 CF-4): D1 and R2 working
// together in one flow — a join journal with resource-pack
// distribution. This script is engine-only: D1 queries, signed
// R2 URLs and the Adventure pack offer have no Skript
// equivalents, so the build emits only cfjournal.ir.json and
// Skript-mode deployment skips it.
//
// The flow:
//   1. On join, the script creates its D1 table if needed
//      (CREATE TABLE IF NOT EXISTS keeps the sample
//      self-contained) and uploads the deployed pack zip
//      (plugins/skript-ts/packs/example.zip) to R2. The upload
//      doubles as the load-time upload from the RP-3 design:
//      the language has no script-load trigger, a Put of the
//      same key with the same bytes is idempotent.
//   2. The create's completion inserts the join event; the
//      put's completion presigns a one-hour GET URL; the
//      presign's completion offers the pack with the manifest's
//      own sha1 / required flag. Insert values are bound
//      parameters, never inlined into the SQL text.
//   3. onResourcePackStatus reports each client answer back to
//      the player, and a "successfully_loaded" answer is
//      journaled into D1 as a second event kind.
//   4. /cfjstats reads the two event counts back out of D1 and
//      broadcasts them ("cfjournal joins N", then
//      "cfjournal pack loads N").
//
// Two handles are used: "default" for D1 (SKRIPTTS_CF_TOKEN,
// SKRIPTTS_CF_ACCOUNT_ID and SKRIPTTS_CF_D1_DATABASE_ID) and
// "journal" for R2 (SKRIPTTS_CF_JOURNAL_ACCOUNT_ID,
// SKRIPTTS_CF_JOURNAL_R2_ACCESS_KEY_ID and
// SKRIPTTS_CF_JOURNAL_R2_SECRET_ACCESS_KEY, plus the stub-only
// SKRIPTTS_CF_JOURNAL_R2_ENDPOINT override in verification).
// Scripts name handles, buckets and keys — never credentials.
//
// Error completions are deliberately silent: a journal must
// not spam the chat when the infrastructure is down, so the
// only observable outputs are the per-player status messages
// and the stats broadcasts. (cloudflare.ts is the diagnostic
// counterpart that reports every error kind.)
export const cfjournalScript: Script = script(
  onJoin([
    cfD1Query(
      "jcreate",
      "default",
      str(
        "create table if not exists pack_events (id integer primary key, player text, kind text)",
      ),
    ),
    cfR2Put(
      "packup",
      "journal",
      str("skript-ts-packs"),
      str("example.zip"),
      str("packs/example.zip"),
    ),
  ]),
  command("cfjstats", null, [
    cfD1Query(
      "joins",
      "default",
      str("select count(*) as total from pack_events where kind = 'join'"),
      variable("jcount"),
    ),
  ]),
  onCfResponse([
    ifElse(
      equals(cfId(), str("jcreate")),
      [
        ifElse(
          cfOk(),
          [
            cfD1Query(
              "jlog",
              "default",
              fmt("insert into pack_events (player, kind) values (", nameOf(player()), ", 'join')"),
            ),
          ],
          [],
        ),
      ],
      [
        ifElse(
          equals(cfId(), str("packup")),
          [
            ifElse(
              cfOk(),
              [cfR2Presign("packurl", "journal", str("skript-ts-packs"), str("example.zip"), 3600)],
              [],
            ),
          ],
          [
            ifElse(
              equals(cfId(), str("packurl")),
              [
                ifElse(
                  cfOk(),
                  [
                    sendResourcePack(player(), cfSignedUrl(), packSha1("example"), {
                      required: packRequired("example"),
                      prompt: str("このサーバーではカスタムテクスチャを使います"),
                    }),
                  ],
                  [],
                ),
              ],
              [
                ifElse(
                  equals(cfId(), str("joins")),
                  [
                    ifElse(
                      cfOk(),
                      [
                        broadcast(
                          fmt("cfjournal joins ", variable("jcount", fmt("total::", num(1)))),
                        ),
                        cfD1Query(
                          "loads",
                          "default",
                          str(
                            "select count(*) as total from pack_events where kind = 'pack_loaded'",
                          ),
                          variable("lcount"),
                        ),
                      ],
                      [],
                    ),
                  ],
                  [
                    ifElse(
                      equals(cfId(), str("loads")),
                      [
                        ifElse(
                          cfOk(),
                          [
                            broadcast(
                              fmt(
                                "cfjournal pack loads ",
                                variable("lcount", fmt("total::", num(1))),
                              ),
                            ),
                          ],
                          [],
                        ),
                      ],
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
  ]),
  onResourcePackStatus([
    send(player(), fmt("cfjournal status ", resourcePackStatus())),
    ifElse(
      equals(resourcePackStatus(), str("successfully_loaded")),
      [
        cfD1Query(
          "plog",
          "default",
          fmt(
            "insert into pack_events (player, kind) values (",
            nameOf(player()),
            ", 'pack_loaded')",
          ),
        ),
      ],
      [],
    ),
  ]),
);
