import type { IRenderOrthoCameraParams, IRenderOrthoCameraResult } from "./drawingrenderer.intefaces";
import type { IExtendedDrawingRenderSettings } from "./drawingrenderer.theejs.helpers";
import { renderScene } from "./drawingrenderer.threejs";
import { createScene } from "./scene.implementation";
import { Object3DNodeKind, type IOrderSceneNode } from "./scene.interfaces";
import { filterNodesCloseToWall } from "./wall";

export async function appOrderFunction(o: any, ol: any) {

    const results: IRenderOrthoCameraResult[] = [];

    // convert order to scene nodes
    const orderScene = createScene(o, ol);

    // settings
    const drawingSettings: IExtendedDrawingRenderSettings = {
        material: {
            color: 0xcccccc,
            // three.js properties - he edges to avoid z-fighting with the edge lines
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1,
        },
        wireframeMaterial: {
            color: 0x000000,
        },
        wallsMaterial: {
            color: 0x555555,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1,
        },
        // will not fetch meshes and will render bounding boxes of the meshes instead
        doNotFetchMeshes: true,
        // three.js property - angle in degrees between adjacent faces above which an edge will be rendered
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
    const allModuleNodes = orderScene.children // root
        .filter(child => child.kind === Object3DNodeKind.Group || child.kind === Object3DNodeKind.PosGroup)
        .flatMap(group => group.children) // pos-groups
        .flatMap(group => group.children) // module + part candidates
        .filter(node => node.kind === Object3DNodeKind.Module);

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

    const topView = await renderScene(orderScene, (node) => { void node; return true; }, drawingSettings, { ...orthoCameraRenderSettings, direction: undefined });
    results.push(topView);

    for (const wallAndSide of allWallSides) {
        const { wall, side } = wallAndSide;
        const modulesCloseToWall = filterNodesCloseToWall(allModuleNodes, wall.wallData!, side === 'rear', moduleCloseToWallDistanceThreshold)
        // nothing -> do not render
        if (!modulesCloseToWall.length) continue;

        const renderingFilter = (node: IOrderSceneNode) => {
            // filter by name
            if (!partsNameFilter(node)) {
                return false;
            }
            if (node.kind === Object3DNodeKind.Wall) {
                return getWallsFilter(wall)(node);
            }
            if (node.kind === Object3DNodeKind.Part) {
                // filter by owner module proximity to wall
                let parent = node.parent
                while (parent) {
                    if (modulesCloseToWall.includes(parent)) {
                        return true;
                    }
                    parent = parent.parent
                }
                return false;
            }

            return true;
        }


        const cameraDirection = side === 'front' ? wall.wallData?.normalToWall : wall.wallData?.normalToWall.copy().scale(-1);

        const result = await renderScene(orderScene, renderingFilter, drawingSettings, { ...orthoCameraRenderSettings, direction: cameraDirection });
        if (!result.data) { result.data = {}; }
        result.data.modulesCloseToWall = modulesCloseToWall;
        results.push(result);

        // do something with the result, e.g. display the rendered image
        console.log(`Rendered image for wall ${wall.id} (${side} side) with ${modulesCloseToWall.length} close modules:`);
    }






    return results;
}