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
        return annotation.in_ModuleId === moduleId
            && (annotation.in_ModuleCondition ? annotation.in_ModuleCondition(m, drawingData) : true);
    });
}


export const tab_Annotations: I_tab_Annotation[] = [

    {
        in_ModuleId: 'mr_StorageunitSingle',
        out_AnnotablePoints: (m: any, drawingData: IPlanSvgDrawing) => {
            const top = drawingData.drawingDirection === DrawingDirection.Top;
            const result: AnnotablePoint[] = [
                { coordinate: new Vector3(0, 0, 0) },
                { coordinate: new Vector3(m.mod_Width, 0, 0) },
                { coordinate: new Vector3(0, 0, m.mod_Depth) },
                { coordinate: new Vector3(m.mod_Width, 0, m.mod_Depth) },
            ]
            const plinthAreaHeight = m.mod_PlinthAreaDesign_matrix.PlinthAreaType !== 'None' ? m.mod_PlinthAreaHeight : 0;

            if (top) {
            }
            else {
                result.push({ coordinate: new Vector3(0, plinthAreaHeight + m.mod_Height, 0), notHorizontal: true });
                if (plinthAreaHeight > 0) {
                    result.push({ coordinate: new Vector3(0, plinthAreaHeight, 0), notHorizontal: true, });
                }
            }
            return result;
        },
        out_Annotations: (m: any, drawingData: IPlanSvgDrawing) => {
            return [];
            //const top = drawingData.drawingDirection === DrawingDirection.Top;
            //return (top
            //    ? ([
            //        {
            //            start: new Vector3(0, 0, 0),
            //            end: new Vector3(m.mod_Width, 0, 0),
            //            distance: (0.1 * m._articlePos.y + 200),
            //        }, {
            //            start: new Vector3(0.05 * m._articlePos.y + 50, 0, 0),
            //            end: new Vector3(0.05 * m._articlePos.y + 50, 0, m.mod_Depth),
            //        },
            //    ])
            //    : ([
            //        {
            //            start: new Vector3(0, 0, 0),
            //            end: new Vector3(m.mod_Width, 0, 0),
            //            distance: (- 50),
            //        },
            //    ])
            //);

        },
    },

    {
        in_ModuleId: 'mr_CornerunitStraight',
        in_ModuleCondition: (_m: any) => true, // apply to all modules with the specified ID
        out_AnnotablePoints: (m: any) => {
            return [
                { coordinate: new Vector3(0, 0, 0) },
                { coordinate: new Vector3(m.mod_Width, 0, 0) },
                { coordinate: new Vector3(0, 0, m.mod_Depth) },
                { coordinate: new Vector3(0, m.mod_PlinthAreaHeight, 0), notHorizontal: true },
                { coordinate: new Vector3(0, m.mod_PlinthAreaHeight + m.mod_Height, 0), notHorizontal: true },
            ]
        },
        out_SvgPathOverlays: (_m: any) => { return []; }
    },

    {
        in_ModuleId: 'mc_Backsplash',
        in_ModuleCondition: (_m: any) => true, // apply to all modules with the specified ID
        out_AnnotablePoints: (m: any) => {
            return [
                { coordinate: new Vector3(0, 0, 0) },
                { coordinate: new Vector3(m.mod_BacksplashWidth, 0, 0) },
                { coordinate: new Vector3(0, 0, m.mod_BacksplashThk), notVertical: true },
                { coordinate: new Vector3(0, m.mod_BacksplashHeight, 0), notHorizontal: true },
            ]
        },

        out_SvgPathOverlays: (_m: any) => { return []; }
    },

    {
        in_ModuleId: 'mc_Countertop01',
        in_ModuleCondition: (_m: any) => true, // apply to all modules with the specified ID
        out_AnnotablePoints: (m: any) => {
            return [
                { coordinate: new Vector3(0, 0, 0) },
                { coordinate: new Vector3(m.mod_CountertopWidth, 0, 0) },
                { coordinate: new Vector3(0, 0, m.mod_CountertopDepth ?? 580) },
                { coordinate: new Vector3(0, m.mod_CountertopThk ?? 38, 0), notHorizontal: true, },
            ]
        },

        out_SvgPathOverlays: (_m: any) => { return []; }
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