
import { Matrix4, Vector3 } from "./tc/base";

interface IDrawingRenderSettings {
}

interface IGeometryData {
    ownerNode: IObject3DNode;
    origin: Matrix4;
    size?: Vector3;
    svgPath?: string;
    svgDepth?: number;
    meshUrl?: string;
}

enum Object3DNodeKind {
    Root = "root",
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
        if (IdsMap.objects.has(id)) {
            return IdsMap.getRandomId();
        }
        else {
            return id;
        }
    }
}


class OrderSceneNode implements IObject3DNode {
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

    private constructor(id: string | undefined, kind: Object3DNodeKind) {
        this.kind = kind;
        this.id = id ? IdsMap.useIdOrGenerateUnique(id) : IdsMap.getRandomId();
        const geometryData: IGeometryData = {
            ownerNode: this,
            origin: new Matrix4(),
        }
        this._geometry = geometryData;
    }

    static createRoot() {
        return new OrderSceneNode(undefined, Object3DNodeKind.Root);
    }

    static createFromWall(wallData: any): OrderSceneNode {
        const node = new OrderSceneNode(wallData.id, Object3DNodeKind.Wall);
        return node;
    }

}


export function createScene(
    o: any, // IOrderData
    ol: any, // IFullOrderLineGroupData
): OrderSceneNode {
    const scenceRoot = OrderSceneNode.createRoot();




    return scenceRoot;
}



