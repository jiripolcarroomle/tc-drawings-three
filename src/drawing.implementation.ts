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

        let margin = 0;


        svgRoot.setAttribute("width", (this.sceneRender.imageWidth / 2).toString());
        svgRoot.setAttribute("height", (this.sceneRender.imageHeight / 2).toString());
        svgRoot.setAttribute("viewBox", `${-margin} ${-margin} ${this.sceneRender.imageWidth + 2 * margin} ${this.sceneRender.imageHeight + 2 * margin}`); // Default, or you can use actual image size if available



        // add the image
        const imageElement = document.createElementNS("http://www.w3.org/2000/svg", "image");
        imageElement.setAttribute("href", this.sceneRender.image.dataUrl);
        imageElement.setAttribute("width", this.sceneRender.imageWidth.toString());
        imageElement.setAttribute("height", this.sceneRender.imageHeight.toString());
        svgRoot.appendChild(imageElement);

        const directAnnotations = this._annotations.filter(a => !a.annotation.shouldGoToAnnotationLine);

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
            const start = annotation.start.clone().applyMatrix4(transform).applyMatrix4(this.worldToViewMatrix);
            const end = annotation.end.clone().applyMatrix4(transform).applyMatrix4(this.worldToViewMatrix);
            const label = annotation.label || start.distanceTo(end).toFixed(0);

            line.setAttribute("x1", start._x.toString());
            line.setAttribute("y1", start._y.toString());
            line.setAttribute("x2", end._x.toString());
            line.setAttribute("y2", end._y.toString());
            line.setAttribute("stroke", "green");
            line.setAttribute("stroke-width", "2");
            svgRoot.appendChild(line);

            if (label) {
                const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                text.setAttribute("x", ((start._x + end._x) / 2).toString());
                text.setAttribute("y", ((start._y + end._y) / 2).toString());
                text.setAttribute("fill", "green");
                text.textContent = label;
                svgRoot.appendChild(text);
            }
        }

        return svgRoot;
    }

}