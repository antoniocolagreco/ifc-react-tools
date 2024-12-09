import type { GeometryId, IfcMeshUserData, MaterialId } from '@/types/types'
import { Mesh, type BufferGeometry, type MeshLambertMaterial } from 'three'
import type IfcItem from './ifc-item'

class IfcMesh extends Mesh<BufferGeometry, MeshLambertMaterial> {
	override parent: IfcItem
	override userData: IfcMeshUserData

	constructor(
		geometry: BufferGeometry,
		material: MeshLambertMaterial,
		parent: IfcItem,
		geometryId: GeometryId,
		materialId: MaterialId,
	) {
		super(geometry, material)
		this.parent = parent
		this.userData = {
			geometryId: geometryId,
			materialId: materialId,
			hoverMaterialId: undefined,
			selectMaterialId: undefined,
		}
	}

	getLinkedMeshes = (): IfcMesh[] => {
		return this.parent.children
	}

	getIfcItem = (): IfcItem => {
		return this.parent
	}
}

export default IfcMesh
