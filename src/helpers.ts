import { IdsMap, type IObject3DNode } from "./scene";
import { Matrix4 } from "./tc/base";

/**
 * Pretty prionting of a node hierarchy, for debugging purposes.
 * @param node the node to print, which then recursively prints its children with indentation
 * @param indent the current indentation level, used for recursive calls
 */
export function printSceneHierarchy(node: IObject3DNode, indent: number = 0) {
    const indentStr = '  '.repeat(indent)
    console.log(`${indentStr}- ${node.id} (${node.kind})`);
    node.children.forEach(child => printSceneHierarchy(child, indent + 1));
}

/**
 * This function will collapse hierarchy of posGroups and will reparent parts to their owner modules.
 * This is called with a module-representing node that is a child of a posGroup node, and it will look for all parts in the posGroup and reparent them to the module node, then it will do the same for all submodules recursively.
 * The info is taken from the orderLineEntry of the module order line.
 * @param posGroupNode the pos group node, which is the parent of the full order group
 * @param currentNode a module node, which might own some parts
 */
export function reparentPartsFromPosGroupsToModulesRecursive(posGroupNode: IObject3DNode, currentNode: IObject3DNode): void {
    if (currentNode !== posGroupNode) {
        const currentNodePartChildren = currentNode.orderLineEntry?.p ?? [];
        currentNodePartChildren?.forEach((partChild: any) => {
            // if it is not a group or hidden, we want to reparent it to the modul
            if (partChild._hidden || partChild._childParts.length) {
                return;
            }
            const partChildNodeId = getPartId(partChild);
            const partChildNode = IdsMap.objects.get(partChildNodeId);
            if (!partChildNode) {
                console.warn(`Could not find node for part ${partChildNodeId}`);
                return;
            }
            const parent = partChildNode.parent;
            if (!parent) {
                console.warn(`Part node ${partChildNodeId} has no parent, cannot reparent`);
                return;
            }
            if (parent !== posGroupNode) {
                console.warn(`Part node ${partChildNodeId} is not a child of the pos group anymore, cannot reparent`);
            }
            parent.removeChild(partChildNode);
            currentNode.addChild(partChildNode, true);
        });
    }

    const subModules = currentNode.getModuleChildren();
    subModules.forEach(subModule => {
        reparentPartsFromPosGroupsToModulesRecursive(posGroupNode, subModule);
    });

}

/**
 * Defines a way to get an unique string for identifying a part, both machine-unique and human readable.
 * @param part order entry part (PartBase) for which to get the id
 * @returns string in the format (see inside of the function 
 */
export function getPartId(part: any /* PartBase */): string {
    return `part__${part._partId}__${part._id}:${part._parentUniqueId}`;
}

/**
 * Computes the world transform of a node by multiplying the transforms of all its ancestors up to the root.
 * The order of multiplication is from the root to the node, so the local transform of the node is applied last.
 * @param node the node for which to compute the world transform
 * @returns the world transform matrix of the node
 */
export function computeWorldTransform(node: IObject3DNode): Matrix4 {
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

