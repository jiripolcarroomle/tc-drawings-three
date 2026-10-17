// Layout of the content annotations of one view, ported from tc-drawings-three (drawingapi/implementation/
// drawing.ts, Drawing.render): annotation layers, annotation lines on the four sides, wall corner distances,
// annotations at their positions and SVG path overlays.
//
// The layout runs in "design pixels": 1 unit on paper = textHeight / 24 mm, so the tuned sizes of the original
// (text 24, line spacing 40, margins 20, ticks 25, ...) keep their proportions. The caller places the returned
// group onto the sheet with translate(bbox origin) scale(mm per design pixel).
import { AnnotationLineDisqualifyType, drawAnnotationsWithAnnotationLines } from './annotation-lines.ts';
import * as SVGHelper from './svg-builder.ts';
import { linesArrowMarkerStyle, overlayStyle, textStyle, thickLineStyle } from './svg-builder.ts';
import type { AnnotablePoint, Annotation, AnnotationTransformed, ILayerSettings, SvgPathInjectionData, TransformedPoint } from './types.ts';
import { Vector3 } from './vector3.ts';

/** A point of the content data, already in world and camera (view) space, i.e. independent of the scale. */
export interface ProjectedPoint {
    world: Vector3;
    /** View coordinates: x right, y up, z towards the viewer [mm]. */
    view: Vector3;
}

export interface ViewAnnotations {
    annotations: { annotation: Annotation; start: ProjectedPoint; end: ProjectedPoint }[];
    overlays: { depth: number; svgInjection: SvgPathInjectionData; points: (ProjectedPoint | undefined)[] }[];
    annotablePoints: { point: AnnotablePoint; at: ProjectedPoint }[];
}

export interface LayoutSettings {
    disqualify: AnnotationLineDisqualifyType;
    /** Margin before the first annotation line [design px]. */
    baseMargin: number;
    /** Margin after the last annotation line [design px]. */
    finalMargin: number;
    /** Distance of annotation lines [design px]. */
    lineSpacing: number;
}

export interface AnnotationLayout {
    /** Group in design pixels; (0, 0) is the top left corner of the drawing's bounding box. */
    group: SVGHelper.SvgNode;
    /** Space needed around the drawing's bounding box [design px]. */
    margins: { left: number; right: number; top: number; bottom: number };
}

/**
 * @param bbox bounding box of the drawing in sheet coordinates (x right, y down = -view y) [mm]
 * @param pxPerMm design pixels per room millimeter at the chosen scale
 */
