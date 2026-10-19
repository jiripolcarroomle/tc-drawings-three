// Annotation lines layout, ported from tc-drawings-three (drawingapi/implementation/drawing.annotationlines.ts).
// Only the imports, the enum (now a const object) and the SVG element type changed.
import type { AnnotationTransformed, TransformedPoint } from "./types.ts";
import { Vector3 } from "./vector3.ts";
import * as SVGHelper from "./svg-builder.ts";
import { optimalAnnotationLinesMerge } from "./annotation-lines-merge.ts";

// built without DOM or Node typings (see log.ts); used by the debug helper print()
declare const console: { log(message: string): void };

/**
 * Annotation projected to a direction of an annotation line.
 */
interface AnnotationTransformedToDirection extends AnnotationTransformed {
    /** from start point of the annotation line along the line direction */
    distanceStartX: number,
    distanceEndX: number,
    /** real projected positions along the line direction, aligned with the pixel-space ordering */
    realDistanceStartX: number,
    realDistanceEndX: number,
    /** from start point of the annotation line perpendicular to the line direction */
    distanceY: number,
    /** depth in view - useful for sorting annotations */
    distanceZ: number,
}

export const AnnotationLineDisqualifyType = {
    OnlyNonperpendicular: 'onlyNonperpendicular',
    LooseIntervals: 'looseIntervals',
    WithSingleInterval: 'withSingleInterval',
} as const;
export type AnnotationLineDisqualifyType = typeof AnnotationLineDisqualifyType[keyof typeof AnnotationLineDisqualifyType];

