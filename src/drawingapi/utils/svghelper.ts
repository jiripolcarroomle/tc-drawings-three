export function createSvgElement(tagName: string): SVGElement {
    return document.createElementNS("http://www.w3.org/2000/svg", tagName);
}

export interface SVGElementProperties {
    [attributeName: string]: any;
    id?: string | undefined;
    class?: string | undefined;
    className?: string | undefined;
    clipPath?: string | undefined;
    clipRule?: string | undefined;
    color?: string | undefined;
    colorInterpolation?: string | undefined;
    colorInterpolationFilters?: string | undefined;
    colorProfile?: string | undefined;
    colorRendering?: string | undefined;
    cursor?: string | undefined;
    direction?: string | undefined;
    display?: string | undefined;
    filter?: string | undefined;
    imageRendering?: string | undefined;
    mask?: string | undefined;
    opacity?: number | string | undefined;
    overflow?: string | undefined;
    pointerEvents?: string | undefined;
    shapeRendering?: string | undefined;
    textRendering?: string | undefined;
    transform?: string | undefined;
    transformOrigin?: string | undefined;
    visibility?: string | undefined;
}

export interface SVGPresentationProperties extends SVGElementProperties {
    alignmentBaseline?: string | undefined;
    baselineShift?: string | number | undefined;
    dominantBaseline?: string | undefined;
    fill?: string | undefined;
    fillOpacity?: number | string | undefined;
    fillRule?: string | undefined;
    fontFamily?: string | undefined;
    fontSize?: number | string | undefined;
    fontSizeAdjust?: number | string | undefined;
    fontStretch?: string | undefined;
    fontStyle?: string | undefined;
    fontVariant?: string | undefined;
    fontWeight?: number | string | undefined;
    letterSpacing?: number | string | undefined;
    paintOrder?: string | undefined;
    stroke?: string | undefined;
    strokeDasharray?: string | undefined;
    strokeDashoffset?: number | string | undefined;
    strokeLinecap?: string | undefined;
    strokeLinejoin?: string | undefined;
    strokeMiterlimit?: number | string | undefined;
    strokeOpacity?: number | string | undefined;
    strokeWidth?: number | string | undefined;
    textAnchor?: string | undefined;
    textDecoration?: string | undefined;
    vectorEffect?: string | undefined;
    wordSpacing?: number | string | undefined;
    writingMode?: string | undefined;
}

export interface SVGRootProperties extends SVGPresentationProperties {
    height?: number | string | undefined;
    preserveAspectRatio?: string | undefined;
    viewBox?: string | undefined;
    width?: number | string | undefined;
    x?: number | string | undefined;
    y?: number | string | undefined;
}

export interface SVGImageProperties extends SVGPresentationProperties {
    crossOrigin?: string | undefined;
    height?: number | string | undefined;
    href?: string | undefined;
    preserveAspectRatio?: string | undefined;
    width?: number | string | undefined;
    x?: number | string | undefined;
    xlinkHref?: string | undefined;
    y?: number | string | undefined;
}

export interface SVGPathProperties extends SVGPresentationProperties {
    markerEnd?: string | undefined;
    markerMid?: string | undefined;
    markerStart?: string | undefined;
    pathLength?: number | string | undefined;
}

export interface SVGMarkerProperties extends SVGPresentationProperties {
    markerWidth?: number | string | undefined;
    markerHeight?: number | string | undefined;
    refX?: number | string | undefined;
    refY?: number | string | undefined;
    orient?: string | undefined;
    markerUnits?: string | undefined;
    viewBox?: string | undefined;
    d?: string | undefined;
}

export interface SVGLineProperties extends SVGPathProperties {
    ticksAtEndsLength?: number,
    ticksStyle: SVGPathProperties,
}

export interface SVGGroupProperties extends SVGPresentationProperties {
}

export interface SVGTextProperties extends SVGPresentationProperties {
    dx?: number | string | undefined;
    dy?: number | string | undefined;
    lengthAdjust?: string | undefined;
    rotate?: number | string | undefined;
    rotationAngle?: number | undefined;
    flipIfUpsideDown?: boolean | undefined;
    textLength?: number | string | undefined;
}

export interface SVGCircleProperties extends SVGPathProperties {
    pathLength?: number | string | undefined;
}

