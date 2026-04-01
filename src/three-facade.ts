import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/Addons.js";
import { type IObject3DNode, type ISceneGeometryConversionSettings, Object3DNodeKind } from "./scene";
import * as TC from "./tc/base";
import { loadSvgShapesFromCacheOrParse } from "./svg-helper";
import { SVGRenderer } from "three/examples/jsm/Addons.js";

export interface IReadySceneObjectUserData {
    orderSceneNode: IObject3DNode;
    nodeId: string;
    kind: Object3DNodeKind;
}

export type IReadySceneObject = THREE.Object3D & {
    userData: THREE.Object3D['userData'] & IReadySceneObjectUserData;
};

export interface IReadyThreeScene {
    scene: THREE.Scene;
    rootObject: IReadySceneObject | null;
    objectsByNodeId: Map<string, IReadySceneObject>;
    objectBySceneNode: WeakMap<IObject3DNode, IReadySceneObject>;
    sceneNodeByObject: WeakMap<THREE.Object3D, IObject3DNode>;
}

type ReadySceneRegistry = {
    objectsByNodeId: Map<string, IReadySceneObject>;
    objectBySceneNode: WeakMap<IObject3DNode, IReadySceneObject>;
    sceneNodeByObject: WeakMap<THREE.Object3D, IObject3DNode>;
};

function _createReadySceneRegistry(): ReadySceneRegistry {
    return {
        objectsByNodeId: new Map<string, IReadySceneObject>(),
        objectBySceneNode: new WeakMap<IObject3DNode, IReadySceneObject>(),
        sceneNodeByObject: new WeakMap<THREE.Object3D, IObject3DNode>(),
    };
}

function _attachSceneNodeReference(object: THREE.Object3D, node: IObject3DNode): IReadySceneObject {
    const readyObject = object as IReadySceneObject;
    readyObject.userData.orderSceneNode = node;
    readyObject.userData.nodeId = node.id;
    readyObject.userData.kind = node.kind;
    return readyObject;
}

export function getOrderSceneNodeFromReadySceneObject(object: THREE.Object3D): IObject3DNode | undefined {
    return (object.userData as Partial<IReadySceneObjectUserData>).orderSceneNode;
}

function _registerReadySceneObject(
    object: THREE.Object3D,
    node: IObject3DNode,
    registry?: ReadySceneRegistry,
): IReadySceneObject {
    const readyObject = _attachSceneNodeReference(object, node);
    if (registry) {
        registry.objectsByNodeId.set(node.id, readyObject);
        registry.objectBySceneNode.set(node, readyObject);
        registry.sceneNodeByObject.set(readyObject, node);
    }
    return readyObject;
}

export function getReadySceneObjectForOrderSceneNode(
    readyScene: IReadyThreeScene,
    node: IObject3DNode,
): IReadySceneObject | undefined {
    return readyScene.objectBySceneNode.get(node);
}

export function getReadySceneObjectByNodeId(
    readyScene: IReadyThreeScene,
    nodeId: string,
): IReadySceneObject | undefined {
    return readyScene.objectsByNodeId.get(nodeId);
}

export function getOrderSceneNodeFromReadyThreeSceneObject(
    readyScene: IReadyThreeScene,
    object: THREE.Object3D,
): IObject3DNode | undefined {
    return readyScene.sceneNodeByObject.get(object) ?? getOrderSceneNodeFromReadySceneObject(object);
}

interface IExtendedDrawingRenderSettings extends ISceneGeometryConversionSettings {
    edgesGeometryThresholdAngle?: number;
    cameraDirection?: TC.Vector3;
}


type ThreeFacadeHmrData = {
    object3dCache?: Map<string, THREE.Object3D>;
};

const _hmrData = (import.meta as any).hot?.data as ThreeFacadeHmrData | undefined;



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
 * @param filter Optional filter function to determine which nodes to include.
 * @returns Three.js scene containing the converted object hierarchy.
 */
export async function sceneToReadyThreeScene(
    rootObject3DNode: IObject3DNode,
    drawingRenderSettings: IExtendedDrawingRenderSettings = {},
    filter: ((node: IObject3DNode) => boolean) | undefined = undefined,
): Promise<IReadyThreeScene> {
    const registry = _createReadySceneRegistry();
    const threeScene = new THREE.Scene();

    const rootObject = await orderObjectNodeToThreeObject3D(
        rootObject3DNode,
        drawingRenderSettings,
        filter,
        registry,
    );
    if (rootObject) {
        threeScene.add(rootObject);
    }

    return {
        scene: threeScene,
        rootObject,
        objectsByNodeId: registry.objectsByNodeId,
        objectBySceneNode: registry.objectBySceneNode,
        sceneNodeByObject: registry.sceneNodeByObject,
    };
}

