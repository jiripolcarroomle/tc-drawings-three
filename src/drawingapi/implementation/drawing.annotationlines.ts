import { type AnnotationTransformed } from "./drawing";
import { Vector3 } from "../../tc/base";
import * as SVGHelper from "../utils/svghelper";
import { optimalAnnotationLinesMerge } from "./drawing.annotationlinesmerge";

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

export enum AnnotationLineDisqualifyType {
    OnlyNonperpendicular = 'onlyNonperpendicular',
    LooseIntervals = 'looseIntervals',
    WithSingleInterval = 'withSingleInterval',
}

/**
 * Draws the annotations on annotation lines. The annotation lines are drawn outside of the drawing and carry the annotations on them.
 * The annotations are projected to the annotation lines based on their position and the specified line direction. 
 * The annotations that are close to each other and have similar depth in view will be grouped together on the same annotation line, if possible.
 * The annotation lines are sorted by the amount of occupied space on them, so the most occupied lines will be drawn further from the drawing, which makes the drawing less cluttered and more clear.
 * @param args 
 * @returns 
 */
export function drawAnnotationsWithAnnotationLines(args: {
    annotationsParent: SVGElement,
    layerName: string,
    annotations: AnnotationTransformed[],
    lineStart: Vector3,
    lineDirection: Vector3,
    lineNormalDirection: Vector3,
    lineSpacing: number,
    minIntervalsForSummedAnnotationLine?: number,
    disqualifyAnnotations?: AnnotationLineDisqualifyType,
    drawingSizeY?: number,
}) {
    const {
        annotationsParent,
        layerName,
        annotations,
        lineStart,
        lineDirection,
        lineNormalDirection,
        lineSpacing = 50,
        minIntervalsForSummedAnnotationLine = -1,
        disqualifyAnnotations = 'onlyNonperpendicular',
        drawingSizeY = 2000,
    } = args;

    // 1. sort annotations by their distance from the line, then depth in view and then by their position along the line
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


    // 2. group and merge annotations into annotation lines

    // group annotations first to lines based on their distance from the line and depth in view
    // this will create a lot of duplicate annotations, but we merge them later
    // more importantly, this step ensures that annotation of object that are close to each other
    // will have much higher probability to share one annotation line, which makes the final result more clear and less cluttered
    const linesWithAnnotations: LineWithAnnotations[] = [];
    const annotationsAtPosition: AnnotationTransformedToDirection[] = [];
    for (const annotation of sortedAnnotations) {
        LineWithAnnotations.AddAnnotationToLines(annotation, linesWithAnnotations);
    }

    // Apply optimal merging to minimize the number of final annotation lines
    const mergedLines = optimalAnnotationLinesMerge(linesWithAnnotations);
    linesWithAnnotations.splice(0, linesWithAnnotations.length, ...mergedLines);

    // 3. optional: if annotations can be drawn in their place without overcomplicating the drawing, draw them at their positions
    if (disqualifyAnnotations === 'looseIntervals') {
        disqualifyLooseAnnotationsFromAnnotationLines(linesWithAnnotations, annotationsAtPosition);
    }
    else if (disqualifyAnnotations === 'withSingleInterval') {
        disqualifyAnnotationLinesWithOneInterval(linesWithAnnotations, annotationsAtPosition);
    }

    // 4. sort the annotation lines by the amount of occupied space on them - the smaller will go nearer to the drawing
    linesWithAnnotations.sort((a, b) => {
        const sumOfLengths = (line: LineWithAnnotations) => line.usedIntervals.reduce((sum, interval) => sum + interval.realLength, 0);
        return sumOfLengths(a) - sumOfLengths(b);
    });

    // 5. optional: make copies of the annotation lines with summed intervals
    if (minIntervalsForSummedAnnotationLine > 1) {
        const pushBehindCurrent = true;
        // add sums of continuous intervals to the lines
        let arrayEnd = linesWithAnnotations.length;
        for (let i = 0; i < arrayEnd; i++) {
            const copyWithSummedIntervals = linesWithAnnotations[i].makeCopyWithSumedIntervals(minIntervalsForSummedAnnotationLine);
            if (copyWithSummedIntervals) {
                if (pushBehindCurrent) {
                    // push it behind the current line
                    linesWithAnnotations.splice(i + 1, 0, copyWithSummedIntervals);
                    i++; // skip the copy in the next iteration
                    arrayEnd++; // adjust the end of the array because we added a new line
                }
                else {
                    linesWithAnnotations.push(copyWithSummedIntervals);
                }
            }
        }
    }


    const primaryAnnotationLines: LineWithAnnotations[] = []
    const secondaryAnnotationLines: LineWithAnnotations[] = [];
    splitArrayIntoTwo(
        linesWithAnnotations,
        (line: LineWithAnnotations) => {
            const lineDistance = line.getMergeCriteria();
            return lineDistance <= drawingSizeY / 2;
        },
        primaryAnnotationLines,
        secondaryAnnotationLines
    );

    return {
        layerName: layerName,
        annotationLines: primaryAnnotationLines,
        secondaryAnnotationLines: secondaryAnnotationLines,
        countOfLines: primaryAnnotationLines.length,
        secondaryCountOfLines: secondaryAnnotationLines.length,
        annotationsAtPosition: annotationsAtPosition,
    };

}


