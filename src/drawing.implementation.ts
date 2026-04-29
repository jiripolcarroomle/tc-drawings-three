import { DrawingDirection, type AnnotablePoint, type Annotation, type IPlanSvgDrawing, type SvgPathInjectionData } from "./drawing.interface";
import type { IRenderOrthoCameraResult } from "./orderdrawingrenderer.interface";
import { Matrix4, Vector3 } from "./tc/base";
import * as SVGHelper from "./svghelper";

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
    _annotations: { annotation: Annotation, startPoint: TransformedPoint, endPoint: TransformedPoint }[] = [];
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
        this._annotations.push({ annotation, startPoint, endPoint });
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

    render(): SVGElement {
        // Implementation for rendering the final SVG element
        const svgRoot = SVGHelper.createSvgRootElement(this.sceneRender.imageWidth / 2, this.sceneRender.imageHeight / 2);

        const baseMargin = 300;
        let marginDown = baseMargin, marginUp = baseMargin, marginLeft = baseMargin, marginRight = baseMargin; // you can adjust margins as needed

        // add the image
        SVGHelper.createSvgImageElement(svgRoot, this.sceneRender.image.dataUrl, this.sceneRender.imageWidth, this.sceneRender.imageHeight);

        const annotationsRoot = SVGHelper.createSvgGroupElement(svgRoot);

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
            const options = { ...svgInjection } as any;
            delete options.d;
            SVGHelper.createSvgPathElement(svgRoot, pathD, options);
        });

        // render annotations on top of the rendered image and svg overlays
        this._annotations.forEach(({ annotation, startPoint, endPoint }) => {
            const drawingLength = startPoint.pixelCoordinate.distanceTo(endPoint.pixelCoordinate);
            const projectedLength = new Vector3(startPoint.cameraSpaceCoordinate._x, startPoint.cameraSpaceCoordinate._y, 0).distanceTo(new Vector3(endPoint.cameraSpaceCoordinate._x, endPoint.cameraSpaceCoordinate._y, 0));
            const realLength = startPoint.worldCoordinate.distanceTo(endPoint.worldCoordinate);

            if (drawingLength < 1) {
                console.log('annotation too small to render, skipping', { annotation, startPoint, endPoint });
                return;
            }
            if (projectedLength < realLength * 0.01) {
                console.log('annotation too foreshortened to render, skipping', { annotation, startPoint, endPoint });
                return;
            }


            const distanceFromFeature = annotation.distance ?? 0;
            const transformedDistanceFromFeature = distanceFromFeature * (drawingLength / realLength);

            // compute azimuth of the annotation on the drawing to decide where to put the label and annotation line
            const annotationDirection = new Vector3(endPoint.pixelCoordinate._x - startPoint.pixelCoordinate._x, endPoint.pixelCoordinate._y - startPoint.pixelCoordinate._y, 0).normalize();
            const normalDirection = new Vector3(annotationDirection._y, -annotationDirection._x, 0);


            const annotationLineDrawingStart = startPoint.pixelCoordinate.clone().add(normalDirection.clone().multiply(transformedDistanceFromFeature));
            const annotationLineDrawingEnd = endPoint.pixelCoordinate.clone().add(normalDirection.clone().multiply(transformedDistanceFromFeature));


            const annotationLine = SVGHelper.createSvgLineElementWithText(
                annotationsRoot,
                annotationLineDrawingStart._x, annotationLineDrawingStart._y,
                annotationLineDrawingEnd._x, annotationLineDrawingEnd._y,
                annotation.label ?? realLength.toFixed(0),
                { stroke: "green", strokeWidth: 2, },
                {
                    fill: "green",
                    fontSize: 24,
                    fontFamily: "Arial",
                    textAnchor: "middle",
                    stroke: "white",
                    strokeWidth: 10,
                    strokeLinejoin: "round",
                    paintOrder: "stroke",
                    alignmentBaseline: "middle",
                    flipIfUpsideDown: true,
                },
            );


            if (Math.abs(transformedDistanceFromFeature) > 2) {
                const ticks = SVGHelper.createSvgPathElement(annotationsRoot, `M ${startPoint.pixelCoordinate._x} ${startPoint.pixelCoordinate._y} L ${annotationLineDrawingStart._x} ${annotationLineDrawingStart._y} M ${endPoint.pixelCoordinate._x} ${endPoint.pixelCoordinate._y} L ${annotationLineDrawingEnd._x} ${annotationLineDrawingEnd._y}`, { stroke: "lightgreen", strokeWidth: 1 });
            }

        });

        this._annotablePoints.forEach(({ transformedPoint, point }) => {
            SVGHelper.createSvgCircleElement(annotationsRoot, transformedPoint.pixelCoordinate._x, transformedPoint.pixelCoordinate._y, 15, { fill: "red" });
        });
        /* */

        // split the AnnotablePoints into 4 quarants of the drawing based on the camera space coordinates to decide where to put the annotation points
        // 1. top right (x positive, y negative), 2. top left (x negative, y negative), 3. bottom left (x negative, y positive), 4. bottom right (x positive, y positive)
        // therefore top half = 1 and 2, left half = 2 and 3
        const quadrants = [[], [], [], []] as { transformedPoint: TransformedPoint, point: AnnotablePoint }[][];
        const drawingCenterX = this.sceneRender.imageWidth / 2;
        const drawingCenterY = this.sceneRender.imageHeight / 2;
        this._annotablePoints.forEach(({ transformedPoint, point }) => {
            const xPositive = transformedPoint.cameraSpaceCoordinate._x - drawingCenterX > 0;
            const yPositive = transformedPoint.cameraSpaceCoordinate._y - drawingCenterY > 0;
            if (xPositive && !yPositive) {
                quadrants[0].push({ transformedPoint, point });
            } else if (!xPositive && !yPositive) {
                quadrants[1].push({ transformedPoint, point });
            } else if (!xPositive && yPositive) {
                quadrants[2].push({ transformedPoint, point });
            } else {
                quadrants[3].push({ transformedPoint, point });
            }
        });

        function drawAnnotablePointInAxis(axis: Vector3, annotablePoints: AnnotablePointTransformed[], debugColor: string = "green") {
            const start = new Vector3(0, 0, 0);
            const normalizedAxis = axis.clone().normalize();
            const normal = new Vector3(-axis._y, axis._x, 0).normalize();

            // compute coordinates of the annotable points in a coordinate system where the start of the axis is the origin and the axis direction is the x-axis, 
            // therefore we get the distance of the annotable point from the axis (y-coordinate) and the parameter on the axis (x-coordinate)
            const annotablePointsWithSignedDistancesAndParametersOfLineSegments = annotablePoints.map(ap => {
                const pointDirection = ap.transformedPoint.pixelCoordinate.clone().sub(start);
                // y-coordinate (perpendicular) from the axis
                const signedDistance = pointDirection.dot(normal);
                // x-coordinate (parallel) on the axis
                const lineSegmentParameter = pointDirection.dot(normalizedAxis);
                const roundTo = 1;
                return {
                    ...ap,
                    axisCoordinate: ap.transformedPoint.cameraSpaceCoordinate.dot(normalizedAxis),
                    lineCoord: new Vector3(lineSegmentParameter, signedDistance, 0),
                    lineCoordRounded: new Vector3(Math.round(lineSegmentParameter / roundTo) * roundTo, Math.round(signedDistance / roundTo) * roundTo, 0),
                };
            }).sort((a, b) => a.lineCoord._y - b.lineCoord._y);
            const roundedDistancesSet = new Set(annotablePointsWithSignedDistancesAndParametersOfLineSegments.map(ap => ap.lineCoordRounded._y));

            const alreadyUsed: string[] = [];
            // split them by their rounded distance to show the levels of the annotable lines
            roundedDistancesSet.forEach(rd => {
                const pointsWithSameRoundedDistance = annotablePointsWithSignedDistancesAndParametersOfLineSegments.filter(ap => ap.lineCoordRounded._y === rd).sort((a, b) => a.lineCoord._x - b.lineCoord._x);

                const axialCoordsUnique = pointsWithSameRoundedDistance
                    .map(ap => { return { x: ap.lineCoord._x, realX: ap.axisCoordinate, roundedX: ap.lineCoordRounded._x } })
                    .sort((a, b) => a.x - b.x)
                    .filter((coord, index, self) => index === 0 || coord.x !== self[index - 1].x); // filter out points that have the same rounded x coordinate to avoid overlapping annotation points on the same axis position

                const signature = axialCoordsUnique.map(c => c.x.toFixed(1)).join(',');

                if (axialCoordsUnique.length < 2 || alreadyUsed.includes(signature)) {
                    return;
                }
                alreadyUsed.push(signature);
                const minX = axialCoordsUnique[0].x;
                const maxX = axialCoordsUnique[axialCoordsUnique.length - 1].x;

                // line from minX to maxX at the distance rd from the axis

                const startPoint = start.clone().add(normalizedAxis.clone().multiply(minX)).add(normal.clone().multiply(rd));
                const endPoint = start.clone().add(normalizedAxis.clone().multiply(maxX)).add(normal.clone().multiply(rd));

                SVGHelper.createSvgLineElement(annotationsRoot, startPoint._x, startPoint._y, endPoint._x, endPoint._y, { stroke: debugColor, strokeWidth: 5 });

                if (axialCoordsUnique.length > 1) {
                    axialCoordsUnique.forEach((xCoord, index) => {
                        if (index === 0) { return; }
                        const prev = axialCoordsUnique[index - 1];
                        const realLength = Math.abs(xCoord.realX - prev.realX);
                        const textPos = startPoint.clone().add(normalizedAxis.clone().multiply((xCoord.x + prev.x) / 2 - minX));
                        SVGHelper.createSvgTextElement(annotationsRoot, textPos._x, textPos._y, realLength.toFixed(0), {
                            fill: debugColor,
                            fontSize: 24,
                            textAnchor: "middle",
                            alignmentBaseline: "middle",
                            stroke: "white",
                            strokeWidth: 10,
                            strokeLinejoin: "round",
                            paintOrder: "stroke",
                            rotationAngle: Math.atan2(endPoint._y - startPoint._y, endPoint._x - startPoint._x) * 180 / Math.PI, // rotate the text to be parallel with the axis
                            flipIfUpsideDown: true, // flip the text if it would be upside down
                        });
                    });
                }

            });

        }


        drawAnnotablePointInAxis(new Vector3(1, 0, 0), this._annotablePoints, "black");
        drawAnnotablePointInAxis(new Vector3(0, 1, 0), this._annotablePoints, "blue");



        // annotationsRoot - sort text so that texts are last to be rendered and therefore on top of all other elements
        const sortedAnnotationsRoot = SVGHelper.createSvgGroupElement(svgRoot);
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