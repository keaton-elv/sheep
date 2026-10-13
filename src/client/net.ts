// Talking to the farm: REST for actions, a WebSocket for live updates from the other farmer.

import { dayKey } from "../shared/calendar";
import {
  LAMB_MS,
  RETIRE_AFTER_MS,
  type BuyDecorInput,
  type Decoration,
  type FarmEvent,
  type FarmState,
  type NewSheepInput,
  type PetResult,
  type ServerMessage,
  type Sheep,
  type SheepPatch,
  type Weather,
} from "../shared/types";

const API = `${import.meta.env.BASE_URL}api`;

function randomId(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Unique per tab: lets us skip animations for things this tab already animated. */
export const clientId = randomId();

/** Unique per browser: each device can pet each sheep once a day. */
export const deviceId: string = (() => {
  try {
    let id = localStorage.getItem("farm.deviceId");
    if (!id) localStorage.setItem("farm.deviceId", (id = randomId()));
    return id;
  } catch {
    return clientId;
  }
})();

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Listener<T> = (value: T) => void;

class Emitter<T> {
  private fns = new Set<Listener<T>>();
  on(fn: Listener<T>): () => void {
    this.fns.add(fn);
    return () => this.fns.delete(fn);
  }
  emit(v: T): void {
    this.fns.forEach((fn) => fn(v));
  }
}

// ---------- store ----------

/** Offset to add to Date.now() to get server time (keeps "3 days in the pasture" honest). */
let clockSkew = 0;

export const store = {
  state: null as FarmState | null,
  weather: null as Weather | null,
  connected: false,
  changed: new Emitter<FarmState>(),
  /** Something happened on the farm. `own` = this tab caused it (already animated locally). */
  events: new Emitter<{ event: FarmEvent; own: boolean }>(),
  /** A sheep got petted. `own` = this tab did it. */
  pets: new Emitter<{ sheepId: string; own: boolean }>(),
  /** Fired when the server says we're not logged in (cookie expired / password changed). */
  unauthorized: new Emitter<void>(),
  connection: new Emitter<boolean>(),

  set(state: FarmState): void {
    clockSkew = state.serverNow - Date.now();
    this.state = state;
    this.changed.emit(state);
  },

  sheep(id: string): Sheep | undefined {
    return this.state?.sheep.find((s) => s.id === id);
  },
};

export function serverNow(): number {
  return Date.now() + clockSkew;
}

/** Sheared long enough ago that it has moved into the barn. */
export function isRetired(s: Sheep, now = serverNow()): boolean {
  return s.shearedAt !== null && now - s.shearedAt >= RETIRE_AFTER_MS;
}

export function pastureSheep(state = store.state): Sheep[] {
  return state ? state.sheep.filter((s) => !isRetired(s)) : [];
}

export function barnSheep(state = store.state): Sheep[] {
  return state ? state.sheep.filter((s) => isRetired(s)) : [];
}

/** Still a lamb (bought less than LAMB_MS ago). */
export function isLamb(s: Sheep, now = serverNow()): boolean {
  return now - s.createdAt < LAMB_MS;
}

export function doneSheep(state = store.state): Sheep[] {
  return state ? state.sheep.filter((s) => s.shearedAt !== null) : [];
}

// ---------- REST ----------

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      "X-Client-Id": clientId,
      ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
    },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  if (res.status === 401 && path !== "/login") store.unauthorized.emit();
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data as T;
}

/** After a mutation, pull fresh state in case the WebSocket is down. */
async function refreshIfOffline(): Promise<void> {
  if (!store.connected) store.set(await call<FarmState>("GET", "/state"));
}