// -------
// HELPERS
// -------



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

/**
 * Annotation lines is a line that carries the annotations outside of the drawing.
 * It has "Intervals" on it, which are the projected annotations.
 * Intervals have their start and end coordinates on the annotation line and the list of the annotations.
 * 
 */
class LineWithAnnotations {
    usedIntervals: { start: number, end: number, annotations: AnnotationTransformedToDirection[], realLength: number }[] = [];

    readonly annotationLayerName: string;

    private sortUsedIntervals(): void {
        this.usedIntervals.sort((a, b) => a.start - b.start || a.end - b.end || a.realLength - b.realLength);
    }

    constructor(annotationLayerName: string = '') {
        this.annotationLayerName = annotationLayerName;
    }


    /**
     * Array of normal distances from the annotation base line.
     * This is useful for determining the preference into which annotation line should another one be merged.
     * The values will not be unique because we want also the weight of the average distance.
     */
    yDistances: number[] = [];
    /**
     * @returns when deciding which line to merge with, the line with the lowest average distance of annotations from the base line will be preferred
     */
    getMergeCriteria(): number {
        if (this.yDistances.length === 0) {
            // no annotations - should not happen, but prefere merging to other lines
            return 999999;
        }
        // Warning: this is average distance from the line, which used as argument for splitting the lines into primary and secondary.
        const averageDistance = this.yDistances.reduce((sum, value) => sum + value, 0) / this.yDistances.length;
        return averageDistance;
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
            this.yDistances.push(annotation.distanceY);
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
                const ownInterval = this.usedIntervals.find(i => i.start === otherInterval.start && i.end === otherInterval.end);
                if (ownInterval) {
                    ownInterval.annotations.push(...otherInterval.annotations);
                    ownInterval.realLength = Math.max(ownInterval.realLength, otherInterval.realLength);
                    return;
                }

                this.usedIntervals.push(otherInterval);
            });
            this.yDistances.push(...other.yDistances);
            this.sortUsedIntervals();
        }
        return result;
    }
    getSignature(): string {
        let signature = this.usedIntervals.map(i => `${i.realLength}`).join('-');
        this.usedIntervals.forEach(i => signature += ` - S${i.start} E${i.end}`);
        return signature;
    }
    /**
     * sums up all continuous intervals into one and merges their annotations
     * @returns a new LineWithAnnotations with summed intervals if the result is different, otherwise undefined
     */
    makeCopyWithSumedIntervals(minIntervalsCount: number): LineWithAnnotations | undefined {
        const copy = new LineWithAnnotations(this.annotationLayerName);
        let previousStart: number = this.usedIntervals[0].start;
        let previousEnd: number = this.usedIntervals[0].end;
        let realLength = this.usedIntervals[0].realLength;
        let steps = 1;
        let annotations = [...this.usedIntervals[0].annotations];
        for (let i = 1; i < this.usedIntervals.length; i++) {
            const currentStart = this.usedIntervals[i].start;
            const currentEnd = this.usedIntervals[i].end;
            if (currentStart !== previousEnd) {
                if (steps >= minIntervalsCount) {
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
        if (steps >= minIntervalsCount) {
            const interval = copy.getOrCreateInterval(previousStart, previousEnd, realLength);
            interval?.annotations.push(...annotations);
        }
        copy.yDistances = [...this.yDistances];

        if (!copy.usedIntervals.length || copy.getSignature() === this.getSignature()) {
            return undefined;
        }
        return copy;
    }
    toSvg({
        parent,
        offsetPixels,
        direction,
        debugLabel = undefined,
        fillGapsOnAnnotationLine: showGaps = true,
        styles = {},
    }: {
        parent: SVGGElement,
        offsetPixels: Vector3,
        direction: Vector3,
        debugLabel?: string,
            fillGapsOnAnnotationLine?: boolean,
            styles?: {
                baseLine?: SVGHelper.SVGPathProperties,
                intervalLine?: SVGHelper.SVGLineProperties | SVGHelper.SVGPathProperties,
                intervalText?: SVGHelper.SVGTextProperties,
                intervalTextOffset?: { _x: number, _y: number },
                leaderLine?: SVGHelper.SVGPathProperties,
                gapLine?: SVGHelper.SVGLineProperties | SVGHelper.SVGPathProperties,
                gapText?: SVGHelper.SVGTextProperties,
                gapTextOffset?: { _x: number, _y: number },
            },
    }): void {
        const {
            baseLine: baseLineStyle = SVGHelper.thinLineStyle,
            intervalLine: intervalLineStyle = {
                ...SVGHelper.thickLineStyle,
                ...SVGHelper.arrowLineStyle,
                ticksAtEndsLength: 25,
                ticksStyle: SVGHelper.thinLineStyle,
            },
            intervalText: intervalTextStyle = SVGHelper.textStyle,
            intervalTextOffset = { _x: 0, _y: 16 },
            leaderLine: leaderLineStyle = SVGHelper.thinDashedLineStyle,
            gapLine: gapLineStyle = {
                ...SVGHelper.thinLineStyle,
                ...SVGHelper.arrowLineStyle,
                stroke: 'gray',
            },
            gapText: gapTextStyle = { ...SVGHelper.textStyle, fill: 'gray' },
            gapTextOffset = { _x: 0, _y: 16 },
        } = styles;

        const { min, max } = this.getMinMax();
        const lineStart = offsetPixels.clone().add(direction.clone().multiply(min));
        const lineEnd = offsetPixels.clone().add(direction.clone().multiply(max));
        SVGHelper.createSvgLineElement({
            parent,
            startX: lineStart._x,
            startY: lineStart._y,
            endX: lineEnd._x,
            endY: lineEnd._y,
            properties: baseLineStyle,
        });
        if (debugLabel) {
            const azimuth = Math.atan2(direction._y, direction._x) * 180 / Math.PI;
            SVGHelper.createSvgTextElement({
                parent,
                x: 0,
                y: 15,
                textContent: `${debugLabel}`,
                properties: {
                    ...SVGHelper.textStyle,
                    fill: 'green',
                    transform: `translate(${(lineStart._x + lineEnd._x) / 2}, ${(lineStart._y + lineEnd._y) / 2}) rotate(${-azimuth}) `,
                },
            });
        }
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
                textOffset: intervalTextOffset,
                textContent: interval.realLength.toFixed(0),
                lineProperties: intervalLineStyle,
                textProperties: intervalTextStyle,
            });

            const farthestStartAnnotation = selectAnnotationForIntervalEdge(interval.start, "distanceStartX");
            const farthestEndAnnotation = selectAnnotationForIntervalEdge(interval.end, "distanceEndX");
            SVGHelper.createSvgLineElement({
                parent,
                startX: intervalStart._x,
                startY: intervalStart._y,
                endX: farthestStartAnnotation.startPoint.pixelCoordinate._x,
                endY: farthestStartAnnotation.startPoint.pixelCoordinate._y,
                properties: leaderLineStyle,
            });
            SVGHelper.createSvgLineElement({
                parent,
                startX: intervalEnd._x,
                startY: intervalEnd._y,
                endX: farthestEndAnnotation.endPoint.pixelCoordinate._x,
                endY: farthestEndAnnotation.endPoint.pixelCoordinate._y,
                properties: leaderLineStyle,
            });
        });

        // Draw gap annotations between non-continuous intervals
        if (showGaps) {
            for (let i = 0; i < this.usedIntervals.length - 1; i++) {
                const current = this.usedIntervals[i];
                const next = this.usedIntervals[i + 1];
                const gapPixelStart = current.end;
                const gapPixelEnd = next.start;
                if (gapPixelEnd <= gapPixelStart) continue;

                const refAnnotation = current.annotations[0] ?? next.annotations[0];
                if (!refAnnotation) continue;

                const annotationPixelSpan = refAnnotation.distanceEndX - refAnnotation.distanceStartX;
                if (Math.abs(annotationPixelSpan) < Vector3.EPS) continue;

                const mmPerPixel = refAnnotation.realLength / annotationPixelSpan;
                const gapRealLength = (gapPixelEnd - gapPixelStart) * mmPerPixel;
                if (gapRealLength < 1) continue;

                const gapStart = offsetPixels.clone().add(direction.clone().multiply(gapPixelStart));
                const gapEnd = offsetPixels.clone().add(direction.clone().multiply(gapPixelEnd));
                SVGHelper.createSvgLineElementWithText({
                    parent,
                    startX: gapStart._x,
                    startY: gapStart._y,
                    endX: gapEnd._x,
                    endY: gapEnd._y,
                    textOffset: gapTextOffset,
                    textContent: gapRealLength.toFixed(0),
                    lineProperties: gapLineStyle,
                    textProperties: gapTextStyle,
                });
            }
        }

    }
    static AddAnnotationToLines(annotation: AnnotationTransformedToDirection, lines: LineWithAnnotations[]): void {
        // try to add the annotation to an existing line
        for (const line of lines) {
            if (line.addAnnotation(annotation)) {
                return;
            }
        }
        // if it does not fit in any existing line, create a new line
        const newLine = new LineWithAnnotations(annotation.annotation.layer);
        newLine.addAnnotation(annotation);
        lines.push(newLine);
    }
}

