import { IfcProgressEvent } from '@/classes/ifc-progress-event'
import { type GeometryId, type IfcGroup, type MaterialId } from '@/types/types'
import { fetchFile } from '@/utils/fetch-file'
import { Group, type BufferGeometry, type MeshLambertMaterial } from 'three'
import { IfcAPI } from 'web-ifc'
import { isRunningInBrowser } from '../..'
import { buildMesh, setIfcUserData } from '../ifc'

const getNumberOfMeshes = (ifcAPI: IfcAPI, modelID: number): number => {
	let count = 0
	ifcAPI.StreamAllMeshes(modelID, () => {
		count++
	})
	return count
}

type LoadIfcFunctionType = (
	url: string,
	onLoad: (model: IfcGroup) => void,
	onProgress: (status: IfcProgressEvent) => void,
	onError: (error: Error) => void,
	wasm?: { path: string; absolute: boolean },
) => Promise<void>

const loadIfc: LoadIfcFunctionType = async (
	url: string,
	onLoad,
	onProgress,
	onError,
	wasm?: { path: string; absolute: boolean },
) => {
	const ifcAPI = new IfcAPI()
	const model = new Group() as IfcGroup

	let modelID = -1

	onProgress(new IfcProgressEvent())

	try {
		const wasmPath = wasm
			? { path: wasm.path, absolute: wasm.absolute }
			: { path: isRunningInBrowser() ? `${location.origin}/wasm/` : 'public/wasm/', absolute: true }

		ifcAPI.SetWasmPath(wasmPath.path, wasmPath.absolute)
		await ifcAPI.Init()

		let buffer: Uint8Array | undefined

		await fetchFile(
			url,
			data => {
				buffer = data
				onProgress(new IfcProgressEvent('done', 'fetching'))
			},
			progress => {
				const ifcProgressEvent = new IfcProgressEvent('progress', 'fetching', progress)
				onProgress(ifcProgressEvent)
			},
			error => {
				throw error
			},
		)

		if (buffer === undefined) {
			throw new Error('Failed to load file')
		}

		modelID = ifcAPI.OpenModel(buffer)

		const geometriesMap = new Map<GeometryId, BufferGeometry>()
		const materialsMap = new Map<MaterialId, MeshLambertMaterial | MeshLambertMaterial[]>()

		const total = getNumberOfMeshes(ifcAPI, modelID)
		let index = 0

		ifcAPI.StreamAllMeshes(modelID, flatMesh => {
			index++
			const object = buildMesh(ifcAPI, modelID, flatMesh, geometriesMap, materialsMap)
			model.add(object)
			setIfcUserData(ifcAPI, modelID, flatMesh.expressID, object)
			onProgress(
				new IfcProgressEvent('progress', 'loading', {
					loaded: index,
					total,
					lengthComputable: true,
				}),
			)
		})
	} catch (error) {
		onProgress(new IfcProgressEvent('error'))
		onError(error as Error)
		console.error('Error loading IFC file:', error instanceof Error ? error.message : error)
	} finally {
		onProgress(new IfcProgressEvent('done'))
		onLoad(model)
		if (modelID !== -1) {
			ifcAPI.CloseModel(modelID)
		}
	}
}

export { loadIfc }
