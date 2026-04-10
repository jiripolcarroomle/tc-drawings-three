import { textureLevel } from "three/tsl";
import { Vector3 } from "./tc/base";

export interface AnnotablePoint {
    coordinate: Vector3 // coordinate in the scene, relative to the module pivot
}

export interface SvgPathCommand {
    command: 'M' | 'L' | 'Z'; // MoveTo, LineTo, ClosePath
    coordinate3d?: Vector3; // 3D coordinate in the scene, relative to the module pivot
}

export interface SvgInjection {
    fill?: string;
    stroke?: string;
    'stroke-dasharray'?: string;
    'stroke-width'?: string;
    path: SvgPathCommand[];
}

export interface IAnnotation {
    in_ModuleId: string;
    in_ModuleCondition: (moduleData: any) => boolean;
    in_DrawingCondition: (drawingData: any) => boolean;
    out_AnnotablePoints: (moduleData: any) => AnnotablePoint[];
    out_SvgInjections: (moduleData: any) => SvgInjection[];
}


export function filterAnnotationForModule(moduleId: string, moduleData: any, drawingData: any): IAnnotation[] {
    return tab_Annotations.filter(annotation => {
        return annotation.in_ModuleId === moduleId
            && annotation.in_ModuleCondition(moduleData)
            && annotation.in_DrawingCondition(drawingData);
    });
}


export const tab_Annotations: IAnnotation[] = [

    {
        in_ModuleId: 'mr_StorageunitSingle',
        in_ModuleCondition: (moduleData: any) => true, // apply to all modules with the specified ID
        in_DrawingCondition: (drawingData: any) => true, // apply to all drawings
        out_AnnotablePoints: (moduleData: any) => {
            return  [
                { coordinate: new Vector3(0, 0, 0) }, // example point at the module pivot
                { coordinate: new Vector3(moduleData.mod_Width, 0, 0) }, // example point at the module pivot
                { coordinate: new Vector3(0, 0, moduleData.mod_Depth) }, // example point at the module pivot
                { coordinate: new Vector3(0, moduleData.mod_PlinthAreaHeight, 0) }, // example point at the module pivot
                { coordinate: new Vector3(0, moduleData.mod_PlinthAreaHeight + moduleData.mod_Height, 0) }, // example point at the module pivot
            ]
        },
        out_SvgInjections: (moduleData: any) => { return []; }
    },

    {
        in_ModuleId: 'mr_CornerunitStraight',
        in_ModuleCondition: (moduleData: any) => true, // apply to all modules with the specified ID
        in_DrawingCondition: (drawingData: any) => true, // apply to all drawings
        out_AnnotablePoints: (moduleData: any) => {
            return [
                { coordinate: new Vector3(0, 0, 0) }, // example point at the module pivot
                { coordinate: new Vector3(moduleData.mod_Width, 0, 0) }, // example point at the module pivot
                { coordinate: new Vector3(0, 0, moduleData.mod_Depth) }, // example point at the module pivot
                { coordinate: new Vector3(0, moduleData.mod_PlinthAreaHeight, 0) }, // example point at the module pivot
                { coordinate: new Vector3(0, moduleData.mod_PlinthAreaHeight + moduleData.mod_Height, 0) }, // example point at the module pivot
            ]
        },
        out_SvgInjections: (moduleData: any) => { return []; }
    },

    {
        in_ModuleId: 'mc_Backsplash',
        in_ModuleCondition: (moduleData: any) => true, // apply to all modules with the specified ID
        in_DrawingCondition: (drawingData: any) => true, // apply to all drawings
        out_AnnotablePoints: (moduleData: any) => {
            return [
                { coordinate: new Vector3(0, 0, 0) }, // example point at the module pivot
                { coordinate: new Vector3(moduleData.mod_BacksplashWidth, 0, 0) }, // example point at the module pivot
                { coordinate: new Vector3(0, 0, moduleData.mod_BacksplashThk) }, // example point at the module pivot
                { coordinate: new Vector3(0, moduleData.mod_BacksplashHeight, 0) }, // example point at the module pivot
            ]
        },

        out_SvgInjections: (moduleData: any) => { return []; }
    },

        {
        in_ModuleId: 'mc_Countertop01',
        in_ModuleCondition: (moduleData: any) => true, // apply to all modules with the specified ID
        in_DrawingCondition: (drawingData: any) => true, // apply to all drawings
        out_AnnotablePoints: (moduleData: any) => {
            return [
                { coordinate: new Vector3(0, 0, 0) }, // example point at the module pivot
                { coordinate: new Vector3(moduleData.mod_CountertopWidth, 0, 0) }, // example point at the module pivot
                { coordinate: new Vector3(0, 0, moduleData.mod_CountertopDepth) }, // example point at the module pivot
                { coordinate: new Vector3(0, moduleData.mod_CountertopThk, 0) }, // example point at the module pivot
            ]
        },

        out_SvgInjections: (moduleData: any) => { return []; }
    },

    {
        in_ModuleId: 'mr_StorageunitSingle',
        in_ModuleCondition: (moduleData: any) => { return moduleData.mod_CreateCountertop || moduleData.mod_CreatePaneltop }, // apply to all modules with the specified ID
        in_DrawingCondition: (drawingData: any) => { return true; }, // apply to all drawings
        out_AnnotablePoints: (moduleData: any) => { return []; },
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
                    stroke: '#ff0000',
                    'stroke-dasharray': '10,5',
                    'stroke-width': '2',
                }
            ];
        }
    },


    {
        in_ModuleId: 'mc_Leg01',
        in_ModuleCondition: (moduleData: any) => { return true; },
        in_DrawingCondition: (drawingData: any) => { return true; }, // apply to all drawings
        out_AnnotablePoints: (moduleData: any) => { return []; },
        out_SvgInjections: (moduleData: any) => {
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
        in_DrawingCondition: (drawingData: any) => { return true; }, // apply to all drawings
        out_AnnotablePoints: (moduleData: any) => { return []; },
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
                    stroke: '#00ff00',
                    'stroke-dasharray': '10,5',
                    'stroke-width': '2',
                }
            ];
        }
    },


    {
        in_ModuleId: 'mr_StorageunitSingle',
        in_ModuleCondition: (moduleData: any) => { return moduleData._articlePos.y > 100 /** todo: base on mod_ElementType */ }, 
        in_DrawingCondition: (drawingData: any) => { return true; /** todo: top view only */ },
        out_AnnotablePoints: (moduleData: any) => { return []; },
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