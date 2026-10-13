import { DurableObject } from "cloudflare:workers";
import {
  DECOR_COST,
  HAT_COST,
  LOOM_DURATION_MS,
  LOOM_WOOL_COST,
  MAX_PETS,
  type BuyDecorInput,
  type Category,
  type DecorKind,
  type Decoration,
  type FarmEvent,
  type FarmEventKind,
  type FarmState,
  type MoveDecorInput,
  type NewSheepInput,
  type PetResult,
  type ServerMessage,
  type Sheep,
  type SheepPatch,
} from "../shared/types";

export type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (status: number, error: string): Result<never> => ({ ok: false, status, error });

const DEFAULT_FARM_NAME = "Papa Snickers's Sheep Farm";
const EVENT_CAP = 50;
/** Roughly 1 in 20 sheep shows up golden. */
const GOLDEN_CHANCE = 0.05;

type SheepRow = {
  id: string;
  name: string;
  notes: string;
  link: string;
  category: string;
  date: string | null;
  created_at: number;
  pets: number;
  last_pet_at: number | null;
  sheared_at: number | null;
  memory: string;
  golden: number;
  seed: number;
  hat: number | null;
  original_name: string | null;
  original_returns: number | null;
};

type DecorRow = { id: string; kind: string; fx: number; fy: number; variant: number; created_at: number };
type EventRow = { id: number; at: number; kind: string; subject: string; sheep_id: string | null };

function toSheep(r: SheepRow): Sheep {
  return {
    id: r.id,
    name: r.name,
    notes: r.notes,
    link: r.link,
    category: r.category as Category,
    date: r.date,
    createdAt: r.created_at,
    pets: r.pets,
    lastPetAt: r.last_pet_at,
    shearedAt: r.sheared_at,
    memory: r.memory,
    golden: r.golden === 1,
    seed: r.seed,
    hat: r.hat ?? null,
    originalName: r.original_name ?? r.name,
    originalReturns: r.original_returns ?? 0,
  };
}

function toDecor(r: DecorRow): Decoration {
  return { id: r.id, kind: r.kind as DecorKind, fx: r.fx, fy: r.fy, variant: r.variant, createdAt: r.created_at };
}

function toEvent(r: EventRow): FarmEvent {
  return { id: r.id, at: r.at, kind: r.kind as FarmEventKind, subject: r.subject, sheepId: r.sheep_id };
}

/** The one and only farm. Holds every sheep and broadcasts changes to open tabs. */
export class Farm extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => this.migrate());
    // Keep-alive pings are answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  private migrate(): void {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS sheep (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        link TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'other',
        date TEXT,
        created_at INTEGER NOT NULL,
        pets INTEGER NOT NULL DEFAULT 0,
        last_pet_at INTEGER,
        sheared_at INTEGER,
        memory TEXT NOT NULL DEFAULT '',
        golden INTEGER NOT NULL DEFAULT 0,
        seed INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pets (
        sheep_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        day TEXT NOT NULL,
        PRIMARY KEY (sheep_id, device_id, day)
      );
      CREATE TABLE IF NOT EXISTS decorations (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        fx REAL NOT NULL,
        fy REAL NOT NULL,
        variant INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL,
        kind TEXT NOT NULL,
        subject TEXT NOT NULL,
        sheep_id TEXT
      );
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    // v2: hats. SQLite has no "ADD COLUMN IF NOT EXISTS", so check the schema first.
    const cols = this.sql.exec<{ name: string }>(`PRAGMA table_info(sheep)`).toArray();
    if (!cols.some((c) => c.name === "hat")) this.sql.exec(`ALTER TABLE sheep ADD COLUMN hat INTEGER`);
    // v3: ORIGINAL PLAN. Existing sheep's current name becomes their original.
    if (!cols.some((c) => c.name === "original_name")) {
      this.sql.exec(`ALTER TABLE sheep ADD COLUMN original_name TEXT`);
      this.sql.exec(`ALTER TABLE sheep ADD COLUMN original_returns INTEGER NOT NULL DEFAULT 0`);
      this.sql.exec(`UPDATE sheep SET original_name = name WHERE original_name IS NULL`);
    }
    this.sql.exec(
      `INSERT OR IGNORE INTO meta (key, value) VALUES ('farm_name', ?), ('founded_at', ?), ('wool', '0'), ('cloth', '0'), ('total_wool', '0')`,
      DEFAULT_FARM_NAME,
      String(Date.now()),
    );
  }

  // ---------- meta helpers ----------

  private getMeta(key: string): string | null {
    const rows = this.sql.exec<{ value: string }>(`SELECT value FROM meta WHERE key = ?`, key).toArray();
    return rows[0]?.value ?? null;
  }

  private getNum(key: string): number {
    return Number(this.getMeta(key) ?? 0);
  }

  private setMeta(key: string, value: string | number | null): void {
    if (value === null) this.sql.exec(`DELETE FROM meta WHERE key = ?`, key);
    else this.sql.exec(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`, key, String(value));
  }

  private findSheep(id: string): Sheep | null {
    const rows = this.sql.exec<SheepRow>(`SELECT * FROM sheep WHERE id = ?`, id).toArray();
    return rows[0] ? toSheep(rows[0]) : null;
  }

  private logEvent(kind: FarmEventKind, subject: string, sheepId: string | null): FarmEvent {
    const row = this.sql
      .exec<EventRow>(
        `INSERT INTO events (at, kind, subject, sheep_id) VALUES (?, ?, ?, ?) RETURNING *`,
        Date.now(),
        kind,
        subject,
        sheepId,
      )
      .one();
    this.sql.exec(`DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY id DESC LIMIT ?)`, EVENT_CAP);
    return toEvent(row);
  }

  // ---------- broadcasting ----------

  private broadcast(msg: ServerMessage): void {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data);
      } catch {
        // Socket is closing; the runtime will clean it up.
      }
    }
  }

  /** Push the new state (and optionally the event that caused it) to every open tab. */
  private changed(event: FarmEvent | null, origin: string | null): FarmState {
    const state = this.snapshot();
    if (event) this.broadcast({ type: "event", event, origin });
    this.broadcast({ type: "state", state });
    return state;
  }

  private snapshot(): FarmState {
    const loomStarted = this.getMeta("loom_started_at");
    const loomReady = this.getMeta("loom_ready_at");
    return {
      farmName: this.getMeta("farm_name") ?? DEFAULT_FARM_NAME,
      foundedAt: this.getNum("founded_at"),
      wool: this.getNum("wool"),
      cloth: this.getNum("cloth"),
      totalWool: this.getNum("total_wool"),
      originalPlans: this.getNum("original_plans"),
      loom: loomStarted && loomReady ? { startedAt: Number(loomStarted), readyAt: Number(loomReady) } : null,
      decorations: this.sql.exec<DecorRow>(`SELECT * FROM decorations ORDER BY created_at`).toArray().map(toDecor),
      sheep: this.sql.exec<SheepRow>(`SELECT * FROM sheep ORDER BY created_at`).toArray().map(toSheep),
      events: this.sql.exec<EventRow>(`SELECT * FROM events ORDER BY id DESC LIMIT ?`, EVENT_CAP).toArray().map(toEvent),
      serverNow: Date.now(),
    };
  }

  // ---------- RPC: reads ----------

  async getState(): Promise<FarmState> {
    return this.snapshot();
  }

  // ---------- RPC: sheep ----------

  async addSheep(input: Required<NewSheepInput>, origin: string | null): Promise<Result<Sheep>> {
    const id = crypto.randomUUID();
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]! & 0x7fffffff;
    const golden = Math.random() < GOLDEN_CHANCE ? 1 : 0;
    const row = this.sql
      .exec<SheepRow>(
        `INSERT INTO sheep (id, name, notes, link, category, date, created_at, seed, golden, original_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
        id,
        input.name,
        input.notes,
        input.link,
        input.category,
        input.date,
        Date.now(),
        seed,
        golden,
        input.name,
      )
      .one();
    const sheep = toSheep(row);
    this.changed(this.logEvent("bought", sheep.name, sheep.id), origin);
    return ok(sheep);
  }

  async updateSheep(id: string, patch: SheepPatch, origin: string | null): Promise<Result<Sheep>> {
    const existing = this.findSheep(id);
    if (!existing) return fail(404, "That sheep wandered off.");
    const next = { ...existing, ...patch };
    // ORIGINAL PLAN: renamed away at some point, and now renamed right back.
    const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
    const backToOriginal = !same(existing.name, existing.originalName) && same(next.name, existing.originalName);
    this.sql.exec(
      `UPDATE sheep SET name = ?, notes = ?, link = ?, category = ?, date = ?, memory = ?, original_returns = original_returns + ? WHERE id = ?`,
      next.name,
      next.notes,
      next.link,
      next.category,
      next.date,
      next.memory,
      backToOriginal ? 1 : 0,
      id,
    );
    if (backToOriginal) this.setMeta("original_plans", this.getNum("original_plans") + 1);
    this.changed(backToOriginal ? this.logEvent("original", next.name, id) : null, origin);
    return ok(this.findSheep(id)!);
  }

  async sellSheep(id: string, origin: string | null): Promise<Result<null>> {
    const existing = this.findSheep(id);
    if (!existing) return fail(404, "That sheep wandered off.");
    this.sql.exec(`DELETE FROM sheep WHERE id = ?`, id);
    this.sql.exec(`DELETE FROM pets WHERE sheep_id = ?`, id);
    this.changed(this.logEvent("sold", existing.name, null), origin);
    return ok(null);
  }

  async pet(id: string, deviceId: string, day: string, origin: string | null): Promise<Result<PetResult>> {
    const existing = this.findSheep(id);
    if (!existing) return fail(404, "That sheep wandered off.");
    const inserted = this.sql
      .exec(`INSERT OR IGNORE INTO pets (sheep_id, device_id, day) VALUES (?, ?, ?)`, id, deviceId, day)
      .rowsWritten;
    if (inserted === 0) return ok({ petted: false, sheep: existing });
    this.sql.exec(
      `UPDATE sheep SET pets = MIN(pets + 1, ?), last_pet_at = ? WHERE id = ?`,
      MAX_PETS,
      Date.now(),
      id,
    );
    // Old pet records are only needed to enforce "once per day"; drop anything older than a week.
    this.sql.exec(`DELETE FROM pets WHERE day < ?`, weekAgoKey(day));
    this.broadcast({ type: "pet", sheepId: id, origin });
    this.changed(null, origin);
    return ok({ petted: true, sheep: this.findSheep(id)! });
  }

  /** `memory` undefined = keep whatever memory the sheep already has. */
  async shear(id: string, memory: string | undefined, origin: string | null): Promise<Result<FarmState>> {
    const existing = this.findSheep(id);
    if (!existing) return fail(404, "That sheep wandered off.");
    if (existing.shearedAt !== null) return fail(409, "Already sheared! Its wool needs time to grow back.");
    const woolGained = existing.golden ? 2 : 1;
    this.sql.exec(`UPDATE sheep SET sheared_at = ?, memory = ? WHERE id = ?`, Date.now(), memory ?? existing.memory, id);
    this.setMeta("wool", this.getNum("wool") + woolGained);
    this.setMeta("total_wool", this.getNum("total_wool") + woolGained);
    return ok(this.changed(this.logEvent("sheared", existing.name, id), origin));
  }

  async unshear(id: string, origin: string | null): Promise<Result<FarmState>> {
    const existing = this.findSheep(id);
    if (!existing) return fail(404, "That sheep wandered off.");
    if (existing.shearedAt === null) return fail(409, "That sheep is already woolly.");
    const woolLost = existing.golden ? 2 : 1;
    this.sql.exec(`UPDATE sheep SET sheared_at = NULL WHERE id = ?`, id);
    this.setMeta("wool", Math.max(0, this.getNum("wool") - woolLost));
    this.setMeta("total_wool", Math.max(0, this.getNum("total_wool") - woolLost));
    return ok(this.changed(this.logEvent("unsheared", existing.name, id), origin));
  }

  /** Put a hat on a sheep (costs HAT_COST cloth) or take it off (free). */
  async setHat(id: string, hat: number | null, origin: string | null): Promise<Result<Sheep>> {
    const existing = this.findSheep(id);
    if (!existing) return fail(404, "That sheep wandered off.");
    if (existing.hat === hat) return ok(existing);
    if (hat !== null) {
      const cloth = this.getNum("cloth");
      if (cloth < HAT_COST) return fail(409, `A hat costs ${HAT_COST} cloth.`);
      this.setMeta("cloth", cloth - HAT_COST);
    }
    this.sql.exec(`UPDATE sheep SET hat = ? WHERE id = ?`, hat, id);
    this.changed(hat === null ? null : this.logEvent("hatted", existing.name, id), origin);
    return ok(this.findSheep(id)!);
  }

  // ---------- RPC: loom ----------

  async startLoom(origin: string | null): Promise<Result<FarmState>> {
    if (this.getMeta("loom_started_at")) return fail(409, "The loom is already busy.");
    const wool = this.getNum("wool");
    if (wool < LOOM_WOOL_COST) return fail(409, `The loom needs ${LOOM_WOOL_COST} wool.`);
    const now = Date.now();
    this.setMeta("wool", wool - LOOM_WOOL_COST);
    this.setMeta("loom_started_at", now);
    this.setMeta("loom_ready_at", now + LOOM_DURATION_MS);
    return ok(this.changed(null, origin));
  }

  async collectLoom(origin: string | null): Promise<Result<FarmState>> {
    const ready = this.getMeta("loom_ready_at");
    if (!ready) return fail(409, "The loom is empty.");
    if (Date.now() < Number(ready)) return fail(409, "The cloth isn't ready yet.");
    this.setMeta("loom_started_at", null);
    this.setMeta("loom_ready_at", null);
    this.setMeta("cloth", this.getNum("cloth") + 1);
    return ok(this.changed(this.logEvent("loomed", "Cloth", null), origin));
  }

  // ---------- RPC: decorations ----------

  async buyDecor(input: Required<BuyDecorInput>, origin: string | null): Promise<Result<Decoration>> {
    const cost = DECOR_COST[input.kind];
    const cloth = this.getNum("cloth");
    if (cloth < cost) return fail(409, `That costs ${cost} cloth.`);
    this.setMeta("cloth", cloth - cost);
    const row = this.sql
      .exec<DecorRow>(
        `INSERT INTO decorations (id, kind, fx, fy, variant, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
        crypto.randomUUID(),
        input.kind,
        input.fx,
        input.fy,
        input.variant,
        Date.now(),
      )
      .one();
    this.changed(this.logEvent("decorated", input.kind, null), origin);
    return ok(toDecor(row));
  }

  async moveDecor(id: string, input: MoveDecorInput, origin: string | null): Promise<Result<null>> {
    const res = this.sql.exec(`UPDATE decorations SET fx = ?, fy = ? WHERE id = ?`, input.fx, input.fy, id);
    if (res.rowsWritten === 0) return fail(404, "Couldn't find that decoration.");
    this.changed(null, origin);
    return ok(null);
  }

  /** Put a decoration away. Robin takes it back and refunds the cloth. */
  async removeDecor(id: string, origin: string | null): Promise<Result<null>> {
    const rows = this.sql.exec<DecorRow>(`SELECT * FROM decorations WHERE id = ?`, id).toArray();
    if (!rows[0]) return fail(404, "Couldn't find that decoration.");
    this.sql.exec(`DELETE FROM decorations WHERE id = ?`, id);
    this.setMeta("cloth", this.getNum("cloth") + DECOR_COST[rows[0].kind as DecorKind]);
    this.changed(null, origin);
    return ok(null);
  }

  // ---------- RPC: farm ----------

  async renameFarm(name: string, origin: string | null): Promise<Result<FarmState>> {
    this.setMeta("farm_name", name);
    return ok(this.changed(this.logEvent("renamed", name, null), origin));
  }

  // ---------- WebSocket ----------

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket", { status: 426 });
    }
    const clientId = new URL(request.url).searchParams.get("clientId")?.slice(0, 64) ?? null;
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ clientId });
    server.send(JSON.stringify({ type: "state", state: this.snapshot() } satisfies ServerMessage));
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Clients only send keep-alive pings (auto-answered) and a hello; resync on hello.
    if (typeof message === "string" && message.includes('"hello"')) {
      ws.send(JSON.stringify({ type: "state", state: this.snapshot() } satisfies ServerMessage));
    }
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      // Already closed.
    }
  }
}

function weekAgoKey(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! - 7));
  return dt.toISOString().slice(0, 10);
}