function transformAnnotationsToDirection(annotation: AnnotationTransformed, lineStart: Vector3, lineDirection: Vector3): AnnotationTransformedToDirection {
    const startToLine = distancePointToLine(annotation.startPoint.pixelCoordinate, lineStart, lineDirection);
    const endToLine = distancePointToLine(annotation.endPoint.pixelCoordinate, lineStart, lineDirection);
    const distanceToLine = Math.round(Math.min(startToLine, endToLine));
    const depth = Math.round((annotation.startPoint.cameraSpaceCoordinate._z + annotation.endPoint.cameraSpaceCoordinate._z) / 2);
    const startAlongLine = Math.round(projectPointOnLine(annotation.startPoint.pixelCoordinate, lineStart, lineDirection));
    const endAlongLine = Math.round(projectPointOnLine(annotation.endPoint.pixelCoordinate, lineStart, lineDirection));
    const realDirection = pixelDirectionToCameraSpaceDirection(lineDirection);
    const backwards = startAlongLine > endAlongLine;

    return (backwards
        ? {
            ...annotation,
            distanceY: distanceToLine,
            distanceZ: depth,
            distanceStartX: endAlongLine,
            distanceEndX: startAlongLine,
            realDistanceStartX: projectPointOnLine(annotation.endPoint.cameraSpaceCoordinate, new Vector3(0, 0, 0), realDirection),
            realDistanceEndX: projectPointOnLine(annotation.startPoint.cameraSpaceCoordinate, new Vector3(0, 0, 0), realDirection),
            startPoint: annotation.endPoint,
            endPoint: annotation.startPoint,
        }
        : {
            ...annotation,
            distanceY: distanceToLine,
            distanceZ: depth,
            distanceStartX: startAlongLine,
            distanceEndX: endAlongLine,
            realDistanceStartX: projectPointOnLine(annotation.startPoint.cameraSpaceCoordinate, new Vector3(0, 0, 0), realDirection),
            realDistanceEndX: projectPointOnLine(annotation.endPoint.cameraSpaceCoordinate, new Vector3(0, 0, 0), realDirection),
        });

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
    annotationsParent: SVGHelper.SvgNode,
    layerName: string,
    annotations: AnnotationTransformed[],
    lineStart: Vector3,
    lineDirection: Vector3,
    lineNormalDirection: Vector3,
    lineSpacing: number,
    minIntervalsForSummedAnnotationLine?: number,
    disqualifyAnnotations?: AnnotationLineDisqualifyType,
    drawingSizeY?: number,
    /**
     * How annotations are divided between the base side (lineStart) and the opposite side:
     * - 'lineAverage' (original): lines are built from all annotations, then each line goes to the side its
     *   annotations are closer to on average - one line can mix annotations from both halves;
     * - 'content': the annotations are divided first, at a gap between the annotated objects chosen so that both
     *   sides get a fair share (see chooseSideDivider), and each side builds its own lines.
     */
    sideSplit?: 'lineAverage' | 'content',
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
        sideSplit = 'lineAverage',
    } = args;
    void annotationsParent;
    void lineNormalDirection;
    void lineSpacing;

    // 1. sort annotations by their distance from the line, then depth in view and then by their position along the line
    const sortedAnnotations: AnnotationTransformedToDirection[] = annotations
        .map(annotation => transformAnnotationsToDirection(annotation, lineStart, lineDirection))
        .sort((a, b) => {
            if (a.distanceY !== b.distanceY) {
                return a.distanceY - b.distanceY;
            }
            if (a.distanceZ !== b.distanceZ) {
                return b.distanceZ - a.distanceZ;
            }
            return a.distanceStartX - b.distanceStartX;
        });


    if (sideSplit === 'content') {
        // distance from the drawing edge on the base side (the base line lies outside the drawing)
        const offset = lineStart.dot(lineNormalDirection) - drawingSizeY;
        const positionOf = (annotation: AnnotationTransformedToDirection) => annotation.distanceY - offset;
        const divider = chooseSideDivider(sortedAnnotations.map(positionOf), drawingSizeY);
        // the same extent along the line (e.g. the common height of a row of units) is dimensioned on one side only
        // when its objects form one continuous row across the divider - on the side where most of them are, the
        // base side on a tie; two separate groups with the same extent (e.g. both legs of a U) keep a dimension each
        const extentOf = (a: AnnotationTransformedToDirection) => `${a.distanceStartX}:${a.distanceEndX}:${Math.round(a.realLength)}`;
        const byExtent = new Map<string, number[]>();
        for (const a of sortedAnnotations) (byExtent.get(extentOf(a)) ?? byExtent.set(extentOf(a), []).get(extentOf(a))!).push(positionOf(a));
        const oneSide = new Map<string, boolean>(); // extent -> on the base side
        const splitExtents = new Map<string, boolean>(); // extents kept on both sides -> the side they would join
        for (const [extent, positions] of byExtent) {
            positions.sort((a, b) => a - b);
            const near = positions.filter(p => p <= divider).length;
            if (near === 0 || near === positions.length) continue;
            const crossing = positions[near] - positions[near - 1];
            const steps = positions.slice(1).map((p, i) => p - positions[i]).filter((_, i) => i !== near - 1);
            const separateGroups = crossing >= 0.1 * drawingSizeY && crossing >= 2 * Math.max(0, ...steps);
            if (separateGroups) splitExtents.set(extent, near >= positions.length - near);
            else oneSide.set(extent, near >= positions.length - near);
        }
        const onNearSide = (a: AnnotationTransformedToDirection) => oneSide.get(extentOf(a)) ?? positionOf(a) <= divider;
        const build = () => [
            buildAnnotationLines(sortedAnnotations.filter(onNearSide), disqualifyAnnotations, minIntervalsForSummedAnnotationLine),
            buildAnnotationLines(sortedAnnotations.filter(a => !onNearSide(a)), disqualifyAnnotations, minIntervalsForSummedAnnotationLine),
        ];
        let [near, far] = build();
        // an extent kept on both sides that ends up alone (drawn at its position) goes back to one side: where most
        // of it is, or the other side when it would be alone there as well
        const stranded = () => [...new Set([...near.annotationsAtPosition, ...far.annotationsAtPosition].map(extentOf))].filter(extent => splitExtents.has(extent));
        const first = stranded();
        if (first.length) {
            for (const extent of first) oneSide.set(extent, splitExtents.get(extent)!);
            [near, far] = build();
            const again = stranded();
            if (again.length) {
                for (const extent of again) oneSide.set(extent, !oneSide.get(extent));
                [near, far] = build();
            }
        }
        return {
            layerName: layerName,
            annotationLines: near.lines,
            secondaryAnnotationLines: far.lines,
            countOfLines: near.lines.length,
            secondaryCountOfLines: far.lines.length,
            annotationsAtPosition: [...near.annotationsAtPosition, ...far.annotationsAtPosition],
        };
    }

    const { lines: linesWithAnnotations, annotationsAtPosition } = buildAnnotationLines(sortedAnnotations, disqualifyAnnotations, minIntervalsForSummedAnnotationLine);

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


