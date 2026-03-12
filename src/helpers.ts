import type { IObject3DNode } from "./scene";

export function printSceneHierarchy(node: IObject3DNode, indent: number = 0) {
    const indentStr = '  '.repeat(indent)
    console.log(`${indentStr}- ${node.id} (${node.kind})`);
    node.children.forEach(child => printSceneHierarchy(child, indent + 1));
}
