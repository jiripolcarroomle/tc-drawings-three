import { Vector3 } from "./tc/base";
import { DrawingDirection, type AnnotablePoint, type Annotation, type SvgInjectionData } from "./drawing.interface";



export interface I_tab_Annotation {
    in_ModuleId: string;
    in_ModuleCondition?: (m: any, drawingData: any) => boolean;
    out_AnnotablePoints?: (m: any, drawingData: any) => AnnotablePoint[];
    out_SvgInjections?: (m: any, drawingData: any) => SvgInjectionData[];
    out_Annotations?: (m: any, drawingData: any) => Annotation[];
}


export function filterAnnotationForModule(moduleId: string, moduleData: any, drawingData: any): I_tab_Annotation[] {
    return tab_Annotations.filter(annotation => {
        return annotation.in_ModuleId === moduleId
            && (annotation.in_ModuleCondition ? annotation.in_ModuleCondition(moduleData, drawingData) : true);
    });
}


export const tab_Annotations: I_tab_Annotation[] = [

    {
        in_ModuleId: 'mr_StorageunitSingle',
        out_AnnotablePoints: (moduleData: any) => {
            return [
                { coordinate: new Vector3(0, 0, 0) }, // example point at the module pivot
                { coordinate: new Vector3(moduleData.mod_Width, 0, 0) }, // example point at the module pivot
                { coordinate: new Vector3(0, 0, moduleData.mod_Depth) }, // example point at the module pivot
                { coordinate: new Vector3(0, moduleData.mod_PlinthAreaHeight, 0), notHorizontal: true, }, // example point at the module pivot
                { coordinate: new Vector3(0, moduleData.mod_PlinthAreaHeight + moduleData.mod_Height, 0), notHorizontal: true }, // example point at the module pivot
            ]
        },
        out_Annotations: (moduleData: any, drawingData: any) => {
            const top = drawingData.drawingDirection === DrawingDirection.Top;
            return (top
                ? ([
                    {
                        start: new Vector3(0, 0, 0),
                        end: new Vector3(moduleData.mod_Width, 0, 0),
                        distance: (0.1 * moduleData._articlePos.y + 200),
                    }, {
                        start: new Vector3(0.05 * moduleData._articlePos.y + 50, 0, 0),
                        end: new Vector3(0.05 * moduleData._articlePos.y + 50, 0, moduleData.mod_Depth),
                    },
                ])
                : ([
                    {
                        start: new Vector3(0, 0, 0),
                        end: new Vector3(moduleData.mod_Width, 0, 0),
                        distance: (- 50),
                    },
                ])
            );

        },
    },
    {
        in_ModuleId: 'mr_CornerunitStraight',
        in_ModuleCondition: (_moduleData: any) => true, // apply to all modules with the specified ID
        out_AnnotablePoints: (moduleData: any) => {
            return [
                { coordinate: new Vector3(0, 0, 0) }, // example point at the module pivot
                { coordinate: new Vector3(moduleData.mod_Width, 0, 0) }, // example point at the module pivot
                { coordinate: new Vector3(0, 0, moduleData.mod_Depth) }, // example point at the module pivot
                { coordinate: new Vector3(0, moduleData.mod_PlinthAreaHeight, 0), notHorizontal: true }, // example point at the module pivot
                { coordinate: new Vector3(0, moduleData.mod_PlinthAreaHeight + moduleData.mod_Height, 0), notHorizontal: true }, // example point at the module pivot
            ]
        },
        out_SvgInjections: (_moduleData: any) => { return []; }
    },

    {
        in_ModuleId: 'mc_Backsplash',
        in_ModuleCondition: (_moduleData: any) => true, // apply to all modules with the specified ID
        out_AnnotablePoints: (moduleData: any) => {
            return [
                { coordinate: new Vector3(0, 0, 0) }, // example point at the module pivot
                { coordinate: new Vector3(moduleData.mod_BacksplashWidth, 0, 0) }, // example point at the module pivot
                { coordinate: new Vector3(0, 0, moduleData.mod_BacksplashThk), notVertical: true }, // example point at the module pivot
                { coordinate: new Vector3(0, moduleData.mod_BacksplashHeight, 0), notHorizontal: true }, // example point at the module pivot
            ]
        },

        out_SvgInjections: (_moduleData: any) => { return []; }
    },

    {
        in_ModuleId: 'mc_Countertop01',
        in_ModuleCondition: (_moduleData: any) => true, // apply to all modules with the specified ID
        out_AnnotablePoints: (moduleData: any) => {
            return [
                { coordinate: new Vector3(0, 0, 0) }, // example point at the module pivot
                { coordinate: new Vector3(moduleData.mod_CountertopWidth, 0, 0) }, // example point at the module pivot
                { coordinate: new Vector3(0, 0, moduleData.mod_CountertopDepth) }, // example point at the module pivot
                { coordinate: new Vector3(0, moduleData.mod_CountertopThk, 0), notHorizontal: true, }, // example point at the module pivot
            ]
        },

        out_SvgInjections: (_moduleData: any) => { return []; }
    },

    {
        in_ModuleId: 'mr_StorageunitSingle',
        in_ModuleCondition: (moduleData: any, drawingData: any) => {
            return (
                (moduleData.mod_CreateCountertop || moduleData.mod_CreatePaneltop)
                && drawingData.drawingDirection === DrawingDirection.Top
            );
        }, // apply to all modules with the specified ID
        out_SvgInjections: (moduleData: any) => {
            return [
                {
                    path: [
                        { command: 'M', coordinate3d: new Vector3(0, 0, 0) },
                        { command: 'L', coordinate3d: new Vector3(moduleData.mod_Width, 0, 0) },
                        { command: 'L', coordinate3d: new Vector3(moduleData.mod_Width, 0, moduleData.mod_Depth) },
                        { command: 'L', coordinate3d: new Vector3(0, 0, moduleData.mod_Depth) },
                        { command: 'Z' }
                    ],
                    'fill': 'none',
                    stroke: '#ff0000',
                    'stroke-dasharray': '10,5',
                    'stroke-width': '2',
                }
            ];
        }
    },

    {
        in_ModuleId: 'mf_Door',
        in_ModuleCondition: (_moduleData: any, drawingData: any) => { return drawingData.drawingDirection === DrawingDirection.Top; }, // apply to all modules with the specified ID
        out_SvgInjections: (moduleData: any) => {
            return [
                {
                    path: [
                        { command: 'M', coordinate3d: new Vector3(0, 0, 0) },
                        { command: 'L', coordinate3d: new Vector3(moduleData.mod_FrontWidth ?? 200, 0, 0) },
                        { command: 'L', coordinate3d: new Vector3(moduleData.mod_FrontWidth ?? 200, 0, moduleData.mod_FrontThk ?? 50) },
                        { command: 'L', coordinate3d: new Vector3(0, 0, moduleData.mod_FrontThk ?? 50) },
                        { command: 'Z' }
                    ],
                    'fill': 'none',
                    stroke: '#ff0000',
                    'stroke-dasharray': '10,5',
                    'stroke-width': '2',
                }
            ];
        }
    },


    {
        in_ModuleId: 'mc_Leg01',
        in_ModuleCondition: (_moduleData: any, drawingData: any) => { return drawingData.drawingDirection === DrawingDirection.Top; },
        out_SvgInjections: (_moduleData: any) => {
            return [
                {
                    path: [
                        { command: 'M', coordinate3d: new Vector3(0, 0, 0) },
                        { command: 'L', coordinate3d: new Vector3(50, 0, 50) },
                        { command: 'Z' },
                        { command: 'M', coordinate3d: new Vector3(0, 0, 50) },
                        { command: 'L', coordinate3d: new Vector3(50, 0, 0) },
                        { command: 'Z' },
                    ],
                    'fill': 'none',
                    stroke: '#0000ff',
                    'stroke-dasharray': '10,5',
                    'stroke-width': '2',
                }
            ];
        }
    },

    {
        in_ModuleId: 'mr_CornerunitStraight',
        in_ModuleCondition: (moduleData: any) => { return moduleData.mod_CreateCountertop || moduleData.mod_CreatePaneltop }, // apply to all modules with the specified ID
        out_SvgInjections: (moduleData: any) => {
            return [
                {
                    path: [
                        { command: 'M', coordinate3d: new Vector3(0, 0, 0) },
                        { command: 'L', coordinate3d: new Vector3(moduleData.mod_Width, 0, 0) },
                        { command: 'L', coordinate3d: new Vector3(moduleData.mod_Width, 0, moduleData.mod_Depth) },
                        { command: 'L', coordinate3d: new Vector3(0, 0, moduleData.mod_Depth) },
                        { command: 'Z' }
                    ],
                    'fill': 'none',
                    stroke: '#00ff00',
                    'stroke-dasharray': '10,5',
                    'stroke-width': '2',
                }
            ];
        }
    },


    {
        in_ModuleId: 'mr_StorageunitSingle',
        in_ModuleCondition: (moduleData: any, drawingData: any) => { return moduleData._articlePos.y > 100 /** todo: base on mod_ElementType */ },
        out_SvgInjections: (moduleData: any) => {
            return [
                {
                    path: [
                        { command: 'M', coordinate3d: new Vector3(0, 0, 0) },
                        { command: 'L', coordinate3d: new Vector3(moduleData.mod_Width, 0, 0) },
                        { command: 'L', coordinate3d: new Vector3(moduleData.mod_Width, 0, moduleData.mod_Depth) },
                        { command: 'L', coordinate3d: new Vector3(0, 0, moduleData.mod_Depth) },
                        { command: 'Z' },
                        { command: 'M', coordinate3d: new Vector3(0, 0, 0) },
                        { command: 'L', coordinate3d: new Vector3(moduleData.mod_Width, 0, moduleData.mod_Depth) },
                        { command: 'Z' },
                        { command: 'M', coordinate3d: new Vector3(moduleData.mod_Width, 0, 0) },
                        { command: 'L', coordinate3d: new Vector3(0, 0, moduleData.mod_Depth) },
                        { command: 'Z' },
                    ],
                    stroke: '#2600ff',
                    'stroke-width': '2',
                    fill: 'rgba(217, 255, 0, 1)'
                }
            ];
        }
    },



]