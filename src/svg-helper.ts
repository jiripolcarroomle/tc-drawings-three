import * as THREE from 'three';
import { SVGLoader, type SVGResultPaths } from 'three/addons/loaders/SVGLoader.js';
import { logError } from './tc/base';
// Cache parsed SVG shapes (module-local) and fetched+parsed Object3D models.
// Only the Object3D cache is persisted across Vite HMR updates to avoid
// re-downloading meshes while iterating.
const _svgShapeCache = new Map<string, THREE.Shape[]>();

const svgLoader = new SVGLoader();


export function loadSvgShapesFromCacheOrParse(
    svg: string,
    partIdForLogging?: string
): THREE.Shape[] {
    if (_svgShapeCache.has(svg)) {
        return _svgShapeCache.get(svg)!;
    }

    let shapes: THREE.Shape[] = [];
    try {
        const svgData = svgLoader.parse(svg);
        if (svgData.paths.length <= 0) {
            logError(`SVG data does not contain any paths! Part ${partIdForLogging ?? ''} will not be drawn! Is the SVG valid? (SVG: ${svg})`);
        }
        svgData.paths.forEach((path: SVGResultPaths) => {
            const pathIsCCW =
                path.subPaths.length > 0 &&
                !THREE.ShapeUtils.isClockWise(path.subPaths[0].getPoints());
            shapes = shapes.concat(path.toShapes(pathIsCCW));
        });
    } catch (e) {
        logError(
            `Failed to parse SVG for extrude part ${partIdForLogging ?? ''}: ${svg} \nexception:${e}`
        );
    }
    _svgShapeCache.set(svg, shapes);
    return shapes;
}

export function computeMinAndMaxFromShapes(svgString: string): { minX: number; minY: number; maxX: number; maxY: number } {
    const shapes = loadSvgShapesFromCacheOrParse(svgString);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    shapes.forEach(shape => {
        const points = shape.getPoints();
        points.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        });
    });
    return { minX, minY, maxX, maxY };
}