import { Vector3 } from "./tc/base";
import { DrawingDirection, type AnnotablePoint, type Annotation, type IPlanSvgDrawing, type SvgPathInjectionData } from "./drawing.interface";


export interface I_tab_Annotation {
    in_ModuleId: string;
    in_ModuleCondition?: (m: any, drawingData: IPlanSvgDrawing) => boolean;
    out_AnnotablePoints?: (m: any, drawingData: IPlanSvgDrawing) => AnnotablePoint[];
    out_SvgPathOverlays?: (m: any, drawingData: IPlanSvgDrawing) => SvgPathInjectionData[];
    out_Annotations?: (m: any, drawingData: IPlanSvgDrawing) => Annotation[];
}


export function filterAnnotationForModule(moduleId: string, m: any, drawingData: IPlanSvgDrawing): I_tab_Annotation[] {
    return tab_Annotations.filter(annotation => {
        const ids = annotation.in_ModuleId.split(',').map(id => id.trim());
        return ids.includes(moduleId)
            && (annotation.in_ModuleCondition ? annotation.in_ModuleCondition(m, drawingData) : true);
    });
}


export const tab_Annotations: I_tab_Annotation[] = [

    {
        in_ModuleId: 'mr_StorageunitSingle,mr_CornerunitStraight',
        out_Annotations: (m: any, _drawingData: IPlanSvgDrawing) => {
            const plinthAreaHeight = m.mod_PlinthAreaDesign_matrix.PlinthAreaType !== 'None' ? m.mod_PlinthAreaHeight : 0;
            const result = [];

            result.push({
                start: new Vector3(0, 0, 0),
                end: new Vector3(m.mod_Width, 0, 0),
                layer: 'carcase-dimension-horizontal',
                tags: ['overall', 'carcase'],
            });
            result.push({
                start: new Vector3(0, 0, 0),
                end: new Vector3(0, 0, m.mod_Depth),
                layer: 'carcase-dimension-horizontal',
                tags: ['overall', 'carcase'],
            });

            if (plinthAreaHeight > 0) {
                result.push({
                    start: new Vector3(0, 0, 0),
                    end: new Vector3(0, plinthAreaHeight, 0),
                    layer: 'carcase-dimension-vertical',
                    tags: ['plinth', 'carcase'],
                });
                result.push({
                    start: new Vector3(0, plinthAreaHeight, 0),
                    end: new Vector3(0, plinthAreaHeight + m.mod_Height, 0),
                    layer: 'carcase-dimension-vertical',
                    tags: ['plinth', 'carcase'],
                });
            }
            else {
                result.push({
                    start: new Vector3(0, 0, 0),
                    end: new Vector3(0, m.mod_Height, 0),
                    layer: 'carcase-dimension-vertical',
                    tags: ['overall', 'carcase'],
                });
            }




            result.push({
                start: new Vector3(m.mod_Width / 4, 0, m.mod_Depth / 4),
                end: new Vector3(3 * m.mod_Width / 4, 0, 3 * m.mod_Depth / 4),
                label: m.modId,
                layer: 'carcase-dimension-diagonal',
                tags: ['overall', 'carcase'],
                displayAtPosition: true,
            });

            return result;
        },
    },

    {
        in_ModuleId: 'mr_CornerunitStraight',
        in_ModuleCondition: (_m: any) => true,
    },

    {
        in_ModuleId: 'mc_Backsplash',
        in_ModuleCondition: (_m: any) => true,
    },

    {
        in_ModuleId: 'mc_Countertop01',
        in_ModuleCondition: (_m: any) => true,
    },

    {
        in_ModuleId: 'mr_StorageunitSingle',
        in_ModuleCondition: (m: any, drawingData: IPlanSvgDrawing) => {
            return (
                (m.mod_CreateCountertop || m.mod_CreatePaneltop)
                && drawingData.drawingDirection === DrawingDirection.Top
            );
        }, // apply to all modules with the specified ID
        out_SvgPathOverlays: (m: any) => {
            return [
                {
                    d: [
                        { command: 'M', coordinate3d: new Vector3(0, 0, 0) },
                        { command: 'L', coordinate3d: new Vector3(m.mod_Width, 0, 0) },
                        { command: 'L', coordinate3d: new Vector3(m.mod_Width, 0, m.mod_Depth) },
                        { command: 'L', coordinate3d: new Vector3(0, 0, m.mod_Depth) },
                        { command: 'Z' }
                    ],
                    fill: 'none',
                    stroke: '#000000',
                    strokeDasharray: '10,10',
                    strokeWidth: '2',
                }
            ];
        },
    },

    {
        in_ModuleId: 'mr_CornerunitStraight',
        in_ModuleCondition: (m: any) => { return m.mod_CreateCountertop || m.mod_CreatePaneltop }, // apply to all modules with the specified ID
        out_SvgPathOverlays: (m: any) => {
            return [
                {
                    d: [
                        { command: 'M', coordinate3d: new Vector3(0, 0, 0) },
                        { command: 'L', coordinate3d: new Vector3(m.mod_Width, 0, 0) },
                        { command: 'L', coordinate3d: new Vector3(m.mod_Width, 0, m.mod_Depth) },
                        { command: 'L', coordinate3d: new Vector3(0, 0, m.mod_Depth) },
                        { command: 'Z' }
                    ],
                    fill: 'none',
                    stroke: '#00ff00',
                    strokeDasharray: '10,5',
                    strokeWidth: '2',
                }
            ];
        }
    },


    {
        in_ModuleId: 'mr_StorageunitSingle',
        in_ModuleCondition: (m: any) => { return m._articlePos.y > 100 /** todo: base on mod_ElementType */ },
        out_SvgPathOverlays: (m: any) => {
            return [
                {
                    d: [
                        { command: 'M', coordinate3d: new Vector3(0, 0, 0) },
                        { command: 'L', coordinate3d: new Vector3(m.mod_Width, 0, 0) },
                        { command: 'L', coordinate3d: new Vector3(m.mod_Width, 0, m.mod_Depth) },
                        { command: 'L', coordinate3d: new Vector3(0, 0, m.mod_Depth) },
                        { command: 'Z' },
                        { command: 'M', coordinate3d: new Vector3(0, 0, 0) },
                        { command: 'L', coordinate3d: new Vector3(m.mod_Width, 0, m.mod_Depth) },
                        { command: 'Z' },
                        { command: 'M', coordinate3d: new Vector3(m.mod_Width, 0, 0) },
                        { command: 'L', coordinate3d: new Vector3(0, 0, m.mod_Depth) },
                        { command: 'Z' },
                    ],
                    stroke: '#000000',
                    strokeWidth: '2',
                    fill: 'rgb(112, 112, 112)'
                }
            ];
        }
    },



]