const svgAttributeNameOverrides: Record<string, string> = {
    alignmentBaseline: "alignment-baseline",
    baselineShift: "baseline-shift",
    className: "class",
    clipPath: "clip-path",
    clipRule: "clip-rule",
    colorInterpolation: "color-interpolation",
    colorInterpolationFilters: "color-interpolation-filters",
    colorProfile: "color-profile",
    colorRendering: "color-rendering",
    crossOrigin: "crossorigin",
    dominantBaseline: "dominant-baseline",
    fillOpacity: "fill-opacity",
    fillRule: "fill-rule",
    fontFamily: "font-family",
    fontSize: "font-size",
    fontSizeAdjust: "font-size-adjust",
    fontStretch: "font-stretch",
    fontStyle: "font-style",
    fontVariant: "font-variant",
    fontWeight: "font-weight",
    imageRendering: "image-rendering",
    lengthAdjust: "lengthAdjust",
    letterSpacing: "letter-spacing",
    markerEnd: "marker-end",
    markerMid: "marker-mid",
    markerStart: "marker-start",
    markerHeight: "markerHeight",
    markerUnits: "markerUnits",
    markerWidth: "markerWidth",
    paintOrder: "paint-order",
    pathLength: "pathLength",
    pointerEvents: "pointer-events",
    preserveAspectRatio: "preserveAspectRatio",
    refX: "refX",
    refY: "refY",
    shapeRendering: "shape-rendering",
    strokeDasharray: "stroke-dasharray",
    strokeDashoffset: "stroke-dashoffset",
    strokeLinecap: "stroke-linecap",
    strokeLinejoin: "stroke-linejoin",
    strokeMiterlimit: "stroke-miterlimit",
    strokeOpacity: "stroke-opacity",
    strokeWidth: "stroke-width",
    tabIndex: "tabindex",
    textAnchor: "text-anchor",
    textDecoration: "text-decoration",
    textLength: "textLength",
    textRendering: "text-rendering",
    transformOrigin: "transform-origin",
    vectorEffect: "vector-effect",
    viewBox: "viewBox",
    wordSpacing: "word-spacing",
    writingMode: "writing-mode",
    xlinkHref: "xlink:href",
};

