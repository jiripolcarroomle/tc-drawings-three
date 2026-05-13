import { type AnnotationTransformed } from "./drawing";
import { Vector3 } from "../../tc/base";
import * as SVGHelper from "../utils/svghelper";

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
export function drawAnnotationsWithAnnotationLines(args: {
    annotationsParent: SVGElement,
    layerName: string,
    annotations: AnnotationTransformed[],
    lineStart: Vector3,
    lineDirection: Vector3,
    lineNormalDirection: Vector3,
    lineSpacing: number,
}): { countOfLines: number } {
    const { annotationsParent, layerName, annotations, lineStart, lineDirection, lineNormalDirection, lineSpacing = 50 } = args;
    // console.warn(`--- ${layerName} ---`);
    void layerName;
    // sort the annotations by:
    // 1. distance from the line
    // 2. depth in view
    // 3. distance along the line (and swap start and end if the annotation is "backwards")

    const sortedAnnotations: AnnotationTransformedToDirection[] = annotations
        .map(annotation => {
            const startToLine = distancePointToLine(annotation.startPoint.pixelCoordinate, lineStart, lineDirection);
            const endToLine = distancePointToLine(annotation.endPoint.pixelCoordinate, lineStart, lineDirection);
            const distanceToLine = Math.round(Math.min(startToLine, endToLine));
            const depth = Math.round((annotation.startPoint.cameraSpaceCoordinate._z + annotation.endPoint.cameraSpaceCoordinate._z) / 2);
            const startAlongLine = Math.round(projectPointOnLine(annotation.startPoint.pixelCoordinate, lineStart, lineDirection));
            const endAlongLine = Math.round(projectPointOnLine(annotation.endPoint.pixelCoordinate, lineStart, lineDirection));
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
        usedIntervals: { start: number, end: number, annotations: AnnotationTransformedToDirection[], realLength: number }[] = [];

        private sortUsedIntervals(): void {
            this.usedIntervals.sort((a, b) => a.start - b.start || a.end - b.end || a.realLength - b.realLength);
        }

        /**
         * Adds an annotation to the line if it does not overlap with existing annotations.
         * @param annotation The annotation to add
         * @returns true if the annotation was added
         */
        addAnnotation(annotation: AnnotationTransformedToDirection): boolean {
            const firstAnnotation = this.usedIntervals.length > 0 ? this.usedIntervals[0].annotations[0] : undefined;
            if (
                firstAnnotation
                && (
                    annotation.distanceZ !== firstAnnotation.distanceZ
                    || annotation.distanceY !== firstAnnotation.distanceY
                )
            ) {
                return false;
            }
            const intervalStart = annotation.distanceStartX;
            const intervalEnd = annotation.distanceEndX;
            const availableInterval = this.getOrCreateInterval(intervalStart, intervalEnd, annotation.realLength, true);
            if (availableInterval && Math.abs(availableInterval.realLength - annotation.realLength) < Vector3.EPS) {
                availableInterval.annotations.push(annotation);
                availableInterval.realLength = annotation.realLength;
                return true;
            }
            return false;
        }
        isIntervalFree(start: number, end: number): boolean {
            const startRound = Math.round(Math.min(start, end));
            const endRound = Math.round(Math.max(start, end));
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
        getOrCreateInterval(start: number, end: number, realLength: number, create: boolean = true): undefined | { start: number, end: number, annotations: AnnotationTransformedToDirection[], realLength: number } {
            const startRound = Math.round(Math.min(start, end));
            const endRound = Math.round(Math.max(start, end));
            let interval = this.usedIntervals.find(i => i.start === startRound && i.end === endRound);
            if (!interval && create) {
                const hasFreeSpace = this.isIntervalFree(start, end);
                if (!hasFreeSpace) {
                    return undefined;
                }
                interval = { start: startRound, end: endRound, annotations: [], realLength: realLength };
                this.usedIntervals.push(interval);
                this.sortUsedIntervals();
            }
            return interval;
        }
        print(): void {
            console.log(this.getSignature());
        }
        merge(other: LineWithAnnotations): boolean {
            // check if there is no conflict in the intervals
            let result = true;
            other.usedIntervals.forEach(otherInterval => {
                // pass if intervals are free
                if (this.isIntervalFree(otherInterval.start, otherInterval.end)) {
                    return;
                }
                // pass if the intervals are the same
                if (this.usedIntervals.some(i => i.start === otherInterval.start && i.end === otherInterval.end)) {
                    return;
                }

                // no pass if the intervals overlap but are not the same
                if (this.usedIntervals.some(i => i.start < otherInterval.end && i.end > otherInterval.start)) {
                    result = false;
                }
            });
            if (result) {
                other.usedIntervals.forEach(otherInterval => {
                    if (!this.usedIntervals.some(i => i.start === otherInterval.start && i.end === otherInterval.end)) {
                        this.usedIntervals.push(otherInterval);
                    }
                });
                this.sortUsedIntervals();
            }
            return result;
        }
        getSignature(): string {
            return this.usedIntervals.map(i => `S${i.start} E${i.end} L${i.realLength}`).join(' - ');
        }
        /**
         * sums up all continuous intervals into one and merges their annotations
         * @returns a new LineWithAnnotations with summed intervals if the result is different, otherwise undefined
         */
        makeCopyWithSumedIntervals(): LineWithAnnotations | undefined {
            const copy = new LineWithAnnotations();
            let previousStart: number = this.usedIntervals[0].start;
            let previousEnd: number = this.usedIntervals[0].end;
            let realLength = this.usedIntervals[0].realLength;
            let steps = 1;
            let annotations = [...this.usedIntervals[0].annotations];
            for (let i = 1; i < this.usedIntervals.length; i++) {
                const currentStart = this.usedIntervals[i].start;
                const currentEnd = this.usedIntervals[i].end;
                if (currentStart !== previousEnd) {
                    if (steps > 1) {
                        const interval = copy.getOrCreateInterval(previousStart, previousEnd, realLength);
                        interval?.annotations.push(...annotations);
                    }
                    annotations = [];
                    previousStart = currentStart;
                    realLength = 0;
                    steps = 0;
                }
                realLength += this.usedIntervals[i].realLength;
                steps++;
                previousEnd = currentEnd;
                annotations.push(...this.usedIntervals[i].annotations);
            }
            if (steps > 1) {
                const interval = copy.getOrCreateInterval(previousStart, previousEnd, realLength);
                interval?.annotations.push(...annotations);
            }

            if (!copy.usedIntervals.length || copy.getSignature() === this.getSignature()) {
                return undefined;
            }
            return copy;
        }
        toSvg(parent: SVGGElement, offsetPixels: Vector3, direction: Vector3): void {
            const { min, max } = this.getMinMax();
            const lineStart = offsetPixels.clone().add(direction.clone().multiply(min));
            const lineEnd = offsetPixels.clone().add(direction.clone().multiply(max));
            // helper line
            SVGHelper.createSvgLineElement({
                parent,
                startX: lineStart._x,
                startY: lineStart._y,
                endX: lineEnd._x,
                endY: lineEnd._y,
                properties: SVGHelper.thinLineStyle,
            });

            this.usedIntervals.forEach(interval => {
                const selectAnnotationForIntervalEdge = (
                    edgeCoordinate: number,
                    distanceKey: "distanceStartX" | "distanceEndX",
                ): AnnotationTransformedToDirection => interval.annotations.reduce((best, current) => {
                    const bestEdgeDistance = Math.abs(best[distanceKey] - edgeCoordinate);
                    const currentEdgeDistance = Math.abs(current[distanceKey] - edgeCoordinate);
                    if (currentEdgeDistance !== bestEdgeDistance) {
                        return currentEdgeDistance < bestEdgeDistance ? current : best;
                    }
                    if (current.distanceY !== best.distanceY) {
                        return current.distanceY > best.distanceY ? current : best;
                    }
                    return current;
                });

                const intervalStart = offsetPixels.clone().add(direction.clone().multiply(interval.start));
                const intervalEnd = offsetPixels.clone().add(direction.clone().multiply(interval.end));
                SVGHelper.createSvgLineElementWithText({
                    parent,
                    startX: intervalStart._x,
                    startY: intervalStart._y,
                    endX: intervalEnd._x,
                    endY: intervalEnd._y,
                    textOffset: { _x: 0, _y: 0 },
                    textContent: interval.realLength.toFixed(0),
                    lineProperties: {
                        ...SVGHelper.thickLineStyle,
                        ...SVGHelper.arrowLineStyle,
                        ticksAtEndsLength: 25,
                        ticksStyle: SVGHelper.thinLineStyle,
                    },
                    textProperties: SVGHelper.textStyle,
                });

                // drag helper lines to the farthest annotation
                const farthestStartAnnotation = selectAnnotationForIntervalEdge(interval.start, "distanceStartX");
                const farthestEndAnnotation = selectAnnotationForIntervalEdge(interval.end, "distanceEndX");
                SVGHelper.createSvgLineElement({
                    parent,
                    startX: intervalStart._x,
                    startY: intervalStart._y,
                    endX: farthestStartAnnotation.startPoint.pixelCoordinate._x,
                    endY: farthestStartAnnotation.startPoint.pixelCoordinate._y,
                    properties: SVGHelper.thinDashedLineStyle,
                });
                SVGHelper.createSvgLineElement({
                    parent,
                    startX: intervalEnd._x,
                    startY: intervalEnd._y,
                    endX: farthestEndAnnotation.endPoint.pixelCoordinate._x,
                    endY: farthestEndAnnotation.endPoint.pixelCoordinate._y,
                    properties: SVGHelper.thinDashedLineStyle,
                });
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

    // group annotations first to lines based on their distance from the line and depth in view
    // this will create a lot of duplicate annotations, but we merge them later
    // more importantly, this step ensures that annotation of object that are close to each other
    // will have much higher probability to share one annotation line, which makes the final result more clear and less cluttered
    const linesWithAnnotations: LineWithAnnotations[] = [];
    for (const annotation of sortedAnnotations) {
        LineWithAnnotations.AddAnnotationToLines(annotation, linesWithAnnotations);
    }

    // compare each with each other and merge them into one if possible (to minimize the number of lines)
    for (let i = 0; i < linesWithAnnotations.length; i++) {
        for (let j = i + 1; j < linesWithAnnotations.length; j++) {
            if (linesWithAnnotations[i].merge(linesWithAnnotations[j])) {
                linesWithAnnotations.splice(j, 1);
                j--;
            }
        }
    }

    // add sums of continuous intervals to the lines
    for (let i = 0; i < linesWithAnnotations.length; i++) {
        const copyWithSummedIntervals = linesWithAnnotations[i].makeCopyWithSumedIntervals();
        if (copyWithSummedIntervals) {
            // push it behind the current line
            linesWithAnnotations.splice(i + 1, 0, copyWithSummedIntervals);
            i++; // skip the copy in the next iteration
        }
    }

    // OPTIONAL: merge them again, because the summed intervals can free up some space on the annotation lines
    // for (let i = 0; i < linesWithAnnotations.length; i++) {
    //     for (let j = i + 1; j < linesWithAnnotations.length; j++) {
    //         if (linesWithAnnotations[i].merge(linesWithAnnotations[j])) {
    //             linesWithAnnotations.splice(j, 1);
    //             j--;
    //         }
    //     }
    // }

    linesWithAnnotations.forEach((line, finalIndex) => {
        // line.print();
        const lineStartPoint = lineStart.clone().add(lineNormalDirection.clone().multiply(finalIndex * lineSpacing));
        line.toSvg(annotationsParent as SVGGElement, lineStartPoint, lineDirection);
    });

    return { countOfLines: linesWithAnnotations.length };



}