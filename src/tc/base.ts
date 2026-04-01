export function logError(message: string) {
    console.error(message);
}

export function logWarning(message: string) {
    console.warn(message);
}

export function logInfo(message: string) {
    console.log(message);
}


export class Vector3 {
    // See: https://github.com/mrdoob/three.js/blob/dev/src/math/Vector3.js   
    constructor(x = 0, y = 0, z = 0) {
        this._x = x;
        this._y = y;
        this._z = z;
    }
    _x: number;
    _y: number;
    _z: number;
    applyMatrix4(m: Matrix4) {
        const x = this._x, y = this._y, z = this._z;

        const e = m.elements;
        const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);

        this._x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
        this._y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
        this._z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;

        return this;
    }

    setFromMatrixPosition(m: Matrix4) {
        const e = m.elements;

        this._x = e[12];
        this._y = e[13];
        this._z = e[14];

        return this;
    }

    setFromMatrixColumn(m: Matrix4, index: number) {
        return this.fromArray(m.elements, index * 4);
    }

    fromArray(array: Array<number>, offset: number = 0) {
        this._x = array[offset];
        this._y = array[offset + 1];
        this._z = array[offset + 2];

        return this;
    }

    static fromArray(array: Array<number>, offset: number = 0) {
        return new Vector3(array[offset], array[offset + 1], array[offset + 2]);
    }

    length() {
        return Math.sqrt(this._x * this._x + this._y * this._y + this._z * this._z);
    }

    copy(): Vector3 {
        return new Vector3(this._x, this._y, this._z);
    }


    /**
 * Epsilon value to compare coordinate or position equality.
 * apparently, 0.000001 was too little
 * TC provided near-zero position values: "x": 900.0, "y": -2.6679314139854693E-12, "z": -6.103515625E-05, "rotationY": 1.1920928955078125E-07
 * where the previous value failed
 * 0.01 mm is a suggestion for trying out
 */
    static EPS: number = 0.01;
    add(v: Vector3) {
        return new Vector3(this._x + v._x, this._y + v._y, this._z + v._z);
    }
    subtract(v: Vector3) {
        return new Vector3(this._x - v._x, this._y - v._y, this._z - v._z);
    }
    scale(scalar: number) {
        return new Vector3(this._x * scalar, this._y * scalar, this._z * scalar);
    }
    normalize() {
        const magnitude = this.magnitude();
        if (magnitude < Vector3.EPS) {
            return new Vector3(0, 0, 0);
        }
        else {
            return this.scale(1 / this.magnitude());
        }
    }
    magnitude() {
        return Math.sqrt(this._x * this._x + this._y * this._y + this._z * this._z);
    }
    isCoincident(v: Vector3, tolerance: number = Vector3.EPS) {
        return this.subtract(v).magnitude() < tolerance;
    }
    /** dot product */
    dot(v: Vector3) {
        return this._x * v._x + this._y * v._y + this._z * v._z;
    }
    /** cross product */
    cross(v: Vector3) {
        return new Vector3(this._y * v._z - this._z * v._y, this._z * v._x - this._x * v._z, this._x * v._y - this._y * v._x);
    }
    /** size of cross is size of area between two vectors - if that is 0, they are parallel */
    isParallel(v: Vector3, tolerance: number = Vector3.EPS) {
        return this.cross(v).magnitude() < tolerance;
    }
    distanceTo(v: Vector3) {
        return this.subtract(v).magnitude();
    }


}

export class Matrix4 {
    // See: https://github.com/mrdoob/three.js/blob/dev/src/math/Matrix4.js
    elements;  // column-order

    constructor() {
        this.elements = [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ];
    }

    clone(): Matrix4 {
        return new Matrix4().fromArray(this.elements);
    }

    fromArray(array: number[], offset: number = 0): Matrix4 {
        for (let i = 0; i < 16; i++) {
            this.elements[i] = array[i + offset];
        }

        return this;
    }

    set(n11: number, n12: number, n13: number, n14: number, n21: number, n22: number, n23: number, n24: number, n31: number, n32: number, n33: number, n34: number, n41: number, n42: number, n43: number, n44: number) {
        const te = this.elements;
        te[0] = n11; te[4] = n12; te[8] = n13; te[12] = n14;
        te[1] = n21; te[5] = n22; te[9] = n23; te[13] = n24;
        te[2] = n31; te[6] = n32; te[10] = n33; te[14] = n34;
        te[3] = n41; te[7] = n42; te[11] = n43; te[15] = n44;
        return this;
    }

    makeBasis(x: number, y: number, z: number): Matrix4 {
        this.set(
            x, 0, 0, 0,
            0, y, 0, 0,
            0, 0, z, 0,
            0, 0, 0, 1
        );
        return this;
    }

    makeBasisV(xAxis: number[], yAxis: number[], zAxis: number[]): Matrix4 {
        this.set(
            xAxis[0], yAxis[0], zAxis[0], 0,
            xAxis[1], yAxis[1], zAxis[1], 0,
            xAxis[2], yAxis[2], zAxis[2], 0,
            0, 0, 0, 1
        );
        return this;
    }

    setPosition(x: number, y: number, z: number): Matrix4 {
        const te = this.elements;
        te[12] = x;
        te[13] = y;
        te[14] = z;
        return this;
    }

    makeRotationX(degree: number): Matrix4 {
        let theta = (Math.PI / 180) * degree;
        const c = Math.cos(theta), s = Math.sin(theta);
        this.set(
            1, 0, 0, 0,
            0, c, - s, 0,
            0, s, c, 0,
            0, 0, 0, 1
        );
        return this;
    }

