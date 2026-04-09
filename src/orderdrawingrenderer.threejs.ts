// Both TC and THREE have a Matrix4 and Vector3 class, maybe also further overlapping types in the future.
// Keep the *-as imports for legibility.
import * as THREE from "three";
import * as TC from "./tc/base";
import type { IRenderDrawing, IRenderOrthoCameraParams, IRenderOrthoCameraResult } from "./orderdrawingrenderer.interface";
import type { IOrderSceneNode } from "./scene.interface";
import { type IExtendedDrawingRenderSettings, sceneToThreeJsScene, _resolveUpVector, _getBox3Corners, rasterRenderer } from "./orderdrawingrenderer.theejs.helpers";

/**
 * Render the scene with an orthographic camera based on the provided settings, and return the rendered data along with the camera settings used.
 * @param sceneRoot the root node of the scene to render
 * @param settings @see IRenderOrthoCameraParams
 * @returns @see IRenderOrthoCameraResult
 */
export const renderScene: IRenderDrawing = async function (
    sceneRoot: IOrderSceneNode,
    filter: ((node: IOrderSceneNode) => boolean) | undefined = undefined,
    drawingSettings: IExtendedDrawingRenderSettings,
    settings: IRenderOrthoCameraParams
): Promise<IRenderOrthoCameraResult> {

    // Build a Three.js scene from the provided scene root and render settings
    // with filtered out nodes.
    const threeScene: THREE.Scene = await sceneToThreeJsScene(sceneRoot, drawingSettings, filter);

    // Get the size of the scene. The camera will be set so that the whole scene fits into the view.
    const sceneBoundingBox = new THREE.Box3().setFromObject(threeScene);
    if (sceneBoundingBox.isEmpty()) {
        sceneBoundingBox.set(
            new THREE.Vector3(-0.5, -0.5, -0.5),
            new THREE.Vector3(0.5, 0.5, 0.5)
        );
    }
    const boundingBoxCenter = sceneBoundingBox.getCenter(new THREE.Vector3());
    const bboxSize = sceneBoundingBox.getSize(new THREE.Vector3());
    const bboxRadius = Math.max(bboxSize.length() * 0.5, 1);
    // fallback to top-view as per interface definition
    const direction = settings.direction
        ? new THREE.Vector3(settings.direction._x, settings.direction._y, settings.direction._z)
        : new THREE.Vector3(0, -1, 0);
    if (direction.lengthSq() < 1e-12) {
        direction.set(0, -1, 0);
    }
    direction.normalize();

    const cameraDistance = bboxRadius * 3;
    const cameraPosition = boundingBoxCenter.clone().sub(direction.clone().multiplyScalar(cameraDistance));
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.copy(cameraPosition);
    camera.up.copy(_resolveUpVector(direction));
    camera.lookAt(boundingBoxCenter);
    camera.updateMatrixWorld(true);

    // We need to get size of the rotated bounding box to properly set the orthographic camera parameters,
    // so we transform the bounding box corners into the camera's local space and find the extents there.

    const boxCorners = _getBox3Corners(sceneBoundingBox);
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (const corner of boxCorners) {
        const p = corner.clone().applyMatrix4(camera.matrixWorldInverse);
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
    }

    const extentPadding = Math.max(1e-4, Math.max(maxX - minX, maxY - minY) * 0.01);
    const nearFarPadding = Math.max(1e-4, (maxZ - minZ) * 0.01);

    const computedLeft = minX - extentPadding;
    const computedRight = maxX + extentPadding;
    const computedTop = maxY + extentPadding;
    const computedBottom = minY - extentPadding;
    const computedNear = Math.max(1e-4, -maxZ - nearFarPadding);
    const computedFar = Math.max(computedNear + 1e-3, -minZ + nearFarPadding);

    camera.left = settings.left ?? computedLeft;
    camera.right = settings.right ?? computedRight;
    camera.top = settings.top ?? computedTop;
    camera.bottom = settings.bottom ?? computedBottom;
    camera.near = settings.near ?? computedNear;
    camera.far = settings.far ?? computedFar;
    camera.updateProjectionMatrix();



    // compute image size so that the image is not streched in width or height and does not exceed the maximum
    const outputWidth = settings.drawingMaxWidth ?? 1200;
    const outputHeight = settings.drawingMaxHeight ?? 800;

    const frustrumRatio = (camera.right - camera.left) / (camera.top - camera.bottom);
    const imageRatio = outputWidth / outputHeight;

    const scale = frustrumRatio > imageRatio
        ? (camera.right - camera.left) / outputWidth
        : (camera.top - camera.bottom) / outputHeight;

    const adjustedWidth = Math.ceil((camera.right - camera.left) / scale);
    const adjustedHeight = Math.ceil((camera.top - camera.bottom) / scale);



    const pngDataUrl = rasterRenderer(threeScene, camera, adjustedWidth, adjustedHeight);

    const imageSpaceMatrix = new TC.Matrix4().set(
        adjustedWidth / 2, 0, 0, adjustedWidth / 2,
        0, -adjustedHeight / 2, 0, adjustedHeight / 2,
        0, 0, 0.5, 0.5,
        0, 0, 0, 1,
    );
    const worldToViewMatrix = imageSpaceMatrix
        .multiply(new TC.Matrix4().fromArray(camera.projectionMatrix.elements))
        .multiply(new TC.Matrix4().fromArray(camera.matrixWorldInverse.elements));




    return {
        worldToViewMatrix,
        image: { image: pngDataUrl },
        renderedScene: threeScene,
        imageHeight: adjustedHeight,
        imageWidth: adjustedWidth,
    };

}
