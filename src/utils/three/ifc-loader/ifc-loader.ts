import IfcModel from '@/classes/ifc-model'
import { IfcProgressEvent } from '@/classes/ifc-progress-event'
import { fetchFile } from '@/utils/fetch-file'
import { setIfcItemTypeAndProperties } from '@/utils/ifc/properties-util'
import { IfcAPI, LogLevel } from 'web-ifc'
import { isRunningInBrowser } from '../..'
import { buildIfcItem } from '../meshes-utils/meshes-utils'

const getNumberOfMeshes = (ifcAPI: IfcAPI, modelID: number): number => {
	let count = 0
	ifcAPI.StreamAllMeshes(modelID, () => {
		count++
	})
	return count
}

type LoadIfcFunctionType = (
	url: string,
	onLoad: (model: IfcModel) => void,
	onProgress: (status: IfcProgressEvent) => void,
	onError: (error: Error) => void,
	loadProperties?: boolean,
) => Promise<void>

const loadIfcFile: LoadIfcFunctionType = async (url: string, onLoad, onProgress, onError, loadProperties = true) => {
	const ifcAPI = new IfcAPI()
	const ifcModel = new IfcModel()

	let modelID = -1

	onProgress(new IfcProgressEvent())

	try {
		const wasmPath = {
			path: isRunningInBrowser() ? `${location.origin}/wasm/` : 'public/wasm/',
			absolute: true,
		}

		ifcAPI.SetWasmPath(wasmPath.path, wasmPath.absolute)

		await ifcAPI.Init()
		ifcAPI.SetLogLevel(LogLevel.LOG_LEVEL_OFF)

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

		const total = getNumberOfMeshes(ifcAPI, modelID)
		let index = 0

		ifcAPI.StreamAllMeshes(modelID, flatMesh => {
			index++
			const ifcItem = buildIfcItem(ifcAPI, modelID, flatMesh, ifcModel)
			if (loadProperties) {
				setIfcItemTypeAndProperties(ifcAPI, modelID, ifcItem)
			}
			ifcModel.add(ifcItem)
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
		onLoad(ifcModel)
		if (modelID !== -1) {
			ifcAPI.CloseModel(modelID)
		}
	}
}

export { loadIfcFile }