export async function sceneToThreeJsScene(
    rootObject3DNode: IObject3DNode,
    drawingRenderSettings: IExtendedDrawingRenderSettings = {},
    filter: ((node: IObject3DNode) => boolean) | undefined = undefined,
): Promise<THREE.Scene> {
    return (await sceneToReadyThreeScene(rootObject3DNode, drawingRenderSettings, filter)).scene;
}


/**
 * Converts a custom scene node and its descendants into a Three.js object tree.
 *
 * The node transform is copied to the generated `THREE.Object3D`. Any node-local
 * geometry metadata is translated into the matching Three.js mesh structure.
 *
 * @param node Source scene node to convert.
 * @param drawingRenderSettings Optional renderer-specific geometry conversion settings.
 * @param filter Optional filter function to determine which nodes to include.
 * @returns Three.js object representing the source subtree.
 */
export async function orderObjectNodeToThreeObject3D(
    node: IObject3DNode,
    drawingRenderSettings: IExtendedDrawingRenderSettings = {},
    filter: ((node: IObject3DNode) => boolean) | undefined = undefined,
    registry?: ReadySceneRegistry,
): Promise<IReadySceneObject | null> {
    const passesFilter = !filter || filter(node);
    if (!passesFilter) {
        return null;
    }

    const threeObject = _registerReadySceneObject(new THREE.Object3D(), node, registry);
    threeObject.name = node.id;
    // set transform
    threeObject.matrix.fromArray(node.transform.elements);
    threeObject.matrixAutoUpdate = false; // we will manage the matrix updates manually

    const geom = node.geometry(drawingRenderSettings);

    const mainMaterial = node.kind === Object3DNodeKind.Wall ? drawingRenderSettings.wallsMaterial : drawingRenderSettings.material;
    const wireframeMaterial = drawingRenderSettings.wireframeMaterial;

    if (geom.hidden) {
        return null;
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
        let shapes: THREE.Shape[] = loadSvgShapesFromCacheOrParse(geom.svgString);
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
        node.children.map((childNode) => orderObjectNodeToThreeObject3D(childNode, drawingRenderSettings, filter, registry))
    );
    childThreeObjects.forEach((childThreeObject) => {
        if (childThreeObject) {
            threeObject.add(childThreeObject);
        }
    });
    return threeObject;
}


export interface IRenderOrthoCameraParams {
    /** direction of the camera, if unprovided, down direction will be used */
    direction?: TC.Vector3,
    /** output image width in pixels */
    width?: number;
    /** output image height in pixels */
    height?: number;
    /**
     * optional orthographic view volume parameters; if not provided, the camera will automatically fit the scene bounding box
     */
    near?: number;
    far?: number;
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
}


/**
 * Result of the rendered drawing.
 */
export interface IRenderOrthoCameraResult {
    /** the settings that were used for rendering */
    settings: IRenderOrthoCameraParams;
    /** the matrix transforming world coordinates to view coordinates */
    worldToViewMatrix: TC.Matrix4;
    /** the rendered data */
    data: any,
}

export function appendSvgElementsToRenderedImage(
    domElement: Element,
    append: (svgRoot: SVGSVGElement) => void,
): Element {
    if (!(domElement instanceof SVGSVGElement)) {
        return domElement;
    }

    append(domElement);
    return domElement;
}

export function appendTopLeftHelloAnnotation(domElement: Element): Element {
    return appendSvgElementsToRenderedImage(domElement, (svgRoot) => {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', '16');
        text.setAttribute('y', '28');
        text.setAttribute('fill', '#000000');
        text.setAttribute('font-size', '24');
        text.setAttribute('font-family', 'Arial, sans-serif');
        text.textContent = 'hello';
        svgRoot.appendChild(text);
    });
}

function _getBox3Corners(box: THREE.Box3): THREE.Vector3[] {
    return [
        new THREE.Vector3(box.min.x, box.min.y, box.min.z),
        new THREE.Vector3(box.min.x, box.min.y, box.max.z),
        new THREE.Vector3(box.min.x, box.max.y, box.min.z),
        new THREE.Vector3(box.min.x, box.max.y, box.max.z),
        new THREE.Vector3(box.max.x, box.min.y, box.min.z),
        new THREE.Vector3(box.max.x, box.min.y, box.max.z),
        new THREE.Vector3(box.max.x, box.max.y, box.min.z),
        new THREE.Vector3(box.max.x, box.max.y, box.max.z),
    ];
}

function _resolveUpVector(direction: THREE.Vector3): THREE.Vector3 {
    const worldY = new THREE.Vector3(0, 1, 0);
    if (Math.abs(direction.dot(worldY)) < 0.999) {
        return worldY;
    }
    return new THREE.Vector3(0, 0, 1);
}

