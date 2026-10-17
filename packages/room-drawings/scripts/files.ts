// Dev tooling: reading scene files (snapshot or product dev export, plain or gzipped).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { sceneFromSnapshot, SNAPSHOT_FORMAT, type SceneSnapshot } from '../src/scene/snapshot.ts';
import type { Scene } from '../src/scene/scene.ts';
import { snapshotFromDevExport } from './dev-export.ts';

export function readJson(file: string): unknown {
    const raw = fs.readFileSync(file);
    return JSON.parse((file.endsWith('.gz') ? zlib.gunzipSync(raw) : raw).toString('utf8'));
}

export function writeJsonGz(file: string, value: unknown): void {
    fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(value), { level: 9 }));
}

/** Snapshot from either a room-drawings snapshot or the product's dev_serialized_scene.json. */
export function readSnapshot(file: string): SceneSnapshot {
    const json = readJson(file) as { format?: string };
    return json.format === SNAPSHOT_FORMAT ? json as SceneSnapshot : snapshotFromDevExport(json as never);
}

export const readScene = (file: string): Scene => sceneFromSnapshot(readSnapshot(file));
