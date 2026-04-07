import { textureLevel } from "three/tsl";
import { Vector3 } from "./tc/base";

export interface AnnotablePoint {
    coordinate: Vector3 // coordinate in the scene, relative to the module pivot
}

export interface SvgPathCommand {
    command: 'M' | 'L' | 'Z'; // MoveTo, LineTo, ClosePath
    x?: number; // scene x coordinate for M and L
    y?: number; // scene y coordinate for M and L
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
            return [
                { coordinate: new Vector3(0, 0, 0) }, // example point at the module pivot
                { coordinate: new Vector3(moduleData.mod_Width, 0, 0) }, // example point at the module pivot
                { coordinate: new Vector3(0, 0, moduleData.mod_Depth) }, // example point at the module pivot
                { coordinate: new Vector3(0, moduleData.mod_PlinthAreaHeight, 0) }, // example point at the module pivot
                { coordinate: new Vector3(0, moduleData.mod_PlinthAreaHeight + moduleData.mod_Heigh, 0) }, // example point at the module pivot
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
                        { command: 'M', x: 0, y: 0 },
                        { command: 'L', x: moduleData.mod_Width, y: 0 },
                        { command: 'L', x: moduleData.mod_Width, y: moduleData.mod_Depth },
                        { command: 'L', x: 0, y: moduleData.mod_Depth },
                        { command: 'Z' }
                    ],
                    stroke: '#62ff00',
                    'stroke-dasharray': '10,5',
                    'stroke-width': '1',
                    fill: 'rgba(66, 188, 180, 0.5)'
                }
            ];
        }
    }

]