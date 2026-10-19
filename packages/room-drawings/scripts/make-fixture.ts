// Converts scene exports of the product into gzipped snapshots for the regression suite: the
// dev_room_drawings_scene.json of output_RoomDrawings (with order data and face materials), or the older
// dev_serialized_scene.json of output_DrawingsPlanDEV.
// usage: node scripts/make-fixture.ts <scene export.json> <test/fixtures/name.scene.json.gz> [...pairs]
import fs from 'node:fs';
import { readSnapshot, writeJsonGz } from './files.ts';

const args = process.argv.slice(2);
if (args.length < 2 || args.length % 2) {
    console.error('usage: node scripts/make-fixture.ts <source.json> <target.scene.json.gz> [<source> <target> ...]');
    process.exit(1);
}
for (let i = 0; i < args.length; i += 2) {
    const snapshot = readSnapshot(args[i]);
    writeJsonGz(args[i + 1], snapshot);
    console.log(`${args[i + 1]}: ${(fs.statSync(args[i + 1]).size / 1024).toFixed(0)} KB (from ${(fs.statSync(args[i]).size / 1e6).toFixed(1)} MB)`);
}
