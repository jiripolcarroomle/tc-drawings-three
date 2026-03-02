
import * as THREE from "three";
import { Matrix4, Vector3 } from "./tc/base";
import { createWallsGroupFromOrderData, type IWallSegment, type WallSegment } from "./wall";

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
 * - Group: no geometry, only transformation
 * - Wall: created from room data, has an SVG extruded geometry
 * - Part: created from part data, has a box, SVG extrusion or mesh geometry
 * - Module: created from module data, has a bounding box (size, position and transform), but no geometry
 */
enum Object3DNodeKind {
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
     * The ID is used to identify nodes across different scenes 
     * (e.g. original order data, filtered scene, etc.). 
     * It should be stable and unique for each node. 
     * The exact format is not important, as long as it meets these criteria.
     */
    readonly id: string;
    /**
     * The class is used to categorize nodes into types (e.g. wall, part, module).
     */
    readonly kind: Object3DNodeKind;
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

interface IScene {
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
    readonly id: string;
    readonly kind: Object3DNodeKind;
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
        this._worldTransform = parentWorldTransform.clone().fromArray(this.transform.elements);
        // update children
        for (const child of this.children) {
            child.updateWorldTransform(this._worldTransform);
        }
    }

    addChild(child: IObject3DNode, keepWorldTransform?: boolean): void {
        if (keepWorldTransform) {
            // compute local transform that will keep the same world transform for the child
            // localTransform = inverse(parentWorldTransform) * childWorldTransform
            const parentWorldInverse = this._worldTransform.clone(); // TODO: implement inverse() method in Matrix4
            // parentWorldInverse.invert();
            const newLocalTransform = parentWorldInverse.clone().fromArray(child.worldTransform.elements);
            child.transform = newLocalTransform;
        }
        child.parent = this;
        this.children.push(child);
    }

    readonly _geometry: IGeometryData;
    geometry(drawingRenderSettings: IDrawingRenderSettings): IGeometryData {
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
                clonedNode.addChild(clonedChild, false);
            }
        }
        return clonedNode;
    }

    wallData: IWallSegment | undefined;

    private constructor(id: string | undefined, kind: Object3DNodeKind) {
        this.kind = kind;
        this.id = id ? IdsMap.useIdOrGenerateUnique(id) : IdsMap.getRandomId();
        const geometryData: IGeometryData = {
            ownerNode: this,
            origin: new Matrix4(),
        }
        this._geometry = geometryData;
    }

    static createGroup(id?: string): OrderSceneNode {
        return new OrderSceneNode(id, Object3DNodeKind.Group);
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
        return node;
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
    // set transform
    threeObject.matrix.fromArray(node.transform.elements);
    threeObject.matrixAutoUpdate = false; // we will manage the matrix updates manually

    if (node.geometry({}).svgPath?.length) {
        const shape = new THREE.Shape();
        for (const pathNode of node.geometry({}).svgPath!) {
            const [x, y] = pathNode.args;
            if (pathNode.command === 'M') {
                shape.moveTo(x, y);
            } else if (pathNode.command === 'L') {
                shape.lineTo(x, y);
            } else if (pathNode.command === 'Z') {
                shape.closePath();
            }
        }
        const extrudeSettings = {
            steps: 1,
            depth: node.geometry({}).svgDepth ?? 1,
            bevelEnabled: false,
        };
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const mesh = new THREE.Mesh(geometry, material);
        threeObject.add(mesh);
    }

    node.children.forEach(childNode => {
        const childThreeObject = orderObjectNodeToThreeObject3D(childNode);
        threeObject.add(childThreeObject);
    });
    return threeObject;
}
