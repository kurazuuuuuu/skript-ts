import {
  broadcast,
  command,
  equals,
  fileContents,
  fmt,
  httpBody,
  httpDownload,
  httpError,
  httpFetch,
  httpId,
  httpOk,
  httpSavedPath,
  httpStatus,
  ifElse,
  onHttpResponse,
  player,
  script,
  send,
  str,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// HTTP builtin slice (phase 26). This script is engine-only: the
// HTTP client lives in the skript-ts engine jar, so there is no .sk
// form of this file. The build emits only http.ir.json and
// Skript-mode deployment skips it.
//
// Requests are asynchronous: a fetch/download statement returns
// immediately and the result arrives later through the
// onHttpResponse event, which branches on httpId(). The commands
// below target a local echo server that the behavior test stands
// up at 127.0.0.1:8792 — reaching it requires the sandbox
// config.json to enable http.allowPrivateAddresses, since loopback
// addresses are refused by the engine's URL policy by default.
// /httppolicy and /httpuserinfo exercise refusals that stay in
// force even then: a non-http(s) scheme, and a URL with embedded
// userinfo, both fail with error kind "policy".
//
// Commands:
//   /httphello        fetch /hello, report status and body
//   /httpmissing      fetch /status/404, report status and body
//   /httpredirect     fetch /redirect (302 to /hello), reported
//                     after the redirect is followed
//   /httpbig          fetch /big (9 MiB body, over the size cap),
//                     report the error kind
//   /httpslow         fetch /slow with a 2 second timeout,
//                     report the error kind
//   /httppolicy       fetch a file: URL, report the error kind
//   /httpuserinfo     fetch a URL with userinfo, report the error
//   /httpdl           download /hello to dl/hello.txt in the
//                     engine's files root, report the saved path
//   /httpread         send the downloaded file's contents back
export const httpScript: Script = script(
  command("httphello", null, [httpFetch("hello", str("http://127.0.0.1:8792/hello"))]),
  command("httpmissing", null, [httpFetch("missing", str("http://127.0.0.1:8792/status/404"))]),
  command("httpredirect", null, [httpFetch("redir", str("http://127.0.0.1:8792/redirect"))]),
  command("httpbig", null, [httpFetch("big", str("http://127.0.0.1:8792/big"))]),
  command("httpslow", null, [httpFetch("slow", str("http://127.0.0.1:8792/slow"), { timeoutSeconds: 2 })]),
  command("httppolicy", null, [httpFetch("pol", str("file:///etc/passwd"))]),
  command("httpuserinfo", null, [httpFetch("ui", str("http://user:pass@127.0.0.1:8792/hello"))]),
  command("httpdl", null, [httpDownload("dl", str("http://127.0.0.1:8792/hello"), str("dl/hello.txt"))]),
  command("httpread", null, [
    send(player(), fmt("dl text ", fileContents(str("dl/hello.txt")))),
  ]),
  onHttpResponse([
    ifElse(
      equals(httpId(), str("hello")),
      [broadcast(fmt("http[hello] status ", httpStatus(), " body ", httpBody()))],
      [
        ifElse(
          equals(httpId(), str("missing")),
          [broadcast(fmt("http[missing] status ", httpStatus(), " body ", httpBody()))],
          [
            ifElse(
              equals(httpId(), str("redir")),
              [broadcast(fmt("http[redir] status ", httpStatus(), " body ", httpBody()))],
              [
                ifElse(
                  equals(httpId(), str("big")),
                  [broadcast(fmt("http[big] error ", httpError()))],
                  [
                    ifElse(
                      equals(httpId(), str("slow")),
                      [broadcast(fmt("http[slow] error ", httpError()))],
                      [
                        ifElse(
                          equals(httpId(), str("pol")),
                          [broadcast(fmt("http[pol] error ", httpError()))],
                          [
                            ifElse(
                              equals(httpId(), str("ui")),
                              [broadcast(fmt("http[ui] error ", httpError()))],
                              [
                                ifElse(equals(httpId(), str("dl")), [
                                  ifElse(
                                    httpOk(),
                                    [broadcast(fmt("http[dl] ok ", httpSavedPath()))],
                                    [broadcast(fmt("http[dl] error ", httpError()))],
                                  ),
                                ]),
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
      ],
    ),
  ]),
);
