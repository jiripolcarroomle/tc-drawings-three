import { type AnnotationTransformed } from "./drawing.implementation";
import type { Vector3 } from "./tc/base";
import * as SVGHelper from "./svghelper";

/**
 * Annotation projected to a direction of an annotation line.
 */
interface AnnotationTransformedToDirection extends AnnotationTransformed {
    /** from start point of the annotation line along the line direction */
    distanceStartX: number,
    distanceEndX: number,
    /** from start point of the annotation line perpendicular to the line direction */
    distanceY: number,
    /** depth in view - useful for sorting annotations */
    distanceZ: number,
}

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
    lineNormalDirection: Vector3,
    lineSpacing: number = 30,
) {
    void annotationsParent;
    console.warn(`--- ${layerName} ---`);
    // sort the annotations by:
    // 1. distance from the line
    // 2. depth in view
    // 3. distance along the line (and swap start and end if the annotation is "backwards")

    const sortedAnnotations: AnnotationTransformedToDirection[] = annotations
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
                ? { ...annotation, distanceY: distanceToLine, distanceZ: depth, distanceStartX: endAlongLine, distanceEndX: startAlongLine, startPoint: annotation.endPoint, endPoint: annotation.startPoint }
                : { ...annotation, distanceY: distanceToLine, distanceZ: depth, distanceStartX: startAlongLine, distanceEndX: endAlongLine });
        })
        .sort((a, b) => {
            if (a.distanceY !== b.distanceY) {
                return a.distanceY - b.distanceY;
            }
            if (a.distanceZ !== b.distanceZ) {
                return b.distanceZ - a.distanceZ;
            }
            return a.distanceStartX - b.distanceStartX;
        });

    class LineWithAnnotations {
        usedIntervals: { start: number, end: number, annotations: AnnotationTransformedToDirection[] }[] = [];
        /**
         * Adds an annotation to the line if it does not overlap with existing annotations.
         * @param annotation The annotation to add
         * @returns true if the annotation was added
         */
        addAnnotation(annotation: AnnotationTransformedToDirection): boolean {
            const intervalStart = annotation.distanceStartX;
            const intervalEnd = annotation.distanceEndX;
            const availableInterval = this.getOrCreateInterval(intervalStart, intervalEnd, true);
            if (availableInterval) {
                availableInterval.annotations.push(annotation);
                return true;
            }
            return false;
        }
        isIntervalFree(start: number, end: number): boolean {
            const startRound = Math.round(start);
            const endRound = Math.round(end);
            return !this.usedIntervals.some(i => i.start < endRound && i.end > startRound);
        }
        getMinMax(): { min: number, max: number } {
            if (this.usedIntervals.length === 0) {
                return { min: 0, max: 0 };
            }
            const min = Math.min(...this.usedIntervals.map(i => i.start));
            const max = Math.max(...this.usedIntervals.map(i => i.end));
            return { min, max };
        }
        /**
         * Gets an existing interval that overlaps with the given start and end, or creates a new one if create is true and there is free space.
         */
        getOrCreateInterval(start: number, end: number, create: boolean = true): undefined | { start: number, end: number, annotations: AnnotationTransformedToDirection[] } {
            const startRound = Math.round(start);
            const endRound = Math.round(end);
            let interval = this.usedIntervals.find(i => i.start === startRound && i.end === endRound);
            if (!interval && create) {
                const hasFreeSpace = this.isIntervalFree(start, end);
                if (!hasFreeSpace) {
                    return undefined;
                }
                interval = { start: startRound, end: endRound, annotations: [] };
                this.usedIntervals.push(interval);
                this.usedIntervals.sort((a, b) => a.start - b.start || a.end - b.end);
            }
            return interval;
        }
        print(): void {
            console.log(
                'LineWithAnnotations: intervals: ',
                this.usedIntervals.map(i => `<${i.start}, ${i.end}>`).join(', ')
            );
        }
        toSvg(parent: SVGGElement, offsetPixels: Vector3, direction: Vector3): void {
            const { min, max } = this.getMinMax();
            const lineStart = offsetPixels.clone().add(direction.clone().multiply(min));
            const lineEnd = offsetPixels.clone().add(direction.clone().multiply(max));
            // helper line
            SVGHelper.createSvgLineElement(parent, lineStart._x, lineStart._y, lineEnd._x, lineEnd._y, SVGHelper.thinLineStyle);

            this.usedIntervals.forEach(interval => {
                const intervalStart = offsetPixels.clone().add(direction.clone().multiply(interval.start));
                const intervalEnd = offsetPixels.clone().add(direction.clone().multiply(interval.end));
                SVGHelper.createSvgLineElementWithText(
                    parent,
                    intervalStart._x, intervalStart._y,
                    intervalEnd._x, intervalEnd._y,
                    { _x: 0, _y: 0 },
                    interval.annotations[0].realLength.toFixed(0) ,
                    { ...SVGHelper.thickLineStyle, ...SVGHelper.arrowLineStyle },
                    SVGHelper.textStyle,
                )
            });

        }
        static AddAnnotationToLines(annotation: AnnotationTransformedToDirection, lines: LineWithAnnotations[]): void {
            // try to add the annotation to an existing line
            for (const line of lines) {
                if (line.addAnnotation(annotation)) {
                    return;
                }
            }
            // if it does not fit in any existing line, create a new line
            const newLine = new LineWithAnnotations();
            newLine.addAnnotation(annotation);
            lines.push(newLine);
        }
    }

    const linesWithAnnotations: LineWithAnnotations[] = [];
    for (const annotation of sortedAnnotations) {
        LineWithAnnotations.AddAnnotationToLines(annotation, linesWithAnnotations);
    }

    linesWithAnnotations.forEach((line, index) => {
        line.print();
        const lineStartPoint = lineStart.clone().add(lineNormalDirection.clone().multiply(index * lineSpacing));
        line.toSvg(annotationsParent as SVGGElement, lineStartPoint, lineDirection);
    });



}