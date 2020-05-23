/**
 * esm-hmr/runtime.ts
 * A client-side implementation of the ESM-HMR spec, for reference.
 */

type AcceptCallback = (args: { module: any; data: any }) => void;
type DisposeCallback = (args: { data: any }) => void;

function debug(...args: any[]) {
  console.log("[ESM-HMR]", ...args);
}
function reload() {
  location.reload(true);
}

const REGISTERED_MODULES: { [key: string]: HotModuleState } = {};

class HotModuleState {
  id: string;
  isLocked: boolean = false;
  isDeclined: boolean = false;
  acceptCallbacks: (true | AcceptCallback)[] = [];
  disposeCallbacks: DisposeCallback[] = [];

  constructor(id: string) {
    this.id = id;
  }

  lock(): void {
    this.isLocked = true;
  }

  dispose(callback: DisposeCallback): void {
    this.disposeCallbacks.push(callback);
  }

  accept(callback: true | AcceptCallback = true): void {
    if (this.isLocked) {
      return;
    }
    this.acceptCallbacks.push(callback);
  }

  invalidate(): void {
    reload();
  }

  decline(): void {
    this.isDeclined = true;
  }
}

export function createHotContext(fullUrl: string) {
  const id = new URL(fullUrl).pathname;
  const existing = REGISTERED_MODULES[id];
  if (existing) {
    existing.lock();
    return existing;
  }
  const state = new HotModuleState(id);
  REGISTERED_MODULES[id] = state;
  return state;
}

async function applyUpdate(id: string) {
  const state = REGISTERED_MODULES[id];
  if (!state || !id.endsWith(".js")) {
    return false;
  }
  if (state.isDeclined) {
    return false;
  }

  const data = {};
  const acceptCallbacks = state.acceptCallbacks;
  const disposeCallbacks = state.disposeCallbacks;
  state.disposeCallbacks = [];

  disposeCallbacks.map((callback) => callback({ data }));
  if (acceptCallbacks.length > 0) {
    const module = await import(id + `?mtime=${Date.now()}`);
    acceptCallbacks.forEach((callback) => {
      if (callback === true) {
        // Do nothing, importing the module side-effects was enough.
      } else {
        callback({ module, data });
      }
    });
  }

  return true;
}

const socket = new WebSocket("ws://localhost:12321/");

socket.addEventListener("open", function (event) {
  console.log("conenction opened");
});

socket.addEventListener("message", ({ data: _data }) => {
  console.log("incoming", _data);
  if (!_data) {
    return;
  }
  const data = JSON.parse(_data);
  if (data.type === "reload") {
    debug("message: reload");
    reload();
    return;
  }
  if (data.type !== "update") {
    debug("message: unknown", data);
    return;
  }
  debug("message: update", data);
  debug(data.url, Object.keys(REGISTERED_MODULES));
  applyUpdate(data.url)
    .then((ok) => {
      if (!ok) {
        reload();
      }
    })
    .catch((err) => {
      console.error(err);
      reload();
    });
});

debug("listening for file changes...");
