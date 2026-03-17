import * as THREE from "three";
import { SVGLoader, type SVGResultPaths } from 'three/addons/loaders/SVGLoader.js';
import type { IObject3DNode } from "./scene";
import * as TC from "./tc/base";


export function sceneToThreeJsScene(rootObject3DNode: IObject3DNode): THREE.Scene {
    const threeScene = new THREE.Scene();

    const rootThreeObject = orderObjectNodeToThreeObject3D(rootObject3DNode);
    threeScene.add(rootThreeObject);

    return threeScene;
}

const svgLoader = new SVGLoader();

export function orderObjectNodeToThreeObject3D(node: IObject3DNode): THREE.Object3D {
    const threeObject = new THREE.Object3D();
    threeObject.name = node.id;
    threeObject.userData.kind = node.kind;
    // set transform
    threeObject.matrix.fromArray(node.transform.elements);
    threeObject.matrixAutoUpdate = false; // we will manage the matrix updates manually

    const geom = node.geometry({});
    if (geom.svgPath?.length) {
        const shape = new THREE.Shape();

        // The svgPath points in this project are authored in world X/Z (see wall creation).
        // Make them local to the node transform (avoid double translation), and map them
        // into Shape's 2D (x, y) such that after rotating the extrude mesh by -90° around X:
        // - the shape lies in world XZ
        // - the extrusion depth becomes world +Y
        const te = node.transform.elements;
        const originX = te[12] ?? 0;
        const originZ = te[14] ?? 0;

        let hasAnyZ = false;
        let hasStarted = false;

        for (const pathNode of geom.svgPath) {
            if (pathNode.command === 'Z') {
                shape.closePath();
                hasAnyZ = true;
                continue;
            }

            const args = pathNode.args;
            if (!args || args.length < 2) continue;

            const worldX = args[0];
            const worldZ = args[1];

            const localX = worldX - originX;
            const localZ = worldZ - originZ;

            // Shape is XY; we want final world Z to be +localZ after a -90° X rotation.
            const x = localX;
            const y = -localZ;

            if (pathNode.command === 'M' || !hasStarted) {
                shape.moveTo(x, y);
                hasStarted = true;
            } else if (pathNode.command === 'L') {
                shape.lineTo(x, y);
            }
        }

        if (!hasAnyZ) {
            shape.closePath();
        }

        const extrudeSettings: THREE.ExtrudeGeometryOptions = {
            steps: 1,
            depth: geom.svgDepth ?? 1,
        };

        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

        // random color
        const material = new THREE.MeshBasicMaterial({ color: Math.random() * 0xffffff });
        material.transparent = true;
        material.opacity = 0.3;

        const mesh = new THREE.Mesh(geometry, material);

        // Rotate so extrusion is "up" in the scene (world +Y).
        if (geom.svgExtrusionDirection === 'z' || !geom.svgExtrusionDirection) {
            mesh.rotation.x = -Math.PI / 2;
        }
        else if (geom.svgExtrusionDirection === 'x') {
            mesh.rotation.z = Math.PI / 2;
        }
        else if (geom.svgExtrusionDirection === 'y') {
            // default, already extruding in +Y
        }

        threeObject.add(mesh);
    }
    else if (geom.svgString) {
        let shapes: THREE.Shape[] = [];
        try {
            const svgData = svgLoader.parse(geom.svgString);
            if (svgData.paths.length <= 0) {
                console.error(`SVG data does not contain any paths! Part '${node.id}' will not be drawn! Is the SVG valid? (SVG: ${geom.svgString})`);
            }
            svgData.paths.forEach((path: SVGResultPaths) => {
                const pathIsCCW =
                    path.subPaths.length > 0 &&
                    !THREE.ShapeUtils.isClockWise(path.subPaths[0].getPoints());
                shapes = shapes.concat(path.toShapes(pathIsCCW));
            });
        } catch (e) {
            console.error(
                'Failed to parse SVG for extrude part: ' + geom.svgString + ' exception: ' + e
            );
        }
        const rot = new TC.Matrix4();
        let extrusionDepth;
        if (geom.svgExtrusionDirection == 'x') {
            extrusionDepth = node.orderLineEntry?._dimx ?? 1000;
            rot.makeRotationAxis(0, 1, 0, 270);
            extrusionDepth *= -1;
        } else if (geom.svgExtrusionDirection == 'y') {
            extrusionDepth = node.orderLineEntry?._dimy ?? 1000;
            rot.makeRotationAxis(1, 0, 0, 90);
            extrusionDepth *= -1;
        }
        else {
            extrusionDepth = node.orderLineEntry?._dimz ?? 1000;
            // rot.makeRotationAxis(1, 0, 0, MathUtils.degToRad(-90));
        }

        shapes.forEach((shape) => {

            const newExtrudeGeometry = (
                contour: THREE.Shape,
                height: number,
                transform?: TC.Matrix4
            ): THREE.ExtrudeGeometry => {
                const extrudeSettings = {
                    steps: 2,
                    depth: height,
                    bevelEnabled: true,
                    bevelThickness: 0,
                    bevelSize: 0,
                    bevelOffset: 0,
                    bevelSegments: 1,
                };
                const extrudeGeometry = new THREE.ExtrudeGeometry(contour, extrudeSettings);
                if (transform) {
                    const threeTransform = new THREE.Matrix4().fromArray(transform.elements);
                    extrudeGeometry.applyMatrix4(threeTransform);
                }
                return extrudeGeometry;
            };

            let geometry2 = newExtrudeGeometry(shape, extrusionDepth, rot);
            const position = new THREE.Vector3(geom.origin.elements[12], geom.origin.elements[13], geom.origin.elements[14]);
            const svgMaterial = new THREE.MeshBasicMaterial({ color: 0x00aaff });
            svgMaterial.side = THREE.DoubleSide; // Show both sides of the extruded shape
            const mesh = new THREE.Mesh(geometry2, svgMaterial);
            mesh.position.copy(position);
            threeObject.add(mesh);

        });
    }
    else if (geom.meshUrl) {
        console.warn("Mesh loading not implemented yet. URL:", geom.meshUrl);
    }
    else if (geom.size) {
        const geometry = new THREE.BoxGeometry(geom.size._x, geom.size._y, geom.size._z);
        // transform so that the origin is at rear left bottom corner
        //        geometry.translate(geom.size._x / 2, geom.size._y / 2, geom.size._z / 2);
        const material = new THREE.MeshBasicMaterial({ color: Math.random() * 0xff00ff });
        if (new TC.Vector3(geom.size._x, geom.size._y, geom.size._z).length() > 650) {
            // make transparent
            material.transparent = true;
            material.opacity = 0.3;
        }
        const mesh = new THREE.Mesh(geometry, material);


        mesh.position.copy(new THREE.Vector3(
            node.orderLineEntry?._x + node.orderLineEntry?._dimx / 2,
            node.orderLineEntry?._y + node.orderLineEntry?._dimy / 2,
            node.orderLineEntry?._z + node.orderLineEntry?._dimz / 2,
        ));

        threeObject.add(mesh);
    }

    node.children.forEach(childNode => {
        const childThreeObject = orderObjectNodeToThreeObject3D(childNode);
        threeObject.add(childThreeObject);
    });
    return threeObject;
}


