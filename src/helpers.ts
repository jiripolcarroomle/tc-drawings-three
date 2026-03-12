import { IdsMap, type IObject3DNode } from "./scene";

export function printSceneHierarchy(node: IObject3DNode, indent: number = 0) {
    const indentStr = '  '.repeat(indent)
    console.log(`${indentStr}- ${node.id} (${node.kind})`);
    node.children.forEach(child => printSceneHierarchy(child, indent + 1));
}

export function reparentPartsFromPosGroupsToModulesRecursive(posGroupNode: IObject3DNode, currentNode: IObject3DNode) {
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

export function getPartId(part: any /* PartBase */): string {
    const id = `part__${part._partId}__${part._id}:${part._parentUniqueId}`;
    //console.log(id, part);
    return id;
}

