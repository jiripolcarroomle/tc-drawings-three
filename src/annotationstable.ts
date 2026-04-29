import { Vector3 } from "./tc/base";
import { DrawingDirection, type AnnotablePoint, type Annotation, type SvgPathInjectionData } from "./drawing.interface";



export interface I_tab_Annotation {
    in_ModuleId: string;
    in_ModuleCondition?: (m: any, drawingData: any) => boolean;
    out_AnnotablePoints?: (m: any, drawingData: any) => AnnotablePoint[];
    out_SvgPathOverlays?: (m: any, drawingData: any) => SvgPathInjectionData[];
    out_Annotations?: (m: any, drawingData: any) => Annotation[];
}


export function filterAnnotationForModule(moduleId: string, m: any, drawingData: any): I_tab_Annotation[] {
    return tab_Annotations.filter(annotation => {
        return annotation.in_ModuleId === moduleId
            && (annotation.in_ModuleCondition ? annotation.in_ModuleCondition(m, drawingData) : true);
    });
}


export const tab_Annotations: I_tab_Annotation[] = [

    {
        in_ModuleId: 'mr_StorageunitSingle',
        out_AnnotablePoints: (m: any) => {
            return [
                { coordinate: new Vector3(0, 0, 0) }, // example point at the module pivot
                { coordinate: new Vector3(m.mod_Width, 0, 0) }, // example point at the module pivot
                { coordinate: new Vector3(0, 0, m.mod_Depth) }, // example point at the module pivot
                { coordinate: new Vector3(0, m.mod_PlinthAreaHeight, 0), notHorizontal: true, }, // example point at the module pivot
                { coordinate: new Vector3(0, m.mod_PlinthAreaHeight + m.mod_Height, 0), notHorizontal: true }, // example point at the module pivot
            ]
        },
        out_Annotations: (m: any, drawingData: any) => {
            const top = drawingData.drawingDirection === DrawingDirection.Top;
            return (top
                ? ([
                    {
                        start: new Vector3(0, 0, 0),
                        end: new Vector3(m.mod_Width, 0, 0),
                        distance: (0.1 * m._articlePos.y + 200),
                    }, {
                        start: new Vector3(0.05 * m._articlePos.y + 50, 0, 0),
                        end: new Vector3(0.05 * m._articlePos.y + 50, 0, m.mod_Depth),
                    },
                ])
                : ([
                    {
                        start: new Vector3(0, 0, 0),
                        end: new Vector3(m.mod_Width, 0, 0),
                        distance: (- 50),
                    },
                ])
            );

        },
    },
    {
        in_ModuleId: 'mr_CornerunitStraight',
        in_ModuleCondition: (_m: any) => true, // apply to all modules with the specified ID
        out_AnnotablePoints: (m: any) => {
            return [
                { coordinate: new Vector3(0, 0, 0) }, // example point at the module pivot
                { coordinate: new Vector3(m.mod_Width, 0, 0) }, // example point at the module pivot
                { coordinate: new Vector3(0, 0, m.mod_Depth) }, // example point at the module pivot
                { coordinate: new Vector3(0, m.mod_PlinthAreaHeight, 0), notHorizontal: true }, // example point at the module pivot
                { coordinate: new Vector3(0, m.mod_PlinthAreaHeight + m.mod_Height, 0), notHorizontal: true }, // example point at the module pivot
            ]
        },
        out_SvgPathOverlays: (_m: any) => { return []; }
    },

    {
        in_ModuleId: 'mc_Backsplash',
        in_ModuleCondition: (_m: any) => true, // apply to all modules with the specified ID
        out_AnnotablePoints: (m: any) => {
            return [
                { coordinate: new Vector3(0, 0, 0) }, // example point at the module pivot
                { coordinate: new Vector3(m.mod_BacksplashWidth, 0, 0) }, // example point at the module pivot
                { coordinate: new Vector3(0, 0, m.mod_BacksplashThk), notVertical: true }, // example point at the module pivot
                { coordinate: new Vector3(0, m.mod_BacksplashHeight, 0), notHorizontal: true }, // example point at the module pivot
            ]
        },

        out_SvgPathOverlays: (_m: any) => { return []; }
    },

    {
        in_ModuleId: 'mc_Countertop01',
        in_ModuleCondition: (_m: any) => true, // apply to all modules with the specified ID
        out_AnnotablePoints: (m: any) => {
            return [
                { coordinate: new Vector3(0, 0, 0) }, // example point at the module pivot
                { coordinate: new Vector3(m.mod_CountertopWidth, 0, 0) }, // example point at the module pivot
                { coordinate: new Vector3(0, 0, m.mod_CountertopDepth) }, // example point at the module pivot
                { coordinate: new Vector3(0, m.mod_CountertopThk, 0), notHorizontal: true, }, // example point at the module pivot
            ]
        },

        out_SvgPathOverlays: (_m: any) => { return []; }
    },

    {
        in_ModuleId: 'mr_StorageunitSingle',
        in_ModuleCondition: (m: any, drawingData: any) => {
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
                    stroke: '#ff0000',
                    strokeDasharray: '10,10',
                    strokeWidth: '2',
                }
            ];
        }
    },

    {
        in_ModuleId: 'mf_Door',
        in_ModuleCondition: (_m: any, drawingData: any) => { return drawingData.drawingDirection === DrawingDirection.Top; }, // apply to all modules with the specified ID
        out_SvgPathOverlays: (m: any) => {
            return [
                {
                    d: [
                        { command: 'M', coordinate3d: new Vector3(0, 0, 0) },
                        { command: 'L', coordinate3d: new Vector3(m.mod_FrontWidth ?? 200, 0, 0) },
                        { command: 'L', coordinate3d: new Vector3(m.mod_FrontWidth ?? 200, 0, m.mod_FrontThk ?? 50) },
                        { command: 'L', coordinate3d: new Vector3(0, 0, m.mod_FrontThk ?? 50) },
                        { command: 'Z' }
                    ],
                    fill: 'none',
                    stroke: '#ff0000',
                    strokeDasharray: '10,5',
                    strokeWidth: '2',
                }
            ];
        }
    },


    {
        in_ModuleId: 'mc_Leg01',
        in_ModuleCondition: (_m: any, drawingData: any) => { return drawingData.drawingDirection === DrawingDirection.Top; },
        out_SvgPathOverlays: (_m: any) => {
            return [
                {
                    d: [
                        { command: 'M', coordinate3d: new Vector3(0, 0, 0) },
                        { command: 'L', coordinate3d: new Vector3(50, 0, 50) },
                        { command: 'Z' },
                        { command: 'M', coordinate3d: new Vector3(0, 0, 50) },
                        { command: 'L', coordinate3d: new Vector3(50, 0, 0) },
                        { command: 'Z' },
                    ],
                    fill: 'none',
                    stroke: '#0000ff',
                    strokeDasharray: '10,5',
                    strokeWidth: '2',
                }
            ];
        }
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
        in_ModuleCondition: (m: any, drawingData: any) => { return m._articlePos.y > 100 /** todo: base on mod_ElementType */ },
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
                    stroke: '#2600ff',
                    strokeWidth: '2',
                    fill: 'rgba(217, 255, 0, 1)'
                }
            ];
        }
    },



]