/** Steps 2-5 of drawAnnotationsWithAnnotationLines: group, merge, disqualify, sort and optionally sum the lines. */
function buildAnnotationLines(sortedAnnotations: AnnotationTransformedToDirection[], disqualifyAnnotations: AnnotationLineDisqualifyType, minIntervalsForSummedAnnotationLine: number): { lines: LineWithAnnotations[], annotationsAtPosition: AnnotationTransformedToDirection[] } {
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


    return { lines: linesWithAnnotations, annotationsAtPosition };
}

/**
 * Where to divide the annotations between the base side (positions up to the returned divider, measured from the
 * base edge of the drawing) and the opposite side. Candidates are the empty bands between neighbouring annotated
 * positions that are real gaps (at least 10 % of the drawing size) and leave at least two annotations on each
 * side; the best one is wide and balanced. Without such a band all annotations go to the side their objects are
 * closer to on average.
 */
function chooseSideDivider(positions: number[], size: number): number {
    const sorted = [...positions].sort((a, b) => a - b);
    const n = sorted.length;
    let best: { score: number, at: number } | undefined;
    for (let i = 1; i < n; i++) {
        const gap = sorted[i] - sorted[i - 1];
        const smaller = Math.min(i, n - i);
        if (gap < 0.1 * size || smaller < 2) continue;
        const score = gap / size + smaller / n;
        if (!best || score > best.score) best = { score, at: (sorted[i] + sorted[i - 1]) / 2 };
    }
    if (best) return best.at;
    const mean = n ? sorted.reduce((sum, p) => sum + p, 0) / n : 0;
    return mean <= size / 2 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
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

type IntervalOnAnnotationLine = { start: number, end: number, annotations: AnnotationTransformedToDirection[], realLength: number, realStart: number, realEnd: number };
function sortUsedIntervals(usedIntervals: IntervalOnAnnotationLine[]): void {
    usedIntervals.sort((a, b) => a.start - b.start || a.end - b.end || a.realLength - b.realLength);
}

function createZeroLengthAnnotationFromPoint(args: {
    point: TransformedPoint,
    lineStart: Vector3,
    lineDirection: Vector3,
    layerName: string,
}): AnnotationTransformedToDirection {
    const { point, lineStart, lineDirection, layerName } = args;
    return transformAnnotationsToDirection({
        annotation: {
            start: point.worldCoordinate,
            end: point.worldCoordinate,
            layer: layerName,
        },
        startPoint: point,
        endPoint: point,
        realLength: 0,
        projectedLength: 0,
        pixelLength: 0,
    }, lineStart, lineDirection);
}

/**
 * Annotation lines is a line that carries the annotations outside of the drawing.
 * It has "Intervals" on it, which are the projected annotations.
 * Intervals have their start and end coordinates on the annotation line and the list of the annotations.
 * 
 */
class LineWithAnnotations {
    usedIntervals: IntervalOnAnnotationLine[] = [];
    annotablePoints: { point: TransformedPoint, pixelPosition: number, realProjectedPosition: number }[] = [];

    readonly annotationLayerName: string;

    constructor(annotationLayerName: string = '') {
        this.annotationLayerName = annotationLayerName;
    }

    pushAnnotablePoint(point: TransformedPoint, direction: Vector3): void {
        const pixelPosition = projectPointOnLine(point.pixelCoordinate, new Vector3(0, 0, 0), direction);
        const realProjectedPosition = projectPointOnLine(point.cameraSpaceCoordinate, new Vector3(0, 0, 0), pixelDirectionToCameraSpaceDirection(direction));
        this.annotablePoints.push({ point, pixelPosition, realProjectedPosition });
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
        const availableInterval = this.getOrCreateInterval(intervalStart, intervalEnd, annotation.realLength, annotation.realDistanceStartX, annotation.realDistanceEndX, true);
        if (availableInterval && Math.abs(availableInterval.realLength - annotation.realLength) < Vector3.EPS) {
            availableInterval.annotations.push(annotation);
            this.yDistances.push(annotation.distanceY);
            availableInterval.realLength = annotation.realLength;
            availableInterval.realStart = Math.min(availableInterval.realStart, annotation.realDistanceStartX);
            availableInterval.realEnd = Math.max(availableInterval.realEnd, annotation.realDistanceEndX);
            return true;
        }
        return false;
    }
    isIntervalFree(start: number, end: number): boolean {
        const startRound = Math.round(Math.min(start, end));
        const endRound = Math.round(Math.max(start, end));
        return !this.usedIntervals.some(i => Math.round(i.start) <= endRound && Math.round(i.end) >= startRound);
    }
    /**
     * Gets an existing interval that overlaps with the given start and end, or creates a new one if create is true and there is free space.
     */
    getOrCreateInterval(start: number, end: number, realLength: number, realStart: number, realEnd: number, create: boolean = true): undefined | { start: number, end: number, annotations: AnnotationTransformedToDirection[], realLength: number, realStart: number, realEnd: number } {
        const startRound = Math.round(Math.min(start, end));
        const endRound = Math.round(Math.max(start, end));
        let interval = this.usedIntervals.find(i => i.start === startRound && i.end === endRound);
        if (!interval && create) {
            const hasFreeSpace = this.isIntervalFree(start, end);
            if (!hasFreeSpace) {
                return undefined;
            }
            interval = { start: startRound, end: endRound, annotations: [], realLength: realLength, realStart, realEnd };
            this.usedIntervals.push(interval);
            sortUsedIntervals(this.usedIntervals);
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
                    ownInterval.realStart = Math.min(ownInterval.realStart, otherInterval.realStart);
                    ownInterval.realEnd = Math.max(ownInterval.realEnd, otherInterval.realEnd);
                    return;
                }

                this.usedIntervals.push(otherInterval);
            });
            this.yDistances.push(...other.yDistances);
            sortUsedIntervals(this.usedIntervals);
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
        let realStart = this.usedIntervals[0].realStart;
        let realEnd = this.usedIntervals[0].realEnd;
        let steps = 1;
        let annotations = [...this.usedIntervals[0].annotations];
        for (let i = 1; i < this.usedIntervals.length; i++) {
            const currentStart = this.usedIntervals[i].start;
            const currentEnd = this.usedIntervals[i].end;
            if (currentStart !== previousEnd) {
                if (steps >= minIntervalsCount) {
                    const interval = copy.getOrCreateInterval(previousStart, previousEnd, realLength, realStart, realEnd);
                    interval?.annotations.push(...annotations);
                }
                annotations = [];
                previousStart = currentStart;
                realLength = 0;
                realStart = this.usedIntervals[i].realStart;
                steps = 0;
            }
            realLength += this.usedIntervals[i].realLength;
            steps++;
            previousEnd = currentEnd;
            realEnd = this.usedIntervals[i].realEnd;
            annotations.push(...this.usedIntervals[i].annotations);
        }
        if (steps >= minIntervalsCount) {
            const interval = copy.getOrCreateInterval(previousStart, previousEnd, realLength, realStart, realEnd);
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
        fillGapsOnAnnotationLine = false,
        showDistanceToAnnotablePoints = false,
        styles = {},
    }: {
        parent: SVGHelper.SvgNode,
        offsetPixels: Vector3,
        direction: Vector3,
        debugLabel?: string,
        fillGapsOnAnnotationLine?: boolean,
        showDistanceToAnnotablePoints?: boolean,
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

        const copyOfIntervals = [...this.usedIntervals];
        if (showDistanceToAnnotablePoints) {
            this.annotablePoints.forEach(point => {
                if (this.isIntervalFree(point.pixelPosition, point.pixelPosition)) {
                    copyOfIntervals.push({
                        start: point.pixelPosition,
                        end: point.pixelPosition,
                        annotations: [
                            createZeroLengthAnnotationFromPoint({
                                point: point.point,
                                lineStart: offsetPixels,
                                lineDirection: direction,
                                layerName: this.annotationLayerName,
                            }),
                        ],
                        realLength: 0,
                        realStart: point.realProjectedPosition,
                        realEnd: point.realProjectedPosition,
                    });
                }
            });
        }
        sortUsedIntervals(copyOfIntervals);

        const { min, max } = getMinMax(copyOfIntervals);
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
        // perpendicular to the annotation line direction - used to find how far a point reaches away from the line
        const normalDirection = new Vector3(-direction._y, direction._x, 0);

        // among all given points, returns the two that are nearest/farthest along normalDirection
        const pickNormalExtremes = (points: Vector3[]): [Vector3, Vector3] => {
            let nearest = points[0];
            let farthest = points[0];
            let nearestProjection = nearest.dot(normalDirection);
            let farthestProjection = nearestProjection;
            for (const point of points) {
                const projection = point.dot(normalDirection);
                if (projection < nearestProjection) {
                    nearestProjection = projection;
                    nearest = point;
                }
                if (projection > farthestProjection) {
                    farthestProjection = projection;
                    farthest = point;
                }
            }
            return [nearest, farthest];
        };

        copyOfIntervals.forEach(interval => {
            const intervalStart = offsetPixels.clone().add(direction.clone().multiply(interval.start));
            const intervalEnd = offsetPixels.clone().add(direction.clone().multiply(interval.end));

            if (interval.realLength >= 1) {
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
            }

            const [startNear, startFar] = pickNormalExtremes([
                intervalStart,
                ...interval.annotations.map(a => a.startPoint.pixelCoordinate),
            ]);
            SVGHelper.createSvgLineElement({
                parent,
                startX: startNear._x,
                startY: startNear._y,
                endX: startFar._x,
                endY: startFar._y,
                properties: leaderLineStyle,
            });
            const [endNear, endFar] = pickNormalExtremes([
                intervalEnd,
                ...interval.annotations.map(a => a.endPoint.pixelCoordinate),
            ]);
            SVGHelper.createSvgLineElement({
                parent,
                startX: endNear._x,
                startY: endNear._y,
                endX: endFar._x,
                endY: endFar._y,
                properties: leaderLineStyle,
            });
        });

        // Draw gap annotations between non-continuous intervals
        if (fillGapsOnAnnotationLine) {
            for (let i = 0; i < copyOfIntervals.length - 1; i++) {
                const current = copyOfIntervals[i];
                const next = copyOfIntervals[i + 1];
                const gapPixelStart = current.end;
                const gapPixelEnd = next.start;
                if (gapPixelEnd <= gapPixelStart) continue;

                const gapRealLength = next.realStart - current.realEnd;
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

function pixelDirectionToCameraSpaceDirection(direction: Vector3): Vector3 {
    return new Vector3(direction._x, -direction._y, 0).normalize();
}

function disqualifyAnnotationLinesWithOneInterval(linesWithAnnotations: LineWithAnnotations[], annotationsAtPosition: AnnotationTransformedToDirection[]) {
    const linesToDestroyIndices: number[] = [];
    for (let i = 0; i < linesWithAnnotations.length; i++) {
        const line = linesWithAnnotations[i];
        if (line.usedIntervals.length === 1) {
            // only add one of the annotation to position
            // can be rewritten to pour all of them, but there might be too many
            annotationsAtPosition.push(line.usedIntervals[0].annotations[0]);
            linesToDestroyIndices.push(i);
        }
    }
    linesToDestroyIndices.sort((a, b) => b - a);
    for (const index of linesToDestroyIndices) {
        linesWithAnnotations.splice(index, 1);
    }
}

function getMinMax(intervals: IntervalOnAnnotationLine[]): { min: number, max: number } {
    if (intervals.length === 0) {
        return { min: 0, max: 0 };
    }
    const min = Math.min(...intervals.map(i => Math.round(i.start)));
    const max = Math.max(...intervals.map(i => Math.round(i.end)));
    return { min, max };
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
