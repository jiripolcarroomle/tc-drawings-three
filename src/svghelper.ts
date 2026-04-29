export function createSvgElement(tagName: string): SVGElement {
    return document.createElementNS("http://www.w3.org/2000/svg", tagName);
}

type SVGPropertyValue = string | number | boolean | null | undefined;

export interface SVGElementProperties {
    [attributeName: string]: SVGPropertyValue;
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

export interface SVGLineProperties extends SVGPathProperties {
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
    paintOrder: "paint-order",
    pathLength: "pathLength",
    pointerEvents: "pointer-events",
    preserveAspectRatio: "preserveAspectRatio",
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

export function createSvgRootElement(width: number, height: number, properties?: SVGRootProperties): SVGSVGElement {
    const svg = createSvgElement("svg") as SVGSVGElement;
    svg.setAttribute("width", width.toString());
    svg.setAttribute("height", height.toString());
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    return applySvgProperties(svg, properties);
}

export function createSvgImageElement(parent: SVGElement, href: string, width: number, height: number, properties?: SVGImageProperties): SVGImageElement {
    const imageElement = createSvgElement("image") as SVGImageElement;
    imageElement.setAttribute("href", href);
    imageElement.setAttribute("width", width.toString());
    imageElement.setAttribute("height", height.toString());
    applySvgProperties(imageElement, properties);
    parent.appendChild(imageElement);
    return imageElement;
}

export function createSvgPathElement(parent: SVGElement, d: string, properties?: SVGPathProperties): SVGPathElement {
    const pathElement = createSvgElement("path") as SVGPathElement;
    pathElement.setAttribute("d", d);
    applySvgProperties(pathElement, properties);
    parent.appendChild(pathElement);
    return pathElement;
}

export function createSvgLineElement(
    parent: SVGGElement,
    startX: number,
    startY: number, endX: number,
    endY: number,
    properties: SVGLineProperties,
): SVGLineElement {
    const line = createSvgElement("line") as SVGLineElement;
    line.setAttribute("x1", startX.toString());
    line.setAttribute("y1", startY.toString());
    line.setAttribute("x2", endX.toString());
    line.setAttribute("y2", endY.toString());
    applySvgProperties(line, properties);
    parent.appendChild(line);
    return line;
}

export function createSvgGroupElement(parent: SVGElement, properties?: SVGGroupProperties): SVGGElement {
    const group = createSvgElement("g") as SVGGElement;
    applySvgProperties(group, properties);
    parent.appendChild(group);
    return group;
}

export function createSvgTextElement(
    parent: SVGGElement,
    x: number,
    y: number,
    textContent: string,
    properties: SVGTextProperties,
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
    parent: SVGGElement,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    textContent: string,
    lineProperties: SVGLineProperties,
    textProperties: SVGTextProperties,
): { line: SVGLineElement, text: SVGTextElement } {
    const line = createSvgLineElement(parent, startX, startY, endX, endY, lineProperties);
    const angle = Math.atan2(endY - startY, endX - startX) * 180 / Math.PI; // Angle in degrees
    const text = createSvgTextElement(parent, (startX + endX) / 2, (startY + endY) / 2, textContent, { ...textProperties, rotationAngle: angle });
    return { line, text };
}

export function createSvgCircleElement(parent: SVGGElement, cx: number, cy: number, r: number, properties?: SVGCircleProperties): SVGCircleElement {
    const circle = createSvgElement("circle") as SVGCircleElement;
    circle.setAttribute("cx", cx.toString());
    circle.setAttribute("cy", cy.toString());
    circle.setAttribute("r", r.toString());
    applySvgProperties(circle, properties);
    parent.appendChild(circle);
    return circle;
}   