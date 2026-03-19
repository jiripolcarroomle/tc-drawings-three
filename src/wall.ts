import { OrderSceneNode } from "./scene";
import { IdsMap } from "./idsmap";
import { Vector3 } from "./tc/base";

/**
 * Geometric description of a wall segment derived from a room contour.
 */
export interface IWallSegment {
    readonly segmentStart: Vector3;
    readonly segmentEnd: Vector3;
    readonly segmentBackStart: Vector3;
    readonly segmentBackEnd: Vector3;
    readonly direction: Vector3;
    readonly wallLength: number;
    readonly wallThickness: number;
    readonly wallHeight: number;
    readonly rotationY: number;
    readonly normalToWall: Vector3;
}

const DEFAULT_WALL_HEIGHT = 3000;
const DEFAULT_WALL_THICKNESS = 200;

/**
 * Concrete wall segment implementation used during scene construction.
 */
export class WallSegment implements IWallSegment {
    private constructor(
        public segmentStart: Vector3,
        public segmentEnd: Vector3,
        public segmentBackStart: Vector3,
        public segmentBackEnd: Vector3,
        public direction: Vector3,
        public wallLength: number,
        public wallThickness: number,
        public wallHeight: number,
        public rotationY: number,
        public normalToWall: Vector3,
    ) { }

    /**
     * Creates a wall segment from two consecutive contour points.
     *
     * The source contour is expressed in plan coordinates, while the resulting
     * wall geometry is converted into the scene's X/Z plane.
     *
     * @param from Starting contour point.
     * @param to Ending contour point.
     * @returns Wall segment with derived direction, thickness, height, and back edge.
     */
    static fromSegmentStartAndEnd(
        from: PosContourSegment,
        to: PosContourSegment
    ) {
        const wallThickness = to.thickness ?? from.thickness ?? DEFAULT_WALL_THICKNESS;
        const wallHeight = to.height ?? from.height ?? DEFAULT_WALL_HEIGHT;
        const segmentStart = new Vector3(from.x, 0, -from.y);
        const segmentEnd = new Vector3(to.x, 0, -to.y);
        const direction = segmentEnd.subtract(segmentStart).normalize();
        const length = segmentEnd.subtract(segmentStart).magnitude();
        const normalToWall = new Vector3(-direction._z, 0, direction._x);
        const rotationY = -Math.atan2(normalToWall._z, normalToWall._x) - Math.PI / 2;
        const segmentBackStart = segmentStart.add(normalToWall.scale(wallThickness));
        const segmentBackEnd = segmentEnd.add(normalToWall.scale(wallThickness));

        return new WallSegment(
            segmentStart,
            segmentEnd,
            segmentBackStart,
            segmentBackEnd,
            direction,
            length,
            wallThickness,
            wallHeight,
            rotationY,
            normalToWall
        );
    }
}

/**
 * Creates a wall group from room contour data.
 *
 * Each eligible contour edge produces one wall node. Adjacent wall back edges
 * are adjusted to meet at a shared joint when the source segments are contiguous.
 *
 * @param roomContours Room contours from the order data.
 * @param idsMap Scene ID registry used for created nodes.
 * @returns Group containing all generated wall nodes, or `undefined` when no rooms are present.
 */
export function createWallsGroupFromOrderData(roomContours: PosContour[], idsMap: IdsMap): OrderSceneNode | undefined {
    if (!roomContours?.length) {
        return;
    }
    const wallsGroup = OrderSceneNode.createGroup(idsMap, 'group_walls');


    for (const roomContour of roomContours) {
        const wallSegments: WallSegment[] = [];
        for (let segmentI = 1; segmentI < roomContour.segments.length; segmentI++) {
            const segment = roomContour.segments[segmentI];
            const prevSegment = roomContour.segments[segmentI - 1];
            if (
                segment.cmd !== 'L' ||
                segment.type !== 'wall' ||
                !segment.height ||
                !segment.thickness
            ) {
                continue;
            }
            const wallSegment = WallSegment.fromSegmentStartAndEnd(prevSegment, segment);
            wallSegments.push(wallSegment);
        }

        for (let i = 0; i < wallSegments.length; i++) {
            const from = wallSegments[i];
            const to = wallSegments[(i + 1) % wallSegments.length];
            // Create joint of these segments by extending the segment's back lines to the intersection point
            if (!from.segmentEnd.isCoincident(to.segmentStart)) {
                continue;
            }
            const jointPoint = from.segmentEnd
                .add(to.direction.scale(from.wallThickness / from.normalToWall.dot(to.direction)))
                .add(from.direction.scale(to.wallThickness / to.normalToWall.dot(from.direction)));
            from.segmentBackEnd = jointPoint;
            to.segmentBackStart = jointPoint;
        }

        for (const wallSegmentIndex in wallSegments) {
            const wallSegment = wallSegments[wallSegmentIndex];
            const wallObject = OrderSceneNode.createFromWall(idsMap, `wall-${wallSegmentIndex}`, wallSegment);
            wallsGroup.addChild(wallObject, true);
            // wallSegment.createGeometry(this._wallOptions);
            // wallGroup.add(wallSegment);
        }
    }

    return wallsGroup;

}

/**
 * One contour point or drawing command in the room outline source data.
 */
export interface PosContourSegment {
    angle?: number | null;
    cmd: string;
    height?: number | null;
    thickness?: number | null;
    type?: string | null;
    x: number;
    y: number;
}

/**
 * Room contour source data used to derive wall geometry.
 */
export interface PosContour {
    level: number;
    segments: PosContourSegment[];
}