/**
 * Render the scene with an orthographic camera based on the provided settings, and return the rendered data along with the camera settings used.
 * @param sceneRoot the root node of the scene to render
 * @param settings @see IRenderOrthoCameraParams
 * @returns @see IRenderOrthoCameraResult
 */
export async function renderReadyThreeScene(
    sceneRoot: IObject3DNode,
    filter: ((node: IObject3DNode) => boolean) | undefined = undefined,
    drawingSettings: IExtendedDrawingRenderSettings,
    settings: IRenderOrthoCameraParams,
): Promise<IRenderOrthoCameraResult> {

    const threeScene: THREE.Scene = await sceneToThreeJsScene(sceneRoot, drawingSettings, filter);
    threeScene.updateMatrixWorld(true);

    const sceneBoundingBox = new THREE.Box3().setFromObject(threeScene);
    if (sceneBoundingBox.isEmpty()) {
        sceneBoundingBox.set(
            new THREE.Vector3(-0.5, -0.5, -0.5),
            new THREE.Vector3(0.5, 0.5, 0.5),
        );
    }

    const boundingBoxCenter = sceneBoundingBox.getCenter(new THREE.Vector3());
    const bboxSize = sceneBoundingBox.getSize(new THREE.Vector3());
    const bboxRadius = Math.max(bboxSize.length() * 0.5, 1);

    const direction = settings.direction
        ? new THREE.Vector3(settings.direction._x, settings.direction._y, settings.direction._z)
        : new THREE.Vector3(0, -1, 0);
    if (direction.lengthSq() < 1e-12) {
        direction.set(0, -1, 0);
    }
    direction.normalize();

    const cameraDistance = bboxRadius * 3;
    const cameraPosition = boundingBoxCenter.clone().sub(direction.clone().multiplyScalar(cameraDistance));

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.copy(cameraPosition);
    camera.up.copy(_resolveUpVector(direction));
    camera.lookAt(boundingBoxCenter);
    camera.updateMatrixWorld(true);

    const boxCorners = _getBox3Corners(sceneBoundingBox);
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (const corner of boxCorners) {
        const p = corner.clone().applyMatrix4(camera.matrixWorldInverse);
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
    }

    const extentPadding = Math.max(1e-4, Math.max(maxX - minX, maxY - minY) * 0.01);
    const nearFarPadding = Math.max(1e-4, (maxZ - minZ) * 0.01);

    const computedLeft = minX - extentPadding;
    const computedRight = maxX + extentPadding;
    const computedTop = maxY + extentPadding;
    const computedBottom = minY - extentPadding;
    const computedNear = Math.max(1e-4, -maxZ - nearFarPadding);
    const computedFar = Math.max(computedNear + 1e-3, -minZ + nearFarPadding);

    camera.left = settings.left ?? computedLeft;
    camera.right = settings.right ?? computedRight;
    camera.top = settings.top ?? computedTop;
    camera.bottom = settings.bottom ?? computedBottom;
    camera.near = settings.near ?? computedNear;
    camera.far = settings.far ?? computedFar;
    camera.updateProjectionMatrix();

    const worldToViewMatrix = new TC.Matrix4().fromArray(camera.matrixWorldInverse.elements);

    const outputWidth = Math.max(1, Math.round(settings.width ?? 1200));
    const outputHeight = Math.max(1, Math.round(settings.height ?? 800));

    const renderedDomElement = appendTopLeftHelloAnnotation(
        svgRenderer(threeScene, camera, outputWidth, outputHeight),
    );

    return {
        settings: {
            direction: new TC.Vector3(direction.x, direction.y, direction.z),
            width: outputWidth,
            height: outputHeight,
            left: camera.left,
            right: camera.right,
            top: camera.top,
            bottom: camera.bottom,
            near: camera.near,
            far: camera.far,
        },
        worldToViewMatrix,
        data: { domElement: renderedDomElement },
    };

}


function rasterRenderer(threeScene: THREE.Scene, camera: THREE.Camera, outputWidth = 1200, outputHeight = 800): HTMLImageElement {
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(outputWidth, outputHeight, false);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0xffffff, 1);
    renderer.render(threeScene, camera);

    const imgElement = document.createElement('img');
    imgElement.src = renderer.domElement.toDataURL('image/png');
    imgElement.className = 'preview-image';
    renderer.dispose();
    return imgElement;
}

function svgRenderer(threeScene: THREE.Scene, camera: THREE.Camera, outputWidth = 1200, outputHeight = 800): SVGSVGElement {
    const renderer = new SVGRenderer();
    renderer.setSize(outputWidth, outputHeight);
    renderer.render(threeScene, camera);
    const svg = renderer.domElement as SVGSVGElement;
    svg.classList.add('preview-image');
    return svg;
}
