/**
 * Minimal 3D math for the drawings. Plain data + functions, no classes, no dependencies.
 * Conventions match the order data: millimeters, y up, Mat4 as 16 numbers in column-major order
 * (the `elements` array of the order's matrices), rotations given in degrees.
 */

export interface Vec3 { x: number; y: number; z: number }
export interface Vec2 { x: number; y: number }
/** 4x4 matrix, column-major (translation in elements 12, 13, 14). */
export type Mat4 = readonly number[];

export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => vec3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => vec3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, s: number): Vec3 => vec3(a.x * s, a.y * s, a.z * s);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const normalize = (a: Vec3): Vec3 => {
    const l = length(a);
    return l > 0 ? vec3(a.x / l, a.y / l, a.z / l) : vec3(0, 0, 0);
};

export const IDENTITY: Mat4 = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** a * b (b is applied first). */
export function multiply(a: Mat4, b: Mat4): Mat4 {
    const r = new Array<number>(16);
    for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 4; row++) {
            r[col * 4 + row] =
                a[row] * b[col * 4] +
                a[4 + row] * b[col * 4 + 1] +
                a[8 + row] * b[col * 4 + 2] +
                a[12 + row] * b[col * 4 + 3];
        }
    }
    return r;
}

/** Inverse of a general 4x4 matrix; returns the identity for singular matrices. */
export function invert(m: Mat4): Mat4 {
    const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (Math.abs(det) < 1e-12) {
        return IDENTITY;
    }
    const d = 1 / det;
    return [
        (a11 * b11 - a12 * b10 + a13 * b09) * d,
        (a02 * b10 - a01 * b11 - a03 * b09) * d,
        (a31 * b05 - a32 * b04 + a33 * b03) * d,
        (a22 * b04 - a21 * b05 - a23 * b03) * d,
        (a12 * b08 - a10 * b11 - a13 * b07) * d,
        (a00 * b11 - a02 * b08 + a03 * b07) * d,
        (a32 * b02 - a30 * b05 - a33 * b01) * d,
        (a20 * b05 - a22 * b02 + a23 * b01) * d,
        (a10 * b10 - a11 * b08 + a13 * b06) * d,
        (a01 * b08 - a00 * b10 - a03 * b06) * d,
        (a30 * b04 - a31 * b02 + a33 * b00) * d,
        (a21 * b02 - a20 * b04 - a23 * b00) * d,
        (a11 * b07 - a10 * b09 - a12 * b06) * d,
        (a00 * b09 - a01 * b07 + a02 * b06) * d,
        (a31 * b01 - a30 * b03 - a32 * b00) * d,
        (a20 * b03 - a21 * b01 + a22 * b00) * d,
    ];
}

/** Rotation around the y axis (degrees, like the order data) followed by a translation. */
export function rotationYTranslation(degrees: number, t: Vec3): Mat4 {
    const r = degrees * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, t.x, t.y, t.z, 1];
}

export const transformPoint = (m: Mat4, p: Vec3): Vec3 => vec3(
    m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12],
    m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13],
    m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14],
);

/** Direction transform (rotation part only), normalized. Valid for rigid transforms. */
export const transformDirection = (m: Mat4, d: Vec3): Vec3 => normalize(vec3(
    m[0] * d.x + m[4] * d.y + m[8] * d.z,
    m[1] * d.x + m[5] * d.y + m[9] * d.z,
    m[2] * d.x + m[6] * d.y + m[10] * d.z,
));

/** Reads a matrix from anything that has 16 `elements` (the order data's Matrix4) or is an array of 16 numbers. */
export function toMat4(source: unknown): Mat4 | undefined {
    const elements = Array.isArray(source) ? source : (source as { elements?: unknown } | null | undefined)?.elements;
    return Array.isArray(elements) && elements.length === 16 && elements.every(e => typeof e === 'number') ? elements : undefined;
}
