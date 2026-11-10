export type StageStatus = "passed" | "failed";

export interface StageHandle {
  update(detail: string): void;
  finish(status: StageStatus, note?: string): void;
}

export interface ProgressReporter {
  begin(name: string): StageHandle;
}

export function createProgress(opts: { stream: NodeJS.WriteStream; tty: boolean }): ProgressReporter {
  let active: {
    name: string;
    start: number;
    detail: string;
    hasDetail: boolean;
    finished: boolean;
    timer: NodeJS.Timeout | null;
    handle: StageHandle;
  } | null = null;

  function elapsed(stage: { start: number }): string {
    return ((Date.now() - stage.start) / 1000).toFixed(1);
  }

  function inProgressLine(stage: {
    name: string;
    start: number;
    detail: string;
    hasDetail: boolean;
  }): string {
    let line = `… ${stage.name}`;
    if (stage.hasDetail) {
      line += ` — ${stage.detail}`;
    }
    line += ` (${elapsed(stage)}s)`;
    return line;
  }

  function finalLine(
    stage: { name: string; start: number },
    status: StageStatus,
    note?: string,
  ): string {
    const mark = status === "passed" ? "✓" : "✗";
    let line = `${mark} ${stage.name}`;
    if (note !== undefined) {
      line += ` — ${note}`;
    }
    line += ` (${elapsed(stage)}s)`;
    return line;
  }

  function renderProgress(stage: {
    name: string;
    start: number;
    detail: string;
    hasDetail: boolean;
  }): void {
    opts.stream.write("\r\x1b[2K" + inProgressLine(stage));
  }

  return {
    begin(name: string): StageHandle {
      if (active !== null) {
        throw new Error("A stage is already active");
      }

      const stage = {
        name,
        start: Date.now(),
        detail: "",
        hasDetail: false,
        finished: false,
        timer: null as NodeJS.Timeout | null,
        handle: null as unknown as StageHandle,
      };

      const handle: StageHandle = {
        update(detail: string): void {
          if (stage.finished || active !== stage) {
            return;
          }
          stage.detail = detail;
          stage.hasDetail = true;
          if (opts.tty) {
            renderProgress(stage);
          } else {
            opts.stream.write(inProgressLine(stage) + "\n");
          }
        },
        finish(status: StageStatus, note?: string): void {
          if (stage.finished || active !== stage) {
            return;
          }
          stage.finished = true;
          if (stage.timer !== null) {
            clearInterval(stage.timer);
            stage.timer = null;
          }
          const line = finalLine(stage, status, note);
          if (opts.tty) {
            opts.stream.write("\r\x1b[2K" + line + "\n");
          } else {
            opts.stream.write(line + "\n");
          }
          active = null;
        },
      };

      stage.handle = handle;
      active = stage;

      if (opts.tty) {
        stage.timer = setInterval(() => {
          if (!stage.finished && active === stage) {
            renderProgress(stage);
          }
        }, 100);
        if (stage.timer !== null && typeof stage.timer.unref === "function") {
          stage.timer.unref();
        }
        renderProgress(stage);
      } else {
        opts.stream.write(inProgressLine(stage) + "\n");
      }

      return handle;
    },
  };
}