function toSvgAttributeName(propertyName: string): string {
    return svgAttributeNameOverrides[propertyName] ?? propertyName.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function applySvgProperties<TElement extends SVGElement>(
    element: TElement,
    properties?: SVGElementProperties,
    options?: { excludedKeys?: string[] },
): TElement {
    const excludedKeys = new Set(options?.excludedKeys ?? []);
    if (!properties) {
        return element;
    }

    Object.entries(properties).forEach(([propertyName, propertyValue]) => {
        if (excludedKeys.has(propertyName) || propertyValue === undefined || propertyValue === null) {
            return;
        }
        element.setAttribute(toSvgAttributeName(propertyName), propertyValue.toString());
    });

    return element;
}

export function createSvgRootElement({
    width,
    height,
    properties,
}: {
    width: number,
    height: number,
    properties?: SVGRootProperties,
}): SVGSVGElement {
    const svg = createSvgElement("svg") as SVGSVGElement;
    svg.setAttribute("width", width.toString());
    svg.setAttribute("height", height.toString());
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    return applySvgProperties(svg, properties);
}

export function createSvgDefsForArrowMarkers({
    parent,
    properties,
}: {
    parent: SVGSVGElement,
    properties: SVGMarkerProperties,
}): void {
    if (parent.querySelector("#arrowStart, #arrowEnd")) {
        return;
    }

    const defs = createSvgElement("defs") as SVGDefsElement;
    const markerProperties = {
        markerWidth: properties?.markerWidth ?? 10,
        markerHeight: properties?.markerHeight ?? 10,
        markerUnits: properties?.markerUnits ?? "strokeWidth",
        orient: properties?.orient ?? "auto",
        refY: properties?.refY ?? 5,
        viewBox: properties?.viewBox ?? "0 0 10 10",
    };
    const markerPathFill = properties?.fill ?? "context-stroke";
    const markerPathD = properties?.d ?? "M 0 0 L 10 5 L 0 10 z";

    const refX = properties?.refX ?? properties?.markerWidth ?? 10;
    const refY = properties?.refY ?? (typeof properties?.markerHeight === "number" ? (properties.markerHeight / 2) : 5);

    const endMarker = createSvgElement("marker") as SVGMarkerElement;
    applySvgProperties(endMarker, { ...markerProperties, id: "arrowEnd", refX, refY, orient: properties?.orient ?? "auto" });
    const endMarkerPath = createSvgElement("path") as SVGPathElement;
    endMarkerPath.setAttribute("d", markerPathD);
    endMarkerPath.setAttribute("fill", markerPathFill);
    endMarker.appendChild(endMarkerPath);

    const startMarker = createSvgElement("marker") as SVGMarkerElement;
    applySvgProperties(startMarker, { ...markerProperties, id: "arrowStart", orient: "auto-start-reverse", refX, refY });
    const startMarkerPath = createSvgElement("path") as SVGPathElement;
    startMarkerPath.setAttribute("d", markerPathD);
    startMarkerPath.setAttribute("fill", markerPathFill);
    startMarker.appendChild(startMarkerPath);

    defs.appendChild(startMarker);
    defs.appendChild(endMarker);
    parent.appendChild(defs);
}

export function createSvgImageElement({
    parent,
    href,
    width,
    height,
    properties,
}: {
    parent: SVGElement,
    href: string,
    width: number,
    height: number,
    properties?: SVGImageProperties,
}): SVGImageElement {
    const imageElement = createSvgElement("image") as SVGImageElement;
    imageElement.setAttribute("href", href);
    imageElement.setAttribute("width", width.toString());
    imageElement.setAttribute("height", height.toString());
    applySvgProperties(imageElement, properties);
    parent.appendChild(imageElement);
    return imageElement;
}

export function createSvgPathElement({
    parent,
    d,
    properties,
}: {
    parent: SVGElement,
    d: string,
    properties?: SVGPathProperties,
}): SVGPathElement {
    const pathElement = createSvgElement("path") as SVGPathElement;
    pathElement.setAttribute("d", d);
    applySvgProperties(pathElement, properties, { excludedKeys: ["tags"] });
    parent.appendChild(pathElement);
    return pathElement;
}

export function createSvgLineElement(
    {
        parent,
        startX,
        startY,
        endX,
        endY,
        properties,
    }: {
        parent: SVGGElement,
        startX: number,
        startY: number,
        endX: number,
        endY: number,
        properties: SVGLineProperties | SVGPathProperties,
    },
): SVGLineElement {
    const line = createSvgElement("line") as SVGLineElement;
    line.setAttribute("x1", startX.toString());
    line.setAttribute("y1", startY.toString());
    line.setAttribute("x2", endX.toString());
    line.setAttribute("y2", endY.toString());
    applySvgProperties(line, properties);
    parent.appendChild(line);
    if (properties.ticksAtEndsLength) {
        const normalX = endY - startY;
        const normalY = startX - endX;
        const normalLength = Math.sqrt(normalX * normalX + normalY * normalY);
        if (normalLength > 0) {
            const unitNormalX = normalX / normalLength;
            const unitNormalY = normalY / normalLength;
            const tickXOffset = unitNormalX * properties.ticksAtEndsLength / 2;
            const tickYOffset = unitNormalY * properties.ticksAtEndsLength / 2;

            // Start tick
            createSvgLineElement({
                parent,
                startX: startX - tickXOffset,
                startY: startY - tickYOffset,
                endX: startX + tickXOffset,
                endY: startY + tickYOffset,
                properties: properties.ticksStyle || properties,
            });

            // End tick
            createSvgLineElement({
                parent,
                startX: endX - tickXOffset,
                startY: endY - tickYOffset,
                endX: endX + tickXOffset,
                endY: endY + tickYOffset,
                properties: properties.ticksStyle || properties,
            });
        }
    }
    return line;
}

export function createSvgGroupElement({
    parent,
    properties,
}: {
    parent: SVGElement,
    properties?: SVGGroupProperties,
}): SVGGElement {
    const group = createSvgElement("g") as SVGGElement;
    applySvgProperties(group, properties);
    parent.appendChild(group);
    return group;
}

export function createSvgTextElement(
    {
        parent,
        x,
        y,
        textContent,
        properties,
    }: {
        parent: SVGGElement,
        x: number,
        y: number,
        textContent: string,
        properties: SVGTextProperties,
    },
): SVGTextElement {
    const text = createSvgElement("text") as SVGTextElement;
    text.setAttribute("x", x.toString());
    text.setAttribute("y", y.toString());
    text.textContent = textContent;
    applySvgProperties(text, properties, { excludedKeys: ["flipIfUpsideDown", "rotationAngle"] });
    if (properties.rotationAngle !== undefined) {
        const lineAngle = (properties.rotationAngle + 360) % 360; // Angle in degrees, normalized to [0, 360);
        const textUpsideDown = properties.flipIfUpsideDown && (lineAngle > 45 && lineAngle < 225);
        const textAngle = textUpsideDown ? lineAngle + 180 : lineAngle;
        const rotationTransform = `rotate(${textAngle}, ${x}, ${y})`;
        const existingTransform = properties.transform;
        text.setAttribute("transform", existingTransform ? `${existingTransform} ${rotationTransform}` : rotationTransform);
    }
    parent.appendChild(text);
    return text;
}

export function createSvgLineElementWithText(
    {
        parent,
        startX,
        startY,
        endX,
        endY,
        textOffset = { _x: 0, _y: 0 },
        textContent,
        lineProperties,
        textProperties,
    }: {
        parent: SVGGElement,
        startX: number,
        startY: number,
        endX: number,
        endY: number,
            textOffset?: { _x: number, _y: number },
        textContent: string,
        lineProperties: SVGLineProperties | SVGPathProperties,
        textProperties: SVGTextProperties,
    },
): { line: SVGLineElement | SVGPathElement, text: SVGTextElement } {
    const line = createSvgLineElement({ parent, startX, startY, endX, endY, properties: lineProperties });
    const angle = Math.atan2(endY - startY, endX - startX) * 180 / Math.PI; // Angle in degrees
    const lineAngle = (angle + 360) % 360;
    const textUpsideDown = !!textProperties.flipIfUpsideDown && (lineAngle > 45 && lineAngle < 225);
    const effectiveTextAngle = textUpsideDown ? lineAngle + 180 : lineAngle;
    const effectiveTextAngleRad = effectiveTextAngle * Math.PI / 180;

    // Build a local frame aligned with displayed text orientation.
    // +x is along the annotation line and +y is above the line.
    const alongX = Math.cos(effectiveTextAngleRad);
    const alongY = Math.sin(effectiveTextAngleRad);
    const aboveX = Math.sin(effectiveTextAngleRad);
    const aboveY = -Math.cos(effectiveTextAngleRad);

    const offsetX = textOffset._x * alongX + textOffset._y * aboveX;
    const offsetY = textOffset._x * alongY + textOffset._y * aboveY;
    const text = createSvgTextElement({
        parent,
        x: (startX + endX) / 2 + offsetX,
        y: (startY + endY) / 2 + offsetY,
        textContent,
        properties: { ...textProperties, rotationAngle: angle },
    });
    return { line, text };
}

export function createSvgRectElement({
    parent,
    x,
    y,
    width,
    height,
    properties,
}: {
    parent: SVGGElement,
    x: number,
    y: number,
    width: number,
    height: number,
    properties?: SVGPathProperties,
}): SVGRectElement {
    const rect = createSvgElement("rect") as SVGRectElement;
    rect.setAttribute("x", x.toString());
    rect.setAttribute("y", y.toString());
    rect.setAttribute("width", width.toString());
    rect.setAttribute("height", height.toString());
    applySvgProperties(rect, properties);
    parent.appendChild(rect);
    return rect;
}

export function createSvgCircleElement({
    parent,
    cx,
    cy,
    r,
    properties,
}: {
    parent: SVGGElement,
    cx: number,
    cy: number,
    r: number,
    properties?: SVGCircleProperties,
}): SVGCircleElement {
    const circle = createSvgElement("circle") as SVGCircleElement;
    circle.setAttribute("cx", cx.toString());
    circle.setAttribute("cy", cy.toString());
    circle.setAttribute("r", r.toString());
    applySvgProperties(circle, properties);
    parent.appendChild(circle);
    return circle;
} export const textStyle = {
    fill: "black",
    fontSize: 24,
    fontFamily: "Arial",
    stroke: "white",
    strokeWidth: 10,
    paintOrder: "stroke",
    textAnchor: "middle",
    strokeLinejoin: "round",
    alignmentBaseline: "middle",
    flipIfUpsideDown: true,
};
export const thickLineStyle = {
    stroke: "black",
    strokeWidth: 2,
};
export const thinLineStyle = {
    stroke: "gray",
    strokeWidth: 1,
};
export const arrowLineStyle = {
    markerStart: "url(#arrowStart)",
    markerEnd: "url(#arrowEnd)",
};
export const overlayStyle = {
    fill: "rgba(255,255,0,0.5)",
    stroke: "orange",
    strokeWidth: 2,
};
export const linesArrowMarkerStyle = {
    refX: 18,
    refY: 5,
    markerWidth: 20,
    markerHeight: 10,
    markerUnits: "userSpaceOnUse",
    orient: "auto",
    d: "M0,0 L0,10 L20,5 z",
    fill: "context-stroke",
};
export const thinDashedLineStyle = {
    stroke: "gray",
    strokeWidth: 1,
    strokeDasharray: "5,5",
};