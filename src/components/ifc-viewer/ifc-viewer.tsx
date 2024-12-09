'use client'

import { Grid } from '@/3d-components/grid'
import type IfcItem from '@/classes/ifc-item'
import IfcMesh from '@/classes/ifc-mesh'
import IfcModel from '@/classes/ifc-model'
import type { MouseState } from '@/types/mouse-status'
import type { IfcViewerVisibilityMode } from '@/types/visibility-mode'
import { filterIfcItemsByPropertiesAndType, setIfcData } from '@/utils/ifc/properties-util'
import { restoreData } from '@/utils/ifc/save-utils/save-util'
import { createBoundingSphere, createSphereMesh, fitBoundingSphere } from '@/utils/three/camera-utils'
import { centerObject } from '@/utils/three/center-object'
import { disposeObjects } from '@/utils/three/dispose-utils'
import { loadIfc } from '@/utils/three/load-ifc'
import clsx from 'clsx'
import { ArrowUpIcon, BarChart2, EyeIcon, FullscreenIcon, HouseIcon, Minimize2Icon } from 'lucide-react'
import {
	forwardRef,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
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

const LAYER_MESHES = 0
const LAYER_HELPERS = 29

type On3DModelLoadedType = (ifc: {
	model?: IfcModel
	selectableItems: IfcItem[]
	selectByProperty: (property: Property) => IfcItem | undefined
	selectByExpressId: (expressId: number | undefined) => void
}) => void

type IfcViewerProps = HTMLAttributes<HTMLDivElement> & {
	url: string
	data?: IfcData

	onLoad?: On3DModelLoadedType

	// visibleMarkers?: VisibleMarker[]

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
	const hoveredIfcItemRef = useRef<IfcItem>()
	// const originalMaterialsRef = useRef<Map<Mesh, MeshLambertMaterial | ShaderMaterial>>(new Map())

	const selectableIntersectionsRef = useRef<Intersection<IfcMesh>[]>([])
	const statusRef = useRef<'NOT_INITIALIZED' | 'READY' | 'MODEL_LOADED'>('NOT_INITIALIZED')
	const mouseStatusRef = useRef<MouseState>({ clicked: false, x: 0, y: 0 })

	const shouldRerenderRef = useRef(false)
	const shouldRerenderTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
	const [fullScreen, setFullScreen] = useState(false)
	const [modelVisibilityMode, setModelVisibilityMode] = useState<IfcViewerVisibilityMode>('all')

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

	const renderScene = useCallback((): void => {
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
	}, [])

	const resetScene = useCallback((): void => {
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
	}, [])

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

	const displayIfcItemAsSelected = useCallback((ifcItem: IfcItem): void => {
		ifcItem.visible = true

		for (const ifcMesh of ifcItem.children) {
			const selectedMaterial = new MeshLambertMaterial()
			selectedMaterial.copy(ifcMesh.material)
			selectedMaterial.emissive.setHex(0x16a34a)
			selectedMaterial.depthTest = false
			ifcMesh.material = selectedMaterial
		}
	}, [])

	const displayIfcItemAsHovered = useCallback((ifcItem: IfcItem): void => {
		ifcItem.visible = true

		for (const ifcMesh of ifcItem.children) {
			const hoveredMaterial = new MeshLambertMaterial()
			hoveredMaterial.copy(ifcMesh.material)
			hoveredMaterial.emissive.setHex(0x00498a)
			hoveredMaterial.depthTest = false
			ifcMesh.material = hoveredMaterial
		}
	}, [])

	const displayIfcItemAsTransparent = useCallback((ifcItem: IfcItem): void => {
		ifcItem.visible = true

		for (const ifcMesh of ifcItem.children) {
			const transparentMaterial = new MeshLambertMaterial()
			transparentMaterial.copy(ifcMesh.material)
			transparentMaterial.transparent = true
			transparentMaterial.opacity = 0.3
			ifcMesh.material = transparentMaterial
		}
	}, [])

	const displayIfcItemAsDefault = useCallback((ifcItem: IfcItem): void => {
		ifcItem.visible = true
		for (const ifcMesh of ifcItem.children) {
			const originalMaterial = modelRef.current.getItemMaterial(ifcMesh.userData.materialId)
			if (originalMaterial) {
				ifcMesh.material = originalMaterial
			}
		}
	}, [])

	const displayIfcItemAsHidden = useCallback((ifcItem: IfcItem): void => {
		ifcItem.visible = false
	}, [])

	const updateIfcItemVisibility = useCallback(
		(ifcItem: IfcItem) => {
			if (ifcItem === selectedIfcItemRef.current) {
				displayIfcItemAsSelected(ifcItem)
			} else if (ifcItem === hoveredIfcItemRef.current) {
				displayIfcItemAsHovered(ifcItem)
			} else {
				switch (modelVisibilityMode) {
					case 'all': {
						displayIfcItemAsDefault(ifcItem)
						break
					}
					case 'transparent': {
						if (ifcItem.userData.alwaysVisible || ifcItem.userData.selectable) {
							displayIfcItemAsDefault(ifcItem)
						} else {
							displayIfcItemAsTransparent(ifcItem)
						}
						break
					}
					case 'selectable': {
						if (ifcItem.userData.alwaysVisible || ifcItem.userData.selectable) {
							displayIfcItemAsDefault(ifcItem)
						} else {
							displayIfcItemAsHidden(ifcItem)
						}
						break
					}
				}
			}
		},
		[
			displayIfcItemAsDefault,
			displayIfcItemAsHidden,
			displayIfcItemAsHovered,
			displayIfcItemAsSelected,
			displayIfcItemAsTransparent,
			modelVisibilityMode,
		],
	)

	const updateAllIfcItemVisiblity = useCallback(() => {
		for (const ifcItem of modelRef.current.children) {
			updateIfcItemVisibility(ifcItem)
		}
	}, [updateIfcItemVisibility])

	const selectIfcItemByExpressId = (expressId: number | undefined): void => {
		if (!expressId) {
			select()
			return
		}
		const foundIfcItem = modelRef.current.children.find(ifcItem => ifcItem.userData.expressId === expressId)
		select(foundIfcItem)
		updateBoundingSphere()
	}

	const select = useCallback(
		(ifcItem?: IfcItem): void => {
			selectedIfcItemRef.current = ifcItem
			updateAllIfcItemVisiblity()
			updateBoundingSphere()
			// if (fullScreen) return

			if (onMeshSelect) {
				onMeshSelect(ifcItem)
			}
		},

		[onMeshSelect, updateAllIfcItemVisiblity, updateBoundingSphere],
	)

	const hover = (ifcItem?: IfcItem): void => {
		hoveredIfcItemRef.current = ifcItem
		updateAllIfcItemVisiblity()
		// if (fullScreen) return

		if (onMeshHover) {
			onMeshHover(ifcItem)
		}
	}

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
		selectableIntersectionsRef.current = allIntersections.filter(intersection => {
			if (intersection.object instanceof IfcMesh) {
				return intersection.object.parent.isSelectable
			}
			return false
		}) as Intersection<IfcMesh>[]
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

	const handleMouseLeave = (): void => {
		hover()
	}

	const handleMouseDown = (event: MouseEvent<HTMLCanvasElement>): void => {
		mouseStatusRef.current = { clicked: true, x: event.clientX, y: event.clientY }
		shouldRerenderRef.current = true
	}

	const handleMouseUp = (event: MouseEvent<HTMLCanvasElement>): void => {
		shouldRerenderRef.current = false
		if (!mouseStatusRef.current.clicked) return
		const currentX = event.clientX
		const currentY = event.clientY

		if (Math.abs(currentX - mouseStatusRef.current.x) > 8 || Math.abs(currentY - mouseStatusRef.current.y) > 8) {
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

		const firstIntersectedObject = selectableIntersectionsRef.current[0]?.object
		const ifcItem = firstIntersectedObject?.getIfcItem()

		if (!ifcItem?.isSelectable()) {
			select()
			return
		}

		select(ifcItem)
	}

	const handleMouseMove = (event: MouseEvent<HTMLCanvasElement>): void => {
		shouldRerenderRef.current = true
		if (shouldRerenderTimeoutRef.current) {
			clearTimeout(shouldRerenderTimeoutRef.current)
		}
		shouldRerenderTimeoutRef.current = setTimeout(() => {
			shouldRerenderRef.current = false
		}, 1000)

		if (!enableMeshHover) return
		updateMousePointer(event)
		updateIntersections()
		const intersectedMesh =
			selectableIntersectionsRef.current.length > 0 ? selectableIntersectionsRef.current[0]?.object : undefined

		const ifcItem = intersectedMesh?.getIfcItem()

		if (!ifcItem?.isSelectable()) {
			hover()
			return
		}

		hover(ifcItem)
	}

	const handleMoveAt = useCallback((): void => {
		if (!boundingSphereRef.current) return
		if (!cameraRef.current) {
			throw new Error('Camera not found')
		}
		if (!controlsRef.current) {
			throw new Error('Controls not found')
		}
		fitBoundingSphere(boundingSphereRef.current, cameraRef.current, controlsRef.current)
		renderScene()
		console.log('handle move render')
	}, [renderScene])

	const handleLookAt = (): void => {
		if (!boundingSphereRef.current) return
		if (!controlsRef.current) {
			throw new Error('Controls not found')
		}
		controlsRef.current.target.copy(boundingSphereRef.current.center)
		renderScene()
		console.log('look at render')
	}

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
			handleMoveAt()

			return foundItem
		},
		[handleMoveAt, select],
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
		await loadIfc(
			url,
			model => {
				modelRef.current = model
				sceneRef.current.add(modelRef.current)

				centerObject(modelRef.current)

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
				console.log('on load render')

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
						selectByExpressId: selectIfcItemByExpressId,
						selectByProperty: selectByProperty,
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
				console.log('error render')
			},
			Boolean(data),
		)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [url])

	const handleChangeModelVisibilityMode = (): void => {
		switch (modelVisibilityMode) {
			case 'selectable': {
				setModelVisibilityMode('all')
				break
			}
			case 'all': {
				setModelVisibilityMode('transparent')
				break
			}
			case 'transparent': {
				setModelVisibilityMode('selectable')
				break
			}
		}
	}

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
	useLayoutEffect(() => {
		if (!canvasRef.current) {
			throw new Error('Canvas not found')
		}
		console.log('graphic init')
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
	}, [])

	//init
	useEffect(() => {
		if (!containerRef.current) {
			throw new Error('Container not found')
		}

		resetScene()

		const animate = (): void => {
			console.log('animate render')
			// if (shouldRerenderRef.current) {
			// updateAnchors()
			renderScene()
			animationFrameIdRef.current = requestAnimationFrame(animate)
			// }
		}
		animate()

		const resizeObserver = new ResizeObserver(() => {
			console.log('resize observer render')
			renderScene()
		})

		resizeObserver.observe(containerRef.current)

		statusRef.current = 'READY'

		return () => {
			unloadEverything()
			resizeObserver.disconnect()
		}

		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	useEffect(() => {
		if (statusRef.current === 'NOT_INITIALIZED') return
		loadFile()
			.then(() => {
				console.log('MODEL_LOADED')
				statusRef.current = 'MODEL_LOADED'
			})
			.catch((error: unknown) => {
				console.log('NOT_INITIALIZED')
				statusRef.current = 'NOT_INITIALIZED'
				console.error(error)
			})
	}, [loadFile])

	return (
		<div
			className={clsx(
				fullScreen
					? 'fixed inset-0 z-40 bg-white dark:bg-neutral-900'
					: 'relative min-h-80 overflow-hidden rounded-lg',
				className,
			)}
			ref={containerRef}
			{...otherProps}
		>
			<canvas
				className="absolute inset-0 h-full w-full"
				ref={canvasRef}
				onMouseDown={handleMouseDown}
				onMouseUp={handleMouseUp}
				onMouseMove={handleMouseMove}
				onMouseLeave={handleMouseLeave}
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
					<button title="Guarda verso" type="button" onClick={handleLookAt}>
						<EyeIcon className="size-6" />
					</button>
					<button title="Muovi verso" type="button" onClick={handleMoveAt}>
						<ArrowUpIcon className="size-6" />
					</button>

					<button
						title={fullScreen ? 'Esci da modalità schermo intero' : 'Modalità a schermo intero'}
						type="button"
						// disabled={isLoading}
						onClick={() => {
							setFullScreen(prev => !prev)
						}}
					>
						{fullScreen ? <Minimize2Icon className="size-6" /> : <FullscreenIcon className="size-6" />}
					</button>
					<button
						title="Cambia modalità visualizzazione meshes"
						type="button"
						// disabled={isLoading}
						onClick={handleChangeModelVisibilityMode}
					>
						{(() => {
							switch (modelVisibilityMode) {
								case 'all': {
									return <HouseIcon className="size-6" />
								}
								case 'transparent': {
									return (
										<div className="relative">
											<HouseIcon className="absolute inset-0 size-6 opacity-30" />
											<BarChart2 className="inset-0 size-6" />
										</div>
									)
								}
								case 'selectable': {
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
