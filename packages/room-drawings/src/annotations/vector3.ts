/**
 * Mutable 3D vector used by the annotation layout (ported unchanged from tc-drawings-three, tc/base.ts) so the
 * tuned annotation algorithms keep their exact behavior. Field names (_x, _y, _z) are also how the content data
 * (the order data's Vector3) stores points, which is why content points can be read directly.
 */
export class Vector3 {
    _x: number;
    _y: number;
    _z: number;

    constructor(x = 0, y = 0, z = 0) {
        this._x = x;
        this._y = y;
        this._z = z;
    }

    /** Epsilon to compare coordinates [mm]. */
    static EPS = 0.01;

    /** From anything with _x/_y/_z (the order data's Vector3) or x/y/z. */
    static from(p: { _x?: number; _y?: number; _z?: number; x?: number; y?: number; z?: number }): Vector3 {
        return new Vector3(p._x ?? p.x ?? 0, p._y ?? p.y ?? 0, p._z ?? p.z ?? 0);
    }

    length(): number {
        return Math.sqrt(this._x * this._x + this._y * this._y + this._z * this._z);
    }

    clone(): Vector3 {
        return new Vector3(this._x, this._y, this._z);
    }

    add(v: Vector3): Vector3 {
        this._x += v._x;
        this._y += v._y;
        this._z += v._z;
        return this;
    }

    sub(v: Vector3): Vector3 {
        this._x -= v._x;
        this._y -= v._y;
        this._z -= v._z;
        return this;
    }

    multiply(scalar: number): Vector3 {
        this._x *= scalar;
        this._y *= scalar;
        this._z *= scalar;
        return this;
    }

    /** Unit length; vectors shorter than `tolerance` become zero. */
    normalize(tolerance: number = Vector3.EPS): Vector3 {
        const magnitude = this.length();
        if (magnitude < tolerance) {
            this._x = 0;
            this._y = 0;
            this._z = 0;
        }
        else {
            this.multiply(1 / magnitude);
        }
        return this;
    }

    dot(v: Vector3): number {
        return this._x * v._x + this._y * v._y + this._z * v._z;
    }

    distanceTo(v: Vector3): number {
        return this.clone().sub(v).length();
    }
}
