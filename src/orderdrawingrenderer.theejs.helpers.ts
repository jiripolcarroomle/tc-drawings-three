import * as THREE from "three";
import { OBJLoader, SVGLoader, type SVGResultPaths } from "three/examples/jsm/Addons.js";
import { type ISceneGeometryConversionSettings } from "./orderdrawingrenderer.interface";
import { Object3DNodeKind } from "./scene.interface";
import { type IOrderSceneNode } from "./scene.interface";
import * as TC from "./tc/base";
import { logError, logWarning, logInfo } from "./tc/base";
import { SVGRenderer } from "three/examples/jsm/Addons.js";

export interface IExtendedDrawingRenderSettings extends ISceneGeometryConversionSettings {
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
            logInfo(`OBJ fetch ${url}`);
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`fetch(${url}) failed: ${response.status} ${response.statusText}`);
            }
            try {
                await cache.put(url, response.clone());
            } catch (e) {
                // Cache put can fail for opaque/cors responses or storage limits.
                logWarning(`OBJ CacheStorage put failed for ${url}: ${e}`);
            }
            return await response.text();
        }
    } catch (e) {
        logWarning(`OBJ CacheStorage error for ${url}: ${e}`);
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
        logError(
            `Failed to fetch 3d model for part: ${partIdForLogging ?? ''} exception: ${e}`
        );
        // we need to return something
        obj = new THREE.Group();
        obj.name = `Failed to load: ${url}`;
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
export async function sceneToThreeJsScene(
    rootObject3DNode: IOrderSceneNode,
    drawingRenderSettings: IExtendedDrawingRenderSettings = {},
    filter: ((node: IOrderSceneNode) => boolean) | undefined = undefined,
): Promise<{ scene: THREE.Scene, nodesInScene: IOrderSceneNode[] }> {
    const scene = new THREE.Scene();

    const material = drawingRenderSettings.material ?? new THREE.MeshBasicMaterial({ color: 0xcccccc });
    (material as THREE.MeshBasicMaterial).polygonOffset = true;
    (material as THREE.MeshBasicMaterial).polygonOffsetFactor = 1;
    (material as THREE.MeshBasicMaterial).polygonOffsetUnits = 1;

    const wallsMaterial = drawingRenderSettings.wallsMaterial ?? undefined;
    if (wallsMaterial) {
        (wallsMaterial as THREE.MeshBasicMaterial).polygonOffset = true;
        (wallsMaterial as THREE.MeshBasicMaterial).polygonOffsetFactor = 1;
        (wallsMaterial as THREE.MeshBasicMaterial).polygonOffsetUnits = 1;
    }

    const nodesInScene: IOrderSceneNode[] = [];

    const rootObject = await orderObjectNodeToThreeObject3D(
        rootObject3DNode,
        drawingRenderSettings,
        filter,
        nodesInScene,
    );
    if (rootObject) {
        scene.add(rootObject);
    }

    scene.updateMatrixWorld(true);

    return { scene, nodesInScene };
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
    node: IOrderSceneNode,
    drawingRenderSettings: IExtendedDrawingRenderSettings = {},
    filter: ((node: IOrderSceneNode) => boolean) | undefined = undefined,
    convertedNodesCollector: IOrderSceneNode[],
): Promise<THREE.Object3D | null> {
    const passesFilter = (filter === undefined) || filter(node);
    if (!passesFilter) {
        return null;
    }

    if (node.id.includes('hinge')) {
        logInfo(`Node ${node.id} passed filter and will be rendered.`);
    }

    convertedNodesCollector.push(node);

    const threeObject = new THREE.Object3D();
    threeObject.name = node.id;
    // set transform
    threeObject.matrix.fromArray(node.transform.elements);
    threeObject.matrixAutoUpdate = false; // we will manage the matrix updates manually

    const geom = node.geometry(drawingRenderSettings);

    const mainMaterial = node.kind === Object3DNodeKind.Wall ? drawingRenderSettings.wallsMaterial : drawingRenderSettings.material;
    const wireframeMaterial = node.kind === Object3DNodeKind.Wall ? drawingRenderSettings.wallsWireframeMaterial : drawingRenderSettings.wireframeMaterial;

    if (geom.hidden) {
        return null;
    }
    else if (geom.svgString) {
        let shapes: THREE.Shape[] = loadSvgShapesFromCacheOrParse(geom.svgString);
        const rot = new TC.Matrix4();
        let extrusionDepth;
        if (geom.svgExtrusionDirection == 'x') {
            extrusionDepth = geom.svgDepth ?? node.orderLineEntry?._dimx ?? 1000;
            rot.makeRotationAxis(0, 1, 0, 270);
            extrusionDepth *= -1;
        } else if (geom.svgExtrusionDirection == 'y') {
            extrusionDepth = geom.svgDepth ?? node.orderLineEntry?._dimy ?? 1000;
            rot.makeRotationAxis(1, 0, 0, 90);
            extrusionDepth *= -1;
        }
        else {
            extrusionDepth = geom.svgDepth ?? node.orderLineEntry?._dimz ?? 1000;
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
        const originX = geom.origin.elements[12];
        const originY = geom.origin.elements[13];
        const originZ = geom.origin.elements[14];

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
            originX - bbox.min.x,
            originY - bbox.min.y,
            originZ - bbox.min.z
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
                    geom.origin.elements[12] + geom.size!._x / 2,
                    geom.origin.elements[13] + geom.size!._y / 2,
                    geom.origin.elements[14] + geom.size!._z / 2,
                ));
            },
        );
    }



    const childThreeObjects = await Promise.all(
        node.children.map((childNode) => orderObjectNodeToThreeObject3D(childNode, drawingRenderSettings, filter, convertedNodesCollector))
    );
    childThreeObjects.forEach((childThreeObject) => {
        if (childThreeObject) {
            threeObject.add(childThreeObject);
        }
    });
    return threeObject;
}


export function _getBox3Corners(box: THREE.Box3): THREE.Vector3[] {
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

export function _resolveUpVector(direction: THREE.Vector3): THREE.Vector3 {
    const worldY = new THREE.Vector3(0, 1, 0);
    if (Math.abs(direction.dot(worldY)) < 0.999) {
        return worldY;
    }
    return new THREE.Vector3(0, 0, 1);
}

export function rasterRenderer(threeScene: THREE.Scene, camera: THREE.Camera, outputWidth = 1200, outputHeight = 800): string {
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(outputWidth, outputHeight, false);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0xffffff, 1);
    renderer.render(threeScene, camera);

    const pngDataUrl = renderer.domElement.toDataURL('image/png');
    renderer.dispose();
    return pngDataUrl;
}

function svgRenderer(threeScene: THREE.Scene, camera: THREE.Camera, outputWidth = 1200, outputHeight = 800): SVGSVGElement {
    const renderer = new SVGRenderer();
    renderer.setSize(outputWidth, outputHeight);
    renderer.render(threeScene, camera);
    const svg = renderer.domElement as SVGSVGElement;
    svg.classList.add('preview-image');
    return svg;
}


// Cache parsed SVG shapes (module-local) and fetched+parsed Object3D models.
// Only the Object3D cache is persisted across Vite HMR updates to avoid
// re-downloading meshes while iterating.
const _svgShapeCache = new Map<string, THREE.Shape[]>();

const svgLoader = new SVGLoader();


function loadSvgShapesFromCacheOrParse(
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
            logError(`SVG data does not contain any paths! Part ${partIdForLogging ?? ''} will not be drawn! Is the SVG valid? (SVG: ${svg})`);
        }
        svgData.paths.forEach((path: SVGResultPaths) => {
            const pathIsCCW =
                path.subPaths.length > 0 &&
                !THREE.ShapeUtils.isClockWise(path.subPaths[0].getPoints());
            shapes = shapes.concat(path.toShapes(pathIsCCW));
        });
    } catch (e) {
        logError(
            `Failed to parse SVG for extrude part ${partIdForLogging ?? ''}: ${svg} \nexception:${e}`
        );
    }
    _svgShapeCache.set(svg, shapes);
    return shapes;
}
