type SplitterAxis = 'x' | 'y'

export interface IAppShell {
  viewportEl: HTMLDivElement
  previewPanelEl: HTMLDivElement
  mountControl(element: HTMLElement): void
  setPreviewImage(imageUrl: string | null): void
  bindSplitters(onLayoutChange: () => void): () => void
}

function queryRequiredElement<T extends HTMLElement>(selector: string, errorMessage: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) {
    throw new Error(errorMessage)
  }
  return element
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function createAppShell(): IAppShell {
  const appEl = queryRequiredElement<HTMLDivElement>('#app', 'Missing #app element')
  const viewportEl = queryRequiredElement<HTMLDivElement>('#viewport-panel', 'Missing #viewport-panel element')
  const controlsEl = queryRequiredElement<HTMLDivElement>('#controls-panel', 'Missing #controls-panel element')
  const previewPanelEl = queryRequiredElement<HTMLDivElement>('#rendered-image-panel', 'Missing #rendered-image-panel element')
  const verticalSplitter = queryRequiredElement<HTMLDivElement>('#splitter-vertical', 'Missing #splitter-vertical element')
  const horizontalSplitter = queryRequiredElement<HTMLDivElement>('#splitter-horizontal', 'Missing #splitter-horizontal element')

  const renderedPreviewImage = document.createElement('img')
  renderedPreviewImage.className = 'preview-image'
  renderedPreviewImage.alt = 'Orthographic render preview'

  const renderedPreviewPlaceholder = previewPanelEl.querySelector<HTMLDivElement>('.preview-placeholder')

  function setPreviewImage(imageUrl: string | null) {
    if (!imageUrl) {
      renderedPreviewImage.remove()
      previewPanelEl.classList.remove('has-image')
      if (renderedPreviewPlaceholder) {
        renderedPreviewPlaceholder.hidden = false
      }
      return
    }

    renderedPreviewImage.src = imageUrl
    if (!renderedPreviewImage.isConnected) {
      previewPanelEl.appendChild(renderedPreviewImage)
    }
    previewPanelEl.classList.add('has-image')
    if (renderedPreviewPlaceholder) {
      renderedPreviewPlaceholder.hidden = true
    }
  }

  function updateSplitPosition(axis: SplitterAxis, pointerClientValue: number) {
    const rect = appEl.getBoundingClientRect()

    if (axis === 'x') {
      const minLeftWidth = 260
      const minRightWidth = 220
      const next = clamp(pointerClientValue - rect.left, minLeftWidth, rect.width - minRightWidth)
      appEl.style.setProperty('--split-x', `${next}px`)
      return
    }

    const minBottomHeight = 120
    const minTopHeight = 180
    const topHeight = clamp(pointerClientValue - rect.top, minTopHeight, rect.height - minBottomHeight)
    const bottomHeight = rect.height - topHeight
    appEl.style.setProperty('--split-y', `${bottomHeight}px`)
  }

  function bindSplitter(splitter: HTMLDivElement, axis: SplitterAxis, onLayoutChange: () => void) {
    const handlePointerDown = (event: PointerEvent) => {
      if (window.matchMedia('(max-width: 980px)').matches) {
        return
      }

      event.preventDefault()
      splitter.classList.add('is-dragging')
      splitter.setPointerCapture(event.pointerId)
      document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
      updateSplitPosition(axis, axis === 'x' ? event.clientX : event.clientY)
      onLayoutChange()
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!splitter.classList.contains('is-dragging')) {
        return
      }

      updateSplitPosition(axis, axis === 'x' ? event.clientX : event.clientY)
      onLayoutChange()
    }

    const stopDragging = (event?: PointerEvent) => {
      if (!splitter.classList.contains('is-dragging')) {
        return
      }

      if (event && splitter.hasPointerCapture(event.pointerId)) {
        splitter.releasePointerCapture(event.pointerId)
      }
      splitter.classList.remove('is-dragging')
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      onLayoutChange()
    }

    splitter.addEventListener('pointerdown', handlePointerDown)
    splitter.addEventListener('pointermove', handlePointerMove)
    splitter.addEventListener('pointerup', stopDragging)
    splitter.addEventListener('pointercancel', stopDragging)

    return () => {
      splitter.removeEventListener('pointerdown', handlePointerDown)
      splitter.removeEventListener('pointermove', handlePointerMove)
      splitter.removeEventListener('pointerup', stopDragging)
      splitter.removeEventListener('pointercancel', stopDragging)
    }
  }

  return {
    viewportEl,
    previewPanelEl,
    mountControl(element: HTMLElement) {
      controlsEl.appendChild(element)
    },
    setPreviewImage,
    bindSplitters(onLayoutChange: () => void) {
      const disposeVerticalSplitter = bindSplitter(verticalSplitter, 'x', onLayoutChange)
      const disposeHorizontalSplitter = bindSplitter(horizontalSplitter, 'y', onLayoutChange)
      return () => {
        disposeVerticalSplitter()
        disposeHorizontalSplitter()
      }
    },
  }
}