function disqualifyAnnotationLinesWithOneInterval(linesWithAnnotations: LineWithAnnotations[], annotationsAtPosition: AnnotationTransformedToDirection[]) {
    const linesToDestroyIndices: number[] = [];
    for (let i = 0; i < linesWithAnnotations.length; i++) {
        const line = linesWithAnnotations[i];
        if (line.usedIntervals.length === 1) {
            annotationsAtPosition.push(...line.usedIntervals[0].annotations);
            linesToDestroyIndices.push(i);
        }
    }
    linesToDestroyIndices.sort((a, b) => b - a);
    for (const index of linesToDestroyIndices) {
        linesWithAnnotations.splice(index, 1);
    }
}

/**
* If an annotation line only has loose annotation intervals, with just a single annotation per interval, 
* we can let such annotations to be drawn at the position of the annotated object instead of along the 
* annotation line. This will make the annotation more clear and easier to read, because it will be closer 
* to the annotated object and we can avoid long thin annotation lines with just one annotation on them.
* @param linesWithAnnotations the array where all the annotations lines are stored; the disqualified members will be removerd from it
* @param annotationsAtPosition the array where the disqualified annotations will be moved to, so they can be drawn at position
*/
function disqualifyLooseAnnotationsFromAnnotationLines(linesWithAnnotations: LineWithAnnotations[], annotationsAtPosition: AnnotationTransformedToDirection[]) {
    // if all the intervals from a line are disqualified, remove such line - store the indices of such lines
    const annotationsWithLinesToDestroyIndices: number[] = [];
    for (let i = 0; i < linesWithAnnotations.length; i++) {
        const line = linesWithAnnotations[i];
        // 1. assume that intervals on the line all are loose and will be disqualified
        // 2. loop through them and if they are not loose, remove them from the disqualification list
        const intervalsToDestroy: number[] = line.usedIntervals.map((_i, index) => index);
        for (let j = 1; j < line.usedIntervals.length; j++) {
            const first = line.usedIntervals[j - 1];
            const second = line.usedIntervals[j];
            const secondContinuesFirst = Math.round(second.start) === Math.round(first.end);
            if (secondContinuesFirst) {
                // remove j-1 and j from the intervals to destroy, because they are not loose
                if (intervalsToDestroy.includes(j - 1)) {
                    intervalsToDestroy.splice(intervalsToDestroy.indexOf(j - 1), 1);
                }
                if (intervalsToDestroy.includes(j)) {
                    intervalsToDestroy.splice(intervalsToDestroy.indexOf(j), 1);
                }
            }
        }
        // the remaining intervals to destroy are loose, we can move their annotations to be drawn at position
        intervalsToDestroy.sort((a, b) => b - a);
        for (const index of intervalsToDestroy) {
            const interval = line.usedIntervals[index];
            annotationsAtPosition.push(interval.annotations[0]);
            line.usedIntervals.splice(index, 1);
        }
        if (line.usedIntervals.length === 0) {
            // no intervals on the annotation line -> remove the line
            annotationsWithLinesToDestroyIndices.push(i);
        }
    }
    annotationsWithLinesToDestroyIndices.sort((a, b) => b - a);
    for (const index of annotationsWithLinesToDestroyIndices) {
        linesWithAnnotations.splice(index, 1);
    }
};

/**
 * Splits the input array into two arrays based on the provided condition.
 * The output arrays are provided as parameters and will be modified in place.
 * @param input input array
 * @param condition splitting condition
 * @param matching output array for elements that match the condition
 * @param nonMatching output array for elements that do not match the condition
 */
function splitArrayIntoTwo(input: any[], condition: (element: any) => boolean, matching: any[], nonMatching: any[]): void {
    for (const element of input) {
        if (condition(element)) {
            matching.push(element);
        }
        else {
            nonMatching.push(element);
        }
    }
}