'use client'

import { Grid } from '@/3d-components/grid'
import type IfcItem from '@/classes/ifc-item'
import IfcMesh from '@/classes/ifc-mesh'
import IfcModel from '@/classes/ifc-model'
import type { MouseState } from '@/types/mouse-status'
import { filterIfcItemsByPropertiesAndType, setIfcData } from '@/utils/ifc/properties-util'
import { restoreData } from '@/utils/ifc/save-utils/save-util'
import alignObject from '@/utils/three/align-object/align-object'
import { createBoundingSphere, createSphereMesh, fitBoundingSphere } from '@/utils/three/camera-utils'
import { disposeObjects } from '@/utils/three/dispose-utils'
import { loadIfcFile } from '@/utils/three/ifc-loader'
import clsx from 'clsx'
import { ArrowUpIcon, BarChart2, EyeIcon, HouseIcon } from 'lucide-react'
import {
	forwardRef,
	useCallback,
	useEffect,
	useRef,
	useState,
	type CSSProperties,
	type HTMLAttributes,
	type MouseEvent,
} from 'react'
import type {
	IfcData,
	LambertMesh,
	LinkRequirements,
	Property,
	Requirements,
	SelectableRequirements,
} from 'src/types/types'
import {
	AmbientLight,
	DirectionalLight,
	MeshLambertMaterial,
	PerspectiveCamera,
	Raycaster,
	Scene,
	Vector2,
	WebGLRenderer,
	type Intersection,
	type Sphere,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/Addons.js'
import './ifc-viewer.css'
import type { VisibleMarker } from '@/types/visible-marker'

const LAYER_MESHES = 0
const LAYER_HELPERS = 29

type On3DModelLoadedType = (ifc: {
	model?: IfcModel
	selectableItems: IfcItem[]
	selectByProperty: (property: Property) => IfcItem | undefined
	selectByExpressId: (expressId: number | undefined) => void
}) => void

type ViewMode = 'VIEW_MODE_ALL' | 'VIEW_MODE_TRANSPARENT' | 'VIEW_MODE_SELECTABLE'
type Status = 'NOT_INITIALIZED' | 'READY' | 'MODEL_LOADED' | 'ERROR'

type IfcViewerProps = HTMLAttributes<HTMLDivElement> & {
	url: string
	data?: IfcData

	hoverColor: number
	selectedColor: number

	onLoad?: On3DModelLoadedType

	visibleMarkers?: VisibleMarker[]

	links?: LinkRequirements[]
	selectable?: SelectableRequirements[]
	alwaysVisible?: Requirements[]
	anchors?: Requirements[]

	highlightedSelectables?: SelectableRequirements[]
	// showTooltip?: ReactNode

	onMeshSelect?: (ifcItem?: IfcItem) => void
	onMeshHover?: (ifcItem?: IfcItem) => void

	showBoundingSphere?: boolean
	enableMeshSelection?: boolean
	enableMeshHover?: boolean
}

const IfcViewer = forwardRef<HTMLDivElement, IfcViewerProps>((props, ref) => {
	const {
		url,
		data,

		hoverColor = 0x00498a,
		selectedColor = 0x16a34a,

		onLoad,

		// visibleMarkers,

		links: linksRequirements,
		selectable: selectableRequirements,
		alwaysVisible: alwaysVisibleRequirements,
		anchors: anchorRequirements,

		onMeshHover,
		onMeshSelect,

		enableMeshHover = false,
		enableMeshSelection = false,
		showBoundingSphere = false,

		className,
		...otherProps
	} = props

	const containerRef = useRef<HTMLDivElement>(null)
	const canvasRef = useRef<HTMLCanvasElement>(null)

	const rendererRef = useRef<WebGLRenderer>()
	const cameraRef = useRef<PerspectiveCamera>()
	const controlsRef = useRef<OrbitControls>()

	const animationFrameIdRef = useRef<number>()

	const sceneRef = useRef<Scene>(new Scene())
	const modelRef = useRef<IfcModel>(new IfcModel())
	const rayCasterRef = useRef<Raycaster>(new Raycaster())

	const pointerRef = useRef<Vector2>(new Vector2())

	const boundingSphereRef = useRef<Sphere>()
	const boundingSphereMeshRef = useRef<LambertMesh>()

	const selectedIfcItemRef = useRef<IfcItem>()
	const previousSelectedIfcItemRef = useRef<IfcItem>()
	const hoveredIfcItemRef = useRef<IfcItem>()
	const previousHoveredIfcItemRef = useRef<IfcItem>()
	// const originalMaterialsRef = useRef<Map<Mesh, MeshLambertMaterial | ShaderMaterial>>(new Map())

	const selectableIntersectionsRef = useRef<Intersection<IfcMesh>[]>([])
	const statusRef = useRef<Status>('NOT_INITIALIZED')
	const mouseStatusRef = useRef<MouseState>({ clicked: false, x: 0, y: 0 })

	const resizeObserverRef = useRef<ResizeObserver>()

	const renderingEnabledRef = useRef(false)
	const renderingTimeoutRef = useRef<ReturnType<typeof setTimeout>>()

	const [viewMode, setViewMode] = useState<ViewMode>('VIEW_MODE_ALL')
	const viewModeRef = useRef<ViewMode>(viewMode)

	const [cursorStyle, setCursorStyle] = useState<CSSProperties>({ cursor: 'default' })

	useEffect(() => {
		if (ref) {
			if (typeof ref === 'function') {
				ref(containerRef.current)
			} else {
				ref.current = containerRef.current
			}
		}
	}, [ref])

	// const [anchors, setAnchors] = useState<Anchor[]>([])

	// const markersPositionsMap = useRef(new Map<number, Vector3[]>())

	// const updateAnchors = useCallback((): void => {
	// 	setAnchors(anchorsList => {
	// 		const newAnchors: Anchor[] = []

	// 		for (const anchor of anchorsList) {
	// 			const newAnchor = {
	// 				...anchor,
	// 				position2d: transformViewportPositionToScreenPosition(anchor.position3d),
	// 			}
	// 			newAnchors.push(newAnchor)
	// 		}

	// 		return newAnchors
	// 	})
	// }, [])

	// const generateAnchorPositionsFromValues = useCallback((): void => {
	// 	if (!markableRequirements) return
	// 	if (!modelRef.current) return
	// 	// Find meshes that meet the requirements
	// 	const meshesToMark: IfcMesh[] = []
	// 	const selectableMeshes = getSelectableMeshes(modelRef.current)
	// 	for (const selectableMesh of selectableMeshes) {
	// 		const relatives = selectableMesh.userData.relatives
	// 		if (relatives)
	// 			for (const relative of relatives) {
	// 				for (const mesh of modelRef.current.children) {
	// 					if (mesh.userData['expressId'] === relative.expressId) {
	// 						mesh.userData = { ...mesh.userData, ...relative }
	// 						meshesToMark.push(mesh as IfcMesh)
	// 					}
	// 				}
	// 			}
	// 	}

	// 	for (const mesh of meshesToMark) {
	// 		for (const markableRequirement of markableRequirements) {
	// 			const position = new Vector3()
	// 			const box3 = new Box3()
	// 			box3.setFromObject(mesh)
	// 			box3.getCenter(position)

	// 			const markerId = mesh.userData.values?.[markableRequirement.propertyToUseAsMarkerId]

	// 			if (!markerId) continue
	// 			const markerAsNumber = Number(markerId)

	// 			let markerPositionsArray = markersPositionsMap.current.get(markerAsNumber)
	// 			if (!markerPositionsArray) {
	// 				markerPositionsArray = []
	// 				markersPositionsMap.current.set(markerAsNumber, markerPositionsArray)
	// 			}

	// 			markerPositionsArray.push(position)
	// 		}
	// 	}
	// }, [markableRequirements])

	// const generateAnchorsPositionsFromProperties = useCallback((): void => {
	// 	if (!modelRef.current || !markableRequirements) return

	// 	for (const mesh of modelRef.current.children as IfcMesh[]) {
	// 		for (const markableRequirement of markableRequirements) {
	// 			if (checkIfMeshPropertiesMeetsRequirements(mesh.userData, markableRequirement)) {
	// 				const position = new Vector3()
	// 				const box3 = new Box3()
	// 				box3.setFromObject(mesh)
	// 				box3.getCenter(position)

	// 				const markerId = findPropertyValueFromIfcMesh(mesh, markableRequirement.propertyToUseAsMarkerId)

	// 				if (!markerId) continue
	// 				const markerAsNumber = Number(markerId)

	// 				let markerPositionsArray = markersPositionsMap.current.get(markerAsNumber)
	// 				if (!markerPositionsArray) {
	// 					markerPositionsArray = []
	// 					markersPositionsMap.current.set(markerAsNumber, markerPositionsArray)
	// 				}

	// 				markerPositionsArray.push(position)
	// 			}
	// 		}
	// 	}
	// }, [markableRequirements])

	// const generateAnchors = useCallback((): void => {
	// 	if (directSearch) {
	// 		generateAnchorsPositionsFromProperties()
	// 	} else {
	// 		generateAnchorPositionsFromValues()
	// 	}
	// 	const newAnchors: Anchor[] = []
	// 	for (const [markerKey, markerPositions] of markersPositionsMap.current.entries()) {
	// 		const boundingBox = new Box3()
	// 		for (const position of markerPositions) {
	// 			boundingBox.expandByPoint(position)
	// 		}
	// 		const center = new Vector3()
	// 		boundingBox.getCenter(center)
	// 		const newAnchor: Anchor = {
	// 			id: markerKey,
	// 			position3d: center,
	// 			screenPosition: transformViewportPositionToScreenPosition(center),
	// 			visible: visibleMarkers?.map(vm => vm.id).includes(markerKey) ?? false,
	// 			children: visibleMarkers?.find(vm => vm.id === markerKey)?.content,
	// 		}

	// 		newAnchors.push(newAnchor)
	// 	}
	// 	setAnchors(newAnchors)
	// }, [directSearch, generateAnchorPositionsFromValues, generateAnchorsPositionsFromProperties, visibleMarkers])

	const renderScene = (): void => {
		if (!containerRef.current || !rendererRef.current || !cameraRef.current || !controlsRef.current) {
			return
		}

		const width = containerRef.current.clientWidth
		const height = containerRef.current.clientHeight
		cameraRef.current.aspect = width / height
		cameraRef.current.updateProjectionMatrix()
		rendererRef.current.setSize(width, height)
		controlsRef.current.update()
		rendererRef.current.render(sceneRef.current, cameraRef.current)
	}

	const resetScene = (): void => {
		disposeObjects(sceneRef.current)
		sceneRef.current.children.length = 0

		const ambientLight = new AmbientLight(0xffffff, 0.5)
		sceneRef.current.add(ambientLight)

		const directionalLight = new DirectionalLight(0xffffff, 1.5)
		directionalLight.position.set(5, 10, 3)
		sceneRef.current.add(directionalLight)

		const grid = new Grid()
		grid.position.y = -0.3
		grid.layers.set(LAYER_HELPERS)
		sceneRef.current.add(grid)
	}

	const updateBoundingSphere = useCallback((): void => {
		const meshes: IfcMesh[] = selectedIfcItemRef.current?.children ?? modelRef.current.getAllMeshes()

		boundingSphereRef.current = createBoundingSphere(meshes)

		if (!showBoundingSphere) return

		if (boundingSphereMeshRef.current) {
			sceneRef.current.remove(boundingSphereMeshRef.current)
		}
		const sphereMesh = createSphereMesh(boundingSphereRef.current)
		sphereMesh.layers.set(LAYER_HELPERS)
		boundingSphereMeshRef.current = sphereMesh
		sceneRef.current.add(boundingSphereMeshRef.current)
	}, [showBoundingSphere])

	const displayItemAsSelected = useCallback(
		(ifcItem: IfcItem): void => {
			ifcItem.visible = true
			for (const ifcMesh of ifcItem.children) {
				let selectedMaterial = modelRef.current.getSelectMaterial(ifcMesh.userData.materialId)
				if (!selectedMaterial) {
					selectedMaterial = new MeshLambertMaterial()
					modelRef.current.setSelectMaterial(ifcMesh.userData.materialId, selectedMaterial)
				}
				selectedMaterial.transparent = false
				selectedMaterial.emissive.setHex(selectedColor)
				selectedMaterial.color.setHex(selectedColor)
				selectedMaterial.depthTest = false
				ifcMesh.material = selectedMaterial
				ifcMesh.renderOrder = 1
			}
		},
		[selectedColor],
	)

	const displayItemAsHovered = useCallback(
		(ifcItem: IfcItem): void => {
			ifcItem.visible = true

			for (const ifcMesh of ifcItem.children) {
				let hoveredMaterial = modelRef.current.getHoverMaterial(ifcMesh.userData.materialId)
				if (!hoveredMaterial) {
					hoveredMaterial = new MeshLambertMaterial()
					modelRef.current.setHoverMaterial(ifcMesh.userData.materialId, hoveredMaterial)
				}
				hoveredMaterial.opacity = 1
				hoveredMaterial.transparent = false
				hoveredMaterial.emissive.setHex(hoverColor)
				hoveredMaterial.color.setHex(hoverColor)
				hoveredMaterial.depthTest = false
				ifcMesh.material = hoveredMaterial
				ifcMesh.renderOrder = 1
			}
		},
		[hoverColor],
	)

	const displayItemAsTransparent = (ifcItem: IfcItem): void => {
		ifcItem.visible = true

		for (const ifcMesh of ifcItem.children) {
			const originalMaterial = modelRef.current.getItemMaterial(ifcMesh.userData.materialId)
			const transparentMaterial = new MeshLambertMaterial()
			if (originalMaterial) {
				transparentMaterial.copy(originalMaterial)
			} else {
				transparentMaterial.copy(ifcMesh.material)
			}
			transparentMaterial.transparent = true
			transparentMaterial.opacity = 0.3
			transparentMaterial.depthTest = false
			transparentMaterial.depthWrite = false
			ifcMesh.material = transparentMaterial
			ifcMesh.renderOrder = 0
		}
	}

	const displayItemAsOriginal = (ifcItem: IfcItem): void => {
		ifcItem.visible = true
		for (const ifcMesh of ifcItem.children) {
			const originalMaterial = modelRef.current.getItemMaterial(ifcMesh.userData.materialId)
			if (originalMaterial) {
				ifcMesh.material = originalMaterial
			}
			ifcMesh.renderOrder = 0
		}
	}

	const displayItemAsHidden = (ifcItem: IfcItem): void => {
		ifcItem.visible = false
	}

	const updateMeshDisplay = useCallback(
		(ifcItem: IfcItem) => {
			if (ifcItem === selectedIfcItemRef.current) {
				displayItemAsSelected(ifcItem)
			} else if (ifcItem === hoveredIfcItemRef.current) {
				displayItemAsHovered(ifcItem)
			} else {
				switch (viewModeRef.current) {
					case 'VIEW_MODE_ALL': {
						displayItemAsOriginal(ifcItem)
						break
					}
					case 'VIEW_MODE_TRANSPARENT': {
						if (ifcItem.userData.alwaysVisible) {
							displayItemAsOriginal(ifcItem)
						} else {
							displayItemAsTransparent(ifcItem)
						}
						break
					}
					case 'VIEW_MODE_SELECTABLE': {
						if (ifcItem.userData.alwaysVisible) {
							displayItemAsOriginal(ifcItem)
						} else {
							displayItemAsHidden(ifcItem)
						}
						break
					}
				}
			}
		},
		[displayItemAsHovered, displayItemAsSelected],
	)

	const updateAllMeshesDisplay = useCallback(() => {
		for (const ifcItem of modelRef.current.children) {
			updateMeshDisplay(ifcItem)
		}
	}, [updateMeshDisplay])

	const switchSelectedMesh = useCallback(() => {
		if (previousSelectedIfcItemRef.current) {
			updateMeshDisplay(previousSelectedIfcItemRef.current)
		}
		if (selectedIfcItemRef.current) {
			updateMeshDisplay(selectedIfcItemRef.current)
		}
	}, [updateMeshDisplay])

	const switchHoveredMesh = useCallback(() => {
		if (previousHoveredIfcItemRef.current) {
			updateMeshDisplay(previousHoveredIfcItemRef.current)
		}
		if (hoveredIfcItemRef.current) {
			updateMeshDisplay(hoveredIfcItemRef.current)
		}
	}, [updateMeshDisplay])

	const select = useCallback(
		(ifcItem?: IfcItem): void => {
			previousSelectedIfcItemRef.current = selectedIfcItemRef.current
			selectedIfcItemRef.current = ifcItem
			updateBoundingSphere()
			switchSelectedMesh()
			renderScene()

			console.log(
				'IfcViewer | selectedIfcItemRef.current:',
				selectedIfcItemRef.current?.userData.name,
				selectedIfcItemRef.current?.userData.type,
				selectedIfcItemRef.current?.userData.properties,
			)

			if (onMeshSelect) {
				onMeshSelect(ifcItem)
			}
		},
		[onMeshSelect, updateBoundingSphere, switchSelectedMesh],
	)

	const hover = useCallback(
		(ifcItem?: IfcItem): void => {
			previousHoveredIfcItemRef.current = hoveredIfcItemRef.current
			hoveredIfcItemRef.current = ifcItem

			switchHoveredMesh()
			renderScene()

			if (hoveredIfcItemRef.current) {
				setCursorStyle({ cursor: 'pointer' })
				return
			}
			setCursorStyle({ cursor: 'default' })

			if (onMeshHover) {
				onMeshHover(ifcItem)
			}
		},
		[onMeshHover, switchHoveredMesh],
	)

	const updateMousePointer = (event: MouseEvent): void => {
		if (!canvasRef.current) throw new Error('Canvas not loaded')
		const rect = canvasRef.current.getBoundingClientRect()

		const mouseX = event.clientX - rect.left
		const mouseY = event.clientY - rect.top

		pointerRef.current.x = (mouseX / canvasRef.current.clientWidth) * 2 - 1
		pointerRef.current.y = -(mouseY / canvasRef.current.clientHeight) * 2 + 1
	}

	const updateIntersections = (): void => {
		if (!cameraRef.current) {
			throw new Error('Camera not found')
		}
		rayCasterRef.current.setFromCamera(pointerRef.current, cameraRef.current)
		const allIntersections = rayCasterRef.current.intersectObjects(sceneRef.current.children)

		const selectableIfcMeshes = allIntersections.filter(intersection => {
			if (intersection.object instanceof IfcMesh) {
				return intersection.object.parent.userData.selectable
			}
			return false
		}) as Intersection<IfcMesh>[]

		selectableIntersectionsRef.current = selectableIfcMeshes
	}

	// const transformViewportPositionToScreenPosition = (position: Vector3): { x: number; y: number } => {
	// 	if (!cameraRef.current || !rendererRef.current) throw new Error('Camera or renderer not loaded')
	// 	const vector = position.clone()
	// 	vector.project(cameraRef.current)

	// 	// Make sure vector has values
	// 	vector.setX(vector.x || 0)
	// 	vector.setY(vector.y || 0)
	// 	vector.setZ(vector.z || 0)

	// 	const widthHalf = rendererRef.current.domElement.clientWidth / 2
	// 	const heightHalf = rendererRef.current.domElement.clientHeight / 2

	// 	const x = vector.x * widthHalf + widthHalf
	// 	const y = -(vector.y * heightHalf) + heightHalf
	// 	return { x, y }
	// }

	const handleMouseLeave = useCallback((): void => {
		hover()
	}, [hover])

	const handleMouseDown = useCallback((event: MouseEvent<HTMLCanvasElement>): void => {
		mouseStatusRef.current = { clicked: true, x: event.clientX, y: event.clientY }
		renderingEnabledRef.current = true
	}, [])

	const handleMouseUp = useCallback(
		(event: MouseEvent<HTMLCanvasElement>): void => {
			renderingEnabledRef.current = false
			if (!mouseStatusRef.current.clicked) return
			const currentX = event.clientX
			const currentY = event.clientY

			if (
				Math.abs(currentX - mouseStatusRef.current.x) > 8 ||
				Math.abs(currentY - mouseStatusRef.current.y) > 8
			) {
				mouseStatusRef.current = { clicked: false, x: 0, y: 0 }
				return
			}

			if (!enableMeshSelection) return

			updateMousePointer(event)
			updateIntersections()

			// Check if there are intersections
			if (selectableIntersectionsRef.current.length === 0) {
				select()
				return
			}

			const firstIntersectedMesh = selectableIntersectionsRef.current.at(0)?.object
			const ifcItem = firstIntersectedMesh?.getIfcItem()

			if (selectableRequirements && selectableRequirements.length > 0 && !ifcItem?.isSelectable()) {
				select()
				return
			}

			select(ifcItem)
			renderScene()
		},
		[enableMeshSelection, select, selectableRequirements],
	)

	const handleMouseMove = useCallback(
		(event: MouseEvent<HTMLCanvasElement>): void => {
			renderingEnabledRef.current = true
			if (renderingTimeoutRef.current) {
				clearTimeout(renderingTimeoutRef.current)
			}
			renderingTimeoutRef.current = setTimeout(() => {
				renderingEnabledRef.current = false
			}, 1000)

			if (!enableMeshHover) return
			updateMousePointer(event)
			updateIntersections()
			const firstIntersectedMesh = selectableIntersectionsRef.current.at(0)?.object
			const ifcItem = firstIntersectedMesh?.getIfcItem()

			if (selectableRequirements && selectableRequirements.length > 0 && !ifcItem?.isSelectable()) {
				hover()
				return
			}

			hover(ifcItem)
		},
		[enableMeshHover, hover, selectableRequirements],
	)

	const fitViewOnBoundingSphere = useCallback((): void => {
		if (!boundingSphereRef.current) return
		if (!cameraRef.current) {
			throw new Error('Camera not found')
		}
		if (!controlsRef.current) {
			throw new Error('Controls not found')
		}
		fitBoundingSphere(boundingSphereRef.current, cameraRef.current, controlsRef.current)
		renderScene()
	}, [])

	const focusViewToBoundingSphere = (): void => {
		if (!boundingSphereRef.current) return
		if (!controlsRef.current) {
			throw new Error('Controls not found')
		}
		controlsRef.current.target.copy(boundingSphereRef.current.center)
		renderScene()
	}

	const selectByExpressId = useCallback(
		(expressId: number | undefined): void => {
			if (!expressId) {
				select()
				return undefined
			}
			const ifcItem = modelRef.current.getIfcItem(expressId)
			select(ifcItem)
		},
		[select],
	)

	const selectByProperty = useCallback(
		(property: Property | undefined): IfcItem | undefined => {
			if (!property) {
				select()
				return undefined
			}

			const foundItems = filterIfcItemsByPropertiesAndType(modelRef.current, [property])

			if (foundItems.length === 0) return undefined
			const foundItem = foundItems[0]

			select(foundItem)
			fitViewOnBoundingSphere()

			return foundItem
		},
		[fitViewOnBoundingSphere, select],
	)

	const unloadEverything = useCallback((): void => {
		disposeObjects(sceneRef.current)
		if (animationFrameIdRef.current) {
			cancelAnimationFrame(animationFrameIdRef.current)
		}
		rendererRef.current?.dispose()
	}, [])

	const loadFile = useCallback(async (): Promise<void> => {
		resetScene()
		await loadIfcFile(
			url,
			model => {
				modelRef.current = model
				sceneRef.current.add(modelRef.current)

				alignObject(modelRef.current, { x: 'center', y: 'bottom', z: 'center' })

				sceneRef.current.updateMatrix()
				sceneRef.current.updateMatrixWorld(true)

				updateBoundingSphere()

				if (!cameraRef.current) {
					throw new Error('Camera not found')
				}
				if (!controlsRef.current) {
					throw new Error('Controls not found')
				}

				if (boundingSphereRef.current) {
					fitBoundingSphere(boundingSphereRef.current, cameraRef.current, controlsRef.current)
				}

				renderScene()

				if (data) {
					restoreData(modelRef.current, data)
				} else {
					setIfcData(
						modelRef.current,
						linksRequirements,
						selectableRequirements,
						alwaysVisibleRequirements,
						anchorRequirements,
					)
				}

				// generateAnchors()

				console.log(modelRef.current)

				if (onLoad) {
					onLoad({
						model: modelRef.current,
						selectableItems: modelRef.current.children.filter(ifcItem => ifcItem.userData.selectable),
						selectByExpressId,
						selectByProperty,
					})
				}
			},
			event => {
				console.log(`${String(event.loaded)}/${String(event.total)}`)
				renderScene()
			},
			error => {
				console.error(error)
				renderScene()
			},
			data === undefined,
		)
			.then(() => {
				statusRef.current = 'MODEL_LOADED'
			})
			.catch((error: unknown) => {
				statusRef.current = 'NOT_INITIALIZED'
				console.error(error)
			})
	}, [
		alwaysVisibleRequirements,
		anchorRequirements,
		data,
		linksRequirements,
		onLoad,
		selectByExpressId,
		selectByProperty,
		selectableRequirements,
		updateBoundingSphere,
		url,
	])

	const handleChangeModelVisibilityMode = (): void => {
		setViewMode(mode => {
			switch (mode) {
				case 'VIEW_MODE_SELECTABLE': {
					return 'VIEW_MODE_ALL'
				}
				case 'VIEW_MODE_ALL': {
					return 'VIEW_MODE_TRANSPARENT'
				}
				case 'VIEW_MODE_TRANSPARENT': {
					return 'VIEW_MODE_SELECTABLE'
				}
			}
		})
	}

	useEffect(() => {
		viewModeRef.current = viewMode
		updateAllMeshesDisplay()
		renderScene()
	}, [updateAllMeshesDisplay, viewMode])

	// useEffect(() => {
	// 	setAnchors(anchorsList => {
	// 		const newAnchors: Anchor[] = []

	// 		for (const anchor of anchorsList) {
	// 			const newAnchor = {
	// 				...anchor,
	// 				visible: visibleMarkers?.map(vm => vm.id).includes(anchor.id) || false,
	// 				children: visibleMarkers?.find(vm => vm.id === anchor.id)?.content || anchor.children,
	// 			}
	// 			newAnchors.push(newAnchor)
	// 		}

	// 		return newAnchors
	// 	})
	// }, [visibleMarkers])

	// useEffect(() => {
	// 	if (statusRef.current === 'NOT_INITIALIZED') return
	// 	updateMeshesVisibility()
	// }, [updateMeshesVisibility])

	// useEffect(() => {
	// 	updateAnchors()
	// }, [updateAnchors, visibleMarkers])

	//init graphics

	const init = useCallback(() => {
		if (!canvasRef.current) {
			throw new Error('Canvas not found')
		}
		const canvas = canvasRef.current
		// Renderer
		rendererRef.current = new WebGLRenderer({
			canvas: canvasRef.current,
			antialias: true,
			alpha: true,
		})
		const renderer = rendererRef.current
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
		renderer.setSize(canvas.clientWidth, canvas.clientHeight)
		renderer.setClearColor(0x000000, 0)
		// Camera
		cameraRef.current = new PerspectiveCamera()
		const camera = cameraRef.current
		camera.fov = 45
		camera.aspect = canvasRef.current.clientWidth / canvas.clientHeight
		camera.near = 0.1
		camera.far = 5000
		camera.position.set(10, 20, 20)
		camera.updateProjectionMatrix()
		camera.layers.set(LAYER_MESHES)
		camera.layers.enable(LAYER_HELPERS)
		cameraRef.current = camera
		sceneRef.current.add(camera)
		// Controls
		controlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement)
		const controls = controlsRef.current
		controls.enableDamping = true
		controls.maxPolarAngle = Math.PI / 2
		// Raycaster
		rayCasterRef.current.layers.set(LAYER_MESHES)

		if (!containerRef.current) {
			throw new Error('Container not found')
		}

		resizeObserverRef.current = new ResizeObserver(() => {
			renderScene()
		})
		resizeObserverRef.current.observe(containerRef.current)

		resetScene()

		const animate = (): void => {
			if (renderingEnabledRef.current) {
				// updateAnchors()
				renderScene()
			}
			animationFrameIdRef.current = requestAnimationFrame(animate)
		}
		animate()

		statusRef.current = 'READY'
	}, [])

	// const addAxesHelper = () => {
	// 	const axesHelper = new AxesHelper(1000)
	// 	axesHelper.layers.set(LAYER_HELPERS)
	// 	sceneRef.current.add(axesHelper)
	// }

	useEffect(() => {
		init()
		void loadFile()

		return () => {
			unloadEverything()
			resizeObserverRef.current?.disconnect()
		}
	}, [init, loadFile, unloadEverything])

	return (
		<div className={clsx('ifc-viewer', className)} ref={containerRef} {...otherProps}>
			<canvas
				ref={canvasRef}
				onMouseDown={handleMouseDown}
				onMouseUp={handleMouseUp}
				onMouseMove={handleMouseMove}
				onMouseLeave={handleMouseLeave}
				style={cursorStyle}
			/>
			{/* {anchors.map(anchor =>
				anchor.visible ? (
					<AnchorTooltip
						key={anchor.id}
						position={transformViewportPositionToScreenPosition(anchor.position3d)}
						container={canvasRef.current}
					>
						{anchor.children}
					</AnchorTooltip>
				) : undefined,
			)} */}
			<div className="absolute right-4 top-4 z-10 flex flex-col gap-4">
				<div className="flex flex-wrap gap-4">
					<button title="Guarda verso" type="button" onClick={focusViewToBoundingSphere}>
						<EyeIcon className="size-6" />
					</button>
					<button title="Muovi verso" type="button" onClick={fitViewOnBoundingSphere}>
						<ArrowUpIcon className="size-6" />
					</button>

					<button
						title="Cambia modalità visualizzazione meshes"
						type="button"
						// disabled={isLoading}
						onClick={handleChangeModelVisibilityMode}
					>
						{(() => {
							switch (viewMode) {
								case 'VIEW_MODE_ALL': {
									return <HouseIcon className="size-6" />
								}
								case 'VIEW_MODE_TRANSPARENT': {
									return (
										<div className="relative">
											<HouseIcon className="absolute inset-0 size-6 opacity-30" />
											<BarChart2 className="inset-0 size-6" />
										</div>
									)
								}
								case 'VIEW_MODE_SELECTABLE': {
									return <BarChart2 className="size-6" />
								}
							}
						})()}
					</button>
				</div>
			</div>
			{/* {loadingProgress.step === 'DONE' ? null : (
				<div className={clsx('absolute inset-0 z-10 flex flex-col items-center justify-center')}>
					<ProgressBar
						max={loadingProgress.total}
						value={loadingProgress.loaded}
						size="large"
						showValue
						className="max-w-[80%]"
					>
						{messages[loadingProgress.step]}
					</ProgressBar>
				</div>
			)} */}
		</div>
	)
})

IfcViewer.displayName = 'IfcViewer'

export { IfcViewer, type IfcViewerProps, type On3DModelLoadedType }
