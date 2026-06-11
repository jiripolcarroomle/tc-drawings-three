import { filterAnnotationForModule, type I_tab_Annotation } from "./drawingapi/utils/annotationstable";
import { Drawing } from "./drawingapi/implementation/drawing";
import { DrawingDirection, type AnnotablePoint, type Annotation, type SvgPathInjectionData } from "./drawingapi/interfaces/drawing";
import type { IRenderOrthoCameraParams, IRenderOrthoCameraResult } from "./drawingapi/interfaces/orderdrawingrenderer";
import type { ISceneGeometryConversionToThreeJsSettings } from "./drawingapi/implementation/orderdrawingrenderer.theejs.helpers";
import { renderScene } from "./drawingapi/implementation/orderdrawingrenderer.threejs";
import { createScene, OrderSceneNode } from "./drawingapi/implementation/scene";
import { Object3DNodeKind, type IOrderSceneNode } from "./drawingapi/interfaces/scene";
import { Vector3 } from "./tc/base";
import { filterNodesCloseToWall } from "./drawingapi/implementation/scene-wall";
import { IdsMap } from "./drawingapi/interfaces/idsmap";

function createFileEntry(result: Map<string, any>, fileName: string, content: string, mimeType: string) {
    result.set(fileName, { content, mimeType });
}

export async function appOrderFunction(o: any, ol: any, result: Map<string, any>, serialized?: any): Promise<void> {

    const orthoCameraRenderResults: IRenderOrthoCameraResult[] = [];

    // convert order to scene nodes, where the parts are grouped under modules and their world transforms can be calculated
    const orderScene = serialized ? OrderSceneNode.deserialize(new IdsMap(), serialized) : createScene(o, ol);

    const serializedScene = (orderScene as OrderSceneNode).serialize();
    const stringifiedScene = JSON.stringify(serializedScene, null, 4);

    const url = URL.createObjectURL(new Blob([stringifiedScene], { type: 'application/json' }));
    const anchorElement = document.createElement('a');
    anchorElement.href = url;
    anchorElement.download = 'stringifiedscene.json';
    anchorElement.click();
    anchorElement.remove();
    URL.revokeObjectURL(url);


    // =================
    // 1. settings and preparations 
    // =================
    const sceneSettings: ISceneGeometryConversionToThreeJsSettings = {
        material: { color: 0xcccccc, },
        wireframeMaterial: { color: 0x000000, },
        wallsMaterial: {
            color: 0x555500,
            transparent: true, opacity: 0.1,
        },
        wallsWireframeMaterial: { color: 0x000000, },
        doNotFetchMeshes: true,
        // three.js renderer property - angle in degrees between adjacent faces above which an edge will be rendered
        edgesGeometryThresholdAngle: 10,
        format: 'png',
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
    const frontsNameFilter = (node: IOrderSceneNode) => {
        // filter out tiny parts that are not important for the overview drawings
        if (node.kind === Object3DNodeKind.Part) {
            if (
                [
                    'part_door',
                    'part_drawer_',
                    'part_fliplift',
                    'part_handle',
                    'part_hinge',
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

    const generationModules = allModuleNodesIncludingGenerationModules.filter(moduleNode => moduleNode.orderLineEntry!['_isGenerated']);

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

    const topView = await renderScene(orderScene, (node) => { void node; return true; }, sceneSettings, { name: 'topview', ...orthoCameraRenderSettings, direction: undefined });
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

        const renderingFilterForFronts = (node: IOrderSceneNode) => {
            // filter by name
            if (!frontsNameFilter(node)) {
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

        const result = await renderScene(orderScene, renderingFilter, sceneSettings, { name: `${wall.id}-${side}-elevation`, ...orthoCameraRenderSettings, direction: cameraDirection });
        orthoCameraRenderResults.push(result);

        // const resultWithoutFronts = await renderScene(orderScene, renderingFilterForFronts, sceneSettings, { name: `${wall.id}-${side}-elevation-without-fronts`, ...orthoCameraRenderSettings, direction: cameraDirection });
        // orthoCameraRenderResults.push(resultWithoutFronts);

    }

    // =================
    // 3. make drawings from the renderings
    // =================

    const imageFileNames: string[] = [];

    orthoCameraRenderResults.forEach((renderResult, index) => {
        const drawing = new Drawing(renderResult, { drawingDirection: index === 0 ? DrawingDirection.Top : DrawingDirection.Elevation });

        // get the walls in the drawing
        const walls = renderResult.renderedNodes?.filter(node => node.kind === Object3DNodeKind.Wall) ?? [];
        walls.forEach(wall => {
            const wallData = wall.wallData;
            if (!wallData) {
                return;
            }
            [
                wallData.segmentStart,
                wallData.segmentEnd,
                wallData.segmentStart.clone().add(new Vector3(0, wallData.wallHeight, 0)),
                wallData.segmentEnd.clone().add(new Vector3(0, wallData.wallHeight, 0)),
            ].forEach((wallEndPoint) => {
                const annotablePoint: AnnotablePoint = {
                    coordinate: wallEndPoint,
                }
                drawing.addAnnotablePoint(wall.worldTransform, annotablePoint);
            });
        });

        renderResult.renderedNodes?.forEach((moduleNode: IOrderSceneNode) => {
            const moduleData = moduleNode.orderLineEntry;
            const nodeMatrix = moduleNode.worldTransform;
            if (!moduleData) { return; }
            const id = moduleData!['modId'];
            if (!id) { return; }
            const annotations = filterAnnotationForModule(id, moduleData, drawing);
            if (annotations.length > 0) {
                annotations.forEach((annotation: I_tab_Annotation) => {
                    const drawingWithoutFronts = renderResult.renderParameters?.name?.includes('elevation-without-fronts');
                    annotation.out_SvgPathOverlays?.(moduleData, drawing)?.forEach((injection: SvgPathInjectionData) => {
                        const tags = injection.tags ?? [];
                        if (
                            (drawingWithoutFronts && tags.includes('inside'))
                            || (!drawingWithoutFronts && !tags.includes('inside'))
                        ) {
                            drawing.addOverlay(nodeMatrix, injection);
                        }
                    });
                    annotation.out_Annotations?.(moduleData, drawing)?.forEach((annotation: Annotation) => {
                        const tags = annotation.tags ?? [];
                        if (
                            (drawingWithoutFronts && tags.includes('inside'))
                            || (!drawingWithoutFronts && !tags.includes('inside'))
                        ) {
                            drawing.addAnnotation(nodeMatrix, annotation);
                        }
                    });
                    annotation.out_AnnotablePoints?.(moduleData, drawing)?.forEach((point: AnnotablePoint) => {
                        drawing.addAnnotablePoint(nodeMatrix, { coordinate: point.coordinate });
                    });

                });
            }
        });

        const svg = drawing.render();

        const fileName = (renderResult.renderParameters?.name ?? `drawing-${index}`) + '.svg';
        imageFileNames.push(fileName);
        createFileEntry(result, fileName, new XMLSerializer().serializeToString(svg), "image/svg+xml");
    });

    let htmlResult = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Drawings</title>
        </head>
        <body>
          ${imageFileNames.map((fileName) => {
        return `<div><h2>${fileName}</h2><img src="${fileName}"></div>`;
    }).join('\n')}
        </body>
        </html>`;
    createFileEntry(result, "Drawings.html", htmlResult, "text/html");

}