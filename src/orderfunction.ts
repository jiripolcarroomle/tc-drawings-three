import { filterAnnotationForModule, type I_tab_Annotation } from "./annotationstable";
import { Drawing } from "./drawing.implementation";
import { DrawingDirection, type AnnotablePoint, type Annotation, type SvgInjectionData } from "./drawing.interface";
import type { IRenderOrthoCameraParams, IRenderOrthoCameraResult } from "./orderdrawingrenderer.interface";
import type { IExtendedDrawingRenderSettings } from "./orderdrawingrenderer.theejs.helpers";
import { renderScene } from "./orderdrawingrenderer.threejs";
import { createScene } from "./scene.implementation";
import { Object3DNodeKind, type IOrderSceneNode } from "./scene.interface";
import { filterNodesCloseToWall } from "./wall";

export async function appOrderFunction(o: any, ol: any) {

    const orthoCameraRenderResults: IRenderOrthoCameraResult[] = [];

    // convert order to scene nodes, where the parts are grouped under modules and their world transforms can be calculated
    const orderScene = createScene(o, ol);

    // =================
    // 1. settings and preparations 
    // =================
    const drawingSettings: IExtendedDrawingRenderSettings = {
        material: { color: 0xcccccc, },
        wireframeMaterial: { color: 0x000000, },
        wallsMaterial: {
            color: 0x555500,
            transparent: true, opacity: 0.1,

        },
        wallsWireframeMaterial: { color: 0x000000, },
        // will not fetch meshes and will render bounding boxes of the meshes instead
        doNotFetchMeshes: true,
        // three.js renderer property - angle in degrees between adjacent faces above which an edge will be rendered
        edgesGeometryThresholdAngle: 10,
    }
    const moduleCloseToWallDistanceThreshold = 300; // in mm
    const orthoCameraRenderSettings: IRenderOrthoCameraParams = {
        drawingMaxWidth: 1920 * 2,
        drawingMaxHeight: 1080 * 2,
    }

    const partsNameFilter = (node: IOrderSceneNode) => {
        // filter out tiny parts that are not important for the overview drawings
        if (node.kind === Object3DNodeKind.Part) {
            if (
                [
                    'hinge',
                    'hanger',
                    'drill',
                ].some(x => node.id.toLowerCase().includes(x))
            ) {
                return false;
            }
        }
        return true;
    }
    const getWallsFilter = (relevantWall: IOrderSceneNode | undefined) => {
        return (node: IOrderSceneNode) => {
            if (!relevantWall) {
                return true;
            }
            if (node.kind === Object3DNodeKind.Wall) {
                return node === relevantWall;
            }
            return true;
        }
    }

    // get all content nodes (modules)
    const allModuleNodesIncludingGenerationModules = orderScene.children // root
        .filter(child => child.kind === Object3DNodeKind.Group || child.kind === Object3DNodeKind.PosGroup)
        .flatMap(group => group.children) // pos-groups
        .flatMap(group => group.children) // module + part candidates
        .filter(node => node.kind === Object3DNodeKind.Module);

    const generationModules = allModuleNodesIncludingGenerationModules.filter(moduleNode => moduleNode.orderLineEntry?._isGenerated);

    const allModuleNodes = allModuleNodesIncludingGenerationModules.filter(node => !generationModules.includes(node));

    // get all walls in the order
    const allWalls = orderScene.children.find(child => child.kind === Object3DNodeKind.WallGroup)?.children ?? [];
    // both sides of all walls
    const allWallSides = allWalls.flatMap(wall => {
        const wallData = wall.wallData;
        if (!wallData) {
            return []
        }
        return [
            { wall, side: 'front' as const },
            { wall, side: 'rear' as const },
        ]
    });

    // =================
    // 2. collect relevant renderings
    // =================

    const topView = await renderScene(orderScene, (node) => { void node; return true; }, drawingSettings, { ...orthoCameraRenderSettings, direction: undefined });
    orthoCameraRenderResults.push(topView);

    for (const wallAndSide of allWallSides) {
        const { wall, side } = wallAndSide;
        const modulesCloseToWall = filterNodesCloseToWall(allModuleNodes, wall.wallData!, side === 'rear', moduleCloseToWallDistanceThreshold)
        // nothing -> do not render
        if (!modulesCloseToWall.length) continue;

        const isOwnedByModuleCloseToWall = (node: IOrderSceneNode) => {
            let current: IOrderSceneNode | null = node;
            while (current) {
                if (modulesCloseToWall.includes(current)) {
                    return true;
                }
                current = current.parent;
            }
            return false;
        };

        const renderingFilter = (node: IOrderSceneNode) => {
            // filter by name
            if (!partsNameFilter(node)) {
                return false;
            }
            if (node.kind === Object3DNodeKind.Wall) {
                return getWallsFilter(wall)(node);
            }
            if (node.kind === Object3DNodeKind.Part || node.kind === Object3DNodeKind.Module) {
                return isOwnedByModuleCloseToWall(node);
            }

            return true;
        }


        const cameraDirection = side === 'front' ? wall.wallData?.normalToWall : wall.wallData?.normalToWall.clone().multiply(-1);

        const result = await renderScene(orderScene, renderingFilter, drawingSettings, { ...orthoCameraRenderSettings, direction: cameraDirection });
        orthoCameraRenderResults.push(result);

    }

    // =================
    // 3. make drawings from the renderings
    // =================

    const svgs: SVGElement[] = [];

    orthoCameraRenderResults.forEach((renderResult, index) => {
        const drawing = new Drawing(renderResult, { drawingDirection: index === 0 ? DrawingDirection.Top : DrawingDirection.Elevation });

        renderResult.renderedNodes?.forEach((moduleNode: IOrderSceneNode) => {
            const moduleData = moduleNode.orderLineEntry;
            const nodeMatrix = moduleNode.worldTransform;
            if (!moduleData) { return; }
            const id = moduleData!.modId;
            if (!id) { return; }
            const annotations = filterAnnotationForModule(id, moduleData, drawing);
            if (annotations.length > 0) {
                annotations.forEach((annotation: I_tab_Annotation) => {
                    annotation.out_SvgInjections?.(moduleData)?.forEach((injection: SvgInjectionData) => {
                        drawing.addOverlay(nodeMatrix, injection);
                    });
                    annotation.out_Annotations?.(moduleData)?.forEach((annotation: Annotation) => {
                        drawing.addAnnotation(nodeMatrix, annotation);
                    });
                    annotation.out_AnnotablePoints?.(moduleData)?.forEach((point: AnnotablePoint) => {
                        drawing.addAnnotablePoint(nodeMatrix, { coordinate: point.coordinate });
                    });

                });
            }
        });

        const svg = drawing.render();
        svgs.push(svg);
    });



    return svgs;
}