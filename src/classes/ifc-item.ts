import type { IfcItemUserData } from 'src/types/types'
import { Group } from 'three'
import type IfcMesh from './ifc-mesh'

class IfcItem extends Group {
	override userData: IfcItemUserData
	override children: IfcMesh[] = []

	constructor(expressId: number) {
		super()
		this.userData = {
			expressId,
		}
	}

	isAlwaysVisible = (): boolean => {
		return this.userData.alwaysVisible ?? false
	}

	setAlwaysVisible = (value: boolean): void => {
		this.userData.alwaysVisible = value
	}

	isSelectable = (): boolean => {
		return this.userData.selectable ?? false
	}

	setSelectable = (value: boolean): void => {
		this.userData.selectable = value
	}
}

export default IfcItem
