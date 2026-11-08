import type { WorkerCommand, WorkerRequest, WorkerResponse } from "./worker-protocol";

interface PendingRequest {
  id: number;
  command: WorkerCommand;
  transfer: Transferable[];
  resolve: (response: WorkerResponse) => void;
  reject: (error: Error) => void;
}

const queue: PendingRequest[] = [];
let active: PendingRequest | undefined;
let nextId = 0;
let workerGeneration = 0;
let worker: Worker;

function replaceWorker(instance: Worker): void {
  instance.terminate();
  workerGeneration += 1;
  worker = createWorker();
}

function createWorker(): Worker {
  const instance = new Worker(new URL("./photo-worker.ts", import.meta.url), { type: "module" });
  instance.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
    if (instance !== worker || !active || active.id !== event.data.id) return;
    const finished = active;
    active = undefined;
    if ("error" in event.data) {
      if (finished.command.type === "colorize") replaceWorker(instance);
      finished.reject(new Error(event.data.error));
    } else finished.resolve(event.data);
    runNext();
  });
  instance.addEventListener("error", () => {
    if (instance !== worker) return;
    const error = new Error("Die Bildverarbeitung wurde unterbrochen. Bitte versuchen Sie es erneut.");
    active?.reject(error);
    active = undefined;
    for (const pending of queue.splice(0)) pending.reject(error);
    replaceWorker(instance);
  });
  return instance;
}

function runNext(): void {
  if (active || !queue.length) return;
  active = queue.shift();
  const request = { ...active!.command, id: active!.id } as WorkerRequest;
  try {
    worker.postMessage(request, active!.transfer);
  } catch (error) {
    const failed = active!;
    active = undefined;
    failed.reject(error instanceof Error ? error : new Error("Die Bildverarbeitung konnte nicht gestartet werden."));
    runNext();
  }
}

worker = createWorker();

export function requestWorker(command: WorkerCommand, transfer: Transferable[] = []): Promise<WorkerResponse> {
  return new Promise((resolve, reject) => {
    queue.push({ id: ++nextId, command, transfer, resolve, reject });
    runNext();
  });
}

export function terminateWorker(): void {
  worker.terminate();
}

export function getWorkerGeneration(): number {
  return workerGeneration;
}
