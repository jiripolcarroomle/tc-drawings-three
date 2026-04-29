export function createSvgElement(tagName: string): SVGElement {
    return document.createElementNS("http://www.w3.org/2000/svg", tagName);
}

export function createSvgRootElement(width: number, height: number): SVGSVGElement {
    const svg = createSvgElement("svg") as SVGSVGElement;
    svg.setAttribute("width", width.toString());
    svg.setAttribute("height", height.toString());
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    return svg;
}

export function createSvgImageElement(parent: SVGElement, href: string, width: number, height: number): SVGImageElement {
    const imageElement = createSvgElement("image") as SVGImageElement;
    imageElement.setAttribute("href", href);
    imageElement.setAttribute("width", width.toString());
    imageElement.setAttribute("height", height.toString());
    parent.appendChild(imageElement);
    return imageElement;
}


interface SVGPathProperties {
    fill?: string | undefined;
    stroke?: string | undefined;
    strokeWidth?: number | string | undefined;
    strokeDasharray?: string | undefined;
}
export function createSvgPathElement(parent: SVGElement, pathData: string, properties?: SVGPathProperties): SVGPathElement {
    const pathElement = createSvgElement("path") as SVGPathElement;
    pathElement.setAttribute("d", pathData);
    if (properties?.fill) { pathElement.setAttribute("fill", properties.fill); }
    if (properties?.stroke) { pathElement.setAttribute("stroke", properties.stroke); }
    if (properties?.strokeWidth) { pathElement.setAttribute("stroke-width", properties.strokeWidth.toString()); }
    if (properties?.strokeDasharray) { pathElement.setAttribute("stroke-dasharray", properties.strokeDasharray); }
    parent.appendChild(pathElement);
    return pathElement;
}

interface SVGLineProperties extends SVGPathProperties {
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
    if (properties.stroke) { line.setAttribute("stroke", properties.stroke); }
    if (properties.strokeWidth) { line.setAttribute("stroke-width", properties.strokeWidth.toString()); }
    if (properties.fill) { line.setAttribute("fill", properties.fill); }
    parent.appendChild(line);
    return line;
}

export function createSvgGroupElement(parent: SVGElement): SVGGElement {
    const group = createSvgElement("g") as SVGGElement;
    parent.appendChild(group);
    return group;
}


interface SVGTextProperties extends SVGPathProperties {
    fontSize?: number | string | undefined;
    fontFamily?: string | undefined;
    strokeLinejoin?: string | undefined;
    paintOrder?: string | undefined;
    textAnchor?: string | undefined;
    alignmentBaseline?: string | undefined;
    rotationAngle?: number | undefined; // Rotation angle in degrees, applied around the text's (x, y) position
    flipIfUpsideDown?: boolean | undefined; // If true, the text will be flipped by 180 degrees if the rotation angle would make it upside down
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
    if (properties.fill) { text.setAttribute("fill", properties.fill); }
    if (properties.fontSize) { text.setAttribute("font-size", properties.fontSize.toString()); }
    if (properties.fontFamily) { text.setAttribute("font-family", properties.fontFamily); }
    if (properties.stroke) { text.setAttribute("stroke", properties.stroke); }
    if (properties.strokeWidth) { text.setAttribute("stroke-width", properties.strokeWidth.toString()); }
    if (properties.strokeLinejoin) { text.setAttribute("stroke-linejoin", properties.strokeLinejoin); }
    if (properties.paintOrder) { text.setAttribute("paint-order", properties.paintOrder); }
    if (properties.textAnchor) { text.setAttribute("text-anchor", properties.textAnchor); }
    if (properties.alignmentBaseline) { text.setAttribute("alignment-baseline", properties.alignmentBaseline); }
    if (properties.rotationAngle !== undefined) {
        const lineAngle = (properties.rotationAngle + 360) % 360; // Angle in degrees, normalized to [0, 360);
        const textUpsideDown = properties.flipIfUpsideDown && (lineAngle > 45 && lineAngle < 225);
        const textAngle = textUpsideDown ? lineAngle + 180 : lineAngle;
        text.setAttribute("transform", `rotate(${textAngle}, ${x}, ${y})`);
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

export function createSvgCircleElement(parent: SVGGElement, cx: number, cy: number, r: number, properties: SVGPathProperties): SVGCircleElement {
    const circle = createSvgElement("circle") as SVGCircleElement;
    circle.setAttribute("cx", cx.toString());
    circle.setAttribute("cy", cy.toString());
    circle.setAttribute("r", r.toString());
    if (properties.fill) { circle.setAttribute("fill", properties.fill); }
    if (properties.stroke) { circle.setAttribute("stroke", properties.stroke); }
    if (properties.strokeWidth) { circle.setAttribute("stroke-width", properties.strokeWidth.toString()); }
    parent.appendChild(circle);
    return circle;
}   