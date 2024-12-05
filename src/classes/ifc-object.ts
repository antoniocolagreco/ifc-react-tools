import type { NodeData } from 'src/types/types'
import { Object3D } from 'three'

class IfcObject extends Object3D {
	override userData: NodeData

	constructor(expressId: number) {
		super()
		this.userData = {
			expressId,
			type: 'IfcObject',
		}
	}
}

export default IfcObject
