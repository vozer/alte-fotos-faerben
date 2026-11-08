import { describe, expect, it, vi } from "vitest";
import { cleanThenLaunch, launchWhenReady } from "../src/main/startup";

describe("app startup cleanup", () => {
  it("opens the app and reports cleanup errors", async () => {
    const launch = vi.fn(() => "window");
    const report = vi.fn();

    await cleanThenLaunch(
      async () => { throw new Error("permission denied"); },
      launch,
      report,
    );

    expect(launch).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith("window");
  });

  it("quits a duplicate instance only after Electron is ready", async () => {
    let markReady!: () => void;
    const ready = new Promise<void>((resolve) => { markReady = resolve; });
    const quit = vi.fn();
    const launch = vi.fn();
    const startup = launchWhenReady(false, ready, quit, launch);

    expect(quit).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
    markReady();
    await startup;
    expect(quit).toHaveBeenCalledOnce();
    expect(launch).not.toHaveBeenCalled();
  });

  it("launches the first instance after Electron is ready", async () => {
    const quit = vi.fn();
    const launch = vi.fn(() => "window");
    await launchWhenReady(true, Promise.resolve(), quit, launch);
    expect(launch).toHaveBeenCalledOnce();
    expect(quit).not.toHaveBeenCalled();
  });
});
