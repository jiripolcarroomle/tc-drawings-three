// Test helper: reads the flatted order dumps in tc-drawings-three/assets (same logic as src/dev-helpers.ts
// there: attribute values are themselves flatted strings and are revived recursively).
import fs from 'node:fs';
import { parse, stringify } from 'flatted';

function tryParse(value: string): unknown {
    const trimmed = value.trim();
    if (!trimmed.startsWith('[')) return value;
    try {
        const parsed = parse(trimmed);
        return stringify(parsed) === trimmed ? parsed : value;
    }
    catch {
        return value;
    }
}

function revive(value: unknown, visited = new WeakSet<object>()): unknown {
    if (typeof value === 'string') {
        const revived = tryParse(value);
        return revived === value ? value : revive(revived, visited);
    }
    if (!value || typeof value !== 'object' || visited.has(value)) return value;
    visited.add(value);
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) value[i] = revive(value[i], visited);
        return value;
    }
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) record[key] = revive(record[key], visited);
    return record;
}

export function readFlattedOrder<T>(file: string): T {
    const parsed = parse(fs.readFileSync(file, 'utf8'), (_key, value) => typeof value === 'string' ? tryParse(value) : value);
    return revive(parsed) as T;
}
