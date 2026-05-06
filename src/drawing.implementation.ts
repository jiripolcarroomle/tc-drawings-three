import { DrawingDirection, type AnnotablePoint, type Annotation, type IPlanSvgDrawing, type SvgPathInjectionData } from "./drawing.interface";
import type { IRenderOrthoCameraResult } from "./orderdrawingrenderer.interface";
import { Matrix4, Vector3 } from "./tc/base";
import * as SVGHelper from "./svghelper";
import { drawAnnotationsWithAnnotationLines } from "./drawing.implementation.annotationlines";
import { arrowLineStyle, linesArrowMarkerStyle, overlayStyle, textStyle, thickLineStyle, thinLineStyle } from "./svghelper";

/**
 * Upon pushing data into the drawing, the coordinates are transformed into world, camera and pixel coodinates.
 * We need all three coordinate sets for different purposes:
 *    - world coordinates for knowing actual distances that we show in the drawing
 *    - camera coordinates for calculating which annotations are near, far and to be able to sort them by their distance to the drawing edges
 *    - pixel coordinates for rendering the SVG elements in the right place
 */
interface TransformedPoint {
    /** real world 3d scene coordinate */
    worldCoordinate: Vector3;
    /** coordinate in camera space (x right, y up, z forward), not scaled against real world */
    cameraSpaceCoordinate: Vector3;
    /** coordinate in pixel space (x right, y down, z unused)
    ) */
    pixelCoordinate: Vector3;
}


interface AnnotablePointTransformed {
    point: AnnotablePoint;
    transformedPoint: TransformedPoint;
}
export interface AnnotationTransformed {
    annotation: Annotation,
    startPoint: TransformedPoint,
    endPoint: TransformedPoint,
    realLength: number,
    projectedLength: number,
    pixelLength: number,
}

export class Drawing implements IPlanSvgDrawing {

    _options: any;
    private _renderResult: IRenderOrthoCameraResult;

    constructor(renderResult: IRenderOrthoCameraResult, options?: any) {
        this._renderResult = renderResult;
        this._options = options;
    }

    get worldToViewMatrix(): Matrix4 {
        return this._renderResult.worldToPixelMatrix;
    }

    get sceneRender(): IRenderOrthoCameraResult {
        return this._renderResult;
    }

    /** Gets a copy of the options provided to the drawing. */
    get options(): any {
        return { ...this._options };
    }

    get drawingDirection() {
        return this._options?.drawingDirection || DrawingDirection.Top;
    }



    _svgOverlays: { transform: Matrix4, svgInjection: SvgPathInjectionData }[] = [];
    _annotations: AnnotationTransformed[] = [];
    _annotablePoints: AnnotablePointTransformed[] = [];

    addAnnotation(worldTransform: Matrix4, annotation: Annotation): void {
        const startPoint = {
            worldCoordinate: annotation.start.clone().applyMatrix4(worldTransform),
            cameraSpaceCoordinate: annotation.start.clone().applyMatrix4(worldTransform).applyMatrix4(this._renderResult.worldToCameraMatrix),
            pixelCoordinate: annotation.start.clone().applyMatrix4(worldTransform).applyMatrix4(this._renderResult.worldToPixelMatrix),
        }
        const endPoint = {
            worldCoordinate: annotation.end.clone().applyMatrix4(worldTransform),
            cameraSpaceCoordinate: annotation.end.clone().applyMatrix4(worldTransform).applyMatrix4(this._renderResult.worldToCameraMatrix),
            pixelCoordinate: annotation.end.clone().applyMatrix4(worldTransform).applyMatrix4(this._renderResult.worldToPixelMatrix),
        }
        const realLength = startPoint.worldCoordinate.distanceTo(endPoint.worldCoordinate);
        const projectedLength = new Vector3(startPoint.cameraSpaceCoordinate._x, startPoint.cameraSpaceCoordinate._y, 0).distanceTo(new Vector3(endPoint.cameraSpaceCoordinate._x, endPoint.cameraSpaceCoordinate._y, 0));
        const pixelLength = startPoint.pixelCoordinate.distanceTo(endPoint.pixelCoordinate);
        // unlink the original object, this implementation will mutate it
        this._annotations.push({ annotation: { ...annotation }, startPoint, endPoint, realLength, projectedLength, pixelLength });
    }

