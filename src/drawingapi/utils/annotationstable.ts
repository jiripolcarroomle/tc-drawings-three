import { Vector3 } from "../../tc/base";
import { DrawingDirection, type AnnotablePoint, type Annotation, type IPlanSvgDrawing, type SvgPathInjectionData } from "../interfaces/drawing";


export interface I_tab_Annotation {
    in_ModuleId: string;
    in_Condition?: (m: any, drawingData: IPlanSvgDrawing) => boolean;
    out_AnnotablePoints?: (m: any, drawingData: IPlanSvgDrawing) => AnnotablePoint[];
    out_SvgPathOverlays?: (m: any, drawingData: IPlanSvgDrawing) => SvgPathInjectionData[];
    out_Annotations?: (m: any, drawingData: IPlanSvgDrawing) => Annotation[];
}


export function filterAnnotationForModule(moduleId: string, m: any, drawingData: IPlanSvgDrawing): I_tab_Annotation[] {
    return tab_Annotations.filter(annotation => {
        const ids = annotation.in_ModuleId.split(',').map(id => id.trim());
        return ids.includes(moduleId)
            && (annotation.in_Condition ? annotation.in_Condition(m, drawingData) : true);
    });
}


export const tab_Annotations: I_tab_Annotation[] = [

    {
        in_ModuleId: 'mr_StorageunitSingle,mr_CornerunitStraight',
        out_Annotations: (m: any, _drawingData: IPlanSvgDrawing) => {
            const plinthAreaHeight = (m.mod_PlinthAreaDesign_matrix.PlinthAreaType !== 'None' ? m.mod_PlinthAreaHeight : 0) ?? 0;
            const countertopThk = m.mod_CreateCountertop ? (m.mod_CountertopThk ?? 0) : 0;
            const result = [];

            const layerName = ['WallUnit'].includes(m.mod_TypeElement) ? `wallunit-dimension-horizontal` : 'carcase-dimension-horizontal';

            result.push({
                start: new Vector3(0, 0, 0),
                end: new Vector3(m.mod_Width, 0, 0),
                layer: layerName,
                tags: ['overall', 'carcase'],
            });
            result.push({
                start: new Vector3(0, plinthAreaHeight, 0),
                end: new Vector3(0, plinthAreaHeight, m.mod_Depth),
                layer: layerName,
                tags: ['overall', 'carcase'],
            });

            if (m.mod_CreateCountertop) {
                result.push({
                    start: new Vector3(0, plinthAreaHeight + m.mod_Height, 0),
                    end: new Vector3(0, plinthAreaHeight + m.mod_Height + countertopThk, 0),
                    layer: 'carcase-dimension-elevation',
                    tags: ['overall', 'carcase'],
                });
            }

            if (plinthAreaHeight > 0) {
                result.push({
                    start: new Vector3(0, 0, 0),
                    end: new Vector3(0, plinthAreaHeight, 0),
                    layer: 'carcase-dimension-elevation',
                    tags: ['plinth', 'carcase'],
                });
                result.push({
                    start: new Vector3(0, plinthAreaHeight, 0),
                    end: new Vector3(0, plinthAreaHeight + m.mod_Height, 0),
                    layer: 'carcase-dimension-elevation',
                    tags: ['plinth', 'carcase'],
                });
            }
            else {
                result.push({
                    start: new Vector3(0, 0, 0),
                    end: new Vector3(0, m.mod_Height, 0),
                    layer: 'carcase-dimension-elevation',
                    tags: ['overall', 'carcase'],
                });
            }

            return result;
        },
    },

    {
        in_ModuleId: 'mr_CornerunitStraight',
        in_Condition: (_m: any) => true,
    },

    // {
    //     in_ModuleId: 'mc_Backsplash',
    //     in_Condition: (_m: any) => { return true; },
    //     out_Annotations: (m: any, _drawingData: IPlanSvgDrawing) => {
    //         return [
    //             {
    //                 start: new Vector3(0, 0, 0),
    //                 end: new Vector3(0, m.mod_BacksplashHeight, 0),
    //                 layer: 'carcase-dimension-elevation',
    //                 tags: ['overall', 'carcase'],
    //             },
    //             {
    //                 start: new Vector3(0, 0, 0),
    //                 end: new Vector3(0, 0, m.mod_BacksplashThk),
    //                 layer: 'accessory-dimension-horizontal',
    //                 tags: ['overall', 'carcase'],
    //             },
    //             {
    //                 start: new Vector3(0, 0, 0),
    //                 end: new Vector3(m.mod_BacksplashWidth, 0, 0),
    //                 layer: 'accessory-dimension-horizontal',
    //                 tags: ['overall', 'carcase'],
    //             }
    //         ];
    //     }
    // },

    {
        in_ModuleId: 'mc_Storageunit01',
        in_Condition: (_m: any) => { return true; },
        out_Annotations: (m: any, _drawingData: IPlanSvgDrawing) => {
            const leftX = m.mod_SidepanelleftThk ?? 0;
            const rightX = m.mod_CarcaseWidth - (m.mod_SidepanelrightThk ?? 0);
            const bottomY = m.mod_ShelfbtmThk ?? 0;
            const topY = m.mod_CarcaseHeight - (m.mod_ShelftopThk ?? 0);
            if (isNaN(leftX) || isNaN(rightX) || isNaN(bottomY) || isNaN(topY)) { return []; }
            if (leftX >= rightX || bottomY >= topY) { return []; }
            return [
                {
                    start: new Vector3(leftX, bottomY, 0),
                    end: new Vector3(rightX, bottomY, 0),
                    layer: 'carcase-inside-elevation',
                    displayAtPosition: true,
                    tags: ['inside'],
                },
                {
                    start: new Vector3(leftX, bottomY, 0),
                    end: new Vector3(leftX, topY, 0),
                    layer: 'accessory-dimension-horizontal',
                    displayAtPosition: true,
                    tags: ['inside'],
                }
            ];
        }
    },

    {
        in_ModuleId: 'mc_Countertop01',
        in_Condition: (_m: any) => true,
        out_Annotations: (m: any, _drawingData: IPlanSvgDrawing) => {
            return [
                {
                    start: new Vector3(0, 0, 0),
                    end: new Vector3(0, m.mod_CountertopThk ?? 50, 0),
                    layer: 'carcase-dimension-elevation',
                    tags: ['overall', 'carcase'],
                },
                {
                    start: new Vector3(0, 0, 0),
                    end: new Vector3(0, 0, m.mod_CountertopDepth),
                    layer: 'accessory-dimension-horizontal',
                    tags: ['overall', 'carcase'],
                },
                {
                    start: new Vector3(0, 0, 0),
                    end: new Vector3(m.mod_CountertopWidth, 0, 0),
                    layer: 'accessory-dimension-horizontal',
                    tags: ['overall', 'carcase'],
                }
            ];
        }
    },

    {
        in_ModuleId: 'mr_StorageunitSingle,mr_CornerunitStraight',
        in_Condition: (m: any, drawingData: IPlanSvgDrawing) => {
            return (
                (m.mod_CreateCountertop || m.mod_CreatePaneltop)
                && drawingData.drawingDirection === DrawingDirection.Top
            );
        }, // apply to all modules with the specified ID
        out_SvgPathOverlays: (m: any) => {
            // dashed line around the module if it is covered with a countertop
            const yPosition = m.mod_Height + (m.mod_PlinthAreaDesign_matrix.PlinthAreaType !== 'None' ? (m.mod_PlinthAreaHeight ?? 0) : 0);
            return [
                {
                    d: [
                        { command: 'M', coordinate3d: new Vector3(0, yPosition, 0) },
                        { command: 'L', coordinate3d: new Vector3(m.mod_Width, yPosition, 0) },
                        { command: 'L', coordinate3d: new Vector3(m.mod_Width, yPosition, m.mod_Depth) },
                        { command: 'L', coordinate3d: new Vector3(0, yPosition, m.mod_Depth) },
                        { command: 'Z' }
                    ],
                    fill: 'none',
                    stroke: '#000000',
                    tags: ['overall', 'carcase'],
                    strokeDasharray: '10,10',
                    strokeWidth: '2',
                }
            ];
        },
    },



    {
        in_ModuleId: 'mr_StorageunitSingle',
        in_Condition: (m: any) => { return m._articlePos.y > 100 /** todo: base on mod_ElementType */ },
        out_SvgPathOverlays: (m: any) => {
            const yPosition = m.mod_Height + (m.mod_PlinthAreaDesign_matrix.PlinthAreaType !== 'None' ? (m.mod_PlinthAreaHeight ?? 0) : 0);
            return [
                {
                    d: [
                        { command: 'M', coordinate3d: new Vector3(0, yPosition, 0) },
                        { command: 'L', coordinate3d: new Vector3(m.mod_Width, yPosition, 0) },
                        { command: 'L', coordinate3d: new Vector3(m.mod_Width, yPosition, m.mod_Depth) },
                        { command: 'L', coordinate3d: new Vector3(0, yPosition, m.mod_Depth) },
                        { command: 'Z' },
                        { command: 'M', coordinate3d: new Vector3(0, yPosition, 0) },
                        { command: 'L', coordinate3d: new Vector3(m.mod_Width, yPosition, m.mod_Depth) },
                        { command: 'Z' },
                        { command: 'M', coordinate3d: new Vector3(m.mod_Width, yPosition, 0) },
                        { command: 'L', coordinate3d: new Vector3(0, yPosition, m.mod_Depth) },
                        { command: 'Z' },
                    ],
                    stroke: '#000000',
                    tags: ['overall', 'carcase'],
                    strokeWidth: '2',
                    fill: 'rgb(112, 112, 112)'
                }
            ];
        }
    },



]