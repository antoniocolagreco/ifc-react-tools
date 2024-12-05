import type { NodeData } from 'src/types/types'
import { Mesh, type BufferGeometry, type MeshLambertMaterial, type ShaderMaterial } from 'three'

class IfcMesh extends Mesh<BufferGeometry, MeshLambertMaterial | ShaderMaterial> {
	override userData: NodeData

	constructor(expressId: number) {
		super()
		this.userData = {
			expressId,
			type: 'IfcMesh',
		}
	}
}

export default IfcMesh