    addOverlay(worldTransform: Matrix4, svgInjection: SvgPathInjectionData): void {
        const copy = { ...svgInjection };
        this._svgOverlays.unshift({ transform: worldTransform, svgInjection: copy });
    }

    addAnnotablePoint(worldTransform: Matrix4, point: AnnotablePoint): void {
        const copy = { ...point };
        const transformedPoint = {
            worldCoordinate: copy.coordinate.clone().applyMatrix4(worldTransform),
            cameraSpaceCoordinate: copy.coordinate.clone().applyMatrix4(worldTransform).applyMatrix4(this._renderResult.worldToCameraMatrix),
            pixelCoordinate: copy.coordinate.clone().applyMatrix4(worldTransform).applyMatrix4(this._renderResult.worldToPixelMatrix),
        };
        this._annotablePoints.push({ point: copy, transformedPoint });
    }

    /**
     * Compute the final SVG element by combining the rendered image from the order drawing renderer, the svg overlays and the annotations.
     * @returns root object of a SVG DOM tree representing the drawing with all annotations and svg overlays
     */
    render(): SVGElement {
        // Implementation for rendering the final SVG element
        const svgRoot = SVGHelper.createSvgRootElement({
            width: this.sceneRender.imageWidth / 2,
            height: this.sceneRender.imageHeight / 2,
        });
        SVGHelper.createSvgDefsForArrowMarkers({ parent: svgRoot, properties: linesArrowMarkerStyle });

        const baseMargin = 400;
        let marginDown = baseMargin, marginUp = baseMargin, marginLeft = baseMargin, marginRight = baseMargin; // you can adjust margins as needed

        // add the image
        const m = 3;
        SVGHelper.createSvgRectElement({
            parent: svgRoot,
            x: -m / 2,
            y: -m / 2,
            width: this.sceneRender.imageWidth + m,
            height: this.sceneRender.imageHeight + m,
            properties: { fill: 'none', stroke: 'magenta', strokeWidth: m },
        });

        SVGHelper.createSvgImageElement({
            parent: svgRoot,
            href: this.sceneRender.image.dataUrl,
            width: this.sceneRender.imageWidth,
            height: this.sceneRender.imageHeight,
        });

        // group for overlays
        SVGHelper.createSvgGroupElement({ parent: svgRoot });
        // group for annotations to be on top of overlays
        // text elements must be on top, therefore the annotations go into one group separate from everything else
        const annotationsRoot = SVGHelper.createSvgGroupElement({ parent: svgRoot });

        // render svg overlays on top of the rendered image
        this._svgOverlays.forEach(({ transform, svgInjection }) => {
            const pathD = svgInjection.d.map(cmd => {
                if (cmd.command === 'Z') {
                    return 'Z';
                } else if (cmd.coordinate3d) {
                    const transformedCoordinate = cmd.coordinate3d.clone().applyMatrix4(transform).applyMatrix4(this._renderResult.worldToPixelMatrix);
                    return `${cmd.command} ${transformedCoordinate._x} ${transformedCoordinate._y}`;
                } else {
                    return '';
                }
            }).join(' ');
            const options = { ...svgInjection, d: pathD } as any;
            SVGHelper.createSvgPathElement({ parent: svgRoot, d: pathD, properties: { ...overlayStyle, ...options } });
        });

        const annotationLayers = new Map<string, typeof this._annotations>();
        for (const annotation of this._annotations) {
            // ignore annotations that are not projected perpendicular to the view
            // such annotation has a different projected length than the real length
            const lengthDifference = Math.abs(annotation.projectedLength - annotation.realLength);
            if (lengthDifference > Vector3.EPS || annotation.projectedLength < 1) {
                continue;
            }

            const layer = annotation.annotation.layer;
            if (!annotationLayers.has(layer)) {
                annotationLayers.set(layer, []);
            }
            annotationLayers.get(layer)!.push(annotation);
        }

        const allLayers = Array.from(annotationLayers.keys()).sort();
        allLayers.forEach(layer => {
            const annotationsInLayer = annotationLayers.get(layer)!;
            const horizontalAnnotations: AnnotationTransformed[] = [];
            const verticalAnnotations: AnnotationTransformed[] = [];

            annotationsInLayer.forEach((annotation) => {
                // calculate the azimuth, it only make sense to show the annotation on the aggregate lines if the annotation is rectangular to the drawing view
                const azimuth = Math.round(Math.atan2(annotation.endPoint.cameraSpaceCoordinate._y - annotation.startPoint.cameraSpaceCoordinate._y, annotation.endPoint.cameraSpaceCoordinate._x - annotation.startPoint.cameraSpaceCoordinate._x) * 180 / Math.PI);
                const isRightAngle = [-180, -90, 0, 90, 180].indexOf(azimuth) >= 0; // you can adjust the angles that are considered right angles as needed
                if (!isRightAngle || annotation.annotation.displayAtPosition) {
                    SVGHelper.createSvgLineElementWithText({
                        parent: annotationsRoot,
                        startX: annotation.startPoint.pixelCoordinate._x,
                        startY: annotation.startPoint.pixelCoordinate._y,
                        endX: annotation.endPoint.pixelCoordinate._x,
                        endY: annotation.endPoint.pixelCoordinate._y,
                        textOffset: new Vector3(0, 0, 0),
                        textContent: annotation.annotation.label ?? annotation.realLength.toFixed(0),
                        lineProperties: { ...thickLineStyle, ...arrowLineStyle },
                        textProperties: { ...textStyle, flipIfUpsideDown: true },
                    });
                }
                else {
                    const isVertical = Math.abs(azimuth) === 90;
                    const isHorizontal = Math.abs(azimuth) === 0 || Math.abs(azimuth) === 180;
                    if (isVertical) {
                        verticalAnnotations.push(annotation);
                    } else if (isHorizontal) {
                        horizontalAnnotations.push(annotation);
                    }
                }
            });

            // drawAnnotationsWithAnnotationLines(annotationsRoot, layer, horizontalAnnotations, new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, -1, 0));
            drawAnnotationsWithAnnotationLines({
                annotationsParent: annotationsRoot,
                layerName: layer,
                annotations: horizontalAnnotations,
                lineStart: new Vector3(0, this._renderResult.imageHeight, 0),
                lineDirection: new Vector3(1, 0, 0),
                lineNormalDirection: new Vector3(0, 1, 0),
                lineSpacing: 50
            });

            // drawAnnotationsWithAnnotationLines(annotationsRoot, layer, verticalAnnotations, new Vector3(0, 0, 0), new Vector3(0, 1, 0), new Vector3(-1, 0, 0));
            drawAnnotationsWithAnnotationLines({
                annotationsParent: annotationsRoot,
                layerName: layer,
                annotations: verticalAnnotations,
                lineStart: new Vector3(this._renderResult.imageWidth, 0, 0),
                lineDirection: new Vector3(0, 1, 0),
                lineNormalDirection: new Vector3(1, 0, 0),
                lineSpacing: 50
            });

        });


        this._annotablePoints.forEach(({ transformedPoint }) => {
            return;
            SVGHelper.createSvgCircleElement({
                parent: annotationsRoot,
                cx: transformedPoint.pixelCoordinate._x,
                cy: transformedPoint.pixelCoordinate._y,
                r: 5,
                properties: { fill: "red" },
            });
        });
        /* */

        // split the AnnotablePoints into 4 quarants of the drawing based on the camera space coordinates to decide where to put the annotation points
        // 1. top right (x positive, y negative), 2. top left (x negative, y negative), 3. bottom left (x negative, y positive), 4. bottom right (x positive, y positive)
        // therefore top half = 1 and 2, left half = 2 and 3
        const quadrants = [[], [], [], []] as { transformedPoint: TransformedPoint, point: AnnotablePoint }[][];
        const drawingCenterX = this.sceneRender.imageWidth / 2;
        const drawingCenterY = this.sceneRender.imageHeight / 2;
        this._annotablePoints.forEach((ap) => {
            const xPositive = ap.transformedPoint.cameraSpaceCoordinate._x - drawingCenterX > 0;
            const yPositive = ap.transformedPoint.cameraSpaceCoordinate._y - drawingCenterY > 0;
            if (xPositive && !yPositive) {
                quadrants[0].push(ap);
            } else if (!xPositive && !yPositive) {
                quadrants[1].push(ap);
            } else if (!xPositive && yPositive) {
                quadrants[2].push(ap);
            } else {
                quadrants[3].push(ap);
            }
        });

        function drawAnnotablePointInAxis(start: Vector3, axis: Vector3, normal: Vector3, annotablePoints: AnnotablePointTransformed[], transformToEdge: boolean = true, alreadyUsedSignatures: string[] | undefined = []) {
            axis = axis.clone().normalize();
            normal = normal.clone().normalize();

            // compute coordinates of the annotable points in a coordinate system where the start of the axis is the origin and the axis direction is the x-axis, 
            // therefore we get the distance of the annotable point from the axis (y-coordinate) and the parameter on the axis (x-coordinate)
            const annotablePointsWithSignedDistancesAndParametersOfLineSegments = annotablePoints.map(ap => {
                const pointDirection = ap.transformedPoint.pixelCoordinate.clone().sub(start);
                // y-coordinate (perpendicular) from the axis
                const signedDistance = pointDirection.dot(normal);
                // x-coordinate (parallel) on the axis
                const lineSegmentParameter = pointDirection.dot(axis);
                const roundTo = 1;
                return {
                    ...ap,
                    axisCoordinate: ap.transformedPoint.cameraSpaceCoordinate.dot(axis),
                    lineCoord: new Vector3(lineSegmentParameter, signedDistance, 0),
                    lineCoordRounded: new Vector3(Math.round(lineSegmentParameter / roundTo) * roundTo, Math.round(signedDistance / roundTo) * roundTo, 0),
                };
            }).sort((a, b) => a.lineCoord._y - b.lineCoord._y);
            const roundedDistancesSet = new Set(annotablePointsWithSignedDistancesAndParametersOfLineSegments.map(ap => ap.lineCoordRounded._y));

            const alreadyUsed: string[] = alreadyUsedSignatures || [];
            let lineIndex = 0;
            const lineSpacing = 50;
            // split them by their rounded distance to show the levels of the annotable lines
            roundedDistancesSet.forEach(rd => {
                const pointsWithSameRoundedDistance = annotablePointsWithSignedDistancesAndParametersOfLineSegments.filter(ap => ap.lineCoordRounded._y === rd).sort((a, b) => a.lineCoord._x - b.lineCoord._x);

                const axialCoordsUnique = pointsWithSameRoundedDistance
                    .map(ap => { return { x: ap.lineCoord._x, realX: ap.axisCoordinate, roundedX: ap.lineCoordRounded._x } })
                    .sort((a, b) => a.x - b.x)
                    .filter((coord, index, self) => index === 0 || (Math.abs(coord.x - self[index - 1].x) > 0.1)); // filter out points that have the same rounded x coordinate to avoid overlapping annotation points on the same axis position

                const signature = axialCoordsUnique.map(c => c.x.toFixed(1)).join(',');

                if (axialCoordsUnique.length < 2 || alreadyUsed.includes(signature)) {
                    return;
                }
                const signatureSupersets = alreadyUsed.filter(s => s.includes(signature));
                if (signatureSupersets.length > 0) {
                    return;
                }

                alreadyUsed.push(signature);
                const minX = axialCoordsUnique[0].x;
                const maxX = axialCoordsUnique[axialCoordsUnique.length - 1].x;

                // line from minX to maxX at the distance rd from the axis
                const lineDistance = transformToEdge ? (++lineIndex * lineSpacing) : rd;
                const startPoint = start.clone().add(axis.clone().multiply(minX)).add(normal.clone().multiply(lineDistance));
                const endPoint = start.clone().add(axis.clone().multiply(maxX)).add(normal.clone().multiply(lineDistance));

                SVGHelper.createSvgLineElement({
                    parent: annotationsRoot,
                    startX: startPoint._x,
                    startY: startPoint._y,
                    endX: endPoint._x,
                    endY: endPoint._y,
                    properties: { ...thickLineStyle },
                });

                if (axialCoordsUnique.length > 1) {
                    axialCoordsUnique.forEach((xCoord, index) => {
                        if (index === 0) { return; }
                        const prev = axialCoordsUnique[index - 1];
                        const realLength = Math.abs(xCoord.realX - prev.realX);
                        if (realLength < 1) { return; }

                        const segmentStart = start.clone().add(axis.clone().multiply(prev.x)).add(normal.clone().multiply(lineDistance));
                        const segmentEnd = start.clone().add(axis.clone().multiply(xCoord.x)).add(normal.clone().multiply(lineDistance));
                        SVGHelper.createSvgLineElementWithText({
                            parent: annotationsRoot,
                            startX: segmentStart._x,
                            startY: segmentStart._y,
                            endX: segmentEnd._x,
                            endY: segmentEnd._y,
                            textOffset: normal.clone().multiply(0),
                            textContent: realLength.toFixed(0),
                            lineProperties: {
                                ...thinLineStyle,
                                ...arrowLineStyle,
                                stroke: 'green',
                            },
                            textProperties: {
                                ...textStyle,
                                flipIfUpsideDown: true, // flip the text if it would be upside down
                                fill: 'green',
                            },
                        });
                    });
                }

            });

        }
        void drawAnnotablePointInAxis;

        const usedHorizontalSignatures: string[] = [], usedVerticalSignatures: string[] = [];
        void usedHorizontalSignatures;
        void usedVerticalSignatures;
        // drawAnnotablePointInAxis(new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, -1, 0), [...quadrants[2], ...quadrants[3]], true, usedHorizontalSignatures);
        // drawAnnotablePointInAxis(new Vector3(0, this.sceneRender.imageHeight, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0), [...quadrants[0], ...quadrants[1]], true, usedHorizontalSignatures);
        // drawAnnotablePointInAxis(new Vector3(0, 0, 0), new Vector3(0, 1, 0), new Vector3(-1, 0, 0), [...quadrants[1], ...quadrants[2]], true, usedHorizontalSignatures);
        // drawAnnotablePointInAxis(new Vector3(this.sceneRender.imageWidth, 0, 0), new Vector3(0, 1, 0), new Vector3(1, 0, 0), [...quadrants[3], ...quadrants[0]], true, usedHorizontalSignatures);



        //drawAnnotablePointInAxis(new Vector3(-100, 0, 0), new Vector3(0, 1, 0), new Vector3(-1, 0, 0), this._annotablePoints, true, usedVerticalSignatures);



        // annotationsRoot - sort text so that texts are last to be rendered and therefore on top of all other elements
        const sortedAnnotationsRoot = SVGHelper.createSvgGroupElement({ parent: svgRoot });
        Array.from(annotationsRoot.childNodes).sort((a, b) => {
            if (a.nodeName === 'text' && b.nodeName !== 'text') {
                return 1;
            } else if (a.nodeName !== 'text' && b.nodeName === 'text') {
                return -1;
            } else {
                return 0;
            }
        }).forEach(node => sortedAnnotationsRoot.appendChild(node));

        svgRoot.appendChild(sortedAnnotationsRoot);


        svgRoot.setAttribute("viewBox", `${-marginLeft} ${-marginUp} ${this.sceneRender.imageWidth + marginLeft + marginRight} ${this.sceneRender.imageHeight + marginDown + marginUp}`); // Default, or you can use actual image size if available
        return svgRoot;
    }

}