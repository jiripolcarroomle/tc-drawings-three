import { type IOrderSceneNode } from "./scene";
import { Matrix4 } from "./tc/base";

/**
 * Pretty-prints a node hierarchy for debugging.
 *
 * @param node Node to print, including its descendants.
 * @param indent Current indentation depth used during recursion.
 */
export function printSceneHierarchy(node: IOrderSceneNode, indent: number = 0) {
    const indentStr = '  '.repeat(indent)
    console.log(`${indentStr}- ${node.id} (${node.kind})`);
    node.children.forEach(child => printSceneHierarchy(child, indent + 1));
}

/**
 * Collapses the temporary pos-group hierarchy by reparenting visible leaf parts
 * to the module nodes that own them.
 *
 * The lookup is driven by each module node's `orderLineEntry.p` collection.
 * Hidden parts and grouped child parts stay untouched.
 *
 * @param posGroupNode Pos-group root that still owns the parts before reparenting.
 * @param currentNode Current module subtree being processed recursively.
 */
export function reparentPartsFromPosGroupsToModulesRecursive(posGroupNode: IOrderSceneNode, currentNode: IOrderSceneNode): void {
    if (currentNode !== posGroupNode) {
        const currentNodePartChildren = currentNode.orderLineEntry?.p ?? [];
        currentNodePartChildren?.forEach((partChild: any) => {
            // Only visible leaf parts are reparented to the owning module.
            if (partChild._hidden || partChild._childParts.length) {
                return;
            }
            const partChildNodeId = getPartId(partChild);
            const partChildNode = currentNode.idsMap.get(partChildNodeId);
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
 * Builds a stable part identifier from the fields used by the current order data.
 *
 * The resulting string is readable enough for debugging while still being tied
 * to the source identifiers that distinguish parts within the scene.
 *
 * @param part Order-entry part for which to generate an ID.
 * @returns Stable part ID in the format `part__{partId}__{id}:{parentUniqueId}`.
 */
export function getPartId(part: any /* PartBase */): string {
    return `part__${part._partId}__${part._id}:${part._parentUniqueId}`;
}

/**
 * Computes the world transform of a node by multiplying the transforms of all its ancestors up to the root.
 * The order of multiplication is from the root to the node, so the local transform of the node is applied last.
 * @param node Node for which to compute the world transform.
 * @returns World transform matrix of the node.
 */
export function computeWorldTransform(node: IOrderSceneNode): Matrix4 {
    const chain: IOrderSceneNode[] = [];
    let current: IOrderSceneNode | null = node;
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

