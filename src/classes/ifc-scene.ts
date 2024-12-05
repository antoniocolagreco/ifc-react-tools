import type { NodeData } from 'src/types/types'
import { Scene } from 'three'

class IfcScene extends Scene {
	override userData: NodeData

	constructor(expressId: number) {
		super()
		this.userData = {
			expressId,
			type: 'IfcScene',
		}
	}
}

export default IfcScene