export function layoutAnnotations(content: ViewAnnotations, layerSettings: Map<string, ILayerSettings>, bbox: { minX: number; minY: number; width: number; height: number }, pxPerMm: number, settings: LayoutSettings): AnnotationLayout {
    const toTransformed = (p: ProjectedPoint): TransformedPoint => ({
        worldCoordinate: p.world.clone(),
        cameraSpaceCoordinate: p.view.clone(),
        pixelCoordinate: new Vector3((p.view._x - bbox.minX) * pxPerMm, (-p.view._y - bbox.minY) * pxPerMm, 0),
    });
    const imageWidth = bbox.width * pxPerMm, imageHeight = bbox.height * pxPerMm;

    const group = SVGHelper.createSvgElement('g');
    SVGHelper.createSvgDefsForArrowMarkers({ parent: group, properties: linesArrowMarkerStyle });

    const ANNOTATION_LINE_DISQUALIFY_TYPE = settings.disqualify;
    const baseMargin = settings.baseMargin;
    const finalMargin = settings.finalMargin;
    const annotationSpacing = settings.lineSpacing;
    let marginDown = baseMargin, marginUp = baseMargin, marginLeft = baseMargin, marginRight = baseMargin;

    // overlays, far to near
    for (const { svgInjection, points } of [...content.overlays].sort((a, b) => a.depth - b.depth)) {
        const pathD = svgInjection.d.map((cmd, i) => {
            if (cmd.command === 'Z') return 'Z';
            const p = points[i];
            if (!p) return '';
            const pixel = toTransformed(p).pixelCoordinate;
            return `${cmd.command} ${pixel._x} ${pixel._y}`;
        }).join(' ');
        const options = { ...svgInjection, d: pathD } as Record<string, unknown>;
        SVGHelper.createSvgPathElement({ parent: group, d: pathD, properties: { ...overlayStyle, ...options } });
    }

    // text elements must be on top, therefore the annotations go into one group separate from everything else
    const annotationsRoot = SVGHelper.createSvgElement('g');

    const annotations: AnnotationTransformed[] = content.annotations.map(({ annotation, start, end }) => {
        const startPoint = toTransformed(start), endPoint = toTransformed(end);
        return {
            annotation: { ...annotation },
            startPoint,
            endPoint,
            realLength: startPoint.worldCoordinate.distanceTo(endPoint.worldCoordinate),
            projectedLength: new Vector3(startPoint.cameraSpaceCoordinate._x, startPoint.cameraSpaceCoordinate._y, 0).distanceTo(new Vector3(endPoint.cameraSpaceCoordinate._x, endPoint.cameraSpaceCoordinate._y, 0)),
            pixelLength: startPoint.pixelCoordinate.distanceTo(endPoint.pixelCoordinate),
        };
    });
    const annotablePoints = content.annotablePoints.map(({ point, at }) => ({ point, transformedPoint: toTransformed(at) }));

    const annotationLayers = new Map<string, AnnotationTransformed[]>();
    for (const annotation of annotations) {
        // only annotations parallel to the view: elsewhere the projected length differs from the real length
        const lengthDifference = Math.abs(annotation.projectedLength - annotation.realLength);
        if (lengthDifference > Vector3.EPS || annotation.projectedLength < 1) continue;
        const layer = annotation.annotation.layer;
        if (!annotationLayers.has(layer)) annotationLayers.set(layer, []);
        annotationLayers.get(layer)!.push(annotation);
    }

    const directPositionAnnotations: AnnotationTransformed[] = [];
    const allLayers = Array.from(annotationLayers.keys()).sort((a, b) => {
        const aSort = layerSettings.get(a)?.annotationLineSort ?? Number.POSITIVE_INFINITY;
        const bSort = layerSettings.get(b)?.annotationLineSort ?? Number.POSITIVE_INFINITY;
        return aSort - bSort;
    });

    allLayers.forEach(layer => {
        const annotationsInLayer = annotationLayers.get(layer)!;
        const horizontalAnnotations: AnnotationTransformed[] = [];
        const verticalAnnotations: AnnotationTransformed[] = [];
        annotationsInLayer.forEach(annotation => {
            // the annotation goes to an annotation line only when it is rectangular to the drawing view
            const azimuth = Math.round(Math.atan2(annotation.endPoint.cameraSpaceCoordinate._y - annotation.startPoint.cameraSpaceCoordinate._y, annotation.endPoint.cameraSpaceCoordinate._x - annotation.startPoint.cameraSpaceCoordinate._x) * 180 / Math.PI);
            const isVertical = Math.abs(azimuth) === 90;
            const isHorizontal = Math.abs(azimuth) === 0 || Math.abs(azimuth) === 180;
            if (isVertical && !annotation.annotation.displayAtPosition) verticalAnnotations.push(annotation);
            else if (isHorizontal && !annotation.annotation.displayAtPosition) horizontalAnnotations.push(annotation);
            else directPositionAnnotations.push(annotation);
        });

        const horizontalAnnotationsResult = drawAnnotationsWithAnnotationLines({
            annotationsParent: annotationsRoot,
            layerName: layer,
            annotations: horizontalAnnotations,
            lineStart: new Vector3(0, imageHeight + marginDown, 0),
            lineDirection: new Vector3(1, 0, 0),
            lineNormalDirection: new Vector3(0, 1, 0),
            lineSpacing: annotationSpacing,
            drawingSizeY: imageHeight,
            disqualifyAnnotations: ANNOTATION_LINE_DISQUALIFY_TYPE,
        });
        directPositionAnnotations.push(...horizontalAnnotationsResult.annotationsAtPosition);

        const verticalAnnotationsResult = drawAnnotationsWithAnnotationLines({
            annotationsParent: annotationsRoot,
            layerName: layer,
            annotations: verticalAnnotations,
            lineStart: new Vector3(imageWidth + marginRight, 0, 0),
            lineDirection: new Vector3(0, 1, 0),
            lineNormalDirection: new Vector3(1, 0, 0),
            lineSpacing: annotationSpacing,
            drawingSizeY: imageWidth,
            disqualifyAnnotations: ANNOTATION_LINE_DISQUALIFY_TYPE,
        });
        directPositionAnnotations.push(...verticalAnnotationsResult.annotationsAtPosition);

        const showGaps = (line: { annotationLayerName: string }) => layerSettings.get(line.annotationLayerName)?.fillAnnotationGaps ?? false;
        const annotateWalls = (line: { annotationLayerName: string }) => layerSettings.get(line.annotationLayerName)?.addWallCornersToAnnotationLines ?? false;
        if (layerSettings.get(layer)?.addWallCornersToAnnotationLines) {
            const wallCornerPoints = annotablePoints.filter(({ point }) => point.isWallVertex === true);
            [...horizontalAnnotationsResult.annotationLines, ...horizontalAnnotationsResult.secondaryAnnotationLines].forEach(line => {
                wallCornerPoints.forEach(({ transformedPoint }) => line.pushAnnotablePoint(transformedPoint, new Vector3(1, 0, 0)));
            });
            [...verticalAnnotationsResult.annotationLines, ...verticalAnnotationsResult.secondaryAnnotationLines].forEach(line => {
                wallCornerPoints.forEach(({ transformedPoint }) => line.pushAnnotablePoint(transformedPoint, new Vector3(0, 1, 0)));
            });
        }

        horizontalAnnotationsResult.annotationLines.forEach(line => {
            marginDown += annotationSpacing;
            line.toSvg({ parent: annotationsRoot, offsetPixels: new Vector3(0, imageHeight + marginDown, 0), direction: new Vector3(1, 0, 0), showDistanceToAnnotablePoints: annotateWalls(line), fillGapsOnAnnotationLine: showGaps(line) });
        });
        horizontalAnnotationsResult.secondaryAnnotationLines.forEach(line => {
            line.toSvg({ parent: annotationsRoot, offsetPixels: new Vector3(0, -marginUp, 0), direction: new Vector3(1, 0, 0), showDistanceToAnnotablePoints: annotateWalls(line), fillGapsOnAnnotationLine: showGaps(line) });
            marginUp += annotationSpacing;
        });
        verticalAnnotationsResult.annotationLines.forEach(line => {
            marginRight += annotationSpacing;
            line.toSvg({ parent: annotationsRoot, offsetPixels: new Vector3(imageWidth + marginRight, 0, 0), direction: new Vector3(0, 1, 0), showDistanceToAnnotablePoints: annotateWalls(line), fillGapsOnAnnotationLine: showGaps(line) });
        });
        verticalAnnotationsResult.secondaryAnnotationLines.forEach(line => {
            line.toSvg({ parent: annotationsRoot, offsetPixels: new Vector3(-marginLeft, 0, 0), direction: new Vector3(0, 1, 0), showDistanceToAnnotablePoints: annotateWalls(line), fillGapsOnAnnotationLine: showGaps(line) });
            marginLeft += annotationSpacing;
        });
    });

    directPositionAnnotations.forEach(annotation => {
        SVGHelper.createSvgLineElementWithText({
            parent: annotationsRoot,
            startX: annotation.startPoint.pixelCoordinate._x,
            startY: annotation.startPoint.pixelCoordinate._y,
            endX: annotation.endPoint.pixelCoordinate._x,
            endY: annotation.endPoint.pixelCoordinate._y,
            textContent: annotation.annotation.label ?? annotation.realLength.toFixed(0),
            lineProperties: { ...thickLineStyle, ...SVGHelper.arrowLineStyle },
            textProperties: { ...textStyle, flipIfUpsideDown: true },
        });
    });

    // texts last, on top of all other elements
    const sortedAnnotationsRoot = SVGHelper.createSvgElement('g');
    [...annotationsRoot.childNodes]
        .sort((a, b) => (a.nodeName === 'text' ? 1 : 0) - (b.nodeName === 'text' ? 1 : 0))
        .forEach(node => sortedAnnotationsRoot.appendChild(node));
    group.appendChild(sortedAnnotationsRoot);

    return {
        group,
        margins: { left: marginLeft + finalMargin, right: marginRight + finalMargin, top: marginUp + finalMargin, bottom: marginDown + finalMargin },
    };
}
