
import * as THREE from "three";
import { Matrix4, Vector3 } from "./tc/base";
import { createWallsGroupFromOrderData, type IWallSegment } from "./wall";

interface IDrawingRenderSettings {
}

interface ISvgPathNode {
    command: 'M' | 'L' | 'Z';
    args: number[];
}

interface IGeometryData {
    ownerNode: IObject3DNode;
    origin: Matrix4;
    size?: Vector3;
    svgPath?: ISvgPathNode[];
    svgDepth?: number;
    meshUrl?: string;
}

/**
 * The kind of node determines how it should be rendered and interacted with.
 * - PosGroup: order line pos group, this provides coordinate system for the parts
 * - Group: no geometry, only transformation
 * - Wall: created from room data, has an SVG extruded geometry
 * - Part: created from part data, has a box, SVG extrusion or mesh geometry
 * - Module: created from module data, has a bounding box (size, position and transform), but no geometry
 */
enum Object3DNodeKind {
    PosGroup = "posGroup",
    Group = "group",
    Wall = "wall",
    Part = "part",
    Module = "module",
}


// extend any because we don't have the structure in this project
interface AnyObject {
    [key: string]: any;
}

// extend any because we don't have the structure in this project
interface IOrderLineEntry extends AnyObject { }

interface IObject3DNode {
    /**
     * The class is used to categorize nodes into types (e.g. wall, part, module).
     */
    readonly kind: Object3DNodeKind;
    /**
     * The ID is used to identify nodes across different scenes 
     * (e.g. original order data, filtered scene, etc.). 
     * It should be stable and unique for each node. 
     * The exact format is not important, as long as it meets these criteria.
     */
    readonly id: string;
    children: IObject3DNode[];
    /**
     * Get all children that are of kind "part". This is a convenience method to avoid having to filter the children array manually.
     */
    getPartChildren(): IObject3DNode[];
    /**
     * Get all children that are of kind "module". This is a convenience method to avoid having to filter the children array manually.
     */
    getModuleChildren(): IObject3DNode[];
    /**
     * The parent is null for the root node.
     * Is this needed?
     */
    parent: IObject3DNode | null;
    /**
     * Reference to the original order line entry that this node represents. This is useful for accessing any additional data that may be needed for rendering or interaction.
     */
    orderLineEntry: IOrderLineEntry | null;
    /**
     * The transform represents the local transformation of this node relative to its parent.
     * Recommended to get/set, where set will also update the world transform and world transform of all children.
     */
    transform: Matrix4;
    /**
     * The world transform represents the absolute transformation of this node in the scene. It is computed by combining the local transform with the world transform of the parent.
     * @param parentWorldTransform 
     */
    updateWorldTransform(parentWorldTransform: Matrix4): void;
    get worldTransform(): Matrix4;
    /**
     * adds a child to the node
     * @param child the child to add
     * @param keepWorldTransform use false if you are just adding a new child you just created from the child data; use true if you are re-parenting an existing node
     */
    addChild(child: IObject3DNode, keepWorldTransform?: boolean): void;
    /**
     * Removes a child from the node and returns it for chaining or null if the child was not found among the children of the node.
     * It recomputes the child's local transform to keep its world transform the same after detaching it from the parent.
     * @param child 
     */
    removeChild(child: IObject3DNode): IObject3DNode | null;
    /**
     * Extract geometry relevant data from this node for the renderer.
     * @param drawingRenderSettings 
     */
    geometry(drawingRenderSettings: IDrawingRenderSettings): IGeometryData;
    /**
     * Creates a deep copy of this node including all its children, but without copying the parent reference (the cloned node will have parent set to null). 
     * The ID of the cloned node should be different from the original node to maintain uniqueness. The exact format of the new ID is not important, as long as it is unique and stable.
     * A filter function is provided to allow selective cloning of the node and its children. This is useful for creating different scenes with different subsets of the original 
     * nodes for the drawing views.
     */
    clone(filter: (node: IObject3DNode) => boolean): IObject3DNode | null;

    /**
     * Data for the wall geometry. This is specific to kind wall.
     * 
     */
    wallData: IWallSegment | undefined;

}

export interface IScene {
    rootNode: IObject3DNode;
    getFilteredCopy(filter: (node: IObject3DNode) => boolean): IScene;
    render(
        nodeFilter: (node: IObject3DNode) => boolean,
        cameraPosition: Vector3,
        cameraDirection: Vector3,
        cameraSize: Vector3,
        drawingRenderSettings: any,
    ): any;
    getNodeById(id: string): IObject3DNode | null;
}



class IdsMap {
    static objects = new Map<string, IObject3DNode>();
    /**
     * Generates a random ID and checks if it is already used in the IdsMap. If it is, it generates a new one until it finds a unique ID.
     * The ID is in a pattern of a random string of 9 characters (letters and numbers) generated from Math.random().
     * @returns 
     */
    static getRandomId(): string {
        let id = null;
        let safetyCountert = 1000;
        while (id === null) {
            const tryId = Math.random().toString(36).substr(2, 9);
            if (!IdsMap.objects.has(tryId)) {
                id = tryId;
            }
            if (safetyCountert-- <= 0) {
                throw new Error("IdsMap: Failed to generate a unique ID after 1000 attempts");
            }
        }
        return id;
    }

    static useIdOrGenerateUnique(id: string): string {
        let tryId = id;
        let counter = 1;
        while (IdsMap.objects.has(tryId)) {
            tryId = `${id}_${counter++}`;
            if (counter > 1000) {
                throw new Error(`IdsMap: Failed to generate a unique ID based on ${id} after 1000 attempts`);
            }
        }
        return tryId;
    }
}


export class OrderSceneNode implements IObject3DNode {
    readonly kind: Object3DNodeKind;
    readonly id: string;
    children: IObject3DNode[] = [];

    getPartChildren(): IObject3DNode[] {
        return this.children.filter(child => child.kind === Object3DNodeKind.Part);
    }
    getModuleChildren(): IObject3DNode[] {
        return this.children.filter(child => child.kind === Object3DNodeKind.Module);
    }

    parent: IObject3DNode | null = null;
    orderLineEntry: IOrderLineEntry | null = null;
    transform: Matrix4 = new Matrix4(); // identity by default
    _worldTransform: Matrix4 = new Matrix4(); // identity by default

    get worldTransform(): Matrix4 {
        return this._worldTransform;
    }

    updateWorldTransform(parentWorldTransform: Matrix4): void {
        // worldTransform = parentWorldTransform * localTransform
        this._worldTransform = parentWorldTransform.clone().multiply(this.transform);
        // update children
        for (const child of this.children) {
            child.updateWorldTransform(this._worldTransform);
        }
    }

    addChild(child: IObject3DNode, keepWorldTransform?: boolean): void {
        if (keepWorldTransform) {
            // localTransform = inverse(parentWorldTransform) * childWorldTransform
            // This is intended for re-parenting EXISTING nodes.
            const parentWorld = computeWorldTransform(this);
            const childWorld = computeWorldTransform(child);
            child.transform = parentWorld.clone().invert().multiply(childWorld);
        }
        child.parent = this;
        this.children.push(child);
    }

    removeChild(child: IObject3DNode): IObject3DNode | null {
        const index = this.children.indexOf(child);
        if (index === -1) {
            return null;
        }
        // localTransform = inverse(parentWorldTransform) * childWorldTransform
        const parentWorld = computeWorldTransform(this);
        const childWorld = computeWorldTransform(child);
        child.transform = parentWorld.clone().invert().multiply(childWorld);
        child.parent = null;
        this.children.splice(index, 1);
        return child;
    }

    readonly _geometry: IGeometryData;
    geometry(drawingRenderSettings: IDrawingRenderSettings): IGeometryData {
        void drawingRenderSettings;
        return this._geometry!;
    }

    clone(filter: (node: IObject3DNode) => boolean): IObject3DNode | null {
        if (!filter(this)) {
            return null;
        }
        const clonedNode = new OrderSceneNode(this.id, this.kind);
        clonedNode.transform = this.transform.clone();
        clonedNode.orderLineEntry = this.orderLineEntry;
        for (const child of this.children) {
            const clonedChild = child.clone(filter);
            if (clonedChild) {
                clonedNode.addChild(clonedChild, true);
            }
        }
        return clonedNode;
    }

    wallData: IWallSegment | undefined;

    private constructor(id: string | undefined, kind: Object3DNodeKind) {
        this.kind = kind;
        this.id = id ? IdsMap.useIdOrGenerateUnique(id) : IdsMap.getRandomId();
        IdsMap.objects.set(this.id, this);
        const geometryData: IGeometryData = {
            ownerNode: this,
            origin: new Matrix4(),
        }
        this._geometry = geometryData;
    }

    static createGroup(id?: string): OrderSceneNode {
        return new OrderSceneNode(id, Object3DNodeKind.Group);
    }


    static createPosGroup(id?: string): OrderSceneNode {
        return new OrderSceneNode(id, Object3DNodeKind.PosGroup);
    }

    static createFromWall(id: string | undefined, wallSegment: IWallSegment): OrderSceneNode {
        const node = new OrderSceneNode(id, Object3DNodeKind.Wall);
        node.wallData = wallSegment;
        const segmentCenter = wallSegment.segmentStart.add(wallSegment.segmentEnd).scale(0.5);
        node.transform.setPosition(segmentCenter._x, segmentCenter._y, segmentCenter._z);
        node._geometry.svgPath = [
            { command: 'M', args: [wallSegment.segmentStart._x, wallSegment.segmentStart._z] },
            { command: 'L', args: [wallSegment.segmentBackStart._x, wallSegment.segmentBackStart._z] },
            { command: 'L', args: [wallSegment.segmentBackEnd._x, wallSegment.segmentBackEnd._z] },
            { command: 'L', args: [wallSegment.segmentEnd._x, wallSegment.segmentEnd._z] },
            { command: 'L', args: [wallSegment.segmentStart._x, wallSegment.segmentStart._z] },
        ];
        node._geometry.svgDepth = wallSegment.wallHeight;
        return node;
    }

    static createSceneRootFromIFullOrderLineGroupData(source: any /* IFullOrderLineGroupData */, posGroupsRootNode: OrderSceneNode): OrderSceneNode {
        const posGroupNode = OrderSceneNode.createPosGroup('pos-group-' + (source.groupPos.calcGroup ?? ''));
        posGroupNode.orderLineEntry = source;
        const groupPosition = Vector3.fromArray(source.groupPos.calcGroupPos);
        const groupRotationY = source.groupPos.calcGroupRotationY ?? 0;
        posGroupNode.transform.makeRotationY(groupRotationY).setPosition(groupPosition._x, groupPosition._y, groupPosition._z);
        posGroupsRootNode.addChild(posGroupNode, false);

        source.items.forEach((item: any /* IFullOrderLineData */) => {
            const orderData: any /* IBomOrderLineData */ = item.orderData;
            orderData.bomEntries?.forEach((bomEntry: any) => {
                OrderSceneNode.createScenePartNodeFromPartBase(bomEntry, posGroupNode);
            });
            OrderSceneNode.createSceneModuleNodeFromOD_Base(orderData.orderItem, posGroupNode);
        });
        return posGroupNode;
    }

    static createScenePartNodeFromPartBase(source: any /* PartBase */, posGroupNode: OrderSceneNode): OrderSceneNode {
        const partNode = new OrderSceneNode(source._partId, Object3DNodeKind.Part);

        partNode.orderLineEntry = source;
        partNode.transform = source._fullMatrix;
        if (!source._hidden) {
            posGroupNode.addChild(partNode, false);
        }
        source._childParts.forEach((childPart: any /* PartBase */) => {
            OrderSceneNode.createScenePartNodeFromPartBase(childPart, posGroupNode);
        });
        partNode._geometry.size = new Vector3(source._dimx, source._dimy, source._dimz);
        return partNode;
    }

    static createSceneModuleNodeFromOD_Base(source: any /* OD_Base */, parentNode: OrderSceneNode): OrderSceneNode {
        const moduleNode = new OrderSceneNode(source.modId + '_' + source._id, Object3DNodeKind.Module);
        moduleNode.orderLineEntry = source;
        if (source._origin) {
            moduleNode.transform.multiply(source._origin);
        }
        else {
            const modulePosition = new Vector3(source._articlePos.x, source._articlePos.y, source._articlePos.z);
            const moduleRotationY = source._articleRotationY ?? source._articlePos?.rotationY ?? 0;
            moduleNode.transform.makeRotationY(moduleRotationY).setPosition(modulePosition._x, modulePosition._y, modulePosition._z);
        }
        parentNode.addChild(moduleNode, false);
        source.m?.forEach((subModule: any /* OD_Base */) => OrderSceneNode.createSceneModuleNodeFromOD_Base(subModule, moduleNode));
        // source.p?.forEach((part: any) => OrderSceneNode.createFromOrderLine(part, node));
        return moduleNode;
    }



}


export function createScene(
    o: any, // IOrderData
    ol: any, // IFullOrderLineGroupData
): OrderSceneNode {
    const scenceRoot = OrderSceneNode.createGroup();

    const wallsGroup = createWallsGroupFromOrderData(o.rooms);
    if (wallsGroup) {
        scenceRoot.addChild(wallsGroup, false);
    }

    const posGroupsRootNode = OrderSceneNode.createGroup('pos-groups-root');
    scenceRoot.addChild(posGroupsRootNode, false);

    ol?.forEach((orderLineEntry: any) => {
        OrderSceneNode.createSceneRootFromIFullOrderLineGroupData(orderLineEntry, posGroupsRootNode);
    })

    // Ensure world transforms are computed for any code paths that rely on them.
    //scenceRoot.updateWorldTransform(new Matrix4());

    return scenceRoot;
}




export function sceneToThreeJsScene(rootObject3DNode: IObject3DNode): THREE.Scene {
    const threeScene = new THREE.Scene();

    const rootThreeObject = orderObjectNodeToThreeObject3D(rootObject3DNode);
    threeScene.add(rootThreeObject);

    return threeScene;
}

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
        mesh.rotation.x = -Math.PI / 2;

        threeObject.add(mesh);
    }
    else if (geom.meshUrl) {
        console.log("Mesh loading not implemented yet. URL:", geom.meshUrl);
    }
    else if (geom.size) {
        const geometry = new THREE.BoxGeometry(geom.size._x, geom.size._y, geom.size._z);
        // transform so that the origin is at rear left bottom corner
        //        geometry.translate(geom.size._x / 2, geom.size._y / 2, geom.size._z / 2);
        const material = new THREE.MeshBasicMaterial({ color: Math.random() * 0xffffff });
        if (new Vector3(geom.size._x, geom.size._y, geom.size._z).length() > 650) {
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

function computeWorldTransform(node: IObject3DNode): Matrix4 {
    const chain: IObject3DNode[] = [];
    let current: IObject3DNode | null = node;
    while (current) {
        chain.push(current);
        current = current.parent;
    }

    const world = new Matrix4();
    for (let i = chain.length - 1; i >= 0; i--) {
        world.multiply(chain[i].transform);
    }
    return world;
}
