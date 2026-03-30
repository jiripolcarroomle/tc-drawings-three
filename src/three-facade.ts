import * as THREE from "three";
import { SVGLoader, type SVGResultPaths } from 'three/addons/loaders/SVGLoader.js';
import { OBJLoader } from "three/examples/jsm/Addons.js";
import { type IObject3DNode, type ISceneGeometryConversionSettings, Object3DNodeKind } from "./scene";
import * as TC from "./tc/base";

interface IExtendedDrawingRenderSettings extends ISceneGeometryConversionSettings {
    edgesGeometryThresholdAngle?: number;
}


type ThreeFacadeHmrData = {
    object3dCache?: Map<string, THREE.Object3D>;
};

const _hmrData = (import.meta as any).hot?.data as ThreeFacadeHmrData | undefined;


// Cache parsed SVG shapes (module-local) and fetched+parsed Object3D models.
// Only the Object3D cache is persisted across Vite HMR updates to avoid
// re-downloading meshes while iterating.
const _svgShapeCache = new Map<string, THREE.Shape[]>();
const _object3dCache: Map<string, THREE.Object3D> = _hmrData?.object3dCache ?? new Map();

if (_hmrData) {
    _hmrData.object3dCache = _object3dCache;
}

if ((import.meta as any).hot) {
    (import.meta as any).hot.dispose((data: ThreeFacadeHmrData) => {
        data.object3dCache = _object3dCache;
    });
}

const _OBJ_TEXT_CACHE_NAME = 'tc-drawings-three:obj-text:v1';
const _USE_PERSISTENT_OBJ_TEXT_CACHE = Boolean((import.meta as any).env?.DEV);
async function _fetchTextFromCacheOrFetch(url: string): Promise<string> {
    // DEV-only: Persist downloads across HMR *and* full page reloads.
    // This caches the raw OBJ response; we still parse it into Object3D per session.
    // In production, prefer standard HTTP caching (Cache-Control/ETag) and/or
    // versioned URLs instead of app-managed persistent caching.
    if (!_USE_PERSISTENT_OBJ_TEXT_CACHE) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`fetch(${url}) failed: ${response.status} ${response.statusText}`);
        }
        return await response.text();
    }

    try {
        if (typeof caches !== 'undefined') {
            const cache = await caches.open(_OBJ_TEXT_CACHE_NAME);
            const cachedResponse = await cache.match(url);
            if (cachedResponse) {
                return await cachedResponse.text();
            }

            console.log(`OBJ fetch ${url}`);
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`fetch(${url}) failed: ${response.status} ${response.statusText}`);
            }
            try {
                await cache.put(url, response.clone());
            } catch (e) {
                // Cache put can fail for opaque/cors responses or storage limits.
                console.warn(`OBJ CacheStorage put failed for ${url}: ${e}`);
            }
            return await response.text();
        }
    } catch (e) {
        console.warn(`OBJ CacheStorage error for ${url}: ${e}`);
    }

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`fetch(${url}) failed: ${response.status} ${response.statusText}`);
    }
    return await response.text();
}

function _loadSvgShapesFromCacheOrParse(
    svg: string,
    partIdForLogging?: string
): THREE.Shape[] {
    if (_svgShapeCache.has(svg)) {
        return _svgShapeCache.get(svg)!;
    }

    let shapes: THREE.Shape[] = [];
    try {
        const svgData = svgLoader.parse(svg);
        if (svgData.paths.length <= 0) {
            console.error(`SVG data does not contain any paths! Part ${partIdForLogging ?? ''} will not be drawn! Is the SVG valid? (SVG: ${svg})`);
        }
        svgData.paths.forEach((path: SVGResultPaths) => {
            const pathIsCCW =
                path.subPaths.length > 0 &&
                !THREE.ShapeUtils.isClockWise(path.subPaths[0].getPoints());
            shapes = shapes.concat(path.toShapes(pathIsCCW));
        });
    } catch (e) {
        console.error(
            `Failed to parse SVG for extrude part ${partIdForLogging ?? ''}: ${svg} \nexception:${e}`
        );
    }
    _svgShapeCache.set(svg, shapes);
    return shapes;
}

const objLoader = new OBJLoader();

async function _loadObject3DFromCacheOrFetch(
    url: string,
    material: THREE.MeshBasicMaterial | undefined,
    partIdForLogging?: string
): Promise<THREE.Object3D> {
    if (_object3dCache.has(url)) {
        return _object3dCache.get(url)!.clone();
    }

    let obj: THREE.Object3D;
    try {
        const md = await _fetchTextFromCacheOrFetch(url);
        obj = objLoader.parse(md);
        if (material) {
            obj.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    (child as THREE.Mesh).material = material.clone();
                }
            });
        }
    } catch (e) {
        console.error(
            `Failed to fetch 3d model for part: ${partIdForLogging ?? ''} exception: ${e}`
        );
        obj = new THREE.Group();
        const errMaterial = material?.clone() ?? new THREE.MeshBasicMaterial({ color: 0xff0000 });
        errMaterial.transparent = true;
        errMaterial.opacity = 0.5;
        // add a box
    }

    _object3dCache.set(url, obj);
    return obj.clone();
}

