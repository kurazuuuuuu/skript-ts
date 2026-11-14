import {
  broadcast,
  cfError,
  cfId,
  cfOk,
  cfR2Presign,
  cfR2Put,
  cfSignedUrl,
  colored,
  command,
  equals,
  fmt,
  ifElse,
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
} from "../src/index.js";
import type { Script } from "../src/index.js";

// Resource-pack distribution (RP-3) over the R2 client (CF-3).
// This script is engine-only: presigned URLs and the Adventure
// pack offer have no Skript equivalents, so the build emits only
// packdist.ir.json and Skript-mode deployment skips it.
//
// The flow, per player join:
//   1. cfR2Put uploads the deployed pack zip
//      (plugins/skript-ts/packs/example.zip, placed there by the
//      CLI's pack deployment) to the "skript-ts-packs" bucket of
//      handle "packs". The language has no script-load trigger, so
//      the upload runs on join — a Put of the same key with the
//      same bytes is idempotent, and it doubles as the load-time
//      upload the design calls for.
//   2. On the put's cfResponse, cfR2Presign signs a one-hour GET
//      URL for the object. The cfResponse context restores the
//      joining player (the engine carries the originator's UUID
//      through every CF operation), so player() below is the
//      player who joined.
//   3. On the presign's cfResponse, sendResourcePack offers the
//      pack with the manifest's own sha1 / required flag.
//   4. onResourcePackStatus reports the client's answer back to
//      the player as a message ("pack status accepted" and so on),
//      which is also what the behavior test observes.
//
// The handle resolves from SKRIPTTS_CF_PACKS_ACCOUNT_ID,
// SKRIPTTS_CF_PACKS_R2_ACCESS_KEY_ID and
// SKRIPTTS_CF_PACKS_R2_SECRET_ACCESS_KEY (plus the stub-only
// SKRIPTTS_CF_PACKS_R2_ENDPOINT override in verification).
//
// Commands:
//   /packput      run the upload again under another id (the
//                 behavior test's quota gate uses it to observe a
//                 "quota" completion once the class-A limit is
//                 exhausted)
export const packdistScript: Script = script(
  onJoin([
    cfR2Put(
      "packup",
      "packs",
      str("skript-ts-packs"),
      str("example.zip"),
      str("packs/example.zip"),
    ),
  ]),
  command("packput", null, [
    cfR2Put(
      "packput",
      "packs",
      str("skript-ts-packs"),
      str("example.zip"),
      str("packs/example.zip"),
    ),
  ]),
  onCfResponse([
    ifElse(
      equals(cfId(), str("packup")),
      [
        ifElse(
          cfOk(),
          [cfR2Presign("packurl", "packs", str("skript-ts-packs"), str("example.zip"), 3600)],
          [broadcast(fmt("packdist[packup] error ", cfError()))],
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
                  // Feedback H3: the prompt accepts a general text
                  // expression, not only string/format literals —
                  // colored(str(...)) is the reported shape.
                  prompt: colored(str("&aこのサーバーではカスタムテクスチャを使います")),
                }),
              ],
              [broadcast(fmt("packdist[packurl] error ", cfError()))],
            ),
          ],
          [
            ifElse(
              equals(cfId(), str("packput")),
              [
                ifElse(
                  cfOk(),
                  [broadcast(str("packdist[packput] ok"))],
                  [broadcast(fmt("packdist[packput] error ", cfError()))],
                ),
              ],
              [],
            ),
          ],
        ),
      ],
    ),
  ]),
  onResourcePackStatus([send(player(), fmt("pack status ", resourcePackStatus()))]),
);
