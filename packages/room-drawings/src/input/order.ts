/**
 * The order data the API reads, described structurally: only the fields that are used. The library's
 * order objects (IOrderData, IFullOrderLineGroupData, OD_Base, PartBase) satisfy these interfaces as they are,
 * so the package does not depend on the library. Matrices are anything with 16 `elements`.
 */

export interface OrderInput {
    rooms?: RoomContourInput[];
}

export interface RoomContourInput {
    segments: RoomContourSegmentInput[];
}

/** Room contour point in plan coordinates (x right, y into the plan); `L` segments of type 'wall' are walls. */
export interface RoomContourSegmentInput {
    cmd: string;
    x: number;
    y: number;
    type?: string | null;
    height?: number | null;
    thickness?: number | null;
}

export interface OrderLineGroupInput {
    groupPos?: {
        calcGroup?: string;
        /** Position of the group [x, y, z]. */
        calcGroupPos?: number[];
        /** Rotation of the group around y [degrees]. */
        calcGroupRotationY?: number;
    };
    items: OrderLineInput[];
}

export interface OrderLineInput {
    orderData: {
        bomEntries?: PartInput[];
        orderItem?: ModuleInput;
    };
}

export interface ModuleInput {
    modId: string;
    _id: string;
    /** Placement relative to the parent module (or the group for root modules). */
    _origin?: unknown;
    _articlePos?: { x: number; y: number; z: number; rotationY?: number };
    _articleRotationY?: number;
    _isGenerated?: boolean;
    /** Submodules. */
    m?: ModuleInput[];
    /** Parts created by this module. */
    p?: PartInput[];
}

export interface PartInput {
    _partId?: string;
    _id?: string | number;
    _parentUniqueId?: string;
    _hidden?: boolean;
    /** Transform of the part relative to its position group. */
    _fullMatrix?: unknown;
    _x?: number;
    _y?: number;
    _z?: number;
    _dimx?: number;
    _dimy?: number;
    _dimz?: number;
    _extrude?: { svg: string; direction: string };
    _threedModel?: { _3dUrl?: string };
    _childParts?: PartInput[];
}