function _createSurfaceMaterial(
    materialBase: any | undefined,
): THREE.MeshBasicMaterial | undefined {
    if (!materialBase) {
        return undefined;
    }
    return new THREE.MeshBasicMaterial(materialBase);
}

function _createWireframeMaterial(
    materialBase: any | undefined,
): THREE.LineBasicMaterial | undefined {
    if (!materialBase) {
        return undefined;
    }
    return new THREE.LineBasicMaterial(materialBase);
}

function _copyLocalTransform(source: THREE.Object3D, target: THREE.Object3D): void {
    target.position.copy(source.position);
    target.quaternion.copy(source.quaternion);
    target.scale.copy(source.scale);
}

function _addConfiguredRenderable(
    parent: THREE.Object3D,
    object: THREE.Object3D,
    configureRenderable?: (object: THREE.Object3D) => void,
): void {
    configureRenderable?.(object);
    parent.add(object);
}

function _createEdgesWireframe(
    geometry: THREE.BufferGeometry,
    material: THREE.LineBasicMaterial,
    drawingRenderSettings: IExtendedDrawingRenderSettings,
): THREE.LineSegments {
    return new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, drawingRenderSettings.edgesGeometryThresholdAngle),
        material,
    );
}

function _collectMeshChildren(objectGroup: THREE.Object3D): THREE.Mesh[] {
    const meshChildren: THREE.Mesh[] = [];
    objectGroup.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
            meshChildren.push(child as THREE.Mesh);
        }
    });
    return meshChildren;
}

/**
 * Adds a renderable to a parent Object3D, with optional surface and wireframe
 * materials.
 * This helper supports both raw BufferGeometry and prebuilt Object3D groups so
 * both geometry-based and imported-mesh rendering paths share the same material
 * and wireframe setup.
 * @param parent the THREE.Object3D to which the renderable will be added as a child
 * @param renderable the geometry or object group to add
 * @param materialBase the base material properties for the surface mesh; if undefined, no surface mesh will be created or shown
 * @param wireframeMaterialBase the base material properties for the wireframe; if undefined, no wireframe will be created
 * @param drawingRenderSettings the settings that may influence how the geometry is rendered, such as edge thresholds for wireframe generation
 * @param configureRenderable Optional callback to configure newly created renderable objects before adding them to the parent
 * @param configureSurfaceMaterial Optional callback to configure the surface material before it's applied to meshes
 */
function _addRenderableWithOptionalWireframe(
    parent: THREE.Object3D,
    renderable: THREE.BufferGeometry | THREE.Object3D,
    materialBase: any | undefined,
    wireframeMaterialBase: any | undefined,
    drawingRenderSettings: IExtendedDrawingRenderSettings,
    configureRenderable?: (object: THREE.Object3D) => void,
    configureSurfaceMaterial?: (material: THREE.MeshBasicMaterial) => void,
): void {
    const surfaceMaterial = _createSurfaceMaterial(materialBase);
    if (surfaceMaterial) {
        configureSurfaceMaterial?.(surfaceMaterial);
    }

    const wireframeMaterial = _createWireframeMaterial(wireframeMaterialBase);

    if (renderable instanceof THREE.BufferGeometry) {
        if (surfaceMaterial) {
            _addConfiguredRenderable(parent, new THREE.Mesh(renderable, surfaceMaterial), configureRenderable);
        }
        if (wireframeMaterial) {
            _addConfiguredRenderable(
                parent,
                _createEdgesWireframe(renderable, wireframeMaterial, drawingRenderSettings),
                configureRenderable,
            );
        }
        return;
    }

    const objectGroup = renderable;
    const meshChildren = _collectMeshChildren(objectGroup);
    for (const mesh of meshChildren) {
        mesh.visible = Boolean(surfaceMaterial);
        if (surfaceMaterial) {
            mesh.material = surfaceMaterial;
        }
    }

    if (wireframeMaterial) {
        for (const mesh of meshChildren) {
            const wireframe = _createEdgesWireframe(mesh.geometry, wireframeMaterial, drawingRenderSettings);
            _copyLocalTransform(mesh, wireframe);
            objectGroup.add(wireframe);
        }
    }

    if (surfaceMaterial || wireframeMaterial) {
        parent.add(objectGroup);
    }
}

/**
 * Converts the custom scene graph into a standalone Three.js scene.
 *
 * @param rootObject3DNode Root node of the custom scene graph.
 * @param drawingRenderSettings Optional renderer-specific geometry conversion settings.
 * @returns Three.js scene containing the converted object hierarchy.
 */
