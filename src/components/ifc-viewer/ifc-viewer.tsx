'use client'

import { centerObject } from '@/utils/three/center-object'
import { Grid } from 'src/3d-components/grid'
import {
	checkIfMeshPropertiesMeetsRequirements,
	createBoundingSphere,
	createBoundingSphereMesh,
	disposeObjects,
	findObjectsByIfcPropAndType,
	findPropertyValueFromIfcMesh,
	fitBoundingSphere,
	generateUserData,
	getAllMeshesByExpressId,
	getMeshExpressId,
	getRelativeMeshes,
	getSelectableMeshes,
	isGroup,
	isIfcGroup,
	isIfcMesh,
	isLambertMesh,
	isMeshAlwaysVisible,
	isMeshSelectable,
} from '@/utils/three/ifc'
import { IFCLoader } from '@/utils/three/load-ifc/ifc-loader'
import type {
	IfcGroup,
	IfcMesh,
	IfcObject,
	IfcScene,
	LambertMesh,
	MarkableRequirements,
	NodeData,
	Property,
	Requirements,
	SelectableRequirements,
} from 'src/types/types'
import clsx from 'clsx'
import {
	ArrowUpIcon,
	BarChart2,
	EyeIcon,
	FullscreenIcon,
	HouseIcon,
	Minimize2Icon,
	RabbitIcon,
	TurtleIcon,
} from 'lucide-react'
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
	type HTMLAttributes,
	type MouseEvent,
	type ReactNode,
} from 'react'
import {
	AmbientLight,
	Box3,
	DirectionalLight,
	MeshLambertMaterial,
	PerspectiveCamera,
	Raycaster,
	Scene,
	Vector2,
	Vector3,
	WebGLRenderer,
	type Intersection,
	type Mesh,
	type Object3D,
	type ShaderMaterial,
	type Sphere,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/Addons.js'
import { Button } from '../button'

const LAYER_MESHES = 0
const LAYER_HELPERS = 29

type MouseStatus = { clicked: boolean; x: number; y: number }

type LoadingStep =
	| 'IDLE'
	| 'DOWNLOADING'
	| 'LOADING_MODEL'
	| 'LOADING_DATA'
	| 'GENERATING_DATA'
	| 'GENERATING_ANCHORS'
	| 'DONE'
	| 'ERROR_URL'
	| 'ERROR_DOWNLOAD'
	| 'ERROR_DATA'
	| 'ERROR'

type LoadingMessage = Record<LoadingStep, string>

type LoadingStatus = { step: LoadingStep; loaded?: number | undefined; total?: number | undefined }

type ScreenPosition = { x: number; y: number }

type Anchor = {
	id: number
	position3d: Vector3
	screenPosition: ScreenPosition
	visible: boolean
	children?: ReactNode
}

type VisibleMarker = {
	id: number
	content: ReactNode
}

type On3DModelLoadedType = (ifc: {
	model?: IfcGroup
	selectByProperty: (property: Property) => IfcMesh | undefined
	selectByExpressId: (expressId: number | undefined) => void
	selectableMeshes: IfcMesh[]
}) => void

type IfcViewerProps = HTMLAttributes<HTMLDivElement> & {
	modelUrl?: string

	onLoad?: (event: ProgressEvent) => void
	onLoaded?: On3DModelLoadedType

	visibleMarkers?: VisibleMarker[]

	directSearch?: boolean
	data?: NodeData[]

	selectablesRequirements?: SelectableRequirements[]
	alwaysVisibleRequirements?: Requirements[]
	markableRequirements?: MarkableRequirements[]

	highlightedSelectables?: SelectableRequirements[]
	showTooltip?: ReactNode
	onMeshSelect?: (object?: IfcMesh, expressId?: number) => void
	onMeshHover?: (object?: IfcMesh, expressId?: number) => void

	showBoundingSphere?: boolean
	enableMeshSelection?: boolean
	enableMeshHover?: boolean

	messages?: LoadingMessage
}

const LOW_QUALITY_KEY = 'low-3d-quality'

enum ModelVisibilityMode {
	ALL,
	TRANSPARENT,
	SELECTABLE,
}

const checkIfIsSelectable = (mesh?: Object3D): boolean => {
	if (!mesh) return false
	if (isIfcMesh(mesh) && mesh.userData.selectable) {
		return true
	}
	const parent = mesh.parent
	if (!parent) return false
	if (isIfcGroup(parent) && parent.userData.selectable) {
		return true
	}

	return false
}

const IfcViewer = forwardRef<HTMLDivElement, IfcViewerProps>((props, ref) => {
	const {
		modelUrl: url,
		onLoaded,
		onLoad,

		visibleMarkers,
		data,

		directSearch = false,

		selectablesRequirements,
		alwaysVisibleRequirements,
		markableRequirements,

		onMeshHover,
		onMeshSelect,

		enableMeshHover = false,
		enableMeshSelection = false,
		showBoundingSphere = false,

		// messages = {
		// 	DONE: 'Fatto',
		// 	DOWNLOADING: 'Scaricando il file...',
		// 	GENERATING_ANCHORS: 'Generazione ancore...',
		// 	GENERATING_DATA: 'Ricerca colonne e sensori...',
		// 	IDLE: 'In attesa',
		// 	LOADING_MODEL: 'Caricando il file...',
		// 	LOADING_DATA: 'Caricando colonne e sensori...',
		// 	ERROR: 'Erroreo',
		// 	ERROR_URL: 'URL non valido',
		// 	ERROR_DOWNLOAD: 'Errore durante il download',
		// 	ERROR_DATA: 'Errore caricamento dati',
		// },

		className,
		...otherProps
	} = props

	const animationFrameIdRef = useRef<number>()
	const ifcLoaderRef = useRef(new IFCLoader())
	const innerRef = useRef<HTMLDivElement>(null)
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const rendererRef = useRef<WebGLRenderer>()
	const cameraRef = useRef<PerspectiveCamera>()
	const controlsRef = useRef<OrbitControls>()
	const sceneRef = useRef<IfcScene>()
	const modelRef = useRef<IfcGroup>()
	const rayCasterRef = useRef<Raycaster>(new Raycaster())
	const pointerRef = useRef<Vector2>(new Vector2())
	const boundingSphereRef = useRef<Sphere>()
	const boundingSphereMeshRef = useRef<LambertMesh>()
	const selectedMeshesRef = useRef<Mesh[]>([])
	const hoveredMeshesRef = useRef<Mesh[]>([])
	const originalMaterialsRef = useRef<Map<Mesh, MeshLambertMaterial | ShaderMaterial>>(new Map())
	const selectableIntersectionsRef = useRef<Intersection<IfcMesh>[]>([])
	const statusRef = useRef<'NOT_INITIALIZED' | 'READY' | 'MODEL_LOADED'>('NOT_INITIALIZED')
	const mouseStatusRef = useRef<MouseStatus>({ clicked: false, x: 0, y: 0 })
	const [loadingProgress, setLoadingProgress] = useState<LoadingStatus>({
		step: 'IDLE',
		loaded: 0,
		total: 1000000,
	})
	const isLoading = loadingProgress.step !== 'DONE'
	const [lowQuality, setLowQuality] = useState(localStorage.getItem(LOW_QUALITY_KEY) === 'true' || false)
	const shouldRerenderRef = useRef(false)
	const shouldRerenderTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
	const [fullScreen, setFullScreen] = useState(false)
	const [modelVisibilityMode, setModelVisibilityMode] = useState<ModelVisibilityMode>(ModelVisibilityMode.ALL)
	const [anchors, setAnchors] = useState<Anchor[]>([])
	const markersPositionsMap = useRef(new Map<number, Vector3[]>())

	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	useImperativeHandle(ref, () => innerRef.current!, [])

	const updateAnchors = useCallback((): void => {
		setAnchors(anchorsList => {
			const newAnchors: Anchor[] = []

			for (const anchor of anchorsList) {
				const newAnchor = {
					...anchor,
					position2d: transformViewportPositionToScreenPosition(anchor.position3d),
				}
				newAnchors.push(newAnchor)
			}

			return newAnchors
		})
	}, [])

	const generateAnchorPositionsFromValues = useCallback((): void => {
		if (!markableRequirements) return
		if (!modelRef.current) return
		// Find meshes that meet the requirements
		const meshesToMark: IfcMesh[] = []
		const selectableMeshes = getSelectableMeshes(modelRef.current)
		for (const selectableMesh of selectableMeshes) {
			const relatives = selectableMesh.userData.relatives
			if (relatives)
				for (const relative of relatives) {
					for (const mesh of modelRef.current.children) {
						if (mesh.userData['expressId'] === relative.expressId) {
							mesh.userData = { ...mesh.userData, ...relative }
							meshesToMark.push(mesh as IfcMesh)
						}
					}
				}
		}

		for (const mesh of meshesToMark) {
			for (const markableRequirement of markableRequirements) {
				const position = new Vector3()
				const box3 = new Box3()
				box3.setFromObject(mesh)
				box3.getCenter(position)

				const markerId = mesh.userData.values?.[markableRequirement.propertyToUseAsMarkerId]

				if (!markerId) continue
				const markerAsNumber = Number(markerId)

				let markerPositionsArray = markersPositionsMap.current.get(markerAsNumber)
				if (!markerPositionsArray) {
					markerPositionsArray = []
					markersPositionsMap.current.set(markerAsNumber, markerPositionsArray)
				}

				markerPositionsArray.push(position)
			}
		}
	}, [markableRequirements])

	const generateAnchorsPositionsFromProperties = useCallback((): void => {
		if (!modelRef.current || !markableRequirements) return

		for (const mesh of modelRef.current.children as IfcMesh[]) {
			for (const markableRequirement of markableRequirements) {
				if (checkIfMeshPropertiesMeetsRequirements(mesh.userData, markableRequirement)) {
					const position = new Vector3()
					const box3 = new Box3()
					box3.setFromObject(mesh)
					box3.getCenter(position)

					const markerId = findPropertyValueFromIfcMesh(mesh, markableRequirement.propertyToUseAsMarkerId)

					if (!markerId) continue
					const markerAsNumber = Number(markerId)

					let markerPositionsArray = markersPositionsMap.current.get(markerAsNumber)
					if (!markerPositionsArray) {
						markerPositionsArray = []
						markersPositionsMap.current.set(markerAsNumber, markerPositionsArray)
					}

					markerPositionsArray.push(position)
				}
			}
		}
	}, [markableRequirements])

	const generateAnchors = useCallback((): void => {
		if (directSearch) {
			generateAnchorsPositionsFromProperties()
		} else {
			generateAnchorPositionsFromValues()
		}
		const newAnchors: Anchor[] = []
		for (const [markerKey, markerPositions] of markersPositionsMap.current.entries()) {
			const boundingBox = new Box3()
			for (const position of markerPositions) {
				boundingBox.expandByPoint(position)
			}
			const center = new Vector3()
			boundingBox.getCenter(center)
			const newAnchor: Anchor = {
				id: markerKey,
				position3d: center,
				screenPosition: transformViewportPositionToScreenPosition(center),
				visible: visibleMarkers?.map(vm => vm.id).includes(markerKey) ?? false,
				children: visibleMarkers?.find(vm => vm.id === markerKey)?.content,
			}

			newAnchors.push(newAnchor)
		}
		setAnchors(newAnchors)
	}, [directSearch, generateAnchorPositionsFromValues, generateAnchorsPositionsFromProperties, visibleMarkers])

	const renderScene = useCallback((): void => {
		if (rendererRef.current && controlsRef.current && sceneRef.current && cameraRef.current && innerRef.current) {
			const width = innerRef.current.clientWidth
			const height = innerRef.current.clientHeight
			cameraRef.current.aspect = width / height
			cameraRef.current.updateProjectionMatrix()
			rendererRef.current.setSize(width, height)
			controlsRef.current.update()
			rendererRef.current.render(sceneRef.current, cameraRef.current)
		}
	}, [])

	const resetScene = useCallback((): void => {
		disposeObjects(sceneRef.current)
		if (!sceneRef.current) return
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
		if (!modelRef.current) throw new Error('Model not loaded')
		let meshes = modelRef.current.children
		if (selectedMeshesRef.current.length > 0) {
			meshes = selectedMeshesRef.current
		}
		boundingSphereRef.current = createBoundingSphere(meshes)

		if (!showBoundingSphere) return

		if (!sceneRef.current) throw new Error('Scene not loaded')
		if (boundingSphereMeshRef.current) {
			sceneRef.current.remove(boundingSphereMeshRef.current)
		}
		const sphereMesh = createBoundingSphereMesh(boundingSphereRef.current)
		sphereMesh.layers.set(LAYER_HELPERS)
		boundingSphereMeshRef.current = sphereMesh
		sceneRef.current.add(boundingSphereMeshRef.current)
	}, [showBoundingSphere])

	const setMeshToSelected = useCallback((mesh: LambertMesh): void => {
		mesh.visible = true
		const originalMaterial = originalMaterialsRef.current.get(mesh)
		if (!originalMaterial) {
			originalMaterialsRef.current.set(mesh, mesh.material)
		}
		const selectedMaterial = new MeshLambertMaterial()
		selectedMaterial.copy(mesh.material)
		selectedMaterial.emissive.setHex(0x16a34a)
		selectedMaterial.depthTest = false
		mesh.material = selectedMaterial
	}, [])

	const setMeshToHovered = useCallback((mesh: LambertMesh): void => {
		mesh.visible = true
		const originalMaterial = originalMaterialsRef.current.get(mesh)
		if (!originalMaterial) {
			originalMaterialsRef.current.set(mesh, mesh.material)
		}
		const hoveredMaterial = new MeshLambertMaterial()
		hoveredMaterial.copy(mesh.material)
		hoveredMaterial.emissive.setHex(0x00498a)
		hoveredMaterial.depthTest = false
		mesh.material = hoveredMaterial
	}, [])

	const setMeshToHalfTransparent = useCallback((mesh: LambertMesh): void => {
		mesh.visible = true
		const originalMaterial = originalMaterialsRef.current.get(mesh)
		if (!originalMaterial) {
			originalMaterialsRef.current.set(mesh, mesh.material)
		}
		const transparentMaterial = new MeshLambertMaterial()
		transparentMaterial.copy(mesh.material)
		transparentMaterial.transparent = true
		transparentMaterial.opacity = 0.3
		mesh.material = transparentMaterial
	}, [])

	const restoreMeshMaterial = useCallback((mesh: LambertMesh): void => {
		mesh.visible = true
		const originalMaterial = originalMaterialsRef.current.get(mesh)
		if (originalMaterial) {
			mesh.material = originalMaterial
		}
	}, [])

	const setMeshToHidden = useCallback((mesh: LambertMesh): void => {
		mesh.visible = false
	}, [])

	const updateMeshVisibility = useCallback(
		(mesh: Mesh) => {
			if (isLambertMesh(mesh)) {
				if (selectedMeshesRef.current.includes(mesh)) {
					setMeshToSelected(mesh)
				} else if (hoveredMeshesRef.current.includes(mesh)) {
					setMeshToHovered(mesh)
				} else {
					switch (modelVisibilityMode) {
						case ModelVisibilityMode.ALL: {
							restoreMeshMaterial(mesh)
							break
						}
						case ModelVisibilityMode.TRANSPARENT: {
							if (isMeshAlwaysVisible(mesh) || isMeshSelectable(mesh)) {
								restoreMeshMaterial(mesh)
							} else {
								setMeshToHalfTransparent(mesh)
							}
							break
						}
						case ModelVisibilityMode.SELECTABLE: {
							if (isMeshAlwaysVisible(mesh) || isMeshSelectable(mesh)) {
								restoreMeshMaterial(mesh)
							} else {
								setMeshToHidden(mesh)
							}
							break
						}
					}
				}
			}
		},
		[
			modelVisibilityMode,
			restoreMeshMaterial,
			setMeshToHalfTransparent,
			setMeshToHidden,
			setMeshToHovered,
			setMeshToSelected,
		],
	)

	const updateMeshesVisibility = useCallback((): void => {
		if (!modelRef.current) throw new Error('Model not loaded')

		for (const object3d of modelRef.current.children) {
			if (isLambertMesh(object3d)) {
				updateMeshVisibility(object3d)
			} else if (isGroup(object3d)) {
				for (const mesh of object3d.children) {
					if (isLambertMesh(mesh)) {
						updateMeshVisibility(mesh)
					}
				}
			}
		}

		renderScene()
	}, [renderScene, updateMeshVisibility])

	const selectByExpressId = (expressId: number | undefined): void => {
		if (!expressId) {
			select()
			return
		}

		if (!modelRef.current) throw new Error('Model not loaded')

		const meshes = getAllMeshesByExpressId(modelRef.current, expressId)
		selectedMeshesRef.current = meshes
		updateMeshesVisibility()
		updateBoundingSphere()
	}

	const select = useCallback(
		(selectedMesh?: IfcMesh): void => {
			if (!modelRef.current) return

			if (!selectedMesh) {
				selectedMeshesRef.current.length = 0
				updateMeshesVisibility()
				updateBoundingSphere()
				if (fullScreen) return
				if (onMeshSelect) {
					onMeshSelect()
				}
				return
			}

			const relatives = getRelativeMeshes(selectedMesh)
			selectedMeshesRef.current = relatives

			updateMeshesVisibility()
			updateBoundingSphere()

			if (fullScreen) return
			const expressId = getMeshExpressId(selectedMesh)
			if (onMeshSelect) onMeshSelect(selectedMesh, expressId)
		},

		[fullScreen, onMeshSelect, updateBoundingSphere, updateMeshesVisibility],
	)

	const hover = (hoveredMesh?: IfcMesh): void => {
		if (!modelRef.current) return

		if (!hoveredMesh) {
			hoveredMeshesRef.current.length = 0
			updateMeshesVisibility()
			return
		}

		const relatives = getRelativeMeshes(hoveredMesh)
		hoveredMeshesRef.current = relatives

		updateMeshesVisibility()

		const expressId = getMeshExpressId(hoveredMesh)
		if (onMeshHover) onMeshHover(hoveredMesh, expressId)
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
		if (!cameraRef.current || !sceneRef.current) throw new Error('Camera or scene not loaded')
		rayCasterRef.current.setFromCamera(pointerRef.current, cameraRef.current)
		const allIntersections = rayCasterRef.current.intersectObjects(sceneRef.current.children)
		selectableIntersectionsRef.current = allIntersections.filter(intersection => {
			return checkIfIsSelectable(intersection.object)
		}) as Intersection<IfcMesh>[]
	}

	const transformViewportPositionToScreenPosition = (position: Vector3): { x: number; y: number } => {
		if (!cameraRef.current || !rendererRef.current) throw new Error('Camera or renderer not loaded')
		const vector = position.clone()
		vector.project(cameraRef.current)

		// Make sure vector has values
		vector.setX(vector.x || 0)
		vector.setY(vector.y || 0)
		vector.setZ(vector.z || 0)

		const widthHalf = rendererRef.current.domElement.clientWidth / 2
		const heightHalf = rendererRef.current.domElement.clientHeight / 2

		const x = vector.x * widthHalf + widthHalf
		const y = -(vector.y * heightHalf) + heightHalf
		return { x, y }
	}

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
		const isSelectable = checkIfIsSelectable(firstIntersectedObject)

		if (!isSelectable) {
			select()
			return
		}

		select(firstIntersectedObject)
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

		const isSelectable = checkIfIsSelectable(intersectedMesh)

		if (!isSelectable) {
			hover()
			return
		}

		hover(intersectedMesh)
	}

	const handleMoveAt = useCallback((): void => {
		if (!boundingSphereRef.current || !cameraRef.current || !controlsRef.current) return
		fitBoundingSphere(boundingSphereRef.current, cameraRef.current, controlsRef.current)
		renderScene()
	}, [renderScene])

	const handleLookAt = (): void => {
		if (!controlsRef.current || !boundingSphereRef.current) return
		controlsRef.current.target.copy(boundingSphereRef.current.center)
		renderScene()
	}

	const handleChangeQuality = (): void => {
		setLowQuality(!lowQuality)
		localStorage.setItem(LOW_QUALITY_KEY, lowQuality ? 'false' : 'true')
		rendererRef.current?.setPixelRatio(
			lowQuality ? Math.min(window.devicePixelRatio, 2) : Math.min(window.devicePixelRatio / 2, 1),
		)
		renderScene()
	}

	const selectByProperty = useCallback(
		(property: Property | undefined): IfcMesh | undefined => {
			if (!property) {
				select()
				return undefined
			}

			const foundItems = findObjectsByIfcPropAndType(sceneRef.current, [property]) as IfcMesh[]

			if (foundItems.length === 0) return undefined
			const foundItem = foundItems[0]

			select(foundItem)
			handleMoveAt()

			return foundItem
		},
		[handleMoveAt, select],
	)

	const downloadFile = useCallback(async (downloadUrl: string): Promise<string> => {
		setLoadingProgress({ step: 'DOWNLOADING' })
		const response = await fetch(downloadUrl)
		if (!response.ok) {
			setLoadingProgress({ step: 'ERROR_DOWNLOAD' })
			throw new Error('Failed to download the model')
		}
		const blob = await response.blob()
		const finalUrl = URL.createObjectURL(blob)
		return finalUrl
	}, [])

	const unloadEverything = useCallback((): void => {
		disposeObjects(sceneRef.current)
		if (animationFrameIdRef.current) {
			cancelAnimationFrame(animationFrameIdRef.current)
		}
		if (rendererRef.current) {
			rendererRef.current.dispose()
		}

		rendererRef.current = undefined
		cameraRef.current = undefined
		controlsRef.current = undefined
		sceneRef.current = undefined
		modelRef.current = undefined
	}, [])

	const loadData = (object: IfcObject | undefined): void => {
		if (!object) return
		if (!data) {
			setLoadingProgress({ step: 'ERROR_DATA' })
			throw new Error('Data not loaded')
		}

		const expressId = object.userData.expressId

		const nodeData = data.find(node => node.expressId === expressId)

		if (nodeData) {
			object.userData = { ...object.userData, ...nodeData }
		}

		for (const child of object.children) {
			loadData(child as IfcObject)
		}
	}

	const loadFile = useCallback(async (): Promise<void> => {
		if (!url) {
			setLoadingProgress({ step: 'ERROR_URL' })
			return
		}
		resetScene()
		const modelUrl = await downloadFile(url)
		ifcLoaderRef.current.load(
			modelUrl,
			ifc => {
				if (!sceneRef.current) throw new Error('Scene not loaded')
				modelRef.current = ifc.group
				sceneRef.current.add(modelRef.current)

				centerObject(modelRef.current)

				sceneRef.current.updateMatrix()
				sceneRef.current.updateMatrixWorld(true)

				updateBoundingSphere()
				if (boundingSphereRef.current && cameraRef.current && controlsRef.current) {
					fitBoundingSphere(boundingSphereRef.current, cameraRef.current, controlsRef.current)
				}
				renderScene()
			},
			event => {
				setLoadingProgress({ step: 'LOADING_MODEL', loaded: event.loaded, total: event.total })
				if (event.loaded === event.total) {
					if (directSearch) {
						setLoadingProgress({ step: 'GENERATING_DATA' })
						generateUserData(
							modelRef.current,
							sceneRef.current,
							selectablesRequirements,
							alwaysVisibleRequirements,
						)
					} else {
						setLoadingProgress({ step: 'LOADING_DATA' })
						loadData(modelRef.current)
					}
					setLoadingProgress({ step: 'GENERATING_ANCHORS' })
					generateAnchors()
					const selectableMeshes = getSelectableMeshes(modelRef.current)
					if (onLoaded)
						onLoaded({
							model: modelRef.current,
							selectByProperty,
							selectableMeshes,
							selectByExpressId,
						})
				}
				setLoadingProgress({ step: 'DONE' })
				if (onLoad) onLoad(event)
			},
			error => {
				const e = error as Error
				console.error(e)
				setLoadingProgress({ step: 'ERROR' })
				renderScene()
			},
		)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [url])

	const handleChangeModelVisibilityMode = (): void => {
		switch (modelVisibilityMode) {
			case ModelVisibilityMode.SELECTABLE: {
				setModelVisibilityMode(ModelVisibilityMode.ALL)
				break
			}
			case ModelVisibilityMode.ALL: {
				setModelVisibilityMode(ModelVisibilityMode.TRANSPARENT)
				break
			}
			case ModelVisibilityMode.TRANSPARENT: {
				setModelVisibilityMode(ModelVisibilityMode.SELECTABLE)
				break
			}
		}
	}

	useEffect(() => {
		setAnchors(anchorsList => {
			const newAnchors: Anchor[] = []

			for (const anchor of anchorsList) {
				const newAnchor = {
					...anchor,
					visible: visibleMarkers?.map(vm => vm.id).includes(anchor.id) || false,
					children: visibleMarkers?.find(vm => vm.id === anchor.id)?.content || anchor.children,
				}
				newAnchors.push(newAnchor)
			}

			return newAnchors
		})
	}, [visibleMarkers])

	useEffect(() => {
		if (statusRef.current === 'NOT_INITIALIZED') return
		updateMeshesVisibility()
	}, [updateMeshesVisibility])

	useEffect(() => {
		updateAnchors()
	}, [updateAnchors, visibleMarkers])

	//init
	useEffect(() => {
		if (!innerRef.current || !canvasRef.current) return
		const canvas = canvasRef.current

		// Renderer
		const renderer = new WebGLRenderer({
			canvas: canvasRef.current,
			antialias: true,
			alpha: true,
		})
		renderer.setPixelRatio(
			lowQuality ? Math.min(window.devicePixelRatio / 2, 1) : Math.min(window.devicePixelRatio, 2),
		)
		renderer.setSize(canvasRef.current.clientWidth, canvasRef.current.clientHeight)
		rendererRef.current = renderer
		renderer.setClearColor(0x000000, 0)

		// Scene
		// sceneRef.current.background = new Color('transparent')
		const scene = new Scene() as IfcScene
		sceneRef.current = scene

		// Camera
		const camera = new PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 1000)
		camera.position.set(10, 20, 20)
		camera.far = 5000
		camera.updateProjectionMatrix()
		scene.add(camera)
		camera.layers.set(LAYER_MESHES)
		camera.layers.enable(LAYER_HELPERS)
		cameraRef.current = camera

		// Controls
		const controls = new OrbitControls(camera, canvas)
		controls.enableDamping = true
		controls.maxPolarAngle = Math.PI / 2
		controlsRef.current = controls

		// IFC Loader
		const wasmPath = `${location.origin}/wasm/`
		ifcLoaderRef.current.ifcAPI.SetWasmPath(wasmPath, true)

		// Raycaster
		rayCasterRef.current.layers.set(LAYER_MESHES)

		resetScene()

		const animate = (): void => {
			// if (shouldRerenderRef.current) {
			updateAnchors()
			renderScene()
			// }
			animationFrameIdRef.current = requestAnimationFrame(animate)
		}
		animate()

		const resizeObserver = new ResizeObserver(() => {
			renderScene()
		})

		resizeObserver.observe(innerRef.current)

		statusRef.current = 'READY'

		return () => {
			unloadEverything()
			resizeObserver.disconnect()
		}

		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	useEffect(() => {
		if (statusRef.current === 'NOT_INITIALIZED') return
		setLoadingProgress({ step: 'IDLE', loaded: 0, total: 1000000 })
		loadFile()
			.then(() => {
				statusRef.current = 'MODEL_LOADED'
			})
			.catch((error: unknown) => {
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
			ref={innerRef}
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
					<button title="Guarda verso" type="button" onClick={handleLookAt} disabled={isLoading}>
						<EyeIcon className="size-6" />
					</button>
					<button title="Muovi verso" type="button" onClick={handleMoveAt} disabled={isLoading}>
						<ArrowUpIcon className="size-6" />
					</button>
					<button
						title="Cambia qualità visiva"
						type="button"
						onClick={handleChangeQuality}
						disabled={isLoading}
					>
						{lowQuality ? <TurtleIcon className="size-6" /> : <RabbitIcon className="size-6" />}
					</button>
					<button
						title={fullScreen ? 'Esci da modalità schermo intero' : 'Modalità a schermo intero'}
						type="button"
						disabled={isLoading}
						onClick={() => {
							setFullScreen(prev => !prev)
						}}
					>
						{fullScreen ? <Minimize2Icon className="size-6" /> : <FullscreenIcon className="size-6" />}
					</button>
					<Button
						title="Cambia modalità visualizzazione meshes"
						type="button"
						disabled={isLoading}
						onClick={handleChangeModelVisibilityMode}
					>
						{(() => {
							switch (modelVisibilityMode) {
								case ModelVisibilityMode.ALL: {
									return <HouseIcon className="size-6" />
								}
								case ModelVisibilityMode.TRANSPARENT: {
									return (
										<div className="relative">
											<HouseIcon className="absolute inset-0 size-6 opacity-30" />
											<BarChart2 className="inset-0 size-6" />
										</div>
									)
								}
								case ModelVisibilityMode.SELECTABLE: {
									return <BarChart2 className="size-6" />
								}
							}
						})()}
					</Button>
				</div>
			</div>
			{loadingProgress.step === 'DONE' ? null : (
				<div className={clsx('absolute inset-0 z-10 flex flex-col items-center justify-center')}>
					{/* <ProgressBar
						max={loadingProgress.total}
						value={loadingProgress.loaded}
						size="large"
						showValue
						className="max-w-[80%]"
					>
						{messages[loadingProgress.step]}
					</ProgressBar> */}
				</div>
			)}
		</div>
	)
})

IfcViewer.displayName = 'IfcViewer'

export { IfcViewer as Model3DViewer, type IfcViewerProps as Model3DViewerProps, type On3DModelLoadedType }
