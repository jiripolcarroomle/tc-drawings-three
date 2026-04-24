import { DrawingDirection, type AnnotablePoint, type Annotation, type IPlanSvgDrawing, type SvgInjectionData } from "./drawing.interface";
import type { IRenderOrthoCameraResult } from "./orderdrawingrenderer.interface";
import { Matrix4, Vector3 } from "./tc/base";

/**
 * Upon pushing data into the drawing, the coordinates are transformed into world, camera and pixel coodinates.
 * We need all three coordinate sets for different purposes:
 *    - world coordinates for knowing actual distances that we show in the drawing
 *    - camera coordinates for calculating which annotations are near, far and to be able to sort them by their distance to the drawing edges
 *    - pixel coordinates for rendering the SVG elements in the right place
 */
interface TransformedPoint {
    worldCoordinate: Vector3;
    cameraSpaceCoordinate: Vector3;
    pixelCoordinate: Vector3;
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



    _svgOverlays: { transform: Matrix4, svgInjection: SvgInjectionData }[] = [];
    _annotations: { annotation: Annotation, startPoint: TransformedPoint, endPoint: TransformedPoint }[] = [];
    _annotablePoints: { transform: Matrix4, point: AnnotablePoint }[] = [];

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

    addOverlay(worldTransform: Matrix4, svgInjection: SvgInjectionData): void {
        const copy = { ...svgInjection };
        this._svgOverlays.unshift({ transform: worldTransform, svgInjection: copy });
    }

    addAnnotablePoint(worldTransform: Matrix4, point: AnnotablePoint): void {
        const copy = { ...point };
        this._annotablePoints.push({ transform: worldTransform, point: copy });
    }

    render(): SVGElement {
        // Implementation for rendering the final SVG element
        const svgRoot = document.createElementNS("http://www.w3.org/2000/svg", "svg");

        const baseMargin = 400;
        let marginDown = baseMargin, marginUp = baseMargin, marginLeft = baseMargin, marginRight = baseMargin; // you can adjust margins as needed

        // add the image
        const imageElement = document.createElementNS("http://www.w3.org/2000/svg", "image");
        imageElement.setAttribute("href", this.sceneRender.image.dataUrl);
        imageElement.setAttribute("width", this.sceneRender.imageWidth.toString());
        imageElement.setAttribute("height", this.sceneRender.imageHeight.toString());
        svgRoot.appendChild(imageElement);

        const annotationsRoot = document.createElementNS("http://www.w3.org/2000/svg", "g");

        this._svgOverlays.forEach(({ transform, svgInjection }) => { 
            const pathElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
            const pathData = svgInjection.path.map(cmd => {
                if (cmd.command === 'Z') {
                    return 'Z';
                } else if (cmd.coordinate3d) {
                    const transformedCoordinate = cmd.coordinate3d.clone().applyMatrix4(transform).applyMatrix4(this._renderResult.worldToPixelMatrix);
                    return `${cmd.command} ${transformedCoordinate._x} ${transformedCoordinate._y}`;
                } else {
                    return '';
                }
            }).join(' ');
            pathElement.setAttribute("d", pathData);
            if (svgInjection.fill) {
                pathElement.setAttribute("fill", svgInjection.fill);
            } else {
                pathElement.setAttribute("fill", "none");
            }
            if (svgInjection.stroke) {
                pathElement.setAttribute("stroke", svgInjection.stroke);
            }
            if (svgInjection['stroke-dasharray']) {
                pathElement.setAttribute("stroke-dasharray", svgInjection['stroke-dasharray']);
            }
            if (svgInjection['stroke-width']) {
                pathElement.setAttribute("stroke-width", svgInjection['stroke-width']);
            }
            annotationsRoot.appendChild(pathElement);

        });

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

            const annotationLine = document.createElementNS("http://www.w3.org/2000/svg", "line");

            const annotationLineDrawingStart = startPoint.pixelCoordinate.clone().add(normalDirection.clone().multiply(transformedDistanceFromFeature));
            const annotationLineDrawingEnd = endPoint.pixelCoordinate.clone().add(normalDirection.clone().multiply(transformedDistanceFromFeature));

            annotationLine.setAttribute("x1", annotationLineDrawingStart._x.toString());
            annotationLine.setAttribute("y1", annotationLineDrawingStart._y.toString());
            annotationLine.setAttribute("x2", annotationLineDrawingEnd._x.toString());
            annotationLine.setAttribute("y2", annotationLineDrawingEnd._y.toString());
            annotationLine.setAttribute("stroke", "black");
            annotationLine.setAttribute("stroke-width", "2");

            annotationsRoot.appendChild(annotationLine);

            if (transformedDistanceFromFeature > 0) {
                const ticks = document.createElementNS("http://www.w3.org/2000/svg", "path");
                ticks.setAttribute("d", `M ${startPoint.pixelCoordinate._x} ${startPoint.pixelCoordinate._y} L ${annotationLineDrawingStart._x} ${annotationLineDrawingStart._y} M ${endPoint.pixelCoordinate._x} ${endPoint.pixelCoordinate._y} L ${annotationLineDrawingEnd._x} ${annotationLineDrawingEnd._y}`);
                ticks.setAttribute("stroke", "gray");
                ticks.setAttribute("stroke-width", "1");
                annotationsRoot.appendChild(ticks);
            }

            const label = annotation.label ?? realLength.toFixed(0);
            const textElement = document.createElementNS("http://www.w3.org/2000/svg", "text");
            textElement.setAttribute("x", ((annotationLineDrawingStart._x + annotationLineDrawingEnd._x) / 2).toString());
            textElement.setAttribute("y", ((annotationLineDrawingStart._y + annotationLineDrawingEnd._y) / 2).toString());
            textElement.setAttribute("fill", "blue");
            textElement.setAttribute("font-size", "24");
            textElement.setAttribute("text-anchor", "middle");
            textElement.setAttribute("fill", "blue");
            textElement.setAttribute("stroke", "white");
            textElement.setAttribute("stroke-width", "10");
            textElement.setAttribute("stroke-linejoin", "round");
            textElement.setAttribute("paint-order", "stroke");
            textElement.setAttribute("alignment-baseline", "middle");
            //rotate in a way that label is always readable when looking from the bottom edge or the right edge of the drawing
            const angle = Math.atan2(annotationDirection._y, annotationDirection._x) * (180 / Math.PI);
            //
            const adjustedAngle = (angle > 45 || angle < -136) ? angle + 180 : angle;
            textElement.setAttribute("transform", `rotate(${adjustedAngle}, ${(annotationLineDrawingStart._x + annotationLineDrawingEnd._x) / 2}, ${(annotationLineDrawingStart._y + annotationLineDrawingEnd._y) / 2})`);
            textElement.textContent = label;
            annotationsRoot.appendChild(textElement);

        });

        const sortedAnnotationsRoot = document.createElementNS("http://www.w3.org/2000/svg", "g");
        // annotationsRoot - sort text so that texts are last
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


        svgRoot.setAttribute("width", (this.sceneRender.imageWidth / 2).toString());
        svgRoot.setAttribute("height", (this.sceneRender.imageHeight / 2).toString());
        svgRoot.setAttribute("viewBox", `${-marginLeft} ${-marginUp} ${this.sceneRender.imageWidth + marginLeft + marginRight} ${this.sceneRender.imageHeight + marginDown + marginUp}`); // Default, or you can use actual image size if available
        return svgRoot;
    }

}