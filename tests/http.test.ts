import { describe, expect, it } from "vitest";
import {
  command,
  emit,
  emitIr,
  env,
  httpBody,
  httpDownload,
  httpError,
  httpFetch,
  httpId,
  httpOk,
  httpSavedPath,
  httpStatus,
  isEngineOnlyScript,
  onHttpResponse,
  player,
  script,
  send,
  set,
  str,
  variable,
} from "../src/index.js";
import { welcomeScript } from "../examples/welcome.js";

describe("http/env builtin slice (phase 26, engine-only)", () => {
  it("builds httpFetch and httpDownload IR with optional timeouts", () => {
    type FetchStmt = {
      kind: string;
      id: string;
      url: { kind: string; value: string };
      timeoutSeconds?: number;
    };
    type FetchIr = { body: { body: FetchStmt[] }[] };

    const fetchPlainScript = script(
      command("fetch", null, [httpFetch("req1", str("https://example.com/data"))]),
    );
    const fetchPlain = JSON.parse(emitIr(fetchPlainScript)) as FetchIr;
    const fetchPlainStmt = fetchPlain.body[0]?.body[0];
    expect(fetchPlainStmt?.kind).toBe("httpFetch");
    expect(fetchPlainStmt?.id).toBe("req1");
    expect(fetchPlainStmt?.url).toEqual({ kind: "string", value: "https://example.com/data" });
    expect(fetchPlainStmt?.timeoutSeconds).toBeUndefined();

    const fetchTimedScript = script(
      command("fetch", null, [
        httpFetch("req1", str("https://example.com/data"), { timeoutSeconds: 30 }),
      ]),
    );
    const fetchTimed = JSON.parse(emitIr(fetchTimedScript)) as FetchIr;
    const fetchTimedStmt = fetchTimed.body[0]?.body[0];
    expect(fetchTimedStmt?.kind).toBe("httpFetch");
    expect(fetchTimedStmt?.id).toBe("req1");
    expect(fetchTimedStmt?.url).toEqual({ kind: "string", value: "https://example.com/data" });
    expect(fetchTimedStmt?.timeoutSeconds).toBe(30);

    type DownloadStmt = FetchStmt & { path: { kind: string; value: string } };
    type DownloadIr = { body: { body: DownloadStmt[] }[] };

    const downloadPlainScript = script(
      command("download", null, [
        httpDownload("dl1", str("https://example.com/f.zip"), str("downloads/f.zip")),
      ]),
    );
    const downloadPlain = JSON.parse(emitIr(downloadPlainScript)) as DownloadIr;
    const downloadPlainStmt = downloadPlain.body[0]?.body[0];
    expect(downloadPlainStmt?.kind).toBe("httpDownload");
    expect(downloadPlainStmt?.id).toBe("dl1");
    expect(downloadPlainStmt?.url).toEqual({ kind: "string", value: "https://example.com/f.zip" });
    expect(downloadPlainStmt?.path).toEqual({ kind: "string", value: "downloads/f.zip" });
    expect(downloadPlainStmt?.timeoutSeconds).toBeUndefined();

    const downloadTimedScript = script(
      command("download", null, [
        httpDownload("dl1", str("https://example.com/f.zip"), str("downloads/f.zip"), {
          timeoutSeconds: 5,
        }),
      ]),
    );
    const downloadTimed = JSON.parse(emitIr(downloadTimedScript)) as DownloadIr;
    const downloadTimedStmt = downloadTimed.body[0]?.body[0];
    expect(downloadTimedStmt?.kind).toBe("httpDownload");
    expect(downloadTimedStmt?.id).toBe("dl1");
    expect(downloadTimedStmt?.url).toEqual({ kind: "string", value: "https://example.com/f.zip" });
    expect(downloadTimedStmt?.path).toEqual({ kind: "string", value: "downloads/f.zip" });
    expect(downloadTimedStmt?.timeoutSeconds).toBe(5);
  });

  it("builds http response events and http/env expressions", () => {
    const eventScript = script(onHttpResponse([send(player(), httpBody())]));
    const eventIr = JSON.parse(emitIr(eventScript)) as {
      body: {
        kind: string;
        event?: string;
        body?: { kind: string; message?: { kind: string } }[];
      }[];
    };
    const eventTop = eventIr.body[0];
    expect(eventTop).toMatchObject({ kind: "event", event: "httpResponse" });
    const sendStmt = eventTop?.body?.[0];
    expect(sendStmt?.kind).toBe("send");
    expect(sendStmt?.message?.kind).toBe("httpBody");

    const envScript = script(command("env", null, [set(variable("tok"), env(str("MY_TOKEN")))]));
    const envIr = JSON.parse(emitIr(envScript)) as {
      body: {
        body?: {
          kind: string;
          value?: { kind: string; name?: { kind: string; value: string } };
        }[];
      }[];
    };
    const setStmt = envIr.body[0]?.body?.[0];
    expect(setStmt?.kind).toBe("setVar");
    expect(setStmt?.value?.kind).toBe("envVar");
    expect(setStmt?.value?.name).toEqual({ kind: "string", value: "MY_TOKEN" });

    expect(httpId().kind).toBe("httpId");
    expect(httpStatus().kind).toBe("httpStatus");
    expect(httpBody().kind).toBe("httpBody");
    expect(httpError().kind).toBe("httpError");
    expect(httpSavedPath().kind).toBe("httpSavedPath");
    expect(httpOk().kind).toBe("httpOk");
    expect(env(str("MY_TOKEN")).kind).toBe("envVar");
  });

  it("marks http/env constructs as engine-only", () => {
    expect(
      isEngineOnlyScript(
        script(command("fetch", null, [httpFetch("req1", str("https://example.com"))])),
      ),
    ).toBe(true);
    expect(isEngineOnlyScript(script(onHttpResponse([send(player(), httpBody())])))).toBe(true);
    expect(
      isEngineOnlyScript(
        script(command("env", null, [set(variable("tok"), env(str("MY_TOKEN")))])),
      ),
    ).toBe(true);
    expect(isEngineOnlyScript(welcomeScript)).toBe(false);
  });

  it("refuses to emit http constructs to .sk", () => {
    const scriptWithHttpFetch = script(
      command("fetch", null, [httpFetch("req1", str("https://example.com"))]),
    );
    expect(() => emit(scriptWithHttpFetch)).toThrow(/Unhandled/);
  });

  it("validates http ids and timeout bounds", () => {
    expect(() => httpFetch("", str("https://example.com"))).toThrow(RangeError);
    expect(() => httpFetch("   ", str("https://example.com"))).toThrow(RangeError);
    expect(() => httpDownload("", str("https://example.com"), str("x"))).toThrow(RangeError);
    for (const timeoutSeconds of [0, 121, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => httpFetch("a", str("https://example.com"), { timeoutSeconds })).toThrow(
        RangeError,
      );
    }
    expect(() => httpFetch("a", str("https://example.com"), { timeoutSeconds: 1 })).not.toThrow();
    expect(() => httpFetch("a", str("https://example.com"), { timeoutSeconds: 120 })).not.toThrow();
  });
});
