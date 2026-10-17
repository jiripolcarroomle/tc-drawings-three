import type { Vec2 } from '../math.ts';

/**
 * Parses the profile of an extruded part (the `d` attributes of an SVG snippet) into closed rings.
 * Supports M L H V A Z, absolute and relative. Every subpath is a ring, closed or not; arcs are sampled.
 * Holes are not marked here - a ring inside an odd number of other rings is a hole (even-odd rule).
 */
export function parseSvgPathRings(svg: string, arcStepDegrees = 10): Vec2[][] {
    const rings: Vec2[][] = [];
    for (const match of svg.matchAll(/\sd\s*=\s*"([^"]*)"/g)) {
        const tokens = match[1].match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
        let i = 0, command = '';
        let current: Vec2 = { x: 0, y: 0 }, start: Vec2 = current, ring: Vec2[] = [];
        const number = () => parseFloat(tokens[i++]);
        const closeRing = () => {
            // drop a duplicated closing point
            if (ring.length > 1 && Math.hypot(ring[0].x - ring[ring.length - 1].x, ring[0].y - ring[ring.length - 1].y) < 1e-9) ring.pop();
            if (ring.length >= 3) rings.push(ring);
            ring = [];
        };
        while (i < tokens.length) {
            if (/[a-zA-Z]/.test(tokens[i])) {
                command = tokens[i++];
            }
            const relative = command === command.toLowerCase();
            const point = (x: number, y: number): Vec2 => relative ? { x: current.x + x, y: current.y + y } : { x, y };
            switch (command.toUpperCase()) {
                case 'Z':
                    closeRing();
                    current = start;
                    continue;
                case 'M':
                    closeRing();
                    current = point(number(), number());
                    start = current;
                    ring.push(current);
                    command = relative ? 'l' : 'L'; // further pairs are line-tos
                    continue;
                case 'L':
                    current = point(number(), number());
                    ring.push(current);
                    continue;
                case 'H': {
                    const x = number();
                    current = { x: relative ? current.x + x : x, y: current.y };
                    ring.push(current);
                    continue;
                }
                case 'V': {
                    const y = number();
                    current = { x: current.x, y: relative ? current.y + y : y };
                    ring.push(current);
                    continue;
                }
                case 'A': {
                    const rx = number(), ry = number(), rotation = number(), largeArc = number(), sweep = number();
                    const end = point(number(), number());
                    ring.push(...arcPoints(current, end, rx, ry, rotation, largeArc !== 0, sweep !== 0, arcStepDegrees));
                    current = end;
                    continue;
                }
                default:
                    i++; // unsupported command: skip its parameters
            }
        }
        closeRing();
    }
    return rings;
}

/** Samples an SVG elliptical arc (endpoint parameterization, SVG 1.1 appendix F.6.5); excludes the start, includes the end. */
export function arcPoints(p0: Vec2, p1: Vec2, rx: number, ry: number, rotationDegrees: number, largeArc: boolean, sweep: boolean, stepDegrees = 10): Vec2[] {
    if (!rx || !ry || (p0.x === p1.x && p0.y === p1.y)) {
        return [p1];
    }
    const phi = rotationDegrees * Math.PI / 180, c = Math.cos(phi), s = Math.sin(phi);
    const dx = (p0.x - p1.x) / 2, dy = (p0.y - p1.y) / 2;
    const x1 = c * dx + s * dy, y1 = -s * dx + c * dy;
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (lambda > 1) {
        rx *= Math.sqrt(lambda);
        ry *= Math.sqrt(lambda);
    }
    const sign = largeArc === sweep ? -1 : 1;
    const k = sign * Math.sqrt(Math.max(0, (rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1) / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
    const cx1 = (k * rx * y1) / ry, cy1 = (-k * ry * x1) / rx;
    const cx = c * cx1 - s * cy1 + (p0.x + p1.x) / 2, cy = s * cx1 + c * cy1 + (p0.y + p1.y) / 2;
    const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const theta1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
    let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
    if (!sweep && delta > 0) delta -= 2 * Math.PI;
    else if (sweep && delta < 0) delta += 2 * Math.PI;
    const steps = Math.max(2, Math.ceil(Math.abs(delta) / (stepDegrees * Math.PI / 180)));
    const points: Vec2[] = [];
    for (let j = 1; j < steps; j++) {
        const t = theta1 + (delta * j) / steps;
        points.push({ x: cx + rx * Math.cos(t) * c - ry * Math.sin(t) * s, y: cy + rx * Math.cos(t) * s + ry * Math.sin(t) * c });
    }
    points.push(p1);
    return points;
}

export const signedArea = (ring: Vec2[]): number =>
    ring.reduce((area, p, i) => { const q = ring[(i + 1) % ring.length]; return area + p.x * q.y - q.x * p.y; }, 0) / 2;

/** Even-odd point in ring test. */
export function pointInRing(p: Vec2, ring: Vec2[]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
}

/** For each ring: is it a hole (inside an odd number of the other rings)? */
export const holeFlags = (rings: Vec2[][]): boolean[] =>
    rings.map((ring, i) => rings.filter((other, j) => j !== i && pointInRing(ring[0], other)).length % 2 === 1);
