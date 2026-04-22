import { DrawingDirection, type Annotation, type IPlanSvgDrawing, type SvgInjectionData } from "./drawing.interface";
import type { IRenderOrthoCameraResult } from "./orderdrawingrenderer.interface";
import { Matrix4, Vector3 } from "./tc/base";


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

    // internal storage of the annotations etc.
    _svgObjects: { worldTransform: Matrix4, svgInjection: SVGElement }[] = [];
    _annotations: Annotation[] = [];

    /**
     * Adds a general SVG object at a given position to the drawing.
     * @param worldTransform The owner module's world matrix.
     * @param svgInjection The SVG element to be added to the drawing. Since this is a direct injection of the SVG elemnent, world or drawing matrix won't apply to it.
     */
    addSvgObject(worldTransform: Matrix4, svgInjection: SVGElement): void {
        const drawingTransform = this.worldToViewMatrix.clone().multiply(worldTransform);
        const svgGroupObject = document.createElementNS("http://www.w3.org/2000/svg", "g");
        // apply the drawing transform to the group element
        const e = drawingTransform.elements;
        svgGroupObject.setAttribute("transform", `matrix(${e[0]}, ${e[1]}, ${e[4]}, ${e[5]}, ${e[12]}, ${e[13]})`);
        svgGroupObject.appendChild(svgInjection);
        this._svgObjects.push({ worldTransform, svgInjection: svgGroupObject });
    }

    addAnnotation(worldTransform: Matrix4, annotation: Annotation): void {
        const drawingTransform = this.worldToViewMatrix.clone().multiply(worldTransform);
        const annotationCopy = { ...annotation };
        annotationCopy.start = annotation.start.clone().applyMatrix4(drawingTransform);
        annotationCopy.end = annotation.end.clone().applyMatrix4(drawingTransform);
        annotationCopy.label = annotation.label || annotation.start.distanceTo(annotation.end).toFixed(0);
        this._annotations.push(annotationCopy);
    }

    addOverlay(worldTransform: Matrix4, svgInjection: SvgInjectionData): void {
        const drawingTransform = this.worldToViewMatrix.clone().multiply(worldTransform);
        const svgPathObject = document.createElementNS("http://www.w3.org/2000/svg", "path");
        if (svgInjection.fill) { svgPathObject.setAttribute("fill", svgInjection.fill); }
        if (svgInjection.stroke) { svgPathObject.setAttribute("stroke", svgInjection.stroke); }
        if (svgInjection['stroke-dasharray']) { svgPathObject.setAttribute("stroke-dasharray", svgInjection['stroke-dasharray']); }
        if (svgInjection['stroke-width']) { svgPathObject.setAttribute("stroke-width", svgInjection['stroke-width']); }
        let path = "";
        for (const command of svgInjection.path) {
            if (command.command === 'Z') {
                path += "Z ";
            }
            else {
                const coord = command.coordinate3d!;
                const drawingCoord = new Vector3(coord._x, coord._y, coord._z).applyMatrix4(drawingTransform);
                path += `${command.command} ${drawingCoord._x} ${drawingCoord._y} `;
            }
        }
        svgPathObject.setAttribute("d", path);
        // put the overlay objects first
        this._svgObjects.unshift({ worldTransform, svgInjection: svgPathObject });
    }

    render(): SVGElement {
        // Implementation for rendering the final SVG element
        const svgRoot = document.createElementNS("http://www.w3.org/2000/svg", "svg");

        svgRoot.setAttribute("width", (this.sceneRender.imageWidth / 2).toString());
        svgRoot.setAttribute("height", (this.sceneRender.imageHeight / 2).toString());
        svgRoot.setAttribute("viewBox", `0 0 ${this.sceneRender.imageWidth} ${this.sceneRender.imageHeight}`); // Default, or you can use actual image size if available

        // add the image
        const imageElement = document.createElementNS("http://www.w3.org/2000/svg", "image");
        imageElement.setAttribute("href", this.sceneRender.image.dataUrl);
        imageElement.setAttribute("width", this.sceneRender.imageWidth.toString());
        imageElement.setAttribute("height", this.sceneRender.imageHeight.toString());
        svgRoot.appendChild(imageElement);

        // Append all SVG objects to the root
        for (const obj of this._svgObjects) {
            svgRoot.appendChild(obj.svgInjection);
        }

        const directAnnotations = this._annotations.filter(a => !a.shouldGoToAnnotationLine);

        for (const annotation of directAnnotations) {
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", annotation.start._x.toString());
            line.setAttribute("y1", annotation.start._y.toString());
            line.setAttribute("x2", annotation.end._x.toString());
            line.setAttribute("y2", annotation.end._y.toString());
            line.setAttribute("stroke", "green");
            line.setAttribute("stroke-width", "2");
            svgRoot.appendChild(line);

            if (annotation.label) {
                const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                text.setAttribute("x", ((annotation.start._x + annotation.end._x) / 2).toString());
                text.setAttribute("y", ((annotation.start._y + annotation.end._y) / 2).toString());
                text.setAttribute("fill", "green");
                text.textContent = annotation.label;
                svgRoot.appendChild(text);
            }
        }

        return svgRoot;
    }

}