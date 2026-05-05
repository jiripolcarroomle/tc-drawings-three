import { type AnnotationTransformed } from "./drawing.implementation";
import type { Vector3 } from "./tc/base";

function distancePointToLine(point: Vector3, linePoint: Vector3, lineDirection: Vector3): number {
    const pointToLinePoint = point.clone().sub(linePoint);
    const lineDirectionNormalized = lineDirection.clone().normalize();
    const projectionLength = pointToLinePoint.dot(lineDirectionNormalized);
    const projection = lineDirectionNormalized.multiply(projectionLength);
    const distanceVector = pointToLinePoint.sub(projection);
    return distanceVector.length();
}
function projectPointOnLine(point: Vector3, linePoint: Vector3, lineDirection: Vector3): number {
    const pointToLinePoint = point.clone().sub(linePoint);
    const lineDirectionNormalized = lineDirection.clone().normalize();
    return pointToLinePoint.dot(lineDirectionNormalized);
}
export function drawAnnotationsWithAnnotationLines(
    annotationsParent: SVGElement,
    layerName: string,
    annotations: AnnotationTransformed[],
    lineStart: Vector3,
    lineDirection: Vector3,
) {
    void annotationsParent;
    console.warn(`--- ${layerName} ---`);
    // sort the annotations by:
    // 1. distance from the line
    // 2. depth in view
    // 3. distance along the line (and swap start and end if the annotation is "backwards")

    const sortedAnnotations = annotations
        .map(annotation => {
            const startToLine = distancePointToLine(annotation.startPoint.pixelCoordinate, lineStart, lineDirection);
            const endToLine = distancePointToLine(annotation.endPoint.pixelCoordinate, lineStart, lineDirection);
            const distanceToLine = Math.min(startToLine, endToLine);
            const depth = (annotation.startPoint.cameraSpaceCoordinate._z + annotation.endPoint.cameraSpaceCoordinate._z) / 2;
            const startAlongLine = projectPointOnLine(annotation.startPoint.pixelCoordinate, lineStart, lineDirection);
            const endAlongLine = projectPointOnLine(annotation.endPoint.pixelCoordinate, lineStart, lineDirection);
            const alongLine = (startAlongLine + endAlongLine) / 2;
            const backwards = startAlongLine > endAlongLine;

            return (backwards
                ? { ...annotation, distanceToLine, depth, alongLine, startPoint: annotation.endPoint, endPoint: annotation.startPoint }
                : { ...annotation, distanceToLine, depth, alongLine });
        })
        .sort((a, b) => {
            if (a.distanceToLine !== b.distanceToLine) {
                return a.distanceToLine - b.distanceToLine;
            }
            if (a.depth !== b.depth) {
                return b.depth - a.depth;
            }
            return a.alongLine - b.alongLine;
        });

    for (const annotation of sortedAnnotations) {
        console.log('drawing annotation',
            'distance', annotation.distanceToLine.toFixed(1),
            'depth', annotation.depth.toFixed(0),
            'along', annotation.alongLine.toFixed(1),
            'y', annotation.startPoint.pixelCoordinate._y.toFixed(0),
            'z', annotation.endPoint.cameraSpaceCoordinate._z.toFixed(0),
            'x', annotation.startPoint.pixelCoordinate._x.toFixed(0), '<->', annotation.endPoint.pixelCoordinate._x.toFixed(0),
            'l', annotation.realLength.toFixed(0),
        );
    }

}