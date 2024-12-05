import type { NodeData } from 'src/types/types'
import { Group } from 'three'

class IfcGroup extends Group {
	override userData: NodeData

	constructor(expressId: number) {
		super()
		this.userData = {
			expressId,
			type: 'IfcGroup',
		}
	}
}

export default IfcGroup