export const api = {
  async me(): Promise<boolean> {
    try {
      await call("GET", "/me");
      return true;
    } catch {
      return false;
    }
  },

  async login(password: string): Promise<boolean> {
    try {
      await call("POST", "/login", { password });
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return false;
      throw e;
    }
  },

  async logout(): Promise<void> {
    await call("POST", "/logout");
  },

  async state(): Promise<FarmState> {
    const s = await call<FarmState>("GET", "/state");
    store.set(s);
    return s;
  },

  async weather(): Promise<Weather> {
    const w = await call<Weather>("GET", "/weather");
    store.weather = w;
    return w;
  },

  async addSheep(input: NewSheepInput): Promise<Sheep> {
    const s = await call<Sheep>("POST", "/sheep", input);
    await refreshIfOffline();
    return s;
  },

  async updateSheep(id: string, patch: SheepPatch): Promise<Sheep> {
    const s = await call<Sheep>("PATCH", `/sheep/${id}`, patch);
    await refreshIfOffline();
    return s;
  },

  /** "Sell" = delete the todo (the sheep goes to a nice farm upstate). */
  async sellSheep(id: string): Promise<void> {
    await call("DELETE", `/sheep/${id}`);
    await refreshIfOffline();
  },

  async pet(id: string): Promise<PetResult> {
    const r = await call<PetResult>("POST", `/sheep/${id}/pet`, { deviceId, day: dayKey(new Date()) });
    await refreshIfOffline();
    return r;
  },

  /** Omit `memory` to keep whatever memory the sheep already has. */
  async shear(id: string, memory?: string): Promise<FarmState> {
    const s = await call<FarmState>("POST", `/sheep/${id}/shear`, memory === undefined ? {} : { memory });
    store.set(s);
    return s;
  },

  async unshear(id: string): Promise<FarmState> {
    const s = await call<FarmState>("POST", `/sheep/${id}/unshear`);
    store.set(s);
    return s;
  },

  /** Put a hat on (costs HAT_COST cloth) or take it off with null (free). */
  async setHat(id: string, hat: number | null): Promise<Sheep> {
    const s = await call<Sheep>("POST", `/sheep/${id}/hat`, { hat });
    await refreshIfOffline();
    return s;
  },

  /** Put something picked up around the farm into the shared chest (key like "item.forage.blackberry"). */
  async collectItem(key: string): Promise<FarmState> {
    const s = await call<FarmState>("POST", "/items", { key });
    store.set(s);
    return s;
  },

  /** Complete a bundle (see shared/bundles.ts): its items leave the chest, cloth arrives. */
  async completeBundle(id: string): Promise<FarmState> {
    const s = await call<FarmState>("POST", `/bundles/${id}`);
    store.set(s);
    return s;
  },

  async loomStart(): Promise<FarmState> {
    const s = await call<FarmState>("POST", "/loom/start");
    store.set(s);
    return s;
  },

  async loomCollect(): Promise<FarmState> {
    const s = await call<FarmState>("POST", "/loom/collect");
    store.set(s);
    return s;
  },

  async buyDecor(input: BuyDecorInput): Promise<Decoration> {
    const d = await call<Decoration>("POST", "/decor", input);
    await refreshIfOffline();
    return d;
  },

  async moveDecor(id: string, fx: number, fy: number): Promise<void> {
    await call("PATCH", `/decor/${id}`, { fx, fy });
    await refreshIfOffline();
  },

  /** Put a decoration away (cloth is refunded). */
  async removeDecor(id: string): Promise<void> {
    await call("DELETE", `/decor/${id}`);
    await refreshIfOffline();
  },

  async renameFarm(farmName: string): Promise<FarmState> {
    const s = await call<FarmState>("PATCH", "/farm", { farmName });
    store.set(s);
    return s;
  },
};

// ---------- live updates ----------

let socket: WebSocket | null = null;
let retry = 0;
let pingTimer: number | undefined;
let pollTimer: number | undefined;

function setConnected(v: boolean): void {
  if (store.connected === v) return;
  store.connected = v;
  store.connection.emit(v);
}

export function connectLive(): void {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}${API}/ws?clientId=${encodeURIComponent(clientId)}`);
  socket = ws;

  ws.onopen = () => {
    retry = 0;
    setConnected(true);
    ws.send(JSON.stringify({ type: "hello", clientId }));
    clearInterval(pingTimer);
    pingTimer = window.setInterval(() => ws.readyState === WebSocket.OPEN && ws.send("ping"), 30_000);
  };

  ws.onmessage = (ev) => {
    if (typeof ev.data !== "string" || ev.data === "pong") return;
    let msg: ServerMessage;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg.type === "state") store.set(msg.state);
    else if (msg.type === "event") store.events.emit({ event: msg.event, own: msg.origin === clientId });
    else if (msg.type === "pet") store.pets.emit({ sheepId: msg.sheepId, own: msg.origin === clientId });
  };

  ws.onclose = () => {
    clearInterval(pingTimer);
    setConnected(false);
    if (socket !== ws) return;
    retry++;
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(retry, 5));
    setTimeout(async () => {
      // A failing socket might mean we got logged out; /me tells us (and fires `unauthorized`).
      if (await api.me()) connectLive();
    }, delay);
  };

  // Belt and braces: if the socket is down, poll every 30s so the farm never goes stale.
  clearInterval(pollTimer);
  pollTimer = window.setInterval(() => {
    if (!store.connected && document.visibilityState === "visible") api.state().catch(() => {});
  }, 30_000);
}

// Coming back to the tab: resync immediately (phones freeze background sockets).
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !store.state) return;
  api.state().catch(() => {});
  if (socket && socket.readyState !== WebSocket.OPEN && socket.readyState !== WebSocket.CONNECTING) connectLive();
});
