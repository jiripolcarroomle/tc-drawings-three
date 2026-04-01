import { type IOrderSceneNode } from "./scene.interfaces";
import { logInfo } from "./tc/base";

/**
 * Pretty-prints a node hierarchy for debugging.
 *
 * @param node Node to print, including its descendants.
 * @param indent Current indentation depth used during recursion.
 */
export function printSceneHierarchy(node: IOrderSceneNode, indent: number = 0) {
    const indentStr = '  '.repeat(indent)
    logInfo(`${indentStr}- ${node.id} (${node.kind})`);
    node.children.forEach(child => printSceneHierarchy(child, indent + 1));
}


