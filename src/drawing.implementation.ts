import { DrawingDirection, type AnnotablePoint, type Annotation, type IPlanSvgDrawing, type SvgInjectionData } from "./drawing.interface";
import type { IRenderOrthoCameraResult } from "./orderdrawingrenderer.interface";
import { Matrix4 } from "./tc/base";


export class Drawing implements IPlanSvgDrawing {

    _options: any;
    private _renderResult: IRenderOrthoCameraResult;

    constructor(renderResult: IRenderOrthoCameraResult, options?: any) {
        this._renderResult = renderResult;
        this._options = options;
    }

    get worldToViewMatrix(): Matrix4 {
        return this._renderResult.worldToViewMatrix;
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
    _annotations: { transform: Matrix4, annotation: Annotation }[] = [];
    _annotablePoints: { transform: Matrix4, point: AnnotablePoint }[] = [];

    addAnnotation(worldTransform: Matrix4, annotation: Annotation): void {
        const copy = { ...annotation };
        this._annotations.push({ transform: worldTransform, annotation: copy });
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
        const viewRotationMatrix = new Matrix4().extractRotation(this.worldToViewMatrix);

        let marginDown = 0, marginUp = 0, marginLeft = 0, marginRight = 0; // you can adjust margins as needed





        // add the image
        const imageElement = document.createElementNS("http://www.w3.org/2000/svg", "image");
        imageElement.setAttribute("href", this.sceneRender.image.dataUrl);
        imageElement.setAttribute("width", this.sceneRender.imageWidth.toString());
        imageElement.setAttribute("height", this.sceneRender.imageHeight.toString());
        svgRoot.appendChild(imageElement);

        const directAnnotations = this._annotations.filter(a => !a.annotation.shouldGoToAnnotationLine);

        const annotablePointsOnHorizontal = this._annotablePoints
            .filter(p => !p.point.notHorizontal)
            .map(p => ({
                inWorld: p,
                inDrawing: p.point.coordinate.clone().applyMatrix4(p.transform).applyMatrix4(this.worldToViewMatrix)
            }))
            .sort((a, b) => a.inDrawing._x - b.inDrawing._x)
            ;
        const annotablePointsOnVertical = this._annotablePoints
            .filter(p => !p.point.notVertical)
            .map(p => ({
                inWorld: p,
                inDrawing: p.point.coordinate.clone().applyMatrix4(p.transform).applyMatrix4(this.worldToViewMatrix)
            }))
            .sort((a, b) => a.inDrawing._y - b.inDrawing._y)
            ;

        const annotationLineHeight = 100;
        if (annotablePointsOnHorizontal.length + annotablePointsOnVertical.length > 0) {
            marginDown += annotationLineHeight; // add margin for annotation lines if there are any annotable points
        }

        if (annotablePointsOnHorizontal.length > 0) {

            const yCoords = [...annotablePointsOnHorizontal
                .map(({ inDrawing }) => inDrawing._y)
                // round to reasonable precision
                .map(y => Math.round(y * 100) / 100)
                // unique
                .filter((value, index, self) => self.indexOf(value) === index)
                // sort descending
                .sort((a, b) => b - a)
            ];

            yCoords.forEach((y) => {

                const annotablePointsOnThisLine = annotablePointsOnHorizontal
                    .filter(p => Math.round(p.inDrawing._y * 100) / 100 === y)
                    .sort((a, b) => a.inDrawing._x - b.inDrawing._x)
                    .map(p => {
                        return {
                            worldX: p.inWorld.point,
                            drawingX: p.inDrawing._x
                        }
                    });

                if (annotablePointsOnThisLine.length < 2) {
                    return; // Skip rendering if there are less than 2 points on this line
                }

                marginDown += annotationLineHeight; // add margin for each annotation line
                const horizontalLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
                horizontalLine.setAttribute("x1", '0');
                horizontalLine.setAttribute("y1", (this.sceneRender.imageHeight + marginDown).toString());
                horizontalLine.setAttribute("x2", this.sceneRender.imageWidth.toString());
                horizontalLine.setAttribute("y2", (this.sceneRender.imageHeight + marginDown).toString());
                horizontalLine.setAttribute("stroke", "magenta");
                horizontalLine.setAttribute("stroke-width", "2");
                svgRoot.appendChild(horizontalLine);

                annotablePointsOnThisLine.forEach((p, index) => {
                    const vertialTick = document.createElementNS("http://www.w3.org/2000/svg", "line");
                    vertialTick.setAttribute("x1", p.drawingX.toString());
                    vertialTick.setAttribute("y1", (this.sceneRender.imageHeight + marginDown + 10).toString());
                    vertialTick.setAttribute("x2", p.drawingX.toString());
                    vertialTick.setAttribute("y2", (this.sceneRender.imageHeight + marginDown - 10).toString());
                    vertialTick.setAttribute("stroke", "magenta");
                    vertialTick.setAttribute("stroke-width", "2");
                    svgRoot.appendChild(vertialTick);

                    if (index !== 0) {
                        const prev = annotablePointsOnThisLine[index - 1];
                        const projectedPoint = p.worldX.coordinate.clone().applyMatrix4(viewRotationMatrix);
                        const projectedPrev = prev.worldX.coordinate.clone().applyMatrix4(viewRotationMatrix);
                        const distanceProjectedInDrawingPlane = Math.hypot(
                            projectedPoint._x - projectedPrev._x,
                            projectedPoint._y - projectedPrev._y,
                        );
                        if (distanceProjectedInDrawingPlane < 1) {
                            return; // Skip rendering if the annotation is too small to be visible
                        }
                        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
                        const labelDrawingSize = p.drawingX - prev.drawingX;
                        const labelXCoord = prev.drawingX + labelDrawingSize / 2;
                        label.setAttribute("x", labelXCoord.toString());
                        label.setAttribute("y", (this.sceneRender.imageHeight + marginDown - annotationLineHeight / 2).toString());
                        label.setAttribute("fill", "black");
                        label.setAttribute("font-size", "30");
                        label.textContent = distanceProjectedInDrawingPlane.toFixed(0);
                        svgRoot.appendChild(label);
                    }
                });




            });



        }

        for (const { transform, point } of this._annotablePoints) {
            const radius = 5;
            const svgCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            const transformedCoord = point.coordinate.clone().applyMatrix4(transform).applyMatrix4(this.worldToViewMatrix);
            svgCircle.setAttribute("cx", transformedCoord._x.toString());
            svgCircle.setAttribute("cy", transformedCoord._y.toString());
            svgCircle.setAttribute("r", radius.toString());
            svgCircle.setAttribute("fill", "blue");
            svgRoot.appendChild(svgCircle);
        }

        for (const { transform, svgInjection } of this._svgOverlays) {
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            const transformedPathData = svgInjection.path.map(cmd => {
                if (cmd.coordinate3d) {
                    const transformedCoord = cmd.coordinate3d.clone().applyMatrix4(transform).applyMatrix4(this.worldToViewMatrix);
                    return { ...cmd, coordinate3d: transformedCoord };
                }
                return cmd;
            });
            const d = transformedPathData.map(cmd => {
                if (cmd.command === 'Z') {
                    return 'Z';
                } else if (cmd.coordinate3d) {
                    return `${cmd.command} ${cmd.coordinate3d._x} ${cmd.coordinate3d._y}`;
                }
                return '';
            }).join(' ');
            path.setAttribute("d", d);
            if (svgInjection.fill) {
                path.setAttribute("fill", svgInjection.fill);
            } else {
                path.setAttribute("fill", "none");
            } if (svgInjection.stroke) {
                path.setAttribute("stroke", svgInjection.stroke);
            } else {
                path.setAttribute("stroke", "black");
            }
            if (svgInjection['stroke-width']) {
                path.setAttribute("stroke-width", svgInjection['stroke-width']);
            } else {
                path.setAttribute("stroke-width", "1");
            }
            if (svgInjection['stroke-dasharray']) {
                path.setAttribute("stroke-dasharray", svgInjection['stroke-dasharray']);
            }
            svgRoot.appendChild(path);
        }

        for (const { transform, annotation } of directAnnotations) {
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            const start2d = annotation.start.clone().applyMatrix4(transform).applyMatrix4(this.worldToViewMatrix);
            const end2d = annotation.end.clone().applyMatrix4(transform).applyMatrix4(this.worldToViewMatrix);
            const pointsDistance3d = annotation.start.distanceTo(annotation.end);
            const pointsDistance2d = start2d.distanceTo(end2d);

            if (pointsDistance2d < 1) {
                continue; // Skip rendering if the annotation is too small to be visible
            }



            const label = annotation.label || pointsDistance3d.toFixed(0);

            line.setAttribute("x1", start2d._x.toString());
            line.setAttribute("y1", start2d._y.toString());
            line.setAttribute("x2", end2d._x.toString());
            line.setAttribute("y2", end2d._y.toString());
            line.setAttribute("stroke", "green");
            line.setAttribute("stroke-width", "2");
            svgRoot.appendChild(line);

            if (label) {
                const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                text.setAttribute("x", ((start2d._x + end2d._x) / 2).toString());
                text.setAttribute("y", ((start2d._y + end2d._y) / 2).toString());
                text.setAttribute("fill", "green");
                text.textContent = label;
                svgRoot.appendChild(text);
            }
        }


        svgRoot.setAttribute("width", (this.sceneRender.imageWidth / 2).toString());
        svgRoot.setAttribute("height", (this.sceneRender.imageHeight / 2).toString());
        svgRoot.setAttribute("viewBox", `${-marginLeft} ${-marginUp} ${this.sceneRender.imageWidth + marginLeft + marginRight} ${this.sceneRender.imageHeight + marginDown + marginUp}`); // Default, or you can use actual image size if available
        return svgRoot;
    }

}