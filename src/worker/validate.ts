import { isValidDayKey } from "../shared/calendar";
import {
  CATEGORIES,
  DECOR_KINDS,
  LIMITS,
  MAX_HAT_ID,
  type BuyDecorInput,
  type Category,
  type DecorKind,
  type MoveDecorInput,
  type NewSheepInput,
  type PetInput,
  type SheepPatch,
} from "../shared/types";

export class BadInput extends Error {}

type Json = Record<string, unknown>;

function obj(body: unknown): Json {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new BadInput("Expected a JSON object.");
  return body as Json;
}

function str(v: unknown, field: string, max: number, { required = false } = {}): string {
  if (v === undefined || v === null) {
    if (required) throw new BadInput(`${field} is required.`);
    return "";
  }
  if (typeof v !== "string") throw new BadInput(`${field} must be text.`);
  const s = v.trim();
  if (required && !s) throw new BadInput(`${field} can't be empty.`);
  if (s.length > max) throw new BadInput(`${field} is too long (max ${max}).`);
  return s;
}

function link(v: unknown): string {
  const s = str(v, "link", LIMITS.link);
  if (!s) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new BadInput("That link doesn't look like a web address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new BadInput("Links must be http or https.");
  return url.toString();
}

function category(v: unknown): Category {
  if (v === undefined || v === null || v === "") return "other";
  if (typeof v !== "string" || !(CATEGORIES as readonly string[]).includes(v)) throw new BadInput("Unknown category.");
  return v as Category;
}

function day(v: unknown, field = "date"): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !isValidDayKey(v)) throw new BadInput(`${field} must look like YYYY-MM-DD.`);
  return v;
}

function fraction(v: unknown, field: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new BadInput(`${field} must be a number.`);
  return Math.min(1, Math.max(0, v));
}

export function newSheep(body: unknown): Required<NewSheepInput> {
  const b = obj(body);
  return {
    name: str(b.name, "name", LIMITS.name, { required: true }),
    notes: str(b.notes, "notes", LIMITS.notes),
    link: link(b.link),
    category: category(b.category),
    date: day(b.date),
  };
}

export function sheepPatch(body: unknown): SheepPatch {
  const b = obj(body);
  const patch: SheepPatch = {};
  if ("name" in b) patch.name = str(b.name, "name", LIMITS.name, { required: true });
  if ("notes" in b) patch.notes = str(b.notes, "notes", LIMITS.notes);
  if ("link" in b) patch.link = link(b.link);
  if ("category" in b) patch.category = category(b.category);
  if ("date" in b) patch.date = day(b.date);
  if ("memory" in b) patch.memory = str(b.memory, "memory", LIMITS.memory);
  return patch;
}

export function petInput(body: unknown): PetInput {
  const b = obj(body);
  const deviceId = str(b.deviceId, "deviceId", 64, { required: true });
  const d = day(b.day, "day");
  if (!d) throw new BadInput("day is required.");
  return { deviceId, day: d };
}

/** Shear payload: undefined memory means "keep the existing one". */
export function memory(body: unknown): string | undefined {
  if (body === null || body === undefined) return undefined;
  const b = obj(body);
  if (!("memory" in b) || b.memory === undefined || b.memory === null) return undefined;
  return str(b.memory, "memory", LIMITS.memory);
}

export function hat(body: unknown): number | null {
  const v = obj(body).hat;
  if (v === null || v === undefined) return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX_HAT_ID) throw new BadInput("That's not a hat we have.");
  return v;
}

export function buyDecor(body: unknown): Required<BuyDecorInput> {
  const b = obj(body);
  if (typeof b.kind !== "string" || !(DECOR_KINDS as readonly string[]).includes(b.kind)) {
    throw new BadInput("Robin doesn't sell that.");
  }
  const variant = b.variant === undefined ? 0 : Number(b.variant);
  if (!Number.isInteger(variant) || variant < 0 || variant > 31) throw new BadInput("Bad variant.");
  return { kind: b.kind as DecorKind, fx: fraction(b.fx, "fx"), fy: fraction(b.fy, "fy"), variant };
}

export function moveDecor(body: unknown): MoveDecorInput {
  const b = obj(body);
  return { fx: fraction(b.fx, "fx"), fy: fraction(b.fy, "fy") };
}

export function farmName(body: unknown): string {
  return str(obj(body).farmName, "farmName", LIMITS.farmName, { required: true });
}
