export async function launchWhenReady<T>(
  hasInstanceLock: boolean,
  ready: Promise<unknown>,
  quit: () => void,
  launch: () => T,
): Promise<T | undefined> {
  await ready;
  if (!hasInstanceLock) {
    quit();
    return undefined;
  }
  return launch();
}

export async function cleanThenLaunch<T>(
  cleanup: () => Promise<void>,
  launch: () => T,
  report: (instance: T) => void,
): Promise<T> {
  let cleanupFailed = false;
  try {
    await cleanup();
  } catch {
    cleanupFailed = true;
  }
  const instance = launch();
  if (cleanupFailed) report(instance);
  return instance;
}
