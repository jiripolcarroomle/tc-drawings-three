import { type IOrderSceneNode } from "./scene.interface";
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

function reviveNestedFlattedStrings(value: unknown, visited: WeakSet<object> = new WeakSet()): unknown {
    if (typeof value === 'string') {
        const revivedValue = tryParseFlattedString(value);
        if (revivedValue === value) {
            return value;
        }

        return reviveNestedFlattedStrings(revivedValue, visited);
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    if (visited.has(value)) {
        return value;
    }
    visited.add(value);

    if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) {
            value[index] = reviveNestedFlattedStrings(value[index], visited);
        }
        return value;
    }

    const record = value as Record<string, unknown>;
    Object.keys(record).forEach((key) => {
        record[key] = reviveNestedFlattedStrings(record[key], visited);
    });
    return record;
}

/**
 * Necessary helper in the side add. To needed in the main repo because the order data are passed directly, not via a json file.
 * I have no idea what this does and how it works. It helps to revive the module attributes.
 */
export function parseFlattedWithNestedPropertyValues<T>(rawValue: string): T {
    const parsedValue = parseFlatted(rawValue, (_key, value) => {
        if (typeof value !== 'string') {
            return value;
        }

        return tryParseFlattedString(value);
    });

    return reviveNestedFlattedStrings(parsedValue) as T;
}


