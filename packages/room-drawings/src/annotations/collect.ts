// Evaluates the content annotation table for the modules of one view (the part of the tc-drawings-three order
// function that fed the drawings): for every module whose modId is listed in an entry's in_ModuleId and whose
// in_Condition holds, out_Annotations / out_SvgPathOverlays / out_AnnotablePoints are called with the module's
// order data and the drawing info. Their module coordinates are converted to world and view coordinates.
import type { Logger } from '../log.ts';
import { dot, transformPoint, vec3, type Mat4, type Vec3 } from '../math.ts';
import type { ViewBasis } from '../render/hlr.ts';
import type { SceneNode } from '../scene/scene.ts';
import type { ProjectedPoint, ViewAnnotations } from './layout.ts';
import type { ContentPoint, I_tab_Annotation, IPlanSvgDrawing } from './types.ts';
import { Vector3 } from './vector3.ts';

export const contentPoint = (p: ContentPoint): Vec3 => {
    const q = p as { _x?: number; _y?: number; _z?: number; x?: number; y?: number; z?: number };
    return vec3(q._x ?? q.x ?? 0, q._y ?? q.y ?? 0, q._z ?? q.z ?? 0);
};

export function projectPoint(world: Vec3, basis: ViewBasis): ProjectedPoint {
    return {
        world: new Vector3(world.x, world.y, world.z),
        view: new Vector3(dot(world, basis.right), dot(world, basis.up), dot(world, basis.toward)),
    };
}

/** Entries of the table that apply to the module (same rules as filterAnnotationForModule). */
export function entriesForModule(table: I_tab_Annotation[], modId: string, data: unknown, drawing: IPlanSvgDrawing): I_tab_Annotation[] {
    return table.filter(entry => {
        const ids = entry.in_ModuleId.split(',').map(id => id.trim());
        return ids.includes(modId) && (entry.in_Condition ? entry.in_Condition(data, drawing) : true);
    });
}

export function collectAnnotations(modules: SceneNode[], table: I_tab_Annotation[], drawing: IPlanSvgDrawing, basis: ViewBasis, excludeTags: string[], logger: Logger): ViewAnnotations {
    const result: ViewAnnotations = { annotations: [], overlays: [], annotablePoints: [] };
    const allowed = (tags: string[] | undefined) => !(tags ?? []).some(tag => excludeTags.includes(tag));
    const at = (world: Mat4, p: ContentPoint) => projectPoint(transformPoint(world, contentPoint(p)), basis);

    for (const node of modules) {
        const data = node.data as { modId?: unknown } | undefined;
        const modId = typeof data?.modId === 'string' ? data.modId : node.module?.modId;
        if (!modId) continue;
        let entries: I_tab_Annotation[];
        try {
            entries = entriesForModule(table, modId, data, drawing);
        }
        catch (error) {
            logger.warning(`room-drawings: annotation condition failed for ${node.id}: ${message(error)}`);
            continue;
        }
        for (const entry of entries) {
            try {
                for (const svgInjection of entry.out_SvgPathOverlays?.(data, drawing) ?? []) {
                    if (!allowed(svgInjection.tags)) continue;
                    result.overlays.push({
                        depth: projectPoint(transformPoint(node.world, vec3(0, 0, 0)), basis).view._z,
                        svgInjection: { ...svgInjection },
                        points: svgInjection.d.map(cmd => cmd.coordinate3d ? at(node.world, cmd.coordinate3d) : undefined),
                    });
                }
                for (const annotation of entry.out_Annotations?.(data, drawing) ?? []) {
                    if (!allowed(annotation.tags)) continue;
                    result.annotations.push({ annotation, start: at(node.world, annotation.start), end: at(node.world, annotation.end) });
                }
                for (const point of entry.out_AnnotablePoints?.(data, drawing) ?? []) {
                    result.annotablePoints.push({ point: { coordinate: point.coordinate }, at: at(node.world, point.coordinate) });
                }
            }
            catch (error) {
                logger.warning(`room-drawings: annotation entry '${entry.in_ModuleId}' failed for ${node.id}: ${message(error)}`);
            }
        }
    }
    return result;
}

const message = (error: unknown) => error instanceof Error ? error.message : String(error);
