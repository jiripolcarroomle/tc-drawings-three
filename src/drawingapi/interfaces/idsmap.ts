import type { IOrderSceneNode } from "./scene";

/**
 * Registry of scene nodes keyed by their stable string ID.
 *
 * The map is used to enforce uniqueness during scene construction and to
 * support later lookup of already-created nodes during reparenting.
 */
export interface IIdsMap {
    /**
     * Returns the registered node for the given ID, if present.
     *
     * @param id ID to look up.
     * @returns The registered node or `undefined` when the ID is not known.
     */
    get(id: string): IOrderSceneNode | undefined;
    /**
     * Checks whether the given ID is already registered.
     *
     * @param id ID to check.
     * @returns `true` when the ID is already in use.
     */
    has(id: string): boolean;
    /**
     * Registers a node under its current ID.
     *
     * @param node Node to register.
     * @throws Error if a different node is already registered under the same ID.
     */
    register(node: IOrderSceneNode): void;
    /**
     * Generates a unique ID that is not already present in the map.
     *
     * @returns A unique random ID.
     * @throws Error if a unique ID cannot be generated within the configured attempt limit.
     */
    createRandomId(): string;
    /**
     * Returns a unique ID derived from the provided base ID.
     *
     * @param id Base ID to try first.
     * @returns The original ID if it is unused, otherwise a unique suffixed variant.
     * @throws Error if a unique derived ID cannot be generated within the configured attempt limit.
     */
    useIdOrCreateUnique(id: string): string;
}

export class IdsMap implements IIdsMap {
    static readonly MAX_UNIQUE_ID_ATTEMPTS = 1000;

    readonly #objects = new Map<string, IOrderSceneNode>();

    get(id: string): IOrderSceneNode | undefined {
        return this.#objects.get(id);
    }


    has(id: string): boolean {
        return this.#objects.has(id);
    }

    register(node: IOrderSceneNode): void {
        const existingNode = this.#objects.get(node.id);
        if (existingNode && existingNode !== node) {
            throw new Error(`IdsMap: Cannot register duplicate ID ${node.id}`);
        }

        this.#objects.set(node.id, node);
    }


    /**
     * Generates a random 9-character base-36 candidate and retries until it is unique.
     *
     * The ID is derived from `Math.random()`, so it is suitable for in-memory uniqueness
     * within this scene graph but not for security-sensitive or globally stable identifiers.
     *
     * @returns A unique random ID.
     * @throws Error if a unique ID cannot be generated within the configured attempt limit.
     */
    createRandomId(): string {
        let remainingAttempts = IdsMap.MAX_UNIQUE_ID_ATTEMPTS;

        while (remainingAttempts-- > 0) {
            const tryId = Math.random().toString(36).slice(2, 11);
            if (!this.has(tryId)) {
                return tryId;
            }
        }

        throw new Error(
            `IdsMap: Failed to generate a unique ID after ${IdsMap.MAX_UNIQUE_ID_ATTEMPTS} attempts`,
        );
    }


    /**
     * Returns the provided ID when available, otherwise appends an incrementing suffix
     * in the form `${id}_${counter}` until a unique ID is found.
     *
     * @param id Base ID to try first.
     * @returns The original ID if it is unused, otherwise a unique suffixed variant.
     * @throws Error if a unique derived ID cannot be generated within the configured attempt limit.
     */
    useIdOrCreateUnique(id: string): string {
        let tryId = id;
        let counter = 1;

        while (this.has(tryId)) {
            tryId = `${id}_${counter++}`;
            if (counter > IdsMap.MAX_UNIQUE_ID_ATTEMPTS) {
                throw new Error(
                    `IdsMap: Failed to generate a unique ID based on ${id} after ${IdsMap.MAX_UNIQUE_ID_ATTEMPTS} attempts.`,
                );
            }
        }

        return tryId;
    }
}
