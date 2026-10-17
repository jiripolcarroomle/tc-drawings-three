import { add, dot, scale, sub, transformDirection, transformPoint, vec3, normalize, type Mat4, type Vec2, type Vec3 } from '../math.ts';
import type { SceneNode, WallData } from '../scene/scene.ts';
import { holeFlags, parseSvgPathRings, signedArea } from './svg-path.ts';

/**
 * Closed polyhedra in world coordinates, made of planar faces with outward normals and the edges between them.
 * Boxes, 3D models (as their bounding box), extruded SVG profiles (with holes) and walls.
 */

export interface Face {
    /** Outer ring and holes (even-odd), world coordinates. */
    rings: Vec3[][];
    /** Outward unit normal. */
    normal: Vec3;
}

export interface Edge {
    a: Vec3;
    b: Vec3;
    /** Indices of the adjacent faces in `Solid.faces`. */
    faces: number[];
}

export interface Solid {
    node: SceneNode;
    faces: Face[];
    edges: Edge[];
}

const BOX_FACES = [[0, 2, 6, 4], [1, 3, 7, 5], [0, 1, 5, 4], [2, 3, 7, 6], [0, 1, 3, 2], [4, 5, 7, 6]];

/** Axis-aligned box (origin + size, local) placed by `world`. */
export function boxSolid(node: SceneNode, world: Mat4, origin: Vec3, size: Vec3): Solid {
    const corners: Vec3[] = [];
    for (let i = 0; i < 8; i++) {
        corners.push(transformPoint(world, vec3(origin.x + (i & 1 ? size.x : 0), origin.y + (i & 2 ? size.y : 0), origin.z + (i & 4 ? size.z : 0))));
    }
    const center = scale(corners.reduce(add, vec3(0, 0, 0)), 1 / 8);
    const faces = BOX_FACES.map(indices => {
        const ring = indices.map(i => corners[i]);
        const faceCenter = scale(ring.reduce(add, vec3(0, 0, 0)), 1 / 4);
        return { rings: [ring], normal: normalize(sub(faceCenter, center)) };
    });
    const edges: Edge[] = [];
    for (let a = 0; a < 8; a++) {
        for (const bit of [1, 2, 4]) {
            const b = a | bit;
            if (b !== a) {
                edges.push({ a: corners[a], b: corners[b], faces: BOX_FACES.flatMap((f, fi) => f.includes(a) && f.includes(b) ? [fi] : []) });
            }
        }
    }
    return { node, faces, edges };
}

/**
 * Extruded profile. The profile axes (u, v) and the extrusion axis follow the part extrusion of the order data:
 *  'y': (u, t, v)   'x': (t, v, u)   'z': (u, v, t)   with t in [0, depth]
 */
export function prismSolid(node: SceneNode, world: Mat4, origin: Vec3, profile: Vec2[][], direction: 'x' | 'y' | 'z', depth: number, smoothAngleDegrees: number): Solid {
    const [U, V, E] = direction === 'y' ? [vec3(1, 0, 0), vec3(0, 0, 1), vec3(0, 1, 0)]
        : direction === 'x' ? [vec3(0, 0, 1), vec3(0, 1, 0), vec3(1, 0, 0)]
            : [vec3(1, 0, 0), vec3(0, 1, 0), vec3(0, 0, 1)];
    const at = (p: Vec2, t: number) => transformPoint(world, add(origin, add(add(scale(U, p.x), scale(V, p.y)), scale(E, t))));
    const holes = holeFlags(profile);
    const faces: Face[] = [
        { rings: profile.map(ring => ring.map(p => at(p, 0))), normal: transformDirection(world, scale(E, depth >= 0 ? -1 : 1)) },
        { rings: profile.map(ring => ring.map(p => at(p, depth))), normal: transformDirection(world, scale(E, depth >= 0 ? 1 : -1)) },
    ];
    const edges: Edge[] = [];
    const smooth = Math.cos(smoothAngleDegrees * Math.PI / 180);
    profile.forEach((ring, ringIndex) => {
        const counterClockwise = signedArea(ring) > 0, first = faces.length;
        ring.forEach((p, i) => {
            const q = ring[(i + 1) % ring.length], du = q.x - p.x, dv = q.y - p.y;
            // outward = away from the material: right of the segment for counter-clockwise outer rings, flipped for holes
            const outward = (counterClockwise !== holes[ringIndex]) ? { u: dv, v: -du } : { u: -dv, v: du };
            faces.push({ rings: [[at(p, 0), at(q, 0), at(q, depth), at(p, depth)]], normal: transformDirection(world, add(scale(U, outward.u), scale(V, outward.v))) });
            const side = faces.length - 1;
            edges.push({ a: at(p, 0), b: at(q, 0), faces: [0, side] }, { a: at(p, depth), b: at(q, depth), faces: [1, side] });
        });
        // edges along the extrusion only where the side faces really break (sampled arcs stay smooth)
        ring.forEach((p, i) => {
            const previous = first + (i - 1 + ring.length) % ring.length, next = first + i;
            if (dot(faces[previous].normal, faces[next].normal) < smooth) {
                edges.push({ a: at(p, 0), b: at(p, depth), faces: [previous, next] });
            }
        });
    });
    return { node, faces, edges };
}

/** Wall body: the floor plan quadrilateral extruded to the wall height (world coordinates). */
export function wallSolid(node: SceneNode, wall: WallData): Solid {
    const profile: Vec2[][] = [[wall.start, wall.end, wall.backEnd, wall.backStart].map(p => ({ x: p.x, y: p.z }))];
    return prismSolid(node, node.world, vec3(0, 0, 0), profile, 'y', wall.height, 1);
}

/** Solid of a scene node, or undefined for nodes without geometry. */
export function solidOf(node: SceneNode, smoothAngleDegrees: number): Solid | undefined {
    if (node.wall) {
        return wallSolid(node, node.wall);
    }
    const g = node.geometry;
    if (!g) return undefined;
    if (g.type === 'extrusion') {
        const profile = parseSvgPathRings(g.svg);
        if (profile.length) return prismSolid(node, node.world, g.origin, profile, g.direction, g.depth, smoothAngleDegrees);
        return g.size ? boxSolid(node, node.world, g.origin, g.size) : undefined;
    }
    const size = g.size;
    if (!size || (size.x === 0 && size.y === 0 && size.z === 0)) return undefined;
    return boxSolid(node, node.world, g.origin, size);
}