    makeRotationY(degree: number): Matrix4 {
        let theta = (Math.PI / 180) * degree;
        const c = Math.cos(theta), s = Math.sin(theta);
        this.set(
            c, 0, s, 0,
            0, 1, 0, 0,
            - s, 0, c, 0,
            0, 0, 0, 1
        );
        return this;
    }

    makeRotationZ(degree: number): Matrix4 {
        let theta = (Math.PI / 180) * degree;
        const c = Math.cos(theta), s = Math.sin(theta);
        this.set(
            c, - s, 0, 0,
            s, c, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        );
        return this;
    }

    makeRotationAxis(x: number, y: number, z: number, degree: number): Matrix4 {
        var angle = (Math.PI / 180) * degree;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const t = 1 - c;
        //const x = axis.x, y = axis.y, z = axis.z;
        const tx = t * x, ty = t * y;
        this.set(
            tx * x + c, tx * y - s * z, tx * z + s * y, 0,
            tx * y + s * z, ty * y + c, ty * z - s * x, 0,
            tx * z - s * y, ty * z + s * x, t * z * z + c, 0,
            0, 0, 0, 1
        );
        return this;
    }

    makeRotationAxisV(axis: Vector3, angle: number): Matrix4 {
        // Based on http://www.gamedev.net/reference/articles/article1199.asp
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const t = 1 - c;
        const x = axis._x, y = axis._y, z = axis._z;
        const tx = t * x, ty = t * y;

        this.set(
            tx * x + c, tx * y - s * z, tx * z + s * y, 0,
            tx * y + s * z, ty * y + c, ty * z - s * x, 0,
            tx * z - s * y, ty * z + s * x, t * z * z + c, 0,
            0, 0, 0, 1
        );

        return this;
    }

    extractRotation(m: Matrix4): Matrix4 {
        const te = this.elements;
        const me = m.elements;
        const v1 = new Vector3();

        const scaleX = 1 / v1.setFromMatrixColumn(m, 0).length();
        const scaleY = 1 / v1.setFromMatrixColumn(m, 1).length();
        const scaleZ = 1 / v1.setFromMatrixColumn(m, 2).length();

        te[0] = me[0] * scaleX;
        te[1] = me[1] * scaleX;
        te[2] = me[2] * scaleX;
        te[3] = 0;

        te[4] = me[4] * scaleY;
        te[5] = me[5] * scaleY;
        te[6] = me[6] * scaleY;
        te[7] = 0;

        te[8] = me[8] * scaleZ;
        te[9] = me[9] * scaleZ;
        te[10] = me[10] * scaleZ;
        te[11] = 0;

        te[12] = 0;
        te[13] = 0;
        te[14] = 0;
        te[15] = 1;

        return this;
    }

    invert(): Matrix4 {
        // Based on THREE.Matrix4.invert()
        const te = this.elements;

        const n11 = te[0], n21 = te[1], n31 = te[2], n41 = te[3];
        const n12 = te[4], n22 = te[5], n32 = te[6], n42 = te[7];
        const n13 = te[8], n23 = te[9], n33 = te[10], n43 = te[11];
        const n14 = te[12], n24 = te[13], n34 = te[14], n44 = te[15];

        const t11 = n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44;
        const t12 = n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44;
        const t13 = n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44;
        const t14 = n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34;

        const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;

        if (det === 0) {
            // Match three.js behavior: set to identity if not invertible.
            this.elements = [
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                0, 0, 0, 1,
            ];
            return this;
        }

        const detInv = 1 / det;

        te[0] = t11 * detInv;
        te[1] = (n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44) * detInv;
        te[2] = (n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44) * detInv;
        te[3] = (n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43) * detInv;

        te[4] = t12 * detInv;
        te[5] = (n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44) * detInv;
        te[6] = (n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44) * detInv;
        te[7] = (n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43) * detInv;

        te[8] = t13 * detInv;
        te[9] = (n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44) * detInv;
        te[10] = (n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44) * detInv;
        te[11] = (n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43) * detInv;

        te[12] = t14 * detInv;
        te[13] = (n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34) * detInv;
        te[14] = (n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34) * detInv;
        te[15] = (n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33) * detInv;

        return this;
    }

    /**
     * Multiplies this matrix by m .
     * This mutates the current matrix.
     * @param m (this = this * m)
     * @returns reference to this mutated current matrix for chaining
     */
    multiply(m: Matrix4): Matrix4 {
        const ae = this.elements;
        const be = m.elements;
        const te = new Array(16);

        const a11 = ae[0], a12 = ae[4], a13 = ae[8], a14 = ae[12];
        const a21 = ae[1], a22 = ae[5], a23 = ae[9], a24 = ae[13];
        const a31 = ae[2], a32 = ae[6], a33 = ae[10], a34 = ae[14];
        const a41 = ae[3], a42 = ae[7], a43 = ae[11], a44 = ae[15];
        const b11 = be[0], b12 = be[4], b13 = be[8], b14 = be[12];
        const b21 = be[1], b22 = be[5], b23 = be[9], b24 = be[13];
        const b31 = be[2], b32 = be[6], b33 = be[10], b34 = be[14];
        const b41 = be[3], b42 = be[7], b43 = be[11], b44 = be[15];

        te[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
        te[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
        te[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
        te[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;

        te[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
        te[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
        te[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
        te[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;

        te[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
        te[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
        te[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
        te[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;

        te[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
        te[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
        te[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
        te[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;

        this.elements = te;
        return this;
    }


}




