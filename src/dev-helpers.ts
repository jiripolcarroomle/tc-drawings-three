import { type IOrderSceneNode } from "./scene.interfaces";
import { logInfo } from "./tc/base";
import { parse as parseFlatted, stringify as stringifyFlatted } from "flatted";

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

function tryParseFlattedString(value: string): unknown {
    const trimmedValue = value.trim();
    if (!trimmedValue.startsWith('[')) {
        return value;
    }

    try {
        const parsedValue = parseFlatted(trimmedValue);
        if (stringifyFlatted(parsedValue) !== trimmedValue) {
            return value;
        }

        return parsedValue;
    }
    catch {
        return value;
    }
}

export function parseFlattedWithNestedPropertyValues<T>(rawValue: string): T {
    return parseFlatted(rawValue, (_key, value) => {
        if (typeof value !== 'string') {
            return value;
        }

        return tryParseFlattedString(value);
    }) as T;
}