export async function sceneToThreeJsScene(
    rootObject3DNode: IObject3DNode,
    drawingRenderSettings: IExtendedDrawingRenderSettings = {},
): Promise<THREE.Scene> {
    const threeScene = new THREE.Scene();

    const rootThreeObject = await orderObjectNodeToThreeObject3D(rootObject3DNode, drawingRenderSettings);
    threeScene.add(rootThreeObject);

    return threeScene;
}

const svgLoader = new SVGLoader();

/**
 * Converts a custom scene node and its descendants into a Three.js object tree.
 *
 * The node transform is copied to the generated `THREE.Object3D`. Any node-local
 * geometry metadata is translated into the matching Three.js mesh structure.
 *
 * @param node Source scene node to convert.
 * @param drawingRenderSettings Optional renderer-specific geometry conversion settings.
 * @returns Three.js object representing the source subtree.
 */
export async function orderObjectNodeToThreeObject3D(
    node: IObject3DNode,
    drawingRenderSettings: IExtendedDrawingRenderSettings = {},
): Promise<THREE.Object3D> {
    const threeObject = new THREE.Object3D();
    threeObject.name = node.id;
    threeObject.userData.kind = node.kind;
    // set transform
    threeObject.matrix.fromArray(node.transform.elements);
    threeObject.matrixAutoUpdate = false; // we will manage the matrix updates manually

    const geom = node.geometry(drawingRenderSettings);

    const mainMaterial = node.kind === Object3DNodeKind.Wall ? drawingRenderSettings.wallsMaterial : drawingRenderSettings.material;
    const wireframeMaterial = drawingRenderSettings.wireframeMaterial;

    if (geom.hidden) {
        // Don't add any geometry, but still create the Three.js object and process children.}        
    }
    else if (geom.svgPath?.length) {
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

        const mainGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

        _addRenderableWithOptionalWireframe(
            threeObject,
            mainGeometry,
            mainMaterial,
            wireframeMaterial,
            drawingRenderSettings,
            (object) => {
                // Rotate so extrusion is "up" in the scene (world +Y).
                if (geom.svgExtrusionDirection === 'z' || !geom.svgExtrusionDirection) {
                    object.rotation.x = -Math.PI / 2;
                }
                else if (geom.svgExtrusionDirection === 'x') {
                    object.rotation.z = Math.PI / 2;
                }
            },
        );
    }
    else if (geom.svgString) {
        let shapes: THREE.Shape[] = _loadSvgShapesFromCacheOrParse(geom.svgString);
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

            const geometry2 = newExtrudeGeometry(shape, extrusionDepth, rot);
            const position = new THREE.Vector3(geom.origin.elements[12], geom.origin.elements[13], geom.origin.elements[14]);
            _addRenderableWithOptionalWireframe(
                threeObject,
                geometry2,
                mainMaterial,
                wireframeMaterial,
                drawingRenderSettings,
                (object) => {
                    object.position.copy(position);
                },
                (material) => {
                    material.side = THREE.DoubleSide;
                },
            );

        });
    }
    else if (geom.meshUrl) {
        const objGrp = await _loadObject3DFromCacheOrFetch(geom.meshUrl, undefined, node.id);

        let bbox = new THREE.Box3().setFromObject(objGrp);
        let bsize = new THREE.Vector3(0, 0, 0);
        bbox.getSize(bsize);
        let m4 = new THREE.Matrix4();
        m4.scale(
            new THREE.Vector3(
                node.orderLineEntry!._dimx / bsize.x,
                node.orderLineEntry!._dimy / bsize.y,
                node.orderLineEntry!._dimz / bsize.z
            )
        );
        objGrp.applyMatrix4(m4);

        bbox = new THREE.Box3().setFromObject(objGrp);
        m4 = new THREE.Matrix4();
        m4.setPosition(
            node.orderLineEntry!._x - bbox.min.x,
            node.orderLineEntry!._y - bbox.min.y,
            node.orderLineEntry!._z - bbox.min.z
        );
        objGrp.applyMatrix4(m4);

        _addRenderableWithOptionalWireframe(threeObject, objGrp, mainMaterial, wireframeMaterial, drawingRenderSettings);
    }
    else if (geom.size) {
        const geometry = new THREE.BoxGeometry(geom.size._x, geom.size._y, geom.size._z);
        _addRenderableWithOptionalWireframe(
            threeObject,
            geometry,
            mainMaterial,
            wireframeMaterial,
            drawingRenderSettings,
            (object) => {
                object.position.copy(new THREE.Vector3(
                    node.orderLineEntry?._x + node.orderLineEntry?._dimx / 2,
                    node.orderLineEntry?._y + node.orderLineEntry?._dimy / 2,
                    node.orderLineEntry?._z + node.orderLineEntry?._dimz / 2,
                ));
            },
        );
    }



    const childThreeObjects = await Promise.all(
        node.children.map((childNode) => orderObjectNodeToThreeObject3D(childNode, drawingRenderSettings))
    );
    childThreeObjects.forEach((childThreeObject) => {
        threeObject.add(childThreeObject);
    });
    return threeObject